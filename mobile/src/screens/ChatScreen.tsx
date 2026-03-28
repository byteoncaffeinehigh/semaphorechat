import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
// @ts-ignore
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import { useAuth } from '../contexts/AuthContext';
import { useWS, useWSListener } from '../contexts/WSContext';
import { apiGet, apiPost, apiPut } from '../api';
import Message, { MessageData } from '../components/Message';
import CallModal from '../components/CallModal';
import { colors, fontSize } from '../theme';
import { RootStackParamList } from '../navigation/AppNavigator';

// ─── Slash commands ───────────────────────────────────────────────────────────

const rot13 = (s: string): string =>
  s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });

const safeCalc = (expr: string): number | null => {
  try {
    const sanitized = expr.replace(/\^/g, '**').replace(/[^0-9+\-*/.()%\s]/g, '').trim();
    if (!sanitized) return null;
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + sanitized + ')')() as number;
    if (typeof result !== 'number' || !isFinite(result)) return null;
    return Number.isInteger(result) ? result : parseFloat(result.toFixed(6));
  } catch { return null; }
};

function handleSlashCommand(cmd: string): { message: string; isEncoded?: boolean } | null {
  const parts = cmd.trim().slice(1).split(/\s+/);
  const command = parts[0].toLowerCase();
  const rest = parts.slice(1).join(' ');
  if (command === 'roll') { const n = Math.floor(Math.random() * 6) + 1; return { message: `🎲 Roll: ${n}` }; }
  if (command === 'flip') return { message: `🪙 Flip: ${Math.random() < 0.5 ? 'Heads' : 'Tails'}` };
  if (command === 'encode') { if (!rest) return null; return { message: rot13(rest), isEncoded: true }; }
  if (command === 'calc') { if (!rest) return null; const r = safeCalc(rest); return r !== null ? { message: `${rest} = ${r}` } : null; }
  return null;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface TypingData { chatId: string; userEmail: string; wpm: number; active: boolean; ts: number; }
interface PresenceData { userEmail: string; isOnline: boolean; lastSeen?: string; }
interface RecipientInfo { email?: string; displayName?: string; isOnline?: boolean; lastSeen?: string; }

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

// ─── Component ───────────────────────────────────────────────────────────────

export default function ChatScreen({ route, navigation }: Props) {
  const { chatId, recipientEmail, recipientName } = route.params;
  const { user } = useAuth();
  const { send: wsSend } = useWS();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<MessageData[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [input, setInput] = useState('');
  const [txCount, setTxCount] = useState(0);
  const [newMsgIds, setNewMsgIds] = useState(new Set<string>());
  const [recipientLastRead, setRecipientLastRead] = useState(0);
  const [recipientInfo, setRecipientInfo] = useState<RecipientInfo | null>(null);
  const [recipientTyping, setRecipientTyping] = useState<TypingData | null>(null);

  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const recRef = useRef<Audio.Recording | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [showCall, setShowCall] = useState(false);
  const [callMode, setCallMode] = useState<'caller' | 'callee' | null>(null);
  const [incomingCall, setIncomingCall] = useState(false);

  const keystrokeTimes = useRef<number[]>([]);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    Promise.all([
      apiGet<MessageData[]>(`/api/chats/${chatId}/messages`),
      apiGet<RecipientInfo>(`/api/users?email=${encodeURIComponent(recipientEmail)}`),
    ]).then(([msgs, rec]) => {
      setMessages(msgs || []);
      if (rec) setRecipientInfo(rec);
    }).catch(() => {}).finally(() => setLoadingMsgs(false));
    apiPut(`/api/chats/${chatId}/read`, {}).catch(() => {});
    return () => { wsSend('typing', { chatId, wpm: 0, active: false }); };
  }, [chatId]);

  useWSListener('new_message', (data) => {
    const d = data as { chatId: string; message: MessageData };
    if (d.chatId !== chatId) return;
    setMessages((prev) => {
      if (prev.find((m) => m.id === d.message.id)) return prev;
      return [...prev, d.message];
    });
    if (d.message.user !== user?.email) apiPut(`/api/chats/${chatId}/read`, {}).catch(() => {});
    setNewMsgIds((prev) => {
      const next = new Set(prev);
      next.add(d.message.id);
      setTimeout(() => setNewMsgIds((p) => { const n2 = new Set(p); n2.delete(d.message.id); return n2; }), 800);
      return next;
    });
  }, [chatId, user?.email]);

  useWSListener('typing', (data) => {
    const d = data as TypingData;
    if (d.chatId !== chatId || d.userEmail === user?.email) return;
    setRecipientTyping({ ...d });
  }, [chatId, user?.email]);

  useWSListener('presence', (data) => {
    const { userEmail, isOnline, lastSeen } = data as PresenceData;
    if (userEmail !== recipientEmail) return;
    setRecipientInfo((r) => r ? { ...r, isOnline, lastSeen } : r);
  }, [recipientEmail]);

  useWSListener('chat_update', (data) => {
    const d = data as { chat: { id: string; lastRead?: Record<string, string> } };
    if (d.chat.id !== chatId) return;
    const lr = d.chat.lastRead?.[recipientEmail];
    if (lr) setRecipientLastRead(new Date(lr).getTime());
  }, [chatId, recipientEmail]);

  useWSListener('call_update', (data) => {
    const d = data as { chatId: string; call: { status?: string } };
    if (d.chatId !== chatId) return;
    if (d.call.status === 'calling' && !showCall) setIncomingCall(true);
    if (d.call.status === 'ended' || d.call.status === 'declined') {
      setIncomingCall(false);
      setShowCall(false);
      setCallMode(null);
    }
  }, [chatId, showCall]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const sendTypingWS = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < 1200) return;
    lastTypingSent.current = now;
    const recent = keystrokeTimes.current.filter((t) => now - t < 10000);
    wsSend('typing', { chatId, wpm: Math.round((recent.length / 5) * 6), active: true });
  }, [chatId, wsSend]);

  const handleInputChange = (text: string) => {
    setInput(text);
    const now = Date.now();
    keystrokeTimes.current.push(now);
    keystrokeTimes.current = keystrokeTimes.current.filter((t) => now - t < 30000);
    sendTypingWS();
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => wsSend('typing', { chatId, wpm: 0, active: false }), 2500);
  };

  const sendMessage = () => {
    if (!input.trim()) return;
    let messageText = input.trim();
    let isCommand = false;
    let isEncoded = false;
    if (messageText.startsWith('/')) {
      const result = handleSlashCommand(messageText);
      if (result) { messageText = result.message; isCommand = true; isEncoded = result.isEncoded || false; }
    }
    apiPost(`/api/chats/${chatId}/messages`, { message: messageText, isCommand, isEncoded }).catch(() => {});
    if (!isCommand) {
      const senderName = user?.displayName || user?.email?.split('@')[0];
      apiPost('/api/notify', { recipientEmail, senderName, message: messageText }).catch(() => {});
    }
    setTxCount((c) => c + 1);
    setInput('');
  };

  const sendPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission denied'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7, base64: true });
    if (result.canceled || !result.assets[0]) return;
    const imageURL = `data:image/jpeg;base64,${result.assets[0].base64}`;
    apiPost(`/api/chats/${chatId}/messages`, { imageURL }).catch(() => {});
    const senderName = user?.displayName || user?.email?.split('@')[0];
    apiPost('/api/notify', { recipientEmail, senderName, message: '🖼 Photo' }).catch(() => {});
  };

  const sendFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.size && asset.size > 25 * 1024 * 1024) { Alert.alert('Too large', 'Max 25 MB'); return; }
    setUploading(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      await apiPost(`/api/chats/${chatId}/messages`, { fileData: base64, fileName: asset.name, fileType: asset.mimeType || 'application/octet-stream', fileSize: asset.size });
      const senderName = user?.displayName || user?.email?.split('@')[0];
      apiPost('/api/notify', { recipientEmail, senderName, message: `📎 ${asset.name}` }).catch(() => {});
    } catch { Alert.alert('Error', 'Failed to send file'); }
    setUploading(false);
  };

  const startRecording = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission denied'); return; }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    recRef.current = recording;
    setRecording(true); setRecSeconds(0);
    recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
  };

  const cancelRecording = async () => {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    await recRef.current?.stopAndUnloadAsync().catch(() => {});
    recRef.current = null;
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
    setRecording(false); setRecSeconds(0);
  };

  const sendVoiceMessage = async () => {
    if (!recRef.current) return;
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    const duration = recSeconds;
    setUploading(true);
    try {
      await recRef.current.stopAndUnloadAsync();
      const uri = recRef.current.getURI();
      recRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      if (!uri) return;
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        if (!reader.result) return;
        apiPost(`/api/chats/${chatId}/messages`, { audioURL: reader.result, audioDuration: duration }).catch(() => {});
        const senderName = user?.displayName || user?.email?.split('@')[0];
        apiPost('/api/notify', { recipientEmail, senderName, message: '🎤 Voice message' }).catch(() => {});
        setTxCount((c) => c + 1);
      };
      reader.readAsDataURL(blob);
    } catch {}
    setRecording(false); setRecSeconds(0); setUploading(false);
  };

  const isTyping = recipientTyping?.active && recipientTyping.ts && Date.now() - recipientTyping.ts < 4000;
  const fmtRec = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const displayName = recipientInfo?.displayName || recipientName;
  const onlineStatus = recipientInfo?.isOnline ? 'Online'
    : recipientInfo?.lastSeen ? `Last seen ${new Date(recipientInfo.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{recipientEmail[0]?.toUpperCase()}</Text>
            {recipientInfo?.isOnline && <View style={styles.headerOnlineDot} />}
          </View>
          <View>
            <Text style={styles.headerName} numberOfLines={1}>{displayName}</Text>
            {isTyping ? (
              <Text style={styles.headerSub}>typing...</Text>
            ) : onlineStatus ? (
              <Text style={styles.headerSub}>{onlineStatus}</Text>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          style={styles.callBtn}
          onPress={() => { setCallMode('caller'); setShowCall(true); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.callBtnIcon}>📹</Text>
        </TouchableOpacity>
      </View>

      {/* Incoming call banner */}
      {incomingCall && !showCall && (
        <View style={styles.incomingBanner}>
          <View style={styles.incomingInfo}>
            <Text style={styles.incomingIcon}>📞</Text>
            <View>
              <Text style={styles.incomingTitle}>Incoming Video Call</Text>
              <Text style={styles.incomingFrom}>{displayName}</Text>
            </View>
          </View>
          <View style={styles.incomingBtns}>
            <TouchableOpacity
              style={styles.declineBtn}
              onPress={() => {
                setIncomingCall(false);
                apiPut(`/api/calls/${chatId}`, { status: 'declined' }).catch(() => {});
              }}
            >
              <Text style={styles.declineBtnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={() => { setIncomingCall(false); setCallMode('callee'); setShowCall(true); }}
            >
              <Text style={styles.acceptBtnText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Messages */}
      {loadingMsgs ? (
        <ActivityIndicator color={colors.primary} style={{ flex: 1 }} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item }) => {
            const ts = item.timestamp ? new Date(item.timestamp as string).getTime() : 0;
            return (
              <Message
                message={{ ...item, timestamp: ts }}
                isMine={item.user === user?.email}
                isRead={!!(ts && recipientLastRead >= ts)}
                isNew={newMsgIds.has(item.id)}
              />
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No messages yet.{'\n'}Say hello 👋</Text>
          }
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Input */}
      <View style={[styles.inputArea, { paddingBottom: insets.bottom + 6 }]}>
        {recording ? (
          <View style={styles.recordRow}>
            <View style={styles.recIndicatorWrap}>
              <View style={styles.recDot} />
              <Text style={styles.recTimer}>{fmtRec(recSeconds)}</Text>
            </View>
            <TouchableOpacity onPress={cancelRecording} style={styles.recCancelBtn}>
              <Text style={styles.recCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={sendVoiceMessage} disabled={uploading} style={styles.recSendBtn}>
              {uploading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.recSendText}>Send</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.inputRow}>
            <TouchableOpacity onPress={sendPhoto} style={styles.attachBtn}>
              <Text style={styles.attachIcon}>🖼</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={sendFile} disabled={uploading} style={styles.attachBtn}>
              {uploading ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={styles.attachIcon}>📎</Text>}
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={handleInputChange}
              multiline
              maxLength={4000}
              placeholderTextColor={colors.textTertiary}
              placeholder="Message"
              selectionColor={colors.primary}
            />
            {input.trim() ? (
              <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
                <Text style={styles.sendIcon}>↑</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={startRecording} style={styles.attachBtn}>
                <Text style={styles.attachIcon}>🎤</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Call screen */}
      {showCall && callMode && (
        <CallModal
          chatId={chatId}
          userEmail={user?.email || ''}
          recipientEmail={recipientEmail}
          mode={callMode}
          onClose={() => { setShowCall(false); setCallMode(null); }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    gap: 8,
  },
  backBtn: { paddingRight: 4 },
  backText: { fontSize: 32, color: colors.primary, lineHeight: 36 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    position: 'relative',
  },
  headerAvatarText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  headerOnlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: colors.green, borderWidth: 2, borderColor: colors.bg,
  },
  headerName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  headerSub: { fontSize: fontSize.xs, color: colors.primary },
  callBtn: { padding: 4 },
  callBtnIcon: { fontSize: 22 },

  // Incoming call
  incomingBanner: {
    backgroundColor: colors.bgElevated,
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  incomingInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  incomingIcon: { fontSize: 28 },
  incomingTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  incomingFrom: { fontSize: fontSize.xs, color: colors.textSecondary },
  incomingBtns: { flexDirection: 'row', gap: 8 },
  declineBtn: { backgroundColor: colors.red, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  declineBtnText: { color: '#fff', fontWeight: '600', fontSize: fontSize.sm },
  acceptBtn: { backgroundColor: colors.green, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  acceptBtnText: { color: '#fff', fontWeight: '600', fontSize: fontSize.sm },

  // Messages
  messageList: { paddingVertical: 8 },
  emptyText: {
    fontSize: fontSize.md, color: colors.textSecondary,
    textAlign: 'center', marginTop: 60, lineHeight: 24,
  },

  // Input
  inputArea: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    backgroundColor: colors.bg,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  attachBtn: { width: 34, height: 34, justifyContent: 'center', alignItems: 'center' },
  attachIcon: { fontSize: 20 },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.bgElevated,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 120,
  },
  sendBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  sendIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },

  // Recording
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  recIndicatorWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
  recTimer: { fontSize: fontSize.md, color: colors.text },
  recCancelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.bgCard },
  recCancelText: { fontSize: fontSize.sm, color: colors.text },
  recSendBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.primary },
  recSendText: { fontSize: fontSize.sm, color: '#fff', fontWeight: '600' },
});
