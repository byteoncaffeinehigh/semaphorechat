import React, { useState, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  Animated, Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
// @ts-ignore
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Audio } from 'expo-av';
import { colors, fontSize } from '../theme';

const rot13 = (str: string): string =>
  str.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });

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

interface Props {
  message: MessageData;
  isMine: boolean;
  isRead?: boolean;
  isNew?: boolean;
}

function FileAttachment({ data, name, type, size }: { data: string; name: string; type?: string; size?: number }) {
  const [saving, setSaving] = useState(false);

  const fmtSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleOpen = async () => {
    setSaving(true);
    try {
      const base64 = data.includes(',') ? data.split(',')[1] : data;
      const uri = FileSystem.cacheDirectory + name;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: type || 'application/octet-stream', dialogTitle: name });
      } else {
        Alert.alert('Sharing not available on this device');
      }
    } catch {
      Alert.alert('Error', 'Failed to open file');
    } finally {
      setSaving(false);
    }
  };

  const icon = type?.includes('pdf') ? '📄'
    : type?.includes('zip') || type?.includes('rar') ? '🗜'
    : type?.includes('image') ? '🖼'
    : '📎';

  return (
    <TouchableOpacity onPress={handleOpen} disabled={saving} style={fileStyles.container}>
      <Text style={fileStyles.icon}>{icon}</Text>
      <View style={fileStyles.info}>
        <Text style={fileStyles.name} numberOfLines={2}>{name}</Text>
        {size ? <Text style={fileStyles.size}>{fmtSize(size)}</Text> : null}
      </View>
      <Text style={fileStyles.action}>{saving ? '...' : '↓'}</Text>
    </TouchableOpacity>
  );
}

function AudioPlayer({ url, duration, isMine }: { url: string; duration?: number; isMine: boolean }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(duration || 0);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const toggle = async () => {
    if (playing) {
      await sound?.pauseAsync();
      setPlaying(false);
    } else {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: false });
      if (!sound) {
        const { sound: s } = await Audio.Sound.createAsync(
          { uri: url },
          { progressUpdateIntervalMillis: 300 },
          (status) => {
            if (!status.isLoaded) return;
            const dur = status.durationMillis ? status.durationMillis / 1000 : total;
            setTotal(dur);
            setCurrent(status.positionMillis / 1000);
            setProgress(dur > 0 ? (status.positionMillis / 1000) / dur : 0);
            if (status.didJustFinish) { setPlaying(false); setProgress(0); setCurrent(0); }
          }
        );
        setSound(s);
        await s.playAsync();
      } else {
        await sound.playAsync();
      }
      setPlaying(true);
    }
  };

  const trackColor = isMine ? 'rgba(255,255,255,0.3)' : colors.bgCard;
  const fillColor = isMine ? '#fff' : colors.primary;
  const textColor = isMine ? 'rgba(255,255,255,0.8)' : colors.textSecondary;

  return (
    <View style={audioStyles.container}>
      <TouchableOpacity onPress={toggle} style={[audioStyles.playBtn, { backgroundColor: isMine ? 'rgba(255,255,255,0.2)' : colors.bgCard }]}>
        <Text style={[audioStyles.playIcon, { color: isMine ? '#fff' : colors.primary }]}>{playing ? '⏸' : '▶'}</Text>
      </TouchableOpacity>
      <View style={[audioStyles.progressWrap, { backgroundColor: trackColor }]}>
        <View style={[audioStyles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: fillColor }]} />
      </View>
      <Text style={[audioStyles.time, { color: textColor }]}>{fmt(current)} / {fmt(total)}</Text>
    </View>
  );
}

