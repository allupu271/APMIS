import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { moistureColor } from '../theme/colors';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Circular moisture gauge. pct may be null (= no reading yet). The arc and the
// numeric label both animate when the value changes.
export default function MoistureRing({ pct, size = 92, stroke = 9, gradientId = 'mring' }) {
  const { theme, isDark } = useTheme();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const hasReading = pct != null && !isNaN(pct);
  const clamped = hasReading ? Math.max(0, Math.min(100, pct)) : 0;

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(clamped / 100, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [clamped]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const mc = moistureColor(hasReading ? clamped : null, isDark);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={mc.gradient[0]} />
            <Stop offset="1" stopColor={mc.gradient[1]} />
          </SvgGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.ringTrack}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          // start the arc at 12 o'clock
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        {hasReading ? (
          <>
            <Text style={[styles.value, { color: theme.colors.text, fontSize: size * 0.27 }]}>
              {Math.round(clamped)}
            </Text>
            <Text style={[styles.pct, { color: theme.colors.textFaint }]}>%</Text>
          </>
        ) : (
          <Ionicons name="water-outline" size={size * 0.3} color={theme.colors.textFaint} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  value: { fontWeight: '800' },
  pct: { fontSize: 12, fontWeight: '700', marginLeft: 1, marginBottom: 2 },
});
