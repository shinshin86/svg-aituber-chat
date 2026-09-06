import { useEffect, useRef } from 'react';

/** Pass null to pause the interval. */
export function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;
    const id = window.setInterval(() => savedCallback.current(), delay);
    return () => window.clearInterval(id);
  }, [delay]);
}
