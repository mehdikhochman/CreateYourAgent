// Visual system validated in the design canvas (see design/README.md).
// Orange / white / green echo the Ivorian flag.
export const Colors = {
  ink: '#15161A',
  muted: '#5F6168',
  faint: '#8A8C93',
  primary: '#F77F00',
  onPrimary: '#1A1206',
  primarySoft: '#FFF4E8',
  primaryLine: '#F0DCC4',
  link: '#A34F00',
  green: '#00875A',
  greenSoft: '#E8F5EE',
  success: '#00A86B',
  danger: '#D93025',
  dangerSoft: '#FDECEA',
  background: '#F7F7F9',
  surface: '#FFFFFF',
  surfaceMuted: '#F4F4F6',
  border: '#E4E4E8',
  track: '#F0F0F3',
  chatBackground: '#EFEAE2',
  bubbleSent: '#D9FDD3',
  bubbleReceived: '#FFFFFF',
  tickRead: '#2F8FD8',
  backdrop: 'rgba(21, 22, 26, 0.5)',
};

export const Font = {
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
};

export type FontWeight = keyof typeof Font;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const Radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
};
