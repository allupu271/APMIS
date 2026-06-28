// BLE provisioning service
// Handles scanning for APMIS devices and sending WiFi credentials

import { BleManager } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

// These UUIDs MUST match the ESP32 code exactly!
// Service UUID matches ESP32: BLE_UUID128_INIT(0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12, 0x34, 0x12, 0x34, 0x12, 0x34, 0x12, 0x78, 0x56, 0x34, 0x12)
const APMIS_SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
// Credentials characteristic UUID (write-only)
const WIFI_CRED_CHAR_UUID = '12345678-1234-1234-1234-123456789abd';

const manager = new BleManager();

// A BLE error that means the ESP32 received the credentials and dropped the
// link to reboot and apply WiFi. These are the expected, successful outcome of
// provisioning and must NOT be surfaced to the user as a failure.
// Covers ble-plx codes: 201 DeviceDisconnected, 205 DeviceNotConnected,
// 2 OperationCancelled — plus message fallbacks for robustness across platforms.
function isExpectedDisconnect(err) {
  const code = err?.errorCode;
  const msg = (err?.message || '').toLowerCase();
  return (
    code === 201 ||
    code === 205 ||
    code === 2 ||
    msg.includes('disconnect') ||
    msg.includes('not connected') ||
    msg.includes('cancel')
  );
}

// Scan for nearby APMIS devices
// onDeviceFound is called each time a new device is discovered
export function scanForDevices(onDeviceFound) {
  manager.startDeviceScan(null, null, (error, device) => {
    if (error) {
      console.error('BLE scan error', error);
      return;
    }
    // Filter to only APMIS devices by name
    if (device.name && device.name.startsWith('APMIS')) {
      onDeviceFound(device);
    }
  });
}

export function stopScan() {
  manager.stopDeviceScan();
}

// Connect to device, send WiFi credentials as JSON, then disconnect
export async function provisionDevice(device, ssid, password) {
  let connected = null;
  try {
    console.log('Connecting to ESP32...');
    connected = await device.connect();
    console.log('Connected!');
    
    // Wait for stable connection
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('Discovering services...');
    await connected.discoverAllServicesAndCharacteristics();
    console.log('Services discovered. Waiting before write...');
    
    // Wait for device to be fully ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create JSON payload with credentials
    const credentialPayload = JSON.stringify({
      ssid: ssid,
      password: password
    });
    const encodedPayload = Buffer.from(credentialPayload).toString('base64');
    
    console.log('Sending credentials (', credentialPayload.length, 'bytes)...');
    
    // Try write with response first (more reliable). With up-to-date firmware
    // the ESP32 acknowledges the write before rebooting, so this resolves
    // cleanly. If the link drops first, that still means it received the creds.
    try {
      await connected.writeCharacteristicWithResponseForService(
        APMIS_SERVICE_UUID,
        WIFI_CRED_CHAR_UUID,
        encodedPayload
      );
      console.log('✓ Credentials sent with response!');
    } catch (e) {
      if (isExpectedDisconnect(e)) {
        // ESP32 rebooted before acknowledging — credentials were received.
        console.log('Link dropped after write — ESP32 received credentials and is rebooting.');
      } else {
        // Genuine write failure (e.g. GATT issue): retry without response.
        console.log('Write with response failed (', e.message, ') — trying without response...');
        try {
          await connected.writeCharacteristicWithoutResponseForService(
            APMIS_SERVICE_UUID,
            WIFI_CRED_CHAR_UUID,
            encodedPayload
          );
          console.log('✓ Credentials sent without response!');
        } catch (e2) {
          if (isExpectedDisconnect(e2)) {
            console.log('Link dropped after write — ESP32 received credentials and is rebooting.');
          } else {
            throw e2;
          }
        }
      }
    }
    
    // Give ESP32 time to receive, process, and restart
    console.log('Waiting for ESP32 to process...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Try to disconnect gracefully
    try {
      await connected.cancelConnection();
    } catch (e) {
      // Device may have already disconnected
    }
    console.log('Done!');
  } catch (error) {
    console.error('Provisioning error:', error.message);
    if (connected) {
      try {
        await connected.cancelConnection();
      } catch (e) {
        // Already disconnected
      }
    }
    throw error;
  }
}