import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { useAuth } from '../contexts/AuthContext';
import { useWS, useWSListener } from '../contexts/WSContext';
import { apiGet, apiPost, apiPut } from '../api';
import Message, { MessageData } from '../components/Message';
import ConnectionStats from '../components/ConnectionStats';
import { colors, fonts, fontSize } from '../theme';
import { RootStackParamList } from '../navigation/AppNavigator';

// ─── Slash command helpers ───────────────────────────────────────────────────

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

const CITY_TZ: Record<string, string> = {
  moscow: 'Europe/Moscow', london: 'Europe/London',
  'new york': 'America/New_York', nyc: 'America/New_York',
  tokyo: 'Asia/Tokyo', berlin: 'Europe/Berlin', paris: 'Europe/Paris',
  dubai: 'Asia/Dubai', beijing: 'Asia/Shanghai', shanghai: 'Asia/Shanghai',
  sydney: 'Australia/Sydney', la: 'America/Los_Angeles',
  'los angeles': 'America/Los_Angeles', chicago: 'America/Chicago',
  toronto: 'America/Toronto', istanbul: 'Europe/Istanbul',
  seoul: 'Asia/Seoul', singapore: 'Asia/Singapore', utc: 'UTC',
};

function handleSlashCommand(cmd: string): { message: string; isEncoded?: boolean } | null {
  const parts = cmd.trim().slice(1).split(/\s+/);
  const command = parts[0].toLowerCase();
  const rest = parts.slice(1).join(' ');
  const faces = ['⠀', '⚁', '⚂', '⚃', '⚄', '⚅', '⚅'];

  if (command === 'roll') {
    const n = Math.floor(Math.random() * 6) + 1;
    return { message: `🎲 /roll → ${n} ${faces[n]}` };
  }
  if (command === 'flip') return { message: `🪙 /flip → ${Math.random() < 0.5 ? 'HEADS' : 'TAILS'}` };
  if (command === 'ping') {
    const ms = Math.floor(Math.random() * 25) + 4;
    return { message: `◈ PING → ACK [${ms}ms] TTL=64` };
  }
  if (command === 'time') {
    const tz = CITY_TZ[rest.toLowerCase() || 'utc'];
    if (!tz) return { message: `⚠ /time: unknown city "${rest || '?'}"` };
    const time = new Date().toLocaleTimeString('en-GB', { timeZone: tz, hour12: false });
    return { message: `⌚ /time ${rest || 'UTC'} → ${time}` };
  }
  if (command === 'encode') {
    if (!rest) return { message: '⚠ /encode: usage: /encode <text>' };
    return { message: rot13(rest), isEncoded: true };
  }
  if (command === 'calc') {
    if (!rest) return { message: '⚠ /calc: usage: /calc <expression>' };
    const result = safeCalc(rest);
    if (result === null) return { message: `⚠ /calc: invalid expression "${rest}"` };
    return { message: `🖩 ${rest} = ${result}` };
  }
  if (command === 'love') return { message: '❤' };
  return null;
}

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface RecipientInfo {
  email?: string;
  displayName?: string;
  isOnline?: boolean;
  lastSeen?: string;
}

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

// ─── Component ───────────────────────────────────────────────────────────────

