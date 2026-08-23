import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Lightbulb,
  Zap,
  Battery,
  BatteryCharging,
  AlertTriangle,
  Radio,
  Activity,
  Power,
  MapPin,
  RefreshCw,
  Clock,
  ShieldCheck,
  ShieldAlert,
  CheckCircle,
  CheckCircle2,
  CheckCheck,
  Cpu,
  ArrowUpRight,
  Sun,
  Moon,
  Sliders,
  Sparkles,
  Gauge,
  Search,
  Filter,
  Bell,
  Settings,
  User,
  Navigation,
  Layers,
  ChevronDown,
  Compass,
  Plus,
  Minus,
  Crosshair,
  TrendingUp,
  X
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

export function formatLocalTime(timestamp) {
  if (!timestamp) return '--:--:--';
  let str = String(timestamp).trim();
  if (!str.endsWith('Z') && !str.includes('+') && !/-\d\d:\d\d$/.test(str) && !/GMT|UTC/i.test(str)) {
    str = str.replace(' ', 'T') + 'Z';
  }
  const d = new Date(str);
  return isNaN(d.getTime())
    ? '--:--:--'
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function App() {
  const [poles, setPoles] = useState([]);
  const [selectedPole, setSelectedPole] = useState('POLE-001');
  const [telemetryHistory, setTelemetryHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [alertFilter, setAlertFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'CLEARED' | 'CRITICAL'
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const [highlightedSection, setHighlightedSection] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isToggling, setIsToggling] = useState({});
  const [dimmerValues, setDimmerValues] = useState({});
  const [tamperState, setTamperState] = useState({});
  const [clearState, setClearState] = useState({});
  const [toastStack, setToastStack] = useState([]);

  const wsRef = useRef(null);
  const selectedPoleRef = useRef(selectedPole);

  // Sync selectedPoleRef
  useEffect(() => {
    selectedPoleRef.current = selectedPole;
    fetchTelemetryHistory(selectedPole);
  }, [selectedPole]);

  // Stacked Persistent Toast Helper (Deduplicates identical alerts; only closes when [X] is clicked)
  const showToast = (title, msg, type = 'info') => {
    setToastStack((prev) => {
      const isDuplicate = prev.some((t) => t.msg === msg);
      if (isDuplicate) return prev; // Prevent duplicate popup for active issue

      const newToast = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        msg,
        type,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };
      return [newToast, ...prev.slice(0, 3)];
    });
  };

  const dismissToast = (id) => {
    setToastStack((prev) => prev.filter((t) => t.id !== id));
  };

  // 1. Fetch initial poles and alerts
  const fetchData = async () => {
    try {
      const [polesRes, alertsRes] = await Promise.all([
        fetch('/api/poles').then((r) => r.json()),
        fetch('/api/alerts').then((r) => r.json())
      ]);

      if (polesRes.success && polesRes.data) {
        setPoles(polesRes.data);
        const dimmers = {};
        polesRes.data.forEach((p) => {
          dimmers[p.pole_id] = p.latest_light_state ? 100 : 0;
        });
        setDimmerValues((prev) => ({ ...dimmers, ...prev }));
      }
      if (alertsRes.success && alertsRes.data) {
        setAlerts(alertsRes.data);
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.warn('API Fetch error:', err.message);
    }
  };

  // 2. Fetch telemetry history for selected pole
  const fetchTelemetryHistory = async (poleId) => {
    try {
      const res = await fetch(`/api/poles/${poleId}/telemetry?limit=25`).then((r) => r.json());
      if (res.success && res.data) {
        const formatted = res.data.map((item) => {
          const v = Number(item.voltage) || 230;
          const i = Number(item.current) || 0.8;
          return {
            ...item,
            time: formatLocalTime(item.created_at),
            voltage: Number(v.toFixed(1)),
            current: Number(i.toFixed(2)),
            battery_soc: Number(item.battery_soc) || 85,
            power: Number((v * i).toFixed(1)),
          };
        });
        setTelemetryHistory(formatted);
      }
    } catch (err) {
      console.warn('Telemetry fetch error:', err.message);
    }
  };

  // 3. Resilient Singleton WebSocket lifecycle
  useEffect(() => {
    let isMounted = true;
    let reconnectTimeout = null;
    let pollingInterval = null;

    fetchData();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname || 'localhost';
    const wsUrl = `${protocol}//${wsHost}:4000/ws`;

    function connectWs() {
      if (!isMounted) return;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const message = JSON.parse(event.data);

            if (message.type === 'TELEMETRY') {
              const incoming = message.data;
              setPoles((prevPoles) =>
                prevPoles.map((p) => {
                  if (p.pole_id === incoming.pole_id) {
                    return {
                      ...p,
                      status: 'ONLINE',
                      latest_counter: incoming.counter,
                      latest_voltage: incoming.voltage !== undefined ? incoming.voltage : p.latest_voltage,
                      latest_current: incoming.current !== undefined ? incoming.current : p.latest_current,
                      latest_battery_soc: incoming.battery_soc !== undefined ? incoming.battery_soc : p.latest_battery_soc,
                      latest_light_state: incoming.light_state !== undefined ? incoming.light_state : p.latest_light_state,
                      last_seen: incoming.created_at,
                    };
                  }
                  return p;
                })
              );

              if (incoming.pole_id === selectedPoleRef.current) {
                setTelemetryHistory((prev) => {
                  const v = incoming.voltage !== undefined ? Number(incoming.voltage) : 230;
                  const i = incoming.current !== undefined ? Number(incoming.current) : 0.8;
                  const newPoint = {
                    ...incoming,
                    time: formatLocalTime(incoming.created_at || Date.now()),
                    voltage: Number(v.toFixed(1)),
                    current: Number(i.toFixed(2)),
                    battery_soc: incoming.battery_soc !== undefined ? Number(incoming.battery_soc) : 80,
                    power: Number((v * i).toFixed(1)),
                  };
                  return [...prev, newPoint].slice(-25);
                });
              }
              setLastUpdated(new Date());
            } else if (message.type === 'ALERT_TRIGGERED') {
              const incomingAlert = message.data;
              setAlerts((prev) => {
                const existingIndex = prev.findIndex((a) => a.id === incomingAlert.id);
                if (existingIndex >= 0) {
                  const updated = [...prev];
                  updated[existingIndex] = incomingAlert;
                  return updated;
                }
                return [incomingAlert, ...prev.slice(0, 49)];
              });
              showToast('Security Alert', `${incomingAlert.pole_id}: ${incomingAlert.message}`, 'danger');
            } else if (message.type === 'ALERT_UPDATED' || message.type === 'ALERT') {
              const incomingAlert = message.data;
              setAlerts((prev) => {
                const existingIndex = prev.findIndex((a) => a.id === incomingAlert.id);
                if (existingIndex >= 0) {
                  const updated = [...prev];
                  updated[existingIndex] = incomingAlert;
                  return updated;
                }
                return [incomingAlert, ...prev.slice(0, 49)];
              });
              // Silent table state update - No spammy toast popup
            } else if (message.type === 'ALERT_CLEARED') {
              const clearedAlert = message.data || {};
              const poleId = clearedAlert.pole_id || message.pole_id;
              setAlerts((prev) =>
                prev.map((a) =>
                  (clearedAlert.id && a.id === clearedAlert.id) || (poleId && a.pole_id === poleId && a.status === 'ACTIVE')
                    ? { ...a, status: 'CLEARED', cleared_at: clearedAlert.cleared_at || new Date().toISOString() }
                    : a
                )
              );
              showToast('Incident Resolved', `Alarm cleared for ${poleId || 'pole'}`, 'success');
            }
          } catch (err) {
            console.error('[WS] Parse error:', err);
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setWsConnected(false);
          reconnectTimeout = setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        };
      } catch {
        if (isMounted) {
          reconnectTimeout = setTimeout(connectWs, 3000);
        }
      }
    }

    connectWs();

    pollingInterval = setInterval(() => {
      if (isMounted) fetchData();
    }, 15000);

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (pollingInterval) clearInterval(pollingInterval);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      }
    };
  }, []);

  // 4. Global Keyboard Shortcuts: [T] for Tamper, [C] for Clear, [1]/[2] for Pole Select
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        triggerTamperAlert(selectedPoleRef.current);
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        resolvePoleAlerts(selectedPoleRef.current);
      } else if (e.key === '1') {
        setSelectedPole('POLE-001');
      } else if (e.key === '2') {
        setSelectedPole('POLE-002');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Actuation: Toggle Single Pole Light (Instant 60 FPS Optimistic State)
  const handleToggleLight = async (poleId, currentState, customBrightness = null) => {
    const nextState = customBrightness !== null ? customBrightness > 0 : !currentState;
    const brightness = customBrightness !== null ? customBrightness : (nextState ? 100 : 0);

    // 1. Instant optimistic local UI update with zero delay and zero intermediate state
    setPoles((prev) =>
      prev.map((p) => (p.pole_id === poleId ? { ...p, latest_light_state: nextState } : p))
    );
    setDimmerValues((prev) => ({ ...prev, [poleId]: brightness }));

    // 2. Dispatch network command in background
    try {
      await fetch(`/api/poles/${poleId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ light_state: nextState, brightness }),
      });
    } catch (err) {
      console.error('Failed to toggle light:', err);
    }
  };

  // Master Bulk Controls (Parallel 60 FPS Synchronous Grid Actuation)
  const handleBulkControl = async (targetState, brightness = 100) => {
    const targetBrightness = targetState ? brightness : 0;

    // 1. Instant synchronous UI update across all cards
    setPoles((prev) => prev.map((p) => ({ ...p, latest_light_state: targetState })));
    setDimmerValues((prev) => {
      const updated = { ...prev };
      poles.forEach((p) => {
        updated[p.pole_id] = targetBrightness;
      });
      return updated;
    });

    // 2. Dispatch all requests in parallel
    await Promise.all(
      poles.map((pole) =>
        fetch(`/api/poles/${pole.pole_id}/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ light_state: targetState, brightness: targetBrightness }),
        }).catch((err) => console.error(`Bulk control failed for ${pole.pole_id}:`, err))
      )
    );
  };

  // Debounced Slider Handler for 60 FPS Fluid Dragging with zero stutter
  const debounceTimerRef = useRef(null);
  const handleSliderChange = (poleId, newBrightness) => {
    // 1. Instant local optimistic update for UI glow and labels
    setDimmerValues((prev) => ({ ...prev, [poleId]: newBrightness }));
    setPoles((prev) =>
      prev.map((p) => (p.pole_id === poleId ? { ...p, latest_light_state: newBrightness > 0 } : p))
    );

    // 2. Debounce MQTT dispatch (180ms) so rapid sliding doesn't flood backend
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      handleToggleLight(poleId, newBrightness > 0, newBrightness);
    }, 180);
  };

  // Trigger Theft / Physical Tamper Alert
  const triggerTamperAlert = async (poleId) => {
    setTamperState((prev) => ({ ...prev, [poleId]: true }));
    setTimeout(() => {
      setTamperState((prev) => ({ ...prev, [poleId]: false }));
    }, 1800);

    // Optimistically drop voltage to 0V immediately
    setPoles((prev) =>
      prev.map((p) => (p.pole_id === poleId ? { ...p, latest_voltage: 0, latest_current: 0, latest_light_state: false } : p))
    );
    setDimmerValues((prev) => ({ ...prev, [poleId]: 0 }));

    if (poleId === selectedPoleRef.current) {
      setTelemetryHistory((prev) => [
        ...prev,
        {
          time: formatLocalTime(Date.now()),
          voltage: 0,
          current: 0,
          battery_soc: prev[prev.length - 1]?.battery_soc || 80,
          light_state: false,
        },
      ].slice(-25));
    }

    try {
      await fetch(`/api/poles/${poleId}/tamper`, { method: 'POST' });
    } catch (err) {
      console.error('Tamper trigger failed:', err);
    }
  };

  // Resolve Pole Active Alarms
  const resolvePoleAlerts = async (poleId) => {
    setClearState((prev) => ({ ...prev, [poleId]: true }));
    setTimeout(() => {
      setClearState((prev) => ({ ...prev, [poleId]: false }));
    }, 1800);

    // Optimistically mark all active alerts for this pole as CLEARED
    setAlerts((prev) =>
      prev.map((a) =>
        a.pole_id === poleId && (a.status === 'ACTIVE' || !a.status)
          ? { ...a, status: 'CLEARED', cleared_at: new Date().toISOString() }
          : a
      )
    );

    // Optimistically restore pole electrical metrics
    setPoles((prev) =>
      prev.map((p) =>
        p.pole_id === poleId
          ? { ...p, latest_voltage: 230, latest_current: p.latest_light_state ? 1.0 : 0.05 }
          : p
      )
    );

    // Optimistically push restored voltage point to active waveform chart
    if (poleId === selectedPoleRef.current) {
      setTelemetryHistory((prev) => [
        ...prev,
        {
          pole_id: poleId,
          voltage: 230,
          current: 1.0,
          battery_soc: 93,
          light_state: true,
          created_at: new Date().toISOString(),
          time: formatLocalTime(Date.now()),
        },
      ].slice(-25));
    }

    try {
      await fetch(`/api/poles/${poleId}/resolve-alerts`, { method: 'POST' });
    } catch (err) {
      console.error('Resolve alerts failed:', err);
    }
  };

  // Resolve a single alert from the Incident table
  const resolveSingleAlert = async (alert) => {
    if (!alert) return;
    setAlerts((prev) =>
      prev.map((a) =>
        (alert.id && a.id === alert.id) || (!alert.id && a.pole_id === alert.pole_id && a.alert_type === alert.alert_type && a.status === 'ACTIVE')
          ? { ...a, status: 'CLEARED', cleared_at: new Date().toISOString() }
          : a
      )
    );

    try {
      if (alert.id) {
        await fetch(`/api/alerts/${alert.id}/resolve`, { method: 'POST' });
      } else {
        await fetch(`/api/poles/${alert.pole_id}/resolve-alerts`, { method: 'POST' });
      }
    } catch (err) {
      console.error('Resolve single alert failed:', err);
    }
  };

  // Resolve All System Alarms
  const handleResolveAllAlarms = async () => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.status === 'ACTIVE' || !a.status
          ? { ...a, status: 'CLEARED', cleared_at: new Date().toISOString() }
          : a
      )
    );
    setPoles((prev) =>
      prev.map((p) => ({ ...p, latest_voltage: 230, latest_current: p.latest_light_state ? 1.0 : 0.05 }))
    );
    try {
      await fetch('/api/alerts/resolve-all', { method: 'POST' });
    } catch (err) {
      console.error('Resolve all alerts failed:', err);
    }
    showToast('System Cleared', 'All active alarms across all zones resolved', 'success');
  };

  // Diagnostics Ping
  const triggerTestAlert = async (poleId) => {
    try {
      await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pole_id: poleId,
          severity: 'WARNING',
          message: `Manual diagnostics ping triggered on ${poleId}`,
          alert_type: 'MANUAL_TEST',
        }),
      });
      showToast('Diagnostic Ping', `Signal verified for ${poleId}`, 'info');
    } catch (err) {
      console.error(err);
    }
  };

  // Computed KPI Metrics
  const totalPoles = poles.length;
  const activeLights = poles.filter((p) => p.latest_light_state).length;
  const activePercent = totalPoles ? Math.round((activeLights / totalPoles) * 100) : 0;
  
  const totalPowerWatts = poles
    .reduce((sum, p) => sum + (Number(p.latest_voltage || 230) * Number(p.latest_current || 0.05)), 0)
    .toFixed(0);

  const avgBattery = totalPoles
    ? Math.round(poles.reduce((sum, p) => sum + Number(p.latest_battery_soc || 0), 0) / totalPoles)
    : 0;

  const avgVoltage = totalPoles
    ? (poles.reduce((sum, p) => sum + Number(p.latest_voltage || 230), 0) / totalPoles).toFixed(1)
    : '230.0';

  const activeAlertsList = alerts.filter((a) => a.status === 'ACTIVE' || (!a.status && a.severity === 'CRITICAL'));
  const activeAlertsCount = activeAlertsList.length;
  const resolvedAlertsCount = alerts.filter((a) => a.status === 'CLEARED').length;

  // Filtered Alert Queue
  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      const matchesSearch =
        !searchQuery ||
        a.pole_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.alert_type?.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (alertFilter === 'ACTIVE') return a.status === 'ACTIVE' || (!a.status && a.severity === 'CRITICAL');
      if (alertFilter === 'CLEARED') return a.status === 'CLEARED';
      if (alertFilter === 'CRITICAL') return a.severity === 'CRITICAL';
      return true;
    });
  }, [alerts, alertFilter, searchQuery]);

  // Currently Selected Pole Details
  const activePoleObj = poles.find((p) => p.pole_id === selectedPole) || poles[0] || {};
  const activePoleLit = Boolean(activePoleObj.latest_light_state);
  const activePoleBrightness = dimmerValues[activePoleObj.pole_id] ?? (activePoleLit ? 100 : 0);

  return (
    <div style={{ minHeight: '100vh', padding: '1.25rem 2rem 3rem', maxWidth: '1600px', margin: '0 auto' }}>
      
      {/* ================= FLOATING STACKED PERSISTENT TOAST NOTIFICATIONS ================= */}
      {toastStack.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column-reverse',
            gap: '0.65rem',
            maxWidth: '430px',
            width: 'calc(100vw - 3rem)',
            pointerEvents: 'none',
          }}
        >
          {toastStack.map((toast) => (
            <div
              key={toast.id}
              style={{
                pointerEvents: 'auto',
                background:
                  toast.type === 'danger'
                    ? 'linear-gradient(135deg, #2d101c 0%, #1f0b14 100%)'
                    : toast.type === 'success'
                    ? 'linear-gradient(135deg, #0d281e 0%, #081a13 100%)'
                    : 'linear-gradient(135deg, #1c1533 0%, #120e24 100%)',
                border: `1px solid ${
                  toast.type === 'danger'
                    ? 'rgba(244, 63, 94, 0.7)'
                    : toast.type === 'success'
                    ? 'rgba(16, 185, 129, 0.7)'
                    : 'rgba(168, 85, 247, 0.7)'
                }`,
                boxShadow: '0 18px 45px rgba(0, 0, 0, 0.95), 0 0 20px rgba(0, 0, 0, 0.6)',
                padding: '0.85rem 1.1rem',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '0.75rem',
                backdropFilter: 'blur(16px)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', flex: 1 }}>
                <div style={{ marginTop: '2px', flexShrink: 0 }}>
                  {toast.type === 'danger' ? (
                    <ShieldAlert size={20} color="var(--neon-rose)" />
                  ) : toast.type === 'success' ? (
                    <CheckCircle2 size={20} color="var(--neon-emerald)" />
                  ) : (
                    <Sparkles size={20} color="var(--neon-cyan)" />
                  )}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.15rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fff' }}>
                      {toast.title}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      {toast.time}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                    {toast.msg}
                  </div>
                </div>
              </div>

              {/* Close Button [X] */}
              <button
                onClick={() => dismissToast(toast.id)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(244, 63, 94, 0.4)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
                title="Close notification"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ================= ELECTRA TOP HEADER BAR ================= */}
      <header
        className="electra-card"
        style={{
          padding: '0.85rem 1.5rem',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          borderRadius: 'var(--radius-xl)',
        }}
      >
        {/* Brand Logo & Tag */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px var(--neon-purple-glow)',
            }}
          >
            <Zap size={22} color="#ffffff" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '0.05em', color: '#fff' }}>
                ELECTRA
              </span>
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--neon-cyan)', background: 'rgba(6, 182, 212, 0.15)', padding: '0.15rem 0.45rem', borderRadius: 'var(--radius-xs)', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
                GRID OS
              </span>
            </div>
          </div>
        </div>

        {/* Center Nav Pills (Quick Jump Action Buttons - Non-Persistent Active State) */}
        <div style={{ display: 'flex', gap: '0.4rem', background: '#0e0b1a', padding: '0.3rem', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-subtle)' }}>
          {[
            { id: 'DASHBOARD', targetId: 'section-overview', label: 'Overview', icon: <Layers size={14} /> },
            { id: 'STATION', targetId: 'section-nodes', label: 'Nodes & Zones', icon: <Radio size={14} /> },
            { id: 'ANALYTICS', targetId: 'section-telemetry', label: 'Energy Telemetry', icon: <Activity size={14} /> },
            { id: 'ALARMS', targetId: 'alarm-section', label: `Incidents (${activeAlertsCount})`, icon: <AlertTriangle size={14} /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setHighlightedSection(tab.targetId);
                if (tab.id === 'DASHBOARD') {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                  const el = document.getElementById(tab.targetId);
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }
                }
                // Automatically clear focus glow after 1.5s
                setTimeout(() => setHighlightedSection(null), 1500);
              }}
              className="btn-electra-pill"
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right Actions & User Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          
          {/* Live Stream Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: wsConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-full)',
              border: `1px solid ${wsConnected ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)'}`,
              fontSize: '0.75rem',
              fontWeight: 700,
              color: wsConnected ? 'var(--neon-emerald)' : 'var(--neon-rose)',
            }}
          >
            <span className={`pulse-dot ${wsConnected ? 'online' : 'danger'}`} />
            {wsConnected ? 'MQTT Live' : 'Offline'}
          </div>

          {/* Master Bulk Control Buttons */}
          <button
            onClick={() => handleBulkControl(true, 100)}
            className="btn-electra-gold"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.75rem' }}
            title="Turn ON all smart street lights at 100% brightness"
          >
            <Sun size={13} /> Master 100%
          </button>

          <button
            onClick={() => handleBulkControl(true, 50)}
            className="btn-electra-pill"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.75rem', color: 'var(--neon-gold)' }}
            title="Set all smart street lights to Eco 50% brightness"
          >
            <Sparkles size={13} /> Eco 50%
          </button>

          <button
            onClick={() => handleBulkControl(false, 0)}
            className="btn-electra-pill"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.75rem' }}
            title="Turn OFF all smart street lights"
          >
            <Moon size={13} /> Master OFF
          </button>

          {/* Quick Refresh */}
          <button
            onClick={() => {
              fetchData();
              fetchTelemetryHistory(selectedPole);
              showToast('Syncing Grid', 'Telemetry and alarm queue refreshed', 'info');
            }}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'var(--bg-pill)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>

          {/* Profile Avatar */}
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #a855f7, #ec4899)',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: '#161228',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '0.75rem',
                color: '#fff',
              }}
            >
              SC
            </div>
          </div>
        </div>
      </header>

      {/* ================= TOP GRID: 3 HERO REFERENCE CARDS ================= */}
      <section
        id="section-overview"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1.2fr) minmax(280px, 1fr) minmax(280px, 1fr)',
          gap: '1.25rem',
          marginBottom: '1.5rem',
        }}
      >
        {/* HERO CARD 1: ACTIVE POLE HARDWARE NODE (ELECTRA CAR / WIREFRAME STYLE) */}
        <div className={`electra-card ${highlightedSection === 'section-overview' ? 'section-focused' : ''}`} style={{ padding: '1.4rem' }}>
          
          {/* Card Header with Dropdown Switcher */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Lightbulb size={16} color="var(--neon-purple)" />
              </div>
              <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fff' }}>
                Smart Street Pole
              </span>
            </div>

            {/* Target Pole Switcher Dropdown */}
            <div style={{ display: 'flex', gap: '0.35rem', background: '#0e0b1a', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--neon-purple)' }}>
                {selectedPole}
              </span>
              <select
                value={selectedPole}
                onChange={(e) => setSelectedPole(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {poles.map((p) => (
                  <option key={p.pole_id} value={p.pole_id} style={{ background: '#161228', color: '#fff' }}>
                    {p.pole_id} ({p.zone.split(' - ')[0]})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Futuristic Visualizer Banner (Electra Neon Shield Style) */}
          <div
            style={{
              height: '150px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #0e0b1a 0%, #1a1435 100%)',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              alignItems: 'center',
              justifyItems: 'center',
              padding: '0.75rem 1rem',
              position: 'relative',
              boxShadow: 'inset 0 0 30px rgba(0, 0, 0, 0.7)',
            }}
          >
            {/* Left Column: Glowing Street Light Graphic */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                width: '100%',
                zIndex: 1,
              }}
            >
              {/* Dynamic Halo Glow - Symmetrical optical dispersion */}
              <div
                style={{
                  position: 'absolute',
                  width: `${Math.max(40, 48 + (activePoleBrightness / 100) * 52)}px`,
                  height: `${Math.max(40, 48 + (activePoleBrightness / 100) * 52)}px`,
                  borderRadius: '50%',
                  background: activePoleBrightness > 0
                    ? `radial-gradient(circle, rgba(251, 191, 36, ${(activePoleBrightness / 100) * 0.65}) 0%, rgba(245, 158, 11, ${(activePoleBrightness / 100) * 0.3}) 45%, transparent 70%)`
                    : 'none',
                  top: '26px',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  zIndex: 0,
                  transition: 'all 0.12s ease-out',
                }}
              />

              {/* Luminaire Core Housing */}
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  background: activePoleBrightness === 0
                    ? '#18132c'
                    : activePoleBrightness >= 80
                    ? 'radial-gradient(circle, #fffbeb 0%, #fde047 35%, #f59e0b 80%, #d97706 100%)'
                    : `radial-gradient(circle, rgba(254, 240, 138, ${0.3 + (activePoleBrightness / 100) * 0.7}) 0%, rgba(251, 191, 36, ${0.25 + (activePoleBrightness / 100) * 0.6}) 50%, rgba(26, 20, 50, 0.9) 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: activePoleBrightness > 0
                    ? `2px solid rgba(251, 191, 36, ${0.4 + (activePoleBrightness / 100) * 0.6})`
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: activePoleBrightness > 0
                    ? `0 0 ${(activePoleBrightness / 100) * 20}px rgba(251, 191, 36, ${0.4 + (activePoleBrightness / 100) * 0.5}), inset 0 0 10px rgba(254, 240, 138, ${activePoleBrightness / 100})`
                    : 'none',
                  zIndex: 1,
                  transition: 'all 0.12s ease-out',
                }}
              >
                <Lightbulb
                  size={26}
                  color={activePoleBrightness === 0 ? '#64748b' : '#ffffff'}
                  strokeWidth={2.4}
                  style={{
                    filter: activePoleBrightness > 0
                      ? `drop-shadow(0 0 ${(activePoleBrightness / 100) * 12}px rgba(251, 191, 36, 0.9))`
                      : 'none',
                    transition: 'all 0.12s ease-out',
                  }}
                />
              </div>

              <span
                style={{
                  fontSize: '0.725rem',
                  fontWeight: 800,
                  color: activePoleBrightness > 0 ? 'var(--neon-gold)' : 'var(--text-muted)',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  marginTop: '0.45rem',
                  zIndex: 1,
                  transition: 'color 0.15s ease',
                }}
              >
                {activePoleBrightness > 0 ? `LUMEN OUTPUT: ${activePoleBrightness}%` : 'STANDBY (0%)'}
              </span>
            </div>

            {/* Right Column: Battery Capsule Box (Rock Solid & Stationary) */}
            <div
              style={{
                width: '135px',
                background: 'rgba(6, 182, 212, 0.15)',
                border: '1px solid rgba(6, 182, 212, 0.4)',
                borderRadius: 'var(--radius-lg)',
                padding: '0.75rem 1rem',
                textAlign: 'center',
                boxShadow: '0 0 20px rgba(6, 182, 212, 0.2)',
                zIndex: 1,
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                {activePoleObj.latest_battery_soc || 88}%
              </div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Battery SoC
              </div>
            </div>
          </div>

          {/* Dedicated Dimmer Slider directly for Selected Pole in Card 1 */}
          <div
            className="electra-slider-box"
            style={{
              marginTop: '0.85rem',
              background: '#0a0814',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '0.35rem', userSelect: 'none' }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', userSelect: 'none' }}>
                <Sliders size={12} color="var(--neon-gold)" /> {selectedPole} Luminaire Dimmer
              </span>
              <span style={{ color: 'var(--neon-gold)', fontWeight: 800, fontFamily: 'var(--font-mono)', userSelect: 'none' }}>
                {activePoleBrightness}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={activePoleBrightness}
              onChange={(e) => handleSliderChange(selectedPole, Number(e.target.value))}
              className="electra-slider"
            />
          </div>

          {/* 2 Metric Summary Strip (Grid Voltage & Load Current) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              textAlign: 'center',
              marginTop: '1rem',
              paddingTop: '0.85rem',
              borderTop: '1px solid var(--border-subtle)',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            <div style={{ userSelect: 'none' }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: activePoleObj.latest_voltage === 0 ? 'var(--neon-rose)' : '#fff', fontFamily: 'var(--font-mono)', userSelect: 'none' }}>
                {activePoleObj.latest_voltage !== undefined && activePoleObj.latest_voltage !== null ? `${activePoleObj.latest_voltage}V` : '230.1V'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem', userSelect: 'none' }}>
                Grid Voltage
              </div>
            </div>
            <div style={{ userSelect: 'none' }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: activePoleObj.latest_current === 0 ? 'var(--text-muted)' : 'var(--neon-cyan)', fontFamily: 'var(--font-mono)', userSelect: 'none' }}>
                {activePoleObj.latest_current !== undefined && activePoleObj.latest_current !== null ? `${activePoleObj.latest_current}A` : '0.85A'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem', userSelect: 'none' }}>
                Load Current
              </div>
            </div>
          </div>
        </div>

        {/* HERO CARD 2: CHARGE & STORAGE GOALS (ELECTRA ARC GAUGE STYLE) */}
        <div className={`electra-card ${highlightedSection === 'section-overview' ? 'section-focused' : ''}`} style={{ padding: '1.4rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(236, 72, 153, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BatteryCharging size={16} color="var(--neon-magenta)" />
              </div>
              <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fff' }}>
                Storage & Solar Goals
              </span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: '#0e0b1a', padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-full)' }}>
              Today
            </span>
          </div>

          {/* Semi-Circular Radial SVG Arc Gauge (Faithful to Electra Arc) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', margin: '0.5rem 0' }}>
            <svg width="240" height="120" viewBox="0 0 240 120">
              <defs>
                <linearGradient id="electraArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#a855f7" />
                  <stop offset="50%" stopColor="#ec4899" />
                  <stop offset="100%" stopColor="#38bdf8" />
                </linearGradient>
              </defs>
              {/* Dotted Guide Scale Line */}
              <path
                d="M 25 110 A 95 95 0 0 1 215 110"
                fill="none"
                stroke="#251f44"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray="2 6"
              />
              {/* Active Progress Arc */}
              <path
                d="M 25 110 A 95 95 0 0 1 215 110"
                fill="none"
                stroke="url(#electraArcGrad)"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray="298"
                strokeDashoffset={298 - (298 * Math.min(100, Math.max(0, avgBattery))) / 100}
                style={{
                  filter: 'drop-shadow(0 0 12px rgba(236, 72, 153, 0.7))',
                  transition: 'stroke-dashoffset 0.8s ease',
                }}
              />
            </svg>

            {/* Arc Center Metrics - Positioned at top 60% per user design */}
            <div
              style={{
                position: 'absolute',
                top: '60%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                width: '100%',
                pointerEvents: 'none',
              }}
            >
              <div style={{ fontSize: '2rem', fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                {avgBattery}%
              </div>
              <div style={{ fontSize: '0.675rem', fontWeight: 800, color: 'var(--neon-magenta)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.25rem' }}>
                System SoC Reserve
              </div>
            </div>

            {/* Arc Dotted Tick Labels - Positioned cleanly below the arc baseline */}
            <div style={{ width: '225px', display: 'flex', justifyContent: 'space-between', marginTop: '0.65rem', padding: '0 0.1rem', fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span>75</span>
              <span>100</span>
            </div>
          </div>

          {/* Dual Goal Metrics Bottom Strip */}
          <div style={{ display: 'flex', justifyContent: 'space-around', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--neon-purple)' }} />
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fff' }}>78%</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Daily Solar Goal</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--neon-magenta)' }} />
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fff' }}>94%</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Storage Health</div>
              </div>
            </div>
          </div>
        </div>

        {/* HERO CARD 3: SMART CITY TOPOLOGY & ZONE DISPATCH (ELECTRA MAP STYLE) */}
        <div className={`electra-card ${highlightedSection === 'section-overview' ? 'section-focused' : ''}`} style={{ padding: '1.4rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(6, 182, 212, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Navigation size={16} color="var(--neon-cyan)" />
              </div>
              <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fff' }}>
                Urban Grid Topology
              </span>
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--neon-emerald)', fontWeight: 700 }}>
              2 Active Zones
            </span>
          </div>

          {/* Stylized Dark Grid Map with Neon Route Path (Electra Reference Map) */}
          <div
            style={{
              height: '115px',
              borderRadius: 'var(--radius-md)',
              background: '#0a0814',
              border: '1px solid rgba(168, 85, 247, 0.2)',
              position: 'relative',
              overflow: 'hidden',
              margin: '0.65rem 0',
            }}
          >
            {/* Grid Pattern Lines */}
            <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, opacity: 0.25 }}>
              <pattern id="cityGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#6366f1" strokeWidth="0.5" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#cityGrid)" />
            </svg>

            {/* Neon Connection Path */}
            <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
              <path
                d="M 30 75 L 100 35 L 170 85 L 240 45"
                fill="none"
                stroke="#ec4899"
                strokeWidth="3"
                strokeDasharray="4 4"
              />
              <circle cx="30" cy="75" r="5" fill="#a855f7" />
              <circle cx="100" cy="35" r="5" fill="#38bdf8" />
              <circle cx="170" cy="85" r="5" fill="#fbbf24" />
              <circle cx="240" cy="45" r="6" fill="#10b981" />
            </svg>

            {/* Floating Location Pills */}
            <div style={{ position: 'absolute', top: '10px', left: '15px', background: 'rgba(22, 18, 40, 0.85)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-xs)', fontSize: '0.65rem', color: '#fff', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
              📍 Zone North (POLE-001)
            </div>
            <div style={{ position: 'absolute', bottom: '10px', right: '15px', background: 'rgba(22, 18, 40, 0.85)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-xs)', fontSize: '0.65rem', color: '#fff', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
              📍 Zone South (POLE-002)
            </div>
          </div>

          {/* Bottom Grid Telemetry Stats */}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.75rem' }}>
            <div style={{ color: 'var(--text-secondary)' }}>
              ⚡ Total Load: <span style={{ color: '#fff', fontWeight: 800 }}>{totalPowerWatts} W</span>
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              ⏱️ Latency: <span style={{ color: 'var(--neon-emerald)', fontWeight: 800 }}>&lt;15 ms</span>
            </div>
          </div>
        </div>
      </section>

      {/* ================= MIDDLE SECTION: 2 PRIMARY WORKSPACES ================= */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1.4fr) minmax(360px, 1fr)', gap: '1.25rem', marginBottom: '1.5rem' }}>
        
        {/* WORKSPACE LEFT: REAL-TIME TELEMETRY DYNAMICS (NEON SPLINE WAVES) */}
        <div id="section-telemetry" className={`electra-card ${highlightedSection === 'section-telemetry' ? 'section-focused' : ''}`} style={{ padding: '1.4rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Header with Switcher Pills */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={18} color="var(--neon-cyan)" />
                <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff' }}>
                  Live Telemetry Waveforms
                </h2>
                <span style={{ fontSize: '0.7rem', color: 'var(--neon-cyan)', background: 'rgba(6, 182, 212, 0.15)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-xs)', fontWeight: 700 }}>
                  {selectedPole}
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                Real-time AC Grid Voltage (V) & Actuator Current Draw (A)
              </p>
            </div>

            {/* Target Pole Switcher Pills */}
            <div style={{ display: 'flex', gap: '0.35rem', background: '#0e0b1a', padding: '0.25rem', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-subtle)' }}>
              {poles.map((p) => (
                <button
                  key={p.pole_id}
                  onClick={() => setSelectedPole(p.pole_id)}
                  style={{
                    padding: '0.3rem 0.75rem',
                    fontSize: '0.725rem',
                    fontWeight: 800,
                    borderRadius: 'var(--radius-full)',
                    border: 'none',
                    cursor: 'pointer',
                    background: selectedPole === p.pole_id ? 'linear-gradient(135deg, #a855f7, #ec4899)' : 'transparent',
                    color: selectedPole === p.pole_id ? '#fff' : 'var(--text-muted)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {p.pole_id}
                </button>
              ))}
            </div>
          </div>

          {/* Chart 1: Glowing Spline Waves for Voltage & Current */}
          <div style={{ height: '210px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={telemetryHistory} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.04)" />
                <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} />
                <YAxis yAxisId="left" domain={[200, 260]} stroke="#06b6d4" fontSize={10} unit="V" tickLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 2.5]} stroke="#ec4899" fontSize={10} unit="A" tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#161228',
                    borderColor: 'rgba(168, 85, 247, 0.3)',
                    borderRadius: '12px',
                    fontSize: '11px',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.9)',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                <Line yAxisId="left" type="monotone" dataKey="voltage" name="Voltage (V)" stroke="#06b6d4" strokeWidth={2.5} dot={{ fill: '#06b6d4', r: 2 }} isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="current" name="Current (A)" stroke="#ec4899" strokeWidth={2.5} dot={{ fill: '#ec4899', r: 2 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 2: Battery Storage Dynamics (Electra Area Wave) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', fontSize: '0.75rem' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>
                Photovoltaic Storage Charge (%)
              </span>
              <span style={{ color: 'var(--neon-emerald)', fontWeight: 700 }}>
                {activePoleObj.latest_battery_soc || 85}% Available
              </span>
            </div>
            <div style={{ height: '140px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={telemetryHistory} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="electraAreaFlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#ec4899" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.04)" />
                  <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke="#a855f7" fontSize={10} unit="%" tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#161228',
                      borderColor: 'rgba(168, 85, 247, 0.3)',
                      borderRadius: '12px',
                      fontSize: '11px',
                    }}
                  />
                  <Area type="monotone" dataKey="battery_soc" name="Battery SoC (%)" stroke="#a855f7" strokeWidth={2} fillOpacity={1} fill="url(#electraAreaFlow)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* WORKSPACE RIGHT: STATION & HARDWARE NODES LIST (ELECTRA STATION LIST STYLE) */}
        <div id="section-nodes" className={`electra-card ${highlightedSection === 'section-nodes' ? 'section-focused' : ''}`} style={{ padding: '1.4rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Radio size={18} color="var(--neon-purple)" />
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff' }}>
                Station Node List
              </h2>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Nearby All ({poles.length})
            </span>
          </div>

          {/* Pole Station List Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {poles.map((pole) => {
              const isLit = Boolean(pole.latest_light_state);
              const isSelected = selectedPole === pole.pole_id;
              const brightness = dimmerValues[pole.pole_id] ?? (isLit ? 100 : 0);
              const isCrit = Number(pole.latest_battery_soc) < 20;

              return (
                <div
                  key={pole.pole_id}
                  onClick={() => setSelectedPole(pole.pole_id)}
                  style={{
                    background: isSelected ? '#1c1733' : '#120e20',
                    border: `1px solid ${isSelected ? 'var(--neon-purple)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '1.1rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected ? '0 0 20px rgba(168, 85, 247, 0.25)' : 'none',
                  }}
                >
                  {/* Top Row: Avatar + Title + Main ON/OFF */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {/* Avatar with Status Ring */}
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '50%',
                          background: isLit
                            ? 'radial-gradient(circle, #fbbf24, #f59e0b)'
                            : '#251f44',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: isLit ? '0 0 15px rgba(251, 191, 36, 0.6)' : 'none',
                        }}
                      >
                        <Lightbulb size={18} color={isLit ? '#0f172a' : '#64748b'} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>
                            {pole.pole_id}
                          </span>
                          <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '0.1rem 0.45rem', borderRadius: '4px', background: isLit ? 'rgba(251, 191, 36, 0.15)' : '#251f44', color: isLit ? 'var(--neon-gold)' : 'var(--text-muted)' }}>
                            {isLit ? `LIT (${brightness}%)` : 'OFF'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                          {pole.zone}
                        </div>
                      </div>
                    </div>

                    {/* Actuation Button (Electra Book Now Button Style) */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleLight(pole.pole_id, isLit);
                      }}
                      className={isLit ? 'btn-electra-gold' : 'btn-electra-primary'}
                      style={{ padding: '0.45rem 0.9rem', fontSize: '0.75rem', cursor: 'pointer' }}
                    >
                      <Power size={13} />
                      {isLit ? 'Turn OFF' : 'Turn ON'}
                    </button>
                  </div>

                  {/* Dimming Slider Strip */}
                  <div style={{ marginBottom: '0.85rem', background: '#0a0814', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '0.3rem' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Dimming Output</span>
                      <span style={{ color: 'var(--neon-magenta)', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={brightness}
                      onChange={(e) => handleSliderChange(pole.pole_id, Number(e.target.value))}
                      className="electra-slider"
                    />
                  </div>

                  {/* Tactile Hardware Action Buttons */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button
                      className={`btn-tamper-pill ${tamperState[pole.pole_id] ? 'triggered' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerTamperAlert(pole.pole_id);
                      }}
                      title="Simulate physical security breach / theft sensor (Press 'T')"
                    >
                      <ShieldAlert size={13} />
                      {tamperState[pole.pole_id] ? '⚠️ ALARM TRIGGERED!' : 'Simulate Theft / Tamper'}
                      <span style={{ fontSize: '0.6rem', background: 'rgba(0,0,0,0.4)', padding: '0.05rem 0.3rem', borderRadius: '3px', marginLeft: '0.2rem' }}>[T]</span>
                    </button>

                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button
                        className={`btn-resolve-pill ${clearState[pole.pole_id] ? 'cleared' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          resolvePoleAlerts(pole.pole_id);
                        }}
                        title="Acknowledge and reset all active critical alarms (Press 'C')"
                      >
                        <CheckCircle size={13} />
                        {clearState[pole.pole_id] ? '✓ Cleared' : 'Resolve'}
                      </button>

                      <button
                        className="btn-electra-pill"
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.7rem' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          showToast('Heartbeat Ping', `ACK latency 12ms for ${pole.pole_id}`, 'info');
                        }}
                        title="Diagnostic Ping"
                      >
                        Ping
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ================= BOTTOM: ISA-18.2 ALARM & INCIDENT CENTER ================= */}
      <section id="alarm-section" className={`electra-card ${highlightedSection === 'alarm-section' ? 'section-focused' : ''}`} style={{ padding: '1.4rem' }}>
        
        {/* Header & Filter Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={20} color="var(--neon-rose)" />
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>
                ISA-18.2 Alarm & Security Incident Center
              </h2>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Stateful hysteresis alarm debouncing, physical tamper triggers and frequency counters
            </p>
          </div>

          {/* Search & Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            
            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: '170px' }}>
              <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search alerts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: '#0e0b1a',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-full)',
                  padding: '0.4rem 0.65rem 0.4rem 2rem',
                  color: '#fff',
                  fontSize: '0.75rem',
                  outline: 'none',
                  width: '100%',
                }}
              />
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: '0.25rem', background: '#0e0b1a', padding: '0.25rem', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-subtle)' }}>
              {[
                { id: 'ALL', label: `All (${alerts.length})` },
                { id: 'ACTIVE', label: `Active (${activeAlertsCount})`, color: 'var(--neon-rose)' },
                { id: 'CRITICAL', label: `Critical`, color: 'var(--neon-rose)' },
                { id: 'CLEARED', label: `Resolved (${resolvedAlertsCount})`, color: 'var(--neon-emerald)' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setAlertFilter(tab.id)}
                  style={{
                    background: alertFilter === tab.id ? 'linear-gradient(135deg, #a855f7, #ec4899)' : 'transparent',
                    color: alertFilter === tab.id ? '#fff' : (tab.color || 'var(--text-muted)'),
                    border: 'none',
                    padding: '0.3rem 0.75rem',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.725rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Clear All Alarms Bulk Action */}
            {activeAlertsCount > 0 && (
              <button
                onClick={handleResolveAllAlarms}
                className="btn-resolve-pill"
                style={{ fontSize: '0.725rem', padding: '0.4rem 0.85rem' }}
              >
                <CheckCheck size={14} /> Clear All ({activeAlertsCount})
              </button>
            )}
          </div>
        </div>

        {/* Incident Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ width: '120px', padding: '0.75rem', fontWeight: 600 }}>Status</th>
                <th style={{ width: '100px', padding: '0.75rem', fontWeight: 600 }}>Severity</th>
                <th style={{ width: '140px', padding: '0.75rem', fontWeight: 600 }}>Target Asset</th>
                <th style={{ padding: '0.75rem', fontWeight: 600 }}>Diagnostic Details</th>
                <th style={{ width: '90px', padding: '0.75rem', fontWeight: 600 }}>Frequency</th>
                <th style={{ width: '110px', padding: '0.75rem', fontWeight: 600 }}>Last Active</th>
                <th style={{ width: '100px', padding: '0.75rem', fontWeight: 600, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No alerts in this category. All hardware sensors nominal.
                  </td>
                </tr>
              ) : (
                filteredAlerts.map((alert, idx) => {
                  const isCrit = alert.severity === 'CRITICAL';
                  const isWarn = alert.severity === 'WARNING';
                  const isActive = alert.status === 'ACTIVE' || (!alert.status && isCrit);

                  return (
                    <tr
                      key={alert.id || idx}
                      style={{
                        height: '52px',
                        maxHeight: '52px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                        background: isActive ? 'rgba(244, 63, 94, 0.04)' : 'transparent',
                      }}
                    >
                      {/* Status */}
                      <td style={{ width: '120px', height: '52px', padding: '0.45rem 0.75rem', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.2rem 0.55rem',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            background: isActive ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: isActive ? 'var(--neon-rose)' : 'var(--neon-emerald)',
                            border: `1px solid ${isActive ? 'rgba(244, 63, 94, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                          }}
                        >
                          <span className={`pulse-dot ${isActive ? 'danger' : 'online'}`} style={{ width: '6px', height: '6px' }} />
                          {isActive ? 'ACTIVE' : 'RESOLVED'}
                        </span>
                      </td>

                      {/* Severity */}
                      <td style={{ width: '100px', height: '52px', padding: '0.45rem 0.75rem', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            background: isCrit
                              ? 'rgba(244, 63, 94, 0.2)'
                              : isWarn
                              ? 'rgba(251, 191, 36, 0.2)'
                              : 'rgba(6, 182, 212, 0.2)',
                            color: isCrit
                              ? 'var(--neon-rose)'
                              : isWarn
                              ? 'var(--neon-gold)'
                              : 'var(--neon-cyan)',
                          }}
                        >
                          {alert.severity}
                        </span>
                      </td>

                      {/* Pole */}
                      <td style={{ width: '140px', height: '52px', padding: '0.45rem 0.75rem', verticalAlign: 'middle', whiteSpace: 'nowrap', fontWeight: 800, color: '#fff' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <span>{alert.pole_id}</span>
                          {alert.zone && (
                            <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)', fontWeight: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {alert.zone}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Diagnostic Details */}
                      <td style={{ height: '52px', padding: '0.45rem 0.75rem', verticalAlign: 'middle', color: 'var(--text-secondary)' }}>
                        <div
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '100%',
                            fontSize: '0.775rem',
                          }}
                          title={alert.message}
                        >
                          {alert.message}
                        </div>
                      </td>

                      {/* Frequency Badge */}
                      <td style={{ width: '90px', height: '52px', padding: '0.45rem 0.75rem', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            padding: '0.15rem 0.55rem',
                            borderRadius: 'var(--radius-full)',
                            background: '#251f44',
                            fontSize: '0.725rem',
                            fontWeight: 800,
                            fontFamily: 'var(--font-mono)',
                            color: alert.occurrence_count > 1 ? 'var(--neon-magenta)' : 'var(--text-muted)',
                          }}
                        >
                          {alert.occurrence_count || 1}x
                        </span>
                      </td>

                      {/* Timestamp */}
                      <td style={{ width: '110px', height: '52px', padding: '0.45rem 0.75rem', verticalAlign: 'middle', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.725rem', fontFamily: 'var(--font-mono)' }}>
                        {formatLocalTime(alert.last_seen_at || alert.created_at)}
                      </td>

                      {/* Action */}
                      <td style={{ width: '100px', height: '52px', padding: '0.45rem 0.75rem', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '30px' }}>
                          {isActive ? (
                            <button
                              onClick={() => resolveSingleAlert(alert)}
                              className="btn-resolve-pill"
                              style={{ padding: '0.25rem 0.65rem', fontSize: '0.7rem' }}
                            >
                              Resolve
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', paddingRight: '0.5rem' }}>--</span>
                          )}
                        </div>
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
