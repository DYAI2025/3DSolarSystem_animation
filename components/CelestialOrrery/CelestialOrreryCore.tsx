// ═══════════════════════════════════════════════════════════════════════════════
// CELESTIAL ORRERY CORE - Enhanced & Modular 3D Solar System
// ═══════════════════════════════════════════════════════════════════════════════

'use client';

import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { PLANETS, STARS, CITIES, CONSTELLATION_LINES, SUN_RADIUS, ORBIT_SCALE } from '../../lib/astronomy/data';
import {
  getPlanetPosition,
  solveKepler,
  equatorialToHorizontal,
  horizontalTo3D,
  eclipticToEquatorial,
  dateToJD,
  getLST
} from '../../lib/astronomy/calculations';
import {
  createSunMaterial,
  createPlanetMaterial,
  createAtmosphereShader,
  createSaturnRingsMaterial,
  createStarMaterial,
  createSkyDomeShader,
  createGroundShader,
  createMilkyWayBackground,
  updateMaterials
} from '../../lib/3d/materials';
import { CelestialOrreryConfig, CelestialOrreryAPI, ViewMode } from '../../lib/astronomy/types';
import useCelestialOrrery from '../../hooks/useCelestialOrrery';

export interface CelestialOrreryCoreProps extends CelestialOrreryConfig {
  onApiReady?: (api: CelestialOrreryAPI) => void;
}

/**
 * Core component for 3D Solar System visualization
 * This component can be used standalone or embedded in other applications
 */
