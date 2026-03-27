import React, { useState, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  Animated, Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Audio } from 'expo-av';
import { colors, fonts, fontSize } from '../theme';

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
}

interface Props {
  message: MessageData;
  isMine: boolean;
  isRead?: boolean;
  isNew?: boolean;
}

function AudioPlayer({ url, duration }: { url: string; duration?: number }) {
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

  return (
    <View style={audioStyles.container}>
      <TouchableOpacity onPress={toggle} style={audioStyles.playBtn}>
        <Text style={audioStyles.playIcon}>{playing ? '⏸' : '▶'}</Text>
      </TouchableOpacity>
      <View style={audioStyles.progressWrap}>
        <View style={[audioStyles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <Text style={audioStyles.time}>{fmt(current)} / {fmt(total)}</Text>
    </View>
  );
}

export default function Message({ message, isMine, isRead, isNew }: Props) {
  const [decrypted, setDecrypted] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);
  const glowAnim = useRef(new Animated.Value(isNew ? 1 : 0)).current;

  React.useEffect(() => {
    if (isNew) {
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 0, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 800, useNativeDriver: false }),
      ]).start();
    }
  }, [isNew]);

  const displayText = message.isEncoded && decrypted ? rot13(message.message) : message.message;

  const bubbleBg = message.isCommand ? colors.commandBubble
    : isMine ? colors.senderBubble
    : colors.receiverBubble;

  const borderCol = message.isCommand ? colors.green
    : isMine ? colors.amberDim
    : colors.borderBright;

  const handleLongPress = () => {
    if (!message.imageURL && !message.audioURL) setShowActions(true);
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(displayText);
    setCopied(true);
    setTimeout(() => { setCopied(false); setShowActions(false); }, 1200);
  };

  const ts = message.timestamp
    ? new Date(typeof message.timestamp === 'number' ? message.timestamp : message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const renderMarkdown = (text: string) => {
    // Simple inline code highlight
    const parts = text.split(/(`[^`\n]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return (
          <Text key={i} style={mdStyles.code}>{part.slice(1, -1)}</Text>
        );
      }
      return <Text key={i}>{part}</Text>;
    });
  };

  return (
    <View style={[styles.container, isMine ? styles.containerRight : styles.containerLeft]}>
      <TouchableOpacity
        onLongPress={handleLongPress}
        activeOpacity={0.85}
        style={[
          styles.bubble,
          { backgroundColor: bubbleBg, borderColor: borderCol },
          message.isCommand && styles.commandBubble,
        ]}
      >
        {message.audioURL ? (
          <AudioPlayer url={message.audioURL} duration={message.audioDuration} />
        ) : message.imageURL ? (
          <Image
            source={{ uri: message.imageURL }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : (
          <Text style={[styles.text, message.isCommand && styles.commandText]}>
            {renderMarkdown(displayText)}
          </Text>
        )}

        {message.isEncoded && (
          <TouchableOpacity onPress={() => setDecrypted((d) => !d)} style={styles.decryptBtn}>
            <Text style={styles.decryptText}>{decrypted ? '[ ENCRYPT ]' : '[ DECRYPT ]'}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.footer}>
          <Text style={styles.timestamp}>{ts}</Text>
          {isMine && !message.isCommand && (
            <Text style={isRead ? styles.readRead : styles.readUnread}>
              {isRead ? '✓✓' : '✓'}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {showActions && (
        <TouchableOpacity
          style={[styles.copyBar, isMine ? styles.copyBarRight : styles.copyBarLeft]}
          onPress={handleCopy}
        >
          <Text style={styles.copyText}>{copied ? '✓ copied' : '[ copy ]'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 2, marginHorizontal: 8, maxWidth: '82%' },
  containerLeft: { alignSelf: 'flex-start' },
  containerRight: { alignSelf: 'flex-end' },
  bubble: {
    padding: 10,
    borderWidth: 1,
    borderRadius: 2,
  },
  commandBubble: {
    borderStyle: 'dashed',
  },
  text: {
    fontFamily: fonts.mono,
    fontSize: fontSize.md,
    color: colors.amber,
  },
  commandText: { color: colors.green },
  image: { width: 220, height: 220 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 4, gap: 6 },
  timestamp: { fontFamily: fonts.mono, fontSize: fontSize.xs, color: colors.muted },
  readRead: { fontFamily: fonts.mono, fontSize: fontSize.xs, color: colors.green },
  readUnread: { fontFamily: fonts.mono, fontSize: fontSize.xs, color: colors.muted },
  decryptBtn: { marginTop: 6 },
  decryptText: { fontFamily: fonts.mono, fontSize: fontSize.xs, color: colors.amberDim },
  copyBar: { marginTop: 4 },
  copyBarLeft: { alignSelf: 'flex-start' },
  copyBarRight: { alignSelf: 'flex-end' },
  copyText: { fontFamily: fonts.mono, fontSize: fontSize.xs, color: colors.muted },
});

const mdStyles = StyleSheet.create({
  code: {
    fontFamily: fonts.mono,
    backgroundColor: 'rgba(255,184,0,0.12)',
    color: colors.green,
    paddingHorizontal: 3,
  },
});

const audioStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 160 },
  playBtn: {
    width: 32,
    height: 32,
    backgroundColor: colors.amberFaint,
    borderWidth: 1,
    borderColor: colors.amberDim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: { fontFamily: fonts.mono, fontSize: fontSize.sm, color: colors.amber },
  progressWrap: {
    flex: 1,
    height: 3,
    backgroundColor: colors.border,
  },
  progressFill: { height: '100%', backgroundColor: colors.amber },
  time: { fontFamily: fonts.mono, fontSize: fontSize.xs, color: colors.muted },
});
