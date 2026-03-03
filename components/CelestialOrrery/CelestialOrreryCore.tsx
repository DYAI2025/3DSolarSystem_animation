// ═══════════════════════════════════════════════════════════════════════════════
// CELESTIAL ORRERY CORE — Enhanced Edition
// ✦ Bloom Post-Processing   ✦ Earth Day/Night Shader   ✦ Star Sprites
// ✦ Orbit Trails            ✦ Ekliptik-Band             ✦ Zodiak-Highlights
// ✦ Shooting Stars          ✦ Smooth Transition         ✦ Hover Raycasting
// ═══════════════════════════════════════════════════════════════════════════════

'use client';

import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/examples/jsm/postprocessing/OutputPass.js';

import {
  PLANETS, STARS, CITIES, CONSTELLATION_LINES, CONSTELLATION_NAMES,
  SUN_RADIUS, ORBIT_SCALE,
} from '../../lib/astronomy/data';
import {
  getPlanetPosition, solveKepler,
  equatorialToHorizontal, horizontalTo3D, eclipticToEquatorial,
  dateToJD, getLST, daysSinceJ2000,
} from '../../lib/astronomy/calculations';
import {
  createSunMaterial, createPlanetMaterial, createAtmosphereShader,
  createSaturnRingsMaterial, createSkyDomeShader, createGroundShader,
  createMilkyWayBackground, updateMaterials,
  createEarthDayNightMaterial, updateEarthSunDirection, createStarSpriteTexture,
} from '../../lib/3d/materials';
import {
  CelestialOrreryConfig, CelestialOrreryAPI, ViewMode, HoveredObject, StarData,
} from '../../lib/astronomy/types';
import useCelestialOrrery from '../../hooks/useCelestialOrrery';

// ─── Statische Lookups ────────────────────────────────────────────────────────
const STAR_MAP: Record<string, StarData> = {};
STARS.forEach(s => { STAR_MAP[s.name] = s; });

const ZODIAC_CONS = new Set([
  'Aries','Taurus','Gemini','Cancer','Leo','Virgo',
  'Libra','Scorpius','Sagittarius','Capricornus','Aquarius','Pisces',
]);

interface ConLineMeta { star1: string; star2: string; con: string; zodiac: boolean; }
const CON_LINE_META: ConLineMeta[] = [];
Object.entries(CONSTELLATION_LINES).forEach(([con, pairs]) =>
  pairs.forEach(([s1, s2]) =>
    CON_LINE_META.push({ star1: s1, star2: s2, con, zodiac: ZODIAC_CONS.has(con) })
  )
);

// ─── Konstanten ───────────────────────────────────────────────────────────────
const PLAN_RADIUS      = 160;
const PLAN_CAM_Y       = 1.7;
const TRANSITION_SPEED = 3.5;     // Einheiten pro Sekunde → ≈ 0.3 s Übergang
const ORBIT_STEPS      = 180;
const ECLIPTIC_STEPS   = 180;
const TRAIL_STEPS      = 54;

// ─── Shooting Star Interface ──────────────────────────────────────────────────
interface ShootingStar {
  line:     THREE.Line;
  t:        number;
  duration: number;
  az0: number; alt0: number;
  dAz: number; dAlt: number;
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────
const ease = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function makeCardinalSprite(label: string, color: string): THREE.Sprite {
  const C = document.createElement('canvas');
  C.width = C.height = 128;
  const ctx = C.getContext('2d')!;
  ctx.font = 'bold 64px sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 64, 64);
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(C), transparent: true, opacity: 0.8,
    depthWrite: false,
  }));
}

function makeConNameSprite(text: string): THREE.Sprite {
  const C = document.createElement('canvas');
  C.width = 256; C.height = 64;
  const ctx = C.getContext('2d')!;
  ctx.font = '20px sans-serif';
  ctx.fillStyle = 'rgba(120,165,230,0.9)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), 128, 32);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(C), transparent: true, opacity: 0.75,
    depthWrite: false,
  }));
  spr.scale.set(16, 4, 1);
  return spr;
}

