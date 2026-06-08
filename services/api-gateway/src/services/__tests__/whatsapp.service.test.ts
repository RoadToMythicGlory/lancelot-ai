import {
  normalizeWhatsAppPhone,
  formatShiftAssignmentsMessage,
  sendShiftAssignmentsWhatsApp,
} from '../whatsapp.service';

describe('normalizeWhatsAppPhone', () => {
  it('returns null for missing input', () => {
    expect(normalizeWhatsAppPhone(undefined)).toBeNull();
    expect(normalizeWhatsAppPhone(null)).toBeNull();
    expect(normalizeWhatsAppPhone('')).toBeNull();
    expect(normalizeWhatsAppPhone('   ')).toBeNull();
  });

  it('returns null when the input has no digits', () => {
    expect(normalizeWhatsAppPhone('abc')).toBeNull();
    expect(normalizeWhatsAppPhone('+')).toBeNull();
  });

  it('converts leading zero to Israeli E.164', () => {
    expect(normalizeWhatsAppPhone('[PHONE REDACTED]')).toBe('[PHONE REDACTED]');
    expect(normalizeWhatsAppPhone('0501234567')).toBe('[PHONE REDACTED]');
  });

  it('keeps the country code when 972 is already there', () => {
    expect(normalizeWhatsAppPhone('[PHONE REDACTED]')).toBe('[PHONE REDACTED]');
    expect(normalizeWhatsAppPhone('[PHONE REDACTED]')).toBe('[PHONE REDACTED]');
  });

  it('preserves arbitrary plus-prefixed numbers', () => {
    expect(normalizeWhatsAppPhone('[PHONE REDACTED]')).toBe('[PHONE REDACTED]');
  });
});

describe('formatShiftAssignmentsMessage', () => {
  it('handles no shifts with a friendly fallback', () => {
    const text = formatShiftAssignmentsMessage({
      employeeName: 'דנה',
      departmentName: 'MCR',
      startDate: '2026-06-07',
      endDate: '2026-06-13',
      shifts: [],
    });
    expect(text).toContain('דנה');
    expect(text).toContain('אין לך שיבוצים');
    expect(text).toContain('MCR');
  });

  it('includes one line per shift with date, type, role, and notes', () => {
    const text = formatShiftAssignmentsMessage({
      employeeName: 'יוסי',
      departmentName: 'בקרה',
      startDate: '2026-06-07',
      endDate: '2026-06-13',
      shifts: [
        {
          date: '2026-06-08',
          shiftType: 'בוקר',
          startTime: '06:00',
          endTime: '14:00',
          role: 'מפיק',
          notes: 'שידור חי',
        },
        {
          date: '2026-06-10',
          shiftType: 'ערב',
        },
      ],
    });

    const lines = text.split('\n');
    expect(lines[0]).toBe('שלום יוסי,');
    expect(lines[1]).toContain('בקרה');
    expect(text).toContain('06:00-14:00');
    expect(text).toContain('בוקר');
    expect(text).toContain('מפיק');
    expect(text).toContain('שידור חי');
    expect(text).toContain('ערב');
  });
});

describe('sendShiftAssignmentsWhatsApp', () => {
  const ORIGINAL_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
  const ORIGINAL_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const ORIGINAL_USE_TEMPLATE = process.env.WHATSAPP_USE_TEMPLATE;
  const ORIGINAL_FETCH = global.fetch;

  beforeEach(() => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
    delete process.env.WHATSAPP_USE_TEMPLATE;
  });

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = ORIGINAL_TOKEN;
    if (ORIGINAL_PHONE_ID === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = ORIGINAL_PHONE_ID;
    if (ORIGINAL_USE_TEMPLATE === undefined) delete process.env.WHATSAPP_USE_TEMPLATE;
    else process.env.WHATSAPP_USE_TEMPLATE = ORIGINAL_USE_TEMPLATE;
    global.fetch = ORIGINAL_FETCH;
  });

  it('throws when env vars are missing', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    await expect(
      sendShiftAssignmentsWhatsApp({
        to: '0501234567',
        employeeName: 'דנה',
        departmentName: 'MCR',
        startDate: '2026-06-07',
        endDate: '2026-06-13',
        shifts: [],
      }),
    ).rejects.toThrow('WhatsApp is not configured');
  });

  it('throws when the recipient phone is invalid', async () => {
    await expect(
      sendShiftAssignmentsWhatsApp({
        to: 'not-a-number',
        employeeName: 'דנה',
        departmentName: 'MCR',
        startDate: '2026-06-07',
        endDate: '2026-06-13',
        shifts: [],
      }),
    ).rejects.toThrow('valid WhatsApp phone number');
  });

  it('POSTs a text message to Meta Cloud API when not in template mode', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      json: async () => ({ messages: [{ id: 'wamid.123' }] }),
    });
    global.fetch = fetchMock as any;

    const result = await sendShiftAssignmentsWhatsApp({
      to: '0501234567',
      employeeName: 'דנה',
      departmentName: 'MCR',
      startDate: '2026-06-07',
      endDate: '2026-06-13',
      shifts: [
        { date: '2026-06-08', shiftType: 'בוקר', startTime: '06:00', endTime: '14:00' },
      ],
    });

    expect(result.messageId).toBe('wamid.123');
    expect(result.recipient).toBe('[PHONE REDACTED]');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/123/messages');
    expect((init as any).headers.Authorization).toBe('Bearer test-token');
    const body = JSON.parse((init as any).body);
    expect(body.messaging_product).toBe('whatsapp');
    expect(body.to).toBe('[PHONE REDACTED]');
    expect(body.type).toBe('text');
    expect(body.text.body).toContain('דנה');
  });

  it('sends a template request when WHATSAPP_USE_TEMPLATE=true', async () => {
    process.env.WHATSAPP_USE_TEMPLATE = 'true';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      json: async () => ({ messages: [{ id: 'wamid.456' }] }),
    });
    global.fetch = fetchMock as any;

    await sendShiftAssignmentsWhatsApp({
      to: '[PHONE REDACTED]',
      employeeName: 'דנה',
      departmentName: 'MCR',
      startDate: '2026-06-07',
      endDate: '2026-06-13',
      shifts: [{ date: '2026-06-08', shiftType: 'בוקר' }],
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as any).body);
    expect(body.type).toBe('template');
    expect(body.template.name).toBeTruthy();
    const bodyParams = body.template.components[0].parameters as Array<{ text: string }>;
    // Newlines must be flattened so Meta accepts the template body parameter.
    for (const param of bodyParams) {
      expect(param.text).not.toMatch(/\n/);
    }
  });

  it('propagates Meta error messages on non-2xx responses', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      statusText: 'Bad Request',
      json: async () => ({ error: { message: 'Invalid recipient' } }),
    });
    global.fetch = fetchMock as any;

    await expect(
      sendShiftAssignmentsWhatsApp({
        to: '0501234567',
        employeeName: 'דנה',
        departmentName: 'MCR',
        startDate: '2026-06-07',
        endDate: '2026-06-13',
        shifts: [],
      }),
    ).rejects.toThrow('Invalid recipient');
  });
});
