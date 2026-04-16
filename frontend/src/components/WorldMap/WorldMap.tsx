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
  major_war: [183, 28, 28, 120],
  war: [198, 40, 40, 90],
  minor_conflict: [211, 47, 47, 60],
  skirmish: [229, 115, 115, 40],
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
  return getRadius(conflict) * 2.5;
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

function buildLandFillGeometry(featureCollection: any): THREE.BufferGeometry {
  const features = featureCollection.type === 'FeatureCollection'
    ? featureCollection.features
    : [featureCollection];

  const allPositions: number[] = [];
  const allIndices: number[] = [];
  let vertexOffset = 0;

  for (const f of features) {
    const geom = f.geometry || f;
    const polygons: number[][][][] =
      geom.type === 'Polygon' ? [geom.coordinates] :
      geom.type === 'MultiPolygon' ? geom.coordinates : [];

    for (const polygon of polygons) {
      const exterior = polygon[0];
      if (!exterior || exterior.length < 3) continue;

      const shape = new THREE.Shape();
      const x0 = lngToX(exterior[0][0]);
      const y0 = -latToY(exterior[0][1]);
      shape.moveTo(x0, y0);
      for (let i = 1; i < exterior.length; i++) {
        shape.lineTo(lngToX(exterior[i][0]), -latToY(exterior[i][1]));
      }

      try {
        const shapeGeom = new THREE.ShapeGeometry(shape);
        const posAttr = shapeGeom.getAttribute('position');
        const idx = shapeGeom.getIndex();
        if (!posAttr || !idx) { shapeGeom.dispose(); continue; }

        for (let i = 0; i < posAttr.count; i++) {
          allPositions.push(posAttr.getX(i), posAttr.getY(i), 0);
        }
        for (let i = 0; i < idx.count; i++) {
          allIndices.push(idx.getX(i) + vertexOffset);
        }
        vertexOffset += posAttr.count;
        shapeGeom.dispose();
      } catch {
        // skip degenerate polygons
      }
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
  merged.setIndex(allIndices);
  return merged;
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
    float alpha = vColor.a * smoothstep(1.0, 0.85, dist);
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
    float falloff = 1.0 - dist;
    float pulse = 0.4 + sin(uPulse * 6.2832) * 0.15;
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
    glowMesh: THREE.InstancedMesh | null;
    markerMesh: THREE.InstancedMesh | null;
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

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    threeRef.current = {
      renderer, scene, camera,
      glowMaterial, markerMaterial,
      glowMesh: null, markerMesh: null,
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

          // Land fill
          const landGeom = buildLandFillGeometry(countries);
          const landMesh = new THREE.Mesh(landGeom, new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.03,
            depthTest: false, side: THREE.DoubleSide,
          }));
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
  }, [updateCamera]);

  // --- Update markers when conflicts change ---
  useEffect(() => {
    const t = threeRef.current;
    if (!t || conflicts.length === 0) return;

    // Remove old meshes
    if (t.glowMesh) { t.scene.remove(t.glowMesh); t.glowMesh.dispose(); }
    if (t.markerMesh) { t.scene.remove(t.markerMesh); t.markerMesh.dispose(); }
    t.markerPlanes.forEach(m => { t.scene.remove(m); m.geometry.dispose(); });
    t.markerPlanes = [];

    const count = conflicts.length;
    const quadGeom = new THREE.PlaneGeometry(2, 2);

    // Glow instances
    const glowMesh = new THREE.InstancedMesh(quadGeom, t.glowMaterial, count);
    const glowPos = new Float32Array(count * 3);
    const glowRadius = new Float32Array(count);
    const glowColor = new Float32Array(count * 4);

    // Marker instances
    const markerMesh = new THREE.InstancedMesh(quadGeom, t.markerMaterial, count);
    const mPos = new Float32Array(count * 3);
    const mRadius = new Float32Array(count);
    const mColor = new Float32Array(count * 4);

    const dummy = new THREE.Matrix4();

    for (let i = 0; i < count; i++) {
      const c = conflicts[i];
      const x = lngToX(c.coordinates.lng);
      const y = -latToY(c.coordinates.lat);
      const rMeters = getRadius(c);
      const rWorld = rMeters / 111320 * (WORLD_SIZE / 360);
      const grMeters = getGlowRadius(c);
      const grWorld = grMeters / 111320 * (WORLD_SIZE / 360);

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
      const isHov = hoveredConflict?.id === c.id;
      mColor[i * 4] = mc[0];
      mColor[i * 4 + 1] = mc[1];
      mColor[i * 4 + 2] = mc[2];
      mColor[i * 4 + 3] = isHov ? 240 : 200;

      dummy.identity();
      glowMesh.setMatrixAt(i, dummy);
      markerMesh.setMatrixAt(i, dummy);

      // Create invisible plane for raycasting
      const planeGeom = new THREE.PlaneGeometry(rWorld * 2, rWorld * 2);
      const planeMat = new THREE.MeshBasicMaterial({ visible: false });
      const plane = new THREE.Mesh(planeGeom, planeMat);
      plane.position.set(x, y, 0.01);
      plane.userData = { conflict: c, index: i };
      t.scene.add(plane);
      t.markerPlanes.push(plane);
    }

    glowMesh.geometry.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(glowPos, 3));
    glowMesh.geometry.setAttribute('instanceRadius', new THREE.InstancedBufferAttribute(glowRadius, 1));
    glowMesh.geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(glowColor, 4));
    glowMesh.renderOrder = 4;
    glowMesh.frustumCulled = false;
    t.scene.add(glowMesh);
    t.glowMesh = glowMesh;

    markerMesh.geometry.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(mPos, 3));
    markerMesh.geometry.setAttribute('instanceRadius', new THREE.InstancedBufferAttribute(mRadius, 1));
    markerMesh.geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(mColor, 4));
    markerMesh.renderOrder = 5;
    markerMesh.frustumCulled = false;
    t.scene.add(markerMesh);
    t.markerMesh = markerMesh;

    updateCamera();
  }, [conflicts, hoveredConflict, updateCamera]);

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
    const onPointerMove = (e: PointerEvent) => {
      const t = threeRef.current;
      if (!t || panRef.current.active) return;

      const rect = el.getBoundingClientRect();
      t.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      t.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      t.raycaster.setFromCamera(t.mouse, t.camera);

      const intersects = t.raycaster.intersectObjects(t.markerPlanes, false);
      if (intersects.length > 0) {
        const conflict = intersects[0].object.userData.conflict as Conflict;
        onConflictHoverRef.current(conflict);
        el.style.cursor = 'pointer';
      } else {
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
      <canvas ref={canvasRef} className={styles.threeCanvas} />

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
