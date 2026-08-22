import React, { useState, useEffect, useRef } from 'react';
import {
  Lightbulb,
  Zap,
  Battery,
  AlertTriangle,
  Radio,
  Activity,
  Power,
  MapPin,
  RefreshCw,
  Clock,
  ShieldCheck,
  Cpu,
  ArrowUpRight
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

export default function App() {
  const [poles, setPoles] = useState([]);
  const [selectedPole, setSelectedPole] = useState('POLE-001');
  const [telemetryHistory, setTelemetryHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isToggling, setIsToggling] = useState({});

  const wsRef = useRef(null);

  // 1. Fetch initial data from backend API
  const fetchData = async () => {
    try {
      const [polesRes, alertsRes] = await Promise.all([
        fetch('/api/poles').then((r) => r.json()),
        fetch('/api/alerts').then((r) => r.json())
      ]);

      if (polesRes.success && polesRes.data) {
        setPoles(polesRes.data);
      }
      if (alertsRes.success && alertsRes.data) {
        setAlerts(alertsRes.data);
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.warn('API Fetch error:', err.message);
    }
  };

  // 2. Fetch telemetry history for charts
  const fetchTelemetryHistory = async (poleId) => {
    try {
      const res = await fetch(`/api/poles/${poleId}/telemetry?limit=25`).then((r) => r.json());
      if (res.success && res.data) {
        const formatted = res.data.map((item) => ({
          ...item,
          time: new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          voltage: Number(item.voltage),
          current: Number(item.current),
          battery_soc: Number(item.battery_soc),
          power: Number((Number(item.voltage) * Number(item.current)).toFixed(1)),
        }));
        setTelemetryHistory(formatted);
      }
    } catch (err) {
      console.warn('Telemetry fetch error:', err.message);
    }
  };

  // 3. WebSocket connection management
  useEffect(() => {
    fetchData();
    fetchTelemetryHistory(selectedPole);

    // 3. Direct WebSocket connection to backend on port 4000
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname || 'localhost';
    const wsUrl = `${protocol}//${wsHost}:4000/ws`;

    function connectWs() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        console.log('[WS] Connected to backend live feed');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'TELEMETRY') {
            const incoming = message.data;
            // Update poles array state
            setPoles((prevPoles) =>
              prevPoles.map((p) => {
                if (p.pole_id === incoming.pole_id) {
                  return {
                    ...p,
                    status: 'ONLINE',
                    latest_counter: incoming.counter,
                    latest_voltage: incoming.voltage,
                    latest_current: incoming.current,
                    latest_battery_soc: incoming.battery_soc,
                    latest_light_state: incoming.light_state,
                    last_seen: incoming.created_at,
                  };
                }
                return p;
              })
            );

            // If incoming telemetry belongs to currently selected pole, append to chart
            if (incoming.pole_id === selectedPole) {
              setTelemetryHistory((prev) => {
                const newPoint = {
                  ...incoming,
                  time: new Date(incoming.created_at || Date.now()).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }),
                  voltage: Number(incoming.voltage),
                  current: Number(incoming.current),
                  battery_soc: Number(incoming.battery_soc),
                  power: Number((Number(incoming.voltage) * Number(incoming.current)).toFixed(1)),
                };
                const updated = [...prev, newPoint];
                return updated.slice(-25); // keep latest 25 data points
              });
            }
            setLastUpdated(new Date());
          } else if (message.type === 'ALERT') {
            setAlerts((prev) => [message.data, ...prev.slice(0, 29)]);
          }
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        setTimeout(connectWs, 3000);
      };

      ws.onerror = (err) => {
        console.warn('[WS] Error:', err.message);
        ws.close();
      };
    }

    connectWs();

    // Fallback polling every 5 seconds
    const interval = setInterval(() => {
      fetchData();
    }, 5000);

    return () => {
      clearInterval(interval);
      if (wsRef.current) wsRef.current.close();
    };
  }, [selectedPole]);

  // Handle manual Light ON/OFF control
  const handleToggleLight = async (poleId, currentState) => {
    setIsToggling((prev) => ({ ...prev, [poleId]: true }));
    try {
      const nextState = !currentState;
      const res = await fetch(`/api/poles/${poleId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ light_state: nextState }),
      });
      const data = await res.json();
      if (data.success) {
        // Optimistic UI update
        setPoles((prev) =>
          prev.map((p) => (p.pole_id === poleId ? { ...p, latest_light_state: nextState } : p))
        );
      }
    } catch (err) {
      console.error('Failed to toggle light:', err);
    } finally {
      setIsToggling((prev) => ({ ...prev, [poleId]: false }));
    }
  };

  // Trigger test alert
  const triggerTestAlert = async (poleId) => {
    try {
      await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pole_id: poleId,
          severity: 'WARNING',
          message: `Manual diagnostics ping triggered on ${poleId}`,
        }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Aggregate KPI computations
  const totalPoles = poles.length;
  const activeLights = poles.filter((p) => p.latest_light_state).length;
  const totalPowerWatts = poles
    .reduce((sum, p) => sum + (Number(p.latest_voltage || 0) * Number(p.latest_current || 0)), 0)
    .toFixed(0);
  const avgBattery = totalPoles
    ? Math.round(poles.reduce((sum, p) => sum + Number(p.latest_battery_soc || 0), 0) / totalPoles)
    : 0;

  return (
    <div style={{ minHeight: '100vh', padding: '1.5rem 2rem', maxWidth: '1600px', margin: '0 auto' }}>
      {/* ================= HEADER ================= */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '2rem',
          paddingBottom: '1.25rem',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              padding: '0.6rem',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              boxShadow: '0 0 20px rgba(245, 158, 11, 0.4)',
            }}
          >
            <Lightbulb size={26} color="#111827" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              LuminaGrid <span style={{ color: 'var(--accent-amber)', fontSize: '0.9rem', fontWeight: 600, marginLeft: '0.5rem', padding: '0.2rem 0.5rem', background: 'rgba(245, 158, 11, 0.15)', borderRadius: '6px', border: '1px solid var(--accent-amber)' }}>IoT Prototype</span>
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Smart Street Light Management & Energy Telemetry System
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.4rem 0.85rem',
              background: 'rgba(255, 255, 255, 0.04)',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border-color)',
              fontSize: '0.8rem',
            }}
          >
            <div className={`pulse-dot ${wsConnected ? 'online' : 'danger'}`} />
            <span style={{ color: wsConnected ? 'var(--accent-emerald)' : 'var(--accent-rose)', fontWeight: 600 }}>
              {wsConnected ? 'Live Stream Active' : 'Connecting Broker...'}
            </span>
          </div>

          <button
            onClick={() => {
              fetchData();
              fetchTelemetryHistory(selectedPole);
            }}
            className="btn btn-outline"
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </header>

      {/* ================= KPI CARDS ================= */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.25rem',
          marginBottom: '2rem',
        }}
      >
        {/* Card 1 */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Monitored Poles</span>
            <Cpu size={18} color="var(--accent-cyan)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>
            {totalPoles} <span style={{ fontSize: '0.875rem', color: 'var(--accent-emerald)', fontWeight: 500 }}>Online</span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            POLE-001 & POLE-002 active
          </p>
        </div>

        {/* Card 2 */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Active Illumination</span>
            <Lightbulb size={18} color="var(--accent-amber)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-amber)' }}>
            {activeLights} <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>/ {totalPoles} Lit</span>
          </div>
          <div style={{ height: '4px', background: '#1f2937', borderRadius: '2px', marginTop: '0.5rem', overflow: 'hidden' }}>
            <div style={{ width: `${totalPoles ? (activeLights / totalPoles) * 100 : 0}%`, height: '100%', background: 'var(--accent-amber)', transition: 'width 0.3s' }} />
          </div>
        </div>

        {/* Card 3 */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Real-Time Power</span>
            <Zap size={18} color="var(--accent-cyan)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>
            {totalPowerWatts} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>W</span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Combined grid load
          </p>
        </div>

        {/* Card 4 */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Average Battery</span>
            <Battery size={18} color="var(--accent-emerald)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>
            {avgBattery}%
          </div>
          <div style={{ height: '4px', background: '#1f2937', borderRadius: '2px', marginTop: '0.5rem', overflow: 'hidden' }}>
            <div style={{ width: `${avgBattery}%`, height: '100%', background: avgBattery > 50 ? 'var(--accent-emerald)' : 'var(--accent-amber)', transition: 'width 0.3s' }} />
          </div>
        </div>

        {/* Card 5 */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Active Alerts</span>
            <AlertTriangle size={18} color="var(--accent-rose)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: alerts.length ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
            {alerts.length}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Logged notifications
          </p>
        </div>
      </section>

      {/* ================= MAIN CONTENT GRID ================= */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 1.8fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* LEFT COLUMN: HARDWARE POLES CONTROLS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Radio size={18} color="var(--accent-cyan)" /> Street Light Poles ({poles.length})
            </h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MQTT Remote Actuation</span>
          </div>

          {poles.map((pole) => {
            const isLit = Boolean(pole.latest_light_state);
            const isSelected = selectedPole === pole.pole_id;

            return (
              <div
                key={pole.pole_id}
                className="glass-card"
                onClick={() => setSelectedPole(pole.pole_id)}
                style={{
                  cursor: 'pointer',
                  borderColor: isSelected ? 'var(--accent-amber)' : undefined,
                  boxShadow: isSelected ? '0 0 20px var(--accent-amber-glow)' : undefined,
                  background: isSelected ? 'rgba(31, 41, 55, 0.9)' : undefined,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {pole.pole_id}
                      </span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          background: isLit ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          color: isLit ? 'var(--accent-amber)' : 'var(--text-muted)',
                          fontWeight: 600,
                          border: `1px solid ${isLit ? 'var(--accent-amber)' : 'transparent'}`,
                        }}
                      >
                        {isLit ? 'LIGHT ON' : 'LIGHT OFF'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      <MapPin size={12} /> {pole.zone} ({pole.latitude?.toFixed(4)}, {pole.longitude?.toFixed(4)})
                    </div>
                  </div>

                  {/* Toggle Actuator Button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn"
                      disabled={isToggling[pole.pole_id]}
                      onClick={() => handleToggleLight(pole.pole_id, isLit)}
                      style={{
                        padding: '0.45rem 0.9rem',
                        fontSize: '0.75rem',
                        background: isLit ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                        border: `1px solid ${isLit ? 'var(--accent-amber)' : 'var(--border-color)'}`,
                        color: isLit ? 'var(--accent-amber)' : 'var(--text-primary)',
                      }}
                    >
                      <Power size={14} />
                      {isToggling[pole.pole_id] ? 'Publishing...' : isLit ? 'Switch OFF' : 'Switch ON'}
                    </button>
                  </div>
                </div>

                {/* Telemetry Metrics Row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '0.75rem',
                    padding: '0.75rem',
                    background: 'rgba(0, 0, 0, 0.25)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Voltage</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                      {pole.latest_voltage ? `${Number(pole.latest_voltage).toFixed(1)} V` : '--'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Current</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)' }}>
                      {pole.latest_current ? `${Number(pole.latest_current).toFixed(2)} A` : '--'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Battery SoC</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)' }}>
                      {pole.latest_battery_soc ? `${pole.latest_battery_soc} %` : '--'}
                    </div>
                  </div>
                </div>

                {/* Footer status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  <span>Counter: #{pole.latest_counter ?? 0}</span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerTestAlert(pole.pole_id);
                      }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--accent-rose)', cursor: 'pointer', fontSize: '0.7rem' }}
                    >
                      Trigger Test Alert
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* RIGHT COLUMN: TELEMETRY CHARTS (RECHARTS) */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={18} color="var(--accent-amber)" /> Live Telemetry Analytics
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Real-time voltage, current & battery trends for <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>{selectedPole}</span>
              </p>
            </div>

            {/* Pole Selector Pills */}
            <div style={{ display: 'flex', gap: '0.4rem', background: 'rgba(0, 0, 0, 0.3)', padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
              {poles.map((p) => (
                <button
                  key={p.pole_id}
                  onClick={() => setSelectedPole(p.pole_id)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    background: selectedPole === p.pole_id ? 'var(--accent-amber)' : 'transparent',
                    color: selectedPole === p.pole_id ? '#111827' : 'var(--text-secondary)',
                    transition: 'all 0.2s',
                  }}
                >
                  {p.pole_id}
                </button>
              ))}
            </div>
          </div>

          {/* Chart 1: Voltage & Current Dual Axis */}
          <div style={{ height: '240px', width: '100%', marginTop: '0.5rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={telemetryHistory} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                <XAxis dataKey="time" stroke="#6b7280" fontSize={11} />
                <YAxis yAxisId="left" domain={['dataMin - 5', 'dataMax + 5']} stroke="#06b6d4" fontSize={11} unit="V" />
                <YAxis yAxisId="right" orientation="right" domain={[0, 2.5]} stroke="#f59e0b" fontSize={11} unit="A" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line yAxisId="left" type="monotone" dataKey="voltage" name="Voltage (V)" stroke="#06b6d4" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="current" name="Current (A)" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 2: Battery State of Charge (Area Chart) */}
          <div style={{ height: '180px', width: '100%', marginTop: '0.5rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Battery State of Charge (%)
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={telemetryHistory} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="batteryGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                <XAxis dataKey="time" stroke="#6b7280" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="#10b981" fontSize={11} unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="battery_soc" name="Battery SoC (%)" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#batteryGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ================= ALERTS & EVENT LOGS ================= */}
      <section className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={18} color="var(--accent-rose)" /> Live System Alerts & Event Log
          </h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Showing {alerts.length} logged incidents
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Severity</th>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Pole ID</th>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Message</th>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No alerts registered in system. All poles operating normally.
                  </td>
                </tr>
              ) : (
                alerts.map((alert, idx) => {
                  const isCrit = alert.severity === 'CRITICAL';
                  const isWarn = alert.severity === 'WARNING';
                  return (
                    <tr
                      key={alert.id || idx}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                        transition: 'background 0.2s',
                      }}
                    >
                      <td style={{ padding: '0.75rem' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            background: isCrit
                              ? 'rgba(244, 63, 94, 0.15)'
                              : isWarn
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(6, 182, 212, 0.15)',
                            color: isCrit
                              ? 'var(--accent-rose)'
                              : isWarn
                              ? 'var(--accent-amber)'
                              : 'var(--accent-cyan)',
                            border: `1px solid ${
                              isCrit
                                ? 'var(--accent-rose)'
                                : isWarn
                                ? 'var(--accent-amber)'
                                : 'var(--accent-cyan)'
                            }`,
                          }}
                        >
                          {alert.severity}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {alert.pole_id}
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>
                        {alert.message}
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {new Date(alert.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