export const CelestialOrreryCore = forwardRef<CelestialOrreryAPI, CelestialOrreryCoreProps>(
  (props, ref) => {
    const {
      initialDate,
      initialViewMode = 'orrery',
      initialSpeed = 86400,
      sunRadius = SUN_RADIUS,
      orbitScale = ORBIT_SCALE,
      showOrbits: initialShowOrbits = true,
      showConstellations: initialShowConstellations = true,
      showConstellationNames: initialShowConstellationNames = true,
      observerLatitude,
      observerLongitude,
      onViewModeChange,
      onDateChange,
      onPlanetClick,
      onStarClick,
      onApiReady,
      className,
      style
    } = props;

    // Container ref
    const containerRef = useRef<HTMLDivElement>(null);

    // Initialize hook
    const hook = useCelestialOrrery(
      CITIES[0],
      initialDate
    );

    // Extract from hook
    const {
      viewMode,
      simTime,
      observerLat,
      observerLon,
      showOrbits,
      showConstellations,
      sceneRef,
      cameraRef,
      rendererRef,
      api,
      setViewMode,
      setSimTime,
      isPlaying,
      speed,
      currentDate
    } = hook;

    // Mesh references
    const planetMeshesRef = useRef<Record<string, THREE.Mesh>>({});
    const orbitLinesRef = useRef<Record<string, THREE.Line>>({});
    const saturnRingsRef = useRef<THREE.Mesh | null>(null);
    const starMeshesRef = useRef<THREE.Object3D[]>([]);
    const constellationLinesRef = useRef<THREE.Line[]>([]);
    const skyDomeRef = useRef<THREE.Mesh | null>(null);
    const horizonRef = useRef<THREE.Mesh | null>(null);
    const sunMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

    // Expose API
    useImperativeHandle(ref, () => api, [api]);

    // Notify API ready
    useEffect(() => {
      if (onApiReady) {
        onApiReady(api);
      }
    }, [api, onApiReady]);

    // Initialize Three.js scene
    useEffect(() => {
      if (!containerRef.current) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      // Scene
      const scene = new THREE.Scene();
      sceneRef.current = scene;

      // Camera
      const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
      camera.position.set(100, 80, 100);
      cameraRef.current = camera;

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      containerRef.current.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Lighting - Enhanced
      const sunLight = new THREE.PointLight('#FFFFEE', 3, 1000);
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.width = 2048;
      sunLight.shadow.mapSize.height = 2048;
      scene.add(sunLight);

      const ambientLight = new THREE.AmbientLight('#334455', 0.3);
      scene.add(ambientLight);

      // Add subtle hemisphere light for better depth
      const hemisphereLight = new THREE.HemisphereLight('#4466AA', '#221122', 0.5);
      scene.add(hemisphereLight);

      // Sun - Enhanced with shader
      const sunGeo = new THREE.SphereGeometry(sunRadius, 64, 64);
      const sunMat = createSunMaterial();
      sunMaterialRef.current = sunMat;
      const sun = new THREE.Mesh(sunGeo, sunMat);
      sun.userData = { type: 'sun', name: 'Sonne' };
      scene.add(sun);

      // Sun glow layers - Enhanced
      const glowColors = ['#FFE4B5', '#FFD700', '#FFA500', '#FF6B35'];
      const glowScales = [1.3, 1.6, 2.0, 2.5];
      const glowOpacities = [0.4, 0.2, 0.12, 0.06];

      glowScales.forEach((scale, i) => {
        const glowGeo = new THREE.SphereGeometry(sunRadius * scale, 32, 32);
        const glowMat = new THREE.MeshBasicMaterial({
          color: glowColors[i],
          transparent: true,
          opacity: glowOpacities[i],
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending
        });
        scene.add(new THREE.Mesh(glowGeo, glowMat));
      });

      // Create planets with enhanced materials
      Object.entries(PLANETS).forEach(([key, planet]) => {
        const geo = new THREE.SphereGeometry(planet.radius, 32, 32);
        const mat = createPlanetMaterial(planet.color, 0.15, 0.65, 0.15);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { type: 'planet', key, name: planet.name, symbol: planet.symbol };
        scene.add(mesh);
        planetMeshesRef.current[key] = mesh;

        // Add atmospheric glow for gas giants
        if (['jupiter', 'saturn', 'uranus', 'neptune'].includes(key)) {
          const atmoGeo = new THREE.SphereGeometry(planet.radius * 1.15, 16, 16);
          const atmoMat = createAtmosphereShader(planet.color, 0.6);
          const atmo = new THREE.Mesh(atmoGeo, atmoMat);
          mesh.add(atmo);
        }

        // Earth atmosphere (special blue glow)
        if (key === 'earth') {
          const atmoGeo = new THREE.SphereGeometry(planet.radius * 1.1, 16, 16);
          const atmoMat = createAtmosphereShader('#4A90D9', 0.8);
          const atmo = new THREE.Mesh(atmoGeo, atmoMat);
          mesh.add(atmo);
        }

        // Saturn rings - Enhanced
        if (planet.rings) {
          const ringGeo = new THREE.RingGeometry(planet.radius * 1.4, planet.radius * 2.2, 128);
          const ringMat = createSaturnRingsMaterial();
          const rings = new THREE.Mesh(ringGeo, ringMat);
          rings.rotation.x = Math.PI / 2.5;
          rings.castShadow = true;
          rings.receiveShadow = true;
          scene.add(rings);
          saturnRingsRef.current = rings;
        }

        // Orbit path
        const orbitPoints: THREE.Vector3[] = [];
        for (let angle = 0; angle <= 360; angle += 2) {
          const M = angle * Math.PI / 180;
          const E = solveKepler(M, planet.e);
          const nu = 2 * Math.atan2(
            Math.sqrt(1 + planet.e) * Math.sin(E / 2),
            Math.sqrt(1 - planet.e) * Math.cos(E / 2)
          );
          const r = planet.a * (1 - planet.e * Math.cos(E));
          const xOrb = r * Math.cos(nu);
          const yOrb = r * Math.sin(nu);

          const iRad = planet.i * Math.PI / 180;
          const omegaRad = planet.omega * Math.PI / 180;
          const wRad = planet.w * Math.PI / 180;
          const cosO = Math.cos(omegaRad), sinO = Math.sin(omegaRad);
          const cosW = Math.cos(wRad), sinW = Math.sin(wRad);
          const cosI = Math.cos(iRad), sinI = Math.sin(iRad);

          const x = (cosO * cosW - sinO * sinW * cosI) * xOrb + (-cosO * sinW - sinO * cosW * cosI) * yOrb;
          const y = (sinO * cosW + cosO * sinW * cosI) * xOrb + (-sinO * sinW + cosO * cosW * cosI) * yOrb;
          const z = (sinW * sinI) * xOrb + (cosW * sinI) * yOrb;

          const scaled = Math.log10(r + 1) * orbitScale;
          const factor = scaled / r;
          orbitPoints.push(new THREE.Vector3(x * factor, z * factor, -y * factor));
        }

        const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints);
        const orbitMat = new THREE.LineBasicMaterial({
          color: planet.color,
          transparent: true,
          opacity: 0.2
        });
        const orbitLine = new THREE.Line(orbitGeo, orbitMat);
        scene.add(orbitLine);
        orbitLinesRef.current[key] = orbitLine;
      });

      // Background stars for orrery (reduced, Milky Way will be separate)
      const starGeo = new THREE.BufferGeometry();
      const starPositions: number[] = [];
      for (let i = 0; i < 5000; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 400 + Math.random() * 400;
        starPositions.push(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta),
          r * Math.cos(phi)
        );
      }
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
      const starMat = new THREE.PointsMaterial({
        color: '#FFFFFF',
        size: 0.8,
        transparent: true,
        opacity: 0.6
      });
      scene.add(new THREE.Points(starGeo, starMat));

      // Add Milky Way
      createMilkyWayBackground(scene);

      // Camera controls
      let spherical = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 160 };
      let targetSpherical = { ...spherical };
      let isDragging = false;
      let lastMouse = { x: 0, y: 0 };

      const onMouseDown = (e: MouseEvent) => {
        isDragging = true;
        lastMouse = { x: e.clientX, y: e.clientY };
      };
      const onMouseUp = () => { isDragging = false; };
      const onMouseMove = (e: MouseEvent) => {
        if (!isDragging || viewMode === 'planetarium') return;
        const dx = e.clientX - lastMouse.x;
        const dy = e.clientY - lastMouse.y;
        targetSpherical.theta -= dx * 0.005;
        targetSpherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, targetSpherical.phi + dy * 0.005));
        lastMouse = { x: e.clientX, y: e.clientY };
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (viewMode === 'planetarium') return;
        targetSpherical.radius = Math.max(25, Math.min(600, targetSpherical.radius + e.deltaY * 0.25));
      };

      containerRef.current.addEventListener('mousedown', onMouseDown);
      containerRef.current.addEventListener('mouseup', onMouseUp);
      containerRef.current.addEventListener('mousemove', onMouseMove);
      containerRef.current.addEventListener('wheel', onWheel, { passive: false });

      // Animation loop
      const clock = new THREE.Clock();
      const animate = () => {
        requestAnimationFrame(animate);

        const delta = clock.getDelta();

        // Update animated materials
        updateMaterials(delta, sunMaterialRef.current || undefined);

        if (viewMode === 'orrery') {
          spherical.theta += (targetSpherical.theta - spherical.theta) * 0.08;
          spherical.phi += (targetSpherical.phi - spherical.phi) * 0.08;
          spherical.radius += (targetSpherical.radius - spherical.radius) * 0.08;

          camera.position.set(
            spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta),
            spherical.radius * Math.cos(spherical.phi),
            spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta)
          );
          camera.lookAt(0, 0, 0);
        }

        renderer.render(scene, camera);
      };
      animate();

      // Resize handler
      const handleResize = () => {
        const w = containerRef.current?.clientWidth || window.innerWidth;
        const h = containerRef.current?.clientHeight || window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        containerRef.current?.removeEventListener('mousedown', onMouseDown);
        containerRef.current?.removeEventListener('mouseup', onMouseUp);
        containerRef.current?.removeEventListener('mousemove', onMouseMove);
        containerRef.current?.removeEventListener('wheel', onWheel);
        renderer.dispose();
        if (containerRef.current?.contains(renderer.domElement)) {
          containerRef.current?.removeChild(renderer.domElement);
        }
      };
    }, []);

    // Update planet positions
    useEffect(() => {
      Object.entries(PLANETS).forEach(([key, planet]) => {
        const mesh = planetMeshesRef.current[key];
        if (!mesh) return;

        const pos = getPlanetPosition(planet, simTime, orbitScale);
        mesh.position.set(pos.x, pos.y, pos.z);

        if (key === 'saturn' && saturnRingsRef.current) {
          saturnRingsRef.current.position.set(pos.x, pos.y, pos.z);
        }
      });
    }, [simTime, orbitScale]);

    // Toggle orbits visibility
    useEffect(() => {
      Object.values(orbitLinesRef.current).forEach(line => {
        if (line) line.visible = showOrbits && viewMode === 'orrery';
      });
    }, [showOrbits, viewMode]);

    // Time animation
    useEffect(() => {
      if (!isPlaying) return;
      const interval = setInterval(() => {
        setSimTime(t => t + speed / 86400);
      }, 16);
      return () => clearInterval(interval);
    }, [isPlaying, speed, setSimTime]);

    // Notify view mode change
    useEffect(() => {
      if (onViewModeChange) {
        onViewModeChange(viewMode);
      }
    }, [viewMode, onViewModeChange]);

    // Notify date change
    useEffect(() => {
      if (onDateChange) {
        onDateChange(currentDate);
      }
    }, [currentDate, onDateChange]);

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          width: '100%',
          height: '100%',
          cursor: viewMode === 'orrery' ? 'grab' : 'crosshair',
          ...style
        }}
      />
    );
  }
);

CelestialOrreryCore.displayName = 'CelestialOrreryCore';

export default CelestialOrreryCore;
