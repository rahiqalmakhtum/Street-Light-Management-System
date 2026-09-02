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

// State representation for the 15 simulated poles across 3 clusters in Uttara Sector 18 / Diabari, Dhaka
const simulatedPoles = {
  // Cluster A (Gate 1 - Diabari Metro Rail Area, GATEWAY-01)
  'POLE-001': { pole_id: 'POLE-001', name: 'Metro Gate 1 North Entry', cluster_id: 'CLUSTER-A', gateway_id: 'GATEWAY-01', battery_capacity_ah: 120, counter: 10, voltage: 230.2, current: 0.85, battery_soc: 94, light_state: true, brightness: 100, energy_kwh: 0.120 },
  'POLE-002': { pole_id: 'POLE-002', name: 'Metro Gate 1 South Plaza', cluster_id: 'CLUSTER-A', gateway_id: 'GATEWAY-01', battery_capacity_ah: 120, counter: 10, voltage: 228.6, current: 0.88, battery_soc: 88, light_state: true, brightness: 100, energy_kwh: 0.115 },
  'POLE-003': { pole_id: 'POLE-003', name: 'Diabari Concourse East', cluster_id: 'CLUSTER-A', gateway_id: 'GATEWAY-01', battery_capacity_ah: 100, counter: 10, voltage: 230.0, current: 0.78, battery_soc: 91, light_state: true, brightness: 90, energy_kwh: 0.098 },
  'POLE-004': { pole_id: 'POLE-004', name: 'Diabari Concourse West', cluster_id: 'CLUSTER-A', gateway_id: 'GATEWAY-01', battery_capacity_ah: 100, counter: 10, voltage: 229.5, current: 0.79, battery_soc: 90, light_state: true, brightness: 90, energy_kwh: 0.095 },
  'POLE-005': { pole_id: 'POLE-005', name: 'Metro Station Bus Bay', cluster_id: 'CLUSTER-A', gateway_id: 'GATEWAY-01', battery_capacity_ah: 150, counter: 10, voltage: 231.0, current: 0.92, battery_soc: 96, light_state: true, brightness: 100, energy_kwh: 0.140 },

  // Cluster B (Sonargaon Janapath Extension, GATEWAY-02)
  'POLE-006': { pole_id: 'POLE-006', name: 'Sonargaon Janapath Post 01', cluster_id: 'CLUSTER-B', gateway_id: 'GATEWAY-02', battery_capacity_ah: 120, counter: 10, voltage: 230.8, current: 0.84, battery_soc: 92, light_state: true, brightness: 100, energy_kwh: 0.105 },
  'POLE-007': { pole_id: 'POLE-007', name: 'Sonargaon Janapath Post 02', cluster_id: 'CLUSTER-B', gateway_id: 'GATEWAY-02', battery_capacity_ah: 120, counter: 10, voltage: 229.9, current: 0.86, battery_soc: 89, light_state: true, brightness: 100, energy_kwh: 0.110 },
  'POLE-008': { pole_id: 'POLE-008', name: 'Sector 18 Avenue Intersection', cluster_id: 'CLUSTER-B', gateway_id: 'GATEWAY-02', battery_capacity_ah: 150, counter: 10, voltage: 231.4, current: 0.89, battery_soc: 95, light_state: true, brightness: 100, energy_kwh: 0.130 },
  'POLE-009': { pole_id: 'POLE-009', name: 'Sonargaon East Corridor 01', cluster_id: 'CLUSTER-B', gateway_id: 'GATEWAY-02', battery_capacity_ah: 100, counter: 10, voltage: 228.9, current: 0.72, battery_soc: 85, light_state: true, brightness: 80, energy_kwh: 0.088 },
  'POLE-010': { pole_id: 'POLE-010', name: 'Sonargaon East Corridor 02', cluster_id: 'CLUSTER-B', gateway_id: 'GATEWAY-02', battery_capacity_ah: 100, counter: 10, voltage: 229.2, current: 0.71, battery_soc: 84, light_state: true, brightness: 80, energy_kwh: 0.085 },

  // Cluster C (Diabari Bridge & Lake Road, GATEWAY-03)
  'POLE-011': { pole_id: 'POLE-011', name: 'Diabari Bridge Approach North', cluster_id: 'CLUSTER-C', gateway_id: 'GATEWAY-03', battery_capacity_ah: 150, counter: 10, voltage: 230.1, current: 0.90, battery_soc: 93, light_state: true, brightness: 100, energy_kwh: 0.125 },
  'POLE-012': { pole_id: 'POLE-012', name: 'Diabari Bridge Center Span', cluster_id: 'CLUSTER-C', gateway_id: 'GATEWAY-03', battery_capacity_ah: 150, counter: 10, voltage: 230.5, current: 0.91, battery_soc: 94, light_state: true, brightness: 100, energy_kwh: 0.128 },
  'POLE-013': { pole_id: 'POLE-013', name: 'Diabari Bridge Approach South', cluster_id: 'CLUSTER-C', gateway_id: 'GATEWAY-03', battery_capacity_ah: 150, counter: 10, voltage: 229.8, current: 0.89, battery_soc: 92, light_state: true, brightness: 100, energy_kwh: 0.122 },
  'POLE-014': { pole_id: 'POLE-014', name: 'Lake Drive Promenade 01', cluster_id: 'CLUSTER-C', gateway_id: 'GATEWAY-03', battery_capacity_ah: 100, counter: 10, voltage: 228.7, current: 0.76, battery_soc: 87, light_state: true, brightness: 85, energy_kwh: 0.092 },
  'POLE-015': { pole_id: 'POLE-015', name: 'Lake Drive Promenade 02', cluster_id: 'CLUSTER-C', gateway_id: 'GATEWAY-03', battery_capacity_ah: 100, counter: 10, voltage: 228.4, current: 0.75, battery_soc: 86, light_state: true, brightness: 85, energy_kwh: 0.090 },
};

