import { useState, useCallback, useEffect, useRef } from 'react';
import { DeckGL } from '@deck.gl/react';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { MapView } from '@deck.gl/core';
import type { MapViewState } from '@deck.gl/core';
import gsap from 'gsap';
import type { Conflict } from '../../types';
import { GSAP_EASE } from '../../hooks/useRevealAnimation';
import styles from './WorldMap.module.scss';

interface WorldMapProps {
  conflicts: Conflict[];
  selectedConflict: Conflict | null;
  onConflictClick: (conflict: Conflict) => void;
  hoveredConflict: Conflict | null;
  onConflictHover: (conflict: Conflict | null) => void;
  ready: boolean;
}

const MIN_ZOOM = 1.8;
const MAX_ZOOM = 5;
const SMOOTH_HALF_LIFE = 60;
const ZOOM_SENSITIVITY = 0.002;
const MOMENTUM_SCALE = 220;
const PULSE_PERIOD = 3000;

function clampPan(lng: number, lat: number, zoom: number) {
  const t = (zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
  const maxLng = 40 + t * 140;
  const maxLat = 30 + t * 55;
  return {
    longitude: Math.max(-maxLng, Math.min(maxLng, lng)),
    latitude: Math.max(-maxLat, Math.min(maxLat, lat)),
  };
}

const INITIAL_VIEW_STATE: MapViewState = {
  longitude: 20,
  latitude: 20,
  zoom: 2.0,
  pitch: 0,
  bearing: 0,
};

function normalizeWheelDelta(e: WheelEvent): number {
  let delta = e.deltaY;
  if (e.deltaMode === 1) delta *= 40;
  else if (e.deltaMode === 2) delta *= 800;
  return delta;
}

const INTENSITY_COLORS: Record<string, [number, number, number]> = {
  major_war: [183, 28, 28],
  war: [198, 40, 40],
  minor_conflict: [211, 47, 47],
  skirmish: [229, 115, 115],
};

const INTENSITY_GLOW: Record<string, [number, number, number, number]> = {
  major_war: [183, 28, 28, 120],
  war: [198, 40, 40, 90],
  minor_conflict: [211, 47, 47, 60],
  skirmish: [229, 115, 115, 40],
};

function splitAtAntiMeridian(mesh: any): any {
  if (mesh.type !== 'MultiLineString') return mesh;
  const newLines: number[][][] = [];
  for (const line of mesh.coordinates) {
    let segment: number[][] = [line[0]];
    for (let i = 1; i < line.length; i++) {
      if (Math.abs(line[i][0] - line[i - 1][0]) > 90) {
        if (segment.length > 1) newLines.push(segment);
        segment = [line[i]];
      } else {
        segment.push(line[i]);
      }
    }
    if (segment.length > 1) newLines.push(segment);
  }
  return { ...mesh, coordinates: newLines };
}

const LAND_TILE_SIZE = 512;
const LAND_BASE_ZOOM = 2;
const LAND_PX = LAND_TILE_SIZE * Math.pow(2, LAND_BASE_ZOOM);

function lngToMercX(lng: number): number {
  return ((lng + 180) / 360) * LAND_PX;
}

function latToMercY(lat: number): number {
  const latRad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * LAND_PX;
}

function renderLandToCanvas(featureCollection: any): HTMLCanvasElement {
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = LAND_PX * dpr;
  canvas.height = LAND_PX * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();

  const traceRing = (coords: number[][]) => {
    for (let i = 0; i < coords.length; i++) {
      const x = lngToMercX(coords[i][0]);
      const lat = Math.max(-85, Math.min(85, coords[i][1]));
      const y = latToMercY(lat);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  const features = featureCollection.type === 'FeatureCollection'
    ? featureCollection.features
    : [featureCollection];

  for (const f of features) {
    const geom = f.geometry || f;
    if (geom.type === 'Polygon') {
      traceRing(geom.coordinates[0]);
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates)
        traceRing(poly[0]);
    }
  }

  ctx.fill();
  return canvas;
}

function getRadius(conflict: Conflict): number {
  const deaths = conflict.deathToll.total;
  return Math.max(8000, Math.log10(Math.max(deaths, 1)) * 12000);
}

function getGlowRadius(conflict: Conflict): number {
  return getRadius(conflict) * 2.5;
}

export default function WorldMap({
  conflicts,
  selectedConflict,
  onConflictClick,
  hoveredConflict,
  onConflictHover,
  ready,
}: WorldMapProps) {
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW_STATE);
  const [renderTick, setRenderTick] = useState(0);
  const pulseRafRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const landFillRef = useRef<HTMLDivElement>(null);
  const [geoData, setGeoData] = useState<{ borders: any; land: any; landCanvas: HTMLCanvasElement } | null>(null);

  const viewStateRef = useRef(viewState);
  viewStateRef.current = viewState;

  const panRef = useRef({
    active: false,
    lastX: 0,
    lastY: 0,
    startX: 0,
    startY: 0,
    vx: 0,
    vy: 0,
    lastTime: 0,
  });
  const savedViewRef = useRef<MapViewState | null>(null);
  const prevSelectedRef = useRef<Conflict | null>(null);
  const flyTweenRef = useRef<gsap.core.Tween | null>(null);

  const targetRef = useRef({
    longitude: INITIAL_VIEW_STATE.longitude,
    latitude: INITIAL_VIEW_STATE.latitude,
    zoom: INITIAL_VIEW_STATE.zoom,
  });
  const smoothRafRef = useRef(0);
  const isSmoothingRef = useRef(false);
  const lastSmoothTimeRef = useRef(0);

  const pixelToGeo = useCallback((dxPx: number, dyPx: number, zoom: number) => {
    const worldSize = 512 * Math.pow(2, zoom);
    return {
      dlng: (dxPx / worldSize) * 360,
      dlat: -(dyPx / worldSize) * 360,
    };
  }, []);

  // Unified smoothing loop — interpolates viewState toward targetRef with half-life decay.
  // All user interactions (drag, momentum, zoom) update targetRef; this loop handles the visual.
  const startSmoothing = useCallback(() => {
    if (isSmoothingRef.current) return;
    isSmoothingRef.current = true;
    lastSmoothTimeRef.current = 0;

    const tick = () => {
      if (flyTweenRef.current) {
        isSmoothingRef.current = false;
        return;
      }

      const now = performance.now();
      const dt = lastSmoothTimeRef.current
        ? Math.min(now - lastSmoothTimeRef.current, 50)
        : 16.67;
      lastSmoothTimeRef.current = now;

      const current = viewStateRef.current;
      const target = targetRef.current;

      const dLng = target.longitude - current.longitude;
      const dLat = target.latitude - current.latitude;
      const dZoom = target.zoom - current.zoom;

      if (Math.abs(dLng) < 0.0001 && Math.abs(dLat) < 0.0001 && Math.abs(dZoom) < 0.0005) {
        setViewState(prev => ({
          ...prev,
          longitude: target.longitude,
          latitude: target.latitude,
          zoom: target.zoom,
        }));
        isSmoothingRef.current = false;
        lastSmoothTimeRef.current = 0;
        return;
      }

      const factor = 1 - Math.pow(0.5, dt / SMOOTH_HALF_LIFE);
      setViewState(prev => ({
        ...prev,
        longitude: prev.longitude + dLng * factor,
        latitude: prev.latitude + dLat * factor,
        zoom: prev.zoom + dZoom * factor,
      }));

      smoothRafRef.current = requestAnimationFrame(tick);
    };
    smoothRafRef.current = requestAnimationFrame(tick);
  }, []);

  // Custom drag panning — updates target, smoothing loop provides inertia
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;

      cancelAnimationFrame(smoothRafRef.current);
      isSmoothingRef.current = false;

      if (flyTweenRef.current) {
        flyTweenRef.current.kill();
        flyTweenRef.current = null;
      }

      const current = viewStateRef.current;
      targetRef.current.longitude = current.longitude;
      targetRef.current.latitude = current.latitude;
      targetRef.current.zoom = current.zoom;

      panRef.current = {
        active: false,
        lastX: e.clientX,
        lastY: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        vx: 0,
        vy: 0,
        lastTime: performance.now(),
      };

      const onMove = (e2: PointerEvent) => {
        const p = panRef.current;
        const dx = e2.clientX - p.startX;
        const dy = e2.clientY - p.startY;
        if (!p.active && Math.hypot(dx, dy) < 3) return;
        p.active = true;

        const moveDx = e2.clientX - p.lastX;
        const moveDy = e2.clientY - p.lastY;
        const now = performance.now();
        const dt = Math.max(now - p.lastTime, 1);

        const a = 0.4;
        p.vx = a * (moveDx / dt) + (1 - a) * p.vx;
        p.vy = a * (moveDy / dt) + (1 - a) * p.vy;
        p.lastX = e2.clientX;
        p.lastY = e2.clientY;
        p.lastTime = now;

        const { dlng, dlat } = pixelToGeo(moveDx, moveDy, viewStateRef.current.zoom);
        const clamped = clampPan(
          targetRef.current.longitude - dlng,
          targetRef.current.latitude - dlat,
          viewStateRef.current.zoom
        );
        targetRef.current.longitude = clamped.longitude;
        targetRef.current.latitude = clamped.latitude;
        startSmoothing();
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (!panRef.current.active) return;
        panRef.current.active = false;

        const { vx, vy } = panRef.current;
        if (Math.hypot(vx, vy) < 0.003) return;

        const { dlng, dlat } = pixelToGeo(
          vx * MOMENTUM_SCALE,
          vy * MOMENTUM_SCALE,
          viewStateRef.current.zoom
        );
        const clamped = clampPan(
          targetRef.current.longitude - dlng,
          targetRef.current.latitude - dlat,
          viewStateRef.current.zoom
        );
        targetRef.current.longitude = clamped.longitude;
        targetRef.current.latitude = clamped.latitude;
        startSmoothing();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };

    el.addEventListener('pointerdown', onDown);
    return () => {
      cancelAnimationFrame(smoothRafRef.current);
      el.removeEventListener('pointerdown', onDown);
    };
  }, [pixelToGeo, startSmoothing]);

  // Smooth zoom — wheel events update target, smoothing loop handles interpolation
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (flyTweenRef.current) {
        flyTweenRef.current.kill();
        flyTweenRef.current = null;
      }

      const delta = normalizeWheelDelta(e);
      const oldTarget = targetRef.current.zoom;
      const newTarget = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, oldTarget - delta * ZOOM_SENSITIVITY)
      );

      const cx = el.clientWidth / 2;
      const cy = el.clientHeight / 2;
      const geoFactor = 360 / 512;
      const oldInv = 1 / Math.pow(2, oldTarget);
      const newInv = 1 / Math.pow(2, newTarget);
      const dlng = (e.clientX - cx) * geoFactor * (oldInv - newInv);
      const dlat = -(e.clientY - cy) * geoFactor * (oldInv - newInv);

      targetRef.current.zoom = newTarget;
      const clamped = clampPan(
        targetRef.current.longitude + dlng,
        targetRef.current.latitude + dlat,
        newTarget
      );
      targetRef.current.longitude = clamped.longitude;
      targetRef.current.latitude = clamped.latitude;
      startSmoothing();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [startSmoothing]);

  // Restore view when panel closes (selectedConflict goes from non-null to null)
  useEffect(() => {
    if (prevSelectedRef.current && !selectedConflict && savedViewRef.current) {
      const saved = savedViewRef.current;
      const animTarget = { ...viewStateRef.current };
      cancelAnimationFrame(smoothRafRef.current);
      isSmoothingRef.current = false;

      flyTweenRef.current = gsap.to(animTarget, {
        longitude: saved.longitude,
        latitude: saved.latitude,
        zoom: saved.zoom,
        duration: 1.2,
        ease: GSAP_EASE.emphasizedDecelerate,
        onUpdate: () => {
          targetRef.current.longitude = animTarget.longitude;
          targetRef.current.latitude = animTarget.latitude;
          targetRef.current.zoom = animTarget.zoom;
          setViewState({ ...animTarget, pitch: 0, bearing: 0 });
        },
        onComplete: () => {
          flyTweenRef.current = null;
          savedViewRef.current = null;
        },
      });
    }
    prevSelectedRef.current = selectedConflict;
  }, [selectedConflict]);

  useEffect(() => {
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(r => r.json())
      .then(topology => {
        import('topojson-client').then(topojson => {
          const borders = splitAtAntiMeridian(
            topojson.mesh(topology, topology.objects.countries, (a: any, b: any) => a !== b)
          );
          const land = splitAtAntiMeridian(
            topojson.mesh(topology, topology.objects.land)
          );
          const countries = topojson.feature(topology, topology.objects.countries);
          const landCanvas = renderLandToCanvas(countries);
          setGeoData({ borders, land, landCanvas });
        });
      });
  }, []);

  // Mount pre-rendered land canvas into the DOM
  useEffect(() => {
    const el = landFillRef.current;
    if (!el || !geoData) return;
    el.innerHTML = '';
    const canvas = geoData.landCanvas;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    el.appendChild(canvas);
  }, [geoData]);

  // Pulse animation — rAF-driven, throttled to ~24fps to avoid unnecessary renders
  useEffect(() => {
    if (!ready) return;
    let lastTime = 0;
    const tick = (time: number) => {
      if (time - lastTime >= 42) {
        setRenderTick(t => t + 1);
        lastTime = time;
      }
      pulseRafRef.current = requestAnimationFrame(tick);
    };
    pulseRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(pulseRafRef.current);
  }, [ready]);

  // Reveal animation
  useEffect(() => {
    if (!ready || !containerRef.current) return;
    gsap.fromTo(
      containerRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 1.5, ease: GSAP_EASE.emphasized }
    );
  }, [ready]);

  const handleConflictClick = useCallback(
    (conflict: Conflict) => {
      onConflictClick(conflict);
      cancelAnimationFrame(smoothRafRef.current);
      isSmoothingRef.current = false;
      if (flyTweenRef.current) flyTweenRef.current.kill();

      savedViewRef.current = { ...viewState };
      const animTarget = { ...viewState };

      flyTweenRef.current = gsap.to(animTarget, {
        longitude: conflict.coordinates.lng,
        latitude: conflict.coordinates.lat,
        zoom: 4,
        duration: 1.2,
        ease: GSAP_EASE.emphasizedDecelerate,
        onUpdate: () => {
          targetRef.current.longitude = animTarget.longitude;
          targetRef.current.latitude = animTarget.latitude;
          targetRef.current.zoom = animTarget.zoom;
          setViewState({ ...animTarget, pitch: 0, bearing: 0 });
        },
        onComplete: () => { flyTweenRef.current = null; },
      });
    },
    [onConflictClick, viewState]
  );

  const pulsePhase = (Date.now() % PULSE_PERIOD) / PULSE_PERIOD;
  void renderTick;

  const landFillTransform = (() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const scale = Math.pow(2, viewState.zoom) / Math.pow(2, LAND_BASE_ZOOM);
    const cx = lngToMercX(viewState.longitude) * scale;
    const latClamped = Math.max(-85, Math.min(85, viewState.latitude));
    const cy = latToMercY(latClamped) * scale;
    const tx = vw / 2 - cx;
    const ty = vh / 2 - cy;
    return {
      transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
      width: LAND_PX,
      height: LAND_PX,
    };
  })();

  const layers = [
    geoData &&
      new GeoJsonLayer({
        id: 'land-glow',
        data: geoData.land,
        filled: false,
        stroked: true,
        getLineColor: [255, 255, 255, 18],
        getLineWidth: 1,
        lineWidthMinPixels: 3,
        lineWidthMaxPixels: 5,
        pickable: false,
      }),

    geoData &&
      new GeoJsonLayer({
        id: 'land',
        data: geoData.land,
        filled: false,
        stroked: true,
        getLineColor: [255, 255, 255, 60],
        getLineWidth: 1,
        lineWidthMinPixels: 1,
        lineWidthMaxPixels: 2,
        pickable: false,
      }),
    geoData &&
      new GeoJsonLayer({
        id: 'borders',
        data: geoData.borders,
        filled: false,
        stroked: true,
        getLineColor: [255, 255, 255, 40],
        getLineWidth: 1,
        lineWidthMinPixels: 0.8,
        lineWidthMaxPixels: 1.5,
        pickable: false,
      }),

    // Glow layer (larger, more transparent circles behind markers)
    new ScatterplotLayer({
      id: 'conflict-glow',
      data: conflicts,
      getPosition: (d: Conflict) => [d.coordinates.lng, d.coordinates.lat],
      getRadius: (d: Conflict) => getGlowRadius(d) * (1 + Math.sin(pulsePhase * Math.PI * 2) * 0.3),
      getFillColor: (d: Conflict) => INTENSITY_GLOW[d.intensity] || [229, 115, 115, 40],
      radiusUnits: 'meters',
      radiusScale: 1,
      pickable: false,
      opacity: 0.4 + Math.sin(pulsePhase * Math.PI * 2) * 0.15,
      radiusMinPixels: 8,
      radiusMaxPixels: 80,
    }),

    // Main conflict markers
    new ScatterplotLayer({
      id: 'conflict-markers',
      data: conflicts,
      getPosition: (d: Conflict) => [d.coordinates.lng, d.coordinates.lat],
      getRadius: (d: Conflict) => {
        const isHovered = hoveredConflict?.id === d.id;
        return getRadius(d) * (isHovered ? 1.3 : 1);
      },
      getFillColor: (d: Conflict) => {
        const base = INTENSITY_COLORS[d.intensity] || [229, 115, 115];
        const isHovered = hoveredConflict?.id === d.id;
        return [...base, isHovered ? 240 : 200] as [number, number, number, number];
      },
      radiusUnits: 'meters',
      radiusScale: 1,
      pickable: true,
      onClick: (info) => {
        if (info.object) handleConflictClick(info.object as Conflict);
      },
      onHover: (info) => {
        onConflictHover((info.object as Conflict) || null);
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 40,
      updateTriggers: {
        getRadius: [hoveredConflict?.id],
        getFillColor: [hoveredConflict?.id],
      },
    }),
  ].filter(Boolean);

  return (
    <div ref={containerRef} className={styles.mapContainer}>
      {geoData && landFillTransform && (
        <div
          ref={landFillRef}
          className={styles.landFill}
          style={{
            width: landFillTransform.width,
            height: landFillTransform.height,
            transform: landFillTransform.transform,
          }}
        />
      )}

      <DeckGL
        viewState={viewState}
        controller={{
          dragPan: false,
          dragRotate: false,
          scrollZoom: false,
          doubleClickZoom: false,
        }}
        layers={layers}
        views={new MapView({ repeat: false })}
        getCursor={({ isHovering }) => (isHovering ? 'pointer' : 'grab')}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Film grain texture */}
      <svg className={styles.grainSvg}>
        <filter id="grain-filter">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-filter)" />
      </svg>

      {/* Vignette overlay */}
      <div className={styles.vignette} />

      {/* Tooltip */}
      {hoveredConflict && (
        <div className={styles.tooltip}>
          <span className={styles.tooltipName}>{hoveredConflict.name}</span>
          <span className={styles.tooltipDeaths}>
            {hoveredConflict.deathToll.totalDisplay} deaths
          </span>
        </div>
      )}
    </div>
  );
}
