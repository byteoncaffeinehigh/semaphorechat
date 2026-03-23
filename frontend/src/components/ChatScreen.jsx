import styled from "styled-components";
import { useAuth } from "../utils/AuthContext";
import { useWS, useWSListener } from "../utils/WSContext";
import { apiGet, apiPost, apiPut } from "../utils/api";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Avatar, IconButton } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import VideoCallIcon from "@mui/icons-material/VideoCall";
import CallModal from "./CallModal";
import SendIcon from "@mui/icons-material/Send";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import CloseIcon from "@mui/icons-material/Close";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import Message from "../components/Message";
import Loading from "../components/Loading";
import ConnectionStats from "../components/ConnectionStats";
import { useState, useRef, useEffect, useCallback } from "react";
import getRecipientEmail from "../utils/getRecipientEmail";
import TimeAgo from "timeago-react";
import { playKeyClick, playNotificationBeep } from "../utils/sounds";

// ─── helpers ────────────────────────────────────────────────────────────────

const rot13 = (str) =>
  str.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });

const safeCalc = (expr) => {
  try {
    const sanitized = expr.replace(/\^/g, "**").replace(/[^0-9+\-*/.()%\s]/g, "").trim();
    if (!sanitized) return null;
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + sanitized + ")")();
    if (typeof result !== "number" || !isFinite(result)) return null;
    return Number.isInteger(result) ? result : parseFloat(result.toFixed(6));
  } catch { return null; }
};

const CITY_TIMEZONES = {
  moscow: "Europe/Moscow", london: "Europe/London",
  "new york": "America/New_York", nyc: "America/New_York",
  tokyo: "Asia/Tokyo", berlin: "Europe/Berlin", paris: "Europe/Paris",
  dubai: "Asia/Dubai", beijing: "Asia/Shanghai", shanghai: "Asia/Shanghai",
  sydney: "Australia/Sydney", la: "America/Los_Angeles",
  "los angeles": "America/Los_Angeles", chicago: "America/Chicago",
  toronto: "America/Toronto", istanbul: "Europe/Istanbul",
  seoul: "Asia/Seoul", singapore: "Asia/Singapore",
  amsterdam: "Europe/Amsterdam", utc: "UTC",
};

function handleSlashCommand(cmd) {
  const parts = cmd.trim().slice(1).split(/\s+/);
  const command = parts[0].toLowerCase();
  const rest = parts.slice(1).join(" ");

  if (command === "roll") {
    const n = Math.floor(Math.random() * 6) + 1;
    const faces = ["⠀", "⚁", "⚂", "⚃", "⚄", "⚅", "⚅"];
    return { message: `🎲 /roll → ${n} ${faces[n]}` };
  }
  if (command === "flip") return { message: `🪙 /flip → ${Math.random() < 0.5 ? "HEADS" : "TAILS"}` };
  if (command === "ping") {
    const ms = Math.floor(Math.random() * 25) + 4;
    return { message: `◈ PING → ACK [${ms}ms] TTL=64` };
  }
  if (command === "time") {
    const cityKey = rest.toLowerCase() || "utc";
    const tz = CITY_TIMEZONES[cityKey];
    if (!tz) return { message: `⚠ /time: unknown city "${rest || "?"}"` };
    const time = new Date().toLocaleTimeString("en-GB", { timeZone: tz, hour12: false });
    return { message: `⌚ /time ${rest || "UTC"} → ${time}` };
  }
  if (command === "encode") {
    if (!rest) return { message: `⚠ /encode: usage: /encode <text>` };
    return { message: rot13(rest), isEncoded: true };
  }
  if (command === "calc") {
    if (!rest) return { message: `⚠ /calc: usage: /calc <expression>` };
    const result = safeCalc(rest);
    if (result === null) return { message: `⚠ /calc: invalid expression "${rest}"` };
    return { message: `🖩 ${rest} = ${result}` };
  }
  if (command === "love") return { message: "❤" };
  return null;
}

// ─── component ──────────────────────────────────────────────────────────────