console.log(`[Simulator] Connecting to HiveMQ broker at ${brokerUrl}...`);
const client = mqtt.connect(brokerUrl, {
  clientId: `hardware-simulator-${Math.random().toString(16).slice(2, 8)}`,
  reconnectPeriod: 3000,
});

/**
 * Build unified, comprehensive telemetry & battery analytics payload
 */
function buildTelemetryPayload(pole) {
  if (pole.energy_kwh === undefined) pole.energy_kwh = 0.120;
  if (pole.battery_capacity_ah === undefined) pole.battery_capacity_ah = 120;
  if (pole.brightness === undefined) pole.brightness = pole.light_state ? 100 : 0;

  let power_watts = 0;
  let battery_voltage = 12.0;
  let battery_current = 0;
  let battery_temp = 28.0;
  let ambient_light_lux = 25.0;

  if (pole.tampered) {
    // Battery Stolen / Disconnected Tampered state: 0V, 0A, 0W, 0% SoC, 0V Battery
    pole.voltage = 0;
    pole.current = 0;
    power_watts = 0;
    battery_voltage = 0;
    battery_current = 0;
    battery_temp = Number((27.0 + Math.random() * 1.5).toFixed(1));
    ambient_light_lux = 12.0;
  } else {
    // Nominal AC / DC bus voltage (210V - 240V)
    pole.voltage = Number((230 + (Math.random() * 4 - 2)).toFixed(1));

    if (pole.light_state && pole.brightness > 0) {
      // Discharging under active LED load
      const loadFactor = (pole.brightness / 100);
      pole.current = Number(((loadFactor * 0.85) + 0.08 + (Math.random() * 0.04 - 0.02)).toFixed(2));
      power_watts = Number((pole.voltage * pole.current).toFixed(1));
      pole.energy_kwh = Number((pole.energy_kwh + (power_watts / 3600000) * (intervalMs / 1000)).toFixed(4));

      // Battery discharge current proportional to dimmer level (e.g. -0.8A at 25% up to -3.2A at 100%)
      battery_current = Number((-0.6 - (loadFactor * 2.4) + (Math.random() * 0.1 - 0.05)).toFixed(2));
      // Battery temperature warms up under load (28°C to 39°C)
      battery_temp = Number((28.0 + (loadFactor * 9.5) + (Math.random() * 1.2)).toFixed(1));
      ambient_light_lux = Number((10.0 + (loadFactor * 18.0) + Math.random() * 3).toFixed(1));
    } else {
      // Standby / Daylight Solar Charging
      pole.current = Number((0.04 + Math.random() * 0.02).toFixed(2));
      power_watts = Number((pole.voltage * pole.current).toFixed(1));
      
      // Solar charging current (positive: +1.5A to +3.8A)
      battery_current = Number((1.8 + (Math.random() * 1.4)).toFixed(2));
      // Battery cools down towards ambient in standby (25°C to 27.5°C)
      battery_temp = Number((25.5 + Math.random() * 1.8).toFixed(1));
      ambient_light_lux = Number((430.0 + Math.random() * 60).toFixed(1));
    }

    // Battery voltage strictly follows standard chemistry SoC curve: 12.0V (0%) to 14.4V (100%)
    battery_voltage = Number((12.0 + (pole.battery_soc / 100) * 2.4).toFixed(2));
  }

  // Estimated backup runtime (minutes) calculated dynamically
  const effectiveLoadWatts = Math.max(power_watts, 10);
  const totalBatteryWattHours = pole.battery_capacity_ah * 12.8;
  const remainingEnergyWattHours = totalBatteryWattHours * ((pole.tampered ? 0 : pole.battery_soc) / 100);
  const estimated_runtime_minutes = pole.tampered ? 0 : Math.round((remainingEnergyWattHours / effectiveLoadWatts) * 60);

  return {
    pole_id: pole.pole_id,
    name: pole.name,
    cluster_id: pole.cluster_id,
    gateway_id: pole.gateway_id,
    counter: pole.counter,
    voltage: pole.voltage,
    current: pole.current,
    power_watts,
    energy_kwh: Number(pole.energy_kwh.toFixed(4)),
    battery_voltage,
    battery_temp,
    state_of_charge: pole.tampered ? 0 : pole.battery_soc,
    battery_soc: pole.tampered ? 0 : pole.battery_soc,
    battery_current,
    estimated_runtime_minutes,
    ambient_light_lux,
    brightness: pole.brightness,
    tamper_status: Boolean(pole.tampered),
    light_state: pole.light_state,
    timestamp: new Date().toISOString(),
  };
}

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
    tamper_status: true,
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
    const telemetryPayload = buildTelemetryPayload(pole);
    client.publish(`streetlight/telemetry/${pole.pole_id}`, JSON.stringify(telemetryPayload), { qos: 0 });
  }
}

