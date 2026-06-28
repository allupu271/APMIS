import { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePump } from '../context/PumpContext';
import { useTheme } from '../theme/ThemeContext';
import { Card, Button, Field, PlantTile } from '../components';

const API = 'https://apmis-production-f541.up.railway.app';

export default function CreateCustomPlantScreen({ navigation }) {
  const { idToken } = usePump();
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [minMoisture, setMinMoisture] = useState('');
  const [maxMoisture, setMaxMoisture] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Enter a plant name.'); return; }
    const minVal = parseInt(minMoisture, 10);
    const maxVal = parseInt(maxMoisture, 10);
    if (isNaN(minVal) || isNaN(maxVal) || minVal < 0 || maxVal > 100 || minVal >= maxVal) {
      Alert.alert('Invalid', 'Min must be 0–100 and less than Max.');
      return;
    }
    try {
      setSaving(true);
      const res = await fetch(`${API}/users/plants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ name: name.trim(), minMoisture: minVal, maxMoisture: maxVal }),
      });
      if (res.ok) {
        navigation.goBack();
      } else {
        Alert.alert('Error', await res.text());
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bottomOffset={24}
    >
        <Animated.View entering={FadeInDown.duration(400)} style={styles.hero}>
          <PlantTile name={name || 'new'} size={72} radius={22} />
          <Text style={[styles.heroText, { color: c.textMuted }]}>
            Define a reusable plant type with its ideal moisture range.
          </Text>
        </Animated.View>

        <Card>
          <Field label="Plant name" icon="leaf-outline" value={name} onChangeText={setName} placeholder="e.g. Basil" />
          <View style={styles.row}>
            <Field containerStyle={styles.half} label="Min moisture %" value={minMoisture} onChangeText={setMinMoisture} keyboardType="numeric" placeholder="0–100" maxLength={3} />
            <Field containerStyle={styles.half} label="Max moisture %" value={maxMoisture} onChangeText={setMaxMoisture} keyboardType="numeric" placeholder="0–100" maxLength={3} />
          </View>
          <Button
            title={saving ? 'Saving…' : 'Save Plant'}
            icon="checkmark"
            onPress={handleSave}
            loading={saving}
            style={{ marginTop: 18 }}
          />
        </Card>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  content:  { padding: 16 },
  hero:     { alignItems: 'center', marginVertical: 24 },
  heroText: { fontSize: 14, textAlign: 'center', marginTop: 16, lineHeight: 20, paddingHorizontal: 20 },
  row:      { flexDirection: 'row', gap: 12, marginTop: 4 },
  half:     { flex: 1 },
});
