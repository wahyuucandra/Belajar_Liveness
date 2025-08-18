import { useCallback, useEffect, useRef, useState } from "react";

export function useCountdown(seconds = 10, onTimeout?: () => void) {
  const [left, setLeft] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const start = useCallback(() => {
    clear();
    setLeft(seconds);
    timerRef.current = setInterval(() => {
      setLeft((c) => {
        if (c <= 1) {
          clear();
          onTimeout?.();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, [clear, onTimeout, seconds]);

  useEffect(() => () => clear(), [clear]);

  return { left, start, clear };
}
