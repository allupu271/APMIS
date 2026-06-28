// Design tokens shared across both themes (mode-independent).

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};

export const font = {
  // sizes
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  display: 34,
  // weights
  regular: '400',
  medium: '600',
  bold: '700',
  heavy: '800',
};

// Animation timings (ms) and spring presets used app-wide.
export const motion = {
  fast: 160,
  base: 240,
  slow: 380,
  spring: { damping: 16, stiffness: 180, mass: 0.9 },
  springSoft: { damping: 20, stiffness: 140, mass: 1 },
};
