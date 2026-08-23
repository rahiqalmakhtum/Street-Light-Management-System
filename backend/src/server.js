import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB, getPoles, getTelemetryLogs, getRecentAlerts, saveAlert, upsertAlertState, pool } from './db.js';
import { initMQTT, sendControlCommand, setBroadcastCallback, closeMQTT, clearActiveAlarmStates } from './mqtt.js';

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
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Connected to Street Light Live Feed' }));

  ws.on('close', () => {
    clients.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('[WebSocket] Error:', err.message);
  });
});

// WebSocket Keep-Alive Ping Interval (every 30s)
const pingInterval = setInterval(() => {
  for (const ws of clients) {
    if (ws.isAlive === false) {
      clients.delete(ws);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

// Broadcast helper for real-time events
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

// Initialize database schema and MQTT
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

// 1. Get all poles with latest telemetry snapshot
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

// 3. Get alerts (supporting active vs cleared filtering)
app.get('/api/alerts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 30;
    const status = req.query.status || null; // 'ACTIVE', 'CLEARED', or null
    const alerts = await getRecentAlerts(limit, status);
    res.json({ success: true, data: alerts });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Send control command to a pole
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
      brightness: brightness !== undefined ? Number(brightness) : (lightState ? 100 : 0),
    });

    broadcast({
      type: 'CONTROL_COMMAND_SENT',
      pole_id: id,
      command: { light_state: Boolean(lightState), state: Boolean(lightState), brightness },
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
    const { pole_id, severity, message, alert_type } = req.body;
    if (!pole_id || !message) {
      return res.status(400).json({ success: false, error: 'pole_id and message are required' });
    }

    const alert = await saveAlert({
      pole_id,
      severity: severity || 'WARNING',
      message,
      alert_type: alert_type || 'MANUAL_TEST',
    });

    broadcast({ type: 'ALERT_TRIGGERED', data: alert });
    broadcast({ type: 'ALERT', data: alert });

    res.json({ success: true, data: alert });
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Simulate Theft / Physical Tamper on a specific pole
app.post('/api/poles/:id/tamper', async (req, res) => {
  try {
    const { id } = req.params;
    const { alert, isNew } = await upsertAlertState({
      pole_id: id,
      alert_type: 'TAMPER_THEFT',
      severity: 'CRITICAL',
      message: `🚨 CRITICAL: Physical tamper sensor triggered on ${id} (Solar panel ripped off / 0V Theft Alert)`,
    });

    // 1. Publish command to MQTT simulator to drop voltage to 0V
    try {
      sendControlCommand(id, { tamper: true, voltage: 0, light_state: false, brightness: 0 });
    } catch (mqttErr) {
      console.warn('[MQTT Warning] Failed to publish tamper to simulator:', mqttErr.message);
    }

    // 2. Broadcast instant 0V telemetry update & alarm to WebSockets
    broadcast({
      type: 'TELEMETRY',
      pole_id: id,
      data: {
        pole_id: id,
        voltage: 0,
        current: 0,
        light_state: false,
        created_at: new Date().toISOString(),
      },
    });

    broadcast({ type: isNew ? 'ALERT_TRIGGERED' : 'ALERT_UPDATED', data: alert });
    broadcast({ type: 'ALERT', data: alert });

    res.json({ success: true, data: alert, isNew });
  } catch (error) {
    console.error('Error simulating tamper alert:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Resolve / Clear all active alerts for a specific pole
app.post('/api/poles/:id/resolve-alerts', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Clear in-memory alarm engine hysteresis state
    clearActiveAlarmStates(id);

    // 2. Mark active alerts in PostgreSQL as CLEARED
    const result = await pool.query(
      `UPDATE alerts 
       SET status = 'CLEARED', cleared_at = CURRENT_TIMESTAMP 
       WHERE pole_id = $1 AND status = 'ACTIVE' 
       RETURNING *;`,
      [id]
    );

    // 3. Dispatch hardware recovery/restore command to MQTT simulator
    try {
      sendControlCommand(id, { restore: true, tamper: false, voltage: 230 });
    } catch (mqttErr) {
      console.warn('[MQTT Warning] Failed to publish restore command to simulator:', mqttErr.message);
    }

    // 4. Instant WebSocket broadcast of restored nominal telemetry snapshot
    broadcast({
      type: 'TELEMETRY',
      pole_id: id,
      data: {
        pole_id: id,
        voltage: 230,
        current: 0.85,
        created_at: new Date().toISOString(),
      },
    });

    // 5. Broadcast alert clearance events
    if (result.rows.length > 0) {
      for (const cleared of result.rows) {
        broadcast({ type: 'ALERT_CLEARED', data: cleared, pole_id: id, alert_type: cleared.alert_type });
      }
    } else {
      broadcast({
        type: 'ALERT_CLEARED',
        data: { pole_id: id, status: 'CLEARED', cleared_at: new Date().toISOString() },
        pole_id: id,
      });
    }

    res.json({ success: true, resolved_count: result.rows.length, data: result.rows });
  } catch (error) {
    console.error('Error resolving alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. Resolve a single alert by ID
app.post('/api/alerts/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE alerts 
       SET status = 'CLEARED', cleared_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
       RETURNING *;`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    const cleared = result.rows[0];
    clearActiveAlarmStates(cleared.pole_id);

    // If no more active alerts for this pole, restore hardware
    const activeRemaining = await pool.query(
      `SELECT id FROM alerts WHERE pole_id = $1 AND status = 'ACTIVE'`,
      [cleared.pole_id]
    );

    if (activeRemaining.rows.length === 0) {
      try {
        sendControlCommand(cleared.pole_id, { restore: true, tamper: false, voltage: 230 });
      } catch (mqttErr) {
        console.warn('[MQTT Warning] Failed to publish restore command:', mqttErr.message);
      }
      broadcast({
        type: 'TELEMETRY',
        pole_id: cleared.pole_id,
        data: {
          pole_id: cleared.pole_id,
          voltage: 230,
          current: 0.85,
          created_at: new Date().toISOString(),
        },
      });
    }

    broadcast({ type: 'ALERT_CLEARED', data: cleared, pole_id: cleared.pole_id, alert_type: cleared.alert_type });
    res.json({ success: true, data: cleared });
  } catch (error) {
    console.error('Error resolving alert by ID:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. Resolve all alerts across all poles
app.post('/api/alerts/resolve-all', async (req, res) => {
  try {
    clearActiveAlarmStates();
    const result = await pool.query(
      `UPDATE alerts 
       SET status = 'CLEARED', cleared_at = CURRENT_TIMESTAMP 
       WHERE status = 'ACTIVE' 
       RETURNING *;`
    );

    const polesRes = await pool.query(`SELECT pole_id FROM poles`);
    for (const p of polesRes.rows) {
      try {
        sendControlCommand(p.pole_id, { restore: true, tamper: false, voltage: 230 });
      } catch {}
      broadcast({
        type: 'TELEMETRY',
        pole_id: p.pole_id,
        data: {
          pole_id: p.pole_id,
          voltage: 230,
          current: 0.85,
          created_at: new Date().toISOString(),
        },
      });
      broadcast({
        type: 'ALERT_CLEARED',
        data: { pole_id: p.pole_id, status: 'CLEARED', cleared_at: new Date().toISOString() },
        pole_id: p.pole_id,
      });
    }

    res.json({ success: true, resolved_count: result.rows.length });
  } catch (error) {
    console.error('Error resolving all alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ======================== GRACEFUL SHUTDOWN ========================
async function gracefulShutdown(signal) {
  console.log(`\n🛑 [Shutdown] Received ${signal}. Gracefully stopping backend service...`);
  clearInterval(pingInterval);

  try {
    // 1. Close MQTT and flush remaining write buffer
    await closeMQTT();
    console.log('✅ [Shutdown] MQTT closed and buffer flushed.');

    // 2. Close WebSocket connections
    for (const ws of clients) {
      ws.close(1001, 'Server shutting down');
    }
    wss.close();

    // 3. Close HTTP server
    server.close(() => {
      console.log('✅ [Shutdown] HTTP server closed.');
    });

    // 4. Close database pool
    await pool.end();
    console.log('✅ [Shutdown] Database pool released.');

    process.exit(0);
  } catch (err) {
    console.error('❌ [Shutdown Error]:', err.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
