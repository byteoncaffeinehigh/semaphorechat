import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, fontSize } from '../theme';

interface Props {
  mode: string;
  msgCount: number;
  txCount: number;
  uptimeStart: number;
}

function formatUptime(startMs: number): string {
  const s = Math.floor((Date.now() - startMs) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function ConnectionStats({ mode, msgCount, txCount, uptimeStart }: Props) {
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

  React.useEffect(() => {
    const id = setInterval(forceUpdate, 1000);
    return () => clearInterval(id);
  }, []);

  const modeLabel = mode === 'insert' ? 'INSERT' : 'NORMAL';
  const modeColor = mode === 'insert' ? colors.green : colors.amber;

  return (
    <View style={styles.bar}>
      <Text style={[styles.mode, { color: modeColor }]}>-- {modeLabel} --</Text>
      <Text style={styles.stat}>UP:{formatUptime(uptimeStart)}</Text>
      <Text style={styles.stat}>RX:{msgCount}</Text>
      <Text style={styles.stat}>TX:{txCount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 12,
  },
  mode: {
    fontFamily: fonts.mono,
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  stat: {
    fontFamily: fonts.mono,
    fontSize: fontSize.xs,
    color: colors.muted,
  },
});
