import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';

// Small pill showing connection state with a pulsing dot when connected.
export default function StatusPill({ connected, labelOn = 'Live', labelOff = 'Offline' }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const color = connected ? c.success : c.textFaint;
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (connected) {
      pulse.value = withRepeat(
        withSequence(withTiming(0.35, { duration: 800 }), withTiming(1, { duration: 800 })),
        -1,
        false
      );
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [connected]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={[styles.pill, { backgroundColor: connected ? c.primarySoft : c.cardBorder }]}>
      <Animated.View style={[styles.dot, { backgroundColor: color }, dotStyle]} />
      <Text style={[styles.text, { color: connected ? c.primary : c.textMuted }]}>
        {connected ? labelOn : labelOff}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  text: { fontSize: 12, fontWeight: '700' },
});
