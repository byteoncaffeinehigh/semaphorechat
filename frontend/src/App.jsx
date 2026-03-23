import { useEffect, useState, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import styled, { keyframes } from "styled-components";

import { AuthProvider, useAuth } from "./utils/AuthContext";
import { WSProvider, useWSListener } from "./utils/WSContext";
import { apiGet, apiPost, apiPut } from "./utils/api";
import { ChatsContext } from "./utils/ChatsContext";
import { startCallRingtone, stopCallRingtone } from "./utils/sounds";

import Login from "./pages/Login";
import Home from "./pages/Home";
import ChatPage from "./pages/ChatPage";
import Features from "./pages/Features";
import Loading from "./components/Loading";
import MatrixRain from "./components/MatrixRain";
import ScanlinesOverlay from "./components/ScanlinesOverlay";

// ── Inner app — rendered only when user is authenticated ───────────────────

function AppInner() {
  const { user, signOut } = useAuth();
  const [appReady, setAppReady]         = useState(false);
  const [chats, setChats]               = useState([]);
  const [matrixForced, setMatrixForced] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const toggleMatrix = useCallback(() => setMatrixForced((v) => !v), []);
  const navigate = useNavigate();

  // ── keyboard shortcut: M toggles matrix ───────────────────────────────
  useEffect(() => {
    const handleKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "m" || e.key === "M") toggleMatrix();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [toggleMatrix]);

  // ── load chats on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    apiGet("/api/chats")
      .then((data) => { setChats(data || []); setAppReady(true); })
      .catch(() => setAppReady(true));
  }, [user?.id]);

  // ── WS: chat_update ────────────────────────────────────────────────────
  useWSListener("chat_update", ({ chat }) => {
    setChats((prev) => {
      const idx = prev.findIndex((c) => c.id === chat.id);
      if (idx === -1) return [...prev, chat];
      const next = [...prev];
      next[idx] = chat;
      return next;
    });
  }, []);

  // ── WS: incoming call ──────────────────────────────────────────────────
  useWSListener("call_update", ({ chatId, call }) => {
    if (call.callee === user?.email && call.status === "calling") {
      setIncomingCall({ chatId, caller: call.caller });
      startCallRingtone();
    } else if (incomingCall?.chatId === chatId && call.status !== "calling") {
      setIncomingCall(null);
      stopCallRingtone();
    }
  }, [user?.email, incomingCall?.chatId]);

  // ── presence: set online on tab visibility ─────────────────────────────
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

  // ── Web Push subscription ──────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
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
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
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
        <CallOverlay>
          <CallBox>
            <CallLabel>INCOMING CALL</CallLabel>
            <CallCaller>
              {(incomingCall.caller?.split("@")[0] || "").toUpperCase()}
            </CallCaller>
            <CallButtons>
              <AcceptBtn onClick={handleAccept}>ACCEPT</AcceptBtn>
              <DeclineBtn onClick={handleDecline}>DECLINE</DeclineBtn>
            </CallButtons>
          </CallBox>
        </CallOverlay>
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

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// ── styled components ─────────────────────────────────────────────────────

const CallOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.93);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  font-family: 'Share Tech Mono', 'Courier New', monospace;
`;

const CallBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  padding: 48px 40px;
  border: 1px solid #1a3a1a;
  background: #070d07;
  min-width: 280px;
`;

const pulse = keyframes`
  from { opacity: 0.5; }
  to   { opacity: 1; }
`;

const CallLabel = styled.div`
  font-size: 12px;
  color: #1a7a1a;
  letter-spacing: 0.15em;
  animation: ${pulse} 0.8s ease-in-out infinite alternate;
`;

const CallCaller = styled.div`
  font-size: 26px;
  color: #00ff41;
  text-shadow: 0 0 20px rgba(0, 255, 65, 0.5);
  letter-spacing: 0.05em;
`;

const CallButtons = styled.div`
  display: flex;
  gap: 16px;
`;

const AcceptBtn = styled.button`
  background: #0a2a0a;
  color: #00ff41;
  border: 1px solid #1a5a1a;
  padding: 8px 22px;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  letter-spacing: 0.08em;
  &:hover { background: #0d3a0d; }
`;

const DeclineBtn = styled.button`
  background: #2a0a0a;
  color: #ff4141;
  border: 1px solid #5a1a1a;
  padding: 8px 22px;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  letter-spacing: 0.08em;
  &:hover { background: #3a1010; }
`;