// ─── Props ────────────────────────────────────────────────────────────────────
export interface CelestialOrreryCoreProps extends CelestialOrreryConfig {
  onApiReady?: (api: CelestialOrreryAPI) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// KOMPONENTE
// ═══════════════════════════════════════════════════════════════════════════════
export const CelestialOrreryCore = forwardRef<CelestialOrreryAPI, CelestialOrreryCoreProps>(
  (props, ref) => {
    const {
      initialDate,
      initialViewMode        = 'orrery',
      initialSpeed           = 86400,
      sunRadius              = SUN_RADIUS,
      orbitScale             = ORBIT_SCALE,
      showOrbits:            initOrbits    = true,
      showConstellations:    initCons      = true,
      showConstellationNames: initConNames = true,
      observerLatitude,
      observerLongitude,
      onViewModeChange,
      onDateChange,
      onPlanetClick,
      onStarClick,
      onApiReady,
      className,
      style,
    } = props;

    const containerRef = useRef<HTMLDivElement>(null);

    const hook = useCelestialOrrery(
      observerLatitude !== undefined && observerLongitude !== undefined
        ? { name: 'Custom', lat: observerLatitude, lon: observerLongitude }
        : CITIES[0],
      initialDate
    );
    const {
      viewMode, simTime, observerLat, observerLon,
      showOrbits, showConstellations, showConstellationNames,
      sceneRef, cameraRef, rendererRef,
      api, setViewMode, setSimTime,
      isPlaying, speed, currentDate,
      setHoveredObject,
    } = hook;

    // ── Three.js Objekt-Refs ───────────────────────────────────────────────────
    const composerRef      = useRef<EffectComposer | null>(null);
    const planetMeshesRef  = useRef<Record<string, THREE.Mesh>>({});
    const orbitLinesRef    = useRef<Record<string, THREE.Line>>({});
    const orbitTrailsRef   = useRef<Record<string, THREE.Line>>({});
    const saturnRingsRef   = useRef<THREE.Mesh | null>(null);
    const sunMaterialRef   = useRef<THREE.ShaderMaterial | null>(null);
    const earthMatRef      = useRef<THREE.ShaderMaterial | null>(null);
    const orreryGroupRef   = useRef<THREE.Group | null>(null);

    // Planetarium
    const planGroupRef      = useRef<THREE.Group | null>(null);
    const starObjectsRef    = useRef<Record<string, THREE.Object3D>>({});
    const conLinesRef       = useRef<THREE.Line[]>([]);
    const conNameSpritesRef = useRef<Record<string, THREE.Sprite>>({});
    const planetSkyRef      = useRef<Record<string, THREE.Mesh>>({});
    const eclipticLineRef   = useRef<THREE.Line | null>(null);

    // Shooting Stars
    const shootingStarsRef     = useRef<ShootingStar[]>([]);
    const elapsedRef           = useRef(0);
    const nextShootingStarRef  = useRef(6 + Math.random() * 8);

    // ── Animation-Loop Refs ────────────────────────────────────────────────────
    const viewModeRef      = useRef<ViewMode>(initialViewMode);
    const simTimeRef       = useRef(daysSinceJ2000(initialDate ?? new Date()));
    const obsLatRef        = useRef(observerLatitude ?? CITIES[0].lat);
    const obsLonRef        = useRef(observerLongitude ?? CITIES[0].lon);
    const showConRef       = useRef(initCons);
    const showConNamesRef  = useRef(initConNames);
    const showOrbitsRef    = useRef(initOrbits);

    // Kamera – Orrery
    const sph  = useRef({ theta: Math.PI / 4, phi: Math.PI / 3, radius: 160 });
    const sphT = useRef({ theta: Math.PI / 4, phi: Math.PI / 3, radius: 160 });
    // Kamera – Planetarium
    const planLook = useRef({ azimuth: 180, altitude: 25 });

    // Maus
    const isDragging = useRef(false);
    const lastMouse  = useRef({ x: 0, y: 0 });
    const mouseNorm  = useRef({ x: 0, y: 0 });

    // Transition (0 = Orrery, 1 = Planetarium)
    const transitionT = useRef(initialViewMode === 'planetarium' ? 1 : 0);

    // Callback-Refs
    const setHoveredRef  = useRef(setHoveredObject);
    const setViewModeRef = useRef(setViewMode);
    useEffect(() => { setHoveredRef.current  = setHoveredObject; });
    useEffect(() => { setViewModeRef.current = setViewMode; });

    // Ref-Sync
    useEffect(() => { viewModeRef.current     = viewMode; },      [viewMode]);
    useEffect(() => { simTimeRef.current      = simTime; },       [simTime]);
    useEffect(() => { obsLatRef.current       = observerLat; },   [observerLat]);
    useEffect(() => { obsLonRef.current       = observerLon; },   [observerLon]);
    useEffect(() => { showConRef.current      = showConstellations; }, [showConstellations]);
    useEffect(() => { showConNamesRef.current = showConstellationNames; }, [showConstellationNames]);
    useEffect(() => { showOrbitsRef.current   = showOrbits; },    [showOrbits]);

    useImperativeHandle(ref, () => api, [api]);
    useEffect(() => { onApiReady?.(api); }, []); // eslint-disable-line

    // ═══════════════════════════════════════════════════════════════════════════
    // THREE.JS INIT
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
      if (!containerRef.current) return;
      const el = containerRef.current;
      const W  = el.clientWidth;
      const H  = el.clientHeight;

      // ── Scene / Camera / Renderer ────────────────────────────────────────────
      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 10000);
      camera.position.set(100, 80, 100);
      camera.lookAt(0, 0, 0);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
      renderer.toneMapping       = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      el.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // ── E) Bloom Post-Processing ─────────────────────────────────────────────
      const composer   = new EffectComposer(renderer);
      const renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);

      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(W, H),
        0.75,   // strength
        0.55,   // radius
        0.18,   // threshold
      );
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
      composerRef.current = composer;

      // ══════════════════════════════════════════════════════════════════════════
      // ORRERY GRUPPE
      // ══════════════════════════════════════════════════════════════════════════
      const orreryGroup = new THREE.Group();
      orreryGroupRef.current = orreryGroup;
      scene.add(orreryGroup);

      // ── Beleuchtung ──────────────────────────────────────────────────────────
      const sunLight = new THREE.PointLight('#FFF8EE', 3.5, 1200);
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.set(2048, 2048);
      scene.add(sunLight);
      scene.add(new THREE.AmbientLight('#222233', 0.25));
      scene.add(new THREE.HemisphereLight('#3355AA', '#110A22', 0.45));

      // ── Sonne ────────────────────────────────────────────────────────────────
      const sunMat = createSunMaterial();
      sunMaterialRef.current = sunMat;
      const sun = new THREE.Mesh(new THREE.SphereGeometry(sunRadius, 64, 64), sunMat);
      sun.userData = { type: 'sun', name: 'Sonne' };
      orreryGroup.add(sun);

      // Sonne Glow-Schichten
      ([
        { scale: 1.3, color: '#FFE4B5', opacity: 0.50 },
        { scale: 1.7, color: '#FFD700', opacity: 0.22 },
        { scale: 2.2, color: '#FFA500', opacity: 0.12 },
        { scale: 2.8, color: '#FF6B35', opacity: 0.05 },
      ] as const).forEach(({ scale, color, opacity }) => {
        orreryGroup.add(new THREE.Mesh(
          new THREE.SphereGeometry(sunRadius * scale, 32, 32),
          new THREE.MeshBasicMaterial({
            color, transparent: true, opacity,
            side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
          })
        ));
      });

      // ── Planeten ─────────────────────────────────────────────────────────────
      Object.entries(PLANETS).forEach(([key, planet]) => {
        let mat: THREE.Material;

        // F) Earth Day/Night Shader
        if (key === 'earth') {
          const earthMat = createEarthDayNightMaterial();
          earthMatRef.current = earthMat;
          mat = earthMat;
        } else {
          mat = createPlanetMaterial(planet.color, 0.15, 0.65, 0.15);
        }

        const mesh = new THREE.Mesh(new THREE.SphereGeometry(planet.radius, 48, 48), mat);
        mesh.castShadow    = true;
        mesh.receiveShadow = true;
        mesh.userData = {
          type: 'planet', key, name: planet.name,
          symbol: planet.symbol, color: planet.color,
        };
        orreryGroup.add(mesh);
        planetMeshesRef.current[key] = mesh;

        // Atmosphären-Glow
        if (['jupiter', 'saturn', 'uranus', 'neptune'].includes(key)) {
          mesh.add(new THREE.Mesh(
            new THREE.SphereGeometry(planet.radius * 1.12, 16, 16),
            createAtmosphereShader(planet.color, 0.55)
          ));
        }
        if (key === 'earth') {
          mesh.add(new THREE.Mesh(
            new THREE.SphereGeometry(planet.radius * 1.08, 16, 16),
            createAtmosphereShader('#6AAEED', 0.85)
          ));
        }

        // Saturn Ringe
        if (planet.rings) {
          const rings = new THREE.Mesh(
            new THREE.RingGeometry(planet.radius * 1.4, planet.radius * 2.2, 128),
            createSaturnRingsMaterial()
          );
          rings.rotation.x = Math.PI / 2.5;
          rings.castShadow = rings.receiveShadow = true;
          scene.add(rings);
          saturnRingsRef.current = rings;
        }

        // Orbit-Ellipse (echte Kepler-Geometrie)
        const orbitPts: THREE.Vector3[] = [];
        for (let s = 0; s <= ORBIT_STEPS; s++) {
          const M_s  = (s / ORBIT_STEPS) * 2 * Math.PI;
          const E_s  = solveKepler(M_s, planet.e);
          const nu_s = 2 * Math.atan2(
            Math.sqrt(1 + planet.e) * Math.sin(E_s / 2),
            Math.sqrt(1 - planet.e) * Math.cos(E_s / 2)
          );
          const r_s  = planet.a * (1 - planet.e * Math.cos(E_s));
          const xO   = r_s * Math.cos(nu_s);
          const yO   = r_s * Math.sin(nu_s);
          const iR   = planet.i * Math.PI / 180;
          const oR   = planet.omega * Math.PI / 180;
          const wR   = planet.w * Math.PI / 180;
          const cO = Math.cos(oR), sO = Math.sin(oR);
          const cW = Math.cos(wR), sW = Math.sin(wR);
          const cI = Math.cos(iR), sI = Math.sin(iR);
          const x  = (cO * cW - sO * sW * cI) * xO + (-cO * sW - sO * cW * cI) * yO;
          const y  = (sO * cW + cO * sW * cI) * xO + (-sO * sW + cO * cW * cI) * yO;
          const z  = sW * sI * xO + cW * sI * yO;
          const sc = r_s > 0 ? Math.log10(r_s + 1) * orbitScale / r_s : 0;
          orbitPts.push(new THREE.Vector3(x * sc, z * sc, -y * sc));
        }
        const orbitLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(orbitPts),
          new THREE.LineBasicMaterial({ color: planet.color, transparent: true, opacity: 0.18 })
        );
        orreryGroup.add(orbitLine);
        orbitLinesRef.current[key] = orbitLine;

        // A) Orbit-Trail (farbiger Schweif hinter dem Planeten)
        const trailGeo = new THREE.BufferGeometry();
        const initPos  = new Float32Array((TRAIL_STEPS + 1) * 3);
        const initCol  = new Float32Array((TRAIL_STEPS + 1) * 3);
        trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(initPos, 3));
        trailGeo.setAttribute('color',    new THREE.Float32BufferAttribute(initCol, 3));
        const trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
          vertexColors: true, transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        orreryGroup.add(trailLine);
        orbitTrailsRef.current[key] = trailLine;
      });

      // ── Hintergrund-Sterne & Milchstraße ─────────────────────────────────────
      const bgPos: number[] = [];
      for (let i = 0; i < 6000; i++) {
        const t = Math.random() * Math.PI * 2;
        const p = Math.acos(2 * Math.random() - 1);
        const r = 450 + Math.random() * 350;
        bgPos.push(r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p));
      }
      const bgGeo = new THREE.BufferGeometry();
      bgGeo.setAttribute('position', new THREE.Float32BufferAttribute(bgPos, 3));
      scene.add(new THREE.Points(bgGeo, new THREE.PointsMaterial({
        color: '#FFFFFF', size: 0.9, transparent: true, opacity: 0.65,
        sizeAttenuation: true,
      })));
      createMilkyWayBackground(scene);

      // ══════════════════════════════════════════════════════════════════════════
      // PLANETARIUM GRUPPE
      // ══════════════════════════════════════════════════════════════════════════
      const planGroup = new THREE.Group();
      planGroupRef.current = planGroup;
      planGroup.visible = transitionT.current > 0.05;
      scene.add(planGroup);

      // Himmelskuppel
      planGroup.add(new THREE.Mesh(
        new THREE.SphereGeometry(PLAN_RADIUS, 64, 64),
        createSkyDomeShader()
      ));

      // Boden
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(PLAN_RADIUS * 0.98, 128),
        createGroundShader()
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.05;
      planGroup.add(ground);

      // Horizontlinie
      const horizRing = new THREE.Mesh(
        new THREE.RingGeometry(PLAN_RADIUS * 0.965, PLAN_RADIUS * 0.975, 128),
        new THREE.MeshBasicMaterial({
          color: '#1E4060', transparent: true, opacity: 0.55, side: THREE.DoubleSide,
        })
      );
      horizRing.rotation.x = -Math.PI / 2;
      planGroup.add(horizRing);

      // C) Ekliptik-Linie (wird im Effect befüllt)
      const eclGeo  = new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: ECLIPTIC_STEPS + 1 }, () => new THREE.Vector3())
      );
      const eclLine = new THREE.Line(eclGeo, new THREE.LineBasicMaterial({
        color: '#886622', transparent: true, opacity: 0.45,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      eclLine.visible = false;
      planGroup.add(eclLine);
      eclipticLineRef.current = eclLine;

      // B) Sterne als Sprites mit Diffraktions-Textur
      STARS.forEach(star => {
        const tex   = createStarSpriteTexture(star.mag);
        const spr   = new THREE.Sprite(new THREE.SpriteMaterial({
          map: tex, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        const size  = Math.max(1.8, 6.5 - star.mag * 1.1);
        spr.scale.set(size, size, 1);
        spr.userData = {
          type: 'star', name: star.name, mag: star.mag, con: star.con,
          ra: star.ra, dec: star.dec,
        };
        spr.visible = false;
        planGroup.add(spr);
        starObjectsRef.current[star.name] = spr;
      });

      // Planeten-Marker am Sternhimmel
      Object.entries(PLANETS).forEach(([key, planet]) => {
        const size = Math.max(0.3, planet.radius * 0.38);
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(size, 12, 12),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(planet.color) })
        );
        mesh.userData = {
          type: 'planet', key, name: planet.name,
          symbol: planet.symbol, color: planet.color, ra: 0, dec: 0,
        };
        mesh.visible = false;
        mesh.add(new THREE.Mesh(
          new THREE.SphereGeometry(size * 3.0, 8, 8),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(planet.color),
            transparent: true, opacity: 0.20,
            side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
          })
        ));
        planGroup.add(mesh);
        planetSkyRef.current[key] = mesh;
      });

      // D) Sternbild-Linien — Zodiak golden, normale blau
      CON_LINE_META.forEach(meta => {
        const color = meta.zodiac ? '#C8930A' : '#1E4488';
        const line  = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
          new THREE.LineBasicMaterial({
            color, transparent: true, opacity: meta.zodiac ? 0.50 : 0.35,
          })
        );
        line.visible = false;
        planGroup.add(line);
        conLinesRef.current.push(line);
      });

      // Sternbild-Namen (Sprites)
      Object.keys(CONSTELLATION_NAMES).forEach(conKey => {
        const spr = makeConNameSprite(CONSTELLATION_NAMES[conKey]);
        spr.visible = false;
        planGroup.add(spr);
        conNameSpritesRef.current[conKey] = spr;
      });

      // Himmelsrichtungen
      ([
        { label: 'N', az: 0,   color: '#7799FF' },
        { label: 'O', az: 90,  color: '#99AABB' },
        { label: 'S', az: 180, color: '#99AABB' },
        { label: 'W', az: 270, color: '#99AABB' },
      ] as const).forEach(({ label, az, color }) => {
        const spr = makeCardinalSprite(label, color);
        const p   = horizontalTo3D(3, az, PLAN_RADIUS * 0.91);
        spr.position.set(p.x, p.y, p.z);
        planGroup.add(spr);
      });

      // ══════════════════════════════════════════════════════════════════════════
      // MOUSE & INPUT
      // ══════════════════════════════════════════════════════════════════════════
      const onMouseDown  = (e: MouseEvent) => {
        isDragging.current = true;
        lastMouse.current  = { x: e.clientX, y: e.clientY };
      };
      const onMouseUp    = () => { isDragging.current = false; };
      const onMouseLeave = () => {
        isDragging.current = false;
        setHoveredRef.current(null);
      };
      const onMouseMove  = (e: MouseEvent) => {
        const rect = el.getBoundingClientRect();
        mouseNorm.current = {
          x:  ((e.clientX - rect.left) / rect.width)  * 2 - 1,
          y: -((e.clientY - rect.top)  / rect.height) * 2 + 1,
        };
        if (!isDragging.current) return;
        const dx = e.clientX - lastMouse.current.x;
        const dy = e.clientY - lastMouse.current.y;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        if (viewModeRef.current === 'orrery') {
          sphT.current.theta -= dx * 0.005;
          sphT.current.phi    = Math.max(0.1, Math.min(Math.PI - 0.1, sphT.current.phi + dy * 0.005));
        } else if (viewModeRef.current === 'planetarium') {
          planLook.current.azimuth  = (planLook.current.azimuth - dx * 0.20 + 360) % 360;
          planLook.current.altitude = Math.max(-5, Math.min(88, planLook.current.altitude - dy * 0.15));
        }
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (viewModeRef.current !== 'orrery') return;
        sphT.current.radius = Math.max(25, Math.min(600, sphT.current.radius + e.deltaY * 0.25));
      };

      let clickX = 0, clickY = 0;
      const onClickStart = (e: MouseEvent) => { clickX = e.clientX; clickY = e.clientY; };
      const onClick = (e: MouseEvent) => {
        if (Math.abs(e.clientX - clickX) > 6 || Math.abs(e.clientY - clickY) > 6) return;
        const rect = el.getBoundingClientRect();
        const mx   = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        const my   = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const ray  = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(mx, my), camera);
        if (viewModeRef.current === 'orrery') {
          const hits = ray.intersectObjects(Object.values(planetMeshesRef.current), false);
          if (hits.length > 0) {
            const { key } = hits[0].object.userData;
            onPlanetClick?.(key, PLANETS[key]);
          }
        } else if (viewModeRef.current === 'planetarium') {
          const visStars = Object.values(starObjectsRef.current).filter(o => o.visible);
          const hits = ray.intersectObjects(visStars, false);
          if (hits.length > 0) {
            const star = STAR_MAP[hits[0].object.userData.name];
            if (star) onStarClick?.(star);
          }
        }
      };

      el.addEventListener('mousedown',  onMouseDown);
      el.addEventListener('mousedown',  onClickStart);
      el.addEventListener('mouseup',    onMouseUp);
      el.addEventListener('mouseleave', onMouseLeave);
      el.addEventListener('mousemove',  onMouseMove);
      el.addEventListener('wheel',      onWheel, { passive: false });
      el.addEventListener('click',      onClick);

      // ══════════════════════════════════════════════════════════════════════════
      // ANIMATION LOOP
      // ══════════════════════════════════════════════════════════════════════════
      const ray   = new THREE.Raycaster();
      const clock = new THREE.Clock();
      let raf: number;

      const animate = () => {
        raf = requestAnimationFrame(animate);
        const dt = clock.getDelta();
        elapsedRef.current += dt;

        // ── Animated Materials ──────────────────────────────────────────────
        updateMaterials(dt, sunMaterialRef.current ?? undefined);

        // F) Earth Day/Night — Sonnenrichtung updaten
        if (earthMatRef.current && planetMeshesRef.current['earth']) {
          updateEarthSunDirection(
            earthMatRef.current,
            planetMeshesRef.current['earth'].position
          );
        }

        // ── Transition ──────────────────────────────────────────────────────
        const targetT = viewModeRef.current === 'planetarium' ? 1.0 : 0.0;
        transitionT.current += (targetT - transitionT.current) * Math.min(1, dt * TRANSITION_SPEED);
        const tE = ease(Math.max(0, Math.min(1, transitionT.current)));

        if (orreryGroupRef.current) orreryGroupRef.current.visible = tE < 0.68;
        if (planGroupRef.current)   planGroupRef.current.visible   = tE > 0.32;
        if (saturnRingsRef.current) saturnRingsRef.current.visible = tE < 0.68;

        // ── Kamera ──────────────────────────────────────────────────────────
        const s  = sph.current;
        const st = sphT.current;
        s.theta  += (st.theta  - s.theta)  * 0.08;
        s.phi    += (st.phi    - s.phi)    * 0.08;
        s.radius += (st.radius - s.radius) * 0.08;

        const orreyPos = new THREE.Vector3(
          s.radius * Math.sin(s.phi) * Math.cos(s.theta),
          s.radius * Math.cos(s.phi),
          s.radius * Math.sin(s.phi) * Math.sin(s.theta),
        );
        const planPos = new THREE.Vector3(0, PLAN_CAM_Y, 0);
        camera.position.lerpVectors(orreyPos, planPos, tE);

        const look      = planLook.current;
        const lookPt    = horizontalTo3D(look.altitude, look.azimuth, 50);
        const planTgt   = new THREE.Vector3(lookPt.x, PLAN_CAM_Y + lookPt.y, lookPt.z);
        const orreyTgt  = new THREE.Vector3(0, 0, 0);
        camera.lookAt(orreyTgt.clone().lerp(planTgt, tE));

        // Orbit-Linien Sichtbarkeit
        Object.values(orbitLinesRef.current).forEach(l => {
          if (l) l.visible = showOrbitsRef.current && tE < 0.55;
        });
        // Orbit-Trails immer in Orrery
        Object.values(orbitTrailsRef.current).forEach(l => {
          if (l) l.visible = tE < 0.55;
        });

        // ── G) Shooting Stars ───────────────────────────────────────────────
        if (viewModeRef.current === 'planetarium' && planGroupRef.current && tE > 0.8) {
          if (elapsedRef.current > nextShootingStarRef.current) {
            const az0  = Math.random() * 360;
            const alt0 = 25 + Math.random() * 55;
            const dAz  = (Math.random() - 0.5) * 70;
            const dAlt = -(12 + Math.random() * 30);
            const geo  = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(), new THREE.Vector3(),
            ]);
            const mat  = new THREE.LineBasicMaterial({
              color: '#FFFFFF', transparent: true, opacity: 0,
              blending: THREE.AdditiveBlending, depthWrite: false,
            });
            const line = new THREE.Line(geo, mat);
            planGroupRef.current.add(line);
            shootingStarsRef.current.push({
              line, t: 0, duration: 0.5 + Math.random() * 0.5,
              az0, alt0, dAz, dAlt,
            });
            nextShootingStarRef.current = elapsedRef.current + 7 + Math.random() * 14;
          }

          shootingStarsRef.current = shootingStarsRef.current.filter(ss => {
            ss.t += dt / ss.duration;
            if (ss.t >= 1) {
              planGroupRef.current?.remove(ss.line);
              ss.line.geometry.dispose();
              (ss.line.material as THREE.Material).dispose();
              return false;
            }
            const opacity = ss.t < 0.15
              ? ss.t / 0.15
              : Math.max(0, 1 - (ss.t - 0.15) / 0.85);
            (ss.line.material as THREE.LineBasicMaterial).opacity = opacity * 0.88;

            const head_az  = ss.az0  + ss.t * ss.dAz;
            const head_alt = ss.alt0 + ss.t * ss.dAlt;
            const tail_frac = Math.min(ss.t, 0.18);
            const tail_az  = ss.az0  + (ss.t - tail_frac) * ss.dAz;
            const tail_alt = ss.alt0 + (ss.t - tail_frac) * ss.dAlt;

            if (head_alt < -3) {
              (ss.line.material as THREE.LineBasicMaterial).opacity = 0;
              return true;
            }
            const p1 = horizontalTo3D(Math.max(head_alt, 0.1), head_az, PLAN_RADIUS * 0.92);
            const p2 = horizontalTo3D(Math.max(tail_alt, 0.1), tail_az, PLAN_RADIUS * 0.92);
            const positions = new Float32Array([p1.x, p1.y, p1.z, p2.x, p2.y, p2.z]);
            ss.line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            (ss.line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
            return true;
          });
        }

        // ── Raycasting (Hover-Tooltip) ───────────────────────────────────────
        ray.setFromCamera(new THREE.Vector2(mouseNorm.current.x, mouseNorm.current.y), camera);
        let hovered: HoveredObject | null = null;
        const rect = el.getBoundingClientRect();
        const vm   = viewModeRef.current;

        if (vm === 'orrery' && tE < 0.35) {
          const hits = ray.intersectObjects(Object.values(planetMeshesRef.current), false);
          if (hits.length > 0) {
            const obj = hits[0].object;
            const sp  = obj.position.clone().project(camera);
            hovered = {
              name: obj.userData.name, type: 'planet',
              altitude: 0, azimuth: 0,
              symbol: obj.userData.symbol, color: obj.userData.color,
              screenX: (sp.x + 1) / 2 * rect.width,
              screenY: (-sp.y + 1) / 2 * rect.height,
            };
          }
        } else if (vm === 'planetarium' && tE > 0.65) {
          const visStars   = Object.values(starObjectsRef.current).filter(o => o.visible);
          const visPlanets = Object.values(planetSkyRef.current).filter(m => m.visible);
          const hits = ray.intersectObjects([...visStars, ...visPlanets], false);
          if (hits.length > 0) {
            const obj  = hits[0].object;
            const sp   = obj.position.clone().project(camera);
            const jd   = dateToJD(new Date(Date.UTC(2000, 0, 1, 12) + simTimeRef.current * 86400000));
            const lst  = getLST(jd, obsLonRef.current);
            const horiz = equatorialToHorizontal(
              obj.userData.ra ?? 0, obj.userData.dec ?? 0,
              obsLatRef.current, lst
            );
            hovered = {
              name:    obj.userData.name,
              type:    obj.userData.type as 'star' | 'planet',
              altitude: Math.round(horiz.altitude * 10) / 10,
              azimuth:  Math.round(horiz.azimuth  * 10) / 10,
              mag:     obj.userData.mag,
              con:     obj.userData.con,
              symbol:  obj.userData.symbol,
              color:   obj.userData.color,
              screenX: (sp.x + 1) / 2 * rect.width,
              screenY: (-sp.y + 1) / 2 * rect.height,
            };
          }
        }
        setHoveredRef.current(hovered);

        // E) Bloom Composer rendern (statt renderer.render)
        composerRef.current?.render();
      };
      animate();

      // ── Resize ────────────────────────────────────────────────────────────
      const onResize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        composerRef.current?.setSize(w, h);
      };
      window.addEventListener('resize', onResize);

      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
        el.removeEventListener('mousedown',  onMouseDown);
        el.removeEventListener('mousedown',  onClickStart);
        el.removeEventListener('mouseup',    onMouseUp);
        el.removeEventListener('mouseleave', onMouseLeave);
        el.removeEventListener('mousemove',  onMouseMove);
        el.removeEventListener('wheel',      onWheel);
        el.removeEventListener('click',      onClick);
        renderer.dispose();
        if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      };
    }, []); // eslint-disable-line

    // ═══════════════════════════════════════════════════════════════════════════
    // PLANETEN-POSITIONEN + A) ORBIT TRAILS
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
      const col = new THREE.Color();

      Object.entries(PLANETS).forEach(([key, planet]) => {
        const mesh = planetMeshesRef.current[key];
        if (!mesh) return;
        const pos = getPlanetPosition(planet, simTime, orbitScale);
        mesh.position.set(pos.x, pos.y, pos.z);
        if (key === 'saturn' && saturnRingsRef.current) {
          saturnRingsRef.current.position.set(pos.x, pos.y, pos.z);
        }

        // A) Orbit-Trail — letzte 15% der Umlaufzeit
        const trail = orbitTrailsRef.current[key];
        if (!trail) return;
        const TRAIL_DAYS = Math.min(planet.period * 0.15, 365);
        const positions  = new Float32Array((TRAIL_STEPS + 1) * 3);
        const colors     = new Float32Array((TRAIL_STEPS + 1) * 3);
        col.set(planet.color);

        for (let step = 0; step <= TRAIL_STEPS; step++) {
          const t_trail = simTime - (TRAIL_STEPS - step) / TRAIL_STEPS * TRAIL_DAYS;
          const p       = getPlanetPosition(planet, t_trail, orbitScale);
          positions[step * 3]     = p.x;
          positions[step * 3 + 1] = p.y;
          positions[step * 3 + 2] = p.z;
          const alpha = (step / TRAIL_STEPS) * 0.75;
          colors[step * 3]     = col.r * alpha;
          colors[step * 3 + 1] = col.g * alpha;
          colors[step * 3 + 2] = col.b * alpha;
        }
        trail.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        trail.geometry.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
        (trail.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (trail.geometry.attributes.color    as THREE.BufferAttribute).needsUpdate = true;
      });
    }, [simTime, orbitScale]);

    // ═══════════════════════════════════════════════════════════════════════════
    // PLANETARIUM — Sterne, Ekliptik, Planeten am Himmel
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
      const jd  = dateToJD(currentDate);
      const lst = getLST(jd, observerLon);

      // ── B) Sterne positionieren ────────────────────────────────────────────
      STARS.forEach(star => {
        const obj = starObjectsRef.current[star.name];
        if (!obj) return;
        const horiz = equatorialToHorizontal(star.ra, star.dec, observerLat, lst);
        if (horiz.altitude < -4) { obj.visible = false; return; }
        obj.visible = true;
        const p = horizontalTo3D(Math.max(horiz.altitude, 0.2), horiz.azimuth, PLAN_RADIUS * 0.94);
        obj.position.set(p.x, p.y, p.z);
      });

      // ── D) Sternbild-Linien updaten ────────────────────────────────────────
      CON_LINE_META.forEach((meta, i) => {
        const line = conLinesRef.current[i];
        if (!line) return;
        const o1 = starObjectsRef.current[meta.star1];
        const o2 = starObjectsRef.current[meta.star2];
        if (!o1?.visible || !o2?.visible) { line.visible = false; return; }
        line.visible = showConstellations;
        const arr = new Float32Array([
          o1.position.x, o1.position.y, o1.position.z,
          o2.position.x, o2.position.y, o2.position.z,
        ]);
        line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        (line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      });

      // ── Sternbild-Namen positionieren ──────────────────────────────────────
      Object.entries(CONSTELLATION_LINES).forEach(([conKey, pairs]) => {
        const spr = conNameSpritesRef.current[conKey];
        if (!spr) return;
        if (!showConstellationNames) { spr.visible = false; return; }
        let cx = 0, cy = 0, cz = 0, cnt = 0;
        const names = new Set<string>();
        pairs.forEach(([s1, s2]) => { names.add(s1); names.add(s2); });
        names.forEach(name => {
          const o = starObjectsRef.current[name];
          if (o?.visible) { cx += o.position.x; cy += o.position.y; cz += o.position.z; cnt++; }
        });
        if (cnt < 2) { spr.visible = false; return; }
        cx /= cnt; cy /= cnt; cz /= cnt;
        const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
        const r   = PLAN_RADIUS * 0.87;
        spr.position.set(cx / len * r, Math.max(cy / len * r, 4), cz / len * r);
        spr.visible = true;
      });

      // ── C) Ekliptik-Linie ──────────────────────────────────────────────────
      if (eclipticLineRef.current) {
        const eclPts: number[] = [];
        let prevVisible = false;

        for (let step = 0; step <= ECLIPTIC_STEPS; step++) {
          const lon    = (step / ECLIPTIC_STEPS) * 360;
          const lonRad = lon * Math.PI / 180;
          const { ra, dec } = eclipticToEquatorial(Math.cos(lonRad), Math.sin(lonRad), 0);
          const horiz  = equatorialToHorizontal(ra, dec, observerLat, lst);
          if (horiz.altitude > -3) {
            const p = horizontalTo3D(Math.max(horiz.altitude, 0.1), horiz.azimuth, PLAN_RADIUS * 0.88);
            eclPts.push(p.x, p.y, p.z);
            prevVisible = true;
          } else if (prevVisible) {
            // Unsichtbarer Punkt als Lücke (NaN bricht Line)
            eclPts.push(NaN, NaN, NaN);
            prevVisible = false;
          }
        }

        if (eclPts.length > 0) {
          eclipticLineRef.current.geometry.setAttribute(
            'position', new THREE.Float32BufferAttribute(eclPts, 3)
          );
          (eclipticLineRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
          eclipticLineRef.current.visible = true;
        }
      }

      // ── Planeten am Sternhimmel ────────────────────────────────────────────
      Object.entries(PLANETS).forEach(([key, planet]) => {
        const marker = planetSkyRef.current[key];
        if (!marker) return;
        const { a, e, i, omega, w, M0, period } = planet;
        const n    = (2 * Math.PI) / period;
        const M_p  = ((M0 * Math.PI / 180) + n * simTime) % (2 * Math.PI);
        const E_p  = solveKepler(M_p, e);
        const nu_p = 2 * Math.atan2(
          Math.sqrt(1 + e) * Math.sin(E_p / 2),
          Math.sqrt(1 - e) * Math.cos(E_p / 2)
        );
        const r_p   = a * (1 - e * Math.cos(E_p));
        const xO    = r_p * Math.cos(nu_p);
        const yO    = r_p * Math.sin(nu_p);
        const iR = i * Math.PI / 180, oR = omega * Math.PI / 180, wR = w * Math.PI / 180;
        const cO = Math.cos(oR), sO = Math.sin(oR), cW = Math.cos(wR), sW = Math.sin(wR);
        const cI = Math.cos(iR), sI = Math.sin(iR);
        const xEcl = (cO * cW - sO * sW * cI) * xO + (-cO * sW - sO * cW * cI) * yO;
        const yEcl = (sO * cW + cO * sW * cI) * xO + (-sO * sW + cO * cW * cI) * yO;
        const zEcl = sW * sI * xO + cW * sI * yO;
        const { ra, dec } = eclipticToEquatorial(xEcl, yEcl, zEcl);
        marker.userData.ra  = ra;
        marker.userData.dec = dec;
        const horiz = equatorialToHorizontal(ra, dec, observerLat, lst);
        if (horiz.altitude < -4) { marker.visible = false; return; }
        marker.visible = true;
        const p = horizontalTo3D(Math.max(horiz.altitude, 0.2), horiz.azimuth, PLAN_RADIUS * 0.91);
        marker.position.set(p.x, p.y, p.z);
      });
    }, [simTime, observerLat, observerLon, showConstellations, showConstellationNames, currentDate]);

    // ═══════════════════════════════════════════════════════════════════════════
    // ZEIT-ANIMATION
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
      if (!isPlaying) return;
      const id = setInterval(() => setSimTime(t => t + speed / 86400), 16);
      return () => clearInterval(id);
    }, [isPlaying, speed, setSimTime]);

    // ── Callbacks ─────────────────────────────────────────────────────────────
    useEffect(() => { onViewModeChange?.(viewMode); }, [viewMode]);  // eslint-disable-line
    useEffect(() => { onDateChange?.(currentDate); },  [currentDate]); // eslint-disable-line

    // ── Render ────────────────────────────────────────────────────────────────
    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          width: '100%',
          height: '100%',
          cursor: viewMode === 'orrery' ? 'grab' : 'crosshair',
          ...style,
        }}
      />
    );
  }
);

CelestialOrreryCore.displayName = 'CelestialOrreryCore';
export default CelestialOrreryCore;
