import { useState, useRef, useEffect } from "react";
import styled, { keyframes, css } from "styled-components";
import { useAuth } from "../utils/AuthContext";
import moment from "moment";

const rot13 = (str) =>
  str.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });

function renderInline(text, keyPrefix) {
  const parts = text.split(/(`[^`\n]+`|\*\*[\s\S]+?\*\*|\*[^*\n]+\*|_[^_\n]+_)/g);
  return parts.map((part, i) => {
    const k = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={k}>{part.slice(2, -2)}</strong>;
    if ((part.startsWith("*") && part.endsWith("*") && part.length > 2) ||
        (part.startsWith("_") && part.endsWith("_") && part.length > 2))
      return <em key={k}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return <InlineCode key={k}>{part.slice(1, -1)}</InlineCode>;
    return part.split("\n").flatMap((line, j, arr) =>
      j < arr.length - 1 ? [line, <br key={`${k}-br-${j}`} />] : [line]
    );
  });
}

function renderMarkdown(text) {
  const segments = text.split(/(```[\s\S]*?```)/g);
  return segments.map((seg, i) => {
    if (seg.startsWith("```") && seg.endsWith("```")) {
      const inner = seg.slice(3, -3).replace(/^\n/, "");
      return <CodeBlock key={i}>{inner}</CodeBlock>;
    }
    return <span key={i}>{renderInline(seg, i)}</span>;
  });
}

function AudioPlayer({ url, fallbackDuration }) {
  const audioRef = useRef(null);
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

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <AudioContainer>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onTimeUpdate={(e) => {
          const d = e.target.duration || total || 1;
          setCurrent(e.target.currentTime);
          setProgress((e.target.currentTime / d) * 100);
        }}
        onLoadedMetadata={(e) => { if (isFinite(e.target.duration)) setTotal(e.target.duration); }}
      />
      <PlayBtn onClick={toggle}>{playing ? "⏸" : "▶"}</PlayBtn>
      <ProgressWrap>
        <ProgressFill style={{ width: `${progress}%` }} />
      </ProgressWrap>
      <AudioTime>{fmt(current)} / {fmt(total)}</AudioTime>
    </AudioContainer>
  );
}

function Message({ user, message, isRead, isNew, isSelected }) {
  const { user: userLoggedIn } = useAuth();
  const [decrypted, setDecrypted] = useState(false);
  const [tapped, setTapped] = useState(false);
  const [copied, setCopied] = useState(false);
  const tapTimerRef = useRef(null);

  const isSender = user === userLoggedIn?.email;
  const TypeOfMessage = message.isCommand ? CommandMsg : isSender ? Sender : Reciever;
  const displayText = message.isEncoded && decrypted ? rot13(message.message) : message.message;

  const handleTap = () => {
    if (message.imageURL || message.isCommand) return;
    if (tapped) {
      // second tap — deselect
      setTapped(false);
      clearTimeout(tapTimerRef.current);
      return;
    }
    setTapped(true);
    // auto-dismiss after 4s
    tapTimerRef.current = setTimeout(() => setTapped(false), 4000);
  };

  const handleCopy = (e) => {
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
    <Container>
      <TypeOfMessage
        $isNew={isNew}
        $isSelected={isSelected || tapped}
        $isSender={isSender}
        onClick={handleTap}
      >
        {message.audioURL ? (
          <AudioPlayer url={message.audioURL} fallbackDuration={message.audioDuration} />
        ) : message.imageURL ? (
          <MessageImage src={message.imageURL} alt="image" />
        ) : (
          <p>{renderMarkdown(displayText)}</p>
        )}
        {message.isEncoded && (
          <DecryptBtn onClick={(e) => { e.stopPropagation(); setDecrypted((d) => !d); }}>
            {decrypted ? "[ ENCRYPT ]" : "[ DECRYPT ]"}
          </DecryptBtn>
        )}
        <Footer>
          <Timestamp>
            {message.timestamp ? moment(message.timestamp).format("LT") : "..."}
          </Timestamp>
          {isSender && !message.isCommand && (
            <ReadCheck read={isRead}>{isRead ? "✓✓" : "✓"}</ReadCheck>
          )}
        </Footer>
      </TypeOfMessage>

      {tapped && (
        <CopyBar $isSender={isSender}>
          <CopyBtn onClick={handleCopy}>
            {copied ? "✓ copied" : "[ copy ]"}
          </CopyBtn>
        </CopyBar>
      )}
    </Container>
  );
}

export default Message;

const materialize = keyframes`
  0%   { opacity: 0; transform: translateY(6px); filter: brightness(4) blur(1px); }
  25%  { opacity: 1; transform: translateY(0);   filter: brightness(2); }
  40%  { transform: translateX(-2px);             filter: brightness(1.5); }
  55%  { transform: translateX(2px);              filter: brightness(1.5); }
  70%  { transform: translateX(-1px); }
  85%  { transform: translateX(1px); }
  100% { transform: translateX(0);                filter: brightness(1); }
`;

const Container = styled.div`
  margin-bottom: 2px;
`;

const MessageElement = styled.p`
  width: fit-content;
  padding: 5px 15px;
  border-radius: 8px;
  min-width: 60px;
  max-width: 800px;

  @media (max-width: 600px) {
    max-width: calc(100vw - 32px);
  }
  position: relative;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: box-shadow 0.15s, filter 0.15s;

  ${({ $isNew }) => $isNew && css`animation: ${materialize} 0.55s ease;`}

  ${({ $isSelected }) => $isSelected && css`
    box-shadow: 0 0 0 1px #ffaa00, 0 0 10px rgba(255, 170, 0, 0.2);
    filter: brightness(1.15);
  `}

  > p {
    word-break: break-word;
    overflow-wrap: break-word;
    margin: 0;

    strong {
      font-weight: 900;
      color: #ffffff;
      text-shadow: 0 0 6px rgba(255, 255, 255, 0.4);
    }
  }
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
`;

const Timestamp = styled.span`
  font-size: 0.7em;
`;

const ReadCheck = styled.span`
  font-size: 0.7em;
  color: ${({ read }) => (read ? "#00ff41" : "#1a5a1a")};
`;

const MessageImage = styled.img`
  max-width: 260px;
  max-height: 320px;
  border-radius: 4px;
  display: block;
`;

const DecryptBtn = styled.button`
  display: block;
  margin: 4px 0 2px;
  background: transparent;
  border: 1px solid #1a4a1a;
  color: #1a9a1a;
  font-family: 'Share Tech Mono', 'Courier New', monospace;
  font-size: 0.7em;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 2px;
  transition: color 0.15s, border-color 0.15s;

  &:hover {
    color: #00ff41;
    border-color: #00ff41;
  }
`;

const CopyBar = styled.div`
  display: flex;
  justify-content: ${({ $isSender }) => $isSender ? "flex-end" : "flex-start"};
  margin: 2px 0 4px;
`;

const CopyBtn = styled.button`
  background: transparent;
  border: 1px solid #1a4a1a;
  color: #1a7a1a;
  font-family: 'Share Tech Mono', 'Courier New', monospace;
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 2px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;

  &:hover, &:active {
    color: #00ff41;
    border-color: #00ff41;
  }
`;

const Sender = styled(MessageElement)`
  margin-left: auto;
  background-color: #0a2a0a;
  color: #00ff41;
  border: 1px solid #1a5a1a;
  text-align: left;
`;

const Reciever = styled(MessageElement)`
  background-color: #050f05;
  color: #00cc33;
  border: 1px solid #0f2a0f;
  text-align: left;
`;

const InlineCode = styled.code`
  background: #0a1a0a;
  border: 1px solid #1a4a1a;
  border-radius: 3px;
  padding: 0 4px;
  font-family: 'Share Tech Mono', 'Courier New', monospace;
  font-size: 0.9em;
  color: #00ff41;
`;

const CodeBlock = styled.pre`
  background: #050f05;
  border: 1px solid #1a4a1a;
  border-radius: 4px;
  padding: 8px 12px;
  margin: 4px 0;
  font-family: 'Share Tech Mono', 'Courier New', monospace;
  font-size: 0.85em;
  color: #00ff41;
  overflow-x: auto;
  white-space: pre;
  word-break: normal;
`;

const CommandMsg = styled(MessageElement)`
  margin: 4px auto;
  background: transparent;
  color: #1a7a1a;
  border: 1px dashed #1a4a1a;
  font-family: 'Share Tech Mono', 'Courier New', monospace;
  font-size: 0.88em;
  text-align: center;
`;

const AudioContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  min-width: 200px;
`;

const PlayBtn = styled.button`
  background: transparent;
  border: 1px solid #1a5a1a;
  color: #00ff41;
  font-size: 12px;
  width: 28px;
  height: 28px;
  cursor: pointer;
  border-radius: 2px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover { background: #0a2a0a; }
`;

const ProgressWrap = styled.div`
  flex: 1;
  height: 3px;
  background: #1a3a1a;
  border-radius: 2px;
  overflow: hidden;
`;

const ProgressFill = styled.div`
  height: 100%;
  background: #00ff41;
  transition: width 0.1s linear;
`;

const AudioTime = styled.span`
  font-family: 'Share Tech Mono', 'Courier New', monospace;
  font-size: 10px;
  color: #1a7a1a;
  white-space: nowrap;
  flex-shrink: 0;
`;
