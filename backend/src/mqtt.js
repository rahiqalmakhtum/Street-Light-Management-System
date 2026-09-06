import mqtt from 'mqtt';
import dotenv from 'dotenv';
import { bulkSaveTelemetry, upsertAlertState, resolveAlertState } from './db.js';

dotenv.config();

const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
let mqttClient = null;
let broadcastCallback = null;

// ======================== HOT/WARM PATH BUFFER ========================
const telemetryWriteBuffer = [];
const BATCH_FLUSH_INTERVAL_MS = 1000;
const MAX_BATCH_SIZE = 25;
let flushTimer = null;

export function setBroadcastCallback(cb) {
  broadcastCallback = cb;
}

/**
 * Flush buffered telemetry records to PostgreSQL in a single multi-row SQL operation
 */
export async function flushTelemetryBuffer() {
  if (telemetryWriteBuffer.length === 0) return;

  const batch = telemetryWriteBuffer.splice(0, telemetryWriteBuffer.length);
  try {
    await bulkSaveTelemetry(batch);
  } catch (err) {
    console.error('❌ [Database Bulk Write Error]:', err.message);
  }
}

// Start periodic micro-batch flush timer
flushTimer = setInterval(flushTelemetryBuffer, BATCH_FLUSH_INTERVAL_MS);

// ======================== ISA-18.2 ALARM ENGINE ========================
// In-memory active alarm states: key -> boolean
const activeAlarmStates = new Map();

/**
 * Clear in-memory alarm debounce/hysteresis states for a pole (or all poles)
 */
export function clearActiveAlarmStates(poleId = null) {
  if (poleId) {
    for (const key of activeAlarmStates.keys()) {
      if (key.startsWith(`${poleId}:`)) {
        activeAlarmStates.delete(key);
      }
    }
  } else {
    activeAlarmStates.clear();
  }
}

/**
 * Handle alarm condition evaluation with hysteresis
 */
async function processAlarmLifecycle(poleId, alertType, isViolating, isRecovered, severity, message) {
  const stateKey = `${poleId}:${alertType}`;
  const wasActive = Boolean(activeAlarmStates.get(stateKey));

  if (isViolating) {
    if (!wasActive) {
      activeAlarmStates.set(stateKey, true);
    }
    const { alert, isNew } = await upsertAlertState({
      pole_id: poleId,
      alert_type: alertType,
      severity,
      message,
    });

    if (broadcastCallback) {
      // Primary ISA-18.2 stateful alarm event (ALERT_TRIGGERED only on new state, ALERT_UPDATED on recurring)
      broadcastCallback({
        type: isNew ? 'ALERT_TRIGGERED' : 'ALERT_UPDATED',
        data: alert,
      });
    }
  } else if (isRecovered && wasActive) {
    activeAlarmStates.delete(stateKey);
    const clearedRows = await resolveAlertState({ pole_id: poleId, alert_type: alertType });
    
    if (broadcastCallback && clearedRows.length > 0) {
      for (const cleared of clearedRows) {
        broadcastCallback({
          type: 'ALERT_CLEARED',
          data: cleared,
          pole_id: poleId,
          alert_type: alertType,
        });
      }
    }
  }
}

