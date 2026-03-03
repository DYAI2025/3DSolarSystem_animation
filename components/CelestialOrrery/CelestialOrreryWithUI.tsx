// ═══════════════════════════════════════════════════════════════════════════════
// CELESTIAL ORRERY WITH UI
// Vollständige Komponente mit Controls, Tooltip, View-Toggle, Zeitsteuerung
// ═══════════════════════════════════════════════════════════════════════════════

'use client';

import React, { useRef, useState, useCallback } from 'react';
import { CelestialOrreryCore } from './CelestialOrreryCore';
import { CITIES } from '../../lib/astronomy/data';
import type { CelestialOrreryAPI, ViewMode, HoveredObject, CityData } from '../../lib/astronomy/types';

// ─── Inline-Styles (kein Tailwind nötig) ─────────────────────────────────────
const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background:    'rgba(5, 10, 20, 0.75)',
  backdropFilter: 'blur(14px)',
  border:        '1px solid rgba(100, 140, 200, 0.18)',
  borderRadius:  '10px',
  color:         '#C8D8F0',
  fontFamily:    "'SF Mono', 'Fira Code', monospace",
  fontSize:      '12px',
  ...extra,
});

const btn = (active?: boolean): React.CSSProperties => ({
  padding:        '6px 14px',
  borderRadius:   '6px',
  border:         active ? '1px solid #D4AF37' : '1px solid rgba(100,140,200,0.25)',
  background:     active ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
  color:          active ? '#D4AF37' : '#8AAABB',
  cursor:         'pointer',
  fontSize:       '11px',
  fontFamily:     "'SF Mono', monospace",
  transition:     'all 0.2s',
  letterSpacing:  '0.5px',
});

// ─── Speed-Optionen ───────────────────────────────────────────────────────────
const SPEEDS = [
  { label: '1×',    value: 86400 * 0.01 },
  { label: '1d/s',  value: 86400 },
  { label: '7d/s',  value: 86400 * 7 },
  { label: '30d/s', value: 86400 * 30 },
  { label: '1J/s',  value: 86400 * 365 },
];

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  initialDate?:    Date;
  initialViewMode?: ViewMode;
  onApiReady?:     (api: CelestialOrreryAPI) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