/**
 * Restore pole(s) back to nominal condition
 */
function restorePole(targetPole = null) {
  const polesToRestore = targetPole ? [targetPole] : Object.keys(simulatedPoles);
  for (const pid of polesToRestore) {
    if (simulatedPoles[pid]) {
      const pole = simulatedPoles[pid];
      pole.tampered = false;
      pole.voltage = 230;
      pole.current = pole.light_state ? 0.85 : 0.05;
      console.log(`✅ [Simulator Restored] ${pid} solar panel re-connected! Voltage restored to nominal 230V.`);

      pole.counter += 1;
      const telemetryPayload = buildTelemetryPayload(pole);
      client.publish(`streetlight/telemetry/${pole.pole_id}`, JSON.stringify(telemetryPayload), { qos: 0 });
    }
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

    pole.counter += 1;
    const telemetryPayload = buildTelemetryPayload(pole);
    client.publish(`streetlight/telemetry/${pole.pole_id}`, JSON.stringify(telemetryPayload), { qos: 0 });
  }
}

/**
 * Set all poles ON or OFF
 */
function setAllPoles(state) {
  for (const pid of Object.keys(simulatedPoles)) {
    const pole = simulatedPoles[pid];
    pole.tampered = false;
    pole.light_state = Boolean(state);
    pole.brightness = state ? 100 : 0;
    pole.counter += 1;
    const telemetryPayload = buildTelemetryPayload(pole);
    client.publish(`streetlight/telemetry/${pole.pole_id}`, JSON.stringify(telemetryPayload), { qos: 0 });
  }
  console.log(`💡 [Simulator Bulk] All 15 poles switched ${state ? 'ON (100%)' : 'OFF (0%)'}`);
}

/**
 * Show Help Menu
 */
function printHelpMenu() {
  console.log(`
┌────────────────────────────────────────────────────────────────────────┐
│ 🎮 SMART STREET LIGHT SIMULATOR INTERACTIVE KEYBOARD CONTROLS:         │
│   • Press [T]     : Simulate Solar Panel Theft / Tamper (0V + Alarm)   │
│   • Press [C]     : Restore All Poles Hardware (Back to 230V Nominal)  │
│   • Press [1]-[9] : Toggle Light ON/OFF for POLE-001 through POLE-009  │
│   • Press [A]     : Turn ALL 15 Lights ON (100% Brightness)            │
│   • Press [O]     : Turn ALL 15 Lights OFF (0% Standby Charging)       │
│   • Press [H]     : Display This Interactive Help Menu                 │
└────────────────────────────────────────────────────────────────────────┘
`);
}

client.on('connect', () => {
  console.log('✅ [Simulator] Connected to HiveMQ Broker');

  // Listen to remote control commands from dashboard/backend for all 15 poles
  client.subscribe('streetlight/control/+', (err) => {
    if (err) {
      console.error('[Simulator] Subscription error:', err);
    } else {
      console.log('📥 [Simulator] Subscribed to streetlight/control/+ (Listening for actuator commands)');
      printHelpMenu();
    }
  });
});

