import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from backend directory or cwd
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'postgrespassword'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5433}/${process.env.PGDATABASE || 'streetlight_db'}`,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
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
          zone VARCHAR,
          latitude FLOAT,
          longitude FLOAT,
          status VARCHAR DEFAULT 'ONLINE',
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS telemetry_logs (
          id SERIAL PRIMARY KEY,
          pole_id VARCHAR REFERENCES poles(pole_id) ON DELETE CASCADE,
          counter INT,
          voltage NUMERIC,
          current NUMERIC,
          battery_soc INT,
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

          -- Poles table migrations
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='poles' AND column_name='updated_at') THEN
            ALTER TABLE poles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
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

      // 3. Performance composite indices
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_telemetry_pole_created ON telemetry_logs (pole_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_alerts_pole_status ON alerts (pole_id, alert_type, status);
        CREATE INDEX IF NOT EXISTS idx_alerts_status_created ON alerts (status, created_at DESC);

        INSERT INTO poles (pole_id, zone, latitude, longitude, status)
        VALUES 
          ('POLE-001', 'Zone North - Boulevard A', 23.8103, 90.4125, 'ONLINE'),
          ('POLE-002', 'Zone South - Avenue 4', 23.7937, 90.4066, 'ONLINE')
        ON CONFLICT (pole_id) DO NOTHING;
      `);

      console.log('✅ [Database] Schema verified & indices configured');
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
      p.zone,
      p.latitude,
      p.longitude,
      p.status,
      t.counter AS latest_counter,
      t.voltage AS latest_voltage,
      t.current AS latest_current,
      t.battery_soc AS latest_battery_soc,
      t.light_state AS latest_light_state,
      t.created_at AS last_seen
    FROM poles p
    LEFT JOIN LATERAL (
      SELECT counter, voltage, current, battery_soc, light_state, created_at
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
        `INSERT INTO poles (pole_id, zone, latitude, longitude, status, updated_at)
         VALUES ($1, 'Auto-Discovered', 23.8103, 90.4125, 'ONLINE', CURRENT_TIMESTAMP)
         ON CONFLICT (pole_id) DO UPDATE SET status = 'ONLINE', updated_at = CURRENT_TIMESTAMP;`,
        [pid]
      );
    } catch {
      await pool.query(
        `INSERT INTO poles (pole_id, zone, latitude, longitude, status)
         VALUES ($1, 'Auto-Discovered', 23.8103, 90.4125, 'ONLINE')
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
    valuePlaceholders.push(
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
    );
    queryParams.push(
      r.pole_id,
      r.counter ?? 0,
      r.voltage ?? 230,
      r.current ?? 0.8,
      r.battery_soc ?? 90,
      Boolean(r.light_state)
    );
  }

  const query = `
    INSERT INTO telemetry_logs (pole_id, counter, voltage, current, battery_soc, light_state)
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
