import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';

// Full-screen themed background with a subtle vertical gradient. Applies top/
// bottom safe-area padding by default; pass edges={[]} to opt out (e.g. when a
// header already handles the top inset).
export default function Screen({ children, style, edges = ['top', 'bottom'], padded = false }) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const pad = {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
  };

  return (
    <LinearGradient colors={theme.colors.bgGradient} style={styles.fill}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.fill, pad, padded && { paddingHorizontal: theme.spacing.lg }, style]}>
        {children}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
