import crypto from 'crypto';

const TRACE_ID_MAX_LENGTH = 128;
const TRACE_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function isValidTraceId(value: string | undefined | null): value is string {
  if (!value) return false;
  if (value.length > TRACE_ID_MAX_LENGTH) return false;
  return TRACE_ID_PATTERN.test(value);
}

export function generateTraceId(prefix: string = 'gw'): string {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${crypto.randomBytes(16).toString('hex')}`;
}

export function getOrCreateTraceId(input?: { headers?: Record<string, unknown> }): string {
  const raw = input?.headers?.['x-trace-id'];
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (isValidTraceId(candidate as string)) {
    return candidate as string;
  }
  return generateTraceId();
}
