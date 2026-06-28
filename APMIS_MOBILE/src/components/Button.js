import { Text, ActivityIndicator, View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import PressableScale from './PressableScale';

// Variants:
//  primary | accent  -> filled gradient
//  danger            -> filled solid danger
//  outline           -> bordered, transparent
//  ghost             -> text only
export default function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  style,
  textStyle,
  full = true,
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const isDisabled = disabled || loading;

  const gradient =
    variant === 'accent' ? c.accentGradient
    : variant === 'primary' ? c.primaryGradient
    : null;

  const fg =
    variant === 'primary' ? c.onPrimary
    : variant === 'accent' ? c.onAccent
    : variant === 'danger' ? '#fff'
    : variant === 'outline' ? c.primary
    : c.primary; // ghost

  const inner = (
    <View style={styles.row}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} style={{ marginRight: 8 }} />}
          <Text style={[styles.text, { color: fg }, textStyle]}>{title}</Text>
        </>
      )}
    </View>
  );

  const base = [
    styles.btn,
    { borderRadius: theme.radius.md },
    full && { alignSelf: 'stretch' },
    isDisabled && { opacity: 0.5 },
    style,
  ];

  if (gradient) {
    return (
      <PressableScale onPress={onPress} disabled={isDisabled} style={base}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.fill, { borderRadius: theme.radius.md }]}
        >
          {inner}
        </LinearGradient>
      </PressableScale>
    );
  }

  const solidStyle =
    variant === 'danger' ? { backgroundColor: c.danger }
    : variant === 'outline' ? { borderWidth: 1.5, borderColor: c.primary, backgroundColor: 'transparent' }
    : { backgroundColor: 'transparent' };

  return (
    <PressableScale onPress={onPress} disabled={isDisabled} style={[base, styles.fill, solidStyle]}>
      {inner}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  btn: { overflow: 'hidden' },
  fill: { paddingVertical: 15, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
});
