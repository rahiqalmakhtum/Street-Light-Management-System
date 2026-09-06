import mqtt from 'mqtt';

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

function buildTelemetryPayload(pole, intervalMs = 3000) {
  if (pole.energy_kwh === undefined) pole.energy_kwh = 0.120;
  if (pole.battery_capacity_ah === undefined) pole.battery_capacity_ah = 120;
  if (pole.brightness === undefined) pole.brightness = pole.light_state ? 100 : 0;

  let power_watts = 0;
  let battery_voltage = 12.0;
  let battery_current = 0;
  let battery_temp = 28.0;
  let ambient_light_lux = 25.0;

  if (pole.tampered) {
    pole.voltage = 0;
    pole.current = 0;
    power_watts = 0;
    battery_voltage = 0;
    battery_current = 0;
    battery_temp = Number((27.0 + Math.random() * 1.5).toFixed(1));
    ambient_light_lux = 12.0;
  } else {
    pole.voltage = Number((230 + (Math.random() * 4 - 2)).toFixed(1));

    if (pole.light_state && pole.brightness > 0) {
      const loadFactor = (pole.brightness / 100);
      pole.current = Number(((loadFactor * 0.85) + 0.08 + (Math.random() * 0.04 - 0.02)).toFixed(2));
      power_watts = Number((pole.voltage * pole.current).toFixed(1));
      pole.energy_kwh = Number((pole.energy_kwh + (power_watts / 3600000) * (intervalMs / 1000)).toFixed(4));
      battery_current = Number((-0.6 - (loadFactor * 2.4) + (Math.random() * 0.1 - 0.05)).toFixed(2));
      battery_temp = Number((28.0 + (loadFactor * 9.5) + (Math.random() * 1.2)).toFixed(1));
      ambient_light_lux = Number((10.0 + (loadFactor * 18.0) + Math.random() * 3).toFixed(1));
    } else {
      pole.current = Number((0.04 + Math.random() * 0.02).toFixed(2));
      power_watts = Number((pole.voltage * pole.current).toFixed(1));
      battery_current = Number((1.8 + (Math.random() * 1.4)).toFixed(2));
      battery_temp = Number((25.5 + Math.random() * 1.8).toFixed(1));
      ambient_light_lux = Number((430.0 + Math.random() * 60).toFixed(1));
    }

    battery_voltage = Number((12.0 + (pole.battery_soc / 100) * 2.4).toFixed(2));
  }

  const dischargePerHour = pole.light_state ? (0.15 * (pole.brightness / 100)) : -0.2;
  pole.battery_soc = Math.max(10, Math.min(100, Number((pole.battery_soc - dischargePerHour * (intervalMs / 3600)).toFixed(1))));

  const estimated_runtime_minutes = pole.light_state && power_watts > 0
    ? Math.round((pole.battery_soc / 100) * pole.battery_capacity_ah * (battery_voltage / Math.max(power_watts, 10)) * 60)
    : Math.round((pole.battery_soc / 100) * pole.battery_capacity_ah * (battery_voltage / 50) * 60);

  pole.counter = (pole.counter || 0) + 1;

  return {
    pole_id: pole.pole_id,
    cluster_id: pole.cluster_id,
    gateway_id: pole.gateway_id,
    counter: pole.counter,
    voltage: pole.voltage,
    current: pole.current,
    power_watts,
    energy_kwh: pole.energy_kwh,
    battery_voltage,
    battery_current,
    battery_temp,
    battery_soc: pole.battery_soc,
    battery_capacity_ah: pole.battery_capacity_ah,
    estimated_runtime_minutes,
    ambient_light_lux,
    light_state: pole.light_state,
    brightness: pole.brightness,
    tamper_status: Boolean(pole.tampered),
    timestamp: new Date().toISOString(),
  };
}

let simulatorTimer = null;
let simClient = null;

export function startEmbeddedSimulator() {
  const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
  const intervalMs = parseInt(process.env.SIMULATION_INTERVAL_MS, 10) || 3000;

  console.log(`🤖 [Cloud Simulator] Starting autonomous background simulation on ${brokerUrl}...`);

  const simOptions = {
    clientId: `cloud-autonomous-simulator-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 3000,
  };
  if (process.env.MQTT_USERNAME) simOptions.username = process.env.MQTT_USERNAME;
  if (process.env.MQTT_PASSWORD) simOptions.password = process.env.MQTT_PASSWORD;

  simClient = mqtt.connect(brokerUrl, simOptions);

  simClient.on('connect', () => {
    console.log('✅ [Cloud Simulator] Connected to HiveMQ Broker & simulating 15 poles');
    simClient.subscribe('streetlight/control/+');
  });

  simClient.on('message', (topic, message) => {
    try {
      const poleId = topic.split('/')[2];
      const cmd = JSON.parse(message.toString());
      if (simulatedPoles[poleId]) {
        if (cmd.state !== undefined) simulatedPoles[poleId].light_state = Boolean(cmd.state);
        if (cmd.brightness !== undefined) simulatedPoles[poleId].brightness = Number(cmd.brightness);
        if (cmd.tamper !== undefined) simulatedPoles[poleId].tampered = Boolean(cmd.tamper);
        if (cmd.restore) {
          simulatedPoles[poleId].tampered = false;
          simulatedPoles[poleId].voltage = 230.0;
        }
      }
    } catch (e) {
      console.warn('[Cloud Simulator] Failed to handle incoming control:', e.message);
    }
  });

  simulatorTimer = setInterval(() => {
    if (!simClient || !simClient.connected) return;

    Object.keys(simulatedPoles).forEach((poleId) => {
      const pole = simulatedPoles[poleId];
      const payload = buildTelemetryPayload(pole, intervalMs);
      const topic = `streetlight/telemetry/${poleId}`;
      simClient.publish(topic, JSON.stringify(payload), { qos: 0 });
    });
  }, intervalMs);
}

export function stopEmbeddedSimulator() {
  if (simulatorTimer) clearInterval(simulatorTimer);
  if (simClient) simClient.end(true);
}
