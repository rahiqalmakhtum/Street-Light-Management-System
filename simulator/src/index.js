import mqtt from 'mqtt';
import dotenv from 'dotenv';
import path from 'path';
import readline from 'readline';
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

/**
 * Trigger Theft / Physical Tamper Alarm via MQTT
 * Simulates physical solar panel rip-off, dropping voltage to 0V and sending urgent alert.
 */
function triggerTheftTamper(targetPole = 'POLE-001') {
  if (!client.connected) {
    console.warn('⚠️ [Simulator] Cannot publish alert: MQTT client not connected');
    return;
  }

  // 1. Physically simulate solar panel rip-off on the target pole
  if (simulatedPoles[targetPole]) {
    const pole = simulatedPoles[targetPole];
    pole.tampered = true;
    pole.voltage = 0;
    pole.current = 0;
    pole.light_state = false;
    pole.brightness = 0;
  }

  // 2. Urgent Theft Alert Payload
  const alertPayload = {
    pole_id: targetPole,
    tamper: true,
    alert_type: 'TAMPER_THEFT',
    severity: 'CRITICAL',
    message: `🚨 CRITICAL: Solar panel physically detached / ripped off on ${targetPole}! Voltage dropped to 0V (Theft Alert)`,
    timestamp: new Date().toISOString(),
  };

  const alertTopic = `streetlight/alerts/${targetPole}`;
  client.publish(alertTopic, JSON.stringify(alertPayload), { qos: 1 }, (err) => {
    if (err) {
      console.error(`❌ [Simulator] Failed to publish tamper alert:`, err.message);
    } else {
      console.log(`\n🚨 =========================================================================`);
      console.log(`🚨 [SIMULATOR THEFT EMERGENCY] Solar panel ripped off on ${targetPole}!`);
      console.log(`🚨 Voltage dropped to 0V | Alert Dispatched to topic: ${alertTopic}`);
      console.log(`🚨 Message: ${alertPayload.message}`);
      console.log(`🚨 =========================================================================\n`);
    }
  });

  // 3. Immediately broadcast 0V telemetry frame
  if (simulatedPoles[targetPole]) {
    const pole = simulatedPoles[targetPole];
    pole.counter += 1;
    const telemetryPayload = {
      pole_id: pole.pole_id,
      counter: pole.counter,
      voltage: 0,
      current: 0,
      battery_soc: pole.battery_soc,
      light_state: false,
      timestamp: new Date().toISOString(),
    };
    client.publish(`streetlight/telemetry/${pole.pole_id}`, JSON.stringify(telemetryPayload), { qos: 0 });
  }
}

/**
 * Restore pole back to nominal condition
 */
function restorePole(targetPole = 'POLE-001') {
  if (simulatedPoles[targetPole]) {
    const pole = simulatedPoles[targetPole];
    pole.tampered = false;
    pole.voltage = 230;
    pole.current = pole.light_state ? 1.0 : 0.05;
    console.log(`✅ [Simulator Restored] ${targetPole} solar panel re-connected! Voltage restored to nominal 230V.`);

    // Immediately publish nominal telemetry
    pole.counter += 1;
    const telemetryPayload = {
      pole_id: pole.pole_id,
      counter: pole.counter,
      voltage: pole.voltage,
      current: pole.current,
      battery_soc: pole.battery_soc,
      light_state: pole.light_state,
      timestamp: new Date().toISOString(),
    };
    client.publish(`streetlight/telemetry/${pole.pole_id}`, JSON.stringify(telemetryPayload), { qos: 0 });
  }
}

/**
 * Toggle light state for a pole
 */
function togglePoleLight(poleId) {
  if (simulatedPoles[poleId]) {
    const pole = simulatedPoles[poleId];
    pole.tampered = false; // Reset tamper if light is actuated
    pole.light_state = !pole.light_state;
    pole.brightness = pole.light_state ? 100 : 0;
    console.log(`💡 [Simulator Manual] ${poleId} Light toggled: ${pole.light_state ? 'ON' : 'OFF'} (${pole.brightness}%)`);
  }
}

/**
 * Show Help Menu
 */
function printHelpMenu() {
  console.log(`
┌────────────────────────────────────────────────────────┐
│ 🎮 SIMULATOR INTERACTIVE KEYBOARD CONTROLS:            │
│   • Press [T] : Simulate Solar Panel Theft (0V + Alert)│
│   • Press [C] : Restore Pole Hardware (Back to 230V)   │
│   • Press [1] : Toggle POLE-001 Light (ON/OFF)         │
│   • Press [2] : Toggle POLE-002 Light (ON/OFF)         │
│   • Press [H] : Display This Help Menu                 │
└────────────────────────────────────────────────────────┘
`);
}

