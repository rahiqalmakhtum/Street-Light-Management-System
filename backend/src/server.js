import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB, getPoles, getTelemetryLogs, getRecentAlerts, saveAlert } from './db.js';
import { initMQTT, sendControlCommand, setBroadcastCallback } from './mqtt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Create HTTP server & WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Active WebSocket clients set
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`🔌 [WebSocket] Client connected. Total active clients: ${clients.size}`);

  ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Connected to Street Light Live Feed' }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`🔌 [WebSocket] Client disconnected. Total active clients: ${clients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[WebSocket] Error:', err.message);
  });
});

// Broadcast helper
function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// Hook broadcast into MQTT incoming message pipeline
setBroadcastCallback(broadcast);

// Start HTTP/WS Server immediately on 0.0.0.0
server.listen(port, '0.0.0.0', () => {
  console.log(`🚀 [Backend Server] Listening on http://localhost:${port}`);
  console.log(`🔌 [WebSocket Server] Available at ws://localhost:${port}/ws`);
});

// Initialize database schema and MQTT asynchronously
(async () => {
  try {
    await initDB();
    initMQTT();
  } catch (err) {
    console.error('Initialization error:', err.message);
  }
})();


// ======================== REST API ROUTES ========================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 1. Get all poles with latest telemetry
app.get('/api/poles', async (req, res) => {
  try {
    const poles = await getPoles();
    res.json({ success: true, data: poles });
  } catch (error) {
    console.error('Error fetching poles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Get telemetry history for a specific pole (or all poles)
app.get('/api/poles/:id/telemetry', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit, 10) || 50;
    const logs = await getTelemetryLogs(id === 'all' ? null : id, limit);
    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('Error fetching telemetry logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Get alerts
app.get('/api/alerts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 30;
    const alerts = await getRecentAlerts(limit);
    res.json({ success: true, data: alerts });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Send control command to a pole (e.g. light on/off, dimming)
app.post('/api/poles/:id/control', async (req, res) => {
  try {
    const { id } = req.params;
    const lightState = req.body.light_state !== undefined ? req.body.light_state : req.body.state;
    const brightness = req.body.brightness;

    if (lightState === undefined) {
      return res.status(400).json({ success: false, error: 'light_state or state is required (boolean)' });
    }

    sendControlCommand(id, {
      light_state: Boolean(lightState),
      state: Boolean(lightState),
      brightness: brightness !== undefined ? Number(brightness) : (lightState ? 100 : 0)
    });

    // Notify connected clients immediately
    broadcast({
      type: 'CONTROL_COMMAND_SENT',
      pole_id: id,
      command: { light_state: Boolean(lightState), state: Boolean(lightState), brightness }
    });

    res.json({ success: true, message: `Control command dispatched for ${id}` });
  } catch (error) {
    console.error('Error sending control command:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Create a manual alert or test alert
app.post('/api/alerts', async (req, res) => {
  try {
    const { pole_id, severity, message } = req.body;
    if (!pole_id || !message) {
      return res.status(400).json({ success: false, error: 'pole_id and message are required' });
    }

    const alert = await saveAlert({
      pole_id,
      severity: severity || 'WARNING',
      message
    });

    broadcast({ type: 'ALERT', data: alert });

    res.json({ success: true, data: alert });
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
