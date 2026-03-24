import { useEffect, useState, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";

import { AuthProvider, useAuth } from "./utils/AuthContext";
import { WSProvider, useWSListener } from "./utils/WSContext";
import { apiGet, apiPost, apiPut } from "./utils/api";
import { ChatsContext, type Chat } from "./utils/ChatsContext";
import { startCallRingtone, stopCallRingtone } from "./utils/sounds";

import Login from "./pages/Login";
import Home from "./pages/Home";
import ChatPage from "./pages/ChatPage";
import Features from "./pages/Features";
import Loading from "./components/Loading";
import MatrixRain from "./components/MatrixRain";
import ScanlinesOverlay from "./components/ScanlinesOverlay";

import styles from "./App.module.css";

interface IncomingCall {
  chatId: string;
  caller: string;
}

interface CallUpdateData {
  chatId: string;
  call: {
    caller: string;
    callee: string;
    status: string;
  };
}

// ── Inner app — rendered only when user is authenticated ───────────────────

function AppInner() {
  const { user, signOut } = useAuth();
  const [appReady, setAppReady]         = useState(false);
  const [chats, setChats]               = useState<Chat[]>([]);
  const [matrixForced, setMatrixForced] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const toggleMatrix = useCallback(() => setMatrixForced((v) => !v), []);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "m" || e.key === "M") toggleMatrix();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [toggleMatrix]);

  useEffect(() => {
    if (!user) return;
    apiGet<Chat[]>("/api/chats")
      .then((data) => { setChats(data || []); setAppReady(true); })
      .catch(() => setAppReady(true));
  }, [user?.id]);

  useWSListener("chat_update", (raw) => {
    const { chat } = raw as { chat: Chat };
    setChats((prev) => {
      const idx = prev.findIndex((c) => c.id === chat.id);
      if (idx === -1) return [...prev, chat];
      const next = [...prev];
      next[idx] = chat;
      return next;
    });
  }, []);

  useWSListener("call_update", (raw) => {
    const { chatId, call } = raw as CallUpdateData;
    if (call.callee === user?.email && call.status === "calling") {
      setIncomingCall({ chatId, caller: call.caller });
      startCallRingtone();
    } else if (incomingCall?.chatId === chatId && call.status !== "calling") {
      setIncomingCall(null);
      stopCallRingtone();
    }
  }, [user?.email, incomingCall?.chatId]);

  useEffect(() => {
    if (!user) return;
    const setOnline  = () => apiPost("/api/users/presence", { isOnline: true  }).catch(() => {});
    const setOffline = () => apiPost("/api/users/presence", { isOnline: false }).catch(() => {});
    const onVisibility = () => document.hidden ? setOffline() : setOnline();

    setOnline();
    window.addEventListener("beforeunload", setOffline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      setOffline();
      window.removeEventListener("beforeunload", setOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
    if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const register = async () => {
      try {
        if (Notification.permission === "denied") return;
        const perm = Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
        if (perm !== "granted") return;

        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
        });
        await apiPost("/api/push/subscribe", sub.toJSON()).catch(() => {});
      } catch {}
    };
    register();
  }, [user?.id]);

  const handleAccept = useCallback(() => {
    if (!incomingCall) return;
    stopCallRingtone();
    navigate(`/chat/${incomingCall.chatId}?call=callee`);
    setIncomingCall(null);
  }, [incomingCall, navigate]);

  const handleDecline = useCallback(async () => {
    if (!incomingCall) return;
    stopCallRingtone();
    await apiPut(`/api/calls/${incomingCall.chatId}`, { status: "declined" }).catch(() => {});
    setIncomingCall(null);
  }, [incomingCall]);

  if (!appReady) return <Loading />;

  return (
    <ChatsContext.Provider value={{ chats, setChats, signOut, matrixForced, toggleMatrix }}>
      <ScanlinesOverlay />
      <MatrixRain forceVisible={matrixForced} onForceHide={() => setMatrixForced(false)} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chat/:id" element={<ChatPage />} />
        <Route path="/features" element={<Features />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {incomingCall && (
        <div className={styles.callOverlay}>
          <div className={styles.callBox}>
            <div className={styles.callLabel}>INCOMING CALL</div>
            <div className={styles.callCaller}>
              {(incomingCall.caller?.split("@")[0] || "").toUpperCase()}
            </div>
            <div className={styles.callButtons}>
              <button className={styles.acceptBtn} onClick={handleAccept}>ACCEPT</button>
              <button className={styles.declineBtn} onClick={handleDecline}>DECLINE</button>
            </div>
          </div>
        </div>
      )}
    </ChatsContext.Provider>
  );
}

// ── Root — handles auth state ──────────────────────────────────────────────

function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) return <Loading />;
  if (!user)   return <Login />;

  return (
    <WSProvider user={user}>
      <AppInner />
    </WSProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
