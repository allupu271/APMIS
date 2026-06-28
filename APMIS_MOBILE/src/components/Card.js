import { View, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import PressableScale from './PressableScale';

// Themed surface with soft shadow. If onPress is provided it becomes a
// press-animated tappable card; otherwise a plain View.
export default function Card({ children, style, onPress, onLongPress, disabled, active }) {
  const { theme, isDark } = useTheme();

  const cardStyle = [
    styles.card,
    {
      backgroundColor: theme.colors.card,
      borderColor: active ? theme.colors.primary : theme.colors.cardBorder,
      borderRadius: theme.radius.lg,
      shadowColor: theme.colors.shadow,
      shadowOpacity: isDark ? 0.4 : 0.12,
    },
    style,
  ];

  if (onPress || onLongPress) {
    return (
      <PressableScale onPress={onPress} onLongPress={onLongPress} disabled={disabled} style={cardStyle}>
        {children}
      </PressableScale>
    );
  }
  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 16,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 4,
  },
});
