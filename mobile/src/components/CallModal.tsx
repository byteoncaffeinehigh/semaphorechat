import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
} from 'react-native';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  RTCView,
  MediaStream,
} from 'react-native-webrtc';
import { apiPost, apiPut, apiGet } from '../api';
import { useWSListener } from '../contexts/WSContext';
import { colors, fontSize } from '../theme';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface CallData {
  offer?: { type: string; sdp: string };
  answer?: { type: string; sdp: string };
  status?: string;
}

interface CallUpdateData { chatId: string; call: CallData; }
interface CallCandidateData { chatId: string; side: string; candidate: RTCIceCandidateInit; }

interface Props {
  chatId: string;
  userEmail: string;
  recipientEmail: string;
  mode: 'caller' | 'callee';
  onClose: () => void;
}

export default function CallModal({ chatId, userEmail, recipientEmail, mode, onClose }: Props) {
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState(mode === 'caller' ? 'calling' : 'connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanup = useCallback(async (markEnded = true) => {
    localStreamRef.current?.getTracks().forEach((t: any) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    pcRef.current?.close();
    pcRef.current = null;
    if (markEnded) {
      await apiPut(`/api/calls/${chatId}`, { status: 'ended' }).catch(() => {});
    }
  }, [chatId]);

  const hangUp = useCallback(async () => {
    await cleanup(true);
    onClose();
  }, [cleanup, onClose]);

  const getStream = async (): Promise<MediaStream> => {
    const stream = await mediaDevices.getUserMedia({ video: true, audio: true }) as MediaStream;
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  };

  const buildPC = (stream: MediaStream): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));
    pc.ontrack = (e: any) => {
      if (e.streams && e.streams[0]) setRemoteStream(e.streams[0]);
    };
    return pc;
  };

  useWSListener('call_update', async (raw) => {
    const { chatId: cid, call } = raw as CallUpdateData;
    if (cid !== chatId) return;
    if (call.status === 'ended' || call.status === 'declined') {
      await cleanup(false);
      onClose();
      return;
    }
    if (call.answer && pcRef.current && !pcRef.current.remoteDescription) {
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(call.answer as any));
        setStatus('active');
        for (const c of pendingCandidatesRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
        pendingCandidatesRef.current = [];
        const stored = await apiGet<{ candidate: RTCIceCandidateInit }[]>(
          `/api/calls/${chatId}/candidates?side=answer`
        ).catch(() => [] as { candidate: RTCIceCandidateInit }[]);
        for (const { candidate } of stored) {
          await pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        }
      } catch {}
    }
  }, [chatId, cleanup, onClose]);

  useWSListener('call_candidate', async (raw) => {
    const { chatId: cid, side, candidate } = raw as CallCandidateData;
    if (cid !== chatId) return;
    const expectedSide = mode === 'caller' ? 'answer' : 'offer';
    if (side !== expectedSide) return;
    if (pcRef.current?.remoteDescription) {
      await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    } else {
      pendingCandidatesRef.current.push(candidate);
    }
  }, [chatId, mode]);

  useEffect(() => {
    const run = async () => {
      try {
        if (mode === 'caller') {
          const stream = await getStream();
          const pc = buildPC(stream);
          pc.onicecandidate = (e: any) => {
            if (e.candidate) {
              apiPost(`/api/calls/${chatId}/candidates`, { side: 'offer', candidate: e.candidate.toJSON() }).catch(() => {});
            }
          };
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
          await pc.setLocalDescription(offer as any);
          await apiPost(`/api/calls/${chatId}`, {
            calleeEmail: recipientEmail,
            offer: { type: offer.type, sdp: offer.sdp },
          });
          apiPost('/api/notify', {
            recipientEmail,
            senderName: '📞 INCOMING CALL',
            message: `from ${userEmail.split('@')[0].toUpperCase()}`,
            isCall: true,
          }).catch(() => {});
        } else {
          const callData = await apiGet<CallData>(`/api/calls/${chatId}`).catch(() => null);
          if (!callData?.offer) { onClose(); return; }
          const stream = await getStream();
          const pc = buildPC(stream);
          pc.onicecandidate = (e: any) => {
            if (e.candidate) {
              apiPost(`/api/calls/${chatId}/candidates`, { side: 'answer', candidate: e.candidate.toJSON() }).catch(() => {});
            }
          };
          await pc.setRemoteDescription(new RTCSessionDescription(callData.offer as any));
          const stored = await apiGet<{ candidate: RTCIceCandidateInit }[]>(
            `/api/calls/${chatId}/candidates?side=offer`
          ).catch(() => [] as { candidate: RTCIceCandidateInit }[]);
          for (const { candidate } of stored) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer as any);
          await apiPut(`/api/calls/${chatId}`, {
            status: 'active',
            answer: { type: answer.type, sdp: answer.sdp },
          });
          setStatus('active');
        }
      } catch (err) {
        const e = err as Error & { name?: string };
        setError(e.name === 'NotAllowedError' ? 'Camera/mic access denied' : e.message || 'Connection failed');
      }
    };
    run();
    return () => { cleanup(false); };
  }, []);

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { (track as any).enabled = isMuted; setIsMuted(!isMuted); }
  };

  const toggleCamera = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) { (track as any).enabled = isCameraOff; setIsCameraOff(!isCameraOff); }
  };

  const recipientName = recipientEmail.split('@')[0];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Remote video (full screen) */}
      {remoteStream ? (
        <RTCView streamURL={(remoteStream as any).toURL()} style={styles.remoteVideo} objectFit="cover" />
      ) : (
        <View style={styles.waiting}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{recipientName[0]?.toUpperCase()}</Text>
          </View>
          <Text style={styles.recipientName}>{recipientName}</Text>
          <Text style={styles.statusText}>
            {error ? `⚠ ${error}` : status === 'calling' ? 'Calling...' : status === 'connecting' ? 'Connecting...' : 'Connected'}
          </Text>
        </View>
      )}

      {/* Local video (PiP) */}
      {localStream && (
        <RTCView
          streamURL={(localStream as any).toURL()}
          style={styles.localVideo}
          objectFit="cover"
          mirror
        />
      )}

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={[styles.controlBtn, isMuted && styles.controlBtnActive]} onPress={toggleMute}>
          <Text style={styles.controlIcon}>{isMuted ? '🔇' : '🎙'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.endBtn} onPress={hangUp}>
          <Text style={styles.endIcon}>📵</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.controlBtn, isCameraOff && styles.controlBtnActive]} onPress={toggleCamera}>
          <Text style={styles.controlIcon}>{isCameraOff ? '📷' : '📹'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', zIndex: 999 },
  remoteVideo: { flex: 1 },
  waiting: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  avatar: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 36, color: '#fff', fontWeight: '600' },
  recipientName: { fontSize: fontSize.xl, color: '#fff', fontWeight: '600' },
  statusText: { fontSize: fontSize.md, color: 'rgba(255,255,255,0.6)' },
  localVideo: {
    position: 'absolute', top: 60, right: 16,
    width: 100, height: 150, borderRadius: 12,
    overflow: 'hidden',
  },
  controls: {
    position: 'absolute', bottom: 60,
    left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 28,
  },
  controlBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  controlBtnActive: { backgroundColor: 'rgba(255,255,255,0.35)' },
  controlIcon: { fontSize: 26 },
  endBtn: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: colors.red,
    justifyContent: 'center', alignItems: 'center',
  },
  endIcon: { fontSize: 28 },
});
