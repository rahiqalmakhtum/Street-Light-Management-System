import mqtt from 'mqtt';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const intervalMs = parseInt(process.env.SIMULATION_INTERVAL_MS, 10) || 3000;

// State representation for the simulated poles
const simulatedPoles = {
  'POLE-001': {
    pole_id: 'POLE-001',
    counter: 10,
    voltage: 230.2,
    current: 0.85,
    battery_soc: 94,
    light_state: true,
    brightness: 100,
  },
  'POLE-002': {
    pole_id: 'POLE-002',
    counter: 10,
    voltage: 228.6,
    current: 0.88,
    battery_soc: 88,
    light_state: true,
    brightness: 100,
  },
};

console.log(`[Simulator] Connecting to HiveMQ broker at ${brokerUrl}...`);
const client = mqtt.connect(brokerUrl, {
  clientId: `hardware-simulator-${Math.random().toString(16).slice(2, 8)}`,
  reconnectPeriod: 3000,
});

client.on('connect', () => {
  console.log('✅ [Simulator] Connected to HiveMQ Broker');

  // Listen to remote control commands from dashboard/backend
  client.subscribe('streetlight/control/+', (err) => {
    if (err) {
      console.error('[Simulator] Subscription error:', err);
    } else {
      console.log('📥 [Simulator] Subscribed to streetlight/control/+ (Listening for actuator commands)');
    }
  });
});

client.on('message', (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    const poleId = topic.split('/')[2];

    if (simulatedPoles[poleId]) {
      const pole = simulatedPoles[poleId];
      const targetState = data.light_state !== undefined ? data.light_state : data.state;
      if (targetState !== undefined) {
        pole.light_state = Boolean(targetState);
        pole.brightness = data.brightness ?? (pole.light_state ? 100 : 0);
        console.log(`💡 [Simulator Actuator] ${poleId} Light toggled: ${pole.light_state ? 'ON' : 'OFF'} (${pole.brightness}%)`);
      }
    }
  } catch (err) {
    console.error('[Simulator] Error processing command message:', err.message);
  }
});

// Periodic telemetry generator
setInterval(() => {
  if (!client.connected) return;

  for (const poleId of Object.keys(simulatedPoles)) {
    const pole = simulatedPoles[poleId];
    pole.counter += 1;

    // Simulate realistic electrical physics
    // Base grid voltage around 230V with minor random fluctuations (+/- 1.5V)
    pole.voltage = Number((230 + (Math.random() * 3 - 1.5)).toFixed(1));

    // When light is ON, current depends on brightness (0.7A - 1.2A), when OFF standby (0.04A - 0.08A)
    if (pole.light_state) {
      const load = (pole.brightness / 100) * 0.9 + 0.1;
      pole.current = Number((load + (Math.random() * 0.08 - 0.04)).toFixed(2));
      // Battery slowly discharges if not on solar charge
      if (Math.random() > 0.6 && pole.battery_soc > 15) {
        pole.battery_soc -= 1;
      }
    } else {
      pole.current = Number((0.05 + Math.random() * 0.02).toFixed(2));
      // Battery recovers or charges during day/off-cycle
      if (Math.random() > 0.7 && pole.battery_soc < 100) {
        pole.battery_soc += 1;
      }
    }

    const telemetryPayload = {
      pole_id: pole.pole_id,
      counter: pole.counter,
      voltage: pole.voltage,
      current: pole.current,
      battery_soc: pole.battery_soc,
      light_state: pole.light_state,
      timestamp: new Date().toISOString(),
    };

    const topic = `streetlight/telemetry/${pole.pole_id}`;
    client.publish(topic, JSON.stringify(telemetryPayload), { qos: 0 });
    console.log(`📡 [Simulator Telemetry] [${pole.pole_id}] V:${pole.voltage}V | I:${pole.current}A | SoC:${pole.battery_soc}% | Light:${pole.light_state ? 'ON' : 'OFF'}`);
  }
}, intervalMs);

client.on('error', (err) => {
  console.error('❌ [Simulator] MQTT error:', err.message);
});
