-- Street Light Management System Database Initialization
-- Industrial-Standard IoT Schema with Realistic GIS & Asset Tracking

-- 1. Poles Table
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Telemetry Logs Table (High-throughput Time-Series Buffer with Comprehensive Battery & Electrical Analytics)
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    cleared_at TIMESTAMP WITH TIME ZONE
);

-- Indices for high performance querying & analytics
CREATE INDEX IF NOT EXISTS idx_telemetry_pole_created ON telemetry_logs (pole_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_pole_status ON alerts (pole_id, alert_type, status);
CREATE INDEX IF NOT EXISTS idx_alerts_status_created ON alerts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_poles_cluster ON poles (cluster_id);
CREATE INDEX IF NOT EXISTS idx_poles_gateway ON poles (gateway_id);

-- Seed 15 Poles located around Uttara Sector 18 / Diabari, Dhaka (Centered near Lat: 23.8759, Lng: 90.3795)
-- Divided into 3 distinct clusters (5 poles each)
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

-- Seed initial baseline telemetry logs with full analytics fields
INSERT INTO telemetry_logs (
    pole_id, counter, voltage, current, power_watts, energy_kwh,
    battery_voltage, battery_temp, state_of_charge, battery_soc, battery_current,
    estimated_runtime_minutes, ambient_light_lux, brightness, tamper_status, light_state, created_at
)
VALUES
    ('POLE-001', 1, 230.5, 0.85, 195.9, 0.1200, 14.1, 29.5, 95, 95, -1.8, 520, 12.5, 100, false, true, NOW() - INTERVAL '10 minutes'),
    ('POLE-001', 2, 230.2, 0.84, 193.4, 0.1250, 14.0, 29.8, 94, 94, -1.8, 510, 12.0, 100, false, true, NOW() - INTERVAL '5 minutes'),
    ('POLE-001', 3, 229.8, 0.85, 195.3, 0.1300, 13.9, 30.1, 93, 93, -1.8, 500, 11.5, 100, false, true, NOW()),
    ('POLE-002', 1, 228.4, 0.90, 205.6, 0.1100, 13.7, 31.0, 88, 88, -1.9, 440, 10.0, 100, false, true, NOW() - INTERVAL '10 minutes'),
    ('POLE-002', 2, 228.1, 0.89, 203.0, 0.1150, 13.6, 31.2, 87, 87, -1.9, 435, 10.5, 100, false, true, NOW() - INTERVAL '5 minutes'),
    ('POLE-002', 3, 228.5, 0.91, 207.9, 0.1210, 13.5, 31.5, 86, 86, -1.9, 430, 9.8, 100, false, true, NOW()),
    ('POLE-006', 1, 231.1, 0.82, 189.5, 0.0950, 13.9, 28.5, 92, 92, -1.7, 490, 14.0, 100, false, true, NOW() - INTERVAL '5 minutes'),
    ('POLE-006', 2, 230.9, 0.83, 191.6, 0.0990, 13.8, 28.7, 91, 91, -1.7, 485, 13.5, 100, false, true, NOW()),
    ('POLE-011', 1, 229.4, 0.88, 201.9, 0.1050, 13.8, 30.0, 90, 90, -1.8, 460, 11.0, 100, false, true, NOW() - INTERVAL '5 minutes'),
    ('POLE-011', 2, 229.0, 0.87, 199.2, 0.1090, 13.7, 30.2, 89, 89, -1.8, 455, 10.8, 100, false, true, NOW());

-- Seed initial informational alerts
INSERT INTO alerts (pole_id, alert_type, severity, message, status, created_at)
VALUES
    ('POLE-001', 'SYSTEM_INIT', 'INFO', 'Pole initialized and connected to GATEWAY-01 (Cluster A)', 'CLEARED', NOW() - INTERVAL '1 hour'),
    ('POLE-006', 'SYSTEM_INIT', 'INFO', 'Pole initialized and connected to GATEWAY-02 (Cluster B)', 'CLEARED', NOW() - INTERVAL '1 hour'),
    ('POLE-011', 'SYSTEM_INIT', 'INFO', 'Pole initialized and connected to GATEWAY-03 (Cluster C)', 'CLEARED', NOW() - INTERVAL '1 hour');
