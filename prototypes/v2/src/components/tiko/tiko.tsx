import { View, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Colors } from '@/constants/theme';

import { TIKO_SVGS, type TikoPose } from './tiko-svgs';

export type { TikoPose };

const POSE_LABELS: Record<TikoPose, string> = {
  hello: 'Tiko fait coucou',
  think: 'Tiko réfléchit',
  happy: 'Tiko est content',
  wink: 'Tiko fait un clin d’œil',
  surprised: 'Tiko est surpris',
  sleep: 'Tiko est en pause',
};

/** Tiko, the assistant mascot, in one of its six moods. */
export function Tiko({ pose = 'hello', size = 120, style }: { pose?: TikoPose; size?: number; style?: ViewStyle }) {
  return (
    <View style={[{ width: size, height: size }, style]} accessibilityRole="image" accessibilityLabel={POSE_LABELS[pose]}>
      <SvgXml xml={TIKO_SVGS[pose]} width={size} height={size} />
    </View>
  );
}

/** Round avatar with Tiko inside (chat headers, lists). */
export function TikoAvatar({ pose = 'hello', size = 40, background = Colors.primarySoft }: { pose?: TikoPose; size?: number; background?: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
      <Tiko pose={pose} size={size * 0.94} />
    </View>
  );
}
