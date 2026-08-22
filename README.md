# 💡 Smart Street Light Management System (IoT Prototype)

An end-to-end IoT prototype workspace for monitoring and managing smart street lights across urban zones.

---

## 🏗️ Architecture & Component Overview

```
                          ┌──────────────────────────┐
                          │   HiveMQ CE Broker       │
                          │   (Port 1883 / MQTT)     │
                          └─────────────▲────────────┘
                                        │ (MQTT pub/sub)
            ┌───────────────────────────┴───────────────────────────┐
            │                                                       │
  ┌─────────▼──────────────┐                              ┌─────────▼──────────────┐
  │   simulator/           │                              │   backend/             │
  │   Node.js Simulator    │                              │   Express + MQTT + WS  │
  │   (POLE-001, POLE-002) │                              │   + pg (Port 4000)     │
  └────────────────────────┘                              └─────────▲──────────────┘
                                                                    │ (Queries)
                                                          ┌─────────▼──────────────┐
                                                          │   PostgreSQL 15        │
                                                          │   (Port 5432 / pg)     │
                                                          └────────────────────────┘
                                                                    ▲
                                                                    │ (HTTP / WS)
                                                          ┌─────────┴──────────────┐
                                                          │   dashboard/           │
                                                          │   Vite + React SPA     │
                                                          │   (Port 5173)          │
                                                          └────────────────────────┘
```

### Key Services

1. **Docker Compose (`docker-compose.yml`)**:
   - **HiveMQ CE**: MQTT Broker on port `1883` (and WebSockets on port `8000`).
   - **PostgreSQL 15**: Relational persistence on port `5432`, initialized automatically with [`init.sql`](./init.sql).

2. **Backend Service (`backend/`)**:
   - Node.js ES-Module service with `express`, `mqtt`, `pg`, `ws`, and `cors`.
   - Ingests incoming MQTT telemetry, logs to PostgreSQL, evaluates threshold alerts, and broadcasts live feeds over WebSockets.
   - Dispatches remote actuator commands (`streetlight/control/:poleId`) via MQTT.

3. **Hardware Simulator (`simulator/`)**:
   - Simulates physical street light poles (`POLE-001` and `POLE-002`).
   - Periodically publishes electrical telemetry (`voltage`, `current`, `battery_soc`, `counter`, `light_state`) to MQTT topics.
   - Listens for remote commands to toggle illumination or dimming.

4. **Monitoring Dashboard (`dashboard/`)**:
   - Modern Vite + React SPA styled with sleek glassmorphism and cyberpunk-inspired dark theme.
   - Features real-time KPI metrics, Recharts time-series telemetry charts (Voltage/Current/Battery), remote light ON/OFF actuator controls, and live alert feeds.

---

## 🗄️ Database Schema (`init.sql`)

### 1. `poles`
| Column | Type | Description |
|---|---|---|
| `pole_id` | VARCHAR PRIMARY KEY | Unique pole identifier (e.g. `POLE-001`) |
| `zone` | VARCHAR | Urban zone location |
| `latitude` | FLOAT | Geographic latitude |
| `longitude` | FLOAT | Geographic longitude |
| `status` | VARCHAR | `ONLINE` / `OFFLINE` / `MAINTENANCE` |

### 2. `telemetry_logs`
| Column | Type | Description |
|---|---|---|
| `id` | SERIAL PRIMARY KEY | Unique log ID |
| `pole_id` | VARCHAR REFERENCES poles(pole_id) | Pole foreign key |
| `counter` | INT | Sequential telemetry counter |
| `voltage` | NUMERIC | Voltage in Volts (e.g. `230.2`) |
| `current` | NUMERIC | Current draw in Amperes (e.g. `0.85`) |
| `battery_soc` | INT | Battery State of Charge percentage (0-100%) |
| `light_state` | BOOLEAN | `true` (ON) / `false` (OFF) |
| `created_at` | TIMESTAMP | Record timestamp |

### 3. `alerts`
| Column | Type | Description |
|---|---|---|
| `id` | SERIAL PRIMARY KEY | Unique alert ID |
| `pole_id` | VARCHAR REFERENCES poles(pole_id) | Pole foreign key |
| `severity` | VARCHAR | `INFO` / `WARNING` / `CRITICAL` |
| `message` | TEXT | Alert description |
| `created_at` | TIMESTAMP | Alert trigger timestamp |

---

## 🚀 Quick Start Guide

### Step 1: Start Infrastructure (Docker)
Ensure Docker is installed and running:
```bash
docker compose up -d
```

### Step 2: Install Node Dependencies
You can install dependencies for all packages:
```bash
# Root helper:
npm run install:all

# Or individually:
cd backend && npm install
cd ../simulator && npm install
cd ../dashboard && npm install
```

### Step 3: Run the Backend, Simulator & Dashboard

Open 3 terminal windows:

**Terminal 1 (Backend API & WebSocket Server):**
```bash
cd backend
npm run dev
# Running on http://localhost:4000 (WS: ws://localhost:4000/ws)
```

**Terminal 2 (Hardware Simulator):**
```bash
cd simulator
npm run dev
# Simulates POLE-001 and POLE-002 publishing telemetry every 3s
```

**Terminal 3 (React Dashboard):**
```bash
cd dashboard
npm run dev
# Open http://localhost:5173
```

---

## 📡 MQTT Topic Convention

| Topic | Direction | Description | Payload Example |
|---|---|---|---|
| `streetlight/telemetry/:poleId` | Pole ➔ Backend | Periodic telemetry snapshot | `{"pole_id":"POLE-001","counter":15,"voltage":230.1,"current":0.85,"battery_soc":94,"light_state":true}` |
| `streetlight/control/:poleId` | Backend ➔ Pole | Remote switch / dim command | `{"pole_id":"POLE-001","light_state":false,"brightness":0}` |
| `streetlight/alerts/:poleId` | Pole ➔ Backend | Hardware emergency / warning | `{"pole_id":"POLE-001","severity":"CRITICAL","message":"Battery low"}` |

---

## 🔌 REST API Endpoints

- `GET /api/health` - Check backend health status
- `GET /api/poles` - Retrieve all street light poles with latest telemetry
- `GET /api/poles/:id/telemetry?limit=50` - Get time-series historical logs
- `GET /api/alerts?limit=30` - Fetch system event and alert logs
- `POST /api/poles/:id/control` - Send actuator command (JSON: `{ "light_state": true }`)
- `POST /api/alerts` - Post manual test alert (JSON: `{ "pole_id": "POLE-001", "severity": "WARNING", "message": "..." }`)
