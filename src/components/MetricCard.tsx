import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

type MetricCardProps = {
  eyebrow: string;
  value: string;
  caption: string;
  accent: string;
};

export function MetricCard({
  eyebrow,
  value,
  caption,
  accent,
}: MetricCardProps) {
  return (
    <View style={styles.card}>
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 150,
    backgroundColor: theme.surface,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(22, 55, 40, 0.08)',
    gap: 8,
  },
  accent: {
    width: 36,
    height: 6,
    borderRadius: 999,
  },
  eyebrow: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  value: {
    color: theme.forest,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '700',
    fontFamily: 'Georgia',
  },
  caption: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
});
