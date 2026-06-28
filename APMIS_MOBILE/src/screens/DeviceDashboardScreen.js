import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { FadeInDown, FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePump } from '../context/PumpContext';
import { useTheme } from '../theme/ThemeContext';
import { connect, sendMessage, disconnect } from '../services/wsService';
import {
  Card, Button, Field, Toggle, MoistureRing, PlantTile, StatusPill, EmptyState, PressableScale,
} from '../components';

const API = 'https://apmis-production-f541.up.railway.app';

export default function DeviceDashboardScreen({ route, navigation }) {
  const { deviceId, deviceName } = route.params;
  const { idToken } = usePump();
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();

  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState(null);
  const [editCustomName, setEditCustomName] = useState('');
  const [editSensorPin, setEditSensorPin] = useState('');
  const [editPumpPin, setEditPumpPin] = useState('');
  const [editMin, setEditMin] = useState('');
  const [editMax, setEditMax] = useState('');

  useEffect(() => {
    fetchSlots();
    connect(handleMessage, setConnected, idToken, deviceId);
    return () => disconnect();
  }, []);

  async function fetchSlots() {
    try {
      const res = await fetch(`${API}/devices/${deviceId}/plants`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSlots(data.map(slot => ({
          ...slot,
          autoWater: slot.autoWater ?? false,
          moisture: null,
          pumpOn: false,
          pumpCooldown: false,
        })));
      } else {
        console.error('Failed to fetch plants:', await res.text());
      }
    } catch (err) {
      console.error('Fetch plants error:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleMessage(msg) {
    if (msg.type === 'moisture_update') {
      setSlots(prev => prev.map(slot =>
        (!msg.slotId || slot.id === msg.slotId)
          ? { ...slot, moisture: msg.moisture ?? slot.moisture }
          : slot
      ));
    } else if (msg.type === 'status_update') {
      const pumpOn = msg.status === 'pump_on';
      setSlots(prev => prev.map(slot =>
        (!msg.slotId || slot.id === msg.slotId)
          ? { ...slot, pumpOn }
          : slot
      ));
    }
  }

  function togglePump(slot) {
    if (slot.pumpCooldown) return;
    const action = slot.pumpOn ? 'pump_off' : 'pump_on';
    const sent = sendMessage({ action, slotId: slot.id, pumpPin: slot.pumpPin });
    if (!sent) return;
    setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, pumpOn: !s.pumpOn, pumpCooldown: true } : s));
    setTimeout(() => {
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, pumpCooldown: false } : s));
    }, 2000);
  }

  async function toggleAutoWater(slot, value) {
    setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, autoWater: value } : s));
    try {
      await fetch(`${API}/devices/${deviceId}/plants/${slot.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ autoWater: value }),
      });
      sendMessage({ action: 'set_auto_water', enabled: value, slotId: slot.id });
    } catch {
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, autoWater: !value } : s));
    }
  }

  function openEdit(slot) {
    if (editingSlotId === slot.id) {
      setEditingSlotId(null);
      return;
    }
    setEditingSlotId(slot.id);
    setEditCustomName(slot.customName ?? '');
    setEditSensorPin(String(slot.sensorPin ?? ''));
    setEditPumpPin(String(slot.pumpPin ?? ''));
    setEditMin(String(slot.minMoisture ?? ''));
    setEditMax(String(slot.maxMoisture ?? ''));
  }

  function confirmRemove(slot) {
    Alert.alert(
      'Remove plant',
      `Remove "${slot.customName || slot.plantName || slot.id}" from this device?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeSlot(slot) },
      ]
    );
  }

  async function removeSlot(slot) {
    try {
      const res = await fetch(`${API}/devices/${deviceId}/plants/${slot.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        setSlots(prev => prev.filter(s => s.id !== slot.id));
        setEditingSlotId(null);
      } else {
        Alert.alert('Error', await res.text());
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  }

  async function saveEdit(slot) {
    const minVal = parseInt(editMin, 10);
    const maxVal = parseInt(editMax, 10);
    if (isNaN(minVal) || isNaN(maxVal) || minVal < 0 || maxVal > 100 || minVal >= maxVal) {
      Alert.alert('Invalid', 'Min must be 0–100 and less than Max.');
      return;
    }
    const sensorPinVal = parseInt(editSensorPin, 10);
    const pumpPinVal = parseInt(editPumpPin, 10);
    if (isNaN(sensorPinVal) || isNaN(pumpPinVal)) {
      Alert.alert('Invalid', 'Sensor and pump pin must be numbers.');
      return;
    }
    try {
      const res = await fetch(`${API}/devices/${deviceId}/plants/${slot.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          customName: editCustomName.trim() || null,
          sensorPin: sensorPinVal,
          pumpPin: pumpPinVal,
          minMoisture: minVal,
          maxMoisture: maxVal,
        }),
      });
      if (res.ok) {
        setSlots(prev => prev.map(s =>
          s.id === slot.id ? {
            ...s,
            customName: editCustomName.trim() || null,
            sensorPin: sensorPinVal,
            pumpPin: pumpPinVal,
            minMoisture: minVal,
            maxMoisture: maxVal,
          } : s
        ));
        setEditingSlotId(null);
      } else {
        Alert.alert('Error', await res.text());
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  }

  function moistureLabel(slot) {
    if (slot.moisture == null) return 'Waiting for reading…';
    if (slot.pumpOn) return 'Watering now';
    if (slot.moisture < 30) return 'Soil is dry';
    if (slot.moisture < 60) return 'Nicely moist';
    return 'Well watered';
  }

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
    >
        <View style={styles.topRow}>
          <View style={styles.topInfo}>
            <Text style={[styles.deviceLabel, { color: c.textMuted }]}>Controller</Text>
            <Text style={[styles.deviceName, { color: c.text }]} numberOfLines={1}>{deviceName}</Text>
          </View>
          <StatusPill connected={connected} />
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 60 }} size="large" color={c.primary} />
        ) : slots.length === 0 ? (
          <EmptyState
            icon="leaf-outline"
            title="No plants yet"
            subtitle="Add a plant to start tracking soil moisture and automate watering."
          />
        ) : (
          slots.map((slot, index) => {
            const editing = editingSlotId === slot.id;
            return (
              <Animated.View
                key={slot.id}
                entering={FadeInDown.duration(400).delay(index * 70)}
                style={{ marginBottom: 14 }}
              >
                <Card active={editing} style={styles.plantCard}>
                  <PressableScale onPress={() => openEdit(slot)} style={styles.cardTop} scaleTo={0.99} dimTo={0.95}>
                    <PlantTile name={slot.customName || slot.plantName || slot.id} imageUrl={slot.imageUrl ?? null} size={56} />
                    <View style={styles.cardInfo}>
                      <Text style={[styles.plantName, { color: c.text }]} numberOfLines={1}>
                        {slot.customName || slot.plantName || slot.id}
                      </Text>
                      <Text style={[styles.plantSub, { color: c.textMuted }]} numberOfLines={1}>
                        {moistureLabel(slot)}
                      </Text>
                      <View style={styles.editHint}>
                        <Ionicons name={editing ? 'chevron-up' : 'options-outline'} size={13} color={c.textFaint} />
                        <Text style={[styles.editHintText, { color: c.textFaint }]}>
                          {editing ? 'Close' : 'Configure'}
                        </Text>
                      </View>
                    </View>
                    <MoistureRing pct={slot.moisture} size={72} gradientId={`ring-${slot.id}`} />
                  </PressableScale>

                  <View style={[styles.controls, { borderTopColor: c.cardBorder }]}>
                    <View style={styles.control}>
                      <View style={styles.controlLabelRow}>
                        <Ionicons name="water" size={15} color={slot.pumpOn ? c.accent : c.textFaint} />
                        <Text style={[styles.controlLabel, { color: c.textMuted }]}>
                          Pump {slot.pumpOn ? 'ON' : 'OFF'}
                        </Text>
                      </View>
                      <Toggle
                        value={slot.pumpOn}
                        onValueChange={() => togglePump(slot)}
                        disabled={!connected || slot.pumpCooldown}
                        activeColor={c.accent}
                      />
                    </View>
                    <View style={[styles.controlDivider, { backgroundColor: c.cardBorder }]} />
                    <View style={styles.control}>
                      <View style={styles.controlLabelRow}>
                        <Ionicons name="sparkles" size={15} color={slot.autoWater ? c.primary : c.textFaint} />
                        <Text style={[styles.controlLabel, { color: c.textMuted }]}>Auto-water</Text>
                      </View>
                      <Toggle
                        value={slot.autoWater}
                        onValueChange={val => toggleAutoWater(slot, val)}
                        activeColor={c.primary}
                      />
                    </View>
                  </View>

                  {editing && (
                    <Animated.View
                      entering={FadeIn.duration(220)}
                      exiting={FadeOut.duration(150)}
                      style={[styles.editPanel, { borderTopColor: c.cardBorder }]}
                    >
                      <Field
                        label="Custom name"
                        value={editCustomName}
                        onChangeText={setEditCustomName}
                        placeholder={slot.plantName || 'e.g. Balcony Tomato'}
                      />
                      <View style={styles.editRow}>
                        <Field
                          containerStyle={styles.editHalf}
                          label="Sensor pin"
                          value={editSensorPin}
                          onChangeText={setEditSensorPin}
                          keyboardType="numeric"
                          placeholder="e.g. 34"
                        />
                        <Field
                          containerStyle={styles.editHalf}
                          label="Pump pin"
                          value={editPumpPin}
                          onChangeText={setEditPumpPin}
                          keyboardType="numeric"
                          placeholder="e.g. 25"
                        />
                      </View>
                      <View style={styles.editRow}>
                        <Field
                          containerStyle={styles.editHalf}
                          label="Min %"
                          value={editMin}
                          onChangeText={setEditMin}
                          keyboardType="numeric"
                          maxLength={3}
                          placeholder="0–100"
                        />
                        <Field
                          containerStyle={styles.editHalf}
                          label="Max %"
                          value={editMax}
                          onChangeText={setEditMax}
                          keyboardType="numeric"
                          maxLength={3}
                          placeholder="0–100"
                        />
                      </View>
                      <Button title="Save changes" icon="checkmark" onPress={() => saveEdit(slot)} style={{ marginTop: 6 }} />
                      <Button title="Remove plant" variant="ghost" icon="trash-outline" onPress={() => confirmRemove(slot)} textStyle={{ color: c.danger }} style={{ marginTop: 4 }} />
                    </Animated.View>
                  )}
                </Card>
              </Animated.View>
            );
          })
        )}

        <Button
          title="Add Plant"
          icon="add"
          onPress={() => navigation.navigate('AddPlant', { deviceId })}
          style={{ marginTop: 10 }}
        />
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  content:        { padding: 16 },
  topRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  topInfo:        { flex: 1, marginRight: 12 },
  deviceLabel:    { fontSize: 13, fontWeight: '500' },
  deviceName:     { fontSize: 22, fontWeight: '800', marginTop: 2 },
  plantCard:      { padding: 0, overflow: 'hidden' },
  cardTop:        { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  cardInfo:       { flex: 1 },
  plantName:      { fontSize: 17, fontWeight: '700' },
  plantSub:       { fontSize: 13, marginTop: 3 },
  editHint:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  editHintText:   { fontSize: 12, fontWeight: '600' },
  controls:       { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  control:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  controlLabelRow:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  controlLabel:   { fontSize: 13, fontWeight: '600' },
  controlDivider: { width: 1, height: 28, marginHorizontal: 14 },
  editPanel:      { borderTopWidth: 1, padding: 16, gap: 12 },
  editRow:        { flexDirection: 'row', gap: 12 },
  editHalf:       { flex: 1 },
});
