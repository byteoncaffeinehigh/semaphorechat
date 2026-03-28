import { useEffect, useRef, useState, useCallback } from "react";
import { apiPost, apiPut, apiGet } from "../utils/api";
import { useWSListener } from "../utils/WSContext";
import styles from "./CallModal.module.css";
import IconButton from "@mui/material/IconButton";
import CallEndIcon from "@mui/icons-material/CallEnd";
import MicOffIcon from "@mui/icons-material/MicOff";
import MicIcon from "@mui/icons-material/Mic";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import VideocamIcon from "@mui/icons-material/Videocam";
import { User } from "../utils/AuthContext";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

interface CallData {
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  status?: string;
  caller?: string;
  callee?: string;
}

interface CallUpdateData {
  chatId: string;
  call: CallData;
}

interface CallCandidateData {
  chatId: string;
  side: string;
  candidate: RTCIceCandidateInit;
}

interface CallModalProps {
  chatId: string;
  user: User;
  recipientEmail: string;
  mode: "caller" | "callee" | null;
  onClose: () => void;
}

export default function CallModal({ chatId, user, recipientEmail, mode, onClose }: CallModalProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const [status, setStatus] = useState(mode === "caller" ? "calling" : "connecting");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const getStream = async (): Promise<MediaStream> => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.muted = true;
      localVideoRef.current.play().catch(() => {});
    }
    return stream;
  };

  const buildPC = (stream: MediaStream): RTCPeerConnection => {
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

  useWSListener("call_update", async (raw) => {
    const { chatId: cid, call } = raw as CallUpdateData;
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
        // flush WS-buffered candidates
        for (const c of pendingCandidatesRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
        pendingCandidatesRef.current = [];
        // also fetch any answer-side candidates stored before we processed the answer
        const stored = await apiGet<{ candidate: RTCIceCandidateInit }[]>(
          `/api/calls/${chatId}/candidates?side=answer`
        ).catch(() => [] as { candidate: RTCIceCandidateInit }[]);
        for (const { candidate } of stored) {
          await pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        }
      } catch {}
    }
  }, [chatId, cleanup, onClose]);

  useWSListener("call_candidate", async (raw) => {
    const { chatId: cid, side, candidate } = raw as CallCandidateData;
    if (cid !== chatId) return;
    const expectedSide = mode === "caller" ? "answer" : "offer";
    if (side !== expectedSide) return;
    if (pcRef.current?.currentRemoteDescription) {
      try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    } else {
      pendingCandidatesRef.current.push(candidate);
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
          const callData = await apiGet<CallData>(`/api/calls/${chatId}`).catch(() => null);
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

          // fetch any ICE candidates the caller already sent before we joined
          const stored = await apiGet<{ candidate: RTCIceCandidateInit }[]>(
            `/api/calls/${chatId}/candidates?side=offer`
          ).catch(() => [] as { candidate: RTCIceCandidateInit }[]);
          for (const { candidate } of stored) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await apiPut(`/api/calls/${chatId}`, {
            status: "active",
            answer: { type: answer.type, sdp: answer.sdp },
          });
          setStatus("active");
        }
      } catch (err) {
        const e = err as Error & { name?: string };
        const msg = e.name === "NotAllowedError"
          ? "Camera/mic access denied"
          : e.message || "Connection failed";
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
  const statusBarClass = `${styles.statusBar} ${status === "active" ? styles.statusBarActive : styles.statusBarInactive}`;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={statusBarClass}>
          {error
            ? `⚠ ${error}`
            : status === "calling"    ? `▶ CALLING ${label}...`
            : status === "connecting" ? "◌ CONNECTING..."
            : `◈ CONNECTED — ${label}`}
        </div>

        <div className={styles.videoArea}>
          <video ref={remoteVideoRef} className={styles.remoteVideo} autoPlay playsInline />
          {status !== "active" && !error && (
            <div className={styles.waitingText}>AWAITING SIGNAL...</div>
          )}
          <video ref={localVideoRef} className={styles.localVideo} autoPlay playsInline muted />
        </div>

        <div className={styles.controls}>
          <IconButton onClick={toggleMute} style={{ color: isMuted ? "#ff4141" : "#00ff41" }}>
            {isMuted ? <MicOffIcon /> : <MicIcon />}
          </IconButton>
          <IconButton className={styles.endButton} onClick={hangUp}>
            <CallEndIcon />
          </IconButton>
          <IconButton onClick={toggleCamera} style={{ color: isCameraOff ? "#ff4141" : "#00ff41" }}>
            {isCameraOff ? <VideocamOffIcon /> : <VideocamIcon />}
          </IconButton>
        </div>
      </div>
    </div>
  );
}
