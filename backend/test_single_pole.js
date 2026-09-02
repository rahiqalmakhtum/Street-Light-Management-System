import WebSocket from 'ws';

const HTTP_BASE = 'http://127.0.0.1:4000';
const WS_URL = 'ws://127.0.0.1:4000/ws';

async function runSinglePoleTest() {
  console.log('===============================================================');
  console.log('🧪 COMPREHENSIVE SINGLE POLE (POLE-001) VERIFICATION TEST');
  console.log('===============================================================\n');

  const testResults = [];

  function record(section, name, pass, details) {
    testResults.push({ section, name, pass, details });
    const icon = pass ? '✅' : '❌';
    console.log(`${icon} [${section}] ${name}: ${details}`);
  }

  // 1. READINGS VERIFICATION
  console.log('\n--- 1. Live Telemetry Readings ---');
  try {
    const res = await fetch(`${HTTP_BASE}/api/poles`);
    const data = await res.json();
    const pole001 = data.data?.find(p => p.pole_id === 'POLE-001');

    if (!pole001) {
      record('Readings', 'Fetch POLE-001', false, 'POLE-001 not found in response');
    } else {
      record('Readings', 'Fetch POLE-001', true, `Name: ${pole001.name}, Cluster: ${pole001.cluster_id}`);
      
      const readings = [
        { key: 'Voltage', val: pole001.latest_voltage, unit: 'V' },
        { key: 'Current', val: pole001.latest_current, unit: 'A' },
        { key: 'Power', val: pole001.latest_power_watts, unit: 'W' },
        { key: 'Energy', val: pole001.latest_energy_kwh, unit: 'kWh' },
        { key: 'Battery SoC', val: pole001.latest_battery_soc, unit: '%' },
        { key: 'Battery Voltage', val: pole001.latest_battery_voltage, unit: 'V' },
        { key: 'Battery Current', val: pole001.latest_battery_current, unit: 'A' },
        { key: 'Ambient Lux', val: pole001.latest_ambient_light_lux || pole001.latest_ambient_lux, unit: 'lx' },
        { key: 'Battery Temp', val: pole001.latest_battery_temp || pole001.latest_temperature, unit: '°C' },
        { key: 'Brightness', val: pole001.latest_brightness, unit: '%' },
        { key: 'Light State', val: pole001.latest_light_state, unit: 'bool' },
      ];

      for (const r of readings) {
        const isValid = r.val !== undefined && r.val !== null;
        record('Readings', `Metric: ${r.key}`, isValid, `Value: ${r.val} ${r.unit}`);
      }
    }
  } catch (err) {
    record('Readings', 'Fetch POLE-001', false, err.message);
  }

  // 2. ACTUATOR & DIMMER CONTROL
  console.log('\n--- 2. Actuator & Dimming Control Tests ---');
  const dimLevels = [30, 50, 80, 100];
  for (const brightness of dimLevels) {
    try {
      const res = await fetch(`${HTTP_BASE}/api/poles/POLE-001/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: true,
          brightness: brightness,
        }),
      });
      const data = await res.json();
      record('Controls', `Set Brightness to ${brightness}%`, res.ok && data.success, `HTTP ${res.status}, Command: ${JSON.stringify(data.command)}`);
    } catch (err) {
      record('Controls', `Set Brightness to ${brightness}%`, false, err.message);
    }
  }

  // Test Toggle OFF (0%)
  try {
    const res = await fetch(`${HTTP_BASE}/api/poles/POLE-001/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: false,
        brightness: 0,
      }),
    });
    const data = await res.json();
    record('Controls', 'Turn Light OFF (0%)', res.ok && data.success, `HTTP ${res.status}, Command: ${JSON.stringify(data.command)}`);
  } catch (err) {
    record('Controls', 'Turn Light OFF', false, err.message);
  }

  // Restore to ON (100%)
  try {
    const res = await fetch(`${HTTP_BASE}/api/poles/POLE-001/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: true,
        brightness: 100,
      }),
    });
    const data = await res.json();
    record('Controls', 'Restore Light ON (100%)', res.ok && data.success, `HTTP ${res.status}, Command: ${JSON.stringify(data.command)}`);
  } catch (err) {
    record('Controls', 'Restore Light ON', false, err.message);
  }

  // 3. GRAPHS & TELEMETRY HISTORY
  console.log('\n--- 3. Telemetry Graphs & Sparkline History ---');
  try {
    const res = await fetch(`${HTTP_BASE}/api/poles/POLE-001/history?limit=30`);
    const data = await res.json();
    const isArray = Array.isArray(data.data);
    const count = isArray ? data.data.length : 0;
    record('Graphs', 'Rolling Telemetry History API', res.ok && isArray, `HTTP ${res.status}, Frames: ${count}`);

    if (count > 0) {
      const sample = data.data[0];
      const hasProps = 'voltage' in sample && 'current' in sample && 'power_watts' in sample && 'battery_soc' in sample;
      record('Graphs', 'Sparkline Time-Series Schema', hasProps, `Sample: Volts=${sample.voltage}V, Watts=${sample.power_watts}W, SoC=${sample.battery_soc}%`);
    }
  } catch (err) {
    record('Graphs', 'Rolling Telemetry History API', false, err.message);
  }

  // 4. GPS POSITIONING & COORDINATE UPDATES
  console.log('\n--- 4. GPS Positioning & Relocation Tests ---');
  const originalCoords = { latitude: 23.87200, longitude: 90.38000 };
  const testCoords = { latitude: 23.87215, longitude: 90.38015 };

  try {
    // Update Coords
    const resUpdate = await fetch(`${HTTP_BASE}/api/poles/POLE-001/position`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testCoords),
    });
    record('Positioning', 'Update GPS Coordinates (PUT /position)', resUpdate.ok, `HTTP ${resUpdate.status}, New: (${testCoords.latitude}, ${testCoords.longitude})`);

    // Verify Updated Coords
    const resVerify = await fetch(`${HTTP_BASE}/api/poles`);
    const dataVerify = await resVerify.json();
    const updatedPole = dataVerify.data?.find(p => p.pole_id === 'POLE-001');
    const matched = updatedPole && Number(updatedPole.latitude).toFixed(5) === testCoords.latitude.toFixed(5);
    record('Positioning', 'Verify Relocated GPS Position in DB', matched, `DB Latitude: ${updatedPole?.latitude}`);

    // Restore Original Coords
    const resRestore = await fetch(`${HTTP_BASE}/api/poles/POLE-001/position`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(originalCoords),
    });
    record('Positioning', 'Restore Original Coordinates (23.87200, 90.38000)', resRestore.ok, `HTTP ${resRestore.status}`);
  } catch (err) {
    record('Positioning', 'GPS Coordinates Test', false, err.message);
  }

  // 5. LIVE WEBSOCKET TELEMETRY STREAM
  console.log('\n--- 5. Live WebSocket Push Stream ---');
  try {
    const ws = new WebSocket(WS_URL);
    const packet = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WS Packet Timeout')), 5000);
      ws.on('open', () => {
        // Request pole history
        ws.send(JSON.stringify({ type: 'SELECT_POLE', pole_id: 'POLE-001' }));
      });
      ws.on('message', (msg) => {
        try {
          const parsed = JSON.parse(msg.toString());
          if (parsed.type === 'POLE_HISTORY' && parsed.pole_id === 'POLE-001') {
            clearTimeout(timer);
            resolve(parsed);
          } else if (parsed.type === 'CONNECTED') {
            // Connected successfully
          }
        } catch (e) {}
      });
      ws.on('error', (e) => reject(e));
    });
    ws.close();
    record('WebSocket', 'Live Stream Telemetry & History for POLE-001', true, `Received Type: ${packet.type}, Data points: ${packet.data?.length}`);
  } catch (err) {
    record('WebSocket', 'Live Stream Telemetry & History for POLE-001', false, err.message);
  }

  // Summary
  console.log('\n===============================================================');
  const total = testResults.length;
  const passed = testResults.filter(r => r.pass).length;
  console.log(`📊 TEST SUMMARY: ${passed}/${total} checks passed (${((passed/total)*100).toFixed(1)}%)`);
  console.log('===============================================================\n');
}

runSinglePoleTest();
