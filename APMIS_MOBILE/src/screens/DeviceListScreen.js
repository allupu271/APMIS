import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Alert, RefreshControl, ScrollView,
} from 'react-native';
import { KeyboardProvider, KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePump } from '../context/PumpContext';
import { useTheme } from '../theme/ThemeContext';
import { scanForDevices, stopScan, provisionDevice } from '../services/bleService';
import { Screen, Card, Button, Field, ThemeToggle, EmptyState, PressableScale } from '../components';

const API = 'https://apmis-production-f541.up.railway.app';

export default function DeviceListScreen({ navigation }) {
  const { idToken, signOut } = usePump();
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [bleDevices, setBleDevices] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [selectedBleDevice, setSelectedBleDevice] = useState(null);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [provisioning, setProvisioning] = useState(false);

  async function fetchDevices() {
    try {
      const res = await fetch(`${API}/devices`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        setDevices(await res.json());
      } else {
        console.error('Failed to fetch devices:', await res.text());
      }
    } catch (err) {
      console.error('Fetch devices error:', err);
    }
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchDevices().finally(() => setLoading(false));
    }, [idToken])
  );

  async function onRefresh() {
    setRefreshing(true);
    await fetchDevices();
    setRefreshing(false);
  }

  function openProvisioningModal() {
    setBleDevices([]);
    setSelectedBleDevice(null);
    setSsid('');
    setPassword('');
    setModalVisible(true);
    startBleScan();
  }

  function startBleScan() {
    setBleDevices([]);
    setScanning(true);
    scanForDevices((device) => {
      if (!device.name?.startsWith('APMIS_')) return;
      const parsedDeviceId = device.name.slice('APMIS_'.length);
      setBleDevices((prev) => {
        if (prev.find((d) => d.id === device.id)) return prev;
        return [...prev, { device, id: device.id, name: device.name, parsedDeviceId }];
      });
    });
    setTimeout(() => {
      stopScan();
      setScanning(false);
    }, 10000);
  }

  async function handleProvision() {
    if (!selectedBleDevice || !ssid || !password) {
      Alert.alert('Missing info', 'Select a device and enter WiFi credentials.');
      return;
    }
    try {
      setProvisioning(true);
      await provisionDevice(selectedBleDevice.device, ssid, password);

      try {
        const res = await fetch(`${API}/devices/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ deviceId: selectedBleDevice.parsedDeviceId, name: 'My APMIS' }),
        });
        if (!res.ok) console.error('Device register failed:', await res.text());
      } catch (err) {
        console.error('Device register error:', err);
      }

      setModalVisible(false);
      Alert.alert('Done', 'ESP32 provisioned! It will reboot and connect to WiFi.');
      await fetchDevices();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setProvisioning(false);
    }
  }

  function closeModal() {
    stopScan();
    setModalVisible(false);
  }

  function formatLastSeen(ts) {
    if (!ts) return 'Never';
    const date = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts);
    const diff = Date.now() - date.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  // Online status comes from the server's live WebSocket connection map.
  // Fall back to a recent-lastSeen heuristic only for older servers that
  // don't yet send the `online` flag.
  function isOnline(item) {
    if (typeof item.online === 'boolean') return item.online;
    const ts = item.lastSeen;
    if (!ts) return false;
    const date = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts);
    return Date.now() - date.getTime() < 120000;
  }

  return (
    <Screen edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: c.textMuted }]}>Welcome back</Text>
          <Text style={[styles.title, { color: c.text }]}>My Devices</Text>
        </View>
        <View style={styles.headerActions}>
          <ThemeToggle />
          <PressableScale
            onPress={signOut}
            style={[styles.iconBtn, { backgroundColor: c.dangerSoft }]}
            hitSlop={8}
          >
            <Ionicons name="log-out-outline" size={20} color={c.danger} />
          </PressableScale>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color={c.primary} />
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => item.id ?? item.deviceId}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 110 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} />
          }
          renderItem={({ item, index }) => {
            const online = isOnline(item);
            return (
              <Animated.View entering={FadeInDown.duration(400).delay(index * 70)}>
                <Card
                  style={styles.deviceCard}
                  onPress={() => navigation.navigate('DeviceDashboard', {
                    deviceId: item.id ?? item.deviceId,
                    deviceName: item.name ?? item.id,
                  })}
                >
                  <LinearGradient
                    colors={c.primaryGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.deviceIcon}
                  >
                    <Ionicons name="hardware-chip" size={26} color="#fff" />
                  </LinearGradient>
                  <View style={styles.deviceInfo}>
                    <Text style={[styles.deviceName, { color: c.text }]} numberOfLines={1}>
                      {item.name ?? item.id}
                    </Text>
                    <View style={styles.deviceMeta}>
                      <View style={[styles.statusDot, { backgroundColor: online ? c.success : c.textFaint }]} />
                      <Text style={[styles.lastSeen, { color: c.textMuted }]}>
                        {online ? 'Online' : `Last seen ${formatLastSeen(item.lastSeen)}`}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color={c.textFaint} />
                </Card>
              </Animated.View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="hardware-chip-outline"
              title="No devices yet"
              subtitle="Add your first APMIS controller to start monitoring your plants."
            />
          }
        />
      )}

      <Animated.View entering={FadeIn.delay(200)} style={[styles.fabWrap, { bottom: insets.bottom + 20 }]}>
        <PressableScale onPress={openProvisioningModal} style={styles.fab}>
          <LinearGradient
            colors={c.primaryGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabInner}
          >
            <Ionicons name="add" size={24} color="#fff" />
            <Text style={styles.fabText}>Add ESP32</Text>
          </LinearGradient>
        </PressableScale>
      </Animated.View>

      <Modal visible={modalVisible} animationType="slide" onRequestClose={closeModal} transparent statusBarTranslucent>
        <KeyboardProvider statusBarTranslucent navigationBarTranslucent preserveEdgeToEdge>
          <View style={[styles.modalBackdrop, { backgroundColor: c.overlay }]}>
            <KeyboardAvoidingView behavior="padding" style={[styles.sheet, { backgroundColor: c.bg }]}>
              <View style={[styles.handle, { backgroundColor: c.cardBorder }]} />
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
              >
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: c.text }]}>Add ESP32 Device</Text>
                  <TouchableOpacity onPress={closeModal} hitSlop={10}>
                    <Ionicons name="close" size={24} color={c.textMuted} />
                  </TouchableOpacity>
                </View>

                <View style={styles.scanRow}>
                  <Text style={[styles.sectionLabel, { color: c.textMuted }]}>
                    Nearby devices
                  </Text>
                  <PressableScale onPress={startBleScan} disabled={scanning} style={styles.rescan}>
                    <Ionicons name="refresh" size={15} color={c.primary} />
                    <Text style={[styles.rescanText, { color: c.primary }]}>
                      {scanning ? 'Scanning…' : 'Rescan'}
                    </Text>
                  </PressableScale>
                </View>

                {scanning && <ActivityIndicator style={{ marginVertical: 8 }} color={c.primary} />}

                <View style={{ gap: 8, marginTop: 4 }}>
                  {bleDevices.map((item) => {
                    const sel = selectedBleDevice?.id === item.id;
                    return (
                      <PressableScale
                        key={item.id}
                        onPress={() => setSelectedBleDevice(item)}
                        style={[
                          styles.bleItem,
                          { backgroundColor: c.card, borderColor: sel ? c.primary : c.cardBorder },
                        ]}
                      >
                        <Ionicons
                          name={sel ? 'radio-button-on' : 'radio-button-off'}
                          size={20}
                          color={sel ? c.primary : c.textFaint}
                        />
                        <Text style={[styles.bleItemText, { color: c.text }]}>{item.name || item.id}</Text>
                      </PressableScale>
                    );
                  })}
                  {!scanning && bleDevices.length === 0 && (
                    <Text style={[styles.hint, { color: c.textFaint }]}>No APMIS_ devices found.</Text>
                  )}
                </View>

                {selectedBleDevice && (
                  <Animated.View entering={FadeInDown.duration(300)} style={styles.credentials}>
                    <Field
                      label="WiFi SSID"
                      icon="wifi"
                      value={ssid}
                      onChangeText={setSsid}
                      placeholder="Your WiFi name"
                      autoCapitalize="none"
                    />
                    <Field
                      label="Password"
                      icon="lock-closed-outline"
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Your WiFi password"
                      secureTextEntry
                    />
                    <Button
                      title={provisioning ? 'Provisioning…' : 'Send to ESP32'}
                      icon="send"
                      onPress={handleProvision}
                      loading={provisioning}
                      style={{ marginTop: 8 }}
                    />
                  </Animated.View>
                )}
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </KeyboardProvider>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  greeting:      { fontSize: 14, fontWeight: '500' },
  title:         { fontSize: 30, fontWeight: '800', marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn:       { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  list:          { padding: 16, paddingTop: 8 },
  deviceCard:    { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  deviceIcon:    { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  deviceInfo:    { flex: 1 },
  deviceName:    { fontSize: 17, fontWeight: '700' },
  deviceMeta:    { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  statusDot:     { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  lastSeen:      { fontSize: 13 },
  fabWrap:       { position: 'absolute', left: 20, right: 20 },
  fab:           { borderRadius: 18, shadowColor: '#2E7D32', shadowOpacity: 0.4, shadowOffset: { width: 0, height: 8 }, shadowRadius: 16, elevation: 8 },
  fabInner:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 18, gap: 8 },
  fabText:       { color: '#fff', fontSize: 17, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet:         { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, maxHeight: '88%' },
  handle:        { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  modalHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle:    { fontSize: 21, fontWeight: '800' },
  scanRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel:  { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  rescan:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  rescanText:    { fontSize: 14, fontWeight: '600' },
  bleItem:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderWidth: 1.5, borderRadius: 14 },
  bleItemText:   { fontSize: 15, fontWeight: '500' },
  hint:          { textAlign: 'center', marginTop: 10, fontSize: 14 },
  credentials:   { marginTop: 20, gap: 14 },
});
