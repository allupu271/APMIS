import { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

// Labeled, themed text input. Spreads remaining props onto the underlying
// TextInput so all existing behavior (value, onChangeText, keyboardType,
// secureTextEntry, maxLength, etc.) is preserved by callers.
export default function Field({ label, icon, style, containerStyle, onFocus, onBlur, ...props }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? <Text style={[styles.label, { color: c.textMuted }]}>{label}</Text> : null}
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: c.inputBg,
            borderColor: focused ? c.primary : c.inputBorder,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        {icon && <Ionicons name={icon} size={18} color={focused ? c.primary : c.textFaint} style={styles.icon} />}
        <TextInput
          style={[styles.input, { color: c.text }, style]}
          placeholderTextColor={c.textFaint}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          {...props}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginLeft: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, paddingHorizontal: 14 },
  icon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 13, fontSize: 15 },
});
