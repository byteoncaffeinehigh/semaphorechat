import { useState, useRef, useEffect } from "react";
import styles from "./Message.module.css";
import { useAuth } from "../utils/AuthContext";
import moment from "moment";

const rot13 = (str: string): string =>
  str.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });

function renderInline(text: string, keyPrefix: string | number): React.ReactNode[] {
  const parts = text.split(/(`[^`\n]+`|\*\*[\s\S]+?\*\*|\*[^*\n]+\*|_[^_\n]+_)/g);
  return parts.map((part, i) => {
    const k = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={k}>{part.slice(2, -2)}</strong>;
    if ((part.startsWith("*") && part.endsWith("*") && part.length > 2) ||
        (part.startsWith("_") && part.endsWith("_") && part.length > 2))
      return <em key={k}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return <code key={k} className={styles.inlineCode}>{part.slice(1, -1)}</code>;
    return part.split("\n").flatMap((line, j, arr) =>
      j < arr.length - 1 ? [line, <br key={`${k}-br-${j}`} />] : [line]
    );
  });
}

function renderMarkdown(text: string): React.ReactNode[] {
  const segments = text.split(/(```[\s\S]*?```)/g);
  return segments.map((seg, i) => {
    if (seg.startsWith("```") && seg.endsWith("```")) {
      const inner = seg.slice(3, -3).replace(/^\n/, "");
      return <pre key={i} className={styles.codeBlock}>{inner}</pre>;
    }
    return <span key={i}>{renderInline(seg, i)}</span>;
  });
}

interface AudioPlayerProps {
  url: string;
  fallbackDuration?: number;
}

function AudioPlayer({ url, fallbackDuration }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(fallbackDuration || 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnd = () => { setPlaying(false); setProgress(0); setCurrent(0); };
    audio.addEventListener("ended", onEnd);
    return () => audio.removeEventListener("ended", onEnd);
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play().catch(() => {}); setPlaying(true); }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className={styles.audioContainer}>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onTimeUpdate={(e) => {
          const target = e.target as HTMLAudioElement;
          const d = target.duration || total || 1;
          setCurrent(target.currentTime);
          setProgress((target.currentTime / d) * 100);
        }}
        onLoadedMetadata={(e) => {
          const target = e.target as HTMLAudioElement;
          if (isFinite(target.duration)) setTotal(target.duration);
        }}
      />
      <button className={styles.playBtn} onClick={toggle}>{playing ? "⏸" : "▶"}</button>
      <div className={styles.progressWrap}>
        <div className={styles.progressFill} style={{ width: `${progress}%` }} />
      </div>
      <span className={styles.audioTime}>{fmt(current)} / {fmt(total)}</span>
    </div>
  );
}

function FileAttachment({ data, name, type, size }: { data: string; name: string; type?: string; size?: number }) {
  const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  const icon = name.endsWith(".apk") || type?.includes("apk") ? "📦"
    : type?.includes("pdf") ? "📄"
    : type?.includes("zip") || type?.includes("rar") ? "🗜"
    : "📎";

  const handleDownload = () => {
    const base64 = data.includes(",") ? data : `data:${type || "application/octet-stream"};base64,${data}`;
    const a = document.createElement("a");
    a.href = base64;
    a.download = name;
    a.click();
  };

  return (
    <button className={styles.fileAttachment} onClick={handleDownload} title={`Download ${name}`}>
      <span className={styles.fileIcon}>{icon}</span>
      <span className={styles.fileInfo}>
        <span className={styles.fileName}>{name}</span>
        {size ? <span className={styles.fileSize}>{fmtSize(size)}</span> : null}
      </span>
      <span className={styles.fileDownload}>↓</span>
    </button>
  );
}

export interface MessageData {
  id: string;
  user: string;
  message: string;
  timestamp?: number | string;
  isCommand?: boolean;
  isEncoded?: boolean;
  imageURL?: string;
  audioURL?: string;
  audioDuration?: number;
  fileData?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
}

interface MessageProps {
  user: string;
  message: MessageData;
  isRead?: boolean;
  isNew?: boolean;
  isSelected?: boolean;
}

function Message({ user, message, isRead, isNew, isSelected }: MessageProps) {
  const { user: userLoggedIn } = useAuth();
  const [decrypted, setDecrypted] = useState(false);
  const [tapped, setTapped] = useState(false);
  const [copied, setCopied] = useState(false);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSender = user === userLoggedIn?.email;
  const displayText = message.isEncoded && decrypted ? rot13(message.message) : message.message;

  const bubbleClass = [
    styles.messageBase,
    message.isCommand ? styles.command : isSender ? styles.sender : styles.receiver,
    isNew ? styles.msgNew : "",
    (isSelected || tapped) ? styles.msgSelected : "",
  ].filter(Boolean).join(" ");

  const handleTap = () => {
    if (message.imageURL || message.isCommand) return;
    if (tapped) {
      setTapped(false);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      return;
    }
    setTapped(true);
    tapTimerRef.current = setTimeout(() => setTapped(false), 4000);
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(displayText).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setTapped(false);
      }, 1200);
    }).catch(() => {});
  };

  return (
    <div className={styles.container}>
      <p className={bubbleClass} onClick={handleTap}>
        {message.fileData ? (
          <FileAttachment data={message.fileData} name={message.fileName || "file"} type={message.fileType} size={message.fileSize} />
        ) : message.audioURL ? (
          <AudioPlayer url={message.audioURL} fallbackDuration={message.audioDuration} />
        ) : message.imageURL ? (
          <img className={styles.messageImage} src={message.imageURL} alt="image" />
        ) : (
          <p>{renderMarkdown(displayText)}</p>
        )}
        {message.isEncoded && (
          <button
            className={styles.decryptBtn}
            onClick={(e) => { e.stopPropagation(); setDecrypted((d) => !d); }}
          >
            {decrypted ? "[ ENCRYPT ]" : "[ DECRYPT ]"}
          </button>
        )}
        <span className={styles.footer}>
          <span className={styles.timestamp}>
            {message.timestamp ? moment(message.timestamp).format("LT") : "..."}
          </span>
          {isSender && !message.isCommand && (
            <span className={isRead ? styles.readCheckRead : styles.readCheckUnread}>
              {isRead ? "✓✓" : "✓"}
            </span>
          )}
        </span>
      </p>

      {tapped && (
        <div className={isSender ? styles.copyBarSender : styles.copyBarReceiver}>
          <button className={styles.copyBtn} onClick={handleCopy}>
            {copied ? "✓ copied" : "[ copy ]"}
          </button>
        </div>
      )}
    </div>
  );
}

export default Message;
