import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Plotly from 'plotly.js-dist-min';
import { Camera, Compass, Eye } from 'lucide-react';
import type { SiteComputationResult } from '../types/mission';

interface SkyDome3DProps {
  results: SiteComputationResult[];
  activeSampleIdx: number;
  selectedSiteId: string;
  onSelectSiteId: (id: string) => void;
  earthMarginDeg: number;
}

const DOME_RADIUS = 10;
const DEG2RAD = Math.PI / 180;

function azElToVec3(azDeg: number, elDeg: number, radius: number, out = new THREE.Vector3()): THREE.Vector3 {
  const az = azDeg * DEG2RAD;
  const el = elDeg * DEG2RAD;
  const rHoriz = radius * Math.cos(el);
  out.set(rHoriz * Math.sin(az), radius * Math.sin(el), -rHoriz * Math.cos(az));
  return out;
}

function makeCompassSprite(label: string, color = '#94A3B8'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '600 32px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(label, 64, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.2, 1.1, 1);
  return sprite;
}

export const SkyDome3D: React.FC<SkyDome3DProps> = ({
  results,
  activeSampleIdx,
  selectedSiteId,
  onSelectSiteId,
  earthMarginDeg,
}) => {
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [horizonZoom, setHorizonZoom] = useState<'hemisphere' | 'horizon'>('horizon');
  const mountRef = useRef<HTMLDivElement | null>(null);
  const polarRef = useRef<HTMLDivElement | null>(null);

  const activeResult = useMemo(
    () => results.find((r) => r.site.id === selectedSiteId) || results[0],
    [results, selectedSiteId]
  );

  const activeSample = useMemo(() => {
    if (!activeResult || activeResult.samples.length === 0) return null;
    const idx = Math.min(activeSampleIdx, activeResult.samples.length - 1);
    return activeResult.samples[Math.max(0, idx)];
  }, [activeResult, activeSampleIdx]);

  // Persistent Three.js refs so React slider scrubs move markers without tearing down WebGL
  const sceneObjectsRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    sunMesh: THREE.Mesh;
    sunHalo: THREE.Mesh;
    earthMesh: THREE.Mesh;
    horizonLine: THREE.Line;
    horizonMesh: THREE.Mesh;
    sunTrack: THREE.Line;
    earthTrack: THREE.Line;
    requestRender: () => void;
    isSoftwareGl: boolean;
  } | null>(null);

  // Initialize Three.js WebGL scene once when in 3D mode
  useEffect(() => {
    if (viewMode !== '3d' || !mountRef.current) return;
    const container = mountRef.current;
    container.innerHTML = '';

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth || 640, container.clientHeight || 440);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07090E');

    const camera = new THREE.PerspectiveCamera(
      46,
      (container.clientWidth || 640) / (container.clientHeight || 440),
      0.1,
      200
    );
    camera.position.set(16.5, 6.2, 16.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 6;
    controls.maxDistance = 32;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.target.set(0, 0.5, 0);

    // Subtle procedural starfield (Instanced / Points)
    const starCount = 450;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = ((i * 137.508) % 360) * DEG2RAD;
      const phi = Math.acos(1 - ((i + 0.5) / starCount));
      const r = 42;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi);
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    scene.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({ color: '#64748B', size: 0.22, sizeAttenuation: true })
      )
    );

    // Lighting
    scene.add(new THREE.HemisphereLight('#94A3B8', '#0F172A', 0.85));
    const dirLight = new THREE.DirectionalLight('#FFFFFF', 1.4);
    dirLight.position.set(10, 14, 8);
    scene.add(dirLight);

    // Sky dome grid rings (0°, 15°, 30°, 60°)
    const ringMat0 = new THREE.LineBasicMaterial({ color: '#334155', transparent: true, opacity: 0.8 });
    const ringMatSub = new THREE.LineBasicMaterial({ color: '#1E293B', transparent: true, opacity: 0.7 });
    [0, 15, 30, 60].forEach((el) => {
      const pts: THREE.Vector3[] = [];
      for (let a = 0; a <= 360; a += 4) {
        pts.push(azElToVec3(a, el, DOME_RADIUS));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      scene.add(new THREE.Line(g, el === 0 ? ringMat0 : ringMatSub));
    });

    // Meridian arcs (N-S, E-W)
    [0, 90].forEach((baseAz) => {
      const pts: THREE.Vector3[] = [];
      for (let el = 0; el <= 180; el += 4) {
        const az = el <= 90 ? baseAz : baseAz + 180;
        const elev = el <= 90 ? el : 180 - el;
        pts.push(azElToVec3(az, elev, DOME_RADIUS));
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMatSub));
    });

    // Ground regolith reference disc
    const groundGeo = new THREE.CircleGeometry(DOME_RADIUS, 72);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({
      color: '#0B101B',
      roughness: 0.92,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.35;
    scene.add(ground);

    // Cardinal direction sprites
    const cardinals: Array<[string, number, string]> = [
      ['N 0°', 0, '#F8FAFC'],
      ['E 90°', 90, '#94A3B8'],
      ['S 180°', 180, '#94A3B8'],
      ['W 270°', 270, '#94A3B8'],
    ];
    cardinals.forEach(([txt, az, col]) => {
      const sp = makeCompassSprite(txt, col);
      const pos = azElToVec3(az, 0, DOME_RADIUS + 1.15);
      sp.position.set(pos.x, 0.35, pos.z);
      scene.add(sp);
    });

    // Dynamic terrain horizon silhouette ring & skirt
    const horizonPts = Array.from({ length: 361 }, (_, i) => azElToVec3(i % 360, 0, DOME_RADIUS));
    const horizonLineGeo = new THREE.BufferGeometry().setFromPoints(horizonPts);
    const horizonLine = new THREE.Line(
      horizonLineGeo,
      new THREE.LineBasicMaterial({ color: '#94A3B8' })
    );
    scene.add(horizonLine);

    const skirtGeo = new THREE.BufferGeometry();
    const skirtVerts = new Float32Array(361 * 2 * 3);
    const skirtIndices: number[] = [];
    for (let i = 0; i < 360; i++) {
      const b = i * 2;
      skirtIndices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    skirtGeo.setAttribute('position', new THREE.BufferAttribute(skirtVerts, 3));
    skirtGeo.setIndex(skirtIndices);
    const horizonMesh = new THREE.Mesh(
      skirtGeo,
      new THREE.MeshBasicMaterial({
        color: '#1E293B',
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
      })
    );
    scene.add(horizonMesh);

    // Trajectory curves
    const sunTrack = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: '#F59E0B', transparent: true, opacity: 0.75 })
    );
    const earthTrack = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: '#06B6D4', transparent: true, opacity: 0.85 })
    );
    scene.add(sunTrack, earthTrack);

    // Sun & Earth markers
    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#FBBF24' })
    );
    const sunHalo = new THREE.Mesh(
      new THREE.SphereGeometry(0.68, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#F59E0B', transparent: true, opacity: 0.25 })
    );
    const earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 24, 24),
      new THREE.MeshStandardMaterial({ color: '#22D3EE', emissive: '#0891B2', emissiveIntensity: 0.45, roughness: 0.4 })
    );
    scene.add(sunMesh, sunHalo, earthMesh);

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const requestRender = () => {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        renderDirty = false;
        controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    controls.addEventListener('change', requestRender);
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 640;
      const h = container.clientHeight || 440;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', onResize);

    sceneObjectsRef.current = {
      renderer,
      scene,
      camera,
      controls,
      sunMesh,
      sunHalo,
      earthMesh,
      horizonLine,
      horizonMesh,
      sunTrack,
      earthTrack,
      requestRender,
      isSoftwareGl,
    };

    requestRender();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      sceneObjectsRef.current = null;
    };
  }, [viewMode]);

  // Camera view preset handler
  useEffect(() => {
    const ref = sceneObjectsRef.current;
    if (!ref) return;
    if (horizonZoom === 'horizon') {
      ref.camera.position.set(17.5, 4.2, 17.5);
      ref.controls.target.set(0, 0.2, 0);
    } else {
      ref.camera.position.set(14.5, 13.5, 14.5);
      ref.controls.target.set(0, 1.5, 0);
    }
    ref.requestRender();
  }, [horizonZoom, viewMode]);

  // Update 3D horizon profile, orbital trajectories, and live Sun/Earth markers
  useEffect(() => {
    const ref = sceneObjectsRef.current;
    if (!ref || !activeResult || viewMode !== '3d') return;

    const { horizonProfileDeg, samples } = activeResult;
    // Slight visual vertical scale factor in horizon zoom so +-5 deg terrain relief reads clearly
    const vScale = horizonZoom === 'horizon' ? 2.2 : 1.0;

    // 1. Update horizon outline & skirt
    const linePos = new Float32Array(361 * 3);
    const skirtPos = ref.horizonMesh.geometry.attributes.position as THREE.BufferAttribute;
    const vTop = new THREE.Vector3();
    const vBot = new THREE.Vector3();

    for (let i = 0; i <= 360; i++) {
      const az = i % 360;
      const hEl = (horizonProfileDeg[az] ?? 0) * vScale;
      azElToVec3(az, hEl, DOME_RADIUS, vTop);
      azElToVec3(az, -10 * vScale, DOME_RADIUS, vBot);

      linePos[i * 3] = vTop.x;
      linePos[i * 3 + 1] = vTop.y;
      linePos[i * 3 + 2] = vTop.z;

      skirtPos.setXYZ(i * 2, vTop.x, vTop.y, vTop.z);
      skirtPos.setXYZ(i * 2 + 1, vBot.x, vBot.y, vBot.z);
    }
    ref.horizonLine.geometry.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    skirtPos.needsUpdate = true;

    // 2. Update full Sun & Earth trajectory paths
    const sunPts = samples.map((s) => azElToVec3(s.sunAzDeg, s.sunElDeg * vScale, DOME_RADIUS * 0.98));
    const earthPts = samples.map((s) => azElToVec3(s.earthAzDeg, s.earthElDeg * vScale, DOME_RADIUS * 0.96));
    ref.sunTrack.geometry.setFromPoints(sunPts);
    ref.earthTrack.geometry.setFromPoints(earthPts);

    // 3. Update active Sun & Earth sphere positions
    if (activeSample) {
      azElToVec3(activeSample.sunAzDeg, activeSample.sunElDeg * vScale, DOME_RADIUS * 0.98, ref.sunMesh.position);
      ref.sunHalo.position.copy(ref.sunMesh.position);
      azElToVec3(activeSample.earthAzDeg, activeSample.earthElDeg * vScale, DOME_RADIUS * 0.96, ref.earthMesh.position);
    }

    ref.requestRender();
  }, [activeResult, activeSample, horizonZoom, viewMode]);

  // 2D Polar Azimuth/Elevation plot alternative
  useEffect(() => {
    if (viewMode !== '2d' || !polarRef.current || !activeResult) return;
    const { horizonProfileDeg, samples } = activeResult;
    const az360 = Array.from({ length: 361 }, (_, i) => i % 360);
    // Polar radial coordinate = 90 - elevation (Zenith = 0 center, Horizon 0° = 90, -10° = 100)
    const rHorizon = az360.map((a) => 90 - (horizonProfileDeg[a] ?? 0));

    const traces: Plotly.Data[] = [
      {
        type: 'scatterpolar',
        mode: 'lines',
        name: 'Horizon Mask',
        theta: az360,
        r: rHorizon,
        line: { color: '#94A3B8', width: 2 },
        fill: 'toself',
        fillcolor: 'rgba(30, 41, 59, 0.28)',
      },
      {
        type: 'scatterpolar',
        mode: 'lines',
        name: 'Sun Path',
        theta: samples.map((s) => s.sunAzDeg),
        r: samples.map((s) => 90 - s.sunElDeg),
        line: { color: '#F59E0B', width: 2 },
      },
      {
        type: 'scatterpolar',
        mode: 'lines',
        name: 'Earth Path',
        theta: samples.map((s) => s.earthAzDeg),
        r: samples.map((s) => 90 - s.earthElDeg),
        line: { color: '#06B6D4', width: 2.5 },
      },
    ];

    if (activeSample) {
      traces.push(
        {
          type: 'scatterpolar',
          mode: 'markers',
          name: 'Sun Now',
          theta: [activeSample.sunAzDeg],
          r: [90 - activeSample.sunElDeg],
          marker: { color: '#FBBF24', size: 13, line: { color: '#FFFFFF', width: 1.5 } },
        },
        {
          type: 'scatterpolar',
          mode: 'markers',
          name: 'Earth Now',
          theta: [activeSample.earthAzDeg],
          r: [90 - activeSample.earthElDeg],
          marker: { color: '#22D3EE', size: 12, symbol: 'diamond', line: { color: '#FFFFFF', width: 1.5 } },
        }
      );
    }

    Plotly.newPlot(
      polarRef.current,
      traces,
      {
        paper_bgcolor: '#0B101B',
        plot_bgcolor: '#0B101B',
        font: { color: '#CBD5E1', family: 'IBM Plex Mono, monospace', size: 11 },
        margin: { l: 40, r: 40, t: 36, b: 36 },
        polar: {
          bgcolor: '#07090E',
          angularaxis: {
            direction: 'clockwise',
            rotation: 90,
            tickvals: [0, 45, 90, 135, 180, 225, 270, 315],
            ticktext: ['N 0°', '45°', 'E 90°', '135°', 'S 180°', '225°', 'W 270°', '315°'],
            gridcolor: '#1E293B',
            linecolor: '#334155',
          },
          radialaxis: {
            range: [65, 100],
            tickvals: [70, 80, 90, 95],
            ticktext: ['+20°', '+10°', '0° Hor', '-5°'],
            gridcolor: '#1E293B',
            angle: 45,
          },
        },
        legend: { orientation: 'h', y: -0.08, font: { size: 11 } },
      },
      { responsive: true, displaylogo: false }
    );
  }, [viewMode, activeResult, activeSample]);

  const handleExportPng = async () => {
    if (viewMode === '3d' && sceneObjectsRef.current) {
      const { renderer, scene, camera } = sceneObjectsRef.current;
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `clps_sky_dome_${activeResult?.site.id || 'site'}.png`;
      a.click();
    } else if (viewMode === '2d' && polarRef.current) {
      await Plotly.downloadImage(polarRef.current, {
        format: 'png',
        width: 1000,
        height: 800,
        filename: `clps_polar_sky_${activeResult?.site.id || 'site'}`,
      });
    }
  };

  if (!activeResult) return null;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {results.map((r) => (
            <button
              key={r.site.id}
              type="button"
              onClick={() => onSelectSiteId(r.site.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap ${
                r.site.id === activeResult.site.id
                  ? 'bg-slate-800 border-slate-600 text-slate-100'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span
                className="inline-block w-2 h-2 rounded-full mr-1.5"
                style={{ backgroundColor: r.site.color }}
              />
              {r.site.shortName || r.site.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {viewMode === '3d' && (
            <button
              type="button"
              onClick={() =>
                setHorizonZoom((z) => (z === 'horizon' ? 'hemisphere' : 'horizon'))
              }
              className="px-2.5 py-1.5 rounded-md text-xs bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
              {horizonZoom === 'horizon' ? 'Horizon Zoom (2.2×)' : 'True 1:1 Dome'}
            </button>
          )}

          <div className="inline-flex rounded-md bg-slate-900 border border-slate-800 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('3d')}
              className={`px-2.5 py-1 text-xs rounded whitespace-nowrap ${
                viewMode === '3d' ? 'bg-slate-800 text-slate-100 font-medium' : 'text-slate-400'
              }`}
            >
              3D Sky Dome
            </button>
            <button
              type="button"
              onClick={() => setViewMode('2d')}
              className={`px-2.5 py-1 text-xs rounded whitespace-nowrap ${
                viewMode === '2d' ? 'bg-slate-800 text-slate-100 font-medium' : 'text-slate-400'
              }`}
            >
              2D Polar
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportPng}
            className="px-2.5 py-1.5 rounded-md text-xs bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700 inline-flex items-center gap-1 whitespace-nowrap"
            title="Download Sky View as PNG"
          >
            <Camera className="w-3.5 h-3.5" />
            PNG
          </button>
        </div>
      </div>

      {/* Viewport */}
      <div className="relative rounded-lg border border-slate-800 bg-[#07090E] overflow-hidden">
        {viewMode === '3d' ? (
          <div ref={mountRef} className="w-full h-[430px]" />
        ) : (
          <div ref={polarRef} className="w-full h-[430px]" />
        )}

        {/* Crisp solid-rgba HUD readout (no backdrop-blur over WebGL) */}
        {activeSample && (
          <div className="border-t border-slate-800 bg-[#0B101B] px-4 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs font-mono-tabular">
            <div className="flex flex-wrap items-center gap-5">
              <span className="text-amber-400">
                Sun: Az {activeSample.sunAzDeg.toFixed(1)}° · El {activeSample.sunElDeg.toFixed(2)}° · Disk{' '}
                {(activeSample.sunVisibleFraction * 100).toFixed(0)}%
              </span>
              <span className="text-cyan-400">
                Earth: Az {activeSample.earthAzDeg.toFixed(1)}° · El {activeSample.earthElDeg.toFixed(2)}° ·{' '}
                {activeSample.earthVisible ? `DTE Clear (+${earthMarginDeg}° mask)` : 'Occluded'}
              </span>
            </div>
            <span className="text-slate-400 inline-flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5" />
              Drag to orbit · Scroll to zoom
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
