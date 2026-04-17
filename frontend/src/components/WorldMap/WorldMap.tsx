import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
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
const WORLD_SIZE = 512;

const INTENSITY_COLORS: Record<string, [number, number, number]> = {
  major_war: [183, 28, 28],
  war: [198, 40, 40],
  minor_conflict: [211, 47, 47],
  skirmish: [229, 115, 115],
};

const INTENSITY_GLOW: Record<string, [number, number, number, number]> = {
  major_war: [183, 28, 28, 180],
  war: [198, 40, 40, 140],
  minor_conflict: [211, 47, 47, 100],
  skirmish: [229, 115, 115, 70],
};

function lngToX(lng: number): number {
  return ((lng + 180) / 360) * WORLD_SIZE;
}

function latToY(lat: number): number {
  const latRad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * WORLD_SIZE;
}

function clampPan(lng: number, lat: number, zoom: number) {
  const t = (zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
  const maxLng = 40 + t * 140;
  const maxLat = 30 + t * 55;
  return {
    longitude: Math.max(-maxLng, Math.min(maxLng, lng)),
    latitude: Math.max(-maxLat, Math.min(maxLat, lat)),
  };
}

function normalizeWheelDelta(e: WheelEvent): number {
  let delta = e.deltaY;
  if (e.deltaMode === 1) delta *= 40;
  else if (e.deltaMode === 2) delta *= 800;
  return delta;
}

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

function getRadius(conflict: Conflict): number {
  const deaths = conflict.deathToll.total;
  return Math.max(8000, Math.log10(Math.max(deaths, 1)) * 12000);
}

function getGlowRadius(conflict: Conflict): number {
  return getRadius(conflict) * 3;
}

// --- Three.js geometry builders ---

function buildLineGeometry(mesh: any): THREE.BufferGeometry {
  const verts: number[] = [];
  const coords = mesh.coordinates as number[][][];
  for (const line of coords) {
    for (let i = 0; i < line.length - 1; i++) {
      verts.push(lngToX(line[i][0]), -latToY(line[i][1]), 0);
      verts.push(lngToX(line[i + 1][0]), -latToY(line[i + 1][1]), 0);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  return geom;
}

const LAND_TEX_SIZE = 4096;

function crossesAntiMeridian(ring: number[][]): boolean {
  for (let i = 1; i < ring.length; i++) {
    if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) return true;
  }
  return false;
}

function splitRingAtAntiMeridian(ring: number[][]): number[][][] {
  // Split a polygon ring into two halves: one for the eastern hemisphere, one for western
  const west: number[][] = [];
  const east: number[][] = [];
  for (const pt of ring) {
    if (pt[0] < 0) {
      west.push(pt);
      east.push([pt[0] + 360, pt[1]]);
    } else {
      east.push(pt);
      west.push([pt[0] - 360, pt[1]]);
    }
  }
  return [east, west];
}

function drawRingOnCanvas(ctx: CanvasRenderingContext2D, ring: number[][]) {
  if (ring.length < 3) return;
  const sx = (ring[0][0] + 180) / 360 * LAND_TEX_SIZE;
  const sy = latToTexY(ring[0][1]);
  ctx.moveTo(sx, sy);
  for (let i = 1; i < ring.length; i++) {
    ctx.lineTo((ring[i][0] + 180) / 360 * LAND_TEX_SIZE, latToTexY(ring[i][1]));
  }
  ctx.closePath();
}

function renderLandToCanvasTexture(featureCollection: any): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = LAND_TEX_SIZE;
  canvas.height = LAND_TEX_SIZE;
  const ctx = canvas.getContext('2d')!;

  const features = featureCollection.type === 'FeatureCollection'
    ? featureCollection.features
    : [featureCollection];

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();

  for (const f of features) {
    const geom = f.geometry || f;
    const polygons: number[][][][] =
      geom.type === 'Polygon' ? [geom.coordinates] :
      geom.type === 'MultiPolygon' ? geom.coordinates : [];

    for (const polygon of polygons) {
      const exterior = polygon[0];
      if (!exterior || exterior.length < 3) continue;

      if (crossesAntiMeridian(exterior)) {
        const [east, west] = splitRingAtAntiMeridian(exterior);
        drawRingOnCanvas(ctx, east);
        drawRingOnCanvas(ctx, west);
      } else {
        drawRingOnCanvas(ctx, exterior);
      }
    }
  }
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function latToTexY(lat: number): number {
  const clamped = Math.max(-85, Math.min(85, lat));
  const latRad = (clamped * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * LAND_TEX_SIZE;
}

// --- Marker shaders ---

const markerVertexShader = `
  attribute vec3 instancePosition;
  attribute float instanceRadius;
  attribute vec4 instanceColor;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    vUv = position.xy;
    vColor = instanceColor / 255.0;
    vec3 pos = instancePosition + vec3(position.xy * instanceRadius, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const markerFragmentShader = `
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    float dist = length(vUv);
    if (dist > 1.0) discard;
    float fill = smoothstep(1.0, 0.8, dist);
    float ring = smoothstep(0.65, 0.82, dist) * smoothstep(1.0, 0.88, dist);
    float alpha = vColor.a * fill;
    vec3 col = vColor.rgb + vec3(ring * 0.45);
    gl_FragColor = vec4(col, alpha);
  }
`;

const regionDotFragmentShader = `
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    float dist = length(vUv);
    if (dist > 1.0) discard;
    float falloff = 1.0 - dist * dist;
    float alpha = vColor.a * falloff;
    gl_FragColor = vec4(vColor.rgb, alpha);
  }
`;

const glowVertexShader = `
  attribute vec3 instancePosition;
  attribute float instanceRadius;
  attribute vec4 instanceColor;
  uniform float uPulse;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    vUv = position.xy;
    vColor = instanceColor / 255.0;
    float r = instanceRadius * (1.0 + sin(uPulse * 6.2832) * 0.3);
    vec3 pos = instancePosition + vec3(position.xy * r, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const glowFragmentShader = `
  varying vec2 vUv;
  varying vec4 vColor;
  uniform float uPulse;
  void main() {
    float dist = length(vUv);
    if (dist > 1.0) discard;
    float falloff = 1.0 - dist * dist;
    float pulse = 0.6 + sin(uPulse * 6.2832) * 0.25;
    float alpha = vColor.a * falloff * falloff * pulse;
    gl_FragColor = vec4(vColor.rgb, alpha);
  }
`;

// --- Pixel-to-geo conversion ---

function pixelToGeo(dxPx: number, dyPx: number, zoom: number) {
  const worldSize = 512 * Math.pow(2, zoom);
  return {
    dlng: (dxPx / worldSize) * 360,
    dlat: -(dyPx / worldSize) * 360,
  };
}

export default function WorldMap({
  conflicts,
  selectedConflict,
  onConflictClick,
  hoveredConflict,
  onConflictHover,
  ready,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    glowMaterial: THREE.ShaderMaterial;
    markerMaterial: THREE.ShaderMaterial;
    regionDotMaterial: THREE.ShaderMaterial;
    glowMesh: THREE.Mesh | null;
    markerMesh: THREE.Mesh | null;
    regionGlowMesh: THREE.Mesh | null;
    regionMarkerMesh: THREE.Mesh | null;
    markerPlanes: THREE.Mesh[];
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
  } | null>(null);

  const viewRef = useRef({
    longitude: 20, latitude: 20, zoom: 2.0,
  });
  const targetRef = useRef({
    longitude: 20, latitude: 20, zoom: 2.0,
  });
  const panRef = useRef({
    active: false, lastX: 0, lastY: 0, startX: 0, startY: 0,
    vx: 0, vy: 0, lastTime: 0,
  });
  const smoothingRef = useRef(false);
  const lastSmoothTimeRef = useRef(0);
  const smoothRafRef = useRef(0);
  const flyTweenRef = useRef<gsap.core.Tween | null>(null);
  const savedViewRef = useRef<{ longitude: number; latitude: number; zoom: number } | null>(null);
  const prevSelectedRef = useRef<Conflict | null>(null);
  const conflictsRef = useRef(conflicts);
  conflictsRef.current = conflicts;
  const onConflictClickRef = useRef(onConflictClick);
  onConflictClickRef.current = onConflictClick;
  const onConflictHoverRef = useRef(onConflictHover);
  onConflictHoverRef.current = onConflictHover;

  const updateCamera = useCallback(() => {
    const t = threeRef.current;
    if (!t) return;
    const el = containerRef.current!;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const v = viewRef.current;

    const worldPxPerCssPx = Math.pow(2, v.zoom);
    const halfW = (vw / worldPxPerCssPx) / 2;
    const halfH = (vh / worldPxPerCssPx) / 2;
    const cx = lngToX(v.longitude);
    const cy = -latToY(v.latitude);

    t.camera.left = cx - halfW;
    t.camera.right = cx + halfW;
    t.camera.top = cy + halfH;
    t.camera.bottom = cy - halfH;
    t.camera.updateProjectionMatrix();
  }, []);

  // --- Three.js initialization ---
  useEffect(() => {
    const container = containerRef.current!;
    const canvas = canvasRef.current!;

    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);

    const glowMaterial = new THREE.ShaderMaterial({
      vertexShader: glowVertexShader,
      fragmentShader: glowFragmentShader,
      uniforms: { uPulse: { value: 0 } },
      transparent: true,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    const markerMaterial = new THREE.ShaderMaterial({
      vertexShader: markerVertexShader,
      fragmentShader: markerFragmentShader,
      transparent: true,
      depthTest: false,
    });

    const regionDotMaterial = new THREE.ShaderMaterial({
      vertexShader: markerVertexShader,
      fragmentShader: regionDotFragmentShader,
      transparent: true,
      depthTest: false,
      blending: THREE.NormalBlending,
    });

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    threeRef.current = {
      renderer, scene, camera,
      glowMaterial, markerMaterial, regionDotMaterial,
      glowMesh: null, markerMesh: null,
      regionGlowMesh: null, regionMarkerMesh: null,
      markerPlanes: [],
      raycaster, mouse,
    };

    // Load geo data
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

          // Land fill via Canvas 2D texture (avoids triangulation artifacts)
          const landTex = renderLandToCanvasTexture(countries);
          const x0 = lngToX(-180);
          const x1 = lngToX(180);
          const y0 = -latToY(85);
          const y1 = -latToY(-85);
          const landQuadGeom = new THREE.PlaneGeometry(x1 - x0, y0 - y1);
          const landMesh = new THREE.Mesh(landQuadGeom, new THREE.MeshBasicMaterial({
            map: landTex, transparent: true, opacity: 0.03,
            depthTest: false, side: THREE.DoubleSide,
          }));
          landMesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
          landMesh.renderOrder = 0;
          scene.add(landMesh);

          // Coastline glow (wider, fainter)
          const coastGlowGeom = buildLineGeometry(land);
          const coastGlow = new THREE.LineSegments(coastGlowGeom, new THREE.LineBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.07, linewidth: 1,
          }));
          coastGlow.renderOrder = 1;
          scene.add(coastGlow);

          // Coastlines
          const coastGeom = buildLineGeometry(land);
          const coastLines = new THREE.LineSegments(coastGeom, new THREE.LineBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.24,
          }));
          coastLines.renderOrder = 2;
          scene.add(coastLines);

          // Borders
          const borderGeom = buildLineGeometry(borders);
          const borderLines = new THREE.LineSegments(borderGeom, new THREE.LineBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.16,
          }));
          borderLines.renderOrder = 3;
          scene.add(borderLines);

          updateCamera();
        });
      });

    // Render loop
    let animId = 0;
    const tick = () => {
      animId = requestAnimationFrame(tick);
      const t = threeRef.current;
      if (!t) return;

      // Smoothing interpolation
      if (smoothingRef.current && !flyTweenRef.current) {
        const now = performance.now();
        const dt = lastSmoothTimeRef.current
          ? Math.min(now - lastSmoothTimeRef.current, 50) : 16.67;
        lastSmoothTimeRef.current = now;
        const v = viewRef.current;
        const tgt = targetRef.current;
        const dLng = tgt.longitude - v.longitude;
        const dLat = tgt.latitude - v.latitude;
        const dZoom = tgt.zoom - v.zoom;
        if (Math.abs(dLng) < 0.0001 && Math.abs(dLat) < 0.0001 && Math.abs(dZoom) < 0.0005) {
          v.longitude = tgt.longitude;
          v.latitude = tgt.latitude;
          v.zoom = tgt.zoom;
          smoothingRef.current = false;
          lastSmoothTimeRef.current = 0;
        } else {
          const factor = 1 - Math.pow(0.5, dt / SMOOTH_HALF_LIFE);
          v.longitude += dLng * factor;
          v.latitude += dLat * factor;
          v.zoom += dZoom * factor;
        }
        updateCamera();
      }

      // Update pulse uniform
      const pulse = (Date.now() % PULSE_PERIOD) / PULSE_PERIOD;
      t.glowMaterial.uniforms.uPulse.value = pulse;

      t.renderer.render(t.scene, t.camera);
    };
    animId = requestAnimationFrame(tick);

    // Resize handler
    const onResize = () => {
      const t = threeRef.current;
      if (!t) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      t.renderer.setSize(w, h);
      updateCamera();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      renderer.dispose();
      threeRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateCamera]);

  // --- Update markers when conflicts change ---
  useEffect(() => {
    const t = threeRef.current;
    if (!t || conflicts.length === 0) return;

    // Remove old meshes
    if (t.glowMesh) { t.scene.remove(t.glowMesh); t.glowMesh.geometry.dispose(); }
    if (t.markerMesh) { t.scene.remove(t.markerMesh); t.markerMesh.geometry.dispose(); }
    t.markerPlanes.forEach(m => { t.scene.remove(m); m.geometry.dispose(); });
    t.markerPlanes = [];

    const count = conflicts.length;

    // Build per-instance data
    const glowPos = new Float32Array(count * 3);
    const glowRadius = new Float32Array(count);
    const glowColor = new Float32Array(count * 4);
    const mPos = new Float32Array(count * 3);
    const mRadius = new Float32Array(count);
    const mColor = new Float32Array(count * 4);

    for (let i = 0; i < count; i++) {
      const c = conflicts[i];
      const x = lngToX(c.coordinates.lng);
      const y = -latToY(c.coordinates.lat);
      const rWorld = getRadius(c) / 111320 * (WORLD_SIZE / 360);
      const grWorld = getGlowRadius(c) / 111320 * (WORLD_SIZE / 360);

      glowPos[i * 3] = x;
      glowPos[i * 3 + 1] = y;
      glowPos[i * 3 + 2] = 0;
      glowRadius[i] = grWorld;
      const gc = INTENSITY_GLOW[c.intensity] || [229, 115, 115, 40];
      glowColor[i * 4] = gc[0];
      glowColor[i * 4 + 1] = gc[1];
      glowColor[i * 4 + 2] = gc[2];
      glowColor[i * 4 + 3] = gc[3];

      mPos[i * 3] = x;
      mPos[i * 3 + 1] = y;
      mPos[i * 3 + 2] = 0;
      mRadius[i] = rWorld;
      const mc = INTENSITY_COLORS[c.intensity] || [229, 115, 115];
      mColor[i * 4] = mc[0];
      mColor[i * 4 + 1] = mc[1];
      mColor[i * 4 + 2] = mc[2];
      mColor[i * 4 + 3] = 200;

      // Invisible plane for raycasting — use glow radius for a larger hit area
      const hitSize = grWorld * 2;
      const planeGeom = new THREE.PlaneGeometry(hitSize, hitSize);
      const planeMat = new THREE.MeshBasicMaterial({ visible: false });
      const plane = new THREE.Mesh(planeGeom, planeMat);
      plane.position.set(x, y, 0.01);
      plane.userData = { conflict: c, index: i };
      t.scene.add(plane);
      t.markerPlanes.push(plane);
    }

    // Use InstancedBufferGeometry for full control (no InstancedMesh conflicts)
    const baseQuad = new THREE.PlaneGeometry(2, 2);

    const glowGeom = new THREE.InstancedBufferGeometry();
    glowGeom.index = baseQuad.index;
    glowGeom.setAttribute('position', baseQuad.getAttribute('position'));
    glowGeom.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(glowPos, 3));
    glowGeom.setAttribute('instanceRadius', new THREE.InstancedBufferAttribute(glowRadius, 1));
    glowGeom.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(glowColor, 4));
    glowGeom.instanceCount = count;
    const glowMesh = new THREE.Mesh(glowGeom, t.glowMaterial);
    glowMesh.renderOrder = 4;
    glowMesh.frustumCulled = false;
    t.scene.add(glowMesh);
    t.glowMesh = glowMesh;

    const markerGeom = new THREE.InstancedBufferGeometry();
    markerGeom.index = baseQuad.index;
    markerGeom.setAttribute('position', baseQuad.getAttribute('position'));
    markerGeom.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(mPos, 3));
    markerGeom.setAttribute('instanceRadius', new THREE.InstancedBufferAttribute(mRadius, 1));
    markerGeom.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(mColor, 4));
    markerGeom.instanceCount = count;
    const markerMesh = new THREE.Mesh(markerGeom, t.markerMaterial);
    markerMesh.renderOrder = 5;
    markerMesh.frustumCulled = false;
    t.scene.add(markerMesh);
    t.markerMesh = markerMesh;

    // --- Render affected region dots (subtle, no glow) ---
    if (t.regionGlowMesh) { t.scene.remove(t.regionGlowMesh); t.regionGlowMesh.geometry.dispose(); }
    if (t.regionMarkerMesh) { t.scene.remove(t.regionMarkerMesh); t.regionMarkerMesh.geometry.dispose(); }
    t.regionGlowMesh = null;

    const allRegions: { lat: number; lng: number; eventCount: number; intensity: string }[] = [];
    for (const c of conflicts) {
      if (!c.affectedRegions) continue;
      for (const r of c.affectedRegions) {
        allRegions.push({ ...r, intensity: c.intensity });
      }
    }

    if (allRegions.length > 0) {
      const rCount = allRegions.length;
      const rMPos = new Float32Array(rCount * 3);
      const rMRadius = new Float32Array(rCount);
      const rMColor = new Float32Array(rCount * 4);

      const REGION_COLOR: [number, number, number] = [140, 35, 25];
      const BASE_DOT_RADIUS = 0.3;
      const MAX_DOT_RADIUS = 1.0;

      for (let i = 0; i < rCount; i++) {
        const reg = allRegions[i];
        const rx = lngToX(reg.lng);
        const ry = -latToY(reg.lat);

        const scaleFactor = Math.min(MAX_DOT_RADIUS, BASE_DOT_RADIUS + Math.log10(Math.max(reg.eventCount, 1)) * 0.2);
        const dotWorld = scaleFactor * (WORLD_SIZE / 360);

        rMPos[i * 3] = rx;
        rMPos[i * 3 + 1] = ry;
        rMPos[i * 3 + 2] = 0;
        rMRadius[i] = dotWorld;
        const alphaScale = Math.min(1, 0.3 + reg.eventCount / 150);
        rMColor[i * 4] = REGION_COLOR[0];
        rMColor[i * 4 + 1] = REGION_COLOR[1];
        rMColor[i * 4 + 2] = REGION_COLOR[2];
        rMColor[i * 4 + 3] = 180 * alphaScale;
      }

      const regionMarkerGeom = new THREE.InstancedBufferGeometry();
      regionMarkerGeom.index = baseQuad.index;
      regionMarkerGeom.setAttribute('position', baseQuad.getAttribute('position'));
      regionMarkerGeom.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(rMPos, 3));
      regionMarkerGeom.setAttribute('instanceRadius', new THREE.InstancedBufferAttribute(rMRadius, 1));
      regionMarkerGeom.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(rMColor, 4));
      regionMarkerGeom.instanceCount = rCount;
      const rMarkerMesh = new THREE.Mesh(regionMarkerGeom, t.regionDotMaterial);
      rMarkerMesh.renderOrder = 3.5;
      rMarkerMesh.frustumCulled = false;
      t.scene.add(rMarkerMesh);
      t.regionMarkerMesh = rMarkerMesh;
    }

    updateCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflicts, updateCamera]);

  // --- Pointer interactions ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const startSmoothing = () => {
      if (smoothingRef.current) return;
      smoothingRef.current = true;
      lastSmoothTimeRef.current = 0;
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      smoothingRef.current = false;
      cancelAnimationFrame(smoothRafRef.current);
      if (flyTweenRef.current) {
        flyTweenRef.current.kill();
        flyTweenRef.current = null;
      }
      const v = viewRef.current;
      targetRef.current.longitude = v.longitude;
      targetRef.current.latitude = v.latitude;
      targetRef.current.zoom = v.zoom;

      panRef.current = {
        active: false, lastX: e.clientX, lastY: e.clientY,
        startX: e.clientX, startY: e.clientY,
        vx: 0, vy: 0, lastTime: performance.now(),
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

        const { dlng, dlat } = pixelToGeo(moveDx, moveDy, viewRef.current.zoom);
        const clamped = clampPan(
          targetRef.current.longitude - dlng,
          targetRef.current.latitude - dlat,
          viewRef.current.zoom
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
          vx * MOMENTUM_SCALE, vy * MOMENTUM_SCALE,
          viewRef.current.zoom
        );
        const clamped = clampPan(
          targetRef.current.longitude - dlng,
          targetRef.current.latitude - dlat,
          viewRef.current.zoom
        );
        targetRef.current.longitude = clamped.longitude;
        targetRef.current.latitude = clamped.latitude;
        startSmoothing();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (flyTweenRef.current) {
        flyTweenRef.current.kill();
        flyTweenRef.current = null;
      }
      const delta = normalizeWheelDelta(e);
      const oldTarget = targetRef.current.zoom;
      const newTarget = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldTarget - delta * ZOOM_SENSITIVITY));

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

    // Hover / click via raycaster
    let lastHoveredIndex = -1;
    const onPointerMove = (e: PointerEvent) => {
      const t = threeRef.current;
      if (!t || panRef.current.active) return;

      const rect = el.getBoundingClientRect();
      t.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      t.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      t.raycaster.setFromCamera(t.mouse, t.camera);

      const intersects = t.raycaster.intersectObjects(t.markerPlanes, false);
      if (intersects.length > 0) {
        const hit = intersects[0].object.userData as { conflict: Conflict; index: number };
        if (hit.index !== lastHoveredIndex) {
          // Restore previous hovered marker alpha
          if (lastHoveredIndex >= 0 && t.markerMesh) {
            const attr = t.markerMesh.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute;
            attr.setW(lastHoveredIndex, 200);
            attr.needsUpdate = true;
          }
          // Highlight new marker
          if (t.markerMesh) {
            const attr = t.markerMesh.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute;
            attr.setW(hit.index, 240);
            attr.needsUpdate = true;
          }
          lastHoveredIndex = hit.index;
          onConflictHoverRef.current(hit.conflict);
        }
        el.style.cursor = 'pointer';
      } else if (lastHoveredIndex >= 0) {
        if (t.markerMesh) {
          const attr = t.markerMesh.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute;
          attr.setW(lastHoveredIndex, 200);
          attr.needsUpdate = true;
        }
        lastHoveredIndex = -1;
        onConflictHoverRef.current(null);
        el.style.cursor = 'grab';
      }
    };

    const onClick = (e: MouseEvent) => {
      if (panRef.current.active) return;
      const t = threeRef.current;
      if (!t) return;
      const rect = el.getBoundingClientRect();
      t.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      t.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      t.raycaster.setFromCamera(t.mouse, t.camera);
      const intersects = t.raycaster.intersectObjects(t.markerPlanes, false);
      if (intersects.length > 0) {
        const conflict = intersects[0].object.userData.conflict as Conflict;
        handleConflictClick(conflict);
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('click', onClick);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('click', onClick);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Fly-to on conflict select ---
  const handleConflictClick = useCallback((conflict: Conflict) => {
    onConflictClickRef.current(conflict);
    smoothingRef.current = false;
    if (flyTweenRef.current) flyTweenRef.current.kill();

    savedViewRef.current = { ...viewRef.current };
    const animTarget = { ...viewRef.current };

    flyTweenRef.current = gsap.to(animTarget, {
      longitude: conflict.coordinates.lng,
      latitude: conflict.coordinates.lat,
      zoom: 4,
      duration: 1.2,
      ease: GSAP_EASE.emphasizedDecelerate,
      onUpdate: () => {
        viewRef.current.longitude = animTarget.longitude;
        viewRef.current.latitude = animTarget.latitude;
        viewRef.current.zoom = animTarget.zoom;
        targetRef.current.longitude = animTarget.longitude;
        targetRef.current.latitude = animTarget.latitude;
        targetRef.current.zoom = animTarget.zoom;
        updateCamera();
      },
      onComplete: () => { flyTweenRef.current = null; },
    });
  }, [updateCamera]);

  // --- Restore view on panel close ---
  useEffect(() => {
    if (prevSelectedRef.current && !selectedConflict && savedViewRef.current) {
      const saved = savedViewRef.current;
      const animTarget = { ...viewRef.current };
      smoothingRef.current = false;

      flyTweenRef.current = gsap.to(animTarget, {
        longitude: saved.longitude,
        latitude: saved.latitude,
        zoom: saved.zoom,
        duration: 1.2,
        ease: GSAP_EASE.emphasizedDecelerate,
        onUpdate: () => {
          viewRef.current.longitude = animTarget.longitude;
          viewRef.current.latitude = animTarget.latitude;
          viewRef.current.zoom = animTarget.zoom;
          targetRef.current.longitude = animTarget.longitude;
          targetRef.current.latitude = animTarget.latitude;
          targetRef.current.zoom = animTarget.zoom;
          updateCamera();
        },
        onComplete: () => {
          flyTweenRef.current = null;
          savedViewRef.current = null;
        },
      });
    }
    prevSelectedRef.current = selectedConflict;
  }, [selectedConflict, updateCamera]);

  // --- Reveal animation ---
  useEffect(() => {
    if (!ready || !containerRef.current) return;
    gsap.fromTo(
      containerRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 1.5, ease: GSAP_EASE.emphasized }
    );
  }, [ready]);

  return (
    <div ref={containerRef} className={styles.mapContainer}>
      <canvas ref={canvasRef} className={styles.threeCanvas} role="img" aria-label="Interactive 3D globe showing ongoing armed conflicts worldwide" />

      {/* Film grain texture */}
      <svg className={styles.grainSvg} aria-hidden="true">
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
