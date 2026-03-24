/**
 * WebSocket context — single persistent connection per user session.
 *
 * Server event types:
 *   new_message   { chatId, message }
 *   typing        { chatId, userEmail, wpm, active, ts }
 *   presence      { userEmail, isOnline, lastSeen }
 *   call_update   { chatId, call }
 *   call_candidate { chatId, side, candidate }
 *   chat_update   { chat }
 *   pong
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import { getAccessToken, API_BASE } from "./api";
import { User } from "./AuthContext";

type WSListener = (data: unknown) => void;

interface WSContextType {
  send: (type: string, data: unknown) => void;
  subscribe: (type: string, fn: WSListener) => () => void;
}

const WSContext = createContext<WSContextType | null>(null);

const WS_BASE = API_BASE.replace(/^http/, "ws");

export function WSProvider({ user, children }: { user: User; children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Record<string, Set<WSListener>>>({});
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const dispatch = useCallback((type: string, data: unknown) => {
    const set = listenersRef.current[type];
    if (set) set.forEach((fn) => fn(data));
    const all = listenersRef.current["*"];
    if (all) all.forEach((fn) => fn({ type, data }));
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    const token = getAccessToken();
    if (!token) return;

    const ws = new WebSocket(`${WS_BASE}/ws?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };

    ws.onmessage = (e) => {
      try {
        const { type, data } = JSON.parse(e.data as string) as { type: string; data: unknown };
        dispatch(type, data);
      } catch {}
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [dispatch]);

  useEffect(() => {
    mountedRef.current = true;
    if (user) connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [user?.id, connect]);

  const send = useCallback((type: string, data: unknown) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, data }));
    }
  }, []);

  const subscribe = useCallback((type: string, fn: WSListener): (() => void) => {
    if (!listenersRef.current[type]) {
      listenersRef.current[type] = new Set();
    }
    listenersRef.current[type].add(fn);
    return () => listenersRef.current[type]?.delete(fn);
  }, []);

  return (
    <WSContext.Provider value={{ send, subscribe }}>
      {children}
    </WSContext.Provider>
  );
}

export function useWS(): WSContextType {
  const ctx = useContext(WSContext);
  if (!ctx) throw new Error("useWS must be used within WSProvider");
  return ctx;
}

export function useWSListener(type: string, fn: WSListener, deps: unknown[] = []): void {
  const { subscribe } = useWS();
  useEffect(() => {
    return subscribe(type, fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, subscribe, ...deps]);
}
