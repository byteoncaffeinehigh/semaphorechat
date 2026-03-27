import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF';
const COLS = Math.floor(SCREEN_W / 14);
const IDLE_MS = 60_000;

function randomChar() {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

interface Column {
  chars: string[];
  head: number;
  speed: number;
  opacity: Animated.Value;
}

export default function MatrixRain() {
  const [visible, setVisible] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reset = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      setVisible(false);
      idleTimer.current = setTimeout(() => setVisible(true), IDLE_MS);
    };
    reset();
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, []);

  if (!visible) return null;

  return (
    <View
      style={styles.overlay}
      onTouchStart={() => {
        setVisible(false);
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(() => setVisible(true), IDLE_MS);
      }}
      pointerEvents="box-only"
    >
      <RainCanvas />
    </View>
  );
}

function RainCanvas() {
  const [cols, setCols] = useState<Column[]>(() =>
    Array.from({ length: COLS }, (_, i) => ({
      chars: Array.from({ length: 20 }, () => randomChar()),
      head: Math.floor(Math.random() * 20),
      speed: 80 + Math.random() * 120,
      opacity: new Animated.Value(0.3 + Math.random() * 0.7),
    }))
  );
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    tickRef.current = setInterval(() => {
      setCols((prev) =>
        prev.map((col) => {
          const newChars = [...col.chars];
          newChars[col.head] = randomChar();
          return { ...col, chars: newChars, head: (col.head + 1) % 20 };
        })
      );
    }, 100);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  const rowH = Math.floor(SCREEN_H / 20);

  return (
    <View style={styles.rain}>
      {cols.map((col, ci) => (
        <View key={ci} style={[styles.col, { left: ci * 14 }]}>
          {col.chars.map((ch, ri) => (
            <Text
              key={ri}
              style={[
                styles.char,
                { height: rowH },
                ri === col.head ? styles.headChar : ri === (col.head + 19) % 20 ? styles.trailChar : null,
              ]}
            >
              {ch}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.92)',
    zIndex: 9999,
  },
  rain: { flex: 1, position: 'relative' },
  col: { position: 'absolute', top: 0 },
  char: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: 'rgba(0,255,65,0.35)',
  },
  headChar: { color: '#00ff41' },
  trailChar: { color: 'rgba(0,255,65,0.7)' },
});
