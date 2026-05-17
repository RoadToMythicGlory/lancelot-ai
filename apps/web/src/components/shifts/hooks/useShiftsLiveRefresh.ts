import { useEffect } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';

/**
 * Lightweight live-refresh hook for the shifts module.
 *
 * Re-runs the supplied `refetch` callback whenever any of these happen:
 *   - the window regains focus
 *   - the browser becomes online again
 *   - the realtime socket fires a shifts-related event
 *   - a fixed `pollInterval` elapses (defaults to 30s)
 *
 * Used in place of Apollo subscriptions until the backend exposes a
 * `shiftEventChanged` / `vacationRequestChanged` channel.
 */
export function useShiftsLiveRefresh(
  refetch: (() => void) | (() => Promise<unknown>),
  options: { pollInterval?: number; enabled?: boolean; events?: string[] } = {},
) {
  const { socket } = useWebSocket();
  const { pollInterval = 30_000, enabled = true, events } = options;

  useEffect(() => {
    if (!enabled) return;
    const handler = () => {
      try {
        const r = refetch();
        if (r && typeof (r as Promise<unknown>).then === 'function') {
          (r as Promise<unknown>).catch(() => undefined);
        }
      } catch {
        // swallow — refetch failures are surfaced by the underlying useQuery
      }
    };

    const onFocus = () => handler();
    const onOnline = () => handler();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    const interval = window.setInterval(handler, pollInterval);

    const eventNames = events ?? [
      'shift:updated',
      'shift:created',
      'shift:deleted',
      'shift_swap_request:created',
      'shift_swap_request:updated',
      'vacation_request:created',
      'vacation_request:updated',
      'ai_schedule:applied',
    ];
    if (socket) {
      eventNames.forEach((name) => socket.on(name, handler));
    }

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.clearInterval(interval);
      if (socket) {
        eventNames.forEach((name) => socket.off(name, handler));
      }
    };
  }, [refetch, pollInterval, enabled, socket, events]);
}
