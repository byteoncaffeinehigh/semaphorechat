import styles from "./ChatScreen.module.css";
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
import AttachFileIcon from "@mui/icons-material/AttachFile";
import Message, { type MessageData } from "../components/Message";
import Loading from "../components/Loading";
import ConnectionStats from "../components/ConnectionStats";
import { useState, useRef, useEffect, useCallback } from "react";
import getRecipientEmail from "../utils/getRecipientEmail";
import TimeAgo from "timeago-react";
import { playKeyClick, playNotificationBeep } from "../utils/sounds";
import { type Chat } from "../utils/ChatsContext";

// ─── helpers ────────────────────────────────────────────────────────────────

const rot13 = (str: string): string =>
  str.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });

const safeCalc = (expr: string): number | null => {
  try {
    const sanitized = expr.replace(/\^/g, "**").replace(/[^0-9+\-*/.()%\s]/g, "").trim();
    if (!sanitized) return null;
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + sanitized + ")")() as number;
    if (typeof result !== "number" || !isFinite(result)) return null;
    return Number.isInteger(result) ? result : parseFloat(result.toFixed(6));
  } catch { return null; }
};

const CITY_TIMEZONES: Record<string, string> = {
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

interface SlashResult {
  message: string;
  isEncoded?: boolean;
}

function handleSlashCommand(cmd: string): SlashResult | null {
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

interface Recipient {
  email?: string;
  displayName?: string;
  photoURL?: string;
  isOnline?: boolean;
  lastSeen?: string;
}

interface TypingData {
  chatId: string;
  userEmail: string;
  wpm: number;
  active: boolean;
  ts: number;
}

interface PresenceData {
  userEmail: string;
  isOnline: boolean;
  lastSeen?: string;
}

interface NewMessageData {
  chatId: string;
  message: MessageData;
}

interface ChatUpdateData {
  chat: {
    id: string;
    lastRead?: Record<string, string>;
  };
}

function ChatScreen({ chat }: { chat: Chat }) {
  const { user } = useAuth();
  const { send: wsSend } = useWS();
  const [input, setInput] = useState("");
  const navigate = useNavigate();
  const { id: chatId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const callParam = searchParams.get("call");

  const [messages, setMessages] = useState<MessageData[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);

  const recipientEmail = getRecipientEmail(chat.users, user) ??
    chat.users?.find((u) => u !== user?.email) ?? chat.users?.[0];
  const [recipient, setRecipient] = useState<Recipient | null>(null);

  const [recipientTyping, setRecipientTyping] = useState<TypingData | null>(null);
  const [recipientLastRead, setRecipientLastRead] = useState(
    chat.lastRead?.[recipientEmail ?? ""] ? new Date(chat.lastRead[recipientEmail ?? ""]!).getTime() : 0
  );

  const [vimMode, setVimMode] = useState("normal");
  const vimModeRef = useRef("normal");
  const [selectedMsgIdx, setSelectedMsgIdx] = useState<number | null>(null);
  const lastGPressRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<MessageData[]>([]);

  const isInitialLoadRef = useRef(true);
  const prevMsgCountRef = useRef(0);
  const [newMsgIds, setNewMsgIds] = useState(new Set<string>());

  const keystrokeTimesRef = useRef<number[]>([]);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingUpdateRef = useRef(0);

  const [txCount, setTxCount] = useState(0);
  const endOfMessageRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showCall, setShowCall] = useState(callParam === "callee");
  const [callMode, setCallMode] = useState<"caller" | "callee" | null>(callParam === "callee" ? "callee" : null);
  const [incomingCall, setIncomingCall] = useState(false);

  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioMimeTypeRef = useRef("");
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileAttachRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMobile(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    if (!chatId) return;
    setLoadingMessages(true);
    Promise.all([
      apiGet<MessageData[]>(`/api/chats/${chatId}/messages`),
      recipientEmail ? apiGet<Recipient>(`/api/users?email=${encodeURIComponent(recipientEmail)}`) : Promise.resolve(null),
    ]).then(([msgs, rec]) => {
      setMessages(msgs || []);
      if (rec) setRecipient(rec);
    }).catch(() => {}).finally(() => setLoadingMessages(false));

    apiPut(`/api/chats/${chatId}/read`, {}).catch(() => {});
  }, [chatId]);

  useWSListener("new_message", (data) => {
    const { chatId: cid, message: msg } = data as NewMessageData;
    if (cid !== chatId) return;
    setMessages((prev) => {
      if (prev.find((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    if (msg.user !== user?.email) {
      playNotificationBeep();
      apiPut(`/api/chats/${chatId}/read`, {}).catch(() => {});
    }
  }, [chatId, user?.email]);

  useWSListener("typing", (data) => {
    const d = data as TypingData;
    if (d.chatId !== chatId || d.userEmail === user?.email) return;
    setRecipientTyping({ wpm: d.wpm, ts: d.ts, active: d.active, chatId: d.chatId, userEmail: d.userEmail });
  }, [chatId, user?.email]);

  useWSListener("presence", (data) => {
    const { userEmail, isOnline, lastSeen } = data as PresenceData;
    if (userEmail !== recipientEmail) return;
    setRecipient((r) => r ? { ...r, isOnline, lastSeen } : r);
  }, [recipientEmail]);

  useWSListener("chat_update", (data) => {
    const { chat: updatedChat } = data as ChatUpdateData;
    if (updatedChat.id !== chatId) return;
    const lr = updatedChat.lastRead?.[recipientEmail ?? ""];
    if (lr) setRecipientLastRead(new Date(lr).getTime());
  }, [chatId, recipientEmail]);

  useWSListener("call_update", (data) => {
    const d = data as { chatId: string; call: { status?: string } };
    if (d.chatId !== chatId) return;
    if (d.call.status === "calling" && !showCall) {
      setIncomingCall(true);
    }
    if ((d.call.status === "ended" || d.call.status === "declined")) {
      setIncomingCall(false);
      setShowCall(false);
      setCallMode(null);
    }
  }, [chatId, showCall]);

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

  useEffect(() => {
    if (selectedMsgIdx === null) return;
    const el = messageContainerRef.current?.querySelector(`[data-msg-idx="${selectedMsgIdx}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedMsgIdx]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
      const clamp = (v: number) => Math.max(0, Math.min(count - 1, v));
      const move = (delta: number) => setSelectedMsgIdx((prev) => clamp((prev ?? count - 1) + delta));

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

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
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

  const sendMessage = (e: React.FormEvent) => {
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

  const compressImage = (file: File): Promise<string> => new Promise((resolve, reject) => {
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
      (canvas.getContext("2d") as CanvasRenderingContext2D).drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = reject;
    img.src = url;
  });

  const sendFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const MAX_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_SIZE) { alert("File too large (max 25 MB)"); return; }
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await apiPost(`/api/chats/${chatId}/messages`, {
        fileData: base64,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
      });
      const senderName = user?.displayName || user?.email?.split("@")[0];
      apiPost("/api/notify", { recipientEmail, senderName, message: `📎 ${file.name}` }).catch(() => {});
    } catch {}
    setUploading(false);
  };

  const sendPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = ["audio/webm", "audio/mp4", "audio/ogg"].find(
        (t) => MediaRecorder.isTypeSupported(t)
      ) || "";
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
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    setRecording(false); setRecSeconds(0);
    audioChunksRef.current = [];
  };

  const sendVoiceMessage = () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    const duration = recSeconds;
    mr.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: audioMimeTypeRef.current || "audio/mp4" });
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
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    setRecording(false); setRecSeconds(0);
    audioChunksRef.current = [];
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    playKeyClick();
    const now = Date.now();
    keystrokeTimesRef.current.push(now);
    keystrokeTimesRef.current = keystrokeTimesRef.current.filter((t) => now - t < 30000);
    sendTypingWS();
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(clearTypingWS, 2500);
  };

  const isRecipientTyping =
    recipientTyping?.active &&
    recipientTyping?.ts &&
    Date.now() - recipientTyping.ts < 4000;

  const displayName = recipient?.displayName || recipientEmail?.split("@")[0] || "";
  const fmtRecTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const inputClass = `${styles.input} ${vimMode === "normal" ? styles.inputNormal : styles.inputInsert}`;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <IconButton className={styles.backButton} onClick={() => navigate("/")}>
          <ArrowBackIcon style={{ color: "#00ff41" }} />
        </IconButton>
        <div className={styles.avatarWrapper}>
          <Avatar src={recipient?.photoURL}>{recipientEmail?.[0]?.toUpperCase()}</Avatar>
          {recipient?.isOnline && <div className={styles.onlineDot} />}
        </div>
        <div className={styles.headerInformation}>
          <h3>{displayName}</h3>
          {isRecipientTyping ? (
            <p className={styles.typingIndicator}>
              ▶ TRANSMITTING{recipientTyping && recipientTyping.wpm > 0 ? ` [${recipientTyping.wpm} WPM]` : "..."}
            </p>
          ) : recipient ? (
            <p>
              {recipient.isOnline ? "Online" : recipient.lastSeen ? (
                <>Last active: <TimeAgo datetime={new Date(recipient.lastSeen)} /></>
              ) : "Unavailable"}
            </p>
          ) : (
            <p>Loading...</p>
          )}
        </div>
        <IconButton
          onClick={() => { setCallMode("caller"); setShowCall(true); }}
          style={{ color: "#00ff41", marginLeft: "auto", flexShrink: 0 }}
        >
          <VideoCallIcon />
        </IconButton>
      </div>

      <div ref={messageContainerRef} className={styles.messageContainer}>
        {loadingMessages ? <Loading full={false} size={24} /> : messages.map((msg, idx) => {
          const ts = msg.timestamp ? new Date(msg.timestamp as string).getTime() : 0;
          const isRead = !!(ts && recipientLastRead >= ts);
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
        <div ref={endOfMessageRef} className={styles.endOfMessage} />
      </div>

      <ConnectionStats
        msgCount={messages.length}
        txCount={txCount}
        mode={vimMode}
      />

      <form
        className={styles.inputContainer}
        onSubmit={recording ? (e) => { e.preventDefault(); sendVoiceMessage(); } : sendMessage}
      >
        {recording ? (
          <>
            <div className={styles.recordingIndicator}>● REC {fmtRecTime(recSeconds)}</div>
            <IconButton onClick={cancelRecording} style={{ color: "#ff4141", padding: "6px" }}>
              <CloseIcon fontSize="small" />
            </IconButton>
            <IconButton
              onClick={sendVoiceMessage}
              style={{ color: "#00ff41", padding: "6px", flexShrink: 0 }}
              disabled={uploading}
            >
              <StopIcon fontSize="small" />
            </IconButton>
          </>
        ) : (
          <>
            <textarea
              ref={inputRef}
              className={inputClass}
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
              enterKeyHint={isMobile ? "enter" : "send"}
            />
            {vimMode === "insert" && input.trim() && (
              <SendIcon
                onClick={sendMessage as unknown as React.MouseEventHandler}
                style={{ color: "#00ff41", cursor: "pointer", flexShrink: 0 }}
              />
            )}
            {vimMode === "insert" && !input.trim() && (
              <>
                <IconButton
                  onClick={() => fileInputRef.current?.click()}
                  style={{ color: "#00ff41", padding: "6px", flexShrink: 0 }}
                >
                  <AddPhotoAlternateIcon fontSize="small" />
                </IconButton>
                <IconButton
                  onClick={() => fileAttachRef.current?.click()}
                  disabled={uploading}
                  style={{ color: "#00ff41", padding: "6px", flexShrink: 0 }}
                >
                  <AttachFileIcon fontSize="small" />
                </IconButton>
                <IconButton
                  onClick={startRecording}
                  style={{ color: "#00ff41", padding: "6px", flexShrink: 0 }}
                >
                  <MicIcon fontSize="small" />
                </IconButton>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={sendPhoto}
            />
            <input
              ref={fileAttachRef}
              type="file"
              style={{ display: "none" }}
              onChange={sendFile}
            />
          </>
        )}
      </form>

      {incomingCall && !showCall && (
        <div className={styles.incomingCallBanner}>
          <span>📞 INCOMING CALL from {displayName || recipientEmail}</span>
          <button
            className={styles.acceptBtn}
            onClick={() => { setIncomingCall(false); setCallMode("callee"); setShowCall(true); }}
          >
            ACCEPT
          </button>
          <button
            className={styles.declineBtn}
            onClick={() => {
              setIncomingCall(false);
              apiPut(`/api/calls/${chatId}`, { status: "declined" }).catch(() => {});
            }}
          >
            DECLINE
          </button>
        </div>
      )}

      {showCall && (
        <CallModal
          chatId={chatId!}
          user={user!}
          recipientEmail={recipientEmail!}
          mode={callMode}
          onClose={() => setShowCall(false)}
        />
      )}
    </div>
  );
}

export default ChatScreen;
