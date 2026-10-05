// iOS / Android: react-three-fiber renders through expo-gl.
// Canvas and useFrame must come from the same entry so they share one renderer.
export { Canvas, useFrame } from '@react-three/fiber/native';
