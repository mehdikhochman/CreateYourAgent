import { StyleSheet } from 'react-native';

import { Canvas } from './fiber';
import { TikoScene } from './tiko-scene';

/**
 * The 3D view. Loaded lazily by the celebration screen so that three.js and
 * expo-gl are only evaluated when the animation is shown, never at app start.
 */
export default function TikoCanvas({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <Canvas camera={{ position: [0, 0, 7], fov: 40 }} style={styles.canvas}>
      <TikoScene reduceMotion={reduceMotion} />
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1 },
});
