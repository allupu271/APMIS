import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';

// Drop-in replacement for RN <Switch>: same value / onValueChange / disabled
// API, but animated and theme-aware. `activeColor` sets the on-state track.
export default function Toggle({ value, onValueChange, disabled = false, activeColor }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const on = useSharedValue(value ? 1 : 0);
  const W = 50, H = 30, PAD = 3, THUMB = H - PAD * 2;

  useEffect(() => {
    on.value = withTiming(value ? 1 : 0, { duration: 200 });
  }, [value]);

  const trackOn = activeColor || c.primary;

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [c.switchTrackOff, trackOn]),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: on.value * (W - THUMB - PAD * 2) }],
  }));

  return (
    <Pressable
      onPress={() => !disabled && onValueChange?.(!value)}
      disabled={disabled}
      hitSlop={6}
      style={disabled && { opacity: 0.5 }}
    >
      <Animated.View style={[styles.track, { width: W, height: H, borderRadius: H / 2, padding: PAD }, trackStyle]}>
        <Animated.View
          style={[
            styles.thumb,
            { width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: c.switchThumb },
            thumbStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { justifyContent: 'center' },
  thumb: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 2,
  },
});
