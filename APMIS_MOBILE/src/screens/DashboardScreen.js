import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Switch, StyleSheet } from 'react-native';
import { usePump } from '../context/PumpContext';
import { connect, sendMessage, disconnect } from '../services/wsService';

export default function DashboardScreen() {
  const { pumpOn, setPumpOn, connected, setConnected, moisture, setMoisture, idToken, signOut } = usePump();

  const [threshold, setThreshold] = useState(null);
  const [autoWater, setAutoWater] = useState(false);
  const [thresholdInput, setThresholdInput] = useState('');
  const [thresholdError, setThresholdError] = useState('');

  useEffect(() => {
    connect(handleMessage, setConnected, idToken);
    return () => disconnect();
  }, []);

  function handleMessage(msg) {
    if (msg.type === 'status_update') {
      if (msg.status === 'pump_on') setPumpOn(true);
      if (msg.status === 'pump_off') setPumpOn(false);
    } else if (msg.type === 'moisture_update') {
      if (msg.moisture !== undefined) setMoisture(msg.moisture);
      if (msg.threshold !== undefined) setThreshold(msg.threshold);
      if (msg.auto_water !== undefined) setAutoWater(msg.auto_water);
    }
  }

  function togglePump() {
    sendMessage({ action: 'pump_toggle', pump_id: 1 });
  }

  function submitThreshold() {
    const val = parseInt(thresholdInput, 10);
    if (isNaN(val) || val < 0 || val > 100) {
      setThresholdError('Enter a number between 0 and 100');
      return;
    }
    setThresholdError('');
    sendMessage({ action: 'set_threshold', threshold: val });
    setThresholdInput('');
  }

  function toggleAutoWater(value) {
    // Optimistically update local state so the switch feels instant
    setAutoWater(value);
    sendMessage({ action: 'set_auto_water', enabled: value });
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>APMIS Dashboard</Text>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* Connection status */}
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Server</Text>
        <Text style={[styles.statusValue, connected ? styles.on : styles.off]}>
          {connected ? 'Connected' : 'Disconnected'}
        </Text>
      </View>

      {/* Moisture reading */}
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Moisture</Text>
        <Text style={styles.statusValue}>{moisture !== null ? `${moisture}%` : '—'}</Text>
      </View>

      {/* Current threshold (read-only display) */}
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Auto-water below</Text>
        <Text style={styles.statusValue}>{threshold !== null ? `${threshold}%` : '—'}</Text>
      </View>

      {/* Auto-water toggle */}
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.cardLabel}>Auto-water</Text>
            <Text style={styles.cardHint}>
              {autoWater ? 'Pump runs automatically' : 'Manual control only'}
            </Text>
          </View>
          <Switch
            value={autoWater}
            onValueChange={toggleAutoWater}
            disabled={!connected}
            trackColor={{ false: '#ccc', true: '#2e7d32' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Set threshold */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Set threshold</Text>
        <View style={styles.thresholdRow}>
          <TextInput
            style={styles.input}
            value={thresholdInput}
            onChangeText={setThresholdInput}
            keyboardType="numeric"
            placeholder="0 – 100"
            maxLength={3}
          />
          <TouchableOpacity
            style={[styles.button, styles.buttonOn, !connected && styles.buttonDisabled]}
            onPress={submitThreshold}
            disabled={!connected}
          >
            <Text style={styles.buttonText}>Set</Text>
          </TouchableOpacity>
        </View>
        {thresholdError ? <Text style={styles.errorText}>{thresholdError}</Text> : null}
      </View>

      {/* Pump manual control */}
      <View style={styles.pumpCard}>
        <Text style={styles.pumpLabel}>Pump</Text>
        <Text style={[styles.pumpStatus, pumpOn ? styles.on : styles.off]}>
          {pumpOn ? 'ON' : 'OFF'}
        </Text>
        <TouchableOpacity
          style={[styles.button, pumpOn ? styles.buttonOff : styles.buttonOn, !connected && styles.buttonDisabled]}
          onPress={togglePump}
          disabled={!connected}
        >
          <Text style={styles.buttonText}>{pumpOn ? 'Turn Off' : 'Turn On'}</Text>
        </TouchableOpacity>
        {!connected && <Text style={styles.hint}>Connect to server to control pump</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, padding: 20, backgroundColor: '#fff' },
  headerRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title:          { fontSize: 22, fontWeight: 'bold' },
  signOutText:    { fontSize: 14, color: '#c62828' },
  statusRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  statusLabel:    { fontSize: 16, color: '#555' },
  statusValue:    { fontSize: 16, fontWeight: '600' },
  on:             { color: '#2e7d32' },
  off:            { color: '#c62828' },
  card:           { marginTop: 16, padding: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 12 },
  cardLabel:      { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 4 },
  cardHint:       { fontSize: 13, color: '#888' },
  toggleRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  thresholdRow:   { flexDirection: 'row', gap: 10, marginTop: 8 },
  input:          { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 16 },
  errorText:      { marginTop: 6, color: '#c62828', fontSize: 13 },
  pumpCard:       { marginTop: 16, padding: 20, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, alignItems: 'center' },
  pumpLabel:      { fontSize: 18, color: '#555', marginBottom: 8 },
  pumpStatus:     { fontSize: 48, fontWeight: 'bold', marginBottom: 20 },
  button:         { padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonOn:       { backgroundColor: '#2e7d32' },
  buttonOff:      { backgroundColor: '#c62828' },
  buttonDisabled: { backgroundColor: '#aaa' },
  buttonText:     { color: '#fff', fontSize: 16 },
  hint:           { marginTop: 10, color: '#888', fontSize: 13 },
});