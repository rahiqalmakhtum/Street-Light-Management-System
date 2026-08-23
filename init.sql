-- Street Light Management System Database Initialization
-- Industrial-Standard IoT Schema

-- 1. Poles Table
CREATE TABLE IF NOT EXISTS poles (
    pole_id VARCHAR PRIMARY KEY,
    zone VARCHAR,
    latitude FLOAT,
    longitude FLOAT,
    status VARCHAR DEFAULT 'ONLINE',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Telemetry Logs Table (High-throughput Time-Series Buffer)
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

-- 3. Alerts Table (ISA-18.2 Stateful Alarm Lifecycle: ACTIVE, CLEARED, ACKNOWLEDGED)
CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    pole_id VARCHAR REFERENCES poles(pole_id) ON DELETE CASCADE,
    alert_type VARCHAR DEFAULT 'GENERAL',
    severity VARCHAR DEFAULT 'WARNING',
    message TEXT,
    status VARCHAR DEFAULT 'ACTIVE',
    occurrence_count INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cleared_at TIMESTAMP
);

-- Indices for high performance querying & analytics
CREATE INDEX IF NOT EXISTS idx_telemetry_pole_created ON telemetry_logs (pole_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_pole_status ON alerts (pole_id, alert_type, status);
CREATE INDEX IF NOT EXISTS idx_alerts_status_created ON alerts (status, created_at DESC);

-- Seed Initial Poles: POLE-001 and POLE-002
INSERT INTO poles (pole_id, zone, latitude, longitude, status)
VALUES 
    ('POLE-001', 'Zone North - Boulevard A', 23.8103, 90.4125, 'ONLINE'),
    ('POLE-002', 'Zone South - Avenue 4', 23.7937, 90.4066, 'ONLINE')
ON CONFLICT (pole_id) DO NOTHING;

-- Seed initial baseline telemetry logs
INSERT INTO telemetry_logs (pole_id, counter, voltage, current, battery_soc, light_state, created_at)
VALUES
    ('POLE-001', 1, 230.5, 0.85, 95, true, NOW() - INTERVAL '10 minutes'),
    ('POLE-001', 2, 230.2, 0.84, 94, true, NOW() - INTERVAL '5 minutes'),
    ('POLE-001', 3, 229.8, 0.85, 93, true, NOW()),
    ('POLE-002', 1, 228.4, 0.90, 88, true, NOW() - INTERVAL '10 minutes'),
    ('POLE-002', 2, 228.1, 0.89, 87, true, NOW() - INTERVAL '5 minutes'),
    ('POLE-002', 3, 228.5, 0.91, 86, true, NOW());

-- Seed an initial informational alert
INSERT INTO alerts (pole_id, alert_type, severity, message, status, created_at)
VALUES
    ('POLE-001', 'SYSTEM_INIT', 'INFO', 'Pole initialized and connected to network gateway', 'CLEARED', NOW() - INTERVAL '1 hour'),
    ('POLE-002', 'SYSTEM_INIT', 'INFO', 'Pole initialized and connected to network gateway', 'CLEARED', NOW() - INTERVAL '1 hour');
