import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import PressableScale from './PressableScale';

// Round button that flips between sun/moon and rotates on toggle.
export default function ThemeToggle({ size = 40 }) {
  const { theme, isDark, toggleTheme } = useTheme();
  const c = theme.colors;
  const spin = useSharedValue(isDark ? 1 : 0);

  useEffect(() => {
    spin.value = withTiming(isDark ? 1 : 0, { duration: 400 });
  }, [isDark]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(spin.value, [0, 1], [0, 360])}deg` }],
  }));

  return (
    <PressableScale
      onPress={toggleTheme}
      style={[
        styles.btn,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: c.primarySoft },
      ]}
      hitSlop={8}
    >
      <Animated.View style={iconStyle}>
        <Ionicons name={isDark ? 'moon' : 'sunny'} size={size * 0.5} color={c.primary} />
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center' },
});
