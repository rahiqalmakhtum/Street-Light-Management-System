import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Map, { Marker, NavigationControl, Popup, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Lightbulb,
  LightbulbOff,
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
  Cpu,
  Server,
  Network,
  Share2,
  Sun,
  Moon,
  Sliders,
  Sparkles,
  Gauge,
  Search,
  Filter,
  Bell,
  Settings,
  Navigation,
  Layers,
  ChevronRight,
  Compass,
  Globe,
  Plus,
  Minus,
  Crosshair,
  TrendingUp,
  X,
  Copy,
  Check,
  Flame,
  Thermometer,
  Eye,
  SlidersHorizontal,
  Table as TableIcon,
  Move,
  Edit3,
  Trash2,
  PlusCircle,
  Navigation2,
  Target,
  Save,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  Wifi,
  BarChart3,
  User,
  Menu
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

// Cluster Master Poles (Sensor Gateway & Telemetry Concentrator Poles - Not Street Lamps)
// Connected to all neighbor street lamp poles in their respective cluster and sends aggregated data to the server
const INITIAL_GATEWAYS = [
  {
    id: 'GATEWAY-01',
    pole_id: 'CLUSTER-POLE-A',
    name: 'Cluster Pole 01 (Sensor & Gateway Hub)',
    type: 'CLUSTER_MASTER_POLE',
    cluster_id: 'CLUSTER-A',
    cluster_name: 'Cluster A (Diabari Metro Rail Area)',
    zone: 'Metro Rail Line 6 Avenue',
    lat: 23.8736,
    lng: 90.3784,
    rangeMeters: 450,
    uplink: '4G LTE / MQTT Active',
    connectedNodesCount: 5,
    role: 'Sensor Aggregator & Server Uplink (Not a Luminaire Lamp)',
    firmware: 'v3.8.4-gateway-mesh',
    sensorTypes: ['Ambient Lux (0-65k lx)', 'Environmental Temp & Humidity', 'Grid Frequency & Power Meter', 'Vibration & Theft Sensor'],
  },
  {
    id: 'GATEWAY-02',
    pole_id: 'CLUSTER-POLE-B',
    name: 'Cluster Pole 02 (Sensor & Gateway Hub)',
    type: 'CLUSTER_MASTER_POLE',
    cluster_id: 'CLUSTER-B',
    cluster_name: 'Cluster B (Sonargaon Janapath Extension)',
    zone: 'Sonargaon Janapath Extension',
    lat: 23.8736,
    lng: 90.3850,
    rangeMeters: 550,
    uplink: '4G LTE / MQTT Active',
    connectedNodesCount: 5,
    role: 'Sensor Aggregator & Server Uplink (Not a Luminaire Lamp)',
    firmware: 'v3.8.4-gateway-mesh',
    sensorTypes: ['Ambient Lux (0-65k lx)', 'Environmental Temp & Humidity', 'Grid Frequency & Power Meter', 'Vibration & Theft Sensor'],
  },
  {
    id: 'GATEWAY-03',
    pole_id: 'CLUSTER-POLE-C',
    name: 'Cluster Pole 03 (Sensor & Gateway Hub)',
    type: 'CLUSTER_MASTER_POLE',
    cluster_id: 'CLUSTER-C',
    cluster_name: 'Cluster C (Diabari Bridge & Lake Road)',
    zone: 'Diabari Bridge & Lake Road',
    lat: 23.8765,
    lng: 90.3755,
    rangeMeters: 500,
    uplink: '4G LTE / MQTT Active',
    connectedNodesCount: 5,
    role: 'Sensor Aggregator & Server Uplink (Not a Luminaire Lamp)',
    firmware: 'v3.8.4-gateway-mesh',
    sensorTypes: ['Ambient Lux (0-65k lx)', 'Environmental Temp & Humidity', 'Grid Frequency & Power Meter', 'Vibration & Theft Sensor'],
  },
];

// Styling per Cluster: All Cluster Master Poles are Purple, all Street Lamps are Yellow
const CLUSTER_META = {
  'CLUSTER-A': {
    label: 'Cluster A (Metro)',
    color: '#8b5cf6', // Cluster Master Hub is Purple
    accent: '#7c3aed',
    badge: 'bg-purple-50 text-purple-700 border-purple-200',
    dot: 'bg-purple-600',
    ring: 'border-purple-500/40 bg-purple-500/10',
    glow: 'bg-purple-400/35',
    activeIconColor: 'text-purple-600 fill-purple-400',
  },
  'CLUSTER-B': {
    label: 'Cluster B (Sonargaon)',
    color: '#8b5cf6', // Cluster Master Hub is Purple
    accent: '#7c3aed',
    badge: 'bg-purple-50 text-purple-700 border-purple-200',
    dot: 'bg-purple-600',
    ring: 'border-purple-500/40 bg-purple-500/10',
    glow: 'bg-purple-400/35',
    activeIconColor: 'text-purple-600 fill-purple-400',
  },
  'CLUSTER-C': {
    label: 'Cluster C (Diabari)',
    color: '#8b5cf6', // Cluster Master Hub is Purple
    accent: '#7c3aed',
    badge: 'bg-purple-50 text-purple-700 border-purple-200',
    dot: 'bg-purple-600',
    ring: 'border-purple-500/40 bg-purple-500/10',
    glow: 'bg-purple-400/35',
    activeIconColor: 'text-purple-600 fill-purple-400',
  },
};

// Official CARTO Basemaps API Key (Watermark-free)
const CARTO_API_KEY = 'cb1_2rk8_1_47edd3fb0c363b42ebf95213';

// High-Performance MapLibre GIS Basemap Layers
const MAP_STYLES = {
  positron: {
    version: 8,
    sources: {
      'carto-positron': {
        type: 'raster',
        tiles: [
          `https://a.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
          `https://b.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
          `https://c.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
          `https://d.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      },
    },
    layers: [
      {
        id: 'carto-positron-layer',
        type: 'raster',
        source: 'carto-positron',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  },
  voyager: {
    version: 8,
    sources: {
      'carto-voyager': {
        type: 'raster',
        tiles: [
          `https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
          `https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
          `https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
          `https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      },
    },
    layers: [
      {
        id: 'carto-voyager-layer',
        type: 'raster',
        source: 'carto-voyager',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  },
  google_earth: {
    version: 8,
    sources: {
      'google-earth': {
        type: 'raster',
        tiles: [
          'https://mt0.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
          'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
          'https://mt2.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
          'https://mt3.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        ],
        tileSize: 256,
        maxzoom: 20,
        attribution: '&copy; Google Earth',
      },
    },
    layers: [
      {
        id: 'google-earth-layer',
        type: 'raster',
        source: 'google-earth',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  },
};

export function formatTime(timestamp) {
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

export function formatRuntime(mins) {
  if (!mins || mins <= 0) return '0m';
  const hours = Math.floor(mins / 60);
  const m = mins % 60;
  return hours > 0 ? `${hours}h ${m}m` : `${m}m`;
}

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export default function App() {
  // State: Navigation & Modals
  const [navTab, setNavTab] = useState('MAP'); // 'MAP' | 'POLES' | 'ALERTS' | 'ANALYTICS'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMapLayersOpen, setMobileMapLayersOpen] = useState(false);
  const [mapStyleKey, setMapStyleKey] = useState('positron');
  const [is3DMode, setIs3DMode] = useState(true);
  const [showMeshLines, setShowMeshLines] = useState(false);
  const [clusterFilter, setClusterFilter] = useState('ALL'); // 'ALL' | 'CLUSTER-A' | 'CLUSTER-B' | 'CLUSTER-C' | 'TAMPER'
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCoords, setCopiedCoords] = useState(false);

  // State: Core IoT Data
  const [poles, setPoles] = useState([]);
  const [gateways, setGateways] = useState(() => {
    try {
      const saved = localStorage.getItem('streetlight_gateways_pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Could not parse saved gateway positions', e);
    }
    return INITIAL_GATEWAYS;
  });
  const [selectedPoleId, setSelectedPoleId] = useState('POLE-001');
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [telemetryHistory, setTelemetryHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState(new Date());
  const [hoveredPole, setHoveredPole] = useState(null);
  const [toastStack, setToastStack] = useState([]);

  // Local Dimmer & Actuation States
  const [dimmerValues, setDimmerValues] = useState({});
  const [isDebouncingControl, setIsDebouncingControl] = useState(false);

  // Custom Position & Pole Management States
  const [isRepositionMode, setIsRepositionMode] = useState(false);
  const [isAddingPole, setIsAddingPole] = useState(false);
  const [isEditingCoords, setIsEditingCoords] = useState(false);
  const [isPickingCoordsOnMap, setIsPickingCoordsOnMap] = useState(false);
  const [coordsInput, setCoordsInput] = useState({ lat: '', lng: '' });
  const [newPoleForm, setNewPoleForm] = useState({
    pole_id: '',
    name: '',
    cluster_id: 'CLUSTER-A',
    gateway_id: 'GATEWAY-01',
    latitude: 23.8735,
    longitude: 90.3815,
    zone: 'Uttara Sector 18',
    battery_capacity_ah: 120,
  });

  // Map viewport reference
  const mapRef = useRef(null);
  const selectedPoleRef = useRef(selectedPoleId);
  const wsRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Sync ref
  useEffect(() => {
    selectedPoleRef.current = selectedPoleId;
  }, [selectedPoleId]);

  // Selected pole or cluster master pole object
  const selectedPole = useMemo(() => {
    const fromPoles = poles.find((p) => p.pole_id === selectedPoleId);
    if (fromPoles) return fromPoles;

    const fromGateways = gateways.find((g) => g.id === selectedPoleId || g.pole_id === selectedPoleId);
    if (fromGateways) {
      return {
        ...fromGateways,
        latitude: fromGateways.lat,
        longitude: fromGateways.lng,
        is_on: false,
        latest_light_state: false,
        status: 'ONLINE',
      };
    }

    return poles[0] || null;
  }, [poles, gateways, selectedPoleId]);

  // Sync manual coordinate inputs whenever selected pole changes
  useEffect(() => {
    if (selectedPole) {
      setCoordsInput({
        lat: selectedPole.latitude !== undefined ? Number(selectedPole.latitude).toFixed(6) : '23.874000',
        lng: selectedPole.longitude !== undefined ? Number(selectedPole.longitude).toFixed(6) : '90.380000',
      });
      setIsEditingCoords(false);
      setIsPickingCoordsOnMap(false);
    }
  }, [selectedPoleId, selectedPole?.latitude, selectedPole?.longitude]);

  // Push Toast Alert with Automatic Fade-Away Timer & Smart Incident Deduplication
  const pushToast = useCallback((title, msg, type = 'info', poleId = null) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToastStack((prev) => {
      // Deduplicate by message or identical title+poleId
      const isDuplicate = prev.some(
        (t) => t.msg === msg || (poleId && t.poleId === poleId && t.title === title)
      );
      if (isDuplicate) return prev;

      const newToast = {
        id,
        title,
        msg,
        type,
        poleId,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };
      // Keep maximum 2 toasts visible at a time so screen is never cluttered
      return [newToast, ...prev.slice(0, 1)];
    });

    // Auto fade away after timeout (4.5s for info/success, 5.5s for danger)
    const timeout = type === 'danger' ? 5500 : 4000;
    setTimeout(() => {
      setToastStack((prev) => prev.filter((t) => t.id !== id));
    }, timeout);
  }, []);

  const dismissToast = (id) => {
    setToastStack((prev) => prev.filter((t) => t.id !== id));
  };

  // 1. Fetch initial poles and alerts
  const fetchData = async () => {
    try {
      const [polesRes, alertsRes] = await Promise.all([
        fetch(`${API_BASE}/api/poles`).then((r) => r.json()),
        fetch(`${API_BASE}/api/alerts`).then((r) => r.json()),
      ]);

      if (polesRes.success && polesRes.data) {
        setPoles(polesRes.data);
        const dimmers = {};
        polesRes.data.forEach((p) => {
          dimmers[p.pole_id] = p.brightness !== undefined ? p.brightness : (p.latest_light_state ? 100 : 0);
        });
        setDimmerValues((prev) => ({ ...dimmers, ...prev }));
      }

      if (alertsRes.success && alertsRes.data) {
        setAlerts(alertsRes.data);
      }
      setLastHeartbeat(new Date());
    } catch (err) {
      console.warn('[Dashboard Fetch Error]:', err.message);
    }
  };

  // 2. Fetch rolling history for a selected pole
  const fetchPoleHistory = async (poleId) => {
    try {
      const res = await fetch(`${API_BASE}/api/poles/${poleId}/history?limit=30`).then((r) => r.json());
      if (res.success && res.data) {
        const formatted = res.data.map((item) => {
          const v = Number(item.voltage) || 230;
          const i = Number(item.current) || 0.8;
          const p = item.power_watts !== undefined ? Number(item.power_watts) : Number((v * i).toFixed(1));
          const soc = item.state_of_charge !== undefined ? Number(item.state_of_charge) : (Number(item.battery_soc) || 85);
          return {
            ...item,
            time: formatTime(item.created_at),
            voltage: Number(v.toFixed(1)),
            current: Number(i.toFixed(2)),
            power_watts: p,
            power: p,
            state_of_charge: soc,
            battery_soc: soc,
            battery_voltage: item.battery_voltage !== undefined ? Number(item.battery_voltage) : Number((12.0 + (soc / 100) * 2.4).toFixed(2)),
            battery_temp: item.battery_temp !== undefined ? Number(item.battery_temp) : 28.5,
            battery_current: item.battery_current !== undefined ? Number(item.battery_current) : -1.8,
            estimated_runtime_minutes: item.estimated_runtime_minutes !== undefined ? Number(item.estimated_runtime_minutes) : 450,
          };
        });
        setTelemetryHistory(formatted);
      }
    } catch (err) {
      console.warn('[History Fetch Warning]:', err.message);
    }
  };

  // 3. Selection change effect: fetch history & fly to coordinates
  useEffect(() => {
    if (selectedPoleId) {
      fetchPoleHistory(selectedPoleId);
    }
  }, [selectedPoleId]);

  // Smoothly focus map camera on pole
  const focusOnPole = useCallback((pole) => {
    if (!pole) return;
    const pId = pole.pole_id || pole.id;
    setSelectedPoleId(pId);
    setDrawerOpen(true);
    setNavTab('MAP');

    const lat = pole.latitude ?? pole.lat;
    const lng = pole.longitude ?? pole.lng;

    if (mapRef.current && lat !== undefined && lng !== undefined) {
      mapRef.current.flyTo({
        center: [Number(lng), Number(lat)],
        zoom: 16.2,
        pitch: 60,
        bearing: -15,
        duration: 900,
        essential: true,
      });
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SELECT_POLE', pole_id: pId }));
    }
  }, []);

  // 4. WebSocket Lifecycle
  useEffect(() => {
    let isMounted = true;
    let reconnectTimeout = null;

    fetchData();

    let wsUrl = import.meta.env.VITE_WS_URL;
    if (!wsUrl) {
      if (API_BASE) {
        try {
          const parsed = new URL(API_BASE);
          const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
          wsUrl = `${wsProto}//${parsed.host}/ws`;
        } catch (e) {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          wsUrl = `${protocol}//${window.location.hostname}:4000/ws`;
        }
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.hostname || 'localhost';
        wsUrl = `${protocol}//${wsHost}:4000/ws`;
      }
    }

    function connectWs() {
      if (!isMounted) return;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setWsConnected(true);
          if (selectedPoleRef.current) {
            ws.send(JSON.stringify({ type: 'SELECT_POLE', pole_id: selectedPoleRef.current }));
          }
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
                      status: incoming.tamper_status ? 'TAMPER/CRITICAL' : 'ONLINE',
                      latest_counter: incoming.counter,
                      latest_voltage: incoming.voltage !== undefined ? incoming.voltage : p.latest_voltage,
                      latest_current: incoming.current !== undefined ? incoming.current : p.latest_current,
                      latest_power_watts: incoming.power_watts !== undefined ? incoming.power_watts : p.latest_power_watts,
                      latest_energy_kwh: incoming.energy_kwh !== undefined ? incoming.energy_kwh : p.latest_energy_kwh,
                      latest_battery_voltage: incoming.battery_voltage !== undefined ? incoming.battery_voltage : p.latest_battery_voltage,
                      latest_battery_temp: incoming.battery_temp !== undefined ? incoming.battery_temp : p.latest_battery_temp,
                      latest_battery_soc: incoming.battery_soc !== undefined ? incoming.battery_soc : (incoming.state_of_charge !== undefined ? incoming.state_of_charge : p.latest_battery_soc),
                      latest_state_of_charge: incoming.state_of_charge !== undefined ? incoming.state_of_charge : p.latest_state_of_charge,
                      latest_battery_current: incoming.battery_current !== undefined ? incoming.battery_current : p.latest_battery_current,
                      latest_estimated_runtime_minutes: incoming.estimated_runtime_minutes !== undefined ? incoming.estimated_runtime_minutes : p.latest_estimated_runtime_minutes,
                      latest_ambient_light_lux: incoming.ambient_light_lux !== undefined ? incoming.ambient_light_lux : p.latest_ambient_light_lux,
                      latest_brightness: incoming.brightness !== undefined ? incoming.brightness : p.latest_brightness,
                      latest_tamper_status: incoming.tamper_status !== undefined ? incoming.tamper_status : p.latest_tamper_status,
                      latest_light_state: incoming.light_state !== undefined ? incoming.light_state : p.latest_light_state,
                      last_seen: incoming.created_at || new Date().toISOString(),
                    };
                  }
                  return p;
                })
              );

              // If for selected pole, append to chart history
              if (incoming.pole_id === selectedPoleRef.current) {
                setTelemetryHistory((prev) => {
                  const v = incoming.voltage !== undefined ? Number(incoming.voltage) : 230;
                  const i = incoming.current !== undefined ? Number(incoming.current) : 0.8;
                  const calcPower = incoming.power_watts !== undefined ? Number(incoming.power_watts) : Number((v * i).toFixed(1));
                  const lastSoc = prev.length > 0 ? (prev[prev.length - 1].battery_soc ?? 90) : 90;
                  const soc = incoming.state_of_charge !== undefined ? Number(incoming.state_of_charge) : (incoming.battery_soc !== undefined ? Number(incoming.battery_soc) : lastSoc);
                  const newPoint = {
                    ...incoming,
                    time: formatTime(incoming.created_at || Date.now()),
                    voltage: Number(v.toFixed(1)),
                    current: Number(i.toFixed(2)),
                    power_watts: calcPower,
                    power: calcPower,
                    state_of_charge: soc,
                    battery_soc: soc,
                    battery_voltage: incoming.battery_voltage !== undefined ? Number(incoming.battery_voltage) : Number((12.0 + (soc / 100) * 2.4).toFixed(2)),
                    battery_temp: incoming.battery_temp !== undefined ? Number(incoming.battery_temp) : 28.5,
                    battery_current: incoming.battery_current !== undefined ? Number(incoming.battery_current) : -1.8,
                    estimated_runtime_minutes: incoming.estimated_runtime_minutes !== undefined ? Number(incoming.estimated_runtime_minutes) : 450,
                  };
                  return [...prev, newPoint].slice(-30);
                });
              }

              setLastHeartbeat(new Date());
            } else if (message.type === 'ALERT_TRIGGERED' || message.type === 'ALERT') {
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
              if (incomingAlert.severity === 'CRITICAL') {
                pushToast('Critical Alarm', `🚨 ${incomingAlert.pole_id}: ${incomingAlert.message}`, 'danger', incomingAlert.pole_id);
              }
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
            } else if (message.type === 'POLE_POSITION_UPDATED') {
              setPoles((prev) =>
                prev.map((p) =>
                  p.pole_id === message.pole_id
                    ? { ...p, latitude: message.latitude, longitude: message.longitude }
                    : p
                )
              );
            } else if (message.type === 'POLES_UPDATE' && message.data) {
              setPoles(message.data);
            }
          } catch (err) {
            console.error('[WS Parse Error]:', err.message);
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setWsConnected(false);
          reconnectTimeout = setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        console.warn('[WS Connection Error]:', err.message);
      }
    }

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, [pushToast]);

  // 5. Downlink Actuation & Debounced Control
  const dispatchControl = useCallback(async (poleId, nextState, brightness) => {
    // Optimistic UI state update
    setPoles((prev) =>
      prev.map((p) =>
        p.pole_id === poleId
          ? { ...p, latest_light_state: nextState, is_on: nextState, brightness, latest_brightness: brightness }
          : p
      )
    );
    setDimmerValues((prev) => ({ ...prev, [poleId]: brightness }));

    try {
      await fetch(`${API_BASE}/api/poles/${poleId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: nextState, brightness }),
      });
    } catch (err) {
      console.error('[Control Dispatch Error]:', err.message);
    }
  }, []);

  const handleToggleLight = () => {
    if (!selectedPole) return;
    const currentState = selectedPole.latest_light_state || selectedPole.is_on;
    const nextState = !currentState;
    const brightness = nextState ? (dimmerValues[selectedPole.pole_id] || 100) : 0;
    dispatchControl(selectedPole.pole_id, nextState, brightness);
  };

  const handleDimmerChange = (e) => {
    if (!selectedPole) return;
    const val = parseInt(e.target.value, 10);
    const poleId = selectedPole.pole_id;
    setDimmerValues((prev) => ({ ...prev, [poleId]: val }));

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setIsDebouncingControl(true);

    debounceTimerRef.current = setTimeout(() => {
      const nextState = val > 0;
      dispatchControl(poleId, nextState, val);
      setIsDebouncingControl(false);
    }, 280);
  };

  // Tamper simulation
  const handleTriggerTamper = async (poleId) => {
    try {
      await fetch(`${API_BASE}/api/poles/${poleId}/tamper`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to trigger tamper:', err);
    }
  };

  // Restore hardware
  const handleResolveAlerts = async (poleId) => {
    try {
      await fetch(`${API_BASE}/api/poles/${poleId}/resolve-alerts`, { method: 'POST' });
      pushToast('Hardware Restored', `✅ ${poleId} nominal 230V restored and alarms cleared`, 'success', poleId);
    } catch (err) {
      console.error('Failed to resolve alerts:', err);
    }
  };

  // Copy coordinates to clipboard
  const handleCopyCoords = (lat, lng) => {
    navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  // Handle pole marker drag-end event on the map
  const handleMarkerDragEnd = async (poleId, lngLat) => {
    const lat = Number(lngLat.lat.toFixed(6));
    const lng = Number(lngLat.lng.toFixed(6));

    // Optimistic UI update
    setPoles((prev) =>
      prev.map((p) => (p.pole_id === poleId ? { ...p, latitude: lat, longitude: lng } : p))
    );
    if (selectedPoleId === poleId) {
      setCoordsInput({ lat: lat.toFixed(6), lng: lng.toFixed(6) });
    }

    try {
      const res = await fetch(`${API_BASE}/api/poles/${poleId}/position`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: lat, longitude: lng }),
      });
      const data = await res.json();
      if (data.success) {
        pushToast('Position Relocated', `📍 ${poleId} repositioned to (${lat}, ${lng})`, 'success', poleId);
      } else {
        pushToast('Position Error', data.error || 'Failed to update position', 'danger', poleId);
      }
    } catch (err) {
      console.error('Failed to update position:', err);
      pushToast('Position Error', 'Network error updating pole position', 'danger', poleId);
    }
  };

  // Handle cluster master gateway marker drag-end event on the map
  const handleGatewayDragEnd = (gwId, lngLat) => {
    const lat = Number(lngLat.lat.toFixed(6));
    const lng = Number(lngLat.lng.toFixed(6));

    setGateways((prev) => {
      const updated = prev.map((g) => (g.id === gwId || g.pole_id === gwId ? { ...g, lat, lng } : g));
      try {
        localStorage.setItem('streetlight_gateways_pos', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save gateway position', e);
      }
      return updated;
    });

    if (selectedPoleId === gwId || selectedPole?.id === gwId || selectedPole?.pole_id === gwId) {
      setCoordsInput({ lat: lat.toFixed(6), lng: lng.toFixed(6) });
    }

    pushToast('Cluster Relocated', `📍 Cluster Hub ${gwId} repositioned to (${lat}, ${lng})`, 'success', gwId);
  };

  // Handle saving manual coordinate inputs
  const handleSaveManualCoords = async () => {
    const lat = parseFloat(coordsInput.lat);
    const lng = parseFloat(coordsInput.lng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      pushToast('Invalid Coordinates', 'Please enter valid numbers for latitude (-90..90) and longitude (-180..180)', 'danger');
      return;
    }

    const isGw = gateways.some((g) => g.id === selectedPoleId || g.pole_id === selectedPoleId);
    if (isGw) {
      setGateways((prev) => {
        const updated = prev.map((g) => (g.id === selectedPoleId || g.pole_id === selectedPoleId ? { ...g, lat, lng } : g));
        try {
          localStorage.setItem('streetlight_gateways_pos', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
      setIsEditingCoords(false);
      setIsPickingCoordsOnMap(false);
      pushToast('Coordinates Saved', `📍 ${selectedPoleId} coordinates saved`, 'success', selectedPoleId);
      if (mapRef.current) {
        mapRef.current.flyTo({ center: [lng, lat], zoom: 16.5, duration: 800 });
      }
      return;
    }

    setPoles((prev) =>
      prev.map((p) => (p.pole_id === selectedPoleId ? { ...p, latitude: lat, longitude: lng } : p))
    );
    setIsEditingCoords(false);
    setIsPickingCoordsOnMap(false);

    try {
      const res = await fetch(`${API_BASE}/api/poles/${selectedPoleId}/position`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: lat, longitude: lng }),
      });
      const data = await res.json();
      if (data.success) {
        pushToast('Coordinates Saved', `📍 ${selectedPoleId} coordinates saved to database`, 'success', selectedPoleId);
        if (mapRef.current) {
          mapRef.current.flyTo({ center: [lng, lat], zoom: 16.5, duration: 800 });
        }
      }
    } catch (err) {
      console.error('Failed to update coordinates:', err);
    }
  };

  // Handle clicking on map when in coordinate pick / placement mode
  const handleMapClick = (e) => {
    const lat = Number(e.lngLat.lat.toFixed(6));
    const lng = Number(e.lngLat.lng.toFixed(6));

    if (isPickingCoordsOnMap && selectedPoleId) {
      setCoordsInput({ lat: lat.toFixed(6), lng: lng.toFixed(6) });
      const isGw = gateways.some((g) => g.id === selectedPoleId || g.pole_id === selectedPoleId);
      if (isGw) {
        setGateways((prev) =>
          prev.map((g) => (g.id === selectedPoleId || g.pole_id === selectedPoleId ? { ...g, lat, lng } : g))
        );
      } else {
        setPoles((prev) =>
          prev.map((p) => (p.pole_id === selectedPoleId ? { ...p, latitude: lat, longitude: lng } : p))
        );
      }
      pushToast('Location Picked', `📍 Selected (${lat}, ${lng}). Click "Save Coordinates" to apply.`, 'info');
      setIsPickingCoordsOnMap(false);
    } else if (isAddingPole) {
      setNewPoleForm((prev) => ({ ...prev, latitude: lat, longitude: lng }));
      pushToast('Pin Placed', `📍 Coordinates captured: (${lat}, ${lng})`, 'info');
    }
  };

  // Handle creating a new pole
  const handleCreateNewPole = async (e) => {
    e?.preventDefault();
    if (!newPoleForm.pole_id) {
      pushToast('Validation Error', 'Pole ID is required (e.g. POLE-016)', 'danger');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/poles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPoleForm),
      });
      const data = await res.json();
      if (data.success) {
        setIsAddingPole(false);
        fetchData();
        setSelectedPoleId(newPoleForm.pole_id);
        pushToast('Pole Added', `✅ Pole ${newPoleForm.pole_id} successfully deployed to map`, 'success', newPoleForm.pole_id);
        if (mapRef.current) {
          mapRef.current.flyTo({ center: [newPoleForm.longitude, newPoleForm.latitude], zoom: 16.5, duration: 900 });
        }
      } else {
        pushToast('Creation Failed', data.error || 'Could not create pole', 'danger');
      }
    } catch (err) {
      console.error('Error creating pole:', err);
    }
  };

  // Handle deleting a pole
  const handleDeletePole = async (poleId) => {
    if (!window.confirm(`Are you sure you want to remove pole ${poleId} from the GIS map and database?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/poles/${poleId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setPoles((prev) => prev.filter((p) => p.pole_id !== poleId));
        if (selectedPoleId === poleId) {
          const remaining = poles.filter((p) => p.pole_id !== poleId);
          if (remaining.length > 0) setSelectedPoleId(remaining[0].pole_id);
        }
        pushToast('Pole Removed', `🗑️ ${poleId} deleted`, 'info');
      }
    } catch (err) {
      console.error('Error deleting pole:', err);
    }
  };

  // Handle cluster selection from left sidebar (pans map to cluster while keeping all clusters visible)
  const handleSelectCluster = (clusterId) => {
    setClusterFilter(clusterId);
    if (navTab !== 'MAP') setNavTab('MAP');

    if (mapRef.current) {
      if (clusterId === 'CLUSTER-A') {
        mapRef.current.flyTo({ center: [90.3800, 23.8736], zoom: 16.4, pitch: 60, bearing: -15, duration: 1000 });
      } else if (clusterId === 'CLUSTER-B') {
        mapRef.current.flyTo({ center: [90.3850, 23.8720], zoom: 16.4, pitch: 60, bearing: -15, duration: 1000 });
      } else if (clusterId === 'CLUSTER-C') {
        mapRef.current.flyTo({ center: [90.3776, 23.8772], zoom: 16.4, pitch: 60, bearing: -15, duration: 1000 });
      } else {
        mapRef.current.flyTo({ center: [90.3820, 23.8745], zoom: 15.2, pitch: 60, bearing: -15, duration: 1000 });
      }
    }
  };

  // All poles visible on the map, sorted by latitude descending (North to South) so foreground pins naturally render in front of background pins
  const mapPoles = useMemo(() => {
    let filtered = poles;
    if (searchQuery) {
      filtered = poles.filter((p) =>
        p.pole_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.zone?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    // Sort descending by latitude: North (background) renders first, South (foreground) renders in front
    return [...filtered].sort((a, b) => Number(b.latitude) - Number(a.latitude));
  }, [poles, searchQuery]);

  // Dynamic Mesh Lines connecting each Street Lamp Pole to its Cluster Master Pole
  const meshLinesGeoJson = useMemo(() => {
    const features = [];
    gateways.forEach((gw) => {
      const clusterColor = CLUSTER_META[gw.cluster_id]?.color || '#f59e0b';
      const clusterPoles = poles.filter((p) => p.cluster_id === gw.cluster_id);

      clusterPoles.forEach((pole) => {
        features.push({
          type: 'Feature',
          properties: {
            cluster_id: gw.cluster_id,
            color: clusterColor,
            pole_id: pole.pole_id,
            gw_id: gw.id,
          },
          geometry: {
            type: 'LineString',
            coordinates: [
              [Number(gw.lng), Number(gw.lat)],
              [Number(pole.longitude), Number(pole.latitude)],
            ],
          },
        });
      });
    });

    return {
      type: 'FeatureCollection',
      features,
    };
  }, [poles, gateways]);

  // Filtered poles list (used for table view)
  const filteredPoles = useMemo(() => {
    return poles.filter((p) => {
      const matchSearch =
        searchQuery === '' ||
        p.pole_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.zone?.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchSearch) return false;

      if (clusterFilter === 'ALL') return true;
      if (clusterFilter === 'TAMPER') return p.status === 'TAMPER/CRITICAL' || p.latest_tamper_status;
      return p.cluster_id === clusterFilter;
    });
  }, [poles, searchQuery, clusterFilter]);

  // Aggregate Metrics
  const totalPoles = poles.length;
  const activeLights = poles.filter((p) => p.latest_light_state).length;
  const tamperedCount = poles.filter((p) => p.status === 'TAMPER/CRITICAL' || p.latest_tamper_status).length;
  const avgBatterySoc = totalPoles > 0
    ? Math.round(poles.reduce((sum, p) => sum + Number(p.latest_battery_soc || 90), 0) / totalPoles)
    : 0;
  const totalPowerKW = totalPoles > 0
    ? (poles.reduce((sum, p) => sum + Number(p.latest_power_watts || 190), 0) / 1000).toFixed(2)
    : '0.00';

  return (
    <div className="flex h-screen w-screen bg-[#f8fafc] text-gray-900 font-sans overflow-hidden select-none relative">
      {/* MOBILE BACKDROP OVERLAY FOR SIDEBAR */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[99990] lg:hidden transition-opacity"
        />
      )}

      {/* 1. LEFT NAVIGATION BAR (Expanded on Desktop, Slide-over Drawer on Mobile & Tablet) */}
      <aside
        className={`fixed inset-y-0 left-0 z-[99995] w-64 bg-white border-r border-gray-200 flex flex-col justify-between py-4 px-3 shadow-2xl lg:shadow-xs lg:static lg:w-56 lg:flex-shrink-0 transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col gap-5 overflow-y-auto no-scrollbar">
          {/* Brand Header */}
          <div className="flex items-center justify-between px-2 py-1">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-md shadow-amber-500/20">
                <Zap className="w-5 h-5 text-white fill-white/20" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-sm tracking-tight text-gray-900">ELECTRA</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                    GIS
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 font-medium">Uttara Sector 18 Fleet</p>
              </div>
            </div>
            {/* Close Button for Mobile Drawer */}
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Primary Navigation */}
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-3 block mb-1.5">
              Overview
            </span>

            <button
              onClick={() => {
                setNavTab('MAP');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                navTab === 'MAP'
                  ? 'bg-amber-500 text-white font-bold shadow-sm shadow-amber-500/30'
                  : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <MapPin className={`w-4 h-4 ${navTab === 'MAP' ? 'text-white' : 'text-gray-500'}`} />
                <span>GIS Map View</span>
              </div>
              <span className={`min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold leading-none ${
                navTab === 'MAP' ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {totalPoles}
              </span>
            </button>

            <button
              onClick={() => {
                setNavTab('POLES');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                navTab === 'POLES'
                  ? 'bg-amber-500 text-white font-bold shadow-sm shadow-amber-500/30'
                  : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <TableIcon className={`w-4 h-4 ${navTab === 'POLES' ? 'text-white' : 'text-gray-500'}`} />
                <span>Poles Fleet</span>
              </div>
            </button>

            <button
              onClick={() => {
                setNavTab('ALERTS');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                navTab === 'ALERTS'
                  ? 'bg-amber-500 text-white font-bold shadow-sm shadow-amber-500/30'
                  : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Bell className={`w-4 h-4 ${navTab === 'ALERTS' ? 'text-white' : 'text-gray-500'}`} />
                <span>Alerts & Theft</span>
              </div>
              {tamperedCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1.5 rounded-full flex items-center justify-center text-[10px] font-bold bg-rose-500 text-white leading-none shadow-xs">
                  {tamperedCount}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setNavTab('ANALYTICS');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                navTab === 'ANALYTICS'
                  ? 'bg-amber-500 text-white font-bold shadow-sm shadow-amber-500/30'
                  : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Activity className={`w-4 h-4 ${navTab === 'ANALYTICS' ? 'text-white' : 'text-gray-500'}`} />
                <span>Power Analytics</span>
              </div>
            </button>
          </div>

          {/* Fleet Cluster Filters */}
          <div className="space-y-1 pt-3 border-t border-gray-100">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-3 block mb-1.5">
              Clusters
            </span>

            {[
              { id: 'ALL', label: 'All Fleet Nodes', count: 15, dot: 'bg-purple-600', activeBg: 'bg-purple-50 text-purple-900 border-purple-300' },
              { id: 'CLUSTER-A', label: 'Cluster A (Metro)', count: 5, dot: 'bg-purple-600', activeBg: 'bg-purple-50 text-purple-900 border-purple-300' },
              { id: 'CLUSTER-B', label: 'Cluster B (Sonargaon)', count: 5, dot: 'bg-purple-600', activeBg: 'bg-purple-50 text-purple-900 border-purple-300' },
              { id: 'CLUSTER-C', label: 'Cluster C (Diabari)', count: 5, dot: 'bg-purple-600', activeBg: 'bg-purple-50 text-purple-900 border-purple-300' },
            ].map((cl) => (
              <button
                key={cl.id}
                onClick={() => {
                  handleSelectCluster(cl.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  clusterFilter === cl.id
                    ? `${cl.activeBg} font-bold border shadow-xs`
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className={`w-2.5 h-2.5 rounded-full ${clusterFilter === cl.id ? cl.dot : 'bg-gray-300'}`} />
                  <span className="truncate">{cl.label}</span>
                </div>
                <span className="text-[10px] text-gray-400 font-mono">{cl.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Bottom User Card */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 font-bold text-xs flex items-center justify-center shrink-0 border border-amber-200">
              OP
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-gray-900 truncate">Control Room</p>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Admin Online</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. MAIN CONTENT VIEWPORT */}
      <main className="flex-1 relative flex flex-col h-full overflow-hidden bg-[#f8fafc] isolate">
        {/* TOP FIXED CLEAN HEADER BAR (Light Theme & Mobile Responsive) */}
        <header className="h-14 bg-white border-b border-gray-200 px-3 sm:px-5 flex items-center justify-between z-[1200] shrink-0 gap-2 sm:gap-4 shadow-xs">
          {/* Left: Mobile Menu Toggle & Search Input */}
          <div className="flex items-center gap-2 sm:gap-4 flex-1 max-w-xl">
            {/* Hamburger Toggle (Mobile / Tablet) */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors shrink-0"
              title="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Mobile Brand Mark (Shown on small screens where sidebar is hidden) */}
            <div className="lg:hidden flex items-center gap-1.5 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center text-white shadow-xs">
                <Zap className="w-4 h-4 fill-white" />
              </div>
            </div>

            {/* Desktop Breadcrumb */}
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-gray-400 font-medium whitespace-nowrap">
              <span>Home</span>
              <span>/</span>
              <span className="text-gray-900 font-bold">
                {navTab === 'MAP' ? 'Map Viewport' : navTab === 'POLES' ? 'Fleet Inventory' : navTab === 'ALERTS' ? 'Alerts' : 'Analytics'}
              </span>
            </div>

            {/* Quick Search */}
            <div className="relative flex-1 min-w-[120px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search pole or cluster..."
                className="w-full bg-gray-50/80 hover:bg-gray-100/70 focus:bg-white border border-gray-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 transition-all font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Center: Live Quick Metrics Chips (Hidden on smaller screens) */}
          <div className="hidden xl:flex items-center gap-3 text-xs bg-gray-50 border border-gray-200/90 px-3.5 py-1.5 rounded-xl font-medium">
            <div className="flex items-center gap-1.5" title="Active Poles Online">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-gray-500">Online:</span>
              <span className="font-bold text-gray-900 font-mono">{totalPoles - tamperedCount}/{totalPoles}</span>
            </div>
            <span className="text-gray-300">|</span>
            <div className="flex items-center gap-1.5" title="Active Streetlights Light State">
              <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-gray-500">Lights ON:</span>
              <span className="font-bold text-gray-900 font-mono">{activeLights}</span>
            </div>
            <span className="text-gray-300">|</span>
            <div className="flex items-center gap-1.5" title="Grid Active Load">
              <Zap className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-gray-500">Load:</span>
              <span className="font-bold text-gray-900 font-mono">{totalPowerKW} kW</span>
            </div>
            <span className="text-gray-300">|</span>
            <div className="flex items-center gap-1.5" title="Average Battery State of Charge">
              <BatteryCharging className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-gray-500">Avg SoC:</span>
              <span className="font-bold text-gray-900 font-mono">{avgBatterySoc}%</span>
            </div>
          </div>

          {/* Right: Actions Toolbar */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Reposition Mode Button */}
            <button
              onClick={() => {
                const next = !isRepositionMode;
                setIsRepositionMode(next);
                pushToast(
                  next ? 'Drag-to-Move Active' : 'Drag-to-Move Disabled',
                  next ? '🖐️ Click and drag any pole marker on the map to relocate it' : 'Map markers locked',
                  'info'
                );
              }}
              title="Toggle Drag-and-Drop Pin Relocation"
              className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 border ${
                isRepositionMode
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-300'
                  : 'text-gray-700 bg-gray-50 hover:bg-gray-100 border-gray-200'
              }`}
            >
              <Move className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isRepositionMode ? 'Dragging On' : 'Move Pins'}</span>
            </button>

            {/* + Add Pole Button */}
            <button
              onClick={() => {
                const nextId = `POLE-${String(poles.length + 1).padStart(3, '0')}`;
                setNewPoleForm({
                  pole_id: nextId,
                  name: `Smart Pole ${nextId}`,
                  cluster_id: 'CLUSTER-A',
                  gateway_id: 'GATEWAY-01',
                  latitude: 23.8735,
                  longitude: 90.3815,
                  zone: 'Uttara Sector 18',
                  battery_capacity_ah: 120,
                });
                setIsAddingPole(true);
              }}
              className="px-2.5 sm:px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white shadow-xs shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Pole</span>
            </button>

            {/* Live WebSocket Status Pill */}
            <div
              className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl text-[11px] font-medium border shrink-0 ${
                wsConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
              title={`WebSocket Server: ${wsConnected ? 'Connected (4000/ws)' : 'Reconnecting...'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="hidden sm:inline">{wsConnected ? 'Live' : 'Offline'}</span>
            </div>

            {/* Drawer Toggle */}
            <button
              onClick={() => {
                if (navTab !== 'MAP') {
                  setNavTab('MAP');
                  setDrawerOpen(true);
                } else {
                  setDrawerOpen((o) => !o);
                }
              }}
              title={navTab === 'MAP' && drawerOpen ? 'Hide Detail Drawer' : 'Show Detail Drawer'}
              className={`p-1.5 rounded-xl border transition-all shrink-0 ${
                navTab === 'MAP' && drawerOpen ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-white hover:bg-gray-50 text-gray-600 border-gray-200'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* MAP TAB (PRIMARY GIS VIEWPORT) */}
        {navTab === 'MAP' && (
          <div className="w-full h-full relative">
            {/* Interactive Coordinate Picker Banner */}
            {(isPickingCoordsOnMap || isRepositionMode) && (
              <div className="absolute top-3 sm:top-5 left-16 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-auto z-[1000] bg-white/95 backdrop-blur-xl border border-amber-400/80 px-3.5 sm:px-4 py-2 rounded-2xl shadow-xl flex items-center justify-between sm:justify-start gap-3 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
                  <span className="text-xs font-semibold text-gray-900 truncate">
                    {isPickingCoordsOnMap
                      ? `🎯 Click map to place ${selectedPoleId}`
                      : '🖐️ Drag circle marker to move'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setIsPickingCoordsOnMap(false);
                    setIsRepositionMode(false);
                  }}
                  className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg border border-gray-200 font-semibold shadow-xs shrink-0"
                >
                  Done
                </button>
              </div>
            )}

            <Map
              ref={mapRef}
              initialViewState={{
                longitude: 90.3820,
                latitude: 23.8745,
                zoom: 15.3,
                bearing: -15,
                pitch: 60,
              }}
              maxZoom={20}
              maxPitch={85}
              dragRotate={true}
              pitchWithRotate={true}
              touchPitch={true}
              mapStyle={MAP_STYLES[mapStyleKey] || MAP_STYLES.positron}
              style={{ width: '100%', height: '100%' }}
              attributionControl={false}
              onClick={handleMapClick}
              cursor={isPickingCoordsOnMap || isAddingPole ? 'crosshair' : (isRepositionMode ? 'grab' : 'default')}
            >
              <NavigationControl position="top-left" showCompass={true} visualizePitch={true} />

              {/* 1. DESKTOP BASEMAP STYLE & 3D TOOLBAR (>= md screens) */}
              <div className="hidden md:flex absolute bottom-6 left-6 z-[1000] items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl border border-gray-200/90 shadow-lg">
                {/* 3D Perspective Quick Tilt Button */}
                <button
                  onClick={() => {
                    if (!mapRef.current) return;
                    const next3D = !is3DMode;
                    setIs3DMode(next3D);
                    mapRef.current.easeTo({
                      pitch: next3D ? 60 : 0,
                      bearing: next3D ? -15 : 0,
                      duration: 800,
                    });
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-xl transition-all flex items-center gap-1.5 border shrink-0 ${
                    is3DMode
                      ? 'bg-amber-50 text-amber-900 border-amber-200 shadow-2xs font-semibold'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/80 border-transparent'
                  }`}
                  title="Toggle 2D Top-Down / 3D Angled Perspective"
                >
                  <Compass className={`w-3.5 h-3.5 ${is3DMode ? 'text-amber-600' : 'text-amber-500'}`} />
                  <span>3D Angle</span>
                </button>

                <div className="w-[1px] h-4 bg-gray-200 mx-0.5 shrink-0" />

                {/* Mesh Lines Toggle */}
                <button
                  onClick={() => setShowMeshLines((prev) => !prev)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-xl transition-all flex items-center gap-1.5 border shrink-0 ${
                    showMeshLines
                      ? 'bg-purple-50 text-purple-900 border-purple-200 shadow-2xs font-semibold'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/80 border-transparent'
                  }`}
                  title="Toggle Mesh Network Connection Lines"
                >
                  <Network className={`w-3.5 h-3.5 ${showMeshLines ? 'text-purple-600' : 'text-purple-400'}`} />
                  <span>Mesh Lines</span>
                </button>

                <div className="w-[1px] h-4 bg-gray-200 mx-0.5 shrink-0" />

                {[
                  {
                    id: 'positron',
                    label: 'Positron Light',
                    Icon: Sun,
                    iconColor: 'text-amber-500',
                    activeStyle: 'bg-amber-50 text-amber-900 border-amber-200 shadow-2xs font-semibold',
                  },
                  {
                    id: 'voyager',
                    label: 'Voyager Streets',
                    Icon: Layers,
                    iconColor: 'text-blue-500',
                    activeStyle: 'bg-blue-50 text-blue-900 border-blue-200 shadow-2xs font-semibold',
                  },
                  {
                    id: 'google_earth',
                    label: 'Google Earth View',
                    Icon: Globe,
                    iconColor: 'text-emerald-500',
                    activeStyle: 'bg-emerald-50 text-emerald-900 border-emerald-200 shadow-2xs font-semibold',
                  },
                ].map((s) => {
                  const isActive = mapStyleKey === s.id;
                  const ButtonIcon = s.Icon;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setMapStyleKey(s.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-xl transition-all flex items-center gap-1.5 border shrink-0 ${
                        isActive
                          ? s.activeStyle
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/80 border-transparent'
                      }`}
                    >
                      <ButtonIcon className={`w-3.5 h-3.5 ${s.iconColor}`} />
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* 2. MOBILE COMPACT MAP CONTROL PILL (< md screens) */}
              <div className="md:hidden absolute bottom-20 left-3 z-[1000] flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-2xl border border-gray-200/90 shadow-lg">
                {/* 3D Tilt Quick Toggle */}
                <button
                  onClick={() => {
                    if (!mapRef.current) return;
                    const next3D = !is3DMode;
                    setIs3DMode(next3D);
                    mapRef.current.easeTo({
                      pitch: next3D ? 60 : 0,
                      bearing: next3D ? -15 : 0,
                      duration: 800,
                    });
                  }}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-xl transition-all flex items-center gap-1 border ${
                    is3DMode
                      ? 'bg-amber-50 text-amber-900 border-amber-200 shadow-2xs font-bold'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/80 border-transparent'
                  }`}
                >
                  <Compass className={`w-3.5 h-3.5 ${is3DMode ? 'text-amber-600' : 'text-amber-500'}`} />
                  <span>3D</span>
                </button>

                <div className="w-[1px] h-4 bg-gray-200" />

                {/* Mesh Lines Quick Toggle */}
                <button
                  onClick={() => setShowMeshLines((prev) => !prev)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-xl transition-all flex items-center gap-1 border ${
                    showMeshLines
                      ? 'bg-purple-50 text-purple-900 border-purple-200 shadow-2xs font-bold'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/80 border-transparent'
                  }`}
                >
                  <Network className={`w-3.5 h-3.5 ${showMeshLines ? 'text-purple-600' : 'text-purple-400'}`} />
                  <span>Mesh</span>
                </button>

                <div className="w-[1px] h-4 bg-gray-200" />

                {/* Map Layers Dropdown Trigger */}
                <button
                  onClick={() => setMobileMapLayersOpen((prev) => !prev)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-xl transition-all flex items-center gap-1 border ${
                    mobileMapLayersOpen
                      ? 'bg-blue-50 text-blue-900 border-blue-200 shadow-2xs font-bold'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/80 border-transparent'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-blue-500" />
                  <span className="capitalize">{mapStyleKey === 'google_earth' ? 'Satellite' : mapStyleKey}</span>
                  <ChevronUp className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${mobileMapLayersOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Mobile Map Layers Popover Menu */}
              {mobileMapLayersOpen && (
                <>
                  <div
                    className="md:hidden fixed inset-0 z-[1050]"
                    onClick={() => setMobileMapLayersOpen(false)}
                  />
                  <div className="md:hidden absolute bottom-32 left-3 z-[1100] bg-white/95 backdrop-blur-xl border border-gray-200/90 rounded-2xl p-2.5 shadow-2xl space-y-1.5 min-w-[210px] animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <div className="px-2 py-1 flex items-center justify-between border-b border-gray-100 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Select Basemap</span>
                      <button
                        onClick={() => setMobileMapLayersOpen(false)}
                        className="text-gray-400 hover:text-gray-600 p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {[
                      { id: 'positron', label: 'Positron Light', desc: 'Minimal clean grayscale', Icon: Sun, color: 'text-amber-500', activeStyle: 'bg-amber-50 text-amber-900 border-amber-200 font-bold' },
                      { id: 'voyager', label: 'Voyager Streets', desc: 'Detailed road network', Icon: Layers, color: 'text-blue-500', activeStyle: 'bg-blue-50 text-blue-900 border-blue-200 font-bold' },
                      { id: 'google_earth', label: 'Google Earth View', desc: 'Photorealistic satellite', Icon: Globe, color: 'text-emerald-500', activeStyle: 'bg-emerald-50 text-emerald-900 border-emerald-200 font-bold' },
                    ].map((s) => {
                      const isActive = mapStyleKey === s.id;
                      const ItemIcon = s.Icon;
                      return (
                        <button
                          key={s.id}
                          onClick={() => {
                            setMapStyleKey(s.id);
                            setMobileMapLayersOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all border ${
                            isActive ? s.activeStyle : 'text-gray-700 hover:bg-gray-50 border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <ItemIcon className={`w-4 h-4 ${s.color}`} />
                            <div className="text-left">
                              <span className="block font-semibold text-gray-900">{s.label}</span>
                              <span className="block text-[10px] text-gray-400">{s.desc}</span>
                            </div>
                          </div>
                          {isActive && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Dynamic Mesh Network Lines connecting each neighbor Street Lamp Pole to its Cluster Master Pole */}
              {showMeshLines && (
                <Source id="cluster-mesh-network" type="geojson" data={meshLinesGeoJson}>
                  <Layer
                    id="mesh-lines-glow"
                    type="line"
                    paint={{
                      'line-color': '#a855f7',
                      'line-width': 5,
                      'line-opacity': 0.4,
                    }}
                  />
                  <Layer
                    id="mesh-lines-layer"
                    type="line"
                    paint={{
                      'line-color': '#7c3aed',
                      'line-width': 2.5,
                      'line-opacity': 0.9,
                      'line-dasharray': [2, 2],
                    }}
                  />
                </Source>
              )}

              {/* Cluster Master Poles (Sensor Hub & Gateway Poles - Not Street Lamps) */}
              {gateways.map((gw) => {
                const isGatewayClusterSelected = clusterFilter === 'ALL' || gw.cluster_id === clusterFilter;
                const isSelected = selectedPoleId === gw.id || selectedPoleId === gw.pole_id;
                const isHovered = hoveredPole?.id === gw.id || hoveredPole?.pole_id === gw.pole_id;
                const canDrag = isRepositionMode || (isEditingCoords && isSelected);
                const gwDepthZ = Math.round((23.89 - Number(gw.lat)) * 10000);
                const gwZIndex = isSelected ? 500 : (isHovered ? 400 : gwDepthZ);

                return (
                  <Marker
                    key={gw.id}
                    longitude={Number(gw.lng)}
                    latitude={Number(gw.lat)}
                    anchor="bottom"
                    draggable={canDrag}
                    style={{ zIndex: gwZIndex }}
                    onDragEnd={(e) => handleGatewayDragEnd(gw.id, e.lngLat)}
                    onClick={(e) => {
                      e.originalEvent.stopPropagation();
                      focusOnPole(gw);
                    }}
                  >
                    <div
                      onMouseEnter={() => setHoveredPole(gw)}
                      onMouseLeave={() => setHoveredPole(null)}
                      className={`relative flex flex-col items-center group cursor-pointer overflow-visible transition-all duration-300 ${
                        canDrag ? 'cursor-grab active:cursor-grabbing' : ''
                      } ${
                        isGatewayClusterSelected ? 'opacity-100 scale-100' : 'opacity-80 scale-95'
                      } ${isSelected ? 'scale-125 -translate-y-1' : 'hover:scale-120 hover:-translate-y-1'}`}
                    >
                      {/* Drag Halo ring when in repositioning mode */}
                      {canDrag && (
                        <div className="absolute -top-1 w-11 h-11 rounded-full border-2 border-dashed border-purple-500 animate-spin-slow pointer-events-none" />
                      )}

                      {/* Clean Purple Teardrop Cluster Master Pole Pin */}
                      <div className="relative w-9 h-11 filter drop-shadow-md overflow-visible">
                        <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg" className="overflow-visible">
                          <path
                            d="M18 3C10.82 3 5 8.82 5 16C5 25.5 16.6 37.8 17.4 38.6C17.75 38.95 18.25 38.95 18.6 38.6C19.4 37.8 31 25.5 31 16C31 8.82 25.18 3 18 3Z"
                            fill="#8b5cf6"
                            stroke={isSelected ? '#1e1b4b' : '#ffffff'}
                            strokeWidth={isSelected ? '2' : '1.5'}
                            strokeLinejoin="round"
                          />
                          <circle cx="18" cy="16" r="9.5" fill="#ffffff" />
                        </svg>
                        <div className="absolute top-[7px] left-[9px] w-[18px] h-[18px] flex items-center justify-center pointer-events-none">
                          <Radio className="w-3.5 h-3.5 text-purple-600 stroke-[2]" />
                        </div>
                      </div>

                      {/* Pin Tip Ground Shadow */}
                      <div className="w-3 h-1 bg-black/25 rounded-full blur-[1px] -mt-0.5" />
                    </div>
                  </Marker>
                );
              })}

              {/* Smart Pole GIS Teardrop Pin Markers (ALL Street Lamps are Yellow/Amber) */}
              {mapPoles.map((pole) => {
                const isSelected = pole.pole_id === selectedPoleId;
                const isHovered = hoveredPole?.pole_id === pole.pole_id;
                const isLightOn = pole.latest_light_state || pole.is_on;
                const isTampered = pole.status === 'TAMPER/CRITICAL' || pole.latest_tamper_status;
                const canDrag = isRepositionMode || (isEditingCoords && isSelected);
                const isClusterMatch = clusterFilter === 'ALL' || pole.cluster_id === clusterFilter;
                const depthZIndex = Math.round((23.89 - Number(pole.latitude)) * 10000);
                const markerZIndex = isSelected ? 500 : (isHovered ? 400 : depthZIndex);

                // All street lamps are Yellow / Amber (or Red for Tamper alert)
                const pinColor = isTampered
                  ? '#ef4444' // Red for Tamper
                  : '#f59e0b'; // Vibrant Yellow / Amber for ALL Street Lamps

                return (
                  <Marker
                    key={pole.pole_id}
                    longitude={Number(pole.longitude)}
                    latitude={Number(pole.latitude)}
                    anchor="bottom"
                    draggable={canDrag}
                    style={{ zIndex: markerZIndex }}
                    onDragEnd={(e) => handleMarkerDragEnd(pole.pole_id, e.lngLat)}
                    onClick={(e) => {
                      e.originalEvent.stopPropagation();
                      focusOnPole(pole);
                    }}
                  >
                    <div
                      onMouseEnter={() => setHoveredPole(pole)}
                      onMouseLeave={() => setHoveredPole(null)}
                      className={`group relative flex flex-col items-center cursor-pointer transition-all duration-200 overflow-visible ${
                        canDrag ? 'cursor-grab active:cursor-grabbing' : ''
                      } ${isSelected ? 'scale-125 -translate-y-1' : 'hover:scale-120 hover:-translate-y-1'} ${
                        isClusterMatch ? 'opacity-100' : 'opacity-80'
                      }`}
                    >
                      {/* Drag Halo ring when in repositioning mode */}
                      {canDrag && (
                        <div className="absolute -top-1 w-11 h-11 rounded-full border-2 border-dashed border-indigo-500 animate-spin-slow pointer-events-none" />
                      )}

                      {/* Ambient Ground Glow when Light is ON (Warm Yellow Glow) */}
                      {isLightOn && (
                        <div className="absolute bottom-0 w-8 h-4 rounded-full bg-amber-400/35 blur-sm pointer-events-none -z-10" />
                      )}

                      {/* Tamper Warning Pulse underneath pin */}
                      {isTampered && (
                        <div className="absolute -top-1 w-11 h-11 rounded-full bg-rose-500/20 border border-rose-500/50 animate-ping pointer-events-none" />
                      )}

                      {/* Teardrop Pin Shape with White Inner Circular Core */}
                      <div className="relative w-9 h-11 filter drop-shadow-md overflow-visible">
                        <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg" className="overflow-visible">
                          {/* Teardrop Pin Path */}
                          <path
                            d="M18 3C10.82 3 5 8.82 5 16C5 25.5 16.6 37.8 17.4 38.6C17.75 38.95 18.25 38.95 18.6 38.6C19.4 37.8 31 25.5 31 16C31 8.82 25.18 3 18 3Z"
                            fill={pinColor}
                            stroke={isSelected ? '#1e1b4b' : '#ffffff'}
                            strokeWidth={isSelected ? '2' : '1.5'}
                            strokeLinejoin="round"
                          />
                          {/* Inner White Circle */}
                          <circle cx="18" cy="16" r="9.5" fill="#ffffff" />
                        </svg>

                        {/* Centered Status Icon inside the White Core */}
                        <div className="absolute top-[7px] left-[9px] w-[18px] h-[18px] flex items-center justify-center pointer-events-none">
                          {isTampered ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 animate-bounce" />
                          ) : isLightOn ? (
                            <Lightbulb className="w-3.5 h-3.5 text-amber-500 fill-amber-400 drop-shadow-xs" />
                          ) : (
                            <LightbulbOff className="w-3.5 h-3.5 text-slate-400 stroke-[1.75]" />
                          )}
                        </div>
                      </div>

                      {/* Pin Tip Ground Shadow */}
                      <div className="w-3 h-1 bg-black/25 rounded-full blur-[1px] -mt-0.5" />
                    </div>
                  </Marker>
                );
              })}

              {/* Global High-Z-Index Hover Tooltip (Never covered or clipped by sibling markers) */}
              {hoveredPole && (
                <Popup
                  longitude={Number(hoveredPole.longitude || hoveredPole.lng)}
                  latitude={Number(hoveredPole.latitude || hoveredPole.lat)}
                  offset={[0, -48]}
                  closeButton={false}
                  closeOnClick={false}
                  anchor="bottom"
                  maxWidth="none"
                >
                  <div className="bg-white/95 backdrop-blur-md border border-gray-200 px-3.5 py-2 rounded-2xl shadow-2xl flex flex-col gap-1 pointer-events-none whitespace-nowrap animate-in fade-in zoom-in-95 duration-100">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              hoveredPole.type === 'CLUSTER_MASTER_POLE'
                                ? '#8b5cf6'
                                : (hoveredPole.status === 'TAMPER/CRITICAL' || hoveredPole.latest_tamper_status)
                                ? '#ef4444'
                                : '#f59e0b',
                          }}
                        />
                        <span className="text-xs font-extrabold text-gray-900 tracking-tight">
                          {hoveredPole.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200 shrink-0">
                        {hoveredPole.cluster_id}
                      </span>
                    </div>

                    {hoveredPole.type === 'CLUSTER_MASTER_POLE' ? (
                      <span className="text-[10px] font-bold text-purple-700">
                        🛰️ Sensor Gateway Pole • 5 Neighbor Lamps Connected
                      </span>
                    ) : (
                      <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
                        <span className="font-bold text-amber-600">{hoveredPole.pole_id}</span>
                        <span>•</span>
                        <span className="text-gray-700">{hoveredPole.latest_voltage || 230}V</span>
                        <span>•</span>
                        <span className={hoveredPole.latest_light_state || hoveredPole.is_on ? 'text-emerald-600 font-semibold' : 'text-gray-400'}>
                          {hoveredPole.latest_light_state || hoveredPole.is_on
                            ? `${hoveredPole.latest_brightness ?? 100}% ON`
                            : 'OFF'}
                        </span>
                      </div>
                    )}
                  </div>
                </Popup>
              )}
            </Map>
          </div>
        )}

        {/* POLES TABLE VIEW TAB */}
        {navTab === 'POLES' && (
          <div className="flex-1 p-3 sm:p-6 pb-24 md:pb-6 overflow-y-auto bg-slate-50">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">Smart Pole Fleet Inventory</h2>
                  <p className="text-xs text-gray-500 font-medium">15 GIS assets operating across Uttara Sector 18 / Diabari</p>
                </div>
              </div>

              {/* Mobile Responsive Cards (< md) */}
              <div className="md:hidden space-y-3">
                {filteredPoles.map((p) => {
                  const isSelected = p.pole_id === selectedPoleId;
                  const isLightOn = p.latest_light_state || p.is_on;
                  const isTampered = p.status === 'TAMPER/CRITICAL' || p.latest_tamper_status;

                  return (
                    <div
                      key={p.pole_id}
                      onClick={() => focusOnPole(p)}
                      className={`p-4 rounded-2xl bg-white border transition-all cursor-pointer shadow-xs ${
                        isSelected ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${isTampered ? 'bg-rose-500 animate-ping' : isLightOn ? 'bg-amber-500' : 'bg-gray-300'}`} />
                          <span className="font-bold text-sm text-gray-900">{p.pole_id}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-600">
                            {p.cluster_id}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatchControl(p.pole_id, !isLightOn, isLightOn ? 0 : 100);
                          }}
                          className={`p-2 rounded-xl border text-xs transition-all ${
                            isLightOn
                              ? 'bg-amber-50 text-amber-700 border-amber-300'
                              : 'bg-gray-100 text-gray-700 border-gray-200'
                          }`}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      </div>

                      <p className="text-xs text-gray-500 mb-3 font-medium truncate">
                        {p.name} • <span className="font-mono text-[11px]">{Number(p.latitude)?.toFixed(4)}, {Number(p.longitude)?.toFixed(4)}</span>
                      </p>

                      <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-gray-100 text-xs">
                        <div className="bg-gray-50 p-2 rounded-xl border border-gray-100">
                          <span className="text-[10px] text-gray-400 block font-medium">Battery</span>
                          <span className="font-bold text-emerald-600 font-mono">{p.latest_battery_soc || 90}%</span>
                        </div>
                        <div className="bg-gray-50 p-2 rounded-xl border border-gray-100">
                          <span className="text-[10px] text-gray-400 block font-medium">Power</span>
                          <span className="font-bold text-gray-800 font-mono">{p.latest_power_watts || 195}W</span>
                        </div>
                        <div className="bg-gray-50 p-2 rounded-xl border border-gray-100">
                          <span className="text-[10px] text-gray-400 block font-medium">State</span>
                          <span className={`font-bold font-mono ${isLightOn ? 'text-amber-600' : 'text-gray-400'}`}>
                            {isLightOn ? `${p.latest_brightness ?? 100}%` : 'OFF'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop & Tablet Full Table (>= md) */}
              <div className="hidden md:block bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs text-gray-700">
                  <thead className="bg-gray-50 text-gray-500 uppercase font-bold text-[10px] tracking-wider border-b border-gray-200">
                    <tr>
                      <th className="py-3.5 px-4">Pole ID & Name</th>
                      <th className="py-3.5 px-4">Cluster & Gateway</th>
                      <th className="py-3.5 px-4">Coordinates</th>
                      <th className="py-3.5 px-4">Battery SoC</th>
                      <th className="py-3.5 px-4">Active Power</th>
                      <th className="py-3.5 px-4">Light State</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredPoles.map((p) => {
                      const isSelected = p.pole_id === selectedPoleId;
                      const isLightOn = p.latest_light_state || p.is_on;
                      const isTampered = p.status === 'TAMPER/CRITICAL' || p.latest_tamper_status;

                      return (
                        <tr
                          key={p.pole_id}
                          onClick={() => focusOnPole(p)}
                          className={`hover:bg-gray-50/80 cursor-pointer transition-colors ${
                            isSelected ? 'bg-amber-50/60' : ''
                          }`}
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-gray-900 flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${isTampered ? 'bg-rose-500 animate-ping' : isLightOn ? 'bg-amber-500' : 'bg-gray-300'}`} />
                              {p.pole_id}
                            </div>
                            <div className="text-[11px] text-gray-500">{p.name}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="text-gray-800 font-semibold">{p.cluster_id}</div>
                            <div className="text-[10px] text-indigo-600 font-medium">{p.gateway_id}</div>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[11px] text-gray-500">
                            {Number(p.latitude)?.toFixed(4)}, {Number(p.longitude)?.toFixed(4)}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-full"
                                  style={{ width: `${p.latest_battery_soc || 90}%` }}
                                />
                              </div>
                              <span className="font-mono text-emerald-600 font-bold">{p.latest_battery_soc || 90}%</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-gray-800 font-semibold">
                            {p.latest_power_watts || 195} W
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                isLightOn
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-gray-100 text-gray-600 border border-gray-200'
                              }`}
                            >
                              {isLightOn ? `${p.latest_brightness ?? 100}% ON` : 'OFF'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                dispatchControl(p.pole_id, !isLightOn, isLightOn ? 0 : 100);
                              }}
                              className={`p-1.5 rounded-lg border text-xs transition-all ${
                                isLightOn
                                  ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                                  : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                              }`}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ALERTS TAB */}
        {navTab === 'ALERTS' && (
          <div className="flex-1 p-3 sm:p-6 pb-24 md:pb-6 overflow-y-auto bg-slate-50">
            <div className="max-w-4xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">ISA-18.2 Alarm Lifecycle</h2>
                  <p className="text-xs text-gray-500 font-medium">Stateful telemetry threshold & physical tamper events</p>
                </div>
                <button
                  onClick={() => fetch(`${API_BASE}/api/alerts/resolve-all`, { method: 'POST' }).then(() => fetchData())}
                  className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-800 rounded-xl border border-gray-200 transition-all flex items-center justify-center gap-1.5 shadow-xs shrink-0 self-start sm:self-auto"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Resolve All Alarms
                </button>
              </div>

              <div className="space-y-3">
                {alerts.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 bg-white rounded-2xl border border-gray-200">
                    <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                    No active alarm anomalies in system.
                  </div>
                ) : (
                  alerts.map((a) => (
                    <div
                      key={a.id}
                      className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4 transition-all bg-white ${
                        a.status === 'ACTIVE'
                          ? a.severity === 'CRITICAL'
                            ? 'border-rose-300 shadow-sm text-rose-900'
                            : 'border-amber-300 shadow-sm text-amber-900'
                          : 'border-gray-200 text-gray-400'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-2 rounded-xl border shrink-0 ${
                            a.status === 'ACTIVE'
                              ? a.severity === 'CRITICAL'
                                ? 'bg-rose-50 border-rose-200 text-rose-600'
                                : 'bg-amber-50 border-amber-200 text-amber-600'
                              : 'bg-gray-100 border-gray-200 text-gray-400'
                          }`}
                        >
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-bold text-sm text-gray-900">{a.pole_id}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-gray-100 border border-gray-200 text-gray-700">
                              {a.alert_type}
                            </span>
                            <span className="text-[10px] text-gray-400">{formatTime(a.last_seen_at || a.created_at)}</span>
                          </div>
                          <p className="text-xs text-gray-600">{a.message}</p>
                        </div>
                      </div>

                      {a.status === 'ACTIVE' && (
                        <button
                          onClick={() => handleResolveAlerts(a.pole_id)}
                          className="w-full sm:w-auto justify-center px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-1 shrink-0 shadow-xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Clear Alert
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ANALYTICS TAB */}
        {navTab === 'ANALYTICS' && (
          <div className="flex-1 p-3 sm:p-6 pb-24 md:pb-6 overflow-y-auto bg-slate-50">
            <div className="max-w-5xl mx-auto space-y-6">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">Energy & Microgrid Analytics</h2>
                <p className="text-xs text-gray-500 font-medium">Microgrid cluster distribution and solar power generation metrics</p>
              </div>

              {/* Cluster Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {gateways.map((gw) => {
                  const clusterPoles = poles.filter((p) => p.cluster_id === gw.cluster_id);
                  const clusterLoad = (
                    clusterPoles.reduce((s, p) => s + Number(p.latest_power_watts || 190), 0) / 1000
                  ).toFixed(2);
                  const clusterAvgSoc = clusterPoles.length > 0
                    ? Math.round(clusterPoles.reduce((s, p) => s + Number(p.latest_battery_soc || 90), 0) / clusterPoles.length)
                    : 0;

                  return (
                    <div key={gw.id} className="p-4 sm:p-5 rounded-2xl bg-white border border-gray-200 shadow-xs">
                      <div className="flex items-center justify-between mb-2 sm:mb-3">
                        <span className="text-xs font-bold text-indigo-600">{gw.id}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{clusterPoles.length} Nodes</span>
                      </div>
                      <h3 className="text-sm font-bold text-gray-900 mb-3 sm:mb-4 truncate">{gw.cluster_name}</h3>
                      <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs">
                        <div className="bg-gray-50 p-2.5 sm:p-3 rounded-xl border border-gray-200/80">
                          <span className="text-[10px] text-gray-400 block mb-0.5 font-medium">Active Load</span>
                          <span className="font-bold text-amber-600 font-mono text-xs sm:text-sm">{clusterLoad} kW</span>
                        </div>
                        <div className="bg-gray-50 p-2.5 sm:p-3 rounded-xl border border-gray-200/80">
                          <span className="text-[10px] text-gray-400 block mb-0.5 font-medium">Avg Battery SoC</span>
                          <span className="font-bold text-emerald-600 font-mono text-xs sm:text-sm">{clusterAvgSoc}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* MOBILE BOTTOM NAVIGATION BAR (Phones only) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-md border-t border-gray-200 z-[1200] flex items-center justify-around px-2 shadow-lg">
          <button
            onClick={() => setNavTab('MAP')}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
              navTab === 'MAP' ? 'text-amber-600 font-bold' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <MapPin className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Map</span>
          </button>
          <button
            onClick={() => setNavTab('POLES')}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
              navTab === 'POLES' ? 'text-amber-600 font-bold' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <TableIcon className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Fleet</span>
          </button>
          <button
            onClick={() => setNavTab('ALERTS')}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl relative transition-all ${
              navTab === 'ALERTS' ? 'text-amber-600 font-bold' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Bell className="w-5 h-5" />
            {tamperedCount > 0 && (
              <span className="absolute top-1 right-3 w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            )}
            <span className="text-[10px] mt-0.5">Alerts</span>
          </button>
          <button
            onClick={() => setNavTab('ANALYTICS')}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
              navTab === 'ANALYTICS' ? 'text-amber-600 font-bold' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Activity className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Analytics</span>
          </button>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center py-1 px-3 rounded-xl text-gray-500 hover:text-gray-900 transition-all"
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Menu</span>
          </button>
        </nav>
      </main>

      {/* Backdrop for mobile when detail drawer is open */}
      {navTab === 'MAP' && drawerOpen && selectedPole && (
        <div
          className="sm:hidden fixed inset-0 bg-black/40 backdrop-blur-xs z-[99998]"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* 3. RIGHT SLIDING DETAIL DRAWER — CLEAN LIGHT CHARGEHUB PANEL */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[390px] max-w-full bg-white border-l border-gray-200 shadow-2xl flex flex-col z-[99999] transition-transform duration-300 ease-out ${
          navTab === 'MAP' && drawerOpen && selectedPole ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
      >
        {selectedPole && (
          <div className="flex-1 flex flex-col h-full overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>

            {/* ── ACCENT HEADER BAR ── */}
            <div className={`px-5 py-3.5 flex items-center justify-between shrink-0 ${
              selectedPole.status === 'TAMPER/CRITICAL' || selectedPole.latest_tamper_status
                ? 'bg-gradient-to-r from-rose-500 to-rose-600'
                : 'bg-gradient-to-r from-amber-500 to-amber-600'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <Lightbulb className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">{selectedPole.pole_id}</h3>
                  <span className="text-[11px] text-amber-100 font-mono">
                    {Number(selectedPole.latitude)?.toFixed(5)}, {Number(selectedPole.longitude)?.toFixed(5)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleCopyCoords(selectedPole.latitude, selectedPole.longitude)}
                  className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-all"
                  title="Copy Coordinates"
                >
                  {copiedCoords ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ── DEVICE SUMMARY CARD ── */}
            <div className="p-4 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h4 className="text-sm font-bold text-gray-900">{selectedPole.name}</h4>
                  <p className="text-[11px] text-gray-500 font-medium">
                    {selectedPole.type === 'CLUSTER_MASTER_POLE'
                      ? 'Cluster Master Pole • Sensor Concentrator & Server Uplink'
                      : selectedPole.zone || 'Uttara Sector 18, Dhaka 1230'}
                  </p>
                </div>
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                    selectedPole.type === 'CLUSTER_MASTER_POLE'
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : selectedPole.status === 'TAMPER/CRITICAL' || selectedPole.latest_tamper_status
                      ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {selectedPole.type === 'CLUSTER_MASTER_POLE'
                    ? 'SENSOR GATEWAY'
                    : selectedPole.status === 'TAMPER/CRITICAL' || selectedPole.latest_tamper_status
                    ? 'TAMPER'
                    : 'ONLINE'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-gray-500 font-medium">
                <span className="font-bold text-amber-600">{selectedPole.cluster_id}</span>
                <span>•</span>
                {selectedPole.type === 'CLUSTER_MASTER_POLE' ? (
                  <span className="text-purple-700 font-semibold">4G LTE / MQTT Uplink Active</span>
                ) : (
                  <span className="text-gray-600">Routes via {selectedPole.gateway_id}</span>
                )}
                <span>•</span>
                <span>{selectedPole.type === 'CLUSTER_MASTER_POLE' ? '5 Connected Lamps' : `LiFePO4 ${selectedPole.battery_capacity_ah || 120}Ah`}</span>
              </div>
            </div>

            {/* ── CLUSTER MASTER POLE SENSOR CONCENTRATOR VIEW ── */}
            {selectedPole.type === 'CLUSTER_MASTER_POLE' ? (
              <div className="p-4 space-y-4 border-b border-gray-100">
                {/* Connected Neighbor Poles Strip */}
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-2">
                    Connected Neighbor Street Lamps (5 Nodes)
                  </span>
                  <div className="grid grid-cols-1 gap-1.5">
                    {poles
                      .filter((p) => p.cluster_id === selectedPole.cluster_id)
                      .map((np) => (
                        <div
                          key={np.pole_id}
                          onClick={() => focusOnPole(np)}
                          className="flex items-center justify-between p-2 rounded-xl bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50/50 cursor-pointer transition-all shadow-2xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="text-xs font-bold text-gray-900">{np.pole_id}</span>
                            <span className="text-[10px] text-gray-500 truncate max-w-[140px]">{np.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-mono">
                            <span className={np.latest_light_state ? 'text-amber-600 font-bold' : 'text-gray-400'}>
                              {np.latest_light_state ? `${np.latest_brightness ?? 100}% ON` : 'OFF'}
                            </span>
                            <span className="text-emerald-600 font-bold">{np.latest_battery_soc || 90}% SoC</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Environmental & Uplink Sensors */}
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-2">
                    Master Pole Sensors & Telemetry Stream
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                      <span className="text-[10px] text-gray-500 font-medium block">Ambient Lux</span>
                      <span className="text-sm font-bold text-gray-900 font-mono">18.4 lx</span>
                    </div>
                    <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                      <span className="text-[10px] text-gray-500 font-medium block">Weather Temp</span>
                      <span className="text-sm font-bold text-gray-900 font-mono">29.2 °C</span>
                    </div>
                    <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                      <span className="text-[10px] text-gray-500 font-medium block">Server Latency</span>
                      <span className="text-sm font-bold text-emerald-600 font-mono">18 ms</span>
                    </div>
                    <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                      <span className="text-[10px] text-gray-500 font-medium block">Mesh RF Health</span>
                      <span className="text-sm font-bold text-purple-700 font-mono">-64 dBm</span>
                    </div>
                  </div>
                </div>

                {/* Cluster Actions */}
                <div className="pt-2">
                  <button
                    onClick={() => pushToast('Mesh Synchronized', `📡 Telemetry burst pulled from all 5 neighbors into ${selectedPole.pole_id}`, 'success')}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Sync Cluster Telemetry to Server</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* ── CHARGEHUB-STYLE 2x2 METRIC GRID FOR STREET LAMPS ── */}
                <div className="p-4 border-b border-gray-100">
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Active Power Box */}
                    <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-xs hover:border-gray-300 transition-colors">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-0.5">
                        Active Power
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-extrabold text-gray-900 font-mono">
                          {selectedPole.latest_power_watts || 195.0}
                        </span>
                        <span className="text-[10px] text-gray-400 font-semibold">W</span>
                      </div>
                      <span className="text-[10px] text-gray-500 mt-1 block">
                        Line: {selectedPole.latest_voltage || 230}V
                      </span>
                    </div>

                    {/* Energy Consumption Box */}
                    <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-xs hover:border-gray-300 transition-colors">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-0.5">
                        Energy Meter
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-extrabold text-gray-900 font-mono">
                          {selectedPole.latest_energy_kwh || 0.125}
                        </span>
                        <span className="text-[10px] text-gray-400 font-semibold">kWh</span>
                      </div>
                      <span className="text-[10px] text-gray-500 mt-1 block">
                        Current: {selectedPole.latest_current || 0.85}A
                      </span>
                    </div>

                    {/* Battery SoC Box */}
                    <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-xs hover:border-gray-300 transition-colors">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-0.5">
                        Battery SoC
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-extrabold text-emerald-600 font-mono">
                          {selectedPole.latest_battery_soc || 90}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${selectedPole.latest_battery_soc || 90}%` }}
                        />
                      </div>
                    </div>

                    {/* Estimated Backup Runtime */}
                    <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-xs hover:border-gray-300 transition-colors">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-0.5">
                        Backup Time
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-extrabold text-gray-900 font-mono">
                          {formatRuntime(selectedPole.latest_estimated_runtime_minutes || 480)}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-500 mt-1 block">
                        Temp: {selectedPole.latest_battery_temp || 28.5}°C
                      </span>
                    </div>
                  </div>

                  {/* Secondary Sensor Strip */}
                  <div className="grid grid-cols-3 gap-2 mt-2.5 pt-2.5 border-t border-gray-100 text-center">
                    <div className="p-2 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="text-[10px] text-gray-400 block font-medium">Battery Volt</span>
                      <span className="text-xs font-bold text-gray-800 font-mono">{selectedPole.latest_battery_voltage || 14.1}V</span>
                    </div>
                    <div className="p-2 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="text-[10px] text-gray-400 block font-medium">Battery Curr</span>
                      <span className={`text-xs font-bold font-mono ${(selectedPole.latest_battery_current || -1.8) >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {selectedPole.latest_battery_current || -1.8}A
                      </span>
                    </div>
                    <div className="p-2 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="text-[10px] text-gray-400 block font-medium">Ambient Lux</span>
                      <span className="text-xs font-bold text-gray-800 font-mono">{selectedPole.latest_ambient_light_lux || 15.0} lx</span>
                    </div>
                  </div>
                </div>

                {/* ── LIGHT ACTUATOR & DIMMER CONTROL ── */}
                <div className="p-4 border-b border-gray-100">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-2.5">
                    Actuator & Dimmer Control
                  </span>

                  {/* Power Switch Row */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-200 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                        selectedPole.latest_light_state || selectedPole.is_on
                          ? 'bg-amber-100 text-amber-600 border-amber-300'
                          : 'bg-gray-200 text-gray-400 border-gray-300'
                      }`}>
                        <Power className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-gray-900 block">Smart Luminaire</span>
                        <span className="text-[10px] text-gray-500">
                          {selectedPole.latest_light_state || selectedPole.is_on ? 'Currently Illuminating' : 'Standby / Charging'}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={handleToggleLight}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                        selectedPole.latest_light_state || selectedPole.is_on ? 'bg-amber-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          selectedPole.latest_light_state || selectedPole.is_on ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Brightness Slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 font-medium">Brightness Level</span>
                      <span className="font-mono font-bold text-amber-600">
                        {dimmerValues[selectedPole.pole_id] !== undefined
                          ? dimmerValues[selectedPole.pole_id]
                          : (selectedPole.latest_brightness ?? (selectedPole.latest_light_state ? 100 : 0))}%
                      </span>
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={
                        dimmerValues[selectedPole.pole_id] !== undefined
                          ? dimmerValues[selectedPole.pole_id]
                          : (selectedPole.latest_brightness ?? (selectedPole.latest_light_state ? 100 : 0))
                      }
                      onChange={handleDimmerChange}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />

                    {/* Preset Brightness Pills */}
                    <div className="flex gap-1.5 pt-1">
                      {[
                        { label: '0%', val: 0 },
                        { label: '30%', val: 30 },
                        { label: '50%', val: 50 },
                        { label: '80%', val: 80 },
                        { label: '100%', val: 100 },
                      ].map((preset) => (
                        <button
                          key={preset.val}
                          onClick={() => {
                            setDimmerValues((prev) => ({ ...prev, [selectedPole.pole_id]: preset.val }));
                            dispatchControl(selectedPole.pole_id, preset.val > 0, preset.val);
                          }}
                          className={`flex-1 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                            (dimmerValues[selectedPole.pole_id] ?? 100) === preset.val
                              ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── COORDINATES & POSITION MANAGER ── */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  GPS Coordinates
                </span>
                <button
                  onClick={() => setIsEditingCoords((e) => !e)}
                  className={`text-[10px] px-2 py-0.5 rounded-md font-semibold transition-all ${
                    isEditingCoords
                      ? 'bg-amber-500 text-white font-bold'
                      : 'text-amber-600 hover:text-amber-700 font-bold'
                  }`}
                >
                  {isEditingCoords ? 'Done' : 'Edit Coords'}
                </button>
              </div>

              {isEditingCoords ? (
                <div className="space-y-2.5 animate-in fade-in">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-400 block mb-0.5">Latitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={coordsInput.lat}
                        onChange={(e) => setCoordsInput((prev) => ({ ...prev, lat: e.target.value }))}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-mono text-gray-900 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 block mb-0.5">Longitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={coordsInput.lng}
                        onChange={(e) => setCoordsInput((prev) => ({ ...prev, lng: e.target.value }))}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-mono text-gray-900 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsPickingCoordsOnMap(true);
                        pushToast('Map Click Mode', `📍 Click on the map to set coordinates for ${selectedPole.pole_id}`, 'info');
                      }}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                        isPickingCoordsOnMap
                          ? 'bg-amber-50 text-amber-700 border-amber-300 animate-pulse'
                          : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                      }`}
                    >
                      <Target className="w-3 h-3" />
                      <span>{isPickingCoordsOnMap ? 'Click map...' : 'Pick on Map'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveManualCoords}
                      className="flex-1 py-1.5 px-2 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Save className="w-3 h-3" />
                      <span>Save</span>
                    </button>
                    {selectedPole.type !== 'CLUSTER_MASTER_POLE' && (
                      <button
                        type="button"
                        onClick={() => handleDeletePole(selectedPole.pole_id)}
                        className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-gray-200"
                        title="Delete Pole"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 border border-gray-200 text-xs">
                  <div className="flex items-center gap-1.5 text-gray-700 font-mono text-[11px]">
                    <MapPin className="w-3.5 h-3.5 text-amber-500" />
                    <span>{Number(selectedPole.latitude)?.toFixed(5)}, {Number(selectedPole.longitude)?.toFixed(5)}</span>
                  </div>
                  <button
                    onClick={() => handleCopyCoords(selectedPole.latitude, selectedPole.longitude)}
                    className="text-[10px] text-gray-500 hover:text-gray-900 font-semibold"
                  >
                    {copiedCoords ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}
            </div>

            {/* ── MONITORED-STYLE MINI TELEMETRY CHART ── */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Live Telemetry Sparkline
                </span>
                <span className="text-[10px] text-gray-400 font-mono">Rolling 30 Frames</span>
              </div>

              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={telemetryHistory} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorVoltage" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorSoc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="time" stroke="#94a3b8" fontSize={9} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        fontSize: '11px',
                        color: '#1e293b',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="battery_soc"
                      name="SoC (%)"
                      stroke="#10b981"
                      strokeWidth={1.5}
                      fillOpacity={1}
                      fill="url(#colorSoc)"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="power"
                      name="Power (W)"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      fillOpacity={1}
                      fill="url(#colorVoltage)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── EMERGENCY ACTIONS FOOTER ── */}
            <div className="p-4 mt-auto">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleTriggerTamper(selectedPole.pole_id)}
                  className="py-2.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold rounded-xl border border-rose-200 transition-all flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Trigger Tamper
                </button>
                <button
                  onClick={() => handleResolveAlerts(selectedPole.pole_id)}
                  className="py-2.5 px-3 bg-gray-50 hover:bg-gray-100 text-gray-800 text-[11px] font-bold rounded-xl border border-gray-200 transition-all flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                  Restore Hardware
                </button>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* 4. ADD NEW CUSTOM POLE MODAL */}
      {isAddingPole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
                  <PlusCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Add Custom Smart Pole</h3>
                  <p className="text-[11px] text-gray-500 font-medium">Deploy a new IoT pole node with custom GPS position</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddingPole(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewPole} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-600 block mb-1 font-semibold">Pole ID *</label>
                  <input
                    type="text"
                    required
                    value={newPoleForm.pole_id}
                    onChange={(e) => setNewPoleForm((p) => ({ ...p, pole_id: e.target.value.toUpperCase() }))}
                    placeholder="e.g. POLE-016"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-mono text-gray-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-gray-600 block mb-1 font-semibold">Pole Name</label>
                  <input
                    type="text"
                    value={newPoleForm.name}
                    onChange={(e) => setNewPoleForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Lake Promenade North"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-600 block mb-1 font-semibold">Cluster Assignment</label>
                  <select
                    value={newPoleForm.cluster_id}
                    onChange={(e) => {
                      const cid = e.target.value;
                      const gw = cid === 'CLUSTER-A' ? 'GATEWAY-01' : cid === 'CLUSTER-B' ? 'GATEWAY-02' : 'GATEWAY-03';
                      setNewPoleForm((p) => ({ ...p, cluster_id: cid, gateway_id: gw }));
                    }}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-amber-500 font-medium"
                  >
                    <option value="CLUSTER-A">Cluster A (Metro Rail)</option>
                    <option value="CLUSTER-B">Cluster B (Sonargaon Janapath)</option>
                    <option value="CLUSTER-C">Cluster C (Diabari Lake)</option>
                  </select>
                </div>
                <div>
                  <label className="text-gray-600 block mb-1 font-semibold">Gateway Hub</label>
                  <input
                    type="text"
                    disabled
                    value={newPoleForm.gateway_id}
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-gray-500 font-mono font-medium"
                  />
                </div>
              </div>

              {/* GPS Coordinates & Map Placement Helper */}
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-800 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-amber-500" /> GPS Placement Coordinates
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      pushToast('Map Placement Mode', '📍 Click anywhere on the map to set the pole coordinates', 'info');
                    }}
                    className="text-[10px] text-amber-600 hover:text-amber-700 flex items-center gap-1 font-bold"
                  >
                    <Target className="w-3 h-3" />
                    <span>Click on Map to Place</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5 font-medium">Latitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      required
                      value={newPoleForm.latitude}
                      onChange={(e) => setNewPoleForm((p) => ({ ...p, latitude: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 font-mono text-gray-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5 font-medium">Longitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      required
                      value={newPoleForm.longitude}
                      onChange={(e) => setNewPoleForm((p) => ({ ...p, longitude: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 font-mono text-gray-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-600 block mb-1 font-semibold">Zone Description</label>
                  <input
                    type="text"
                    value={newPoleForm.zone}
                    onChange={(e) => setNewPoleForm((p) => ({ ...p, zone: e.target.value }))}
                    placeholder="e.g. Diabari Lake Avenue"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-amber-500 font-medium"
                  />
                </div>
                <div>
                  <label className="text-gray-600 block mb-1 font-semibold">Battery Capacity (Ah)</label>
                  <input
                    type="number"
                    value={newPoleForm.battery_capacity_ah}
                    onChange={(e) => setNewPoleForm((p) => ({ ...p, battery_capacity_ah: parseInt(e.target.value, 10) || 120 }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-mono text-gray-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAddingPole(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Deploy Pole</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. TOAST NOTIFICATIONS STACK — Mobile Responsive & Clean */}
      <div
        className={`fixed bottom-20 md:bottom-6 z-40 flex flex-col-reverse gap-2.5 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-sm pointer-events-none transition-all duration-300 ease-out ${
          navTab === 'MAP' && drawerOpen && selectedPole ? 'sm:right-[410px]' : 'sm:right-6'
        }`}
      >
        {toastStack.map((toast) => {
          const isDanger = toast.type === 'danger';
          const isSuccess = toast.type === 'success';

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto p-3.5 rounded-2xl bg-white/95 backdrop-blur-md border border-gray-200 shadow-xl flex items-start justify-between gap-3 animate-in slide-in-from-bottom-3 duration-200 ${
                isDanger
                  ? 'border-l-4 border-l-rose-500 shadow-rose-500/10'
                  : isSuccess
                  ? 'border-l-4 border-l-emerald-500 shadow-emerald-500/10'
                  : 'border-l-4 border-l-amber-500 shadow-amber-500/10'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 border ${
                    isDanger
                      ? 'bg-rose-50 text-rose-600 border-rose-200'
                      : isSuccess
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      : 'bg-amber-50 text-amber-600 border-amber-200'
                  }`}
                >
                  {isDanger ? (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  ) : isSuccess ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Bell className="w-3.5 h-3.5" />
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-gray-900">{toast.title}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{toast.time}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{toast.msg}</p>
                </div>
              </div>

              <button
                onClick={() => dismissToast(toast.id)}
                className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1 rounded-lg transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
