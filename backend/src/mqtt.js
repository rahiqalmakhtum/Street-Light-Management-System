import mqtt from 'mqtt';
import dotenv from 'dotenv';
import { saveTelemetry, saveAlert } from './db.js';

dotenv.config();

const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
let mqttClient = null;
let broadcastCallback = null;

export function setBroadcastCallback(cb) {
  broadcastCallback = cb;
}

export function initMQTT() {
  console.log(`[MQTT] Connecting to HiveMQ broker at ${brokerUrl}...`);
  
  mqttClient = mqtt.connect(brokerUrl, {
    reconnectPeriod: 3000,
    connectTimeout: 5000,
    clientId: `backend-service-${Math.random().toString(16).slice(2, 8)}`,
  });

  mqttClient.on('connect', () => {
    console.log('✅ [MQTT] Successfully connected to HiveMQ Broker');
    
    // Subscribe to telemetry and alerts from all street light poles
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
        const record = await saveTelemetry({
          pole_id: poleId,
          counter: data.counter ?? 0,
          voltage: data.voltage ?? 230,
          current: data.current ?? 0.8,
          battery_soc: data.battery_soc ?? 90,
          light_state: Boolean(data.light_state),
        });

        // Threshold & Anomaly / Tamper checks
        if (data.tamper || data.alert_type === 'TAMPER_THEFT') {
          const alert = await saveAlert({
            pole_id: poleId,
            severity: 'CRITICAL',
            message: data.message || 'CRITICAL: Physical tamper or theft attempt detected on pole',
          });
          if (broadcastCallback) {
            broadcastCallback({ type: 'ALERT', data: alert });
          }
        } else if (data.battery_soc < 20) {
          const alert = await saveAlert({
            pole_id: poleId,
            severity: 'CRITICAL',
            message: `Battery level critically low (${data.battery_soc}%)`,
          });
          if (broadcastCallback) {
            broadcastCallback({ type: 'ALERT', data: alert });
          }
        } else if (data.voltage > 245 || data.voltage < 205) {
          const alert = await saveAlert({
            pole_id: poleId,
            severity: 'WARNING',
            message: `Abnormal voltage detected: ${data.voltage}V`,
          });
          if (broadcastCallback) {
            broadcastCallback({ type: 'ALERT', data: alert });
          }
        }

        // Broadcast telemetry update via WebSocket
        if (broadcastCallback) {
          broadcastCallback({
            type: 'TELEMETRY',
            pole_id: poleId,
            data: record,
          });
        }
      } else if (topic.startsWith('streetlight/alerts/')) {
        const poleId = topic.split('/')[2] || data.pole_id;
        const severity = data.severity || (data.tamper || data.alert_type === 'TAMPER_THEFT' ? 'CRITICAL' : 'WARNING');
        const alert = await saveAlert({
          pole_id: poleId,
          severity,
          message: data.message || (data.tamper ? 'CRITICAL: Tamper detected' : 'General alert received'),
        });

        if (broadcastCallback) {
          broadcastCallback({ type: 'ALERT', data: alert });
        }
      }
    } catch (err) {
      console.error('[MQTT] Error processing incoming message:', err.message);
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
 * @param {string} poleId 
 * @param {object} command e.g. { light_state: true, brightness: 100 }
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
      console.error(`[MQTT] Failed to publish control command to ${topic}:`, err);
    } else {
      console.log(`💡 [MQTT] Published command to ${topic}:`, payload);
    }
  });
}