export default function Message({ message, isMine, isRead, isNew }: Props) {
  const [decrypted, setDecrypted] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const [copied, setCopied] = useState(false);
  const glowAnim = useRef(new Animated.Value(isNew ? 1 : 0)).current;

  React.useEffect(() => {
    if (isNew) {
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 0, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 600, useNativeDriver: false }),
      ]).start();
    }
  }, [isNew]);

  const displayText = message.isEncoded && decrypted ? rot13(message.message) : message.message;

  const ts = message.timestamp
    ? new Date(typeof message.timestamp === 'number' ? message.timestamp : message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const handleLongPress = () => {
    if (!message.imageURL && !message.audioURL && !message.fileData) setShowCopy(true);
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(displayText);
    setCopied(true);
    setTimeout(() => { setCopied(false); setShowCopy(false); }, 1200);
  };

  const bubbleBg = isMine ? colors.senderBubble : colors.receiverBubble;
  const textColor = '#fff';

  // iMessage-style corner radii
  const bubbleStyle = [
    styles.bubble,
    { backgroundColor: bubbleBg },
    isMine ? styles.bubbleMine : styles.bubbleTheirs,
    message.isCommand && styles.commandBubble,
  ];

  return (
    <View style={[styles.container, isMine ? styles.containerRight : styles.containerLeft]}>
      <TouchableOpacity onLongPress={handleLongPress} activeOpacity={0.85} style={bubbleStyle}>
        {message.fileData ? (
          <FileAttachment data={message.fileData} name={message.fileName || 'file'} type={message.fileType} size={message.fileSize} />
        ) : message.audioURL ? (
          <AudioPlayer url={message.audioURL} duration={message.audioDuration} isMine={isMine} />
        ) : message.imageURL ? (
          <Image source={{ uri: message.imageURL }} style={styles.image} resizeMode="cover" />
        ) : (
          <Text style={[styles.text, { color: textColor }, message.isCommand && styles.commandText]}>
            {displayText}
          </Text>
        )}

        {message.isEncoded && (
          <TouchableOpacity onPress={() => setDecrypted((d) => !d)} style={styles.decryptBtn}>
            <Text style={[styles.decryptText, { color: isMine ? 'rgba(255,255,255,0.7)' : colors.primary }]}>
              {decrypted ? 'Hide' : 'Decrypt ROT13'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.footer}>
          <Text style={[styles.timestamp, { color: isMine ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]}>{ts}</Text>
          {isMine && !message.isCommand && (
            <Text style={[styles.readStatus, { color: isRead ? '#fff' : 'rgba(255,255,255,0.5)' }]}>
              {isRead ? '✓✓' : '✓'}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {showCopy && (
        <TouchableOpacity
          style={[styles.copyBar, isMine ? styles.copyBarRight : styles.copyBarLeft]}
          onPress={handleCopy}
        >
          <Text style={styles.copyText}>{copied ? '✓ Copied' : 'Copy'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 2, marginHorizontal: 8, maxWidth: '80%' },
  containerLeft: { alignSelf: 'flex-start' },
  containerRight: { alignSelf: 'flex-end' },
  bubble: { padding: 10, maxWidth: '100%' },
  bubbleMine: {
    borderRadius: 18,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  commandBubble: {
    borderWidth: 1,
    borderColor: colors.separator,
  },
  text: { fontSize: fontSize.md, lineHeight: 20 },
  commandText: { color: colors.textSecondary, fontFamily: 'monospace', fontSize: fontSize.sm },
  image: { width: 220, height: 220, borderRadius: 12 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 4, gap: 4 },
  timestamp: { fontSize: fontSize.xs },
  readStatus: { fontSize: fontSize.xs },
  decryptBtn: { marginTop: 4 },
  decryptText: { fontSize: fontSize.xs },
  copyBar: { marginTop: 4 },
  copyBarLeft: { alignSelf: 'flex-start' },
  copyBarRight: { alignSelf: 'flex-end' },
  copyText: { fontSize: fontSize.xs, color: colors.primary, paddingHorizontal: 4 },
});

const fileStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 180, maxWidth: 240, paddingVertical: 2 },
  icon: { fontSize: 28 },
  info: { flex: 1 },
  name: { fontSize: fontSize.sm, color: '#fff' },
  size: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  action: { fontSize: fontSize.lg, color: 'rgba(255,255,255,0.8)', paddingHorizontal: 4 },
});

const audioStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 180 },
  playBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  playIcon: { fontSize: 14 },
  progressWrap: { flex: 1, height: 3, borderRadius: 2 },
  progressFill: { height: '100%', borderRadius: 2 },
  time: { fontSize: fontSize.xs },
});
