const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const admin = require('firebase-admin');

// Firebase Admin initialization
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  serviceAccount = require('./serviceAccountKey.json');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const DEVICE_ID = process.env.DEVICE_ID || 'device_1';

async function verifyToken(token) {
  return admin.auth().verifyIdToken(token);
}

const app = express();
app.use(express.json());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let esp32Client = null;
const esp32Clients = new Map(); // deviceId → ws
const pumpStates = new Map();   // deviceId → boolean
const appClients = new Set();

async function sendConfigToEsp(deviceId) {
  const ws = esp32Clients.get(deviceId);
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    const snap = await db.collection('devices').doc(deviceId).collection('plantSlots').get();
    const slots = snap.docs.map(doc => {
      const d = doc.data();
      return {
        slotId:       doc.id,
        sensorPin:    d.sensorPin    ?? null,
        pumpPin:      d.pumpPin      ?? null,
        minMoisture:  d.minMoisture  ?? null,
        maxMoisture:  d.maxMoisture  ?? null,
        autoWater:    d.autoWater    ?? false,
      };
    });
    ws.send(JSON.stringify({ cmd: 'config', slots }));
    console.log(`[config] pushed ${slots.length} slots to ${deviceId}`);
  } catch (err) {
    console.error('sendConfigToEsp error:', err);
  }
}

app.post('/devices/register', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  let uid;
  try {
    const decoded = await verifyToken(token);
    uid = decoded.uid;
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { deviceId, name } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

  const docRef = db.collection('devices').doc(deviceId);
  const existing = await docRef.get();
  if (existing.exists && existing.data().ownerId !== uid) {
    return res.status(403).json({ error: 'Device already registered to another user' });
  }

  await docRef.set({
    ownerId: uid,
    name: name || 'My APMIS',
    registeredAt: admin.firestore.FieldValue.serverTimestamp(),
    lastSeen: admin.firestore.FieldValue.serverTimestamp(),
  });

  return res.json({ success: true });
});

async function authenticate(req, res) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) { res.status(401).json({ error: 'Missing token' }); return null; }
  try {
    const decoded = await verifyToken(token);
    return decoded.uid;
  } catch {
    res.status(401).json({ error: 'Invalid token' });
    return null;
  }
}

app.get('/plants', async (req, res) => {
  const uid = await authenticate(req, res);
  if (!uid) return;
  const snapshot = await db.collection('plants').get();
  const plants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  res.json(plants);
});

app.get('/users/plants', async (req, res) => {
  const uid = await authenticate(req, res);
  if (!uid) return;
  const snapshot = await db.collection('users').doc(uid).collection('customPlants').get();
  const plants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  res.json(plants);
});

app.post('/users/plants', async (req, res) => {
  const uid = await authenticate(req, res);
  if (!uid) return;
  const { name, minMoisture, maxMoisture } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const docRef = await db.collection('users').doc(uid).collection('customPlants').add({
    name,
    minMoisture: minMoisture ?? null,
    maxMoisture: maxMoisture ?? null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  res.json({ id: docRef.id });
});

app.delete('/users/plants/:plantId', async (req, res) => {
  const uid = await authenticate(req, res);
  if (!uid) return;
  const docRef = db.collection('users').doc(uid).collection('customPlants').doc(req.params.plantId);
  const doc = await docRef.get();
  if (!doc.exists) return res.status(404).json({ error: 'Plant not found' });
  await docRef.delete();
  res.json({ success: true });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    esp32_devices: [...esp32Clients.keys()],
    app_clients: appClients.size
  });
});

app.get('/devices', async (req, res) => {
  const uid = await authenticate(req, res);
  if (!uid) return;
  const snapshot = await db.collection('devices').where('ownerId', '==', uid).get();
  const devices = snapshot.docs.map(doc => {
    const { name, lastSeen } = doc.data();
    const ws = esp32Clients.get(doc.id);
    const online = !!ws && ws.readyState === WebSocket.OPEN;
    return { id: doc.id, name, lastSeen, online };
  });
  res.json(devices);
});

async function getOwnedDevice(deviceId, uid, res) {
  const snap = await db.collection('devices').doc(deviceId).get();
  if (!snap.exists) { res.status(404).json({ error: 'Device not found' }); return null; }
  if (snap.data().ownerId !== uid) { res.status(403).json({ error: 'Forbidden' }); return null; }
  return snap;
}

app.get('/devices/:deviceId/plants', async (req, res) => {
  const uid = await authenticate(req, res);
  if (!uid) return;
  if (!await getOwnedDevice(req.params.deviceId, uid, res)) return;
  const snapshot = await db.collection('devices').doc(req.params.deviceId).collection('plantSlots').get();
  res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
});

