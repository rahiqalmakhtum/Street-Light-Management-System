import mqtt from 'mqtt';
import pg from 'pg';
import WebSocket from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const { Pool } = pg;
const PG_CONN = process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5433/streetlight_db';
const MQTT_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const HTTP_BASE = 'http://127.0.0.1:4000';
const WS_URL = 'ws://127.0.0.1:4000/ws';

const results = [];

function recordResult(category, testName, passed, latencyMs, details = '') {
  results.push({
    category,
    testName,
    status: passed ? 'PASS' : 'FAIL',
    latencyMs: latencyMs !== null ? `${latencyMs}ms` : 'N/A',
    details,
  });
}

async function runTestSuite() {
  console.log('===============================================================');
  console.log('🚀 Starting Smart Street Light E2E Integration & Smoke Test Suite');
  console.log('===============================================================\n');

  const pool = new Pool({ connectionString: PG_CONN, connectionTimeoutMillis: 4000 });

  // -----------------------------------------------------------------
  // 1. Infrastructure & Connectivity Check
  // -----------------------------------------------------------------
  console.log('--- 1. Infrastructure & Connectivity Check ---');

  // 1.1 MQTT Broker connectivity
  let mqttClient = null;
  const tMqttStart = Date.now();
  try {
    mqttClient = await new Promise((resolve, reject) => {
      const client = mqtt.connect(MQTT_URL, { connectTimeout: 3000 });
      client.on('connect', () => resolve(client));
      client.on('error', (e) => reject(e));
    });
    const tMqtt = Date.now() - tMqttStart;
    recordResult('Infrastructure', 'HiveMQ MQTT Broker (Port 1883)', true, tMqtt, `Connected to ${MQTT_URL}`);
  } catch (err) {
    recordResult('Infrastructure', 'HiveMQ MQTT Broker (Port 1883)', false, Date.now() - tMqttStart, err.message);
  }

  // 1.2 PostgreSQL connectivity
  const tPgStart = Date.now();
  try {
    const res = await pool.query('SELECT current_database(), version()');
    const tPg = Date.now() - tPgStart;
    recordResult('Infrastructure', 'PostgreSQL 15 (Port 5433)', true, tPg, `DB: ${res.rows[0].current_database}`);
  } catch (err) {
    recordResult('Infrastructure', 'PostgreSQL 15 (Port 5433)', false, Date.now() - tPgStart, err.message);
  }

  // 1.3 Backend HTTP Server: GET /api/poles
  const tHttpStart = Date.now();
  try {
    const res = await fetch(`${HTTP_BASE}/api/poles`);
    const data = await res.json();
    const tHttp = Date.now() - tHttpStart;
    const passed = res.ok && data.success === true && Array.isArray(data.data) && data.data.length >= 15;
    recordResult('Infrastructure', 'Backend HTTP Server (GET /api/poles)', passed, tHttp, `Status: ${res.status}, Poles: ${data.data?.length}`);
  } catch (err) {
    recordResult('Infrastructure', 'Backend HTTP Server (GET /api/poles)', false, Date.now() - tHttpStart, err.message);
  }

  // 1.4 Rolling Telemetry History: GET /api/poles/:id/history
  const tHistoryStart = Date.now();
  try {
    const res = await fetch(`${HTTP_BASE}/api/poles/POLE-001/history?limit=30`);
    const data = await res.json();
    const tHistory = Date.now() - tHistoryStart;
    const passed = res.ok && data.success === true && Array.isArray(data.data);
    recordResult('Infrastructure', 'Pole History API (GET /api/poles/:id/history)', passed, tHistory, `Status: ${res.status}, History Count: ${data.data?.length}`);
  } catch (err) {
    recordResult('Infrastructure', 'Pole History API (GET /api/poles/:id/history)', false, Date.now() - tHistoryStart, err.message);
  }

  // 1.4 Backend WebSocket Handshake
  let wsClient = null;
  const tWsStart = Date.now();
  try {
    wsClient = await new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      const timer = setTimeout(() => reject(new Error('WS handshake timeout')), 4000);
      ws.on('open', () => {
        clearTimeout(timer);
        resolve(ws);
      });
      ws.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
    const tWs = Date.now() - tWsStart;
    recordResult('Infrastructure', 'Backend WebSocket Handshake (/ws)', true, tWs, 'Handshake successful');
  } catch (err) {
    recordResult('Infrastructure', 'Backend WebSocket Handshake (/ws)', false, Date.now() - tWsStart, err.message);
  }

  // -----------------------------------------------------------------
  // 2. Uplink Pipeline Test (Simulator -> Broker -> Backend -> DB -> WebSocket)
  // -----------------------------------------------------------------
  console.log('\n--- 2. Uplink Pipeline Test ---');
  if (mqttClient && wsClient) {
    const tUplinkStart = Date.now();
    try {
      const testCounter = 999;
      const testTelemetry = {
        pole_id: 'POLE-001',
        counter: testCounter,
        voltage: 230.5,
        current: 1.5,
        power_watts: 345.8,
        energy_kwh: 0.125,
        battery_voltage: 13.8,
        battery_temp: 31.5,
        state_of_charge: 88,
        battery_soc: 88,
        battery_current: -1.9,
        estimated_runtime_minutes: 420,
        ambient_light_lux: 15.0,
        brightness: 100,
        tamper_status: false,
        light_state: true,
      };

      // Set up WebSocket listener
      const wsPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WebSocket telemetry event timeout (>1500ms)')), 1500);
        const listener = (msg) => {
          try {
            const parsed = JSON.parse(msg.toString());
            if (parsed.type === 'TELEMETRY' && parsed.pole_id === 'POLE-001' && parsed.data?.counter === testCounter) {
              clearTimeout(timeout);
              wsClient.removeListener('message', listener);
              resolve(parsed);
            }
          } catch (e) {}
        };
        wsClient.on('message', listener);
      });

      // Publish mock telemetry packet
      mqttClient.publish('streetlight/telemetry/POLE-001', JSON.stringify(testTelemetry));

      // Wait for WS broadcast
      const wsReceived = await wsPromise;
      const tUplink = Date.now() - tUplinkStart;

      // Verify in PostgreSQL database
      const dbCheck = await pool.query(
        'SELECT * FROM telemetry_logs WHERE pole_id = $1 AND counter = $2 ORDER BY id DESC LIMIT 1',
        ['POLE-001', testCounter]
      );
      const dbRow = dbCheck.rows[0];

      const dbMatch = dbRow && 
        Number(dbRow.voltage) === 230.5 && 
        Number(dbRow.current) === 1.5 && 
        Number(dbRow.power_watts) === 345.8 &&
        Number(dbRow.battery_voltage) === 13.8 &&
        Number(dbRow.battery_temp) === 31.5 &&
        (Number(dbRow.state_of_charge) === 88 || Number(dbRow.battery_soc) === 88) &&
        Number(dbRow.battery_current) === -1.9 &&
        Number(dbRow.estimated_runtime_minutes) === 420 &&
        dbRow.light_state === true;
      const wsMatch = wsReceived && tUplink < 500;

      recordResult(
        'Uplink Pipeline',
        'Telemetry & Battery Analytics Ingestion (MQTT -> DB)',
        Boolean(dbMatch),
        tUplink,
        `DB Record ID: ${dbRow?.id}, V: ${dbRow?.voltage}V, BattV: ${dbRow?.battery_voltage}V, Temp: ${dbRow?.battery_temp}°C, Runtime: ${dbRow?.estimated_runtime_minutes}m`
      );

      recordResult(
        'Uplink Pipeline',
        'WebSocket Real-Time Broadcast (<500ms latency)',
        Boolean(wsMatch),
        tUplink,
        `Received event type: ${wsReceived?.type}, Counter: ${wsReceived?.data?.counter}`
      );
    } catch (err) {
      recordResult('Uplink Pipeline', 'Uplink Telemetry Pipeline', false, Date.now() - tUplinkStart, err.message);
    }
  } else {
    recordResult('Uplink Pipeline', 'Uplink Telemetry Pipeline', false, null, 'Prerequisite MQTT/WS connections missing');
  }

  // -----------------------------------------------------------------
  // 3. Downlink Actuation Test (REST API -> Backend -> Broker -> Simulator)
  // -----------------------------------------------------------------
  console.log('\n--- 3. Downlink Actuation Test ---');
  if (mqttClient) {
    const tDownlinkStart = Date.now();
    try {
      // Subscribe to control topic
      const mqttPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('MQTT control command timeout (>2000ms)')), 2000);
        mqttClient.subscribe('streetlight/control/POLE-001', (err) => {
          if (err) return reject(err);
        });

        const listener = (topic, payload) => {
          if (topic === 'streetlight/control/POLE-001') {
            try {
              const cmd = JSON.parse(payload.toString());
              if (cmd.pole_id === 'POLE-001' && (cmd.state === false || cmd.light_state === false)) {
                clearTimeout(timeout);
                mqttClient.removeListener('message', listener);
                resolve(cmd);
              }
            } catch (e) {}
          }
        };
        mqttClient.on('message', listener);
      });

      // Send HTTP POST control command { state: false }
      const res = await fetch(`${HTTP_BASE}/api/poles/POLE-001/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: false }),
      });
      const data = await res.json();
      const mqttCmd = await mqttPromise;
      const tDownlink = Date.now() - tDownlinkStart;

      recordResult(
        'Downlink Actuation',
        'REST API to MQTT Publish (POST /control -> MQTT)',
        res.ok && data.success === true && Boolean(mqttCmd),
        tDownlink,
        `Dispatched command: ${JSON.stringify(mqttCmd)}`
      );
    } catch (err) {
      recordResult('Downlink Actuation', 'REST API to MQTT Publish', false, Date.now() - tDownlinkStart, err.message);
    }
  } else {
    recordResult('Downlink Actuation', 'REST API to MQTT Publish', false, null, 'Prerequisite MQTT client missing');
  }

  // -----------------------------------------------------------------
  // 4. Anomaly & Tamper Detection Test (Alert Ingestion & Broadcast)
  // -----------------------------------------------------------------
  console.log('\n--- 4. Anomaly & Tamper Detection Test ---');
  if (mqttClient && wsClient) {
    const tAlertStart = Date.now();
    try {
      const alertMsg = 'CRITICAL: Physical tamper or theft attempt detected on pole';
      
      const wsAlertPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WebSocket alert event timeout (>2000ms)')), 2000);
        const listener = (msg) => {
          try {
            const parsed = JSON.parse(msg.toString());
            if (parsed.type === 'ALERT' && parsed.data?.pole_id === 'POLE-001' && parsed.data?.severity === 'CRITICAL') {
              clearTimeout(timeout);
              wsClient.removeListener('message', listener);
              resolve(parsed);
            }
          } catch (e) {}
        };
        wsClient.on('message', listener);
      });

      // Publish tamper alert packet
      mqttClient.publish(
        'streetlight/alerts/POLE-001',
        JSON.stringify({
          pole_id: 'POLE-001',
          tamper: true,
          alert_type: 'TAMPER_THEFT',
          severity: 'CRITICAL',
          message: alertMsg,
        })
      );

      const wsAlert = await wsAlertPromise;
      const tAlert = Date.now() - tAlertStart;

      // Verify PostgreSQL insertion
      const alertDb = await pool.query(
        'SELECT * FROM alerts WHERE pole_id = $1 AND severity = $2 ORDER BY id DESC LIMIT 1',
        ['POLE-001', 'CRITICAL']
      );
      const alertRow = alertDb.rows[0];

      recordResult(
        'Anomaly & Alerts',
        'Tamper Ingestion into PostgreSQL (Severity CRITICAL)',
        Boolean(alertRow && alertRow.severity === 'CRITICAL'),
        tAlert,
        `Alert ID: ${alertRow?.id}, Message: "${alertRow?.message}"`
      );

      recordResult(
        'Anomaly & Alerts',
        'WebSocket Alert Broadcast Stream ({ type: ALERT })',
        Boolean(wsAlert && wsAlert.data?.severity === 'CRITICAL'),
        tAlert,
        `Delivered via WebSocket to active clients`
      );
    } catch (err) {
      recordResult('Anomaly & Alerts', 'Tamper Alert Ingestion & Broadcast', false, Date.now() - tAlertStart, err.message);
    }
  } else {
    recordResult('Anomaly & Alerts', 'Tamper Alert Ingestion & Broadcast', false, null, 'Prerequisite MQTT/WS missing');
  }

  // -----------------------------------------------------------------
  // 5. Database Schema & Data Integrity Check
  // -----------------------------------------------------------------
  console.log('\n--- 5. Database Schema & Data Integrity Check ---');
  const tDbCheckStart = Date.now();
  try {
    // Check 15 seed poles across 3 clusters
    const polesRes = await pool.query('SELECT pole_id, cluster_id, gateway_id, latitude, longitude, status FROM poles ORDER BY pole_id');
    const poleIds = polesRes.rows.map((p) => p.pole_id);
    const expectedPoles = Array.from({ length: 15 }, (_, i) => `POLE-${String(i + 1).padStart(3, '0')}`);
    const hasAllPoles = expectedPoles.every((id) => poleIds.includes(id));
    recordResult(
      'Data Integrity',
      'Seed Poles Verification (15 Poles across Clusters A, B, C)',
      hasAllPoles,
      Date.now() - tDbCheckStart,
      `Poles found in DB (${poleIds.length}/15): ${poleIds.slice(0, 5).join(', ')}...`
    );

    // Check NULL constraints on telemetry
    const tNullStart = Date.now();
    const nullCheck = await pool.query(`
      SELECT count(*) as null_count 
      FROM telemetry_logs 
      WHERE voltage IS NULL OR current IS NULL OR battery_soc IS NULL
    `);
    const noNulls = parseInt(nullCheck.rows[0].null_count, 10) === 0;
    recordResult(
      'Data Integrity',
      'Telemetry Logs NULL Constraints (voltage, current, battery_soc)',
      noNulls,
      Date.now() - tNullStart,
      `Records with NULL required fields: ${nullCheck.rows[0].null_count}`
    );

    // Check alerts schema and mapping
    const tAlertsCheck = Date.now();
    const alertsRes = await pool.query('SELECT id, severity, message, created_at FROM alerts ORDER BY created_at DESC LIMIT 5');
    const validAlerts = alertsRes.rows.length > 0 && alertsRes.rows.every((a) => a.created_at && ['INFO', 'WARNING', 'CRITICAL'].includes(a.severity));
    recordResult(
      'Data Integrity',
      'Alerts Timestamp & Severity Integrity',
      validAlerts,
      Date.now() - tAlertsCheck,
      `Verified ${alertsRes.rows.length} alert records with valid timestamp & severity ENUM mapping`
    );
  } catch (err) {
    recordResult('Data Integrity', 'Database Schema & Integrity', false, Date.now() - tDbCheckStart, err.message);
  }

  // Cleanup
  if (mqttClient) mqttClient.end();
  if (wsClient) wsClient.close();
  await pool.end();

  // Print results summary
  console.log('\n===============================================================');
  console.log('                   AUTOMATED TEST RESULTS SUMMARY               ');
  console.log('===============================================================');
  console.log(JSON.stringify(results, null, 2));
}

runTestSuite();
