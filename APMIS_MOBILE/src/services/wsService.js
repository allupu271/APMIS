const SERVER_URL = 'wss://apmis-production-f541.up.railway.app';

let ws = null;
let _onMessage = null;
let _onStatusChange = null;
let _idToken = null;
let _deviceId = null;
let _reconnectTimer = null;
let _intentionalClose = false;

function doConnect() {
  ws = new WebSocket(SERVER_URL);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    console.log('WS connected');
    ws.send(JSON.stringify({ type: 'identify', role: 'app', token: _idToken, deviceId: _deviceId }));
    _onStatusChange(true);
  };

  ws.onclose = () => {
    console.log('WS disconnected');
    _onStatusChange(false);
    if (!_intentionalClose) {
      _reconnectTimer = setTimeout(doConnect, 3000);
    }
  };

  ws.onerror = (e) => {
    console.error('WS error', e.message);
  };

  ws.onmessage = (e) => {
    try {
      const raw = e.data instanceof ArrayBuffer
        ? new TextDecoder().decode(e.data)
        : e.data;
      const msg = JSON.parse(raw);
      _onMessage(msg);
    } catch {
      console.warn('WS bad message', e.data);
    }
  };
}

export function connect(onMessage, onStatusChange, idToken, deviceId) {
  _intentionalClose = true;
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (ws) { ws.onclose = null; ws.close(); }
  _onMessage = onMessage;
  _onStatusChange = onStatusChange;
  _idToken = idToken;
  _deviceId = deviceId;
  _intentionalClose = false;
  doConnect();
}

// Returns true if the message was sent, false if the socket was not open.
export function sendMessage(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  console.warn('WS not connected, cannot send');
  return false;
}

export function disconnect() {
  _intentionalClose = true;
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
}
