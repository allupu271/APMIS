import { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePump } from '../context/PumpContext';
import { useTheme } from '../theme/ThemeContext';
import { Card, Button, Field, PlantTile, PressableScale } from '../components';

const API = 'https://apmis-production-f541.up.railway.app';

export default function AddPlantScreen({ route, navigation }) {
  const { deviceId } = route.params;
  const { idToken } = usePump();
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();

  const [globalPlants, setGlobalPlants] = useState([]);
  const [customPlants, setCustomPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlant, setSelectedPlant] = useState(null);
  const [customName, setCustomName] = useState('');
  const [sensorPin, setSensorPin] = useState('');
  const [pumpPin, setPumpPin] = useState('');
  const [minMoisture, setMinMoisture] = useState('');
  const [maxMoisture, setMaxMoisture] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchPlants();
    }, [idToken])
  );

  async function fetchPlants() {
    setLoading(true);
    try {
      const [globalRes, customRes] = await Promise.all([
        fetch(`${API}/plants`, { headers: { Authorization: `Bearer ${idToken}` } }),
        fetch(`${API}/users/plants`, { headers: { Authorization: `Bearer ${idToken}` } }),
      ]);
      if (globalRes.ok) setGlobalPlants(await globalRes.json());
      if (customRes.ok) setCustomPlants(await customRes.json());
    } catch (err) {
      console.error('Fetch plants error:', err);
    } finally {
      setLoading(false);
    }
  }

  function selectPlant(plant) {
    if (selectedPlant?.id === plant.id) {
      setSelectedPlant(null);
      return;
    }
    setSelectedPlant(plant);
    setCustomName('');
    setMinMoisture(String(plant.minMoisture ?? ''));
    setMaxMoisture(String(plant.maxMoisture ?? ''));
  }

  async function handleAdd() {
    if (!selectedPlant) { Alert.alert('Select a plant type first.'); return; }
    if (!sensorPin || !pumpPin) { Alert.alert('Enter sensor pin and pump pin.'); return; }
    const minVal = parseInt(minMoisture, 10);
    const maxVal = parseInt(maxMoisture, 10);
    if (isNaN(minVal) || isNaN(maxVal) || minVal < 0 || maxVal > 100 || minVal >= maxVal) {
      Alert.alert('Invalid', 'Min must be 0–100 and less than Max.');
      return;
    }
    try {
      setSaving(true);
      const res = await fetch(`${API}/devices/${deviceId}/plants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          plantId: selectedPlant.id,
          customName: customName.trim() || null,
          sensorPin: parseInt(sensorPin, 10),
          pumpPin: parseInt(pumpPin, 10),
          minMoisture: minVal,
          maxMoisture: maxVal,
        }),
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

  async function deleteCustomPlant(plant) {
    Alert.alert(
      'Delete plant',
      `Delete "${plant.name}" from your custom plants?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              const res = await fetch(`${API}/users/plants/${plant.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${idToken}` },
              });
              if (res.ok) {
                setCustomPlants(prev => prev.filter(p => p.id !== plant.id));
                if (selectedPlant?.id === plant.id) setSelectedPlant(null);
              } else {
                Alert.alert('Error', await res.text());
              }
            } catch (err) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  }

  function PlantChip({ plant, deletable }) {
    const isSelected = selectedPlant?.id === plant.id;
    return (
      <PressableScale
        onPress={() => selectPlant(plant)}
        style={[
          styles.chip,
          { backgroundColor: c.card, borderColor: isSelected ? c.primary : c.cardBorder },
        ]}
      >
        <PlantTile name={plant.name} size={40} icon="leaf" radius={12} />
        <View style={styles.chipBody}>
          <View style={styles.chipHeader}>
            <Text style={[styles.chipName, { color: c.text }]} numberOfLines={1}>{plant.name}</Text>
            {deletable && (
              <TouchableOpacity onPress={() => deleteCustomPlant(plant)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={c.textFaint} />
              </TouchableOpacity>
            )}
          </View>
          {plant.minMoisture != null && (
            <Text style={[styles.chipSub, { color: c.textMuted }]}>{plant.minMoisture}% – {plant.maxMoisture}%</Text>
          )}
        </View>
        {isSelected && <Ionicons name="checkmark-circle" size={20} color={c.primary} style={styles.chipCheck} />}
      </PressableScale>
    );
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bottomOffset={24}
    >
        <Text style={[styles.sectionTitle, { color: c.text }]}>Standard Plants</Text>
        <View style={styles.grid}>
          {globalPlants.map(p => <PlantChip key={p.id} plant={p} />)}
          {globalPlants.length === 0 && <Text style={[styles.empty, { color: c.textFaint }]}>None available.</Text>}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>My Custom Plants</Text>
          <PressableScale onPress={() => navigation.navigate('CreateCustomPlant')} style={styles.createLink}>
            <Ionicons name="add-circle" size={18} color={c.primary} />
            <Text style={[styles.createLinkText, { color: c.primary }]}>Create</Text>
          </PressableScale>
        </View>
        <View style={styles.grid}>
          {customPlants.map(p => <PlantChip key={p.id} plant={p} deletable />)}
          {customPlants.length === 0 && <Text style={[styles.empty, { color: c.textFaint }]}>None yet.</Text>}
        </View>

        {selectedPlant && (
          <Animated.View entering={FadeInDown.duration(300)}>
            <Card style={styles.configBox}>
              <View style={styles.configHeader}>
                <PlantTile name={selectedPlant.name} size={44} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.configLabel, { color: c.textMuted }]}>Configure</Text>
                  <Text style={[styles.configTitle, { color: c.text }]} numberOfLines={1}>{selectedPlant.name}</Text>
                </View>
              </View>

              <Field label="Custom name (optional)" value={customName} onChangeText={setCustomName} placeholder="e.g. Balcony Tomato" />
              <View style={styles.row}>
                <Field containerStyle={styles.half} label="Sensor pin (ADC)" value={sensorPin} onChangeText={setSensorPin} keyboardType="numeric" placeholder="e.g. 34" />
                <Field containerStyle={styles.half} label="Pump pin (GPIO)" value={pumpPin} onChangeText={setPumpPin} keyboardType="numeric" placeholder="e.g. 25" />
              </View>
              <View style={styles.row}>
                <Field containerStyle={styles.half} label="Min moisture %" value={minMoisture} onChangeText={setMinMoisture} keyboardType="numeric" placeholder="0–100" maxLength={3} />
                <Field containerStyle={styles.half} label="Max moisture %" value={maxMoisture} onChangeText={setMaxMoisture} keyboardType="numeric" placeholder="0–100" maxLength={3} />
              </View>

              <Button
                title={saving ? 'Adding…' : 'Add to ESP32'}
                icon="cloud-upload-outline"
                onPress={handleAdd}
                loading={saving}
                style={{ marginTop: 16 }}
              />
            </Card>
          </Animated.View>
        )}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content:        { padding: 16 },
  sectionTitle:   { fontSize: 18, fontWeight: '800' },
  sectionHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 4 },
  createLink:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  createLinkText: { fontSize: 15, fontWeight: '700' },
  grid:           { gap: 10, marginTop: 12 },
  chip:           { flexDirection: 'row', alignItems: 'center', padding: 10, borderWidth: 1.5, borderRadius: 16, gap: 12 },
  chipBody:       { flex: 1 },
  chipHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chipName:       { fontSize: 15, fontWeight: '700', flex: 1 },
  chipSub:        { fontSize: 12, marginTop: 2 },
  chipCheck:      { marginLeft: 4 },
  empty:          { fontSize: 14, paddingVertical: 8 },
  configBox:      { marginTop: 24 },
  configHeader:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  configLabel:    { fontSize: 12, fontWeight: '600' },
  configTitle:    { fontSize: 18, fontWeight: '800', marginTop: 1 },
  row:            { flexDirection: 'row', gap: 12 },
  half:           { flex: 1 },
});
