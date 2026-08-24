# 💡 Smart Street Light Management System (IoT Industrial Platform)

An end-to-end industrial IoT platform for real-time monitoring, telemetry ingestion, automated anomaly detection, and remote actuator control of smart street light networks.

---

## 📑 Table of Contents
- [Architecture & Overview](#-architecture--overview)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Quick Start Guide (Running on any PC)](#-quick-start-guide-running-on-any-pc)
- [Environment Configuration](#-environment-configuration)
- [Database Schema](#-database-schema)
- [MQTT Topic Structure](#-mqtt-topic-structure)
- [REST API Reference](#-rest-api-reference)
- [Key Features](#-key-features)
- [Troubleshooting](#-troubleshooting)

---

## 🏗️ Architecture & Overview

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
                                                          │   (Port 5433 / 5432)   │
                                                          └────────────────────────┘
                                                                    ▲
                                                                    │ (HTTP / WS)
                                                          ┌─────────┴──────────────┐
                                                          │   dashboard/           │
                                                          │   React + Vite SPA     │
                                                          │   (Port 5173)          │
                                                          └────────────────────────┘
```

### System Components

1. **Docker Compose (`docker-compose.yml`)**:
   - **HiveMQ CE**: MQTT Broker listening on port `1883` (and WebSockets on port `8000`).
   - **PostgreSQL 15**: Relational database on host port `5433` (container port `5432`), auto-initialized via [`init.sql`](./init.sql).

2. **Backend Service (`backend/`)**:
   - Node.js ES-Module server using Express, MQTT.js, `pg`, and `ws`.
   - Subscribes to MQTT telemetry topics, validates & stores time-series logs in PostgreSQL, detects threshold violations/anomalies, and broadcasts real-time updates to connected clients over WebSockets.
   - Exposes REST APIs for status querying, actuator commands, and alert resolution.

3. **Hardware Simulator (`simulator/`)**:
   - Simulates physical smart street light poles (`POLE-001`, `POLE-002`, etc.).
   - Periodically streams sensor metrics (`voltage`, `current`, `battery_soc`, `light_state`, `tamper_status`, `counter`) to MQTT.
   - Listens on `streetlight/control/:poleId` to toggle light status in real time.

4. **Monitoring Dashboard (`dashboard/`)**:
   - Built with React, Vite, Lucide Icons, and Tailwind/Glassmorphic design system.
   - Displays live telemetry counters, interactive map view, power consumption metrics, health status, time-series charts, and remote control switches.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, Lucide React, Glassmorphic UI & Dark Cyberpunk Theme
- **Backend**: Node.js, Express.js, `ws` (WebSockets), `pg` (PostgreSQL Client), `mqtt`
- **MQTT Broker**: HiveMQ Community Edition (CE)
- **Database**: PostgreSQL 15 Alpine
- **Containerization**: Docker & Docker Compose
- **Orchestration**: Concurrently (multi-process development runner)

---

## 📋 Prerequisites

Before running this project on your machine, ensure you have:
1. **Node.js** (v18.x or higher) & `npm` 👉 [Download Node.js](https://nodejs.org/)
2. **Docker Desktop** (Running in background) 👉 [Download Docker Desktop](https://www.docker.com/products/docker-desktop/)
3. **Git** (Optional, for cloning)

---

## 🚀 Quick Start Guide (Running on any PC)

### 1. Clone or Download the Project
```bash
git clone <repository-url>
cd Street-Light-Management-System
```

### 2. Start the Docker Infrastructure (HiveMQ + PostgreSQL)
Make sure **Docker Desktop** is open and running:
```bash
npm run docker:up
```
> *This automatically pulls HiveMQ and PostgreSQL 15, creates the required database, and executes [`init.sql`](./init.sql).*

### 3. Install All Dependencies
Install dependencies for root, backend, simulator, and dashboard in one single command:
```bash
npm run install:all
```

### 4. Run the Complete System
Run all three services (Backend + Simulator + Dashboard) simultaneously:
```bash
npm run dev
```

### 5. Access the Dashboard
Open your browser and navigate to:
👉 **[http://localhost:5173](http://localhost:5173)**

---

## ⚙️ Environment Configuration

### Backend (`backend/.env`)
```env
PORT=4000
MQTT_BROKER_URL=mqtt://localhost:1883
DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5433/streetlight_db
PGUSER=postgres
PGHOST=localhost
PGPASSWORD=postgrespassword
PGDATABASE=streetlight_db
PGPORT=5433
```

### Simulator (`simulator/.env`)
```env
MQTT_BROKER_URL=mqtt://localhost:1883
SIMULATION_INTERVAL_MS=3000
```

---

## 🗄️ Database Schema (`init.sql`)

### 1. `poles` (Registered Street Light Units)
| Column | Type | Description |
|---|---|---|
| `pole_id` | VARCHAR PRIMARY KEY | Unique pole ID (e.g., `POLE-001`) |
| `zone` | VARCHAR | Urban district or zone name |
| `latitude` | FLOAT | GPS Latitude |
| `longitude` | FLOAT | GPS Longitude |
| `status` | VARCHAR | `ONLINE` / `OFFLINE` / `MAINTENANCE` |

### 2. `telemetry_logs` (Time-Series Sensor Readings)
| Column | Type | Description |
|---|---|---|
| `id` | SERIAL PRIMARY KEY | Auto-incremented unique log ID |
| `pole_id` | VARCHAR REFERENCES poles(pole_id) | Foreign key referencing `poles` |
| `counter` | INT | Sequential transmission index |
| `voltage` | NUMERIC | Measured AC line voltage (Volts) |
| `current` | NUMERIC | Load current draw (Amperes) |
| `battery_soc` | INT | Battery State of Charge (%) |
| `light_state` | BOOLEAN | Actuator state (`true` = ON, `false` = OFF) |
| `created_at` | TIMESTAMP | Ingestion timestamp |

### 3. `alerts` (System Alarms & Notifications)
| Column | Type | Description |
|---|---|---|
| `id` | SERIAL PRIMARY KEY | Unique alert ID |
| `pole_id` | VARCHAR REFERENCES poles(pole_id) | Associated pole |
| `severity` | VARCHAR | `INFO` / `WARNING` / `CRITICAL` |
| `message` | TEXT | Detailed alert description |
| `is_resolved` | BOOLEAN | Resolution flag |
| `created_at` | TIMESTAMP | Timestamp of trigger |

---

## 📡 MQTT Topic Structure

| Topic | Direction | Purpose | Example Payload |
|---|---|---|---|
| `streetlight/telemetry/:poleId` | Pole ➔ Backend | Periodic telemetry feed | `{"pole_id":"POLE-001","counter":42,"voltage":230.2,"current":0.85,"battery_soc":95,"light_state":true}` |
| `streetlight/control/:poleId` | Backend ➔ Pole | Remote actuator control | `{"pole_id":"POLE-001","light_state":false,"brightness":80}` |
| `streetlight/alerts/:poleId` | Pole ➔ Backend | Emergency / threshold alert | `{"pole_id":"POLE-001","severity":"CRITICAL","message":"Voltage surge detected"}` |

---

## 🔌 REST API Reference

| Method | Endpoint | Description | Sample Request Body |
|---|---|---|---|
| `GET` | `/api/health` | Service health status | - |
| `GET` | `/api/poles` | Get all poles with latest metrics | - |
| `GET` | `/api/poles/:id/telemetry?limit=50` | Retrieve historical telemetry records | - |
| `GET` | `/api/alerts?limit=30` | Fetch system alerts list | - |
| `POST` | `/api/poles/:id/control` | Toggle light state / brightness | `{"light_state": true}` |
| `POST` | `/api/poles/:id/resolve-alerts` | Clear/resolve alerts for a specific pole | - |
| `POST` | `/api/alerts/resolve-all` | Clear/resolve all active system alerts | - |
| `POST` | `/api/poles/:id/tamper` | Trigger physical tamper simulation | - |

---

## 🌟 Key Features

- ⚡ **Real-Time Telemetry Streaming**: Sub-second telemetry ingestion and UI synchronization via WebSockets.
- 🎛️ **Remote Actuator Control**: Turn individual or group street lights ON/OFF with immediate MQTT feedback.
- 🚨 **Automated Alert Management**: Threshold detection for low battery, overvoltage, tamper detection, and one-click alert resolution.
- 📊 **Interactive Data Visualizations**: Real-time voltage, current, power factor, and battery state-of-charge graphs.
- 🗺️ **Zone & Geographic View**: Filter poles by urban zone, status (Online/Offline/Maintenance), or health condition.
- 🧪 **Hardware Simulation**: Built-in simulator generating realistic electrical fluctuations, night/day light transitions, and battery drain behaviors.

---

## 💡 Individual Services Execution

If you prefer running services in separate terminal windows instead of `npm run dev`:

```bash
# Terminal 1: Backend
npm run dev:backend

# Terminal 2: Simulator
npm run dev:simulator

# Terminal 3: Dashboard Frontend
npm run dev:dashboard
```

---

## ❓ Troubleshooting

- **Port 5433 or 1883 already in use**:
  Ensure no other local PostgreSQL or MQTT broker is using these ports. You can change host port mappings in `docker-compose.yml` and match them in `backend/.env`.
- **Database Connection Error**:
  Verify Docker container status with `docker ps`. If the database container is not running, run `npm run docker:up`.
- **Docker Compose not found**:
  Update Docker Desktop to the latest version to ensure `docker compose` (V2) is available.
