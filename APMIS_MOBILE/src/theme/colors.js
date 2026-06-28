// Light & dark color palettes. Both expose the same keys so components can
// read theme.colors.<key> without caring which mode is active.

export const lightColors = {
  mode: 'light',

  // backgrounds
  bg: '#F4F7F2',
  bgGradient: ['#F5F8F3', '#E8F1E6'],
  card: '#FFFFFF',
  cardElevated: '#FFFFFF',
  cardBorder: '#E7EDE3',
  inputBg: '#FFFFFF',
  inputBorder: '#DDE6D8',
  overlay: 'rgba(20, 32, 22, 0.45)',
  scrim: 'rgba(255,255,255,0.7)',

  // text
  text: '#19211B',
  textMuted: '#5E6B60',
  textFaint: '#9AA69C',
  onPrimary: '#FFFFFF',
  onAccent: '#FFFFFF',

  // brand
  primary: '#2E7D32',
  primaryGradient: ['#4CAF50', '#2E7D32'],
  primarySoft: '#E8F5E9',
  accent: '#1565C0',
  accentGradient: ['#42A5F5', '#1565C0'],
  accentSoft: '#E3F0FB',

  // semantic
  danger: '#C62828',
  dangerSoft: '#FCEBEA',
  success: '#2E7D32',
  warning: '#EF6C00',

  // controls
  switchTrackOff: '#CFD8CF',
  switchThumb: '#FFFFFF',

  // misc
  shadow: '#1B3A22',
  ringTrack: '#E7EDE3',
  skeleton: '#EAF0E8',
};

export const darkColors = {
  mode: 'dark',

  // backgrounds
  bg: '#0E1511',
  bgGradient: ['#101A14', '#0B120E'],
  card: '#18211B',
  cardElevated: '#1E2922',
  cardBorder: '#28332B',
  inputBg: '#121C16',
  inputBorder: '#2A352D',
  overlay: 'rgba(0, 0, 0, 0.6)',
  scrim: 'rgba(14,21,17,0.7)',

  // text
  text: '#ECF5EE',
  textMuted: '#9DACA1',
  textFaint: '#69776D',
  onPrimary: '#08110B',
  onAccent: '#04121C',

  // brand
  primary: '#4ADE80',
  primaryGradient: ['#4ADE80', '#22A55B'],
  primarySoft: '#16271C',
  accent: '#38BDF8',
  accentGradient: ['#38BDF8', '#0EA5E9'],
  accentSoft: '#102733',

  // semantic
  danger: '#F87171',
  dangerSoft: '#2A1715',
  success: '#4ADE80',
  warning: '#FB923C',

  // controls
  switchTrackOff: '#2B362E',
  switchThumb: '#E9F2EB',

  // misc
  shadow: '#000000',
  ringTrack: '#28332B',
  skeleton: '#1C2620',
};

// Moisture is rendered on a dry→wet color scale. Returns a single hex color
// and a 2-stop gradient for fills. pct is 0–100; null/undefined → neutral.
export function moistureColor(pct, isDark) {
  if (pct == null || isNaN(pct)) {
    return isDark
      ? { solid: '#69776D', gradient: ['#3A463E', '#69776D'] }
      : { solid: '#9AA69C', gradient: ['#C4CEC4', '#9AA69C'] };
  }
  const p = Math.max(0, Math.min(100, pct));
  if (p < 30) {
    // dry — warm amber/red
    return isDark
      ? { solid: '#FB923C', gradient: ['#F97316', '#FB923C'] }
      : { solid: '#EF6C00', gradient: ['#F59E0B', '#EF6C00'] };
  }
  if (p < 60) {
    // ok — green
    return isDark
      ? { solid: '#4ADE80', gradient: ['#4ADE80', '#22A55B'] }
      : { solid: '#2E7D32', gradient: ['#4CAF50', '#2E7D32'] };
  }
  // wet — blue
  return isDark
    ? { solid: '#38BDF8', gradient: ['#38BDF8', '#0EA5E9'] }
    : { solid: '#1565C0', gradient: ['#42A5F5', '#1565C0'] };
}