// Handle incoming downlink control commands (REST API / Dashboard -> MQTT -> Simulator)
client.on('message', (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    const poleId = topic.split('/')[2];

    if (simulatedPoles[poleId]) {
      const pole = simulatedPoles[poleId];

      if (data.tamper) {
        // Physical tamper / rip-off command
        pole.tampered = true;
        pole.voltage = 0;
        pole.current = 0;
        pole.light_state = false;
        pole.brightness = 0;
        console.log(`🚨 [Simulator Tamper Command] ${poleId} Voltage dropped to 0V (Theft event active)!`);
      } else if (data.restore || data.resolve || data.tamper === false) {
        // Restore hardware command (re-enable 230V grid, battery connected at healthy ~92% charge & full nominal brightness)
        pole.tampered = false;
        pole.voltage = 230;
        pole.battery_soc = 92;
        pole.light_state = data.light_state !== undefined ? Boolean(data.light_state) : true;
        pole.brightness = data.brightness !== undefined ? Number(data.brightness) : 100;
        pole.current = pole.light_state ? 0.85 : 0.05;
        console.log(`✅ [Simulator Restored] ${poleId} Hardware, Battery (92%) and Luminaire restored to nominal 230V / ${pole.brightness}% illumination!`);
      } else {
        // Light actuation / Dimmer adjustment
        pole.tampered = false;
        const targetState = data.light_state !== undefined ? data.light_state : data.state;
        if (targetState !== undefined) {
          pole.light_state = Boolean(targetState);
        }

        if (data.brightness !== undefined) {
          pole.brightness = Math.min(100, Math.max(0, Number(data.brightness)));
          if (pole.brightness === 0) {
            pole.light_state = false;
          } else if (targetState === undefined && !pole.light_state) {
            pole.light_state = true;
          }
        } else {
          pole.brightness = pole.light_state ? (pole.brightness > 0 ? pole.brightness : 100) : 0;
        }

        console.log(`💡 [Simulator Actuator] ${poleId} Light toggled: ${pole.light_state ? 'ON' : 'OFF'} (${pole.brightness}%)`);
      }

      // Immediately publish updated telemetry frame
      pole.counter += 1;
      const telemetryPayload = buildTelemetryPayload(pole);
      client.publish(`streetlight/telemetry/${pole.pole_id}`, JSON.stringify(telemetryPayload), { qos: 0 });
    }
  } catch (err) {
    console.error('[Simulator] Error processing command message:', err.message);
  }
});

// Periodic telemetry generator with realistic battery charge/discharge physics for all 15 poles concurrently
setInterval(() => {
  if (!client.connected) return;

  for (const poleId of Object.keys(simulatedPoles)) {
    const pole = simulatedPoles[poleId];
    pole.counter += 1;

    // Realistic battery charge & discharge cycling
    if (!pole.tampered) {
      if (pole.light_state && pole.brightness > 0) {
        // Discharges faster when dimmed higher
        const dischargeProb = 0.3 + (pole.brightness / 100) * 0.45;
        if (Math.random() < dischargeProb && pole.battery_soc > 10) {
          pole.battery_soc -= 1;
        }
      } else {
        // Daytime solar charging increases SoC
        if (Math.random() < 0.65 && pole.battery_soc < 100) {
          pole.battery_soc += 1;
        }
      }
    }

    const telemetryPayload = buildTelemetryPayload(pole);
    const topic = `streetlight/telemetry/${pole.pole_id}`;
    client.publish(topic, JSON.stringify(telemetryPayload), { qos: 0 });

    if (pole.counter % 5 === 0 || pole.pole_id === 'POLE-001') {
      console.log(
        `📡 [Simulator Telemetry] [${pole.pole_id}] ` +
        `V:${telemetryPayload.voltage}V | I:${telemetryPayload.current}A | P:${telemetryPayload.power_watts}W | ` +
        `BattV:${telemetryPayload.battery_voltage}V | BattI:${telemetryPayload.battery_current}A | BattTemp:${telemetryPayload.battery_temp}°C | ` +
        `SoC:${telemetryPayload.state_of_charge}% | Backup:${telemetryPayload.estimated_runtime_minutes}m | ` +
        `Light:${telemetryPayload.light_state ? 'ON' : 'OFF'} (${telemetryPayload.brightness}%)`
      );
    }
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
      restorePole();
    } else if (input >= '1' && input <= '9') {
      const poleNum = String(input).padStart(3, '0');
      togglePoleLight(`POLE-${poleNum}`);
    } else if (input === 'a') {
      setAllPoles(true);
    } else if (input === 'o') {
      setAllPoles(false);
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
        restorePole();
      } else if (input >= '1' && input <= '9') {
        const poleNum = String(input).padStart(3, '0');
        togglePoleLight(`POLE-${poleNum}`);
      } else if (input === 'a') {
        setAllPoles(true);
      } else if (input === 'o') {
        setAllPoles(false);
      } else if (input === 'h' || input === '?') {
        printHelpMenu();
      }
    }
  });
}
