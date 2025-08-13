import { useEffect, useRef, useState, useCallback } from "react";

type WSStatus = "idle" | "connecting" | "open" | "closing" | "closed" | "error";

export interface UseLivenessWSOptions {
  /** Reconnect otomatis jika koneksi putus */
  autoReconnect?: boolean;
  /** Maksimum percobaan reconnect (default 5) */
  maxRetries?: number;
  /** Interval ping ms untuk jaga koneksi (0 = off; default 0) */
  pingIntervalMs?: number;
  /** Hentikan ping saat tab tidak aktif (default true) */
  pausePingWhenHidden?: boolean;
  /** Simpan hanya N log terbaru (default 200) */
  keepLastNLogs?: number;
  /** Callback setiap pesan diterima */
  onMessage?: (msg: any) => void;
  /** Callback event penting: open/close/error/retry */
  onEvent?: (evt: { type: string; data?: any }) => void;
  /** Custom logger; default ke console */
  logger?: Pick<Console, "log" | "warn" | "error">;
}

export function useLivenessWS(
  baseUrl: string,
  sessionId: string,
  token: string,
  opts: UseLivenessWSOptions = {}
) {
  const {
    autoReconnect = true,
    maxRetries = 5,
    pingIntervalMs = 0,
    pausePingWhenHidden = true,
    keepLastNLogs = 200,
    onMessage,
    onEvent,
    logger = console,
  } = opts;

  const [status, setStatus] = useState<WSStatus>("idle");
  const [connected, setConnected] = useState(false);
  const [lastMsg, setLastMsg] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [retryCount, setRetryCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const urlRef = useRef<string>("");

  const addLog = useCallback((line: string) => {
    setLogs((prev) => {
      const next = [...prev, `[${new Date().toISOString()}] ${line}`];
      if (next.length > keepLastNLogs) next.splice(0, next.length - keepLastNLogs);
      return next;
    });
  }, [keepLastNLogs]);

  const makeURL = useCallback(() => {
    const u = new URL("/v1/ws/liveness", baseUrl);
    u.searchParams.set("session_id", sessionId ?? "");
    u.searchParams.set("token", token ?? "");
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.toString();
  }, [baseUrl, sessionId, token]);

  const clearPing = () => {
    if (pingTimerRef.current) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  };

  const startPing = () => {
    clearPing();
    if (pingIntervalMs > 0) {
      // optional: jeda ping saat tab hidden
      pingTimerRef.current = window.setInterval(() => {
        if (pausePingWhenHidden && document.hidden) return;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          try {
            wsRef.current.send(JSON.stringify({ type: "ping", t: Date.now() }));
          } catch (e) {
            // ignore
          }
        }
      }, pingIntervalMs) as unknown as number;
    }
  };

  const close = useCallback((code?: number, reason?: string) => {
    setStatus("closing");
    addLog(`Closing WS${code ? ` (code ${code})` : ""}${reason ? `: ${reason}` : ""}`);
    clearPing();
    wsRef.current?.close(code, reason);
  }, [addLog]);

  const open = useCallback(() => {
    if (!sessionId || !token) {
      addLog("Missing sessionId or token; WS not started.");
      return;
    }
    const url = makeURL();
    urlRef.current = url;

    addLog(`Connecting to WS: ${url}`);
    setStatus("connecting");

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      logger.log("WS opened");
      addLog("WS opened");
      setConnected(true);
      setStatus("open");
      setRetryCount(0);
      startPing();
      onEvent?.({ type: "open" });
    };

    ws.onmessage = (ev) => {
      try {
        let payload: any = ev.data;
        if (typeof ev.data === "string") {
          try {
            payload = JSON.parse(ev.data);
          } catch {
            // keep as raw string
          }
        }
        setLastMsg(payload);
        setMessages((prev) => [...prev, payload]);
        logger.log("WS message:", payload);
        addLog(`WS message: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
        onMessage?.(payload);
      } catch (e) {
        logger.warn("Invalid WS message", ev.data);
        addLog("Invalid WS message received (see console).");
      }
    };

    ws.onerror = (err) => {
      logger.error("WS error:", err);
      addLog("WS error (see console)");
      setStatus("error");
      setConnected(false);
      onEvent?.({ type: "error", data: err });
    };

    ws.onclose = (e) => {
      logger.warn("WS closed:", e.code, e.reason);
      addLog(`WS closed: code=${e.code} reason="${e.reason}"`);
      setConnected(false);
      setStatus("closed");
      clearPing();

      if (autoReconnect && retryCount < maxRetries) {
        const nextRetry = retryCount + 1;
        setRetryCount(nextRetry);
        const delay = Math.min(30000, 1000 * Math.pow(2, nextRetry - 1)); // 1s,2s,4s,8s,16s,30s cap
        addLog(`Reconnecting in ${Math.round(delay / 1000)}s (attempt ${nextRetry}/${maxRetries})`);
        onEvent?.({ type: "retry", data: { attempt: nextRetry, delay } });
        window.setTimeout(() => {
          // only reconnect if inputs unchanged
          open();
        }, delay);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, token, makeURL, autoReconnect, maxRetries, retryCount, logger, addLog, onEvent, onMessage]);

  // (Re)connect on deps change
  useEffect(() => {
    open();
    return () => {
      close(1000, "component unmounted");
    };
  }, [open]); // baseUrl/sessionId/token sudah dirangkum di open()

  // Bersihkan ping saat unmount
  useEffect(() => () => clearPing(), []);

  const send = useCallback((data: string | ArrayBuffer | Blob) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    } else {
      logger.warn("WS not open, cannot send");
      addLog("WARN: send() called while WS not open");
    }
  }, [logger, addLog]);

  const sendJSON = useCallback((frame: any) => {
    try {
      send(JSON.stringify(frame));
    } catch (e) {
      logger.error("Failed to stringify frame", e);
      addLog("ERROR: Failed to stringify frame");
    }
  }, [send, logger, addLog]);

  const reopen = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      close(1000, "manual reopen");
      // beri jeda singkat agar socket benar-benar tutup
      setTimeout(() => open(), 50);
    } else {
      open();
    }
  }, [close, open]);

  return {
    // state
    status,
    connected,
    lastMsg,
    messages, // riwayat untuk ditampilkan di UI
    logs,     // string[] log siap render
    url: urlRef.current,
    retryCount,
    // actions
    send,
    sendJSON,
    close,
    reopen,
  };
}