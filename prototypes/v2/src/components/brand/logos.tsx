import { Banknote, CreditCard, Store, Wallet, type LucideIcon } from '@/components/icons';
import { Image, View, type ImageSourcePropType } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Colors } from '@/constants/theme';

import { BRAND_SVGS } from './brand-svgs';

export type SocialBrand = keyof typeof BRAND_SVGS;

const PAYMENT_IMAGES: Record<string, ImageSourcePropType> = {
  Wave: require('@/assets/logos/wave.png'),
  'Orange Money': require('@/assets/logos/orange-money.png'),
  'MTN MoMo': require('@/assets/logos/mtn.png'),
};

/** A social / messaging brand mark (WhatsApp, TikTok, Instagram, Facebook). */
export function BrandMark({ brand, size = 24, color }: { brand: SocialBrand; size?: number; color?: string }) {
  const xml = color ? BRAND_SVGS[brand].replace(/fill="#[0-9A-Fa-f]{6}"/, `fill="${color}"`) : BRAND_SVGS[brand];
  return <SvgXml xml={xml} width={size} height={size} />;
}

function Tile({
  size,
  background,
  bordered,
  children,
}: {
  size: number;
  background: string;
  bordered?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.27,
        backgroundColor: background,
        borderWidth: bordered ? 1 : 0,
        borderColor: Colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
      {children}
    </View>
  );
}

function IconTile({ Icon, size, color, background }: { Icon: LucideIcon; size: number; color: string; background: string }) {
  return (
    <Tile size={size} background={background}>
      <Icon size={size * 0.5} color={color} strokeWidth={2.2} />
    </Tile>
  );
}

/** Logo tile for a payment method (values from PAYMENT_OPTIONS). */
export function PaymentLogo({ value, size = 44 }: { value: string; size?: number }) {
  const image = PAYMENT_IMAGES[value];
  if (value === 'Orange Money' && image) {
    return (
      <Tile size={size} background="#FFFFFF" bordered>
        <Image source={image} style={{ width: size * 0.72, height: size * 0.72 }} resizeMode="contain" />
      </Tile>
    );
  }
  if (image) {
    return (
      <Tile size={size} background="#FFFFFF">
        <Image source={image} style={{ width: size, height: size }} resizeMode="cover" />
      </Tile>
    );
  }
  if (value === 'Espèces') return <IconTile Icon={Banknote} size={size} color={Colors.green} background={Colors.greenSoft} />;
  if (value === 'Carte bancaire') return <IconTile Icon={CreditCard} size={size} color="#2B3A8C" background="#EEF0FA" />;
  // Moov Money: no official logo found yet, a neutral wallet stands in.
  return <IconTile Icon={Wallet} size={size} color={Colors.muted} background={Colors.surfaceMuted} />;
}

/** Logo tile for a sales channel (values from the « Où vendez-vous ? » step). */
export function ChannelLogo({ value, size = 44, background = Colors.surfaceMuted }: { value: string; size?: number; background?: string }) {
  if (value === 'shop') return <IconTile Icon={Store} size={size} color={Colors.ink} background={background} />;
  const brand = value as SocialBrand;
  if (!(brand in BRAND_SVGS)) return null;
  return (
    <Tile size={size} background={background}>
      <BrandMark brand={brand} size={size * 0.55} />
    </Tile>
  );
}
