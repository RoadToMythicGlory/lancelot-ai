import { createLogger } from '../utils/logger';
import { BroadcastRightManaged } from '../models/rights.models';
import { Notification } from '../models/notification.models';
import { Equipment } from '../models/equipment.models';
import { Warehouse } from '../models/warehouse.models';
import {
  computeWarehouseOccupancy,
  type StoragePlaceOccupancy,
  type WarehouseOccupancy,
} from './warehouseCapacity.service';

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

/**
 * Resource identifier used on warehouse-capacity notifications. Kept as
 * a constant so the de-dup query and the notification creation stay in
 * sync.
 */
const CAPACITY_RESOURCE = 'warehouse_capacity';

/**
 * Round the utilization down to the nearest 10% step (capped at 100).
 * We bake that bucket into the de-dup `resourceId` so the same
 * "near-full" condition only alerts once until either:
 *   - the location moves into the next bucket (e.g. 75% → 85%), or
 *   - capacity changes (the threshold is reconfigured, items moved out
 *     and the location drops below the threshold completely, etc).
 */
function capacityBucket(percent: number): number {
  if (percent >= 100) return 100;
  return Math.floor(percent / 10) * 10;
}

async function checkWarehouseCapacity() {
  logger.info('Running job: checkWarehouseCapacity');
  try {
    const warehouses = await Warehouse.find({ isActive: { $ne: false } }).exec();
    if (warehouses.length === 0) return;

    // Bulk-load the per-warehouse equipment once and bucket by
    // warehouseId so each computeWarehouseOccupancy call stays cheap.
    const warehouseIds = warehouses.map((w) => w._id);
    const items = await Equipment.find({ warehouseId: { $in: warehouseIds } })
      .select({
        warehouseId: 1,
        storagePlaceId: 1,
        dimensions: 1,
        quantityTotal: 1,
        quantityAssigned: 1,
      })
      .lean()
      .exec();

    const itemsByWarehouse = new Map<string, any[]>();
    for (const item of items) {
      const key = item.warehouseId?.toString();
      if (!key) continue;
      if (!itemsByWarehouse.has(key)) itemsByWarehouse.set(key, []);
      itemsByWarehouse.get(key)!.push(item);
    }

    type Alert = {
      kind: 'warehouse' | 'place';
      warehouseId: string;
      warehouseName: string;
      placeId?: string;
      placeName?: string;
      occupancy: WarehouseOccupancy | StoragePlaceOccupancy;
    };
    const alerts: Alert[] = [];

    for (const warehouse of warehouses) {
      const whItems = itemsByWarehouse.get(warehouse._id.toString()) || [];
      const { warehouse: whOccupancy, places } = computeWarehouseOccupancy(warehouse, whItems);
      if (whOccupancy.isNearFull) {
        alerts.push({
          kind: 'warehouse',
          warehouseId: warehouse._id.toString(),
          warehouseName: warehouse.name,
          occupancy: whOccupancy,
        });
      }
      for (const place of warehouse.storagePlaces || []) {
        const placeId = place._id.toString();
        const placeOcc = places.get(placeId);
        if (placeOcc?.isNearFull) {
          alerts.push({
            kind: 'place',
            warehouseId: warehouse._id.toString(),
            warehouseName: warehouse.name,
            placeId,
            placeName: place.name,
            occupancy: placeOcc,
          });
        }
      }
    }

    if (alerts.length === 0) {
      logger.info('No warehouse capacity alerts to send');
      return;
    }

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

    let createdCount = 0;
    for (const alert of alerts) {
      const utilizationPercent = alert.occupancy.utilizationPercent ?? 0;
      const bucket = capacityBucket(utilizationPercent);
      const resourceId =
        alert.kind === 'warehouse'
          ? `warehouse:${alert.warehouseId}:b${bucket}`
          : `place:${alert.warehouseId}:${alert.placeId}:b${bucket}`;

      // Skip if an open (not-dismissed) notification already exists for
      // this exact (location, bucket) pair — otherwise warehouse admins
      // would get the same alert every day.
      const existing = await Notification.findOne({
        resource: CAPACITY_RESOURCE,
        resourceId,
        isDismissed: { $ne: true },
      })
        .select('_id')
        .lean();
      if (existing) continue;

      const locationLabel =
        alert.kind === 'warehouse'
          ? `מחסן ${alert.warehouseName}`
          : `${alert.warehouseName} - ${alert.placeName}`;
      const priority =
        alert.occupancy.isOverCapacity || utilizationPercent >= 95 ? 'high' : 'normal';
      const titleHe = alert.occupancy.isOverCapacity
        ? `מקום אחסון מעבר לקיבולת: ${locationLabel}`
        : `מקום אחסון כמעט מלא: ${locationLabel}`;
      const messageHe = `${locationLabel} מאוכלס ב-${utilizationPercent.toFixed(0)}% (סף התראה ${alert.occupancy.alertThresholdPercent.toFixed(0)}%).`;

      for (const recipientId of recipientIds) {
        await Notification.create({
          recipientId,
          type: alert.occupancy.isOverCapacity ? 'error' : 'warning',
          title: titleHe,
          titleHe,
          message: messageHe,
          messageHe,
          resource: CAPACITY_RESOURCE,
          resourceId,
          actionUrl: '/warehouse',
          channels: ['in_app'],
          priority,
          metadata: {
            warehouseId: alert.warehouseId,
            placeId: alert.placeId,
            utilizationPercent,
            alertThresholdPercent: alert.occupancy.alertThresholdPercent,
            isOverCapacity: alert.occupancy.isOverCapacity,
          },
        });
        createdCount++;
      }
    }

    logger.info(
      `checkWarehouseCapacity: ${alerts.length} alerts, created ${createdCount} notifications`,
    );
  } catch (error) {
    logger.error('Error in checkWarehouseCapacity job', { error });
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
  registerJob('checkWarehouseCapacity', 6 * 60 * 60 * 1000, checkWarehouseCapacity); // Every 6 hours

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