export function CelestialOrreryWithUI({ initialDate, initialViewMode = 'orrery', onApiReady }: Props) {
  const apiRef   = useRef<CelestialOrreryAPI | null>(null);

  const [viewMode,    setViewMode]    = useState<ViewMode>(initialViewMode);
  const [isPlaying,   setIsPlaying]   = useState(true);
  const [speedIdx,    setSpeedIdx]    = useState(1);
  const [currentDate, setCurrentDate] = useState<Date>(initialDate ?? new Date());
  const [hovered,     setHovered]     = useState<HoveredObject | null>(null);
  const [showOrbits,  setShowOrbits]  = useState(true);
  const [showCons,    setShowCons]    = useState(true);
  const [showConNames,setShowConNames]= useState(true);
  const [selectedCity,setSelectedCity]= useState<CityData>(CITIES[0]);
  const [cityOpen,    setCityOpen]    = useState(false);

  // Geburtshimmel-State
  const [birthMode,   setBirthMode]   = useState(false);
  const [birthDate,   setBirthDate]   = useState('2000-01-01');
  const [birthTime,   setBirthTime]   = useState('12:00');
  const [birthCity,   setBirthCity]   = useState<CityData>(CITIES[0]);

  // ── API-Callbacks ──────────────────────────────────────────────────────────
  const handleApiReady = useCallback((api: CelestialOrreryAPI) => {
    apiRef.current = api;
    onApiReady?.(api);
  }, [onApiReady]);

  const togglePlay = () => {
    const api = apiRef.current;
    if (!api) return;
    api.togglePlayPause();
    setIsPlaying(p => !p);
  };

  const handleSpeedChange = (idx: number) => {
    setSpeedIdx(idx);
    apiRef.current?.setSpeed(SPEEDS[idx].value);
  };

  const handleViewToggle = () => {
    const next: ViewMode = viewMode === 'orrery' ? 'planetarium' : 'orrery';
    apiRef.current?.setViewMode(next);
    setViewMode(next);
  };

  const handleToday = () => {
    const now = new Date();
    apiRef.current?.setDate(now);
    setCurrentDate(now);
  };

  const handleCitySelect = (city: CityData) => {
    setSelectedCity(city);
    apiRef.current?.setObserverLocation(city.lat, city.lon);
    setCityOpen(false);
  };

  const handleBirthChart = () => {
    if (!apiRef.current) return;
    const city = birthCity;
    apiRef.current.showBirthChart(birthDate, birthTime, city);
    setViewMode('planetarium');
    setBirthMode(false);
  };

  const handleOrbitToggle = () => {
    const next = !showOrbits;
    setShowOrbits(next);
    apiRef.current?.setShowOrbits(next);
  };
  const handleConsToggle = () => {
    const next = !showCons;
    setShowCons(next);
    apiRef.current?.setShowConstellations(next);
  };
  const handleConNamesToggle = () => {
    const next = !showConNames;
    setShowConNames(next);
    apiRef.current?.setShowConstellationNames(next);
  };

  // ── Datum formatieren ──────────────────────────────────────────────────────
  const dateStr = currentDate.toLocaleDateString('de-DE', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#000' }}>

      {/* ── 3D Canvas ───────────────────────────────────────────────────────── */}
      <CelestialOrreryCore
        initialDate={initialDate}
        initialViewMode={initialViewMode}
        initialSpeed={SPEEDS[speedIdx].value}
        showOrbits={showOrbits}
        showConstellations={showCons}
        showConstellationNames={showConNames}
        observerLatitude={selectedCity.lat}
        observerLongitude={selectedCity.lon}
        onApiReady={handleApiReady}
        onViewModeChange={setViewMode}
        onDateChange={setCurrentDate}
        style={{ width: '100%', height: '100%' }}
      />

      {/* ── TOP-LEFT: Datum & Modus ──────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 18, left: 18,
        ...glass({ padding: '10px 16px', minWidth: 190 }),
      }}>
        <div style={{ color: '#D4AF37', fontSize: 11, letterSpacing: 2, marginBottom: 4 }}>
          {viewMode === 'orrery' ? '☉ SONNENSYSTEM' : '✦ PLANETARIUM'}
        </div>
        <div style={{ fontSize: 15, fontWeight: 300, color: '#E8E8F0' }}>{dateStr}</div>
        <div style={{ fontSize: 10, color: '#667788', marginTop: 2 }}>
          {selectedCity.name} · {selectedCity.lat.toFixed(2)}° N
        </div>
      </div>

      {/* ── TOP-RIGHT: View-Toggle & Schnellaktionen ──────────────────────────── */}
      <div style={{
        position: 'absolute', top: 18, right: 18,
        display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end',
      }}>
        {/* View-Toggle */}
        <div style={glass({ padding: '4px', display: 'flex', gap: 4 })}>
          <button
            style={btn(viewMode === 'orrery')}
            onClick={() => { if (viewMode !== 'orrery') handleViewToggle(); }}
          >
            ☉ ORRERY
          </button>
          <button
            style={btn(viewMode === 'planetarium')}
            onClick={() => { if (viewMode !== 'planetarium') handleViewToggle(); }}
          >
            ✦ HIMMEL
          </button>
        </div>

        {/* Optionen */}
        <div style={glass({ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 })}>
          {viewMode === 'orrery' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={showOrbits} onChange={handleOrbitToggle}
                style={{ accentColor: '#D4AF37' }} />
              <span>Orbits</span>
            </label>
          )}
          {viewMode === 'planetarium' && (<>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={showCons} onChange={handleConsToggle}
                style={{ accentColor: '#D4AF37' }} />
              <span>Sternbild-Linien</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={showConNames} onChange={handleConNamesToggle}
                style={{ accentColor: '#D4AF37' }} />
              <span>Sternbild-Namen</span>
            </label>
          </>)}
        </div>
      </div>

      {/* ── BOTTOM: Zeitsteuerung ─────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        ...glass({ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }),
      }}>
        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          style={{
            ...btn(),
            width: 36, height: 36, padding: 0, fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* Separator */}
        <div style={{ width: 1, height: 24, background: 'rgba(100,140,200,0.2)' }} />

        {/* Speed-Buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          {SPEEDS.map((s, i) => (
            <button key={s.label} style={btn(i === speedIdx)} onClick={() => handleSpeedChange(i)}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 24, background: 'rgba(100,140,200,0.2)' }} />

        {/* Heute-Button */}
        <button style={btn()} onClick={handleToday}>⊕ HEUTE</button>
      </div>

      {/* ── BOTTOM-LEFT: Standort & Geburtshimmel ────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 20, left: 18,
        display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start',
      }}>
        {/* Stadtauswahl */}
        <div style={{ position: 'relative' }}>
          <button style={btn()} onClick={() => setCityOpen(o => !o)}>
            📍 {selectedCity.name}
          </button>
          {cityOpen && (
            <div style={{
              position: 'absolute', bottom: '110%', left: 0,
              ...glass({ padding: '6px', minWidth: 180, maxHeight: 220, overflowY: 'auto' }),
              zIndex: 100,
            }}>
              {CITIES.map(city => (
                <div
                  key={city.name}
                  onClick={() => handleCitySelect(city)}
                  style={{
                    padding: '5px 10px', cursor: 'pointer',
                    borderRadius: 4,
                    color: city.name === selectedCity.name ? '#D4AF37' : '#99AABB',
                    background: city.name === selectedCity.name ? 'rgba(212,175,55,0.1)' : 'transparent',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background =
                    city.name === selectedCity.name ? 'rgba(212,175,55,0.1)' : 'transparent')}
                >
                  {city.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Geburtshimmel */}
        <button style={btn(birthMode)} onClick={() => setBirthMode(m => !m)}>
          ✦ GEBURTSHIMMEL
        </button>

        {birthMode && (
          <div style={glass({ padding: '14px 16px', minWidth: 220, display: 'flex', flexDirection: 'column', gap: 10 })}>
            <div style={{ color: '#D4AF37', fontSize: 11, letterSpacing: 2, marginBottom: 2 }}>
              GEBURTSDATEN
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10, color: '#667788' }}>Datum</label>
              <input
                type="date" value={birthDate}
                onChange={e => setBirthDate(e.target.value)}
                style={{
                  ...glass({ padding: '5px 8px', width: '100%', boxSizing: 'border-box' }),
                  colorScheme: 'dark',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10, color: '#667788' }}>Uhrzeit</label>
              <input
                type="time" value={birthTime}
                onChange={e => setBirthTime(e.target.value)}
                style={{
                  ...glass({ padding: '5px 8px', width: '100%', boxSizing: 'border-box' }),
                  colorScheme: 'dark',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10, color: '#667788' }}>Geburtsort</label>
              <select
                value={birthCity.name}
                onChange={e => setBirthCity(CITIES.find(c => c.name === e.target.value) ?? CITIES[0])}
                style={{
                  ...glass({ padding: '5px 8px', width: '100%', boxSizing: 'border-box' }),
                  colorScheme: 'dark',
                }}
              >
                {CITIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <button
              onClick={handleBirthChart}
              style={{
                ...btn(true),
                padding: '8px 0', textAlign: 'center', width: '100%',
              }}
            >
              ✦ ZEIGE MEINEN HIMMEL
            </button>
          </div>
        )}
      </div>

      {/* ── TOOLTIP (Hover-Objekt) ────────────────────────────────────────────── */}
      {hovered && (
        <div
          style={{
            position:  'absolute',
            left:      hovered.screenX + 16,
            top:       hovered.screenY - 10,
            pointerEvents: 'none',
            ...glass({ padding: '10px 14px', minWidth: 160 }),
            zIndex: 200,
          }}
        >
          {/* Name & Symbol */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {hovered.symbol && (
              <span style={{ fontSize: 18, color: hovered.color ?? '#D4AF37' }}>
                {hovered.symbol}
              </span>
            )}
            <span style={{ fontSize: 13, color: '#EEF0FF', fontWeight: 500 }}>
              {hovered.name}
            </span>
          </div>

          {/* Stern-Details */}
          {hovered.type === 'star' && (<>
            {hovered.mag !== undefined && (
              <div style={{ color: '#667788', fontSize: 10 }}>
                Magnitude: <span style={{ color: '#AABBCC' }}>{hovered.mag.toFixed(2)}</span>
              </div>
            )}
            {hovered.con && (
              <div style={{ color: '#667788', fontSize: 10 }}>
                Sternbild: <span style={{ color: '#AABBCC' }}>{hovered.con}</span>
              </div>
            )}
          </>)}

          {/* Positions-Daten (Planetarium) */}
          {(hovered.altitude !== undefined && hovered.altitude !== 0) && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(100,140,200,0.15)' }}>
              <div style={{ color: '#667788', fontSize: 10 }}>
                Höhe: <span style={{ color: '#AABBCC' }}>{hovered.altitude.toFixed(1)}°</span>
              </div>
              <div style={{ color: '#667788', fontSize: 10 }}>
                Azimut: <span style={{ color: '#AABBCC' }}>{hovered.azimuth.toFixed(1)}°</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Planetarium Hinweis ───────────────────────────────────────────────── */}
      {viewMode === 'planetarium' && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, 120px)',
          color: 'rgba(100,140,200,0.35)',
          fontSize: 11, fontFamily: 'SF Mono, monospace',
          pointerEvents: 'none', letterSpacing: 2,
        }}>
          ZIEHEN ZUM UMSCHAUEN · MAUSZEIGER ÜBER OBJEKTE FÜR INFO
        </div>
      )}
    </div>
  );
}

export default CelestialOrreryWithUI;
