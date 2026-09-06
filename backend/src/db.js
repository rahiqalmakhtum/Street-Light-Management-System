import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from backend directory or cwd
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const { Pool } = pg;

const isRemoteDb = Boolean(
  process.env.DATABASE_URL &&
  !process.env.DATABASE_URL.includes('localhost') &&
  !process.env.DATABASE_URL.includes('127.0.0.1')
);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'postgrespassword'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5433}/${process.env.PGDATABASE || 'streetlight_db'}`,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: isRemoteDb || process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('❌ [Database Pool Error]:', err.message);
});

/**
 * Initialize tables and apply schema migrations (with retry loop)
 */
export async function initDB(retries = 10, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Database] Connecting to PostgreSQL (Attempt ${attempt}/${retries})...`);
      
      // 1. Base table creation
      await pool.query(`
        CREATE TABLE IF NOT EXISTS poles (
          pole_id VARCHAR PRIMARY KEY,
          name VARCHAR NOT NULL,
          cluster_id VARCHAR NOT NULL,
          gateway_id VARCHAR NOT NULL,
          latitude FLOAT NOT NULL,
          longitude FLOAT NOT NULL,
          zone VARCHAR NOT NULL,
          status VARCHAR DEFAULT 'ONLINE',
          is_on BOOLEAN DEFAULT true,
          brightness INT DEFAULT 100 CHECK (brightness >= 0 AND brightness <= 100),
          battery_capacity_ah NUMERIC DEFAULT 100.0,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS telemetry_logs (
          id SERIAL PRIMARY KEY,
          pole_id VARCHAR REFERENCES poles(pole_id) ON DELETE CASCADE,
          counter INT,
          voltage NUMERIC,
          current NUMERIC,
          power_watts NUMERIC,
          energy_kwh NUMERIC,
          battery_voltage NUMERIC,
          battery_temp NUMERIC,
          state_of_charge INT,
          battery_soc INT,
          battery_current NUMERIC,
          estimated_runtime_minutes INT,
          ambient_light_lux NUMERIC,
          brightness INT,
          tamper_status BOOLEAN DEFAULT false,
          light_state BOOLEAN,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS alerts (
          id SERIAL PRIMARY KEY,
          pole_id VARCHAR REFERENCES poles(pole_id) ON DELETE CASCADE,
          alert_type VARCHAR DEFAULT 'GENERAL',
          severity VARCHAR DEFAULT 'WARNING',
          message TEXT,
          status VARCHAR DEFAULT 'ACTIVE',
          occurrence_count INT DEFAULT 1,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          last_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          cleared_at TIMESTAMPTZ
        );
      `);

      // 2. Schema migrations for existing databases (idempotent ALTERs & TIMESTAMPTZ upgrades)
      await pool.query(`
        DO $$
        BEGIN
          -- Ensure TIMESTAMPTZ timezone support across tables
          ALTER TABLE poles ALTER COLUMN updated_at TYPE TIMESTAMPTZ;
          ALTER TABLE telemetry_logs ALTER COLUMN created_at TYPE TIMESTAMPTZ;
          ALTER TABLE alerts ALTER COLUMN created_at TYPE TIMESTAMPTZ;
          ALTER TABLE alerts ALTER COLUMN last_seen_at TYPE TIMESTAMPTZ;
          ALTER TABLE alerts ALTER COLUMN cleared_at TYPE TIMESTAMPTZ;

          -- Poles table column migrations
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='poles' AND column_name='name') THEN
            ALTER TABLE poles ADD COLUMN name VARCHAR DEFAULT 'Smart Pole';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='poles' AND column_name='cluster_id') THEN
            ALTER TABLE poles ADD COLUMN cluster_id VARCHAR DEFAULT 'CLUSTER-A';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='poles' AND column_name='gateway_id') THEN
            ALTER TABLE poles ADD COLUMN gateway_id VARCHAR DEFAULT 'GATEWAY-01';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='poles' AND column_name='is_on') THEN
            ALTER TABLE poles ADD COLUMN is_on BOOLEAN DEFAULT true;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='poles' AND column_name='brightness') THEN
            ALTER TABLE poles ADD COLUMN brightness INT DEFAULT 100;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='poles' AND column_name='battery_capacity_ah') THEN
            ALTER TABLE poles ADD COLUMN battery_capacity_ah NUMERIC DEFAULT 100.0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='poles' AND column_name='created_at') THEN
            ALTER TABLE poles ADD COLUMN created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='poles' AND column_name='updated_at') THEN
            ALTER TABLE poles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
          END IF;

          -- Telemetry table column migrations
          ALTER TABLE telemetry_logs ALTER COLUMN state_of_charge TYPE NUMERIC;
          ALTER TABLE telemetry_logs ALTER COLUMN battery_soc TYPE NUMERIC;
          ALTER TABLE telemetry_logs ALTER COLUMN brightness TYPE NUMERIC;
          ALTER TABLE telemetry_logs ALTER COLUMN estimated_runtime_minutes TYPE NUMERIC;

          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='telemetry_logs' AND column_name='power_watts') THEN
            ALTER TABLE telemetry_logs ADD COLUMN power_watts NUMERIC;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='telemetry_logs' AND column_name='energy_kwh') THEN
            ALTER TABLE telemetry_logs ADD COLUMN energy_kwh NUMERIC;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='telemetry_logs' AND column_name='battery_voltage') THEN
            ALTER TABLE telemetry_logs ADD COLUMN battery_voltage NUMERIC;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='telemetry_logs' AND column_name='battery_temp') THEN
            ALTER TABLE telemetry_logs ADD COLUMN battery_temp NUMERIC;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='telemetry_logs' AND column_name='state_of_charge') THEN
            ALTER TABLE telemetry_logs ADD COLUMN state_of_charge NUMERIC;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='telemetry_logs' AND column_name='battery_current') THEN
            ALTER TABLE telemetry_logs ADD COLUMN battery_current NUMERIC;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='telemetry_logs' AND column_name='estimated_runtime_minutes') THEN
            ALTER TABLE telemetry_logs ADD COLUMN estimated_runtime_minutes NUMERIC;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='telemetry_logs' AND column_name='ambient_light_lux') THEN
            ALTER TABLE telemetry_logs ADD COLUMN ambient_light_lux NUMERIC;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='telemetry_logs' AND column_name='brightness') THEN
            ALTER TABLE telemetry_logs ADD COLUMN brightness NUMERIC;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='telemetry_logs' AND column_name='tamper_status') THEN
            ALTER TABLE telemetry_logs ADD COLUMN tamper_status BOOLEAN DEFAULT false;
          END IF;

          -- Alerts table migrations
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='alerts' AND column_name='alert_type') THEN
            ALTER TABLE alerts ADD COLUMN alert_type VARCHAR DEFAULT 'GENERAL';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='alerts' AND column_name='status') THEN
            ALTER TABLE alerts ADD COLUMN status VARCHAR DEFAULT 'ACTIVE';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='alerts' AND column_name='occurrence_count') THEN
            ALTER TABLE alerts ADD COLUMN occurrence_count INT DEFAULT 1;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='alerts' AND column_name='last_seen_at') THEN
            ALTER TABLE alerts ADD COLUMN last_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='alerts' AND column_name='cleared_at') THEN
            ALTER TABLE alerts ADD COLUMN cleared_at TIMESTAMPTZ;
          END IF;
        END $$;
      `);

      // 3. Performance composite indices & Seed 15 poles around Uttara Sector 18 / Diabari, Dhaka
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_telemetry_pole_created ON telemetry_logs (pole_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_alerts_pole_status ON alerts (pole_id, alert_type, status);
        CREATE INDEX IF NOT EXISTS idx_alerts_status_created ON alerts (status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_poles_cluster ON poles (cluster_id);
        CREATE INDEX IF NOT EXISTS idx_poles_gateway ON poles (gateway_id);

        INSERT INTO poles (pole_id, name, cluster_id, gateway_id, latitude, longitude, zone, status, is_on, brightness, battery_capacity_ah, created_at)
        VALUES 
          -- Cluster A: Gate 1 - Diabari Metro Rail Avenue (GATEWAY-01, Straight North-South Line)
          ('POLE-001', 'Metro Line 6 North Entry', 'CLUSTER-A', 'GATEWAY-01', 23.8720, 90.3800, 'Metro Rail Line 6 Avenue', 'ONLINE', true, 100, 120.0, NOW()),
          ('POLE-002', 'Metro Gate 1 South Plaza', 'CLUSTER-A', 'GATEWAY-01', 23.8728, 90.3800, 'Metro Rail Line 6 Avenue', 'ONLINE', true, 100, 120.0, NOW()),
          ('POLE-003', 'Diabari Concourse East', 'CLUSTER-A', 'GATEWAY-01', 23.8736, 90.3800, 'Metro Rail Line 6 Avenue', 'ONLINE', true, 100, 100.0, NOW()),
          ('POLE-004', 'Diabari Concourse West', 'CLUSTER-A', 'GATEWAY-01', 23.8744, 90.3800, 'Metro Rail Line 6 Avenue', 'ONLINE', true, 90, 100.0, NOW()),
          ('POLE-005', 'Metro Station Bus Bay', 'CLUSTER-A', 'GATEWAY-01', 23.8752, 90.3800, 'Metro Rail Line 6 Avenue', 'ONLINE', true, 100, 150.0, NOW()),

          -- Cluster B: Sonargaon Janapath Extension (GATEWAY-02, Straight East-West Line)
          ('POLE-006', 'Sonargaon Janapath Post 01', 'CLUSTER-B', 'GATEWAY-02', 23.8720, 90.3820, 'Sonargaon Janapath Extension', 'ONLINE', true, 100, 120.0, NOW()),
          ('POLE-007', 'Sonargaon Janapath Post 02', 'CLUSTER-B', 'GATEWAY-02', 23.8720, 90.3835, 'Sonargaon Janapath Extension', 'ONLINE', true, 100, 120.0, NOW()),
          ('POLE-008', 'Sector 18 Avenue Intersection', 'CLUSTER-B', 'GATEWAY-02', 23.8720, 90.3850, 'Sonargaon Janapath Extension', 'ONLINE', true, 100, 150.0, NOW()),
          ('POLE-009', 'Sonargaon East Corridor 01', 'CLUSTER-B', 'GATEWAY-02', 23.8720, 90.3865, 'Sonargaon Janapath Extension', 'ONLINE', true, 80, 100.0, NOW()),
          ('POLE-010', 'Sonargaon East Corridor 02', 'CLUSTER-B', 'GATEWAY-02', 23.8720, 90.3880, 'Sonargaon Janapath Extension', 'ONLINE', true, 80, 100.0, NOW()),

          -- Cluster C: Diabari Bridge & Lake Road (GATEWAY-03, Straight Diagonal Lake Drive Line)
          ('POLE-011', 'Diabari Bridge Approach North', 'CLUSTER-C', 'GATEWAY-03', 23.8756, 90.3792, 'Diabari Bridge & Lake Road', 'ONLINE', true, 100, 150.0, NOW()),
          ('POLE-012', 'Diabari Bridge Center Span', 'CLUSTER-C', 'GATEWAY-03', 23.8764, 90.3784, 'Diabari Bridge & Lake Road', 'ONLINE', true, 100, 150.0, NOW()),
          ('POLE-013', 'Diabari Bridge Approach South', 'CLUSTER-C', 'GATEWAY-03', 23.8772, 90.3776, 'Diabari Bridge & Lake Road', 'ONLINE', true, 100, 150.0, NOW()),
          ('POLE-014', 'Lake Drive Promenade 01', 'CLUSTER-C', 'GATEWAY-03', 23.8780, 90.3768, 'Diabari Bridge & Lake Road', 'ONLINE', true, 85, 100.0, NOW()),
          ('POLE-015', 'Lake Drive Promenade 02', 'CLUSTER-C', 'GATEWAY-03', 23.8788, 90.3760, 'Diabari Bridge & Lake Road', 'ONLINE', true, 85, 100.0, NOW())
        ON CONFLICT (pole_id) DO UPDATE SET 
          name = EXCLUDED.name,
          cluster_id = EXCLUDED.cluster_id,
          gateway_id = EXCLUDED.gateway_id,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          zone = EXCLUDED.zone,
          status = EXCLUDED.status,
          is_on = EXCLUDED.is_on,
          brightness = EXCLUDED.brightness,
          battery_capacity_ah = EXCLUDED.battery_capacity_ah;
      `);

      console.log('✅ [Database] Schema verified & indices configured with 15 Uttara Sector 18 poles');
      return true;
    } catch (err) {
      console.warn(`⚠️ [Database] Connection not ready (${err.message}). Retrying in ${delayMs / 1000}s...`);
      if (attempt === retries) {
        console.error('❌ [Database Init Failed]: Maximum retries exceeded.');
        return false;
      }
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
}

/**
 * Get all poles with their latest telemetry snapshot
 */
export async function getPoles() {
  const query = `
    SELECT 
      p.pole_id,
      p.name,
      p.cluster_id,
      p.gateway_id,
      CASE p.gateway_id
        WHEN 'GATEWAY-01' THEN 23.8736
        WHEN 'GATEWAY-02' THEN 23.8720
        ELSE 23.8772
      END AS gateway_latitude,
      CASE p.gateway_id
        WHEN 'GATEWAY-01' THEN 90.3800
        WHEN 'GATEWAY-02' THEN 90.3850
        ELSE 90.3776
      END AS gateway_longitude,
      CASE p.cluster_id
        WHEN 'CLUSTER-A' THEN 'Cluster A (Diabari Metro Rail Area)'
        WHEN 'CLUSTER-B' THEN 'Cluster B (Sonargaon Janapath Extension)'
        ELSE 'Cluster C (Diabari Bridge & Lake Road)'
      END AS cluster_name,
      p.latitude,
      p.longitude,
      p.zone,
      p.status,
      p.is_on,
      p.brightness,
      p.battery_capacity_ah,
      p.created_at,
      p.updated_at,
      t.counter AS latest_counter,
      t.voltage AS latest_voltage,
      t.current AS latest_current,
      t.power_watts AS latest_power_watts,
      t.energy_kwh AS latest_energy_kwh,
      t.battery_voltage AS latest_battery_voltage,
      t.battery_temp AS latest_battery_temp,
      COALESCE(t.state_of_charge, t.battery_soc) AS latest_battery_soc,
      COALESCE(t.state_of_charge, t.battery_soc) AS latest_state_of_charge,
      t.battery_current AS latest_battery_current,
      t.estimated_runtime_minutes AS latest_estimated_runtime_minutes,
      t.ambient_light_lux AS latest_ambient_light_lux,
      t.brightness AS latest_brightness,
      t.tamper_status AS latest_tamper_status,
      t.light_state AS latest_light_state,
      t.created_at AS last_seen
    FROM poles p
    LEFT JOIN LATERAL (
      SELECT 
        counter, voltage, current, power_watts, energy_kwh,
        battery_voltage, battery_temp, state_of_charge, battery_soc, battery_current,
        estimated_runtime_minutes, ambient_light_lux, brightness, tamper_status,
        light_state, created_at
      FROM telemetry_logs
      WHERE pole_id = p.pole_id
      ORDER BY created_at DESC
      LIMIT 1
    ) t ON true
    ORDER BY p.pole_id ASC;
  `;
  const result = await pool.query(query);
  return result.rows;
}

let batchFlushCounter = 0;

/**
 * Micro-batched bulk telemetry persistence (Industry standard write optimization)
 * Inserts multiple telemetry rows in a single SQL statement.
 * @param {Array<Object>} records Array of telemetry objects
 */
export async function bulkSaveTelemetry(records) {
  if (!records || records.length === 0) return [];

  // 1. Ensure poles exist / update status
  const uniquePoles = [...new Set(records.map((r) => r.pole_id))];
  for (const pid of uniquePoles) {
    try {
      await pool.query(
        `INSERT INTO poles (pole_id, name, cluster_id, gateway_id, zone, latitude, longitude, status, updated_at)
         VALUES ($1, $1, 'CLUSTER-A', 'GATEWAY-01', 'Uttara Sector 18', 23.8759, 90.3795, 'ONLINE', CURRENT_TIMESTAMP)
         ON CONFLICT (pole_id) DO UPDATE SET status = 'ONLINE', updated_at = CURRENT_TIMESTAMP;`,
        [pid]
      );
    } catch {
      await pool.query(
        `INSERT INTO poles (pole_id, name, cluster_id, gateway_id, zone, latitude, longitude, status)
         VALUES ($1, $1, 'CLUSTER-A', 'GATEWAY-01', 'Uttara Sector 18', 23.8759, 90.3795, 'ONLINE')
         ON CONFLICT (pole_id) DO UPDATE SET status = 'ONLINE';`,
        [pid]
      );
    }
  }

  // 2. Build parameterized multi-row INSERT query
  const valuePlaceholders = [];
  const queryParams = [];
  let paramIndex = 1;

  for (const r of records) {
    const voltage = Number(r.voltage ?? 230);
    const current = Number(r.current ?? 0.8);
    const power_watts = r.power_watts !== undefined ? Number(r.power_watts) : Number((voltage * current).toFixed(1));
    const energy_kwh = r.energy_kwh !== undefined ? Number(r.energy_kwh) : Number(((power_watts * 0.001 * (r.counter ?? 1)) / 120).toFixed(4));
    const soc = Number(r.state_of_charge ?? r.battery_soc ?? 90);
    const battery_voltage = r.battery_voltage !== undefined ? Number(r.battery_voltage) : Number((12.0 + (soc / 100) * 2.4).toFixed(2));
    const battery_temp = r.battery_temp !== undefined ? Number(r.battery_temp) : 28.5;
    const battery_current = r.battery_current !== undefined ? Number(r.battery_current) : (r.light_state ? -1.8 : 2.2);
    const brightness = r.brightness !== undefined ? Number(r.brightness) : (r.light_state ? 100 : 0);
    const estimated_runtime_minutes = r.estimated_runtime_minutes !== undefined 
      ? Number(r.estimated_runtime_minutes)
      : Math.round((soc / 100) * 120 * (12.0 / Math.max(power_watts, 10)) * 60);
    const ambient_light_lux = r.ambient_light_lux !== undefined ? Number(r.ambient_light_lux) : (r.light_state ? 15 : 450);
    const tamper_status = Boolean(r.tamper_status ?? r.tamper);
    const light_state = Boolean(r.light_state);
    const createdAt = r.created_at || r.timestamp || new Date().toISOString();

    const roundedSoc = Math.round(soc);
    const roundedBrightness = Math.round(brightness);
    const roundedRuntime = Math.round(Number(estimated_runtime_minutes) || 0);

    valuePlaceholders.push(
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
    );
    queryParams.push(
      r.pole_id,
      Math.round(Number(r.counter) || 0),
      voltage,
      current,
      power_watts,
      energy_kwh,
      battery_voltage,
      battery_temp,
      roundedSoc,
      roundedSoc, // battery_soc
      battery_current,
      roundedRuntime,
      ambient_light_lux,
      roundedBrightness,
      tamper_status,
      light_state,
      createdAt
    );
  }

  const query = `
    INSERT INTO telemetry_logs (
      pole_id, counter, voltage, current, power_watts, energy_kwh,
      battery_voltage, battery_temp, state_of_charge, battery_soc, battery_current,
      estimated_runtime_minutes, ambient_light_lux, brightness, tamper_status,
      light_state, created_at
    )
    VALUES ${valuePlaceholders.join(', ')}
    RETURNING *;
  `;

  const result = await pool.query(query, queryParams);

  // Periodic automatic pruning every 25 batch flushes to prevent database bloat
  batchFlushCounter++;
  if (batchFlushCounter % 25 === 0) {
    pruneDatabase().catch(() => {});
  }

  return result.rows;
}

/**
 * Single-record telemetry save (fallback)
 */
export async function saveTelemetry(telemetry) {
  const res = await bulkSaveTelemetry([telemetry]);
  return res[0];
}

/**
 * ISA-18.2 Stateful Alarm Engine: Upsert Active Alert
 * If an active alert of this type already exists for the pole, increments occurrence_count and updates last_seen_at.
 * Otherwise creates a new ACTIVE alert row.
 */
export async function upsertAlertState({ pole_id, alert_type = 'GENERAL', severity = 'WARNING', message }) {
  // Check for active alert of the same type for this pole
  const existingRes = await pool.query(
    `SELECT * FROM alerts 
     WHERE pole_id = $1 AND alert_type = $2 AND status = 'ACTIVE' 
     ORDER BY created_at DESC LIMIT 1`,
    [pole_id, alert_type]
  );

  if (existingRes.rows.length > 0) {
    const existing = existingRes.rows[0];
    const updateRes = await pool.query(
      `UPDATE alerts 
       SET occurrence_count = occurrence_count + 1,
           last_seen_at = CURRENT_TIMESTAMP,
           message = $2
       WHERE id = $1
       RETURNING *;`,
      [existing.id, message]
    );
    return { alert: updateRes.rows[0], isNew: false };
  }

  // Create new active alert
  const insertRes = await pool.query(
    `INSERT INTO alerts (pole_id, alert_type, severity, message, status, occurrence_count, created_at, last_seen_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING *;`,
    [pole_id, alert_type, severity, message]
  );

  return { alert: insertRes.rows[0], isNew: true };
}

/**
 * ISA-18.2 Stateful Alarm Engine: Resolve Alert
 * Transitions an active alert to 'CLEARED'
 */
export async function resolveAlertState({ pole_id, alert_type }) {
  const result = await pool.query(
    `UPDATE alerts 
     SET status = 'CLEARED',
         cleared_at = CURRENT_TIMESTAMP
     WHERE pole_id = $1 AND alert_type = $2 AND status = 'ACTIVE'
     RETURNING *;`,
    [pole_id, alert_type]
  );

  return result.rows;
}

/**
 * Save manual alert (compatibility helper)
 */
export async function saveAlert({ pole_id, severity, message, alert_type = 'GENERAL' }) {
  const { alert } = await upsertAlertState({ pole_id, alert_type, severity, message });
  return alert;
}

/**
 * Get telemetry history for a specific pole or all poles
 */
export async function getTelemetryLogs(poleId = null, limit = 50) {
  if (poleId) {
    const query = `
      SELECT * FROM telemetry_logs
      WHERE pole_id = $1
      ORDER BY created_at DESC
      LIMIT $2;
    `;
    const result = await pool.query(query, [poleId, limit]);
    return result.rows.reverse(); // Chronological for charting
  } else {
    const query = `
      SELECT * FROM telemetry_logs
      ORDER BY created_at DESC
      LIMIT $1;
    `;
    const result = await pool.query(query, [limit]);
    return result.rows.reverse();
  }
}

/**
 * Get alerts with optional status filter (e.g. 'ACTIVE', 'CLEARED', or all)
 */
export async function getRecentAlerts(limit = 30, status = null) {
  let query;
  let params;

  if (status) {
    query = `
      SELECT a.*, p.zone 
      FROM alerts a
      LEFT JOIN poles p ON a.pole_id = p.pole_id
      WHERE a.status = $1
      ORDER BY a.last_seen_at DESC, a.created_at DESC
      LIMIT $2;
    `;
    params = [status, limit];
  } else {
    query = `
      SELECT a.*, p.zone 
      FROM alerts a
      LEFT JOIN poles p ON a.pole_id = p.pole_id
      ORDER BY a.last_seen_at DESC, a.created_at DESC
      LIMIT $1;
    `;
    params = [limit];
  }

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Update custom position (latitude, longitude) of a pole
 */
export async function updatePolePosition(pole_id, latitude, longitude) {
  const query = `
    UPDATE poles
    SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP
    WHERE pole_id = $3
    RETURNING *;
  `;
  const result = await pool.query(query, [Number(latitude), Number(longitude), pole_id]);
  return result.rows[0];
}

/**
 * Create a new custom pole or update full pole definition
 */
export async function createOrUpdatePole(data) {
  const {
    pole_id,
    name = `Smart Pole ${pole_id}`,
    cluster_id = 'CLUSTER-A',
    gateway_id = 'GATEWAY-01',
    latitude,
    longitude,
    zone = 'Uttara Sector 18',
    status = 'ONLINE',
    is_on = true,
    brightness = 100,
    battery_capacity_ah = 120.0,
  } = data;

  const query = `
    INSERT INTO poles (pole_id, name, cluster_id, gateway_id, latitude, longitude, zone, status, is_on, brightness, battery_capacity_ah, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
    ON CONFLICT (pole_id) DO UPDATE SET
      name = EXCLUDED.name,
      cluster_id = EXCLUDED.cluster_id,
      gateway_id = EXCLUDED.gateway_id,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      zone = EXCLUDED.zone,
      status = EXCLUDED.status,
      battery_capacity_ah = EXCLUDED.battery_capacity_ah,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;
  const result = await pool.query(query, [
    pole_id,
    name,
    cluster_id,
    gateway_id,
    Number(latitude),
    Number(longitude),
    zone,
    status,
    is_on,
    brightness,
    battery_capacity_ah,
  ]);
  return result.rows[0];
}

/**
 * Delete a custom pole
 */
export async function deletePole(pole_id) {
  const result = await pool.query('DELETE FROM poles WHERE pole_id = $1 RETURNING *;', [pole_id]);
  return result.rows[0];
}

/**
 * Database maintenance & rolling retention
 */
export async function pruneDatabase() {
  try {
    await pool.query(`
      DELETE FROM telemetry_logs 
      WHERE id NOT IN (
        SELECT id FROM telemetry_logs ORDER BY created_at DESC LIMIT 3000
      );
      DELETE FROM alerts 
      WHERE status = 'CLEARED' AND id NOT IN (
        SELECT id FROM alerts WHERE status = 'CLEARED' ORDER BY cleared_at DESC LIMIT 500
      );
    `);
  } catch (err) {
    console.warn('[Database] Pruning warning:', err.message);
  }
}
