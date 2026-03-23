/**
 * WebSocket context — single persistent connection per user session.
 *
 * Dispatches server events to registered listeners.
 * Components register/unregister listeners via useWSListener().
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
} from "react";
import { getAccessToken, API_BASE } from "./api";

const WSContext = createContext(null);

const WS_BASE = API_BASE.replace(/^http/, "ws");

export function WSProvider({ user, children }) {
  const wsRef = useRef(null);
  const listenersRef = useRef({}); // { eventType: Set<fn> }
  const reconnectTimer = useRef(null);
  const mountedRef = useRef(true);

  const dispatch = useCallback((type, data) => {
    const set = listenersRef.current[type];
    if (set) set.forEach((fn) => fn(data));
    // also dispatch to wildcard listeners
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
      clearTimeout(reconnectTimer.current);
    };

    ws.onmessage = (e) => {
      try {
        const { type, data } = JSON.parse(e.data);
        dispatch(type, data);
      } catch {}
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [dispatch]);

  // Connect when user logs in, disconnect on logout
  useEffect(() => {
    mountedRef.current = true;
    if (user) {
      connect();
    }
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [user?.id, connect]);

  const send = useCallback((type, data) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, data }));
    }
  }, []);

  const subscribe = useCallback((type, fn) => {
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

export function useWS() {
  return useContext(WSContext);
}

/**
 * Subscribe to a specific WS event type for the lifetime of the component.
 * @param {string} type  event type, e.g. "new_message"
 * @param {function} fn  callback(data)
 * @param {array} deps   extra deps that should trigger re-subscription
 */
export function useWSListener(type, fn, deps = []) {
  const { subscribe } = useWS();
  useEffect(() => {
    if (!subscribe) return;
    return subscribe(type, fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, subscribe, ...deps]);
}
