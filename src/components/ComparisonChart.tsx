import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

type ComparisonDatum = {
  id: string;
  label: string;
  city: string;
  totalKg: number;
  intensityPerM2: number;
  highlight: boolean;
};

type ComparisonChartProps = {
  data: ComparisonDatum[];
  formatTons: (valueKg: number) => string;
  formatIntensity: (value: number) => string;
};

export function ComparisonChart({
  data,
  formatTons,
  formatIntensity,
}: ComparisonChartProps) {
  const maxValue = data.reduce((currentMax, item) => {
    return Math.max(currentMax, item.totalKg);
  }, 1);

  return (
    <View style={styles.container}>
      {data.map((item) => (
        <View key={item.id} style={styles.row}>
          <View style={styles.header}>
            <View>
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.city}>{item.city}</Text>
            </View>
            <View style={styles.values}>
              <Text style={styles.total}>{formatTons(item.totalKg)}</Text>
              <Text style={styles.intensity}>{formatIntensity(item.intensityPerM2)}</Text>
            </View>
          </View>

          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: `${(item.totalKg / maxValue) * 100}%`,
                  backgroundColor: item.highlight ? theme.forest : theme.sage,
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 18,
  },
  row: {
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
  },
  label: {
    color: theme.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  city: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  values: {
    alignItems: 'flex-end',
  },
  total: {
    color: theme.forest,
    fontSize: 15,
    fontWeight: '700',
  },
  intensity: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  track: {
    height: 14,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: theme.surfaceMuted,
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
});
