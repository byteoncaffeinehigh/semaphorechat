import { useEffect, useRef, useState, useCallback } from "react";
import { apiPost, apiPut, apiGet } from "../utils/api";
import { useWSListener } from "../utils/WSContext";
import styled from "styled-components";
import IconButton from "@mui/material/IconButton";
import CallEndIcon from "@mui/icons-material/CallEnd";
import MicOffIcon from "@mui/icons-material/MicOff";
import MicIcon from "@mui/icons-material/Mic";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import VideocamIcon from "@mui/icons-material/Videocam";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function CallModal({ chatId, user, recipientEmail, mode, onClose }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);

  const [status, setStatus] = useState(mode === "caller" ? "calling" : "connecting");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [error, setError] = useState(null);

  const cleanup = useCallback(async (markEnded = true) => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (markEnded) {
      await apiPut(`/api/calls/${chatId}`, { status: "ended" }).catch(() => {});
    }
  }, [chatId]);

  const hangUp = useCallback(async () => {
    await cleanup(true);
    onClose();
  }, [cleanup, onClose]);

  const getStream = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.muted = true;
      localVideoRef.current.play().catch(() => {});
    }
    return stream;
  };

  const buildPC = (stream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
        remoteVideoRef.current.play().catch(() => {});
      }
    };
    return pc;
  };

  // ── WS: listen for call updates and ICE candidates ─────────────────────
  useWSListener("call_update", async ({ chatId: cid, call }) => {
    if (cid !== chatId) return;
    if (call.status === "ended" || call.status === "declined") {
      await cleanup(false);
      onClose();
      return;
    }
    if (call.answer && pcRef.current && !pcRef.current.currentRemoteDescription) {
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(call.answer));
        setStatus("active");
      } catch {}
    }
  }, [chatId, cleanup, onClose]);

  useWSListener("call_candidate", async ({ chatId: cid, side, candidate }) => {
    if (cid !== chatId) return;
    // caller receives "answer" candidates; callee receives "offer" candidates
    const expectedSide = mode === "caller" ? "answer" : "offer";
    if (side !== expectedSide) return;
    if (pcRef.current) {
      try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    }
  }, [chatId, mode]);

  useEffect(() => {
    const run = async () => {
      try {
        if (mode === "caller") {
          const stream = await getStream();
          const pc = buildPC(stream);

          pc.onicecandidate = (e) => {
            if (e.candidate) {
              apiPost(`/api/calls/${chatId}/candidates`, {
                side: "offer",
                candidate: e.candidate.toJSON(),
              }).catch(() => {});
            }
          };

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          await apiPost(`/api/calls/${chatId}`, {
            calleeEmail: recipientEmail,
            offer: { type: offer.type, sdp: offer.sdp },
          });

          const callerName = (user.displayName || user.email.split("@")[0]).toUpperCase();
          apiPost("/api/notify", {
            recipientEmail,
            senderName: "📞 INCOMING CALL",
            message: `from ${callerName}`,
            link: `/chat/${chatId}`,
            isCall: true,
          }).catch(() => {});
        } else {
          // callee
          const callData = await apiGet(`/api/calls/${chatId}`).catch(() => null);
          if (!callData?.offer) { onClose(); return; }

          const stream = await getStream();
          const pc = buildPC(stream);

          pc.onicecandidate = (e) => {
            if (e.candidate) {
              apiPost(`/api/calls/${chatId}/candidates`, {
                side: "answer",
                candidate: e.candidate.toJSON(),
              }).catch(() => {});
            }
          };

          await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await apiPut(`/api/calls/${chatId}`, {
            status: "active",
            answer: { type: answer.type, sdp: answer.sdp },
          });
          setStatus("active");
        }
      } catch (err) {
        const msg = err.name === "NotAllowedError"
          ? "Camera/mic access denied"
          : err.message || "Connection failed";
        setError(msg);
      }
    };

    run();
    return () => { cleanup(false); };
  }, []);

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = isMuted; setIsMuted(!isMuted); }
  };

  const toggleCamera = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = isCameraOff; setIsCameraOff(!isCameraOff); }
  };

  const label = (recipientEmail?.split("@")[0] || recipientEmail || "").toUpperCase();

  return (
    <Overlay>
      <Modal>
        <StatusBar $active={status === "active"}>
          {error
            ? `⚠ ${error}`
            : status === "calling"   ? `▶ CALLING ${label}...`
            : status === "connecting" ? "◌ CONNECTING..."
            : `◈ CONNECTED — ${label}`}
        </StatusBar>

        <VideoArea>
          <RemoteVideo ref={remoteVideoRef} autoPlay playsInline />
          {status !== "active" && !error && <WaitingText>AWAITING SIGNAL...</WaitingText>}
          <LocalVideo ref={localVideoRef} autoPlay playsInline muted />
        </VideoArea>

        <Controls>
          <IconButton onClick={toggleMute} style={{ color: isMuted ? "#ff4141" : "#00ff41" }}>
            {isMuted ? <MicOffIcon /> : <MicIcon />}
          </IconButton>
          <EndButton onClick={hangUp}>
            <CallEndIcon />
          </EndButton>
          <IconButton onClick={toggleCamera} style={{ color: isCameraOff ? "#ff4141" : "#00ff41" }}>
            {isCameraOff ? <VideocamOffIcon /> : <VideocamIcon />}
          </IconButton>
        </Controls>
      </Modal>
    </Overlay>
  );
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const Modal = styled.div`
  width: 100%;
  max-width: 900px;
  height: 100%;
  max-height: 600px;
  background: #070d07;
  border: 1px solid #1a3a1a;
  display: flex;
  flex-direction: column;
  font-family: 'Share Tech Mono', 'Courier New', monospace;
  @media (max-width: 600px) { max-height: 100%; border: none; }
`;

const StatusBar = styled.div`
  padding: 8px 16px;
  font-size: 13px;
  color: ${({ $active }) => ($active ? "#00ff41" : "#1a7a1a")};
  background: #0d150d;
  border-bottom: 1px solid #1a3a1a;
  letter-spacing: 0.05em;
`;

const VideoArea = styled.div`
  flex: 1;
  position: relative;
  background: #000;
  overflow: hidden;
`;

const RemoteVideo = styled.video`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const LocalVideo = styled.video`
  position: absolute;
  bottom: 12px;
  right: 12px;
  width: 140px;
  height: 90px;
  object-fit: cover;
  border: 1px solid #1a3a1a;
  background: #0d150d;
  @media (max-width: 600px) { width: 100px; height: 65px; }
`;

const WaitingText = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1a4a1a;
  font-family: 'Share Tech Mono', 'Courier New', monospace;
  font-size: 14px;
  letter-spacing: 0.1em;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 14px;
  background: #0d150d;
  border-top: 1px solid #1a3a1a;
`;

const EndButton = styled(IconButton)`
  && {
    background: #3a0a0a;
    color: #ff4141;
    border: 1px solid #5a1a1a;
    border-radius: 50%;
    padding: 10px;
    &:hover { background: #5a1010; }
  }
`;
