import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Returns a debounced copy of `value`. The returned value updates only after
 * `value` has stayed unchanged for `delayMs` milliseconds. Useful for keeping
 * GraphQL queries that depend on rapidly-changing user input (search boxes,
 * date pickers, etc.) from firing on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}

/**
 * Returns a stable debounced wrapper around `fn`. Successive calls within
 * `delayMs` are coalesced; only the last call's arguments are used. Cancels
 * pending calls on unmount.
 */
export function useDebouncedCallback<TArgs extends any[]>(
  fn: (...args: TArgs) => void,
  delayMs = 250
): (...args: TArgs) => void {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useMemo(() => {
    return (...args: TArgs) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        fnRef.current(...args);
      }, delayMs);
    };
  }, [delayMs]);
}
