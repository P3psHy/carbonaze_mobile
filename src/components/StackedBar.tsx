import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';
import type { ImpactShare } from '../types';

type StackedBarProps = {
  shares: ImpactShare[];
  formatTons: (valueKg: number) => string;
  formatPercent: (value: number) => string;
};

export function StackedBar({
  shares,
  formatTons,
  formatPercent,
}: StackedBarProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.track}>
        {shares.map((item) => (
          <View
            key={item.key}
            style={[
              styles.segment,
              {
                backgroundColor: item.color,
                flex: Math.max(item.share, 0.08),
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.legend}>
        {shares.map((item) => (
          <View key={item.key} style={styles.row}>
            <View style={styles.labelWrap}>
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <Text style={styles.label}>{item.label}</Text>
            </View>
            <Text style={styles.value}>
              {formatPercent(item.share)} · {formatTons(item.valueKg)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 18,
  },
  track: {
    height: 22,
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: theme.surfaceMuted,
  },
  segment: {
    height: '100%',
  },
  legend: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  labelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  label: {
    color: theme.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  value: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});
