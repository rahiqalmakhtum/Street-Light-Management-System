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
 * Initialize tables if not already created (with retry loop)
 */
export async function initDB(retries = 10, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Database] Connecting to PostgreSQL (Attempt ${attempt}/${retries})...`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS poles (
          pole_id VARCHAR PRIMARY KEY,
          zone VARCHAR,
          latitude FLOAT,
          longitude FLOAT,
          status VARCHAR
        );

        CREATE TABLE IF NOT EXISTS telemetry_logs (
          id SERIAL PRIMARY KEY,
          pole_id VARCHAR REFERENCES poles(pole_id) ON DELETE CASCADE,
          counter INT,
          voltage NUMERIC,
          current NUMERIC,
          battery_soc INT,
          light_state BOOLEAN,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS alerts (
          id SERIAL PRIMARY KEY,
          pole_id VARCHAR REFERENCES poles(pole_id) ON DELETE CASCADE,
          severity VARCHAR,
          message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_telemetry_pole_created ON telemetry_logs (pole_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_alerts_pole_created ON alerts (pole_id, created_at DESC);

        INSERT INTO poles (pole_id, zone, latitude, longitude, status)
        VALUES 
          ('POLE-001', 'Zone North - Boulevard A', 23.8103, 90.4125, 'ONLINE'),
          ('POLE-002', 'Zone South - Avenue 4', 23.7937, 90.4066, 'ONLINE')
        ON CONFLICT (pole_id) DO NOTHING;
      `);
      console.log('✅ [Database] Schema verified and tables ready');
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
 * Get all poles with their latest telemetry snapshot and alert counts
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

/**
 * Insert a new telemetry record and update pole status
 */
export async function saveTelemetry({ pole_id, counter, voltage, current, battery_soc, light_state }) {
  // Ensure pole exists or update status to ONLINE
  await pool.query(
    `INSERT INTO poles (pole_id, zone, latitude, longitude, status)
     VALUES ($1, 'Auto-Discovered', 23.8103, 90.4125, 'ONLINE')
     ON CONFLICT (pole_id) DO UPDATE SET status = 'ONLINE';`,
    [pole_id]
  );

  const query = `
    INSERT INTO telemetry_logs (pole_id, counter, voltage, current, battery_soc, light_state)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;
  const values = [pole_id, counter, voltage, current, battery_soc, light_state];
  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Insert an alert
 */
export async function saveAlert({ pole_id, severity, message }) {
  const query = `
    INSERT INTO alerts (pole_id, severity, message)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;
  const result = await pool.query(query, [pole_id, severity, message]);
  return result.rows[0];
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
    return result.rows.reverse(); // Return chronological
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
 * Get recent alerts
 */
export async function getRecentAlerts(limit = 30) {
  const query = `
    SELECT a.*, p.zone 
    FROM alerts a
    LEFT JOIN poles p ON a.pole_id = p.pole_id
    ORDER BY a.created_at DESC
    LIMIT $1;
  `;
  const result = await pool.query(query, [limit]);
  return result.rows;
}

