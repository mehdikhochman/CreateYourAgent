import { StyleSheet } from 'react-native';

import { Canvas } from './fiber';
import { RobotScene } from './robot-scene';

/**
 * The 3D view. Loaded lazily by the celebration screen so that three.js and
 * expo-gl are only evaluated when the animation is shown, never at app start.
 */
export default function RobotCanvas({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <Canvas camera={{ position: [0, 0.4, 6], fov: 40 }} style={styles.canvas}>
      <RobotScene reduceMotion={reduceMotion} />
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1 },
});
