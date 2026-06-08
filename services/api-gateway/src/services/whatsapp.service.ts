/**
 * WhatsApp delivery service.
 *
 * Talks DIRECTLY to Meta's WhatsApp Cloud API — no third-party providers
 * (Twilio, 360dialog, MessageBird, etc.) are involved. All credentials live
 * in environment variables and never in source.
 *
 * Required env vars:
 *   - WHATSAPP_ACCESS_TOKEN       (system user token from Meta Business)
 *   - WHATSAPP_PHONE_NUMBER_ID    (the sender phone number id)
 *
 * Optional env vars:
 *   - WHATSAPP_GRAPH_VERSION      (default: v20.0)
 *   - WHATSAPP_USE_TEMPLATE       ("true" to force template mode, default: false)
 *   - WHATSAPP_SHIFT_ASSIGNMENTS_TEMPLATE_NAME (template name when in template mode)
 *   - WHATSAPP_TEMPLATE_LANGUAGE  (default: he)
 */

type ShiftAssignmentForMessage = {
  date: Date | string;
  shiftType: string;
  startTime?: string;
  endTime?: string;
  role?: string;
  notes?: string;
};

export type SendShiftAssignmentsInput = {
  to: string;
  employeeName: string;
  departmentName: string;
  startDate: string;
  endDate: string;
  shifts: ShiftAssignmentForMessage[];
};

export type SendWhatsAppResult = {
  messageId?: string;
  recipient: string;
};

const DEFAULT_GRAPH_VERSION = 'v20.0';

/**
 * Normalize a phone number to E.164 (e.g. "[PHONE REDACTED]").
 * Returns null if the input cannot be sensibly turned into a phone number.
 *
 * Israeli-friendly: a leading "0" becomes "+972".
 */
export function normalizeWhatsAppPhone(phone: string | undefined | null): string | null {
  if (!phone) return null;

  const trimmed = String(phone).trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (hasPlus) return `+${digits}`;
  if (digits.startsWith('972')) return `+${digits}`;
  if (digits.startsWith('0')) return `+972${digits.slice(1)}`;

  return `+${digits}`;
}

/**
 * Compose the Hebrew shift-schedule body sent to one employee.
 */
export function formatShiftAssignmentsMessage(
  input: Omit<SendShiftAssignmentsInput, 'to'>,
): string {
  const dateRange =
    input.startDate === input.endDate
      ? input.startDate
      : `${input.startDate} - ${input.endDate}`;

  if (input.shifts.length === 0) {
    return `שלום ${input.employeeName}, אין לך שיבוצים ל-${dateRange} במחלקת ${input.departmentName}.`;
  }

  const lines = input.shifts.map((shift) => {
    const date = formatDate(shift.date);
    const time =
      shift.startTime || shift.endTime
        ? ` ${shift.startTime || ''}-${shift.endTime || ''}`.trim()
        : '';
    const role = shift.role ? ` | ${shift.role}` : '';
    const notes = shift.notes ? ` | ${shift.notes}` : '';
    return `• ${date}${time} | ${shift.shiftType}${role}${notes}`;
  });

  return [
    `שלום ${input.employeeName},`,
    `השיבוצים שלך למחלקת ${input.departmentName} (${dateRange}):`,
    ...lines,
  ].join('\n');
}

/**
 * Send the shift-assignments WhatsApp message to a single employee.
 *
 * By default sends as a free-form text message (works inside the 24h customer
 * service window, or with a sandbox/test number). When
 * WHATSAPP_USE_TEMPLATE=true, sends via an approved template instead (required
 * for proactive messaging in production).
 */
export async function sendShiftAssignmentsWhatsApp(
  input: SendShiftAssignmentsInput,
): Promise<SendWhatsAppResult> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || DEFAULT_GRAPH_VERSION;

  if (!accessToken || !phoneNumberId) {
    throw new Error(
      'WhatsApp is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.',
    );
  }

  const normalizedRecipient = normalizeWhatsAppPhone(input.to);
  if (!normalizedRecipient) {
    throw new Error('Recipient has no valid WhatsApp phone number.');
  }

  const useTemplate = process.env.WHATSAPP_USE_TEMPLATE === 'true';
  const templateName =
    process.env.WHATSAPP_SHIFT_ASSIGNMENTS_TEMPLATE_NAME || 'shift_assignments_summary';
  const templateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'he';

  const messageText = formatShiftAssignmentsMessage(input);
  const toDigits = normalizedRecipient.replace(/^\+/, '');

  const body = useTemplate
    ? {
        messaging_product: 'whatsapp',
        to: toDigits,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLanguage },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: input.employeeName },
                { type: 'text', text: input.departmentName },
                { type: 'text', text: `${input.startDate} - ${input.endDate}` },
                // Template body params cannot contain newlines, so we join with " · ".
                { type: 'text', text: messageText.replace(/\n/g, ' · ') },
              ],
            },
          ],
        },
      }
    : {
        messaging_product: 'whatsapp',
        to: toDigits,
        type: 'text',
        text: {
          preview_url: false,
          body: messageText,
        },
      };

  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) {
    const providerMessage = payload?.error?.message || response.statusText;
    throw new Error(`Meta WhatsApp API failed: ${providerMessage}`);
  }

  return {
    messageId: payload?.messages?.[0]?.id,
    recipient: normalizedRecipient,
  };
}

function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat('he-IL', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}
