import { createLogger } from '../utils/logger';
import { BroadcastRightManaged } from '../models/rights.models';
import { Notification } from '../models/notification.models';
import { Equipment } from '../models/equipment.models';

const logger = createLogger('job-scheduler');

// Simple in-process job scheduler
// For production, replace with BullMQ or similar distributed job queue

interface ScheduledJob {
  name: string;
  intervalMs: number;
  handler: () => Promise<void>;
  lastRun?: Date;
  isRunning: boolean;
}

const jobs: ScheduledJob[] = [];
let intervalId: NodeJS.Timeout | null = null;

// ==================== JOB DEFINITIONS ====================

async function checkExpiringRights() {
  logger.info('Running job: checkExpiringRights');
  try {
    const now = new Date();
    const notificationDays = [90, 30, 7, 1];

    for (const days of notificationDays) {
      const targetDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

      const expiringRights = await BroadcastRightManaged.find({
        endDate: { $gte: startOfDay, $lte: endOfDay },
        status: { $nin: ['expired', 'terminated'] },
        expiryNotificationSent: { $ne: true },
      });

      for (const right of expiringRights) {
        // Create notification
        await Notification.create({
          organizationId: right.organizationId,
          recipientId: right.createdBy,
          type: 'warning',
          title: `זכויות שידור פגות בעוד ${days} ימים`,
          titleHe: `זכויות שידור פגות בעוד ${days} ימים`,
          message: `${right.title} - ${right.rightsHolder} - תפוגה: ${right.endDate.toLocaleDateString('he-IL')}`,
          resource: 'broadcast_right',
          resourceId: right._id.toString(),
          actionUrl: '/rights',
          channels: ['in_app', 'email'],
          priority: days <= 7 ? 'high' : 'normal',
        });

        // Update status to expiring_soon
        if (days <= 30) {
          await BroadcastRightManaged.updateOne(
            { _id: right._id },
            { $set: { status: 'expiring_soon' } }
          );
        }
      }

      if (expiringRights.length > 0) {
        logger.info(`Found ${expiringRights.length} rights expiring in ${days} days`);
      }
    }

    // Auto-expire past rights
    await BroadcastRightManaged.updateMany(
      { endDate: { $lt: now }, status: { $nin: ['expired', 'terminated'] } },
      { $set: { status: 'expired' } }
    );
  } catch (error) {
    logger.error('Error in checkExpiringRights job', { error });
  }
}

async function cleanupOldData() {
  logger.info('Running job: cleanupOldData');
  try {
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Cleanup dismissed notifications older than 3 months
    const deletedNotifs = await Notification.deleteMany({
      isDismissed: true,
      createdAt: { $lt: threeMonthsAgo },
    });

    if (deletedNotifs.deletedCount > 0) {
      logger.info(`Cleaned up ${deletedNotifs.deletedCount} old dismissed notifications`);
    }
  } catch (error) {
    logger.error('Error in cleanupOldData job', { error });
  }
}

async function checkStaleEquipment() {
  logger.info('Running job: checkStaleEquipment');
  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const staleItems = await Equipment.find({
      isDisabled: false,
      $or: [
        { lastUsedAt: { $lt: fourteenDaysAgo } },
        { lastUsedAt: { $exists: false } },
      ],
      $and: [
        {
          $or: [
            { unusedNotificationSentAt: { $exists: false } },
            { unusedNotificationSentAt: { $lt: fourteenDaysAgo } },
          ],
        },
      ],
    });

    if (staleItems.length === 0) return;

    // Find warehouse admin users (fall back to 'system')
    const { connectMongoDB } = await import('../config/mongodb');
    const db = await connectMongoDB();
    const warehouseAdmins = await db
      .collection('users')
      .find({
        isActive: true,
        $or: [
          { systemRole: 'admin' },
          { 'departments.departmentId': 'warehouse' },
        ],
      })
      .project({ _id: 1 })
      .toArray();

    const recipientIds =
      warehouseAdmins.length > 0
        ? warehouseAdmins.map((u: any) => u._id.toString())
        : ['system'];

    const itemNames = staleItems
      .slice(0, 10)
      .map((e) => e.name)
      .join(', ');
    const suffix = staleItems.length > 10 ? ` ועוד ${staleItems.length - 10}...` : '';

    for (const recipientId of recipientIds) {
      await Notification.create({
        recipientId,
        type: 'warning',
        title: `${staleItems.length} פריטי ציוד לא בשימוש מעל שבועיים`,
        titleHe: `${staleItems.length} פריטי ציוד לא בשימוש מעל שבועיים`,
        message: `The following equipment has not been used for over 14 days: ${itemNames}${suffix}`,
        messageHe: `הציוד הבא לא היה בשימוש מעל 14 יום: ${itemNames}${suffix}`,
        resource: 'equipment',
        actionUrl: '/warehouse',
        channels: ['in_app'],
        priority: 'normal',
      });
    }

    // Stamp notification sent so we don't re-alert until the next cycle
    const ids = staleItems.map((e) => e._id);
    await Equipment.updateMany(
      { _id: { $in: ids } },
      { $set: { unusedNotificationSentAt: new Date() } },
    );

    logger.info(`Sent stale-equipment notifications for ${staleItems.length} items`);
  } catch (error) {
    logger.error('Error in checkStaleEquipment job', { error });
  }
}

// ==================== SCHEDULER ====================

export function registerJob(name: string, intervalMs: number, handler: () => Promise<void>) {
  jobs.push({ name, intervalMs, handler, isRunning: false });
  logger.info(`Registered job: ${name} (interval: ${intervalMs / 1000}s)`);
}

export function startScheduler() {
  // Register default jobs (on-prem: no billing/subscription/trial jobs)
  registerJob('checkExpiringRights', 6 * 60 * 60 * 1000, checkExpiringRights);     // Every 6 hours
  registerJob('cleanupOldData', 24 * 60 * 60 * 1000, cleanupOldData);              // Daily
  registerJob('checkStaleEquipment', 24 * 60 * 60 * 1000, checkStaleEquipment);    // Daily

  // Check every minute if any job needs to run
  intervalId = setInterval(async () => {
    const now = Date.now();
    
    for (const job of jobs) {
      if (job.isRunning) continue;
      
      const lastRunTime = job.lastRun?.getTime() || 0;
      if (now - lastRunTime >= job.intervalMs) {
        job.isRunning = true;
        job.lastRun = new Date();
        
        try {
          await job.handler();
        } catch (error) {
          logger.error(`Job ${job.name} failed`, { error });
        } finally {
          job.isRunning = false;
        }
      }
    }
  }, 60 * 1000); // Check every minute

  logger.info(`Job scheduler started with ${jobs.length} jobs`);
}

export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Job scheduler stopped');
  }
}

export const jobScheduler = {
  registerJob,
  startScheduler,
  stopScheduler,
};