export default function ChatScreen({ route, navigation }: Props) {
  const { chatId, recipientEmail, recipientName } = route.params;
  const { user } = useAuth();
  const { send: wsSend } = useWS();

  const [messages, setMessages] = useState<MessageData[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'normal' | 'insert'>('insert');
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

  const uptimeStart = useRef(Date.now()).current;
  const keystrokeTimes = useRef<number[]>([]);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  // Load messages + recipient info
  useEffect(() => {
    Promise.all([
      apiGet<MessageData[]>(`/api/chats/${chatId}/messages`),
      apiGet<RecipientInfo>(`/api/users?email=${encodeURIComponent(recipientEmail)}`),
    ]).then(([msgs, rec]) => {
      setMessages(msgs || []);
      if (rec) setRecipientInfo(rec);
    }).catch(() => {}).finally(() => setLoadingMsgs(false));

    apiPut(`/api/chats/${chatId}/read`, {}).catch(() => {});

    return () => {
      wsSend('typing', { chatId, wpm: 0, active: false });
    };
  }, [chatId]);

  // WebSocket listeners
  useWSListener('new_message', (data) => {
    const d = data as { chatId: string; message: MessageData };
    if (d.chatId !== chatId) return;
    setMessages((prev) => {
      if (prev.find((m) => m.id === d.message.id)) return prev;
      return [...prev, d.message];
    });
    if (d.message.user !== user?.email) {
      apiPut(`/api/chats/${chatId}/read`, {}).catch(() => {});
    }
    // highlight new message
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

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // Typing WS
  const sendTypingWS = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < 1200) return;
    lastTypingSent.current = now;
    const recent = keystrokeTimes.current.filter((t) => now - t < 10000);
    const wpm = Math.round((recent.length / 5) * 6);
    wsSend('typing', { chatId, wpm, active: true });
  }, [chatId, wsSend]);

  const clearTypingWS = useCallback(() => {
    wsSend('typing', { chatId, wpm: 0, active: false });
  }, [chatId, wsSend]);

  const handleInputChange = (text: string) => {
    setInput(text);
    const now = Date.now();
    keystrokeTimes.current.push(now);
    keystrokeTimes.current = keystrokeTimes.current.filter((t) => now - t < 30000);
    sendTypingWS();
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(clearTypingWS, 2500);
  };

  // Send text message
  const sendMessage = () => {
    if (!input.trim()) return;
    let messageText = input.trim();
    let isCommand = false;
    let isEncoded = false;

    if (messageText.startsWith('/')) {
      const result = handleSlashCommand(messageText);
      if (result) {
        messageText = result.message;
        isCommand = true;
        isEncoded = result.isEncoded || false;
      }
    }

    apiPost(`/api/chats/${chatId}/messages`, { message: messageText, isCommand, isEncoded }).catch(() => {});
    if (!isCommand) {
      const senderName = user?.displayName || user?.email?.split('@')[0];
      apiPost('/api/notify', { recipientEmail, senderName, message: messageText }).catch(() => {});
    }
    setTxCount((c) => c + 1);
    setInput('');
  };

  // Send photo
  const sendPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission denied'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const imageURL = `data:image/jpeg;base64,${asset.base64}`;
    apiPost(`/api/chats/${chatId}/messages`, { imageURL }).catch(() => {});
    const senderName = user?.displayName || user?.email?.split('@')[0];
    apiPost('/api/notify', { recipientEmail, senderName, message: '🖼 Photo' }).catch(() => {});
    setTxCount((c) => c + 1);
  };

  // Voice recording
  const startRecording = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission denied'); return; }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    recRef.current = recording;
    setRecording(true);
    setRecSeconds(0);
    recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
  };

  const cancelRecording = async () => {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    await recRef.current?.stopAndUnloadAsync().catch(() => {});
    recRef.current = null;
    setRecording(false);
    setRecSeconds(0);
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
      if (!uri) return;
      // Read file as base64
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        if (!reader.result) return;
        apiPost(`/api/chats/${chatId}/messages`, {
          audioURL: reader.result,
          audioDuration: duration,
        }).catch(() => {});
        const senderName = user?.displayName || user?.email?.split('@')[0];
        apiPost('/api/notify', { recipientEmail, senderName, message: '🎤 Voice message' }).catch(() => {});
        setTxCount((c) => c + 1);
      };
      reader.readAsDataURL(blob);
    } catch {}
    setRecording(false);
    setRecSeconds(0);
    setUploading(false);
  };

  const isTyping = recipientTyping?.active && recipientTyping.ts && Date.now() - recipientTyping.ts < 4000;
  const fmtRec = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const displayName = recipientInfo?.displayName || recipientName;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'←'}</Text>
        </TouchableOpacity>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{recipientEmail[0]?.toUpperCase()}</Text>
          </View>
          {recipientInfo?.isOnline && <View style={styles.onlineDot} />}
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {isTyping
              ? `▶ TRANSMITTING${recipientTyping && recipientTyping.wpm > 0 ? ` [${recipientTyping.wpm} WPM]` : '...'}`
              : recipientInfo?.isOnline ? 'Online'
              : recipientInfo?.lastSeen ? `Last seen: ${new Date(recipientInfo.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Unavailable'
            }
          </Text>
        </View>
      </View>

      {/* Messages */}
      {loadingMsgs ? (
        <ActivityIndicator color={colors.amber} style={{ flex: 1 }} />
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
            <Text style={styles.emptyText}>{'> Channel open. Send a message.'}</Text>
          }
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Stats bar */}
      <ConnectionStats
        mode={mode}
        msgCount={messages.length}
        txCount={txCount}
        uptimeStart={uptimeStart}
      />

      {/* Input area */}
      <View style={styles.inputArea}>
        {recording ? (
          <View style={styles.recordRow}>
            <Text style={styles.recIndicator}>● REC {fmtRec(recSeconds)}</Text>
            <TouchableOpacity onPress={cancelRecording} style={styles.recBtn}>
              <Text style={styles.recBtnText}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={sendVoiceMessage} disabled={uploading} style={styles.recSendBtn}>
              {uploading
                ? <ActivityIndicator color={colors.bg} size="small" />
                : <Text style={styles.recSendText}>■ SEND</Text>
              }
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={input}
              onChangeText={handleInputChange}
              onFocus={() => setMode('insert')}
              onBlur={() => setMode('normal')}
              multiline
              maxLength={4000}
              placeholderTextColor={colors.muted}
              placeholder="Message... (/roll /flip /ping /time /encode /calc)"
              selectionColor={colors.amber}
              blurOnSubmit={false}
              onSubmitEditing={sendMessage}
            />
            {input.trim() ? (
              <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
                <Text style={styles.sendIcon}>▶</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={styles.iconBtn} onPress={sendPhoto}>
                  <Text style={styles.iconText}>🖼</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={startRecording}>
                  <Text style={styles.iconText}>🎤</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  backBtn: { padding: 4 },
  backText: { fontFamily: fonts.mono, fontSize: fontSize.lg, color: colors.green },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 38,
    height: 38,
    backgroundColor: colors.amberFaint,
    borderWidth: 1,
    borderColor: colors.amberDim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontFamily: fonts.mono, fontSize: fontSize.lg, color: colors.amber },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: colors.green,
    borderWidth: 1, borderColor: colors.bg,
  },
  headerInfo: { flex: 1 },
  headerName: { fontFamily: fonts.mono, fontSize: fontSize.md, color: colors.amber },
  headerSub: { fontFamily: fonts.mono, fontSize: fontSize.xs, color: colors.green, marginTop: 1 },
  messageList: { paddingVertical: 8 },
  emptyText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 60,
    paddingHorizontal: 24,
  },
  inputArea: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  input: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: fontSize.md,
    color: colors.amber,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    backgroundColor: colors.amberFaint,
    borderWidth: 1,
    borderColor: colors.amberDim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendIcon: { fontFamily: fonts.mono, fontSize: fontSize.md, color: colors.amber },
  iconBtn: {
    width: 40,
    height: 40,
    backgroundColor: colors.amberFaint,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: { fontSize: fontSize.md },
  // Recording
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  recIndicator: {
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
    color: colors.red,
    flex: 1,
  },
  recBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.red,
  },
  recBtnText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
    color: colors.red,
  },
  recSendBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.amber,
  },
  recSendText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.sm,
    color: colors.bg,
    fontWeight: 'bold',
  },
});
