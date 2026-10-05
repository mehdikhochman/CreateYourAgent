import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';

const SIZE = 21;

function isFinder(r: number, c: number): boolean | null {
  const corners = [
    [0, 0],
    [0, SIZE - 7],
    [SIZE - 7, 0],
  ];
  for (const [r0, c0] of corners) {
    const y = r - r0;
    const x = c - c0;
    if (y >= 0 && y < 7 && x >= 0 && x < 7) {
      const ring = Math.min(y, x, 6 - y, 6 - x);
      return ring !== 1;
    }
  }
  return null;
}

/** Decorative QR-like pattern for the prototype (not a scannable code). */
export function FakeQr({ size = 180 }: { size?: number }) {
  const cell = size / SIZE;
  const rows = [];
  for (let r = 0; r < SIZE; r++) {
    const cells = [];
    for (let c = 0; c < SIZE; c++) {
      const finder = isFinder(r, c);
      const on = finder ?? (r * 7 + c * 13 + ((r * c) % 5)) % 3 === 0;
      cells.push(<View key={c} style={{ width: cell, height: cell, backgroundColor: on ? Colors.ink : 'transparent' }} />);
    }
    rows.push(
      <View key={r} style={styles.row}>
        {cells}
      </View>,
    );
  }
  return <View style={{ width: size, height: size }}>{rows}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
});
