import { Text as RNText, type TextProps } from 'react-native';

import { Colors, Font, type FontWeight } from '@/constants/theme';

/**
 * Text in Plus Jakarta Sans. Custom fonts pick their weight by family name,
 * so use `weight` rather than `fontWeight` in styles.
 */
export function Text({ weight = 'medium', style, ...rest }: TextProps & { weight?: FontWeight }) {
  return <RNText {...rest} style={[{ fontFamily: Font[weight], color: Colors.ink, fontSize: 16 }, style]} />;
}

/** Replies use **bold** for prices; renders those parts in bold. */
export function RichText({ children, style, ...rest }: Omit<TextProps, 'children'> & { children: string }) {
  const parts = children.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text {...rest} style={style}>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <Text key={i} weight="extrabold" style={style}>
            {part.slice(2, -2)}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

/** The same text without the ** markers, for previews and notifications. */
export function plain(text: string): string {
  return text.replace(/\*\*/g, '');
}