function ChatScreen({ chat }) {
  const { user } = useAuth();
  const { send: wsSend } = useWS();
  const [input, setInput] = useState("");
  const navigate = useNavigate();
  const { id: chatId } = useParams();
  const [searchParams] = useSearchParams();
  const callParam = searchParams.get("call");

  // messages
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(true);

  // recipient
  const recipientEmail = getRecipientEmail(chat.users, user) ??
    chat.users?.find((u) => u !== user?.email) ?? chat.users?.[0];
  const [recipient, setRecipient] = useState(null);

  // chat state (last read, typing)
  const [recipientTyping, setRecipientTyping] = useState(null); // { wpm, ts, active }
  const [recipientLastRead, setRecipientLastRead] = useState(
    chat.lastRead?.[recipientEmail] ? new Date(chat.lastRead[recipientEmail]).getTime() : 0
  );

  // vim mode
  const [vimMode, setVimMode] = useState("normal");
  const vimModeRef = useRef("normal");
  const [selectedMsgIdx, setSelectedMsgIdx] = useState(null);
  const lastGPressRef = useRef(0);
  const inputRef = useRef(null);
  const messageContainerRef = useRef(null);
  const messagesRef = useRef([]);

  // new message glitch tracking
  const isInitialLoadRef = useRef(true);
  const prevMsgCountRef = useRef(0);
  const [newMsgIds, setNewMsgIds] = useState(new Set());

  // typing WPM
  const keystrokeTimesRef = useRef([]);
  const typingTimerRef = useRef(null);
  const lastTypingUpdateRef = useRef(0);

  const [txCount, setTxCount] = useState(0);
  const endOfMessageRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showCall, setShowCall] = useState(callParam === "callee");
  const [callMode, setCallMode] = useState(callParam === "callee" ? "callee" : null);

  // voice recording
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioMimeTypeRef = useRef('');
  const recTimerRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setIsMobile(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  // keep ref in sync
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // ── initial data load ──────────────────────────────────────────────────
  useEffect(() => {
    if (!chatId) return;
    setLoadingMessages(true);
    Promise.all([
      apiGet(`/api/chats/${chatId}/messages`),
      recipientEmail ? apiGet(`/api/users?email=${encodeURIComponent(recipientEmail)}`) : Promise.resolve(null),
    ]).then(([msgs, rec]) => {
      setMessages(msgs || []);
      if (rec) setRecipient(rec);
    }).catch(() => {}).finally(() => setLoadingMessages(false));

    // mark as read
    apiPut(`/api/chats/${chatId}/read`, {}).catch(() => {});
  }, [chatId]);

  // ── WS: new messages ───────────────────────────────────────────────────
  useWSListener("new_message", (data) => {
    if (data.chatId !== chatId) return;
    const msg = data.message;
    setMessages((prev) => {
      if (prev.find((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    if (msg.user !== user?.email) {
      playNotificationBeep();
      // mark read immediately since we're in the chat
      apiPut(`/api/chats/${chatId}/read`, {}).catch(() => {});
    }
  }, [chatId, user?.email]);

  // ── WS: typing indicator ───────────────────────────────────────────────
  useWSListener("typing", (data) => {
    if (data.chatId !== chatId || data.userEmail === user?.email) return;
    setRecipientTyping({ wpm: data.wpm, ts: data.ts, active: data.active });
  }, [chatId, user?.email]);

  // ── WS: presence ───────────────────────────────────────────────────────
  useWSListener("presence", (data) => {
    if (data.userEmail !== recipientEmail) return;
    setRecipient((r) => r ? { ...r, isOnline: data.isOnline, lastSeen: data.lastSeen } : r);
  }, [recipientEmail]);

  // ── WS: chat_update (read receipts) ────────────────────────────────────
  useWSListener("chat_update", (data) => {
    if (data.chat.id !== chatId) return;
    const lr = data.chat.lastRead?.[recipientEmail];
    if (lr) setRecipientLastRead(new Date(lr).getTime());
  }, [chatId, recipientEmail]);

  // ── new message effects (glitch + sound + vim) ─────────────────────────
  useEffect(() => {
    const count = messages.length;
    if (isInitialLoadRef.current) {
      prevMsgCountRef.current = count;
      isInitialLoadRef.current = false;
      setSelectedMsgIdx(count > 0 ? count - 1 : null);
      return;
    }
    if (count > prevMsgCountRef.current) {
      const newOnes = messages.slice(prevMsgCountRef.current);
      const newIds = newOnes.map((m) => m.id);
      setNewMsgIds((prev) => new Set([...prev, ...newIds]));
      setTimeout(() => setNewMsgIds((prev) => {
        const next = new Set(prev);
        newIds.forEach((id) => next.delete(id));
        return next;
      }), 800);
      prevMsgCountRef.current = count;
      if (vimModeRef.current === "normal") setSelectedMsgIdx(count - 1);
      endOfMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length]);

  // ── scroll selected message into view ─────────────────────────────────
  useEffect(() => {
    if (selectedMsgIdx === null) return;
    const el = messageContainerRef.current?.querySelector(`[data-msg-idx="${selectedMsgIdx}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedMsgIdx]);

  // ── vim keyboard handler ───────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      const mode = vimModeRef.current;
      if (mode === "insert") {
        if (e.key === "Escape") {
          e.preventDefault();
          vimModeRef.current = "normal";
          setVimMode("normal");
          inputRef.current?.blur();
          const count = messagesRef.current.length;
          if (count > 0) setSelectedMsgIdx(count - 1);
        }
        return;
      }
      if (
        document.activeElement &&
        document.activeElement !== document.body &&
        document.activeElement !== inputRef.current
      ) return;

      const count = messagesRef.current.length;
      const clamp = (v) => Math.max(0, Math.min(count - 1, v));
      const move = (delta) => setSelectedMsgIdx((prev) => clamp((prev ?? count - 1) + delta));

      switch (e.key) {
        case "j": e.preventDefault(); move(1); break;
        case "k": e.preventDefault(); move(-1); break;
        case "G": e.preventDefault(); setSelectedMsgIdx(count - 1); break;
        case "g": {
          e.preventDefault();
          const now = Date.now();
          if (now - lastGPressRef.current < 500) setSelectedMsgIdx(0);
          lastGPressRef.current = now;
          break;
        }
        case "y": {
          e.preventDefault();
          setSelectedMsgIdx((prev) => {
            const idx = prev ?? count - 1;
            const msg = messagesRef.current[idx]?.message;
            if (msg) navigator.clipboard.writeText(msg).catch(() => {});
            return prev;
          });
          break;
        }
        case "i":
        case "a":
          e.preventDefault();
          vimModeRef.current = "insert";
          setVimMode("insert");
          setSelectedMsgIdx(null);
          setTimeout(() => inputRef.current?.focus(), 0);
          break;
        default:
          if (e.ctrlKey && e.key === "d") { e.preventDefault(); move(5); }
          if (e.ctrlKey && e.key === "u") { e.preventDefault(); move(-5); }
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── clean up typing on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimeout(typingTimerRef.current);
      wsSend("typing", { chatId, wpm: 0, active: false });
    };
  }, []);

  const sendTypingWS = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingUpdateRef.current < 1200) return;
    lastTypingUpdateRef.current = now;
    const recent = keystrokeTimesRef.current.filter((t) => now - t < 10000);
    const wpm = Math.round((recent.length / 5) * 6);
    wsSend("typing", { chatId, wpm, active: true });
  }, [chatId, wsSend]);

  const clearTypingWS = useCallback(() => {
    wsSend("typing", { chatId, wpm: 0, active: false });
  }, [chatId, wsSend]);

  // ── send message ───────────────────────────────────────────────────────
  const sendMessage = (e) => {
    e.preventDefault();
    if (vimModeRef.current !== "insert") return;
    if (!input.trim()) return;

    let messageText = input.trim();
    let isCommand = false;
    let isEncoded = false;

    if (messageText.startsWith("/")) {
      const result = handleSlashCommand(messageText);
      if (result) {
        messageText = result.message;
        isCommand = true;
        isEncoded = result.isEncoded || false;
      }
    }

    const body = { message: messageText, isCommand, isEncoded };
    apiPost(`/api/chats/${chatId}/messages`, body).catch(() => {});

    if (!isCommand) {
      const senderName = user?.displayName || user?.email?.split("@")[0];
      apiPost("/api/notify", { recipientEmail, senderName, message: messageText }).catch(() => {});
    }

    setTxCount((c) => c + 1);
    setInput("");
  };

  // ── send photo ─────────────────────────────────────────────────────────
  const compressImage = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = reject;
    img.src = url;
  });

  const sendPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const imageURL = await compressImage(file);
      apiPost(`/api/chats/${chatId}/messages`, { imageURL }).catch(() => {});
      const senderName = user?.displayName || user?.email?.split("@")[0];
      apiPost("/api/notify", { recipientEmail, senderName, message: "🖼 Photo" }).catch(() => {});
    } catch {}
  };

  // ── voice recording ────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(
        (t) => MediaRecorder.isTypeSupported(t)
      ) || '';
      const mr = preferredType
        ? new MediaRecorder(stream, { mimeType: preferredType })
        : new MediaRecorder(stream);
      audioMimeTypeRef.current = mr.mimeType;
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true); setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch {}
  };

  const cancelRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr) { mr.stop(); mr.stream?.getTracks().forEach((t) => t.stop()); }
    clearInterval(recTimerRef.current);
    setRecording(false); setRecSeconds(0);
    audioChunksRef.current = [];
  };

  const sendVoiceMessage = () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    const duration = recSeconds;
    mr.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: audioMimeTypeRef.current || 'audio/mp4' });
      setUploading(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          apiPost(`/api/chats/${chatId}/messages`, {
            audioURL: reader.result,
            audioDuration: duration,
          }).catch(() => {});
          const senderName = user?.displayName || user?.email?.split("@")[0];
          apiPost("/api/notify", { recipientEmail, senderName, message: "🎤 Voice message" }).catch(() => {});
        } catch {}
        setUploading(false);
      };
      reader.readAsDataURL(blob);
    };
    mr.stop();
    mr.stream?.getTracks().forEach((t) => t.stop());
    clearInterval(recTimerRef.current);
    setRecording(false); setRecSeconds(0);
    audioChunksRef.current = [];
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    playKeyClick();
    const now = Date.now();
    keystrokeTimesRef.current.push(now);
    keystrokeTimesRef.current = keystrokeTimesRef.current.filter((t) => now - t < 30000);
    sendTypingWS();
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(clearTypingWS, 2500);
  };

  const isRecipientTyping =
    recipientTyping?.active &&
    recipientTyping?.ts &&
    Date.now() - recipientTyping.ts < 4000;

  const displayName = recipient?.displayName || recipientEmail?.split("@")[0] || "";
  const fmtRecTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <Container>
      <Header>
        <BackButton onClick={() => navigate("/")}>
          <ArrowBackIcon style={{ color: "#00ff41" }} />
        </BackButton>
        <AvatarWrapper>
          <Avatar src={recipient?.photoURL}>{recipientEmail?.[0]?.toUpperCase()}</Avatar>
          {recipient?.isOnline && <OnlineDot />}
        </AvatarWrapper>
        <HeaderInformation>
          <h3>{displayName}</h3>
          {isRecipientTyping ? (
            <TypingIndicator>
              ▶ TRANSMITTING{recipientTyping?.wpm > 0 ? ` [${recipientTyping.wpm} WPM]` : "..."}
            </TypingIndicator>
          ) : recipient ? (
            <p>
              {recipient.isOnline ? "Online" : recipient.lastSeen ? (
                <>Last active: <TimeAgo datetime={new Date(recipient.lastSeen)} /></>
              ) : "Unavailable"}
            </p>
          ) : (
            <p>Loading...</p>
          )}
        </HeaderInformation>
        <IconButton onClick={() => { setCallMode("caller"); setShowCall(true); }}
          style={{ color: "#00ff41", marginLeft: "auto", flexShrink: 0 }}>
          <VideoCallIcon />
        </IconButton>
      </Header>

      <MessageContainer ref={messageContainerRef}>
        {loadingMessages ? <Loading full={false} size={24} /> : messages.map((msg, idx) => {
          const ts = msg.timestamp ? new Date(msg.timestamp).getTime() : 0;
          const isRead = ts && recipientLastRead >= ts;
          return (
            <div key={msg.id} data-msg-idx={idx}>
              <Message
                user={msg.user}
                message={{ ...msg, timestamp: ts }}
                isRead={isRead}
                isNew={newMsgIds.has(msg.id)}
                isSelected={selectedMsgIdx === idx}
              />
            </div>
          );
        })}
        <EndOfMessage ref={endOfMessageRef} />
      </MessageContainer>

      <ConnectionStats
        msgCount={messages.length}
        txCount={txCount}
        mode={vimMode}
      />

      <InputContainer onSubmit={recording ? (e) => { e.preventDefault(); sendVoiceMessage(); } : sendMessage}>
        {recording ? (
          <>
            <RecordingIndicator>● REC {fmtRecTime(recSeconds)}</RecordingIndicator>
            <IconButton onClick={cancelRecording} style={{ color: "#ff4141", padding: "6px" }}>
              <CloseIcon fontSize="small" />
            </IconButton>
            <IconButton onClick={sendVoiceMessage} style={{ color: "#00ff41", padding: "6px" }} disabled={uploading}>
              <StopIcon fontSize="small" />
            </IconButton>
          </>
        ) : (
          <>
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => {
                handleInputChange(e);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !isMobile) {
                  e.preventDefault();
                  sendMessage(e);
                  setTimeout(() => { if (inputRef.current) inputRef.current.style.height = "44px"; }, 0);
                }
              }}
              onFocus={() => {
                if (vimModeRef.current !== "insert") {
                  vimModeRef.current = "insert";
                  setVimMode("insert");
                  setSelectedMsgIdx(null);
                }
              }}
              placeholder={
                vimMode === "normal"
                  ? "j/k ↕  gg/G ⇕  ^d/^u page  y yank  i insert"
                  : "Message... (/roll /flip /ping /time /encode /calc /love)"
              }
              rows={1}
              $vimMode={vimMode}
              enterKeyHint={isMobile ? "enter" : "send"}
            />
            {vimMode === "insert" && input.trim() && (
              <SendIcon onClick={sendMessage} style={{ color: "#00ff41", cursor: "pointer", flexShrink: 0 }} />
            )}
            {vimMode === "insert" && !input.trim() && (
              <>
                <IconButton onClick={() => fileInputRef.current?.click()} style={{ color: "#00ff41", padding: "6px", flexShrink: 0 }}>
                  <AddPhotoAlternateIcon fontSize="small" />
                </IconButton>
                <IconButton onClick={startRecording} style={{ color: "#00ff41", padding: "6px", flexShrink: 0 }}>
                  <MicIcon fontSize="small" />
                </IconButton>
              </>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={sendPhoto} />
          </>
        )}
      </InputContainer>

      {showCall && (
        <CallModal
          chatId={chatId}
          user={user}
          recipientEmail={recipientEmail}
          mode={callMode}
          onClose={() => setShowCall(false)}
        />
      )}
    </Container>
  );
}

export default ChatScreen;

// ─── styles ─────────────────────────────────────────────────────────────────

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
`;

const Input = styled.textarea`
  flex: 1;
  outline: 0;
  padding: 12px 15px;
  margin-left: 10px;
  margin-right: 10px;
  border-radius: 2px;
  border: 1px solid ${({ $vimMode }) => $vimMode === "normal" ? "#1a3a0a" : "#1a3a1a"};
  background-color: #0a150a;
  color: ${({ $vimMode }) => $vimMode === "normal" ? "#1a6a1a" : "#00ff41"};
  font-size: 16px;
  font-family: 'Share Tech Mono', 'Courier New', Courier, monospace;
  caret-color: #00ff41;
  caret-shape: block;
  transition: border-color 0.2s, color 0.2s;
  resize: none;
  overflow-y: hidden;
  line-height: 1.4;
  min-height: 44px;
  max-height: 200px;

  ::placeholder {
    color: ${({ $vimMode }) => $vimMode === "normal" ? "#1a4a1a" : "#1a4a1a"};
    font-size: 12px;
  }
`;

const InputContainer = styled.form`
  display: flex;
  align-items: flex-end;
  padding: 10px;
  background-color: #0d150d;
  border-top: 1px solid #1a3a1a;
  flex-shrink: 0;
  padding-bottom: max(10px, env(safe-area-inset-bottom));
`;

const RecordingIndicator = styled.div`
  flex: 1;
  padding: 10px 14px;
  font-family: 'Share Tech Mono', 'Courier New', monospace;
  font-size: 14px;
  color: #ff4141;
  animation: pulse 0.6s ease-in-out infinite alternate;
  @keyframes pulse { from { opacity: 0.5; } to { opacity: 1; } }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  padding: 11px;
  height: 64px;
  background-color: #0d150d;
  border-bottom: 1px solid #1a3a1a;
  color: #00ff41;
  flex-shrink: 0;
`;

const AvatarWrapper = styled.div`
  position: relative;
  flex-shrink: 0;
`;

const OnlineDot = styled.div`
  position: absolute;
  bottom: 1px;
  right: 1px;
  width: 10px;
  height: 10px;
  background-color: #00ff41;
  border-radius: 50%;
  border: 2px solid #0d150d;
`;

const BackButton = styled(IconButton)`
  @media (min-width: 1241px) {
    display: none !important;
  }
`;

const HeaderInformation = styled.div`
  margin-left: 10px;
  flex: 1;
  min-width: 0;

  > h3 {
    margin: 0;
    color: #00ff41;
    text-shadow: 0 0 8px rgba(0, 255, 65, 0.4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  > p {
    font-size: 13px;
    color: #1a7a1a;
    margin: 0;
  }
`;

const TypingIndicator = styled.p`
  font-size: 12px;
  color: #00ff41 !important;
  margin: 0;
  font-family: 'Share Tech Mono', 'Courier New', monospace;
  animation: pulse 0.8s ease-in-out infinite alternate;
  @keyframes pulse { from { opacity: 0.6; } to { opacity: 1; } }
`;

const EndOfMessage = styled.div`
  margin-bottom: 10px;
`;

const MessageContainer = styled.div`
  flex: 1;
  padding: 20px;
  background-color: #070d07;
  overflow-y: auto;
  ::-webkit-scrollbar { display: none; }
  -ms-overflow-style: none;
  scrollbar-width: none;
`;
