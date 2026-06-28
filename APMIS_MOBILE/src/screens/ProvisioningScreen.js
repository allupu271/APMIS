import { useState } from 'react';
import {
  View, Text, TextInput, FlatList,
  TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
  KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { scanForDevices, stopScan, provisionDevice } from '../services/bleService';
import { usePump } from '../context/PumpContext';

export default function ProvisioningScreen({ navigation }) {
  const { idToken } = usePump();
  const [devices, setDevices] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [provisioning, setProvisioning] = useState(false);

  function startScan() {
    setDevices([]);
    setSelectedDevice(null);
    setScanning(true);

    scanForDevices((device) => {
      if (!device.name?.startsWith('APMIS_')) return;
      const parsedDeviceId = device.name.slice('APMIS_'.length);
      setDevices((prev) => {
        if (prev.find((d) => d.id === device.id)) return prev;
        return [...prev, { ...device, parsedDeviceId }];
      });
    });

    // Stop scan after 10 seconds
    setTimeout(() => {
      stopScan();
      setScanning(false);
    }, 10000);
  }

  async function handleProvision() {
    if (!selectedDevice || !ssid || !password) {
      Alert.alert('Missing info', 'Select a device and enter WiFi credentials.');
      return;
    }

    try {
      setProvisioning(true);
      await provisionDevice(selectedDevice, ssid, password);

      try {
        const response = await fetch('https://apmis-production-f541.up.railway.app/devices/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ deviceId: selectedDevice.parsedDeviceId, name: 'My APMIS' }),
        });
        if (!response.ok) {
          console.error('Device register failed:', await response.text());
        }
      } catch (err) {
        console.error('Device register error:', err);
      }

      Alert.alert('Done', 'ESP32 provisioned! It will reboot and connect to WiFi.');
      navigation.navigate('Dashboard');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setProvisioning(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>First-time ESP Setup</Text>

      <TouchableOpacity style={styles.button} onPress={startScan} disabled={scanning}>
        <Text style={styles.buttonText}>{scanning ? 'Scanning...' : 'Scan for APMIS Devices'}</Text>
      </TouchableOpacity>

      {scanning && <ActivityIndicator style={{ marginTop: 10 }} />}

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        style={styles.list}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.deviceItem, selectedDevice?.id === item.id && styles.deviceSelected]}
            onPress={() => setSelectedDevice(item)}
          >
            <Text style={styles.deviceText}>{item.name || item.id}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={!scanning && <Text style={styles.hint}>No devices found yet.</Text>}
      />

      {selectedDevice && (
        <View style={styles.credentialsBox}>
          <Text style={styles.label}>WiFi SSID</Text>
          <TextInput style={styles.input} value={ssid} onChangeText={setSsid} placeholder="Your WiFi name" />

          <Text style={styles.label}>Password</Text>
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Your WiFi password" secureTextEntry />

          <TouchableOpacity style={styles.button} onPress={handleProvision} disabled={provisioning}>
            <Text style={styles.buttonText}>{provisioning ? 'Provisioning...' : 'Send to ESP32'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, styles.skipButton]}
        onPress={() => navigation.navigate('Dashboard')}
      >
        <Text style={styles.buttonText}>Skip to Dashboard</Text>
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  button: { backgroundColor: '#2e7d32', padding: 14, borderRadius: 8, alignItems: 'center', marginVertical: 8 },
  skipButton: { marginTop: 20, backgroundColor: '#666' },
  buttonText: { color: '#fff', fontSize: 16 },
  list: { maxHeight: 200, marginVertical: 10 },
  deviceItem: { padding: 12, borderWidth: 1, borderColor: '#ccc', borderRadius: 6, marginBottom: 6 },
  deviceSelected: { borderColor: '#2e7d32', backgroundColor: '#e8f5e9' },
  deviceText: { fontSize: 15 },
  hint: { color: '#888', textAlign: 'center', marginTop: 10 },
  credentialsBox: { marginTop: 10 },
  label: { fontSize: 14, marginBottom: 4, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 10, fontSize: 15 },
});