client.on('connect', () => {
  console.log('✅ [Simulator] Connected to HiveMQ Broker');

  // Listen to remote control commands from dashboard/backend
  client.subscribe('streetlight/control/+', (err) => {
    if (err) {
      console.error('[Simulator] Subscription error:', err);
    } else {
      console.log('📥 [Simulator] Subscribed to streetlight/control/+ (Listening for actuator commands)');
      printHelpMenu();
    }
  });
});

client.on('message', (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    const poleId = topic.split('/')[2];

    if (simulatedPoles[poleId]) {
      const pole = simulatedPoles[poleId];
      if (data.tamper) {
        pole.tampered = true;
        pole.voltage = 0;
        pole.current = 0;
        pole.light_state = false;
        console.log(`🚨 [Simulator Tamper Command] ${poleId} Voltage dropped to 0V (Theft event active)!`);
      } else if (data.restore || data.resolve || data.tamper === false) {
        pole.tampered = false;
        pole.voltage = 230;
        pole.current = pole.light_state ? 1.0 : 0.05;
        console.log(`✅ [Simulator Restored] ${poleId} Hardware restored to nominal 230V via control command!`);

        pole.counter += 1;
        const telemetryPayload = {
          pole_id: pole.pole_id,
          counter: pole.counter,
          voltage: pole.voltage,
          current: pole.current,
          battery_soc: pole.battery_soc,
          light_state: pole.light_state,
          timestamp: new Date().toISOString(),
        };
        client.publish(`streetlight/telemetry/${pole.pole_id}`, JSON.stringify(telemetryPayload), { qos: 0 });
      } else {
        pole.tampered = false;
        const targetState = data.light_state !== undefined ? data.light_state : data.state;
        if (targetState !== undefined) {
          pole.light_state = Boolean(targetState);
          pole.brightness = data.brightness ?? (pole.light_state ? 100 : 0);
          console.log(`💡 [Simulator Actuator] ${poleId} Light toggled: ${pole.light_state ? 'ON' : 'OFF'} (${pole.brightness}%)`);
        }
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

    if (pole.tampered) {
      // Tampered state: 0V, 0A
      pole.voltage = 0;
      pole.current = 0;
    } else {
      // Normal electrical physics
      pole.voltage = Number((230 + (Math.random() * 3 - 1.5)).toFixed(1));

      if (pole.light_state) {
        const load = (pole.brightness / 100) * 0.9 + 0.1;
        pole.current = Number((load + (Math.random() * 0.08 - 0.04)).toFixed(2));
        if (Math.random() > 0.6 && pole.battery_soc > 15) {
          pole.battery_soc -= 1;
        }
      } else {
        pole.current = Number((0.05 + Math.random() * 0.02).toFixed(2));
        if (Math.random() > 0.7 && pole.battery_soc < 100) {
          pole.battery_soc += 1;
        }
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

// ======================== INTERACTIVE STDIN KEYBOARD HANDLER ========================
if (process.stdin.isTTY) {
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') {
      process.exit();
    }

    const input = (str || key.name || '').toLowerCase();
    if (input === 't') {
      triggerTheftTamper('POLE-001');
    } else if (input === 'c') {
      restorePole('POLE-001');
      restorePole('POLE-002');
    } else if (input === '1') {
      togglePoleLight('POLE-001');
    } else if (input === '2') {
      togglePoleLight('POLE-002');
    } else if (input === 'h' || input === '?') {
      printHelpMenu();
    }
  });
} else {
  // Non-TTY / piped input fallback (e.g. when run via concurrently or buffer)
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', (chunk) => {
    const lines = chunk.toString().trim().split(/\r?\n/);
    for (const raw of lines) {
      const input = raw.trim().toLowerCase();
      if (input === 't') {
        triggerTheftTamper('POLE-001');
      } else if (input === 'c') {
        restorePole('POLE-001');
        restorePole('POLE-002');
      } else if (input === '1') {
        togglePoleLight('POLE-001');
      } else if (input === '2') {
        togglePoleLight('POLE-002');
      } else if (input === 'h' || input === '?') {
        printHelpMenu();
      }
    }
  });
}