app.post('/devices/:deviceId/plants', async (req, res) => {
  const uid = await authenticate(req, res);
  if (!uid) return;
  if (!await getOwnedDevice(req.params.deviceId, uid, res)) return;
  const { plantId, customName, sensorPin, pumpPin, minMoisture, maxMoisture } = req.body;

  let plantName = null;
  if (plantId) {
    const globalSnap = await db.collection('plants').doc(plantId).get();
    if (globalSnap.exists) {
      plantName = globalSnap.data().name;
    } else {
      const customSnap = await db.collection('users').doc(uid).collection('customPlants').doc(plantId).get();
      if (customSnap.exists) plantName = customSnap.data().name;
    }
  }

  const docRef = await db.collection('devices').doc(req.params.deviceId).collection('plantSlots').add({
    plantTypeId: plantId ?? null,
    plantName: plantName,
    customName: customName ?? null,
    sensorPin: sensorPin ?? null,
    pumpPin: pumpPin ?? null,
    minMoisture: minMoisture ?? null,
    maxMoisture: maxMoisture ?? null,
    autoWater: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  sendConfigToEsp(req.params.deviceId).catch(err => console.error('Config push error:', err));
  res.json({ id: docRef.id });
});

app.put('/devices/:deviceId/plants/:slotId', async (req, res) => {
  const uid = await authenticate(req, res);
  if (!uid) return;
  if (!await getOwnedDevice(req.params.deviceId, uid, res)) return;
  const slotRef = db.collection('devices').doc(req.params.deviceId).collection('plantSlots').doc(req.params.slotId);
  const slot = await slotRef.get();
  if (!slot.exists) return res.status(404).json({ error: 'Slot not found' });
  const allowed = ['plantTypeId', 'customName', 'sensorPin', 'pumpPin', 'minMoisture', 'maxMoisture', 'autoWater'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  await slotRef.update(updates);
  sendConfigToEsp(req.params.deviceId).catch(err => console.error('Config push error:', err));
  res.json({ success: true });
});

app.delete('/devices/:deviceId/plants/:slotId', async (req, res) => {
  const uid = await authenticate(req, res);
  if (!uid) return;
  if (!await getOwnedDevice(req.params.deviceId, uid, res)) return;
  const slotRef = db.collection('devices').doc(req.params.deviceId).collection('plantSlots').doc(req.params.slotId);
  const slot = await slotRef.get();
  if (!slot.exists) return res.status(404).json({ error: 'Slot not found' });
  await slotRef.delete();
  sendConfigToEsp(req.params.deviceId).catch(err => console.error('Config push error:', err));
  res.json({ success: true });
});


wss.on('connection', (ws) => {
  let clientRole = null;
  let identificationTimeout;

  identificationTimeout = setTimeout(() => {
    if (clientRole === null) {
      ws.close(1008, 'Identification timeout');
    }
  }, 3000);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'identify') {
        clearTimeout(identificationTimeout);
        clientRole = data.role;
        if (clientRole === 'esp32') {
          ws.deviceId = data.deviceId || DEVICE_ID;
          const existing = esp32Clients.get(ws.deviceId);
          if (existing && existing !== ws) {
            existing.terminate();
            esp32Clients.delete(ws.deviceId);
          }
          esp32Client = ws;
          esp32Clients.set(ws.deviceId, ws);
          db.collection('devices').doc(ws.deviceId)
            .update({ lastSeen: admin.firestore.FieldValue.serverTimestamp() })
            .catch(err => console.error('lastSeen update on connect error:', err));
          sendConfigToEsp(ws.deviceId).catch(err => console.error('Config push on connect error:', err));
        } else if (clientRole === 'app') {
          try {
            const decoded = await verifyToken(data.token);
            ws.uid = decoded.uid;
          } catch (err) {
            ws.close(1008, 'Invalid token');
            return;
          }
          ws.watchingDeviceId = data.deviceId || null;
          appClients.add(ws);
        }
        return;
      }

      if (clientRole === null) return;

      if (clientRole === 'app') {
        const targetDeviceId = ws.watchingDeviceId;
        const targetEsp = targetDeviceId ? esp32Clients.get(targetDeviceId) : null;
        if (!targetEsp || targetEsp.readyState !== WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: 'ESP32 not connected' }));
          return;
        }
        const { action, slotId, pumpPin } = data;
        // set_auto_water is handled server-side via handleMoistureUpdate; don't forward to ESP32
        if (action === 'set_auto_water') return;
        targetEsp.send(JSON.stringify({ cmd: action, slotId: slotId ?? null, pumpPin: pumpPin ?? null }));

        if (action === 'pump_on' || action === 'pump_off') {
          const logRef = slotId
            ? db.collection('devices').doc(targetDeviceId).collection('plantSlots').doc(slotId).collection('logs')
            : db.collection('devices').doc(targetDeviceId).collection('logs');
          logRef.add({
            action,
            triggeredBy: 'manual',
            uid: ws.uid || null,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          }).catch(err => console.error('Firestore log error:', err));
        }

      } else if (clientRole === 'esp32') {
        if (data.type === 'status_update' && (data.status === 'pump_on' || data.status === 'pump_off')) {
          const devId = ws.deviceId || DEVICE_ID;
          pumpStates.set(devId, data.status === 'pump_on');
          db.collection('devices').doc(devId).collection('logs').add({
            action: data.status,
            triggeredBy: 'manual',
            uid: null,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          }).catch(err => console.error('Firestore log error:', err));
        }

        // Forward everything from ESP32 only to app clients watching this device
        appClients.forEach(client => {
          if (client.readyState === WebSocket.OPEN && client.watchingDeviceId === ws.deviceId) {
            client.send(message);
          }
        });
      }

    } catch (err) {
      console.error('Message parsing error:', err);
    }
  });

  ws.on('close', () => {
    clearTimeout(identificationTimeout);
    if (clientRole === 'esp32') {
      if (esp32Client === ws) esp32Client = null;
      // Only clean up if this exact socket is still the registered one for the
      // device — a newer connection for the same deviceId must not be evicted.
      if (ws.deviceId && esp32Clients.get(ws.deviceId) === ws) {
        esp32Clients.delete(ws.deviceId);
        db.collection('devices').doc(ws.deviceId)
          .update({ lastSeen: admin.firestore.FieldValue.serverTimestamp() })
          .catch(err => console.error('lastSeen update on disconnect error:', err));
        appClients.forEach(client => {
          if (client.readyState === WebSocket.OPEN && client.watchingDeviceId === ws.deviceId) {
            client.send(JSON.stringify({ type: 'esp_disconnected' }));
          }
        });
      }
    } else if (clientRole === 'app') {
      appClients.delete(ws);
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
