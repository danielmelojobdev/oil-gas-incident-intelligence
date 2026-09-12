/**
 * Design tokens.
 *
 * Direction: an industrial intelligence console, not a consumer news reader.
 * Dense, technical, calm. Colour is reserved for meaning (severity, confidence,
 * source tier) so that a screen full of grey text makes the one red rail obvious.
 */
import type { ConfidenceLevel, Severity, SourceTier } from '@ogii/domain';

export interface Palette {
  readonly background: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly surfaceSunken: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly text: string;
  readonly textMuted: string;
  readonly textFaint: string;
  readonly accent: string;
  readonly accentSoft: string;
  readonly accentText: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly info: string;
  readonly overlay: string;
  readonly mockBanner: string;
  readonly mockBannerText: string;
  readonly severity: Readonly<Record<Severity, string>>;
  readonly severitySoft: Readonly<Record<Severity, string>>;
  readonly confidence: Readonly<Record<ConfidenceLevel, string>>;
  readonly tier: Readonly<Record<SourceTier, string>>;
}

export const darkPalette: Palette = {
  background: '#0B1220',
  surface: '#121B2C',
  surfaceRaised: '#182337',
  surfaceSunken: '#080E19',
  border: '#22304A',
  borderStrong: '#31435F',
  text: '#E9EEF7',
  textMuted: '#93A2BC',
  textFaint: '#64748B',
  accent: '#FF6B35',
  accentSoft: '#3A2013',
  accentText: '#0B1220',
  success: '#4FB286',
  warning: '#F2B84B',
  danger: '#FF5A6E',
  info: '#5B9BD5',
  overlay: 'rgba(4, 8, 15, 0.72)',
  mockBanner: '#3A2013',
  mockBannerText: '#FFB38A',
  severity: {
    critical: '#FF5A6E',
    high: '#FF8A4C',
    moderate: '#F2B84B',
    low: '#5EA98A',
  },
  severitySoft: {
    critical: '#3B1620',
    high: '#3A2214',
    moderate: '#33290F',
    low: '#14291F',
  },
  confidence: {
    high: '#4FB286',
    medium: '#F2B84B',
    low: '#93A2BC',
  },
  tier: {
    1: '#4FB286',
    2: '#5B9BD5',
    3: '#8E9BD6',
    4: '#93A2BC',
    5: '#64748B',
  },
};

export const lightPalette: Palette = {
  background: '#F4F6FA',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#EAEEF5',
  border: '#DDE3EC',
  borderStrong: '#C3CCDA',
  text: '#0E1726',
  textMuted: '#55647E',
  textFaint: '#8895AB',
  accent: '#D4541F',
  accentSoft: '#FDEDE5',
  accentText: '#FFFFFF',
  success: '#2F8F63',
  warning: '#B7791F',
  danger: '#C62B40',
  info: '#2A6BA8',
  overlay: 'rgba(14, 23, 38, 0.45)',
  mockBanner: '#FDEDE5',
  mockBannerText: '#9A3A12',
  severity: {
    critical: '#C62B40',
    high: '#D4541F',
    moderate: '#B7791F',
    low: '#2F8F63',
  },
  severitySoft: {
    critical: '#FBE9EC',
    high: '#FDEEE6',
    moderate: '#FBF3E2',
    low: '#E7F4EE',
  },
  confidence: {
    high: '#2F8F63',
    medium: '#B7791F',
    low: '#8895AB',
  },
  tier: {
    1: '#2F8F63',
    2: '#2A6BA8',
    3: '#5A5FA8',
    4: '#55647E',
    5: '#8895AB',
  },
};

/** 4pt grid. Dense by design: this is a professional tool, not a magazine. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 26, lineHeight: 32, fontWeight: '700' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: '700' },
  subheading: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 19, fontWeight: '400' },
  smallStrong: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
  /** Uppercase micro-labels used for field names in the detail view. */
  label: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', letterSpacing: 0.7 },
  mono: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
} as const;

export const layout = {
  screenPadding: spacing.lg,
  cardGap: spacing.md,
  maxContentWidth: 720,
  severityRailWidth: 4,
} as const;