// ======================== MQTT INITIALIZATION ========================
export function initMQTT() {
  console.log(`[MQTT] Connecting to HiveMQ broker at ${brokerUrl}...`);

  const mqttOptions = {
    reconnectPeriod: 3000,
    connectTimeout: 8000,
    clientId: `backend-service-${Math.random().toString(16).slice(2, 8)}`,
  };

  if (process.env.MQTT_USERNAME) mqttOptions.username = process.env.MQTT_USERNAME;
  if (process.env.MQTT_PASSWORD) mqttOptions.password = process.env.MQTT_PASSWORD;

  mqttClient = mqtt.connect(brokerUrl, mqttOptions);

  mqttClient.on('connect', () => {
    console.log('✅ [MQTT] Connected to HiveMQ Broker');

    mqttClient.subscribe(['streetlight/telemetry/+', 'streetlight/alerts/+'], (err) => {
      if (err) {
        console.error('[MQTT] Subscription error:', err);
      } else {
        console.log('📡 [MQTT] Subscribed to streetlight/telemetry/+ and streetlight/alerts/+');
      }
    });
  });

  mqttClient.on('message', async (topic, payload) => {
    try {
      const data = JSON.parse(payload.toString());

      if (topic.startsWith('streetlight/telemetry/')) {
        const poleId = topic.split('/')[2] || data.pole_id;

        const voltage = Number(data.voltage ?? 230);
        const current = Number(data.current ?? 0.8);
        const power_watts = data.power_watts !== undefined ? Number(data.power_watts) : Number((voltage * current).toFixed(1));
        const soc = Number(data.state_of_charge ?? data.battery_soc ?? 90);
        const battery_voltage = data.battery_voltage !== undefined ? Number(data.battery_voltage) : Number((12.0 + (soc / 100) * 2.4).toFixed(2));
        const battery_temp = data.battery_temp !== undefined ? Number(data.battery_temp) : 28.5;
        const battery_current = data.battery_current !== undefined ? Number(data.battery_current) : (data.light_state ? -1.8 : 2.2);
        const brightness = data.brightness !== undefined ? Number(data.brightness) : (data.light_state ? 100 : 0);
        const estimated_runtime_minutes = data.estimated_runtime_minutes !== undefined 
          ? Number(data.estimated_runtime_minutes)
          : Math.round((soc / 100) * 120 * (12.0 / Math.max(power_watts, 10)) * 60);
        const ambient_light_lux = data.ambient_light_lux !== undefined ? Number(data.ambient_light_lux) : (data.light_state ? 15 : 450);
        const tamper_status = Boolean(data.tamper_status ?? data.tamper);
        const light_state = Boolean(data.light_state);
        const energy_kwh = data.energy_kwh !== undefined ? Number(data.energy_kwh) : Number(((power_watts * 0.001 * (data.counter ?? 1)) / 120).toFixed(4));
        const timestamp = data.timestamp || new Date().toISOString();

        const telemRecord = {
          pole_id: poleId,
          counter: data.counter ?? 0,
          voltage,
          current,
          power_watts,
          energy_kwh,
          battery_voltage,
          battery_temp,
          state_of_charge: soc,
          battery_soc: soc,
          battery_current,
          estimated_runtime_minutes,
          ambient_light_lux,
          brightness,
          tamper_status,
          light_state,
          created_at: timestamp,
          timestamp,
        };

        // 1. ⚡ HOT PATH: Instant WebSocket broadcast without DB latency
        if (broadcastCallback) {
          broadcastCallback({
            type: 'TELEMETRY',
            pole_id: poleId,
            data: telemRecord,
          });
        }

        // 2. 💾 WARM PATH: Queue for micro-batch write
        telemetryWriteBuffer.push(telemRecord);
        if (telemetryWriteBuffer.length >= MAX_BATCH_SIZE) {
          flushTelemetryBuffer();
        }

        // 3. 🚨 ISA-18.2 Alarm Engine Evaluation with Hysteresis Bands
        // Low Battery: Trip at < 20%, Clear at >= 25% (prevents oscillation chatter)
        const isBatteryLow = soc < 20;
        const isBatteryHealthy = soc >= 25;
        await processAlarmLifecycle(
          poleId,
          'LOW_BATTERY',
          isBatteryLow,
          isBatteryHealthy,
          'CRITICAL',
          `Battery level critically low (${soc}%)`
        );

        // High Battery Temperature: Trip at > 40°C, Clear at <= 36°C
        const isTempHigh = battery_temp > 40.0;
        const isTempNormal = battery_temp <= 36.0;
        await processAlarmLifecycle(
          poleId,
          'BATTERY_OVERHEAT',
          isTempHigh,
          isTempNormal,
          'WARNING',
          `High battery temperature detected: ${battery_temp}°C`
        );

        // Voltage Anomaly: Trip at > 245V or < 205V, Clear at 210V - 240V
        const isVoltageAnomaly = (voltage > 245 || (voltage < 205 && voltage > 0));
        const isVoltageNormal = voltage >= 210 && voltage <= 240;
        await processAlarmLifecycle(
          poleId,
          'VOLTAGE_ANOMALY',
          isVoltageAnomaly,
          isVoltageNormal,
          'WARNING',
          `Abnormal voltage detected: ${voltage}V`
        );

        // Tamper / Physical security
        if (tamper_status || data.alert_type === 'TAMPER_THEFT' || data.alert_type === 'TAMPER') {
          await processAlarmLifecycle(
            poleId,
            'TAMPER_THEFT',
            true,
            false,
            'CRITICAL',
            data.message || '🚨 CRITICAL: Physical tamper sensor triggered on pole (Solar panel ripped off / 0V Theft Alert)'
          );
        }

      } else if (topic.startsWith('streetlight/alerts/')) {
        const poleId = topic.split('/')[2] || data.pole_id;
        const alertType = data.alert_type === 'TAMPER' || data.alert_type === 'TAMPER_THEFT' || data.tamper ? 'TAMPER_THEFT' : (data.alert_type || 'GENERAL');
        const severity = data.severity || (alertType === 'TAMPER_THEFT' ? 'CRITICAL' : 'WARNING');

        await processAlarmLifecycle(
          poleId,
          alertType,
          true,
          false,
          severity,
          data.message || (alertType === 'TAMPER_THEFT' ? '🚨 CRITICAL: Physical tamper sensor triggered on pole (Solar panel ripped off / 0V Theft Alert)' : 'General alert event')
        );
      }
    } catch (err) {
      console.error('[MQTT] Message processing error:', err.message);
    }
  });

  mqttClient.on('error', (err) => {
    console.error('❌ [MQTT] Connection Error:', err.message);
  });

  mqttClient.on('offline', () => {
    console.warn('⚠️ [MQTT] Client went offline');
  });

  return mqttClient;
}

/**
 * Publish control command to a pole
 */
export function sendControlCommand(poleId, command) {
  if (!mqttClient || !mqttClient.connected) {
    throw new Error('MQTT client not connected to broker');
  }

  const topic = `streetlight/control/${poleId}`;
  const payload = JSON.stringify({
    pole_id: poleId,
    timestamp: new Date().toISOString(),
    ...command,
  });

  mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error(`[MQTT] Failed to publish command to ${topic}:`, err);
    } else {
      console.log(`💡 [MQTT] Command published to ${topic}:`, payload);
    }
  });
}

/**
 * Gracefully close MQTT and flush remaining buffer
 */
export async function closeMQTT() {
  if (flushTimer) clearInterval(flushTimer);
  await flushTelemetryBuffer();
  if (mqttClient) {
    mqttClient.end(true);
  }
}
