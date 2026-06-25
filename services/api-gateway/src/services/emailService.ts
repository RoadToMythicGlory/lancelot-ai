import nodemailer from 'nodemailer';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('email-service');

// Email templates
const templates: Record<string, (data: any) => { subject: string; html: string }> = {
  welcome: (data) => ({
    subject: `ברוך הבא ל-${config.APP_NAME}`,
    html: `
      <div style="direction: rtl; font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1e40af;">ברוך הבא, ${data.firstName}!</h1>
        <p>החשבון שלך ב-${config.APP_NAME} נוצר בהצלחה.</p>
        <p>שם משתמש: <strong>${data.email}</strong></p>
        <a href="${data.loginUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 8px; margin-top: 16px;">
          התחבר למערכת
        </a>
        <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="color: #6b7280; font-size: 12px;">אימייל זה נשלח מ-${config.APP_NAME}</p>
      </div>
    `,
  }),

  organizationInvite: (data) => ({
    subject: `הוזמנת להצטרף ל-${data.organizationName} ב-${config.APP_NAME}`,
    html: `
      <div style="direction: rtl; font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1e40af;">הזמנה להצטרף</h1>
        <p>${data.inviterName} הזמין אותך להצטרף לארגון <strong>${data.organizationName}</strong>.</p>
        <p>תפקיד: <strong>${data.role}</strong></p>
        <a href="${data.acceptUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 8px; margin-top: 16px;">
          קבל הזמנה
        </a>
        <p style="color: #6b7280; font-size: 12px; margin-top: 16px;">ההזמנה תפוג בעוד 7 ימים.</p>
      </div>
    `,
  }),

  passwordReset: (data) => ({
    subject: `איפוס סיסמה - ${config.APP_NAME}`,
    html: `
      <div style="direction: rtl; font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1e40af;">איפוס סיסמה</h1>
        <p>קיבלנו בקשה לאיפוס הסיסמה שלך.</p>
        <a href="${data.resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 8px; margin-top: 16px;">
          אפס סיסמה
        </a>
        <p style="color: #6b7280; font-size: 12px; margin-top: 16px;">אם לא ביקשת לאפס את הסיסמה, התעלם מאימייל זה. הקישור יפוג בעוד שעה.</p>
      </div>
    `,
  }),

  shiftReminder: (data) => ({
    subject: `תזכורת משמרת - ${data.shiftDate}`,
    html: `
      <div style="direction: rtl; font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1e40af;">תזכורת משמרת</h1>
        <p>שלום ${data.firstName},</p>
        <p>תזכורת: יש לך משמרת ב-<strong>${data.shiftDate}</strong></p>
        <p>שעות: ${data.startTime} - ${data.endTime}</p>
        <p>מחלקה: ${data.department}</p>
        <a href="${data.viewUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 8px; margin-top: 16px;">
          צפה במשמרת
        </a>
      </div>
    `,
  }),

  broadcastAlert: (data) => ({
    subject: `${data.alertType}: ${data.eventTitle}`,
    html: `
      <div style="direction: rtl; font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: ${data.alertType === 'ביטול' ? '#dc2626' : '#1e40af'};">${data.alertType}</h1>
        <p><strong>${data.eventTitle}</strong></p>
        <p>${data.message}</p>
        ${data.startTime ? `<p>זמן: ${data.startTime}</p>` : ''}
        ${data.channel ? `<p>ערוץ: ${data.channel}</p>` : ''}
        <a href="${data.viewUrl}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 8px; margin-top: 16px;">
          צפה באירוע
        </a>
      </div>
    `,
  }),

  liveuActivation: (data) => ({
    subject: `בקשת הפעלת LiveU - ${data.eventTitle || data.eventName || 'אירוע'}`,
    html: `
      <div style="direction: rtl; font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1e40af;">בקשת הפעלת ערכות LiveU</h1>
        <p>נא להפעיל את ערכות ה-LiveU הבאות עבור השידור הבא:</p>
        <div style="background: #eff6ff; padding: 16px; border-radius: 8px; margin-top: 12px;">
          <p><strong>שידור:</strong> ${data.eventTitle || data.eventName || '-'}</p>
          ${data.eventDate ? `<p><strong>תאריך:</strong> ${data.eventDate}</p>` : ''}
          ${data.eventTime ? `<p><strong>שעה:</strong> ${data.eventTime}</p>` : ''}
          ${data.channel ? `<p><strong>ערוץ:</strong> ${data.channel}</p>` : ''}
        </div>
        <h3 style="margin-top: 20px;">תעודות זהות מבוקשות</h3>
        <ul>
          ${(data.internalIds || [])
            .map((id: string) => `<li><strong>${id}</strong></li>`)
            .join('')}
        </ul>
        ${data.extraNotes ? `<p style="margin-top: 16px;"><strong>הערות:</strong> ${data.extraNotes}</p>` : ''}
        <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="color: #6b7280; font-size: 12px;">נשלח אוטומטית ממערכת ${config.APP_NAME} ע"י ${data.requestedByName || 'משתמש'}.</p>
      </div>
    `,
  }),

  rightsExpiry: (data) => ({
    subject: `התראת תפוגת זכויות שידור - ${data.title}`,
    html: `
      <div style="direction: rtl; font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #f59e0b;">התראת תפוגת זכויות</h1>
        <p>זכויות השידור הבאות פגות בקרוב:</p>
        <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin-top: 12px;">
          <p><strong>${data.title}</strong></p>
          <p>בעל זכויות: ${data.rightsHolder}</p>
          <p>תפוגה: <strong>${data.expiryDate}</strong></p>
          <p>ימים שנותרו: <strong>${data.daysRemaining}</strong></p>
        </div>
        <a href="${data.viewUrl}" style="display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: white; text-decoration: none; border-radius: 8px; margin-top: 16px;">
          צפה בפרטים
        </a>
      </div>
    `,
  }),
};

// Transporter (lazy init)
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  if (!config.SMTP_HOST || !config.SMTP_USER) {
    logger.warn('Email service not configured (missing SMTP_HOST or SMTP_USER)');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    },
  });

  return transporter;
}

export async function sendEmail(
  to: string,
  templateName: string,
  data: any
): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) {
    logger.info(`Email skipped (no SMTP config): template=${templateName}, to=${to}`);
    return false;
  }

  const template = templates[templateName];
  if (!template) {
    logger.error(`Email template not found: ${templateName}`);
    return false;
  }

  const { subject, html } = template(data);

  try {
    await transport.sendMail({
      from: config.EMAIL_FROM,
      to,
      subject,
      html,
    });
    logger.info(`Email sent: template=${templateName}, to=${to}`);
    return true;
  } catch (error) {
    logger.error(`Failed to send email: template=${templateName}, to=${to}`, { error });
    return false;
  }
}

export async function sendBulkEmails(
  recipients: { email: string; data: any }[],
  templateName: string
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const success = await sendEmail(recipient.email, templateName, recipient.data);
    if (success) sent++;
    else failed++;
  }

  return { sent, failed };
}

export const emailService = {
  sendEmail,
  sendBulkEmails,
};
