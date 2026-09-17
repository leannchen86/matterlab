'use client';

import { Environment, Grid, Html, Lightformer, Line, OrbitControls, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import reviewCamerasJson from '../materials_lab_threejs/cameras.json';
import { getStationSceneSpec, SCENE_QUALITY, STATION_MENU_ORDER, STATION_SCENE_ORDER } from './lab-scene-config';
import type { CameraMode, SceneQualityPolicy, StationId, StationKind, StationSceneSpec } from './lab-scene-config';
import type { Station } from './sim-data';
import { DEFAULT_FOV, OVERVIEW_POSITION, OVERVIEW_TARGET, TOUR_CAMERA_IDS, TOUR_DURATION_SECONDS } from './lab-tour';
import { inspectionProgress } from './inspection-progress';
import { getInspectionPoints, HOTSPOTS, type InspectionPoint } from './lab-inspection';

type OrbitControlsHandle = React.ComponentRef<typeof OrbitControls>;

type LightingMode = 'inspection' | 'run';
type WalkDirection = 'forward' | 'back' | 'left' | 'right';
type WalkCommand = { id: number; direction: WalkDirection };
type ReviewCamera = {
  id: string;
  name: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  stationId?: StationId;
  hideStations?: boolean;
  purpose: string;
};
type SceneProps = {
  stations: Station[];
  selectedId: string;
  phase: number;
  cameraMode: CameraMode;
  lightingMode: LightingMode;
  reviewCameraId: string | null;
  tourActive: boolean;
  tourRun: number;
  tourPaused: boolean;
  onTourComplete: () => void;
  controlFeedback?: Record<string, string[]>;
  onCameraMode: (mode: CameraMode) => void;
  onOpenConsole: () => void;
  inspectionState?: Record<string, string[]>;
  onInspectionChange?: (stationId: string, checks: string[]) => void;
  onSelect: (id: string) => void;
};

const REVIEW_CAMERAS = reviewCamerasJson as ReviewCamera[];
const REVIEW_CAMERA_BY_ID = new Map(REVIEW_CAMERAS.map((camera) => [camera.id, camera]));
const TOUR_CAMERAS = TOUR_CAMERA_IDS.map((id) => {
  const shot = REVIEW_CAMERA_BY_ID.get(id);
  if (!shot) throw new Error(`Missing cinematic camera ${id}`);
  return shot;
});
const TONE_COLORS: Record<Station['tone'], string> = {
  ready: '#51e19a',
  hold: '#718198',
  run: '#4dd5ed',
  warn: '#f4b95f',
  off: '#586579',
};

export function Lab3D({ stations, selectedId, phase, cameraMode, lightingMode, reviewCameraId, tourActive, tourRun, tourPaused, onTourComplete, controlFeedback, onCameraMode, onOpenConsole, inspectionState, onInspectionChange, onSelect }: SceneProps) {
  const controlsRef = useRef<OrbitControlsHandle>(null);
  const [localVisited, setLocalVisited] = useState<Record<string, string[]>>({});
  const visited = inspectionState ?? localVisited;
  const [observationRecord, setObservationRecord] = useState<{ stationId: string; point: InspectionPoint } | null>(null);
  const [walkCommand, setWalkCommand] = useState<WalkCommand>({ id: 0, direction: 'forward' });
  const sceneStations = stations.map((station) => ({ station, scene: getStationSceneSpec(station.id) }));
  const menuStations = STATION_MENU_ORDER.map((stationId) => {
    const station = stations.find((candidate) => candidate.id === stationId);
    if (!station) throw new Error(`Missing menu station: ${stationId}`);
    return station;
  });
  const selectedSceneStation = sceneStations.find(({ station }) => station.id === selectedId) ?? sceneStations[0];
  const selectedStation = selectedSceneStation.station;
  const selectedScene = selectedSceneStation.scene;
  const selectedHotspots = getInspectionPoints(selectedScene.kind, phase);
  const inspected = visited[selectedId] ?? [];
  const inspection = inspectionProgress(selectedHotspots.map((point) => point.label), inspected);
  const activeObservation = cameraMode === 'focus' && observationRecord?.stationId === selectedId ? selectedHotspots.find((point) => point.label === observationRecord.point.label) ?? null : null;
  const quality = SCENE_QUALITY[tourActive ? 'walk' : cameraMode];
  const reviewCamera = reviewCameraId ? REVIEW_CAMERA_BY_ID.get(reviewCameraId) ?? null : null;
  const isolatedStationId = reviewCamera?.stationId ?? null;
  const hideStations = Boolean(reviewCamera?.hideStations);
  const inspect = (label: string) => {
    const point = selectedHotspots.find((hotspot) => hotspot.label === label);
    if (point) setObservationRecord({ stationId: selectedId, point });
    const checks = Array.from(new Set([...(visited[selectedId] ?? []), label]));
    if (!inspectionState) setLocalVisited((current) => ({ ...current, [selectedId]: checks }));
    onInspectionChange?.(selectedId, checks);
  };
  return (
    <div className={`lab-3d camera-${cameraMode}${reviewCameraId ? ' review-render' : ''}${tourActive ? ' tour-render' : ''}`} aria-label="Interactive 3D simulation of seven materials laboratory stations">
      <Canvas
        shadows={quality.shadows}
        dpr={quality.dpr}
        camera={{ position: [10.5, 11.8, 19.5], fov: 55, near: 0.1, far: 90 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: Boolean(reviewCameraId) }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color('#c8c2b8'), 1);
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.76;
        }}
      >
        <FacilityLighting mode={lightingMode} quality={quality} />

        <LabArchitecture lightingMode={lightingMode} />
        {(cameraMode !== 'focus' || tourActive) && !isolatedStationId && !hideStations && <OperationsProps />}
        {(cameraMode !== 'focus' || tourActive) && !isolatedStationId && !hideStations && <BacklogRack />}
        {(cameraMode !== 'focus' || tourActive) && !isolatedStationId && !hideStations && <MaterialRoute />}
        {!hideStations && sceneStations.map(({ station, scene }) => ((cameraMode !== 'focus' || tourActive || selectedId === station.id) && (!isolatedStationId || isolatedStationId === station.id)) ? (
          <StationCell
            key={station.id}
            station={station}
            scene={scene}
            selected={selectedId === station.id}
            active={station.tone === 'run'}
            showHotspots={!tourActive && selectedId === station.id && cameraMode === 'focus'}
            inspected={visited[station.id] ?? []}
            inspectionPoints={selectedId === station.id && cameraMode === 'focus' ? selectedHotspots : HOTSPOTS[scene.kind]}
            controls={controlFeedback?.[station.id] ?? []}
            phase={phase}
            onInspect={inspect}
            onFocus={() => onCameraMode('focus')}
            onSelect={onSelect}
          />
        ) : null)}
        <CameraDirector mode={cameraMode} selectedScene={selectedScene} controls={controlsRef} reviewCameraId={reviewCameraId} tourActive={tourActive} tourRun={tourRun} tourPaused={tourPaused} onTourComplete={onTourComplete} />
        <AisleNavigator active={cameraMode === 'walk' && !tourActive && !reviewCameraId} controls={controlsRef} command={walkCommand} />
        {!tourActive && !reviewCameraId && <OrbitControls
          ref={controlsRef}
          makeDefault
          target={[-1.55, 0.72, -0.18]}
          enabled={!tourActive && !reviewCameraId}
          enableDamping
          dampingFactor={0.075}
          enablePan={cameraMode !== 'walk'}
          minDistance={cameraMode === 'focus' ? 3.8 : cameraMode === 'walk' ? 2.8 : 11}
          maxDistance={cameraMode === 'walk' ? 5.7 : 34}
          minPolarAngle={cameraMode === 'walk' ? 1.05 : 0.55}
          maxPolarAngle={cameraMode === 'walk' ? 1.55 : 1.36}
          minAzimuthAngle={-1.45}
          maxAzimuthAngle={1.25}
        />}
        <LabPostEffects enabled={!tourActive} />
      </Canvas>
      <nav className="scene-station-picker" aria-label="Select a lab station">
        {menuStations.map((station) => <button key={station.id} type="button" className={selectedId === station.id ? 'active' : ''} style={{ '--station-tone': TONE_COLORS[station.tone] } as React.CSSProperties} onClick={() => { onSelect(station.id); onCameraMode('focus'); }} aria-pressed={selectedId === station.id}><i />{station.id.replace('-0', '·')}</button>)}
      </nav>
      {!tourActive && cameraMode === 'walk' && <div className="walk-hud">
        <header><b>{selectedStation.id} · {selectedStation.name}</b></header>
        <div className="walk-pad" role="group" aria-label="Aisle movement controls">
          <button type="button" className="walk-forward" onClick={() => setWalkCommand((command) => ({ id: command.id + 1, direction: 'forward' }))} aria-label="Step forward">↑</button>
          <button type="button" className="walk-left" onClick={() => setWalkCommand((command) => ({ id: command.id + 1, direction: 'left' }))} aria-label="Step left">←</button>
          <button type="button" className="walk-back" onClick={() => setWalkCommand((command) => ({ id: command.id + 1, direction: 'back' }))} aria-label="Step back">↓</button>
          <button type="button" className="walk-right" onClick={() => setWalkCommand((command) => ({ id: command.id + 1, direction: 'right' }))} aria-label="Step right">→</button>
        </div>
        {inspection.complete && <button type="button" className="walk-console" onClick={onOpenConsole}>OPEN CONSOLE <i>↗</i></button>}
        <small>WASD / ARROWS</small>
        <button type="button" className="walk-inspect" onClick={() => onCameraMode('focus')}>◎ {inspected.length ? 'REVIEW INSPECTION' : 'INSPECT ASSET'} <i>{inspection.count}/{inspection.total}</i></button>
      </div>}
      {!tourActive && cameraMode === 'focus' && <div className="walkaround-panel">
        <header><div><b>{selectedStation.id} · {selectedStation.name}</b></div><em>{inspection.count} / {inspection.total}</em></header>
        <div>{selectedHotspots.map((hotspot) => <button key={hotspot.label} type="button" className={inspected.includes(hotspot.label) ? 'visited' : ''} onClick={() => inspect(hotspot.label)}><i>{inspected.includes(hotspot.label) ? '✓' : '○'}</i>{hotspot.displayLabel ?? hotspot.label}</button>)}</div>
        {activeObservation && <div className={`walkaround-observation ${activeObservation.state}`}><span>{activeObservation.displayLabel ?? activeObservation.label} OBSERVATION</span><b>{activeObservation.observation}</b><em>{activeObservation.state === 'attention' ? 'ATTENTION' : 'CAPTURED'}</em></div>}
        {inspection.complete && <button type="button" className="walkaround-next" onClick={onOpenConsole}>OPEN CONSOLE <i>→</i></button>}
      </div>}
    </div>
  );
}

function BacklogRack() {
  return <group position={[-6.65, 0.04, 4.65]} rotation={[0, Math.PI / 2, 0]}>
    <RoundedBox args={[1.72, 0.08, 0.72]} radius={0.025} position={[0, 0.08, 0]} castShadow><meshStandardMaterial color="#45565b" metalness={0.75} roughness={0.28} /></RoundedBox>
    {[-0.79, 0.79].flatMap((x) => [-0.27, 0.27].map((z) => <mesh key={`${x}-${z}`} position={[x, 1.08, z]} castShadow><boxGeometry args={[0.055, 2.02, 0.055]} /><meshStandardMaterial color="#687a7f" metalness={0.88} roughness={0.2} /></mesh>))}
    {[0.29, 0.86, 1.43].map((y) => <RoundedBox key={y} args={[1.65, 0.055, 0.66]} radius={0.016} position={[0, y, 0]} castShadow><meshPhysicalMaterial color="#63757a" metalness={0.84} roughness={0.24} clearcoat={0.16} /></RoundedBox>)}
    {[0, 1, 2].map((slot) => <group key={slot} position={[0, 0.48 + slot * 0.57, 0]}>
      <RoundedBox args={[1.35, 0.3, 0.5]} radius={0.035} castShadow><meshStandardMaterial color="#202b2f" roughness={0.54} transparent opacity={0.54} /></RoundedBox>
      <mesh position={[0, 0.02, 0.256]}><planeGeometry args={[0.88, 0.13]} /><meshBasicMaterial color="#3c494e" /></mesh>
      <mesh position={[-0.29, 0.02, 0.261]}><planeGeometry args={[0.19, 0.035]} /><meshBasicMaterial color="#46565d" /></mesh>
      <mesh position={[0.18, 0.02, 0.262]}><planeGeometry args={[0.42, 0.018]} /><meshBasicMaterial color="#2c373b" /></mesh>
    </group>)}
    <mesh position={[0, 1.83, 0.02]}><planeGeometry args={[1.55, 0.3]} /><meshBasicMaterial color="#1c3339" /></mesh>
    <mesh position={[0, 1.86, 0.026]}><planeGeometry args={[1.06, 0.035]} /><meshBasicMaterial color="#63c99c" /></mesh>
    <Line points={[[ -1.05, 0.01, -0.5], [1.05, 0.01, -0.5], [1.05, 0.01, 0.5], [-1.05, 0.01, 0.5], [-1.05, 0.01, -0.5]]} color="#5c9b87" lineWidth={0.8} transparent opacity={0.68} />
  </group>;
}

function FacilityLighting({ mode, quality }: { mode: LightingMode; quality: SceneQualityPolicy }) {
  const inspection = mode === 'inspection';
  return <>
    <color attach="background" args={[inspection ? '#c8c2b8' : '#070b12']} />
    <fog attach="fog" args={[inspection ? '#c8c2b8' : '#070b12', inspection ? 23 : 17, inspection ? 45 : 34]} />
    <ambientLight intensity={inspection ? 0.46 : 0.42} color={inspection ? '#dce4e2' : '#9fb6d5'} />
    <hemisphereLight args={[inspection ? '#f4f8f5' : '#d5e8ff', inspection ? '#343b3d' : '#111722', inspection ? 1.02 : 0.9]} />
    <directionalLight
      castShadow={quality.shadows !== false}
      position={[7, 11, 8]}
      intensity={inspection ? 2.75 : 2.35}
      color={inspection ? '#fffaf0' : '#e7f1ff'}
      shadow-mapSize-width={quality.shadowMapSize}
      shadow-mapSize-height={quality.shadowMapSize}
      shadow-camera-left={-12}
      shadow-camera-right={12}
      shadow-camera-top={10}
      shadow-camera-bottom={-10}
      shadow-bias={-0.00035}
    />
    <pointLight position={[-4, 4.5, 1]} intensity={inspection ? 3.7 : 18} distance={10} color="#4dd5ed" decay={2} />
    <pointLight position={[3.5, 3.4, -2]} intensity={inspection ? 2.9 : 14} distance={9} color={inspection ? '#ffb56f' : '#ff8f67'} decay={2} />
    <pointLight position={[-5.8, 2.7, 5.6]} intensity={inspection ? 2.1 : 8} distance={8.5} color={inspection ? '#ff9eae' : '#ff748f'} decay={2} />
    <pointLight position={[0.5, 5.6, 4.4]} intensity={inspection ? 2.2 : 6} distance={10} color={inspection ? '#ffd98f' : '#ffc36f'} decay={2} />
    <Environment key={`${mode}-${quality.environmentResolution}`} resolution={quality.environmentResolution} frames={1}>
      <Lightformer form="rect" intensity={inspection ? 5.4 : 3.2} color={inspection ? '#f5f5ed' : '#d9edff'} position={[0, 7, 1]} rotation={[Math.PI / 2, 0, 0]} scale={[11, 8, 1]} />
      <Lightformer form="rect" intensity={inspection ? 2.6 : 2.1} color={inspection ? '#dce9e7' : '#75d9ee'} position={[-8, 3, 3]} rotation={[0, Math.PI / 2, 0]} scale={[5, 3, 1]} />
      <Lightformer form="rect" intensity={inspection ? 2.55 : 2.05} color={inspection ? '#ffd8bd' : '#ff9d74'} position={[6, 2, -2]} rotation={[0, -Math.PI / 2, 0]} scale={[4, 2, 1]} />
    </Environment>
  </>;
}

/* R3F camera directors intentionally mutate Three.js camera and controls objects in useFrame. */
/* eslint-disable react-hooks/immutability */
function CameraDirector({ mode, selectedScene, controls, reviewCameraId, tourActive, tourRun, tourPaused, onTourComplete }: {
  mode: CameraMode;
  selectedScene: StationSceneSpec;
  controls: React.RefObject<OrbitControlsHandle | null>;
  reviewCameraId: string | null;
  tourActive: boolean;
  tourRun: number;
  tourPaused: boolean;
  onTourComplete: () => void;
}) {
  const { camera } = useThree();
  const animating = useRef(true);
  const tourElapsed = useRef(0);
  const tourFinished = useRef(false);
  const reviewCamera = reviewCameraId ? REVIEW_CAMERA_BY_ID.get(reviewCameraId) ?? null : null;
  const overviewPosition = useMemo(() => new THREE.Vector3(...OVERVIEW_POSITION), []);
  const overviewTarget = useMemo(() => new THREE.Vector3(...OVERVIEW_TARGET), []);
  const focusPosition = useMemo(() => {
    const [x, y, z] = selectedScene.position;
    const [offsetX, offsetY, offsetZ] = selectedScene.focusOffset;
    return new THREE.Vector3(x + offsetX, y + offsetY, z + offsetZ);
  }, [selectedScene]);
  const focusTarget = useMemo(() => {
    const [x, y, z] = selectedScene.position;
    const [offsetX, offsetY, offsetZ] = selectedScene.focusTargetOffset;
    return new THREE.Vector3(x + offsetX, y + offsetY, z + offsetZ);
  }, [selectedScene]);
  const walkPosition = useMemo(() => {
    const [x, y, z] = selectedScene.position;
    const [offsetX, offsetY, offsetZ] = selectedScene.walkOffset;
    return new THREE.Vector3(x + offsetX, y + offsetY, z + offsetZ);
  }, [selectedScene]);
  const walkTarget = useMemo(() => {
    const [x, y, z] = selectedScene.position;
    return new THREE.Vector3(x, y + 1.28, z + 0.2);
  }, [selectedScene]);
  const tourPositionCurve = useMemo(() => new THREE.CatmullRomCurve3(TOUR_CAMERAS.map((shot) => new THREE.Vector3(...shot.position)), false, 'centripetal', 0.42), []);
  const tourTargetCurve = useMemo(() => new THREE.CatmullRomCurve3(TOUR_CAMERAS.map((shot) => new THREE.Vector3(...shot.target)), false, 'centripetal', 0.42), []);
  const tourTarget = useMemo(() => new THREE.Vector3(), []);
  const tourOffset = useMemo(() => new THREE.Vector3(), []);
  const tourSpherical = useMemo(() => new THREE.Spherical(), []);
  useEffect(() => {
    animating.current = true;
  }, [mode, selectedScene, reviewCameraId, tourActive]);
  useEffect(() => {
    tourElapsed.current = 0;
    tourFinished.current = false;
  }, [tourActive, tourRun]);
  useFrame((_, delta) => {
    const directed = reviewCamera;
    if (directed) {
      camera.position.set(...directed.position);
      camera.lookAt(...directed.target);
      if (camera instanceof THREE.PerspectiveCamera && camera.fov !== directed.fov) {
        camera.fov = directed.fov;
        camera.updateProjectionMatrix();
      }
      return;
    }
    if (tourActive) {
      if (!tourPaused) tourElapsed.current += delta;
      const rawProgress = Math.min(1, tourElapsed.current / TOUR_DURATION_SECONDS);
      const progress = rawProgress * rawProgress * (3 - 2 * rawProgress);
      camera.position.copy(tourPositionCurve.getPointAt(progress));
      tourTargetCurve.getPointAt(progress, tourTarget);
      // Preserve the September 1 ENTER LAB → TOUR framing, formerly applied by OrbitControls.update().
      // The historical tour inherited its entry mode; use its close aisle variant consistently.
      tourSpherical.setFromVector3(tourOffset.copy(camera.position).sub(tourTarget));
      tourSpherical.theta = THREE.MathUtils.clamp(tourSpherical.theta, -1.45, 1.25);
      tourSpherical.phi = THREE.MathUtils.clamp(tourSpherical.phi, 1.05, 1.55);
      tourSpherical.makeSafe();
      tourSpherical.radius = THREE.MathUtils.clamp(tourSpherical.radius, 2.8, 5.7);
      camera.position.copy(tourTarget).add(tourOffset.setFromSpherical(tourSpherical));
      camera.lookAt(tourTarget);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = THREE.MathUtils.lerp(52, 47, Math.sin(progress * Math.PI));
        camera.updateProjectionMatrix();
      }
      if (rawProgress >= 1 && !tourFinished.current) {
        tourFinished.current = true;
        onTourComplete();
      }
      return;
    }
    const orbit = controls.current;
    if (!orbit) return;
    if (camera instanceof THREE.PerspectiveCamera && camera.fov !== DEFAULT_FOV) {
      camera.fov = DEFAULT_FOV;
      camera.updateProjectionMatrix();
    }
    if (!animating.current) return;
    const position = mode === 'focus' ? focusPosition : mode === 'walk' ? walkPosition : overviewPosition;
    const target = mode === 'focus' ? focusTarget : mode === 'walk' ? walkTarget : overviewTarget;
    const easing = 1 - Math.exp(-delta * 3.8);
    camera.position.lerp(position, easing);
    orbit.target.lerp(target, easing);
    orbit.update();
    if (camera.position.distanceTo(position) < 0.025 && orbit.target.distanceTo(target) < 0.02) {
      camera.position.copy(position);
      orbit.target.copy(target);
      orbit.update();
      animating.current = false;
    }
  });
  return null;
}
/* eslint-enable react-hooks/immutability */

function LabPostEffects({ enabled }: { enabled: boolean }) {
  const { gl, scene, camera, size } = useThree();
  const composer = useMemo(() => {
    const pipeline = new EffectComposer(gl);
    pipeline.addPass(new RenderPass(scene, camera));
    const ssao = new SSAOPass(scene, camera, size.width, size.height);
    ssao.kernelRadius = 7;
    ssao.minDistance = 0.0008;
    ssao.maxDistance = 0.028;
    pipeline.addPass(ssao);
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.08, 0.16, 1.35);
    pipeline.addPass(bloom);
    const fxaa = new ShaderPass(FXAAShader);
    pipeline.addPass(fxaa);
    pipeline.addPass(new OutputPass());
    return pipeline;
  }, [camera, gl, scene, size.height, size.width]);
  useEffect(() => {
    composer.setSize(size.width, size.height);
    const fxaa = composer.passes.find((pass) => pass instanceof ShaderPass) as ShaderPass | undefined;
    const resolution = fxaa?.material.uniforms.resolution?.value as THREE.Vector2 | undefined;
    resolution?.set(1 / (size.width * gl.getPixelRatio()), 1 / (size.height * gl.getPixelRatio()));
    return () => composer.dispose();
  }, [composer, gl, size.height, size.width]);
  useFrame((_, delta) => {
    if (enabled) composer.render(delta);
    else gl.render(scene, camera);
  }, 1);
  return null;
}

type WalkInput = { forward: boolean; back: boolean; left: boolean; right: boolean; sprint: boolean };
type CollisionBox = [x: number, z: number, halfX: number, halfZ: number];

const WORLD_UP = new THREE.Vector3(0, 1, 0);

function setWalkInput(input: WalkInput, code: string, pressed: boolean): boolean {
  switch (code) {
    case 'KeyW':
    case 'ArrowUp':
      input.forward = pressed;
      return true;
    case 'KeyS':
    case 'ArrowDown':
      input.back = pressed;
      return true;
    case 'KeyA':
    case 'ArrowLeft':
      input.left = pressed;
      return true;
    case 'KeyD':
    case 'ArrowRight':
      input.right = pressed;
      return true;
    case 'ShiftLeft':
    case 'ShiftRight':
      input.sprint = pressed;
      return true;
    default:
      return false;
  }
}

function AisleNavigator({ active, controls, command }: { active: boolean; controls: React.RefObject<OrbitControlsHandle | null>; command: WalkCommand }) {
  const { camera } = useThree();
  const input = useRef<WalkInput>({ forward: false, back: false, left: false, right: false, sprint: false });
  const handledCommand = useRef(0);
  const vectors = useRef({
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    movement: new THREE.Vector3(),
    next: new THREE.Vector3(),
    slideX: new THREE.Vector3(),
    slideZ: new THREE.Vector3(),
    applied: new THREE.Vector3(),
  });
  const collisionBoxes = useMemo<CollisionBox[]>(() => {
    const boxes: CollisionBox[] = STATION_SCENE_ORDER.map(({ position, colliderHalfSize }) => [position[0], position[2], colliderHalfSize[0], colliderHalfSize[1]]);
    boxes.push(
      [-3.95, 5.65, 0.98, 0.66],
      [-6.75, 7.35, 0.72, 1.18],
      [4.42, 1.58, 0.72, 1.62],
      [-8.18, 5.45, 0.58, 1.42],
    );
    return boxes;
  }, []);
  useEffect(() => {
    if (!active) {
      input.current = { forward: false, back: false, left: false, right: false, sprint: false };
      return;
    }
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.defaultPrevented || document.querySelector('[role="dialog"][aria-modal="true"]') || target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (setWalkInput(input.current, event.code, true)) event.preventDefault();
    };
    const keyUp = (event: KeyboardEvent) => setWalkInput(input.current, event.code, false);
    const releaseKeys = () => { input.current = { forward: false, back: false, left: false, right: false, sprint: false }; };
    window.addEventListener('blur', releaseKeys);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    return () => {
      input.current = { forward: false, back: false, left: false, right: false, sprint: false };
      window.removeEventListener('blur', releaseKeys);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  }, [active]);
  useFrame((_, delta) => {
    if (!active || !controls.current) return;
    const keyboard = input.current;
    const hasKeyboardMovement = keyboard.forward || keyboard.back || keyboard.left || keyboard.right;
    const hasCommand = command.id !== handledCommand.current;
    if (!hasKeyboardMovement && !hasCommand) return;
    // A walkthrough or bench modal owns keyboard input, including keys held before it opened.
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
      input.current = { forward: false, back: false, left: false, right: false, sprint: false };
      handledCommand.current = command.id;
      return;
    }
    const orbit = controls.current;
    const { forward, right, movement, next, slideX, slideZ, applied } = vectors.current;
    forward.copy(orbit.target).sub(camera.position);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
    forward.normalize();
    right.copy(forward).cross(WORLD_UP).normalize();
    movement.set(0, 0, 0);
    if (keyboard.forward) movement.add(forward);
    if (keyboard.back) movement.sub(forward);
    if (keyboard.right) movement.add(right);
    if (keyboard.left) movement.sub(right);
    let distance = Math.min(delta, 0.04) * (keyboard.sprint ? 2.6 : 1.45);
    if (hasCommand) {
      handledCommand.current = command.id;
      distance = 0.62;
      switch (command.direction) {
        case 'forward': movement.copy(forward); break;
        case 'back': movement.copy(forward).negate(); break;
        case 'right': movement.copy(right); break;
        case 'left': movement.copy(right).negate(); break;
      }
    }
    if (movement.lengthSq() === 0) return;
    movement.normalize().multiplyScalar(distance);
    next.copy(camera.position).add(movement);
    next.x = THREE.MathUtils.clamp(next.x, -8.1, 4.25);
    next.z = THREE.MathUtils.clamp(next.z, -3.8, 8.75);
    const occupied = (position: THREE.Vector3) => {
      for (const [x, z, halfX, halfZ] of collisionBoxes) {
        if (Math.abs(position.x - x) < halfX && Math.abs(position.z - z) < halfZ) return true;
      }
      return false;
    };
    let resolved = next;
    if (occupied(resolved)) {
      slideX.copy(camera.position);
      slideX.x = next.x;
      slideZ.copy(camera.position);
      slideZ.z = next.z;
      resolved = !occupied(slideX) ? slideX : !occupied(slideZ) ? slideZ : camera.position;
    }
    applied.copy(resolved).sub(camera.position);
    camera.position.add(applied);
    orbit.target.add(applied);
    orbit.update();
  });
  return null;
}

function LabArchitecture({ lightingMode }: { lightingMode: LightingMode }) {
  const inspection = lightingMode === 'inspection';
  return <group>
    <mesh receiveShadow position={[-1.75, -0.07, 2.05]}>
      <boxGeometry args={[15, 0.14, 13.5]} />
      <meshPhysicalMaterial color={inspection ? '#09111a' : '#111924'} roughness={0.8} metalness={0.06} clearcoat={0.14} clearcoatRoughness={0.88} />
    </mesh>
    <Grid position={[-1.75, 0.012, 2.05]} args={[14.2, 13]} cellSize={0.5} cellThickness={0.38} cellColor={inspection ? '#737b77' : '#26384d'} sectionSize={2} sectionThickness={0.75} sectionColor={inspection ? '#96968d' : '#34506c'} fadeDistance={19} fadeStrength={1.6} infiniteGrid={false} />
    <mesh receiveShadow position={[-1.75, 2.45, -4.42]}>
      <boxGeometry args={[14.4, 5, 0.18]} />
      <meshStandardMaterial color={inspection ? '#aaa79f' : '#101923'} roughness={0.68} metalness={0.18} />
    </mesh>
    <mesh receiveShadow position={[-8.86, 2.45, -0.15]}>
      <boxGeometry args={[0.18, 5, 8.7]} />
      <meshStandardMaterial color={inspection ? '#999b95' : '#0d151f'} roughness={0.72} metalness={0.14} />
    </mesh>
    <CeilingServiceFrame />
    {[-5.8, -1.75, 2.3].map((x) => <group key={x} position={[x, 4.65, -4.25]}>
      <mesh castShadow><boxGeometry args={[2.7, 0.07, 0.12]} /><meshStandardMaterial color="#d7f2ff" emissive="#bdeaff" emissiveIntensity={inspection ? 1.1 : 0.7} /></mesh>
      <pointLight position={[0, -0.3, 1.2]} intensity={inspection ? 3.4 : 1.8} distance={6.5} color="#caeaff" decay={2} />
    </group>)}
    {[[-5.25, -1.55], [-1.75, -1.55], [1.75, -1.55], [-5.25, 2.15], [-1.75, 2.15], [1.75, 2.15], [-1.75, 5.5], [1.75, 5.5]].map(([x, z]) => <group key={`${x}-${z}`} position={[x, 4.72, z]}>
      <mesh castShadow><boxGeometry args={[2.25, 0.12, 0.72]} /><meshStandardMaterial color="#687176" metalness={0.52} roughness={0.35} /></mesh>
      <mesh position={[0, -0.07, 0]}><boxGeometry args={[2.02, 0.035, 0.56]} /><meshStandardMaterial color={inspection ? '#e7e7dd' : '#a9c2ca'} emissive={inspection ? '#fffbea' : '#a8d9e5'} emissiveIntensity={inspection ? 1.15 : 0.7} roughness={0.48} /></mesh>
      <pointLight position={[0, -0.25, 0]} intensity={inspection ? 3.6 : 1.8} distance={6.8} color={inspection ? '#fff7df' : '#c5e6ed'} decay={2} />
    </group>)}
    <UtilityServices />
    <FacilitySafetyInfrastructure inspection={inspection} />
  </group>;
}

function CeilingServiceFrame() {
  const fixtures: ReadonlyArray<readonly [number, number]> = [[-5.25, -1.55], [-1.75, -1.55], [1.75, -1.55], [-5.25, 2.15], [-1.75, 2.15], [1.75, 2.15], [-1.75, 5.5], [1.75, 5.5]];
  return <group>
    {[-3.55, 0.05, 3.65, 6.75].map((z) => <mesh key={`rail-z-${z}`} position={[-1.75, 5.04, z]} castShadow>
      <boxGeometry args={[14.1, 0.09, 0.1]} />
      <meshStandardMaterial color="#4a585e" metalness={0.78} roughness={0.28} />
    </mesh>)}
    {[-7.85, -5.25, -1.75, 1.75, 4.25].map((x) => <mesh key={`rail-x-${x}`} position={[x, 5.0, 1.6]} castShadow>
      <boxGeometry args={[0.1, 0.09, 10.4]} />
      <meshStandardMaterial color="#526168" metalness={0.8} roughness={0.26} />
    </mesh>)}
    {fixtures.flatMap(([x, z]) => [-0.83, 0.83].map((offset) => <group key={`drop-${x}-${z}-${offset}`} position={[x + offset, 4.86, z]}>
      <mesh castShadow><cylinderGeometry args={[0.017, 0.017, 0.31, 12]} /><meshStandardMaterial color="#65747a" metalness={0.86} roughness={0.2} /></mesh>
      <mesh position={[0, 0.17, 0]}><cylinderGeometry args={[0.055, 0.055, 0.035, 16]} /><meshStandardMaterial color="#405058" metalness={0.82} roughness={0.26} /></mesh>
    </group>))}
    {[-5.25, -1.75, 1.75].map((x) => <group key={`service-drop-${x}`} position={[x, 4.25, -3.92]}>
      <Line points={[[0, 0.74, 0], [0, 0.14, 0], [0.18, 0, 0]]} color="#405969" lineWidth={1.1} />
      <mesh position={[0, 0.46, 0]} castShadow><cylinderGeometry args={[0.026, 0.026, 0.72, 12]} /><meshStandardMaterial color="#6b7779" metalness={0.82} roughness={0.23} /></mesh>
    </group>)}
  </group>;
}

function FacilitySafetyInfrastructure({ inspection }: { inspection: boolean }) {
  return <group>
    <group position={[3.18, 0.05, -4.27]}>
      <RoundedBox args={[1.58, 2.55, 0.18]} radius={0.055} position={[0, 1.27, 0]} castShadow><meshStandardMaterial color="#29353b" metalness={0.7} roughness={0.3} /></RoundedBox>
      <RoundedBox args={[1.34, 2.31, 0.13]} radius={0.035} position={[0, 1.24, 0.11]} castShadow><meshPhysicalMaterial color={inspection ? '#b8c0bf' : '#526069'} metalness={0.52} roughness={0.42} clearcoat={0.18} /></RoundedBox>
      <RoundedBox args={[0.72, 0.62, 0.055]} radius={0.035} position={[0, 1.65, 0.195]}><meshPhysicalMaterial color="#21343b" transparent opacity={0.7} roughness={0.05} metalness={0.12} transmission={0.12} /></RoundedBox>
      <mesh position={[0.44, 1.05, 0.205]} castShadow><boxGeometry args={[0.25, 0.055, 0.06]} /><meshStandardMaterial color="#4d5659" metalness={0.88} roughness={0.18} /></mesh>
      <mesh position={[0.54, 1.05, 0.235]}><sphereGeometry args={[0.045, 18, 12]} /><meshStandardMaterial color="#6f7778" metalness={0.85} roughness={0.2} /></mesh>
      <mesh position={[0, 2.12, 0.19]}><planeGeometry args={[0.72, 0.08]} /><meshBasicMaterial color="#4dd5ed" transparent opacity={0.68} /></mesh>
      <group position={[-1.0, 1.12, 0.12]}>
        <RoundedBox args={[0.28, 0.55, 0.13]} radius={0.04} castShadow><meshStandardMaterial color="#25343d" metalness={0.6} roughness={0.34} /></RoundedBox>
        <mesh position={[0, 0.11, 0.075]}><planeGeometry args={[0.16, 0.12]} /><meshBasicMaterial color="#07171b" /></mesh>
        <mesh position={[0, 0.12, 0.08]}><planeGeometry args={[0.09, 0.018]} /><meshBasicMaterial color="#51e19a" /></mesh>
        <mesh position={[0, -0.12, 0.08]}><circleGeometry args={[0.035, 16]} /><meshStandardMaterial color="#51e19a" emissive="#206847" emissiveIntensity={0.8} /></mesh>
      </group>
      <group position={[0, 2.68, 0.07]}>
        <RoundedBox args={[0.76, 0.22, 0.12]} radius={0.035}><meshStandardMaterial color="#1e4031" roughness={0.42} /></RoundedBox>
        <mesh position={[0, 0, 0.066]}><planeGeometry args={[0.48, 0.035]} /><meshBasicMaterial color="#8cf0c0" /></mesh>
      </group>
    </group>
    <group position={[3.18, 0.035, -3.45]}>
      <RoundedBox args={[1.7, 0.045, 1.28]} radius={0.03} receiveShadow><meshStandardMaterial color="#22363a" roughness={0.88} /></RoundedBox>
      {[-0.45, 0, 0.45].map((x) => <Line key={x} points={[[x, 0.03, -0.48], [x, 0.03, 0.48]]} color="#4c7071" lineWidth={0.65} transparent opacity={0.65} />)}
    </group>
    <group>
      <mesh position={[-8.55, 1.58, 0.85]} castShadow><cylinderGeometry args={[0.04, 0.04, 2.7, 18]} /><meshStandardMaterial color="#7e8d90" metalness={0.88} roughness={0.18} /></mesh>
      <mesh position={[-8.12, 2.91, 0.85]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.04, 0.04, 0.86, 18]} /><meshStandardMaterial color="#7e8d90" metalness={0.88} roughness={0.18} /></mesh>
      <mesh position={[-7.68, 2.74, 0.85]} castShadow><cylinderGeometry args={[0.16, 0.08, 0.24, 24]} /><meshStandardMaterial color="#aeb9b8" metalness={0.78} roughness={0.22} /></mesh>
      <mesh position={[-8.12, 1.05, 0.85]} castShadow><cylinderGeometry args={[0.28, 0.2, 0.13, 28]} /><meshPhysicalMaterial color="#8aa4a2" metalness={0.72} roughness={0.24} clearcoat={0.22} /></mesh>
      <mesh position={[-8.12, 1.16, 0.85]}><torusGeometry args={[0.2, 0.035, 10, 28]} /><meshStandardMaterial color="#c1cbca" metalness={0.82} roughness={0.18} /></mesh>
      {[-0.1, 0.1].map((z) => <mesh key={z} position={[-8.12, 1.2, 0.85 + z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.025, 0.025, 0.22, 14]} /><meshStandardMaterial color="#557e76" metalness={0.7} roughness={0.24} /></mesh>)}
      <mesh position={[-8.12, 0.58, 0.85]} castShadow><cylinderGeometry args={[0.055, 0.055, 0.82, 18]} /><meshStandardMaterial color="#68797d" metalness={0.8} roughness={0.22} /></mesh>
      <mesh position={[-8.12, 0.16, 0.85]}><cylinderGeometry args={[0.28, 0.35, 0.08, 24]} /><meshStandardMaterial color="#405055" metalness={0.68} roughness={0.3} /></mesh>
      <group position={[-8.72, 1.28, -0.65]} rotation={[0, Math.PI / 2, 0]}>
        <RoundedBox args={[0.78, 1.18, 0.12]} radius={0.045} castShadow><meshStandardMaterial color="#315d49" metalness={0.42} roughness={0.46} /></RoundedBox>
        <mesh position={[0, 0.3, 0.07]}><planeGeometry args={[0.5, 0.12]} /><meshBasicMaterial color="#d7ece1" /></mesh>
        <mesh position={[0, -0.11, 0.07]}><planeGeometry args={[0.48, 0.34]} /><meshBasicMaterial color="#173528" /></mesh>
        <mesh position={[0, -0.11, 0.075]}><planeGeometry args={[0.32, 0.035]} /><meshBasicMaterial color="#8bd8b2" /></mesh>
      </group>
      <mesh position={[-8.05, 0.025, 0.85]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.46, 0.52, 32]} /><meshBasicMaterial color="#51e19a" transparent opacity={0.5} /></mesh>
    </group>
    <OxygenMonitor inspection={inspection} />
  </group>;
}

function OxygenMonitor({ inspection }: { inspection: boolean }) {
  return <group position={[4.42, 1.72, -4.26]}>
    <RoundedBox args={[0.48, 0.68, 0.12]} radius={0.04} castShadow><meshStandardMaterial color={inspection ? '#5a6668' : '#26383c'} metalness={0.56} roughness={0.34} /></RoundedBox>
    <mesh position={[0, 0.1, 0.065]}><planeGeometry args={[0.34, 0.23]} /><meshBasicMaterial color="#06181a" /></mesh>
    <mesh position={[0, 0.13, 0.069]}><planeGeometry args={[0.22, 0.035]} /><meshBasicMaterial color="#75e7ae" /></mesh>
    <mesh position={[-0.13, -0.2, 0.07]}><circleGeometry args={[0.035, 16]} /><meshStandardMaterial color="#51e19a" emissive="#1e6848" emissiveIntensity={0.9} /></mesh>
    <mesh position={[0.08, -0.2, 0.07]}><circleGeometry args={[0.035, 16]} /><meshStandardMaterial color="#56676a" /></mesh>
  </group>;
}

function UtilityServices() {
  return <group>
    <group position={[-1.75, 3.72, -4.05]}>
      <mesh castShadow><boxGeometry args={[12.6, 0.16, 0.42]} /><meshStandardMaterial color="#34424d" metalness={0.82} roughness={0.32} /></mesh>
      {[-5.8, -4.4, -3, -1.6, -0.2, 1.2, 2.6, 4].map((x) => <mesh key={x} position={[x, 0.12, 0]}><boxGeometry args={[0.05, 0.28, 0.5]} /><meshStandardMaterial color="#65737d" metalness={0.88} roughness={0.24} /></mesh>)}
      {[-0.12, 0, 0.12].map((z, index) => <Line key={z} points={[[-6.1, 0.12 + index * 0.045, z], [6.1, 0.12 + index * 0.045, z]]} color={['#26333e', '#536878', '#2d3c47'][index]} lineWidth={1.1} />)}
    </group>
    {[-5.25, -1.75, 1.75].map((x, index) => <group key={x} position={[x, 2.35, -4.26]}>
      <RoundedBox args={[1.62, 0.52, 0.12]} radius={0.035} castShadow><meshStandardMaterial color="#2a3945" metalness={0.72} roughness={0.34} /></RoundedBox>
      {[-0.48, -0.16, 0.16, 0.48].map((port, portIndex) => <group key={port} position={[port, 0.02, 0.09]}>
        <mesh><cylinderGeometry args={[0.065, 0.065, 0.065, 18]} /><meshStandardMaterial color={['#d6b046', '#78b4cf', '#9f7ed1', '#aeb8bd'][portIndex]} metalness={0.55} roughness={0.3} /></mesh>
        <mesh position={[0, -0.16, 0.01]}><boxGeometry args={[0.12, 0.05, 0.04]} /><meshBasicMaterial color="#07131a" /></mesh>
      </group>)}
      <mesh position={[0, 0.17, 0.072]}><planeGeometry args={[0.68, 0.07]} /><meshBasicMaterial color={index === 2 ? '#f4b95f' : '#4dd5ed'} transparent opacity={0.62} /></mesh>
      <Line points={[[0, 0.26, 0], [0, 1.22, 0.18], [0.2, 1.35, 0.18]]} color="#556b79" lineWidth={1.2} />
    </group>)}
    <group position={[-8.72, 1.55, 2.95]} rotation={[0, Math.PI / 2, 0]}>
      <RoundedBox args={[0.66, 1.08, 0.11]} radius={0.035} castShadow><meshStandardMaterial color="#273642" metalness={0.7} roughness={0.36} /></RoundedBox>
      <mesh position={[0, 0.28, 0.075]}><circleGeometry args={[0.17, 28]} /><meshStandardMaterial color="#b83c3c" emissive="#651717" emissiveIntensity={0.6} roughness={0.42} /></mesh>
      <mesh position={[0, -0.18, 0.075]}><planeGeometry args={[0.45, 0.16]} /><meshBasicMaterial color="#d4ba55" /></mesh>
      <mesh position={[0, -0.18, 0.079]}><planeGeometry args={[0.29, 0.025]} /><meshBasicMaterial color="#342d10" /></mesh>
    </group>
    <group position={[3.95, 0.08, -3.88]}>
      <mesh position={[0, 0.86, 0]} castShadow><cylinderGeometry args={[0.16, 0.19, 1.08, 24]} /><meshStandardMaterial color="#a52f36" metalness={0.5} roughness={0.35} /></mesh>
      <mesh position={[0, 1.47, 0]}><torusGeometry args={[0.15, 0.025, 10, 22]} /><meshStandardMaterial color="#353f46" metalness={0.8} /></mesh>
      <Line points={[[0.03, 1.4, 0], [0.28, 1.57, 0], [0.38, 1.48, 0]]} color="#303b44" lineWidth={1.2} />
      <mesh position={[0, 0.27, 0]}><boxGeometry args={[0.48, 0.08, 0.38]} /><meshStandardMaterial color="#2a3741" metalness={0.6} /></mesh>
    </group>
  </group>;
}

function OperationsProps() {
  return <group>
    <group position={[-3.95, 0.08, 5.65]} rotation={[0, -0.12, 0]}>
      {[0.32, 1.02].map((y) => <RoundedBox key={y} args={[1.5, 0.12, 0.82]} radius={0.04} position={[0, y, 0]} castShadow><meshPhysicalMaterial color="#647481" metalness={0.8} roughness={0.25} clearcoat={0.28} /></RoundedBox>)}
      {[-0.65, 0.65].flatMap((x) => [-0.3, 0.3].map((z) => <mesh key={`${x}-${z}`} position={[x, 0.65, z]}><boxGeometry args={[0.055, 0.7, 0.055]} /><meshStandardMaterial color="#465661" metalness={0.78} /></mesh>))}
      {[-0.62, 0.62].flatMap((x) => [-0.28, 0.28].map((z) => <group key={`w-${x}-${z}`} position={[x, 0, z]}>
        <mesh position={[0, 0.24, 0]} castShadow><cylinderGeometry args={[0.026, 0.026, 0.13, 14]} /><meshStandardMaterial color="#52616a" metalness={0.82} roughness={0.22} /></mesh>
        <mesh position={[0, 0.14, 0]} castShadow><boxGeometry args={[0.055, 0.12, 0.12]} /><meshStandardMaterial color="#46555e" metalness={0.78} roughness={0.25} /></mesh>
        <mesh position={[0, 0.03, 0]} castShadow><torusGeometry args={[0.075, 0.027, 10, 20]} /><meshStandardMaterial color="#111921" roughness={0.78} /></mesh>
        <mesh position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.038, 0.038, 0.085, 18]} /><meshStandardMaterial color="#75838a" metalness={0.86} roughness={0.18} /></mesh>
      </group>))}
      {[-0.42, 0, 0.42].map((x, i) => <mesh key={x} position={[x, 1.17, 0]} castShadow><cylinderGeometry args={[0.1, 0.09, 0.26, 18]} /><meshStandardMaterial color={['#d7b66e', '#90b9c3', '#c97860'][i]} roughness={0.4} /></mesh>)}
    </group>
    <PoweredPalletJack />
    <GasServiceBay />
    <SampleStagingRack />
  </group>;
}

function PoweredPalletJack() {
  const statusColor = '#6a7f88';
  return <group position={[-6.75, 0.07, 7.35]} rotation={[0, -0.08, 0]}>
    {[-0.28, 0.28].map((x) => <RoundedBox key={x} args={[0.16, 0.11, 1.78]} radius={0.04} position={[x, 0.12, -0.28]} castShadow><meshStandardMaterial color="#d7a13b" metalness={0.55} roughness={0.34} /></RoundedBox>)}
    {[-0.28, 0.28].map((x) => <group key={`load-${x}`} position={[x, 0.09, -1.04]} rotation={[0, 0, Math.PI / 2]}><mesh castShadow><cylinderGeometry args={[0.075, 0.075, 0.11, 18]} /><meshStandardMaterial color="#161f24" roughness={0.72} /></mesh><mesh position={[0, 0.058, 0]}><circleGeometry args={[0.045, 16]} /><meshStandardMaterial color="#58676c" metalness={0.6} roughness={0.3} /></mesh></group>)}
    <RoundedBox args={[0.9, 0.22, 0.58]} radius={0.08} position={[0, 0.2, 0.61]} castShadow><meshStandardMaterial color="#b9852e" metalness={0.6} roughness={0.31} /></RoundedBox>
    <RoundedBox args={[0.68, 0.58, 0.48]} radius={0.075} position={[0, 0.53, 0.65]} castShadow><meshPhysicalMaterial color="#2c3a40" metalness={0.65} roughness={0.3} clearcoat={0.22} /></RoundedBox>
    <mesh position={[0, 0.6, 0.898]} rotation={[-0.06, 0, 0]}><planeGeometry args={[0.42, 0.19]} /><meshBasicMaterial color="#071419" /></mesh>
    <mesh position={[0, 0.61, 0.902]} rotation={[-0.06, 0, 0]}><planeGeometry args={[0.29, 0.026]} /><meshBasicMaterial color={statusColor} /></mesh>
    <mesh position={[-0.23, 0.47, 0.9]}><circleGeometry args={[0.045, 18]} /><meshStandardMaterial color="#c13e3e" emissive="#5b1212" emissiveIntensity={0.65} roughness={0.35} /></mesh>
    <group position={[0, 0.58, 0.73]} rotation={[0.38, 0, 0]}>
      <mesh position={[0, 0.72, 0]} castShadow><cylinderGeometry args={[0.052, 0.052, 1.42, 16]} /><meshStandardMaterial color="#5e7078" metalness={0.78} roughness={0.24} /></mesh>
      <RoundedBox args={[0.58, 0.22, 0.18]} radius={0.07} position={[0, 1.46, 0]} castShadow><meshStandardMaterial color="#27363c" metalness={0.55} roughness={0.36} /></RoundedBox>
      {[-0.21, 0.21].map((x) => <mesh key={x} position={[x, 1.46, 0.11]}><circleGeometry args={[0.045, 18]} /><meshStandardMaterial color={x < 0 ? '#63757d' : statusColor} emissive={x > 0 ? statusColor : '#000000'} emissiveIntensity={x > 0 ? 0.65 : 0} /></mesh>)}
      <mesh position={[0, 1.46, 0.115]}><planeGeometry args={[0.16, 0.055]} /><meshBasicMaterial color="#0a151a" /></mesh>
      <mesh position={[0, 1.46, 0.119]}><planeGeometry args={[0.1, 0.012]} /><meshBasicMaterial color={statusColor} /></mesh>
      <mesh position={[0, 1.31, 0.03]}><sphereGeometry args={[0.055, 16, 12]} /><meshStandardMaterial color="#d54f3f" emissive="#6f1c15" emissiveIntensity={0.65} /></mesh>
    </group>
    {[-0.37, 0.37].map((x) => <mesh key={x} position={[x, 0.15, 0.72]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.13, 0.13, 0.1, 20]} /><meshStandardMaterial color="#121b20" roughness={0.76} /></mesh>)}
    <mesh position={[0, 0.1, 0.79]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.16, 0.16, 0.12, 22]} /><meshStandardMaterial color="#172228" roughness={0.7} /></mesh>
    <mesh position={[0.42, 0.68, 0.64]}><cylinderGeometry args={[0.045, 0.06, 0.18, 16]} /><meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={0.25} transparent opacity={0.9} /></mesh>
  </group>;
}

function GasServiceBay() {
  const cylinderPositions = [-0.72, 0, 0.72];
  const serviceColor = '#73a6c7';
  return <group position={[4.42, 0.04, 1.58]}>
    <RoundedBox args={[1.34, 0.06, 3.05]} radius={0.025} receiveShadow><meshStandardMaterial color="#263437" roughness={0.88} /></RoundedBox>
    <Line points={[[0.61, 0.05, -1.42], [0.61, 0.05, 1.42], [-0.61, 0.05, 1.42], [-0.61, 0.05, -1.42], [0.61, 0.05, -1.42]]} color="#d6aa43" lineWidth={0.9} transparent opacity={0.78} />
    {[-0.55, 0.55].flatMap((x) => [-1.35, 1.35].map((z) => <mesh key={`${x}-${z}`} position={[x, 1.22, z]} castShadow><boxGeometry args={[0.055, 2.4, 0.055]} /><meshStandardMaterial color="#4f6267" metalness={0.78} roughness={0.26} /></mesh>))}
    {[-1.35, 1.35].map((z) => <mesh key={z} position={[0, 2.38, z]} castShadow><boxGeometry args={[1.18, 0.055, 0.055]} /><meshStandardMaterial color="#52666b" metalness={0.82} roughness={0.24} /></mesh>)}
    <mesh position={[-0.53, 1.32, 0]} castShadow><boxGeometry args={[0.05, 2.08, 2.58]} /><meshStandardMaterial color="#394c51" metalness={0.62} roughness={0.44} wireframe /></mesh>
    {cylinderPositions.map((z, index) => <group key={z} position={[-0.16, 0.12, z]}>
      <mesh position={[0, 0.74, 0]} castShadow><cylinderGeometry args={[0.19, 0.2, 1.28, 26]} /><meshPhysicalMaterial color={index === 1 ? '#8ea5a2' : '#65777a'} metalness={0.62} roughness={0.3} clearcoat={0.28} /></mesh>
      <mesh position={[0, 1.42, 0]} castShadow><sphereGeometry args={[0.17, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={index === 1 ? '#aab9b6' : '#77878a'} metalness={0.65} roughness={0.28} /></mesh>
      <mesh position={[0, 1.57, 0]}><cylinderGeometry args={[0.065, 0.065, 0.16, 16]} /><meshStandardMaterial color="#34474a" metalness={0.82} roughness={0.2} /></mesh>
      <mesh position={[0, 0.78, 0.205]} rotation={[0, 0, 0]}><planeGeometry args={[0.24, 0.33]} /><meshBasicMaterial color="#e8e5d5" /></mesh>
      <mesh position={[0, 0.82, 0.21]}><planeGeometry args={[0.17, 0.025]} /><meshBasicMaterial color={index === 1 ? serviceColor : index === 0 ? '#b67c4d' : '#73a6c7'} /></mesh>
      <Line points={[[-0.27, 1.05, 0.22], [0.27, 1.05, 0.22]]} color="#c8a24a" lineWidth={1.4} />
    </group>)}
    <group position={[0.17, 2.06, 0]}>
      <mesh castShadow><cylinderGeometry args={[0.035, 0.035, 2.58, 16]} /><meshStandardMaterial color="#899a9d" metalness={0.9} roughness={0.16} /></mesh>
      {cylinderPositions.map((z, index) => <group key={z} position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh><cylinderGeometry args={[0.1, 0.1, 0.055, 18]} /><meshStandardMaterial color="#15232a" metalness={0.56} roughness={0.3} /></mesh>
        <mesh position={[0, 0.031, 0]}><circleGeometry args={[0.075, 22]} /><meshBasicMaterial color="#d5dddc" /></mesh>
        <Line points={[[0, 0.036, 0], [index === 1 ? -0.015 : -0.025, 0.038, -0.045]]} color={index === 1 ? serviceColor : '#c28f4e'} lineWidth={1.2} />
      </group>)}
    </group>
    <group position={[0.53, 1.18, -1.02]} rotation={[0, Math.PI / 2, 0]}>
      <RoundedBox args={[0.56, 0.92, 0.12]} radius={0.035} castShadow><meshStandardMaterial color="#25353b" metalness={0.68} roughness={0.34} /></RoundedBox>
      <mesh position={[0, 0.2, 0.067]}><planeGeometry args={[0.38, 0.22]} /><meshBasicMaterial color="#07161a" /></mesh>
      <mesh position={[0, 0.2, 0.071]}><planeGeometry args={[0.27, 0.024]} /><meshBasicMaterial color={serviceColor} /></mesh>
      {[-0.17, 0, 0.17].map((x, index) => <mesh key={x} position={[x, -0.18, 0.07]}><circleGeometry args={[0.035, 14]} /><meshStandardMaterial color={index === 1 ? serviceColor : '#65777b'} emissive={index === 1 ? serviceColor : '#000000'} emissiveIntensity={index === 1 ? 0.8 : 0} /></mesh>)}
    </group>
    <mesh position={[0.52, 2.58, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[1.35, 0.24]} /><meshBasicMaterial color="#173a32" /></mesh>
    <mesh position={[0.525, 2.58, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[0.94, 0.035]} /><meshBasicMaterial color={serviceColor} /></mesh>
  </group>;
}

function SampleStagingRack() {
  const crucibleCount = 7;
  const linerCount = 2;
  const tabCount = 1;
  return <group position={[-8.05, 0.04, -2.15]} rotation={[0, Math.PI / 2, 0]}>
    {[-1.08, 1.08].flatMap((x) => [-0.24, 0.24].map((z) => <mesh key={`${x}-${z}`} position={[x, 1.18, z]} castShadow><boxGeometry args={[0.055, 2.32, 0.055]} /><meshStandardMaterial color="#69787d" metalness={0.86} roughness={0.22} /></mesh>))}
    {[0.22, 0.82, 1.42, 2.02].map((y) => <RoundedBox key={y} args={[2.28, 0.075, 0.58]} radius={0.02} position={[0, y, 0]} castShadow><meshPhysicalMaterial color="#697b80" metalness={0.83} roughness={0.24} clearcoat={0.18} /></RoundedBox>)}
    {Array.from({ length: crucibleCount }, (_, index) => { const x = -0.88 + (index % 6) * 0.35; const z = index < 6 ? -0.11 : 0.13; return <group key={`cruc-${index}`} position={[x, 0.47, z]}>
      <mesh castShadow><cylinderGeometry args={[0.12, 0.1, 0.27, 20, 1, true]} /><meshPhysicalMaterial color="#c8c0aa" roughness={0.48} clearcoat={0.08} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, -0.134, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.098, 20]} /><meshStandardMaterial color="#afa68f" roughness={0.5} /></mesh>
      <mesh position={[0, 0.137, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.105, 0.009, 8, 24]} /><meshStandardMaterial color="#e0d8c4" roughness={0.36} /></mesh>
      <mesh position={[0, 0.132, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.088, 22]} /><meshStandardMaterial color="#3d3a34" roughness={0.72} /></mesh>
    </group>; })}
    {Array.from({ length: linerCount }, (_, index) => { const x = -0.78 + (index % 3) * 0.78; const z = index < 3 ? -0.11 : 0.13; return <RoundedBox key={`liner-${index}`} args={[0.58, 0.12, 0.34]} radius={0.025} position={[x, 1.08, z]} castShadow><meshPhysicalMaterial color="#9fb7b2" roughness={0.36} clearcoat={0.22} /></RoundedBox>; })}
    {Array.from({ length: tabCount }, (_, index) => <group key={`tab-${index}`} position={[-0.88 + index * 0.35, 1.7, 0]} rotation={[Math.PI / 2, 0, 0]}><mesh castShadow><cylinderGeometry args={[0.1, 0.1, 0.055, 22]} /><meshStandardMaterial color="#20282d" metalness={0.5} roughness={0.42} /></mesh><mesh position={[0, 0.03, 0]}><circleGeometry args={[0.055, 20]} /><meshBasicMaterial color="#0b0e10" /></mesh></group>)}
    <mesh position={[0, 2.34, 0.01]}><planeGeometry args={[1.52, 0.22]} /><meshBasicMaterial color="#233b3d" /></mesh>
    <mesh position={[0, 2.34, 0.015]}><planeGeometry args={[1.08, 0.034]} /><meshBasicMaterial color="#8cb9b3" /></mesh>
    <StatusBeacon position={[0.98, 2.3, 0.04]} color="#51e19a" active />
  </group>;
}

function StationCell({ station, scene, selected, active, showHotspots, inspected, inspectionPoints, controls, phase, onInspect, onFocus, onSelect }: {
  station: Station;
  scene: StationSceneSpec;
  selected: boolean;
  active: boolean;
  showHotspots: boolean;
  inspected: string[];
  inspectionPoints: InspectionPoint[];
  controls: string[];
  phase: number;
  onInspect: (label: string) => void;
  onFocus: () => void;
  onSelect: (id: string) => void;
}) {
  const tone = TONE_COLORS[station.tone];
  const [hovered, setHovered] = useState(false);
  const setCursor = (cursor: string) => { document.body.style.cursor = cursor; };
  return (
    <group
      position={scene.position}
      onClick={(event) => { event.stopPropagation(); onSelect(station.id); onFocus(); }}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); setCursor('pointer'); }}
      onPointerOut={() => { setHovered(false); setCursor('default'); }}
    >
      <RoundedBox args={[3.08, scene.platformHeight, 2.72]} radius={0.045} smoothness={3} position={[0, scene.platformHeight / 2, 0]} receiveShadow>
        <meshPhysicalMaterial color="#18212a" emissive={selected ? '#16404b' : '#000000'} emissiveIntensity={selected ? 0.08 : 0} roughness={0.72} metalness={0.14} clearcoat={0.12} />
      </RoundedBox>
      <Line points={[[-1.54, 0.082, -1.36], [1.54, 0.082, -1.36], [1.54, 0.082, 1.36], [-1.54, 0.082, 1.36], [-1.54, 0.082, -1.36]]} color={selected ? '#4dd5ed' : tone} lineWidth={selected ? 1.05 : 0.55} transparent opacity={selected ? 0.48 : 0.12} />
      <StationFeet />
      <Equipment kind={scene.kind} active={active} tone={tone} focused={showHotspots} controls={controls} phase={phase} />
      <InstrumentIdentityPlate station={station} kind={scene.kind} tone={tone} />
      <InstrumentServiceDetails kind={scene.kind} tone={tone} active={active} />
      {showHotspots && <InspectionHotspots points={inspectionPoints} tone={tone} inspected={inspected} onInspect={onInspect} />}
      {!showHotspots && <StatusBeacon position={[1.32, 0.08, 1.08]} color={tone} active={active || selected} />}
      <ControlProofLights count={controls.length} />
      {(selected || hovered) && !showHotspots && <Html center position={scene.labelPosition} distanceFactor={10.5} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`station-3d-label ${selected ? 'selected' : ''}`} style={{ '--station-tone': tone } as React.CSSProperties}>
          <span>{station.id}</span><b>{station.name}</b><i>{station.state}</i>
        </div>
      </Html>}
    </group>
  );
}

const INSTRUMENT_DETAIL: Record<StationKind, { formalName: string }> = {
  prep: { formalName: 'POWDER PREPARATION ENCLOSURE' },
  robot: { formalName: 'SAFEGUARDED TRANSFER CELL' },
  furnace: { formalName: 'PROGRAMMABLE BOX FURNACE' },
  xrd: { formalName: 'POWDER X-RAY DIFFRACTOMETER' },
  sem: { formalName: 'SEM / EDS MICROANALYSIS' },
  bet: { formalName: 'GAS SORPTION ANALYZER' },
  tga: { formalName: 'TGA / DSC THERMAL ANALYZER' },
};

function InstrumentIdentityPlate({ station, kind, tone }: { station: Station; kind: StationKind; tone: string }) {
  const detail = INSTRUMENT_DETAIL[kind];
  const texture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#101b20';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = tone;
    context.fillRect(0, 0, 22, canvas.height);
    context.fillStyle = '#e9f3f1';
    context.font = '700 70px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.fillText(station.id, 64, 86);
    context.fillStyle = '#a9c0c1';
    context.font = '600 37px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.fillText(detail.formalName, 64, 142);
    context.fillStyle = tone;
    context.fillRect(64, 216, 896, 5);
    const labelTexture = new THREE.CanvasTexture(canvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    labelTexture.anisotropy = 4;
    return labelTexture;
  }, [detail, station.id, tone]);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;
  return <group position={[0, 0.23, 1.4]}>
    <RoundedBox args={[2.18, 0.48, 0.08]} radius={0.025} castShadow><meshStandardMaterial color="#25333a" metalness={0.72} roughness={0.28} /></RoundedBox>
    <mesh position={[0, 0, 0.046]}><planeGeometry args={[2.02, 0.36]} /><meshBasicMaterial map={texture} toneMapped={false} /></mesh>
    {[-1.035, 1.035].map((x) => <mesh key={x} position={[x, 0, 0.047]}><circleGeometry args={[0.018, 12]} /><meshStandardMaterial color="#9ca9aa" metalness={0.9} roughness={0.16} /></mesh>)}
  </group>;
}

function InstrumentServiceDetails({ kind, tone, active }: { kind: StationKind; tone: string; active: boolean }) {
  const lines = kind === 'sem' || kind === 'xrd' ? ['#4b7896', '#526b78', '#26343a'] : kind === 'bet' || kind === 'tga' ? ['#78b4cf', '#d6b046', '#536878'] : ['#526b78', '#303b42', '#71808a'];
  return <group>
    <group position={[-1.34, 0.47, -1.13]}>
      <RoundedBox args={[0.34, 0.62, 0.18]} radius={0.035} castShadow><meshStandardMaterial color="#26353c" metalness={0.62} roughness={0.34} /></RoundedBox>
      <mesh position={[0, 0.13, 0.095]}><planeGeometry args={[0.23, 0.14]} /><meshBasicMaterial color="#071619" /></mesh>
      <mesh position={[0, 0.14, 0.098]}><planeGeometry args={[0.14, 0.02]} /><meshBasicMaterial color={active ? tone : '#607277'} /></mesh>
      {[-0.08, 0, 0.08].map((x, index) => <mesh key={x} position={[x, -0.11, 0.102]}><circleGeometry args={[0.026, 14]} /><meshStandardMaterial color={lines[index]} metalness={0.52} roughness={0.3} /></mesh>)}
    </group>
    {lines.map((color, index) => <Line key={color} points={[
      [-1.42 + index * 0.07, 0.36, -1.21],
      [-1.47 + index * 0.07, 0.18, -1.32],
      [-1.34 + index * 0.07, 0.09, -1.42],
    ]} color={color} lineWidth={1.15} />)}
    <group position={[1.31, 0.42, -1.18]}>
      <RoundedBox args={[0.33, 0.48, 0.12]} radius={0.025} castShadow><meshStandardMaterial color="#34434a" metalness={0.7} roughness={0.3} /></RoundedBox>
      <mesh position={[0, 0.08, 0.066]}><planeGeometry args={[0.21, 0.055]} /><meshBasicMaterial color={tone} transparent opacity={0.8} /></mesh>
      <mesh position={[0, -0.075, 0.068]}><planeGeometry args={[0.22, 0.1]} /><meshBasicMaterial color="#142328" /></mesh>
    </group>
  </group>;
}

function StationFeet() {
  const feet = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!feet.current) return;
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const scale = new THREE.Vector3(1, 1, 1);
    const positions: ReadonlyArray<readonly [number, number]> = [[-1.36, -1.18], [-1.36, 1.18], [1.36, -1.18], [1.36, 1.18]];
    for (let index = 0; index < positions.length; index += 1) {
      const [x, z] = positions[index];
      matrix.compose(new THREE.Vector3(x, 0.09, z), rotation, scale);
      feet.current.setMatrixAt(index, matrix);
    }
    feet.current.instanceMatrix.needsUpdate = true;
  }, []);
  return <instancedMesh ref={feet} args={[undefined, undefined, 4]}>
    <ringGeometry args={[0.035, 0.055, 16]} />
    <meshStandardMaterial color="#687681" metalness={0.78} roughness={0.26} />
  </instancedMesh>;
}

function Equipment({ kind, active, tone, focused, controls, phase }: { kind: StationKind; active: boolean; tone: string; focused: boolean; controls: string[]; phase: number }) {
  switch (kind) {
    case 'prep': return <PowderPrep controls={controls} />;
    case 'robot': return <RobotCell focused={focused} controls={controls} />;
    case 'furnace': return <Furnace active={active} focused={focused} controls={controls} />;
    case 'xrd': return <Xrd active={phase === 3} focused={focused} controls={controls} phase={phase} />;
    case 'sem': return <SemEds active={active} controls={controls} />;
    case 'bet': return <Bet active={active} focused={focused} tone={tone} controls={controls} />;
    case 'tga': return <TgaDsc active={active} focused={focused} controls={controls} />;
  }
}

function InspectionHotspots({ points, tone, inspected, onInspect }: { points: InspectionPoint[]; tone: string; inspected: string[]; onInspect: (label: string) => void }) {
  const markerRefs = useRef<Array<THREE.Group | null>>([]);
  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime * 2.2;
    for (let index = 0; index < markerRefs.current.length; index += 1) {
      const marker = markerRefs.current[index];
      if (!marker) continue;
      marker.scale.setScalar(0.86 + Math.sin(elapsed + index * 0.8) * 0.18);
    }
  });
  return <group>{points.map((hotspot, hotspotIndex) => <Hotspot key={hotspot.label} {...hotspot} tone={tone} visited={inspected.includes(hotspot.label)} markerRef={(marker) => { markerRefs.current[hotspotIndex] = marker; }} onInspect={onInspect} />)}</group>;
}

function Hotspot({ position, label, displayLabel, tone, visited, markerRef, onInspect }: InspectionPoint & { tone: string; visited: boolean; markerRef: (marker: THREE.Group | null) => void; onInspect: (label: string) => void }) {
  const color = visited ? '#51e19a' : tone;
  return <group position={position} onClick={(event) => { event.stopPropagation(); onInspect(label); }}>
    <group ref={markerRef}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.055, 0.085, 24]} /><meshBasicMaterial color={color} transparent opacity={visited ? 0.48 : 0.9} depthTest={false} /></mesh>
    </group>
    <Html center position={[0, 0.055, 0]} distanceFactor={8} zIndexRange={[18, 0]} style={{ pointerEvents: 'none' }}>
      <span className="hotspot-label" data-hotspot={label} style={{ '--hotspot': color } as React.CSSProperties}>{visited && <i>✓</i>}{displayLabel ?? label}</span>
    </Html>
  </group>;
}

function PowderPrep({ controls }: { controls: string[] }) {
  const balanceDoor = useRef<THREE.Group>(null);
  const flowProven = controls.includes('Prove enclosure flow');
  const draftShieldClosed = controls.includes('Close balance draft shield');
  const balanceZeroed = controls.includes('Zero analytical balance');
  const antistaticProven = controls.includes('Confirm antistatic state');
  useFrame((_, delta) => {
    if (balanceDoor.current) balanceDoor.current.position.x = THREE.MathUtils.damp(balanceDoor.current.position.x, draftShieldClosed ? 0.86 : 1.43, 3.4, delta);
  });
  return <group position={[0, 0.18, 0]}>
    <LabBench position={[0, 0, 0.26]} width={2.62} />
    <mesh position={[0, 2.22, -0.23]} castShadow><cylinderGeometry args={[0.18, 0.18, 0.62, 24]} /><meshStandardMaterial color="#73818a" metalness={0.72} roughness={0.3} /></mesh>
    <mesh position={[0, 1.88, -0.23]}><torusGeometry args={[0.18, 0.045, 10, 28, Math.PI]} /><meshStandardMaterial color="#5d6c76" metalness={0.72} roughness={0.3} /></mesh>
    <RoundedBox args={[2.45, 1.72, 0.82]} radius={0.06} smoothness={3} position={[0, 1.18, -0.22]} castShadow>
      <meshPhysicalMaterial color="#5c6975" roughness={0.42} metalness={0.06} clearcoat={0.16} />
    </RoundedBox>
    <mesh position={[0, 1.18, 0.205]}>
      <planeGeometry args={[2.12, 1.25]} />
      <meshPhysicalMaterial color="#8fc6d1" transparent opacity={0.18} roughness={0.08} metalness={0.1} transmission={0.18} />
    </mesh>
    <mesh position={[0, 0.56, 0.24]} castShadow><boxGeometry args={[2.22, 0.08, 0.72]} /><meshStandardMaterial color="#263542" metalness={0.3} roughness={0.38} /></mesh>
    <mesh position={[0, 1.68, 0.225]}><boxGeometry args={[2.0, 0.045, 0.04]} /><meshStandardMaterial color={flowProven ? '#83e7b8' : '#d7f4ff'} emissive={flowProven ? '#2d9c68' : '#a7e9ff'} emissiveIntensity={1.4} /></mesh>
    <pointLight position={[0, 1.45, 0.45]} intensity={2.2} distance={2.1} color={flowProven ? '#7ee3b4' : '#c7efff'} decay={2} />
    <RoundedBox args={[0.58, 0.42, 0.58]} radius={0.045} position={[0.86, 0.7, 0.18]} castShadow>
      <meshStandardMaterial color="#293b4c" metalness={0.45} roughness={0.4} />
    </RoundedBox>
    <mesh position={[0.86, 0.925, 0.37]} rotation={[-0.08, 0, 0]}><planeGeometry args={[0.41, 0.16]} /><meshBasicMaterial color="#07151b" /></mesh>
    <mesh position={[0.86, 0.928, 0.375]} rotation={[-0.08, 0, 0]}><planeGeometry args={[0.28, 0.025]} /><meshBasicMaterial color={balanceZeroed ? '#51e19a' : '#4dd5ed'} /></mesh>
    <mesh position={[0.86, 0.985, 0.04]} castShadow><cylinderGeometry args={[0.19, 0.21, 0.045, 28]} /><meshStandardMaterial color="#d6dfe2" metalness={0.88} roughness={0.15} /></mesh>
    <group>
      {[0.54, 1.18].flatMap((x) => [1.02, 1.49].map((y) => <mesh key={`${x}-${y}`} position={[x, y, 0.04]} castShadow><boxGeometry args={[0.025, 0.025, 0.57]} /><meshStandardMaterial color="#788b92" metalness={0.86} roughness={0.18} /></mesh>))}
      {[-0.235, 0.315].flatMap((z) => [0.54, 1.18].map((x) => <mesh key={`${x}-${z}`} position={[x, 1.255, z]} castShadow><boxGeometry args={[0.025, 0.5, 0.025]} /><meshStandardMaterial color="#788b92" metalness={0.86} roughness={0.18} /></mesh>))}
      <mesh position={[0.86, 1.255, -0.235]}><planeGeometry args={[0.61, 0.45]} /><meshPhysicalMaterial color="#a9d5dc" transparent opacity={0.12} transmission={0.3} roughness={0.05} side={THREE.DoubleSide} /></mesh>
      {[0.54, 1.18].map((x) => <mesh key={x} position={[x, 1.255, 0.04]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[0.55, 0.45]} /><meshPhysicalMaterial color="#a9d5dc" transparent opacity={0.1} transmission={0.28} roughness={0.05} side={THREE.DoubleSide} /></mesh>)}
      <mesh position={[0.86, 1.49, 0.04]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[0.61, 0.55]} /><meshPhysicalMaterial color="#a9d5dc" transparent opacity={0.12} transmission={0.3} roughness={0.05} side={THREE.DoubleSide} /></mesh>
      <group ref={balanceDoor} position={[1.43, 1.255, 0.325]}>
        <mesh><planeGeometry args={[0.56, 0.45]} /><meshPhysicalMaterial color="#b8e1e5" transparent opacity={draftShieldClosed ? 0.17 : 0.11} transmission={0.32} roughness={0.04} side={THREE.DoubleSide} /></mesh>
        <mesh position={[-0.22, 0, 0.018]} castShadow><boxGeometry args={[0.025, 0.17, 0.035]} /><meshStandardMaterial color="#6b7f87" metalness={0.82} roughness={0.18} /></mesh>
      </group>
      <mesh position={[0.86, 1.54, -0.17]}><boxGeometry args={[0.34, 0.08, 0.09]} /><meshStandardMaterial color="#344a53" metalness={0.68} roughness={0.3} /></mesh>
      <mesh position={[0.86, 1.54, -0.12]}><planeGeometry args={[0.22, 0.025]} /><meshBasicMaterial color={draftShieldClosed ? '#51e19a' : '#f4b95f'} /></mesh>
    </group>
    <PowderLotKit antistaticProven={antistaticProven} />
    <XrdPreparationTools />
  </group>;
}

function PowderLotKit({ antistaticProven }: { antistaticProven: boolean }) {
  return <group position={[-0.3, 0.62, 0.38]}>
    <RoundedBox args={[1.02, 0.055, 0.42]} radius={0.025} position={[0, 0.02, 0]} castShadow><meshStandardMaterial color="#65757b" metalness={0.72} roughness={0.28} /></RoundedBox>
    <RoundedBox args={[0.9, 0.018, 0.31]} radius={0.012} position={[-0.06, 0.055, 0]}><meshStandardMaterial color="#d5d9d6" roughness={0.62} /></RoundedBox>
    {[-0.27, 0, 0.27].map((x, index) => <group key={x} position={[x - 0.08, 0.2, 0]}>
      <mesh castShadow><cylinderGeometry args={[0.095, 0.085, 0.28, 20]} /><meshPhysicalMaterial color={['#bd825f', '#8caab0', '#c3aa70'][index]} roughness={0.38} clearcoat={0.28} /></mesh>
      <mesh position={[0, 0.155, 0]}><cylinderGeometry args={[0.082, 0.082, 0.045, 20]} /><meshStandardMaterial color="#d9dfe0" metalness={0.58} roughness={0.22} /></mesh>
      <mesh position={[0, 0.015, 0.096]}><planeGeometry args={[0.13, 0.075]} /><meshBasicMaterial color="#eee9d8" /></mesh>
      <mesh position={[0, 0.015, 0.099]}><planeGeometry args={[0.09, 0.012]} /><meshBasicMaterial color={index === 1 ? '#4dd5ed' : '#7a6751'} /></mesh>
    </group>)}
    <group position={[0.43, 0.19, -0.02]} rotation={[0, -0.2, 0]}>
      <RoundedBox args={[0.25, 0.27, 0.2]} radius={0.035} castShadow><meshStandardMaterial color="#33464d" metalness={0.34} roughness={0.38} /></RoundedBox>
      <mesh position={[0, 0, 0.104]}><planeGeometry args={[0.18, 0.16]} /><meshBasicMaterial color="#122229" /></mesh>
      {[-0.055, 0, 0.055].map((x) => <mesh key={x} position={[x, 0.025, 0.108]}><circleGeometry args={[0.018, 14]} /><meshStandardMaterial color="#82999e" metalness={0.42} roughness={0.3} /></mesh>)}
      <mesh position={[0, -0.075, 0.109]}><planeGeometry args={[0.12, 0.018]} /><meshBasicMaterial color={antistaticProven ? '#51e19a' : '#61777e'} /></mesh>
      {[-0.07, 0.07].map((x) => <mesh key={x} position={[x, -0.155, 0]}><boxGeometry args={[0.035, 0.04, 0.16]} /><meshStandardMaterial color="#27353a" roughness={0.55} /></mesh>)}
      <Line points={[[0.12, -0.03, -0.08], [0.28, 0.02, -0.12], [0.38, 0.24, -0.2]]} color="#263238" lineWidth={1.25} />
      {antistaticProven && <pointLight position={[0, 0, 0.16]} intensity={0.45} distance={0.58} color="#51e19a" decay={2} />}
    </group>
  </group>;
}

function XrdPreparationTools() {
  return <group position={[-0.53, 0.74, -0.02]}>
    <RoundedBox args={[0.48, 0.34, 0.42]} radius={0.055} position={[-0.38, 0.12, 0]} castShadow><meshStandardMaterial color="#344750" metalness={0.5} roughness={0.34} /></RoundedBox>
    <mesh position={[-0.38, 0.31, 0]} castShadow><cylinderGeometry args={[0.15, 0.18, 0.08, 28]} /><meshStandardMaterial color="#aab4b6" metalness={0.8} roughness={0.2} /></mesh>
    <mesh position={[-0.38, 0.36, 0]}><torusGeometry args={[0.12, 0.018, 10, 26]} /><meshStandardMaterial color="#5d7178" metalness={0.76} roughness={0.22} /></mesh>
    {[0, 0.08, 0.16].map((y, index) => <group key={y} position={[0.12, y, 0]}>
      <mesh castShadow><cylinderGeometry args={[0.13 - index * 0.006, 0.13 - index * 0.006, 0.065, 28]} /><meshStandardMaterial color="#9aa8aa" metalness={0.72} roughness={0.23} /></mesh>
      <mesh position={[0, 0.037, 0]}><torusGeometry args={[0.105 - index * 0.005, 0.01, 8, 24]} /><meshStandardMaterial color="#40565d" metalness={0.68} roughness={0.28} /></mesh>
    </group>)}
    <RoundedBox args={[0.42, 0.035, 0.26]} radius={0.02} position={[0.49, -0.1, 0.05]} castShadow><meshStandardMaterial color="#5a6c72" metalness={0.68} roughness={0.25} /></RoundedBox>
    {[-0.12, 0.12].map((x) => <group key={x} position={[0.49 + x, -0.062, 0.05]}>
      <mesh><cylinderGeometry args={[0.07, 0.07, 0.018, 24]} /><meshStandardMaterial color="#222f35" metalness={0.58} roughness={0.3} /></mesh>
      <mesh position={[0, 0.012, 0]}><cylinderGeometry args={[0.052, 0.052, 0.008, 24]} /><meshStandardMaterial color="#c8b273" roughness={0.62} /></mesh>
    </group>)}
  </group>;
}

function RobotCell({ focused, controls }: { focused: boolean; controls: string[] }) {
  const gateClosed = controls.includes('Close access gate');
  const safeguardReset = controls.includes('Reset safeguarded stop');
  const gripperProven = controls.includes('Prove gripper state');
  return <group position={[0, 0.18, 0]}>
    <SafetyCage focused={focused} gateClosed={gateClosed} reset={safeguardReset} />
    <RobotArm gripperProven={gripperProven} />
    <RobotProcessFixture gripperProven={gripperProven} />
    <RoundedBox args={[0.72, 1.1, 0.5]} radius={0.05} position={[1.55, 0.72, 0.55]} castShadow>
      <meshStandardMaterial color="#263745" metalness={0.72} roughness={0.28} />
    </RoundedBox>
    <mesh position={[1.55, 0.86, 0.805]}><planeGeometry args={[0.48, 0.3]} /><meshBasicMaterial color="#06151a" /></mesh>
    <mesh position={[1.55, 0.89, 0.81]}><planeGeometry args={[0.34, 0.025]} /><meshBasicMaterial color="#6c7b8a" /></mesh>
    <group position={[1.55, 1.43, 0.55]}>
      <mesh position={[0, -0.12, 0]} castShadow><cylinderGeometry args={[0.026, 0.026, 0.24, 12]} /><meshStandardMaterial color="#66747a" metalness={0.8} roughness={0.22} /></mesh>
      {[0.12, 0, -0.12].map((y) => <mesh key={y} position={[0, y, 0]} castShadow><cylinderGeometry args={[0.072, 0.072, 0.09, 18]} /><meshStandardMaterial color="#29343a" roughness={0.28} /></mesh>)}
      <mesh position={[0, 0.19, 0]}><cylinderGeometry args={[0.075, 0.075, 0.025, 18]} /><meshStandardMaterial color="#4c575b" metalness={0.72} roughness={0.25} /></mesh>
    </group>
    <group position={[1.28, 1.05, 1.18]} rotation={[0, -0.18, 0]}>
      <RoundedBox args={[0.22, 0.36, 0.08]} radius={0.035} castShadow><meshStandardMaterial color="#25343b" metalness={0.12} roughness={0.42} /></RoundedBox>
      <mesh position={[0, 0.055, 0.045]}><planeGeometry args={[0.13, 0.12]} /><meshBasicMaterial color="#07161a" /></mesh>
      <mesh position={[0, 0.06, 0.05]}><planeGeometry args={[0.085, 0.014]} /><meshBasicMaterial color="#51e19a" /></mesh>
      <mesh position={[0, -0.105, 0.05]}><circleGeometry args={[0.038, 18]} /><meshStandardMaterial color="#d54f45" emissive="#681c18" emissiveIntensity={0.65} /></mesh>
      <Line points={[[0.08, -0.18, -0.02], [0.22, -0.36, -0.08], [0.22, -0.7, -0.34]]} color="#202c31" lineWidth={1.6} />
    </group>
  </group>;
}

function SafetyCage({ focused, gateClosed, reset }: { focused: boolean; gateClosed: boolean; reset: boolean }) {
  const gate = useRef<THREE.Group>(null);
  const posts: [number, number, number][] = [[-1.35, 1.15, -1.05], [1.35, 1.15, -1.05], [-1.35, 1.15, 1.05], [1.35, 1.15, 1.05]];
  useFrame((_, delta) => {
    if (gate.current) gate.current.position.x = THREE.MathUtils.damp(gate.current.position.x, gateClosed ? 0 : 1.06, 3.1, delta);
  });
  const panelOpacity = focused ? 0.13 : 0.2;
  return <group>
    {posts.map((position, index) => <mesh key={index} position={position} castShadow><boxGeometry args={[0.055, 2.25, 0.055]} /><meshStandardMaterial color={reset && index === 2 ? '#51e19a' : '#c89a38'} emissive={reset && index === 2 ? '#1d6042' : '#000000'} emissiveIntensity={reset && index === 2 ? 0.55 : 0} metalness={0.55} roughness={0.34} transparent={focused} opacity={focused ? 0.78 : 1} /></mesh>)}
    {[0.55, 1.65].map((y) => <group key={y}>
      <mesh position={[0, y, -1.05]}><boxGeometry args={[2.7, 0.035, 0.035]} /><meshStandardMaterial color="#926e28" metalness={0.4} transparent={focused} opacity={focused ? 0.56 : 1} /></mesh>
      <mesh position={[0, y, 1.05]}><boxGeometry args={[2.7, 0.035, 0.035]} /><meshStandardMaterial color="#926e28" metalness={0.4} transparent={focused} opacity={focused ? 0.56 : 1} /></mesh>
    </group>)}
    <group position={[0, 1.15, -1.045]}><CageMeshPanel width={2.62} height={2.08} columns={13} rows={9} opacity={panelOpacity} /></group>
    {[-1.345, 1.345].map((x) => <group key={x} position={[x, 1.15, 0]} rotation={[0, Math.PI / 2, 0]}><CageMeshPanel width={2.04} height={2.08} columns={10} rows={9} opacity={panelOpacity} /></group>)}
    <group position={[-0.67, 1.15, 1.052]}><CageMeshPanel width={1.3} height={2.08} columns={7} rows={9} opacity={panelOpacity + 0.04} /></group>
    <group ref={gate} position={[1.06, 0, 0]}>
      <group position={[0.67, 1.15, 1.052]}><CageMeshPanel width={1.3} height={2.08} columns={7} rows={9} opacity={panelOpacity + 0.04} /></group>
      <mesh position={[0.02, 1.15, 1.065]} castShadow><boxGeometry args={[0.045, 2.08, 0.045]} /><meshStandardMaterial color="#a77b28" metalness={0.58} roughness={0.34} /></mesh>
      <group position={[0.11, 1.28, 1.11]}>
        <RoundedBox args={[0.22, 0.34, 0.1]} radius={0.025} castShadow><meshStandardMaterial color="#26353a" metalness={0.7} roughness={0.3} /></RoundedBox>
        <mesh position={[0, 0.07, 0.056]}><circleGeometry args={[0.035, 16]} /><meshStandardMaterial color={gateClosed ? '#51e19a' : '#f4b95f'} emissive={gateClosed ? '#1e6b48' : '#6b451c'} emissiveIntensity={0.9} /></mesh>
        <mesh position={[0, -0.08, 0.056]}><boxGeometry args={[0.1, 0.035, 0.015]} /><meshBasicMaterial color="#72848a" /></mesh>
      </group>
    </group>
    {[-0.06, 0.06].map((x) => <mesh key={x} position={[x, 1.14, 1.075]}><boxGeometry args={[0.018, 1.84, 0.025]} /><meshBasicMaterial color={reset ? '#51e19a' : '#4dd5ed'} transparent opacity={reset ? 0.42 : 0.72} /></mesh>)}
    <mesh position={[0, 0.095, 1.05]} castShadow><boxGeometry args={[2.64, 0.09, 0.12]} /><meshStandardMaterial color="#4b4c3f" metalness={0.56} roughness={0.44} /></mesh>
  </group>;
}

function CageMeshPanel({ width, height, columns, rows, opacity }: { width: number; height: number; columns: number; rows: number; opacity: number }) {
  const geometry = useMemo(() => {
    const vertices: number[] = [];
    for (let column = 0; column <= columns; column += 1) {
      const x = -width / 2 + width * column / columns;
      vertices.push(x, -height / 2, 0, x, height / 2, 0);
    }
    for (let row = 0; row <= rows; row += 1) {
      const y = -height / 2 + height * row / rows;
      vertices.push(-width / 2, y, 0, width / 2, y, 0);
    }
    const meshGeometry = new THREE.BufferGeometry();
    meshGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return meshGeometry;
  }, [columns, height, rows, width]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <lineSegments geometry={geometry}><lineBasicMaterial color="#b58a32" transparent opacity={opacity} /></lineSegments>;
}

function RobotArm({ gripperProven }: { gripperProven: boolean }) {
  return <group position={[-0.15, 0.12, 0.08]} rotation={[0, -0.42, 0]} scale={0.46}>
    <mesh castShadow><cylinderGeometry args={[0.46, 0.55, 0.25, 32]} /><meshPhysicalMaterial color="#53626c" metalness={0.82} roughness={0.25} clearcoat={0.32} /></mesh>
    <mesh position={[0, 0.16, 0]} castShadow><cylinderGeometry args={[0.35, 0.4, 0.14, 32]} /><meshStandardMaterial color="#202e37" metalness={0.78} roughness={0.28} /></mesh>
    <mesh position={[0, 0.245, 0]}><torusGeometry args={[0.29, 0.025, 10, 32]} /><meshStandardMaterial color="#4c8795" metalness={0.68} roughness={0.26} /></mesh>
    <group position={[0, 0.23, 0]} rotation={[0, 0, -0.62]}>
      <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.31, 0.31, 0.42, 28]} /><meshPhysicalMaterial color="#c4cbcc" metalness={0.63} roughness={0.31} clearcoat={0.28} /></mesh>
      <mesh position={[0, 0.12, 0.23]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.19, 0.19, 0.045, 24]} /><meshStandardMaterial color="#344650" metalness={0.8} roughness={0.24} /></mesh>
      <mesh position={[0, 0.12, 0.258]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.055, 0.055, 0.02, 18]} /><meshStandardMaterial color="#8b9ba1" metalness={0.9} roughness={0.16} /></mesh>
      <RoundedBox args={[0.38, 1.28, 0.38]} radius={0.18} smoothness={4} position={[0, 0.75, 0]} castShadow>
        <meshPhysicalMaterial color="#b8c1c3" metalness={0.66} roughness={0.28} clearcoat={0.32} />
      </RoundedBox>
      <Line points={[[0.23, 0.25, -0.16], [0.23, 1.18, -0.16], [0.12, 1.32, -0.16]]} color="#273740" lineWidth={1.6} />
      <group position={[0, 1.39, 0]} rotation={[0, 0, -0.94]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.28, 0.28, 0.38, 28]} /><meshStandardMaterial color="#40525e" metalness={0.8} roughness={0.24} /></mesh>
        <mesh position={[0, 0, 0.21]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.2, 0.027, 10, 28]} /><meshStandardMaterial color="#6e828b" metalness={0.84} roughness={0.2} /></mesh>
        <RoundedBox args={[0.3, 1.05, 0.3]} radius={0.14} smoothness={4} position={[0, 0.61, 0]} castShadow>
          <meshPhysicalMaterial color="#c6cdce" metalness={0.68} roughness={0.26} clearcoat={0.32} />
        </RoundedBox>
        <Line points={[[0.18, 0.16, -0.12], [0.18, 1.0, -0.12], [0.08, 1.1, -0.12]]} color="#253740" lineWidth={1.45} />
        <group position={[0, 1.18, 0]} rotation={[0, 0.18, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.2, 0.22, 0.28, 24]} /><meshStandardMaterial color="#435a65" metalness={0.78} roughness={0.24} /></mesh>
          <mesh position={[0, 0.15, 0]} castShadow><cylinderGeometry args={[0.13, 0.16, 0.22, 22]} /><meshPhysicalMaterial color="#aeb9bc" metalness={0.72} roughness={0.24} clearcoat={0.24} /></mesh>
          <mesh position={[0, 0.27, 0]}><cylinderGeometry args={[0.16, 0.16, 0.045, 22]} /><meshStandardMaterial color="#263841" metalness={0.83} roughness={0.2} /></mesh>
          <mesh position={[0, 0.3, 0]} castShadow><boxGeometry args={[0.34, 0.16, 0.25]} /><meshStandardMaterial color="#26343d" metalness={0.76} roughness={0.3} /></mesh>
          {[-0.12, 0.12].map((x) => <group key={x} position={[x + (gripperProven ? -Math.sign(x) * 0.025 : 0), 0.52, 0]}>
            <mesh castShadow><boxGeometry args={[0.065, 0.38, 0.1]} /><meshStandardMaterial color="#151f26" metalness={0.72} roughness={0.32} /></mesh>
            <mesh position={[-Math.sign(x) * 0.025, 0.17, 0]}><boxGeometry args={[0.11, 0.05, 0.12]} /><meshStandardMaterial color="#65747b" metalness={0.82} roughness={0.22} /></mesh>
          </group>)}
          <mesh position={[0, 0.3, 0.13]}><circleGeometry args={[0.035, 18]} /><meshStandardMaterial color={gripperProven ? '#51e19a' : '#4f6670'} emissive={gripperProven ? '#24744f' : '#132029'} emissiveIntensity={gripperProven ? 1.1 : 0.12} /></mesh>
        </group>
      </group>
    </group>
  </group>;
}

function RobotProcessFixture({ gripperProven }: { gripperProven: boolean }) {
  const slots: [number, number, number][] = [[-0.34, 0, -0.21], [0, 0, -0.21], [0.34, 0, -0.21], [-0.34, 0, 0.21], [0, 0, 0.21], [0.34, 0, 0.21]];
  return <group>
    <group position={[-0.86, 0.3, 0.58]}>
      <RoundedBox args={[1.18, 0.1, 0.82]} radius={0.04} castShadow><meshStandardMaterial color="#4c5960" metalness={0.72} roughness={0.3} /></RoundedBox>
      {slots.map(([x, , z]) => <group key={`${x}-${z}`} position={[x, 0.12, z]}>
        <mesh position={[0, -0.03, 0]}><cylinderGeometry args={[0.118, 0.118, 0.025, 24]} /><meshStandardMaterial color="#27343a" metalness={0.74} roughness={0.28} /></mesh>
        <mesh castShadow><cylinderGeometry args={[0.095, 0.08, 0.16, 28, 1, true]} /><meshPhysicalMaterial color="#d7d0bc" roughness={0.48} clearcoat={0.08} side={THREE.DoubleSide} /></mesh>
        <mesh position={[0, -0.078, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.078, 24]} /><meshStandardMaterial color="#c8c0ab" roughness={0.5} /></mesh>
        <mesh position={[0, 0.083, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.088, 0.006, 8, 28]} /><meshStandardMaterial color="#eee8d8" roughness={0.36} /></mesh>
        <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.074, 24]} /><meshStandardMaterial color="#3a3832" roughness={0.72} /></mesh>
      </group>)}
    </group>
    <group position={[0.84, 0.31, 0.62]}>
      <RoundedBox args={[0.68, 0.12, 0.64]} radius={0.04} castShadow><meshStandardMaterial color="#34434b" metalness={0.72} roughness={0.32} /></RoundedBox>
      <mesh position={[0, 0.095, 0]}><cylinderGeometry args={[0.19, 0.19, 0.045, 24]} /><meshStandardMaterial color="#4f626a" roughness={0.46} /></mesh>
      <mesh position={[0, 0.13, 0]}><circleGeometry args={[0.11, 22]} /><meshBasicMaterial color={gripperProven ? '#77d9aa' : '#788a8f'} /></mesh>
      <mesh position={[0, 0.08, 0.33]}><planeGeometry args={[0.44, 0.08]} /><meshBasicMaterial color="#617985" /></mesh>
    </group>
  </group>;
}

function Furnace({ active, focused, controls }: { active: boolean; focused: boolean; controls: string[] }) {
  const relayRead = controls.includes('Read overtemperature relay');
  const occupancyConfirmed = controls.includes('Confirm chamber occupancy');
  const chamberIntensity = active ? 2.7 : 0.65;
  return <group position={[0, 0.18, 0]} scale={0.78}>
    <RoundedBox args={[2.05, 2.22, 1.5]} radius={0.09} smoothness={4} position={[0, 1.15, 0]} castShadow>
      <meshPhysicalMaterial color="#59636a" metalness={0.05} roughness={0.43} clearcoat={0.12} />
    </RoundedBox>
    <RoundedBox args={[1.52, 1.18, 0.12]} radius={0.05} position={[0, 1.37, 0.79]}>
      <meshStandardMaterial color="#15191c" metalness={0.6} roughness={0.38} />
    </RoundedBox>
    <RoundedBox args={[1.34, 0.93, 0.075]} radius={0.035} position={[0, 1.38, 0.87]} castShadow><meshPhysicalMaterial color="#252d30" metalness={0.84} roughness={0.27} clearcoat={0.22} /></RoundedBox>
    <mesh position={[0, 1.43, 0.912]}><planeGeometry args={[0.66, 0.3]} /><meshStandardMaterial color={focused ? '#28120b' : '#161c1f'} emissive={focused ? '#e3672e' : '#000000'} emissiveIntensity={focused ? chamberIntensity * 0.42 : 0} roughness={0.78} /></mesh>
    <mesh position={[0, 1.43, 0.918]}><planeGeometry args={[0.7, 0.34]} /><meshStandardMaterial color="#222a2c" transparent opacity={0.22} metalness={0.34} roughness={0.18} /></mesh>
    <mesh position={[0, 1.87, 0.914]}><planeGeometry args={[0.76, 0.055]} /><meshBasicMaterial color="#ff8b3d" /></mesh>
    {focused && <pointLight position={[0, 1.43, 1.02]} intensity={active ? 2.2 : 0.55} color="#ff8b3d" distance={1.45} decay={2} />}
    {[1.08, 1.68].map((hingeY) => <mesh key={hingeY} position={[-0.7, hingeY, 0.91]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.035, 0.035, 0.16, 14]} /><meshStandardMaterial color="#a7b0b4" metalness={0.9} roughness={0.14} /></mesh>)}
    <mesh position={[0.59, 1.38, 0.925]} castShadow><boxGeometry args={[0.065, 0.58, 0.075]} /><meshStandardMaterial color="#9aa3a8" metalness={0.9} roughness={0.16} /></mesh>
    <mesh position={[0.515, 1.38, 0.965]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.035, 0.035, 0.18, 14]} /><meshStandardMaterial color="#b2b9bc" metalness={0.92} roughness={0.13} /></mesh>
    <Line points={[[-0.77, 0.78, 0.868], [-0.77, 1.96, 0.868], [0.77, 1.96, 0.868], [0.77, 0.78, 0.868]]} color="#77848a" lineWidth={0.65} transparent opacity={0.35} />
    <RoundedBox args={[0.9, 0.32, 0.09]} radius={0.035} position={[-0.34, 0.55, 0.805]}>
      <meshBasicMaterial color="#08161c" />
    </RoundedBox>
    <mesh position={[-0.42, 0.56, 0.855]}><planeGeometry args={[0.42, 0.035]} /><meshBasicMaterial color={relayRead ? '#51e19a' : active ? '#f4b95f' : '#6a8290'} /></mesh>
    <mesh position={[-0.42, 0.62, 0.856]}><planeGeometry args={[0.18, 0.018]} /><meshBasicMaterial color="#364c56" /></mesh>
    <mesh position={[0.71, 0.83, 0.87]}><circleGeometry args={[0.045, 18]} /><meshStandardMaterial color={occupancyConfirmed ? '#51e19a' : '#6f7e82'} emissive={occupancyConfirmed ? '#238253' : '#192428'} emissiveIntensity={occupancyConfirmed ? 1 : 0.2} /></mesh>
    <group position={[0.62, 2.34, -0.1]}>
      <mesh castShadow><cylinderGeometry args={[0.18, 0.23, 0.54, 24]} /><meshStandardMaterial color="#68747a" metalness={0.88} roughness={0.2} /></mesh>
      <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.25, 0.18, 0.08, 24]} /><meshStandardMaterial color="#47545b" metalness={0.82} roughness={0.25} /></mesh>
    </group>
    <mesh position={[0.62, 2.79, -0.1]} castShadow><cylinderGeometry args={[0.065, 0.065, 0.26, 20]} /><meshStandardMaterial color="#68767b" metalness={0.72} roughness={0.28} /></mesh>
    <mesh position={[0.62, 2.92, -0.14]} castShadow><sphereGeometry args={[0.075, 20, 14]} /><meshStandardMaterial color="#68767b" metalness={0.72} roughness={0.28} /></mesh>
    <mesh position={[0.62, 2.92, -0.41]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.065, 0.065, 0.54, 20]} /><meshStandardMaterial color="#68767b" metalness={0.72} roughness={0.28} /></mesh>
    <mesh position={[0.62, 2.92, -0.69]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.075, 0.018, 10, 24]} /><meshStandardMaterial color="#89969a" metalness={0.78} roughness={0.24} /></mesh>
    <group position={[-0.86, 0.62, -0.62]}>
      <RoundedBox args={[0.38, 0.64, 0.18]} radius={0.035} castShadow><meshStandardMaterial color="#34454b" metalness={0.12} roughness={0.44} /></RoundedBox>
      <mesh position={[0, 0.16, 0.095]}><planeGeometry args={[0.22, 0.09]} /><meshBasicMaterial color="#09171c" /></mesh>
      <mesh position={[0, 0.17, 0.1]}><planeGeometry args={[0.14, 0.014]} /><meshBasicMaterial color={active ? '#f4b95f' : '#607984'} /></mesh>
      <mesh position={[0, -0.13, 0.1]}><circleGeometry args={[0.04, 18]} /><meshStandardMaterial color="#d44e43" emissive="#621914" emissiveIntensity={0.45} /></mesh>
      <Line points={[[0.18, -0.16, -0.04], [0.42, -0.3, -0.02], [0.55, -0.32, 0.2]]} color="#26343a" lineWidth={1.45} />
    </group>
  </group>;
}

function Xrd({ active, focused, controls, phase }: { active: boolean; focused: boolean; controls: string[]; phase: number }) {
  const stage = useRef<THREE.Group>(null);
  const enclosureDoor = useRef<THREE.Group>(null);
  const homed = controls.includes('Home specimen stage') || phase >= 2;
  const enclosureClosed = controls.includes('Close radiation enclosure') || phase >= 2 || !focused;
  const shutterProven = controls.includes('Prove shutter feedback');
  const referenceRead = controls.includes('Read silicon QC position');
  useFrame((_, delta) => {
    if (stage.current) stage.current.rotation.y = THREE.MathUtils.damp(stage.current.rotation.y, homed ? 0 : 0.55, 3.2, delta);
    if (enclosureDoor.current) enclosureDoor.current.position.x = THREE.MathUtils.damp(enclosureDoor.current.position.x, enclosureClosed ? -0.12 : 1.96, 3.4, delta);
  });
  return <group position={[0, 0.1, 0]} scale={[0.64, 0.82, 0.75]}>
    <RoundedBox args={[2.5, 2.25, 1.55]} radius={0.18} smoothness={5} position={[0, 1.15, 0]} castShadow>
      <meshPhysicalMaterial color="#d3d8da" metalness={0.03} roughness={0.36} clearcoat={0.12} />
    </RoundedBox>
    <RoundedBox args={[1.92, 1.43, 0.08]} radius={0.12} position={[-0.12, 1.37, 0.795]}>
      <meshPhysicalMaterial color="#10212b" transparent={focused} opacity={focused ? 0.7 : 1} roughness={focused ? 0.08 : 0.38} metalness={0.05} transmission={focused ? 0.12 : 0} />
    </RoundedBox>
    <group position={[-0.12, 1.25, 0.86]}>
      <mesh><torusGeometry args={[0.55, 0.07, 16, 64, Math.PI * 1.55]} /><meshStandardMaterial color="#8499a8" metalness={0.88} roughness={0.18} emissive={active ? '#174d59' : '#000000'} /></mesh>
      <group ref={stage} rotation={[0, 0.55, 0]}>
        <mesh position={[0, -0.18, 0]}><cylinderGeometry args={[0.22, 0.28, 0.12, 28]} /><meshStandardMaterial color="#d6dee0" metalness={0.84} roughness={0.15} /></mesh>
        <mesh position={[0, -0.105, 0]}><cylinderGeometry args={[0.105, 0.105, 0.035, 24]} /><meshStandardMaterial color="#222e35" metalness={0.82} roughness={0.18} /></mesh>
        <mesh position={[0, -0.083, 0]}><cylinderGeometry args={[0.075, 0.075, 0.014, 24]} /><meshStandardMaterial color="#c7a462" roughness={0.58} /></mesh>
        <mesh position={[0.11, -0.066, 0]}><boxGeometry args={[0.055, 0.02, 0.018]} /><meshStandardMaterial color="#e7d8a5" emissive={homed ? '#51e19a' : '#000000'} emissiveIntensity={homed ? 0.6 : 0} /></mesh>
      </group>
      <mesh position={[-0.46, 0.28, 0]} rotation={[0, 0, -0.72]} castShadow><boxGeometry args={[0.2, 0.42, 0.18]} /><meshStandardMaterial color="#bec8cc" metalness={0.76} roughness={0.22} /></mesh>
      <mesh position={[-0.35, 0.15, 0.01]} rotation={[0, 0, -0.72]} castShadow><cylinderGeometry args={[0.045, 0.065, 0.2, 18]} /><meshStandardMaterial color="#4f626b" metalness={0.8} roughness={0.2} /></mesh>
      <mesh position={[-0.5, 0.34, 0.095]} rotation={[0, 0, -0.72]}><planeGeometry args={[0.11, 0.035]} /><meshBasicMaterial color={shutterProven ? '#51e19a' : '#f4b95f'} /></mesh>
      <mesh position={[0.46, 0.29, 0]} rotation={[0, 0, 0.7]} castShadow><boxGeometry args={[0.22, 0.48, 0.2]} /><meshStandardMaterial color="#617380" metalness={0.8} roughness={0.2} /></mesh>
      <mesh position={[0.34, 0.15, 0.01]} rotation={[0, 0, 0.7]} castShadow><cylinderGeometry args={[0.05, 0.075, 0.21, 18]} /><meshStandardMaterial color="#364b57" metalness={0.82} roughness={0.2} /></mesh>
      {[-0.47, 0.47].map((x) => <group key={x} position={[x, 0.08, 0.005]}>
        <mesh><cylinderGeometry args={[0.13, 0.13, 0.08, 24]} /><meshStandardMaterial color="#455b68" metalness={0.86} roughness={0.18} /></mesh>
        <mesh position={[0, 0.047, 0]}><torusGeometry args={[0.085, 0.014, 8, 24]} /><meshStandardMaterial color="#aab7bc" metalness={0.9} roughness={0.14} /></mesh>
      </group>)}
      {active && <Line points={[[-0.48, 0.37, 0.03], [0, -0.1, 0.03], [0.47, 0.4, 0.03]]} color="#f4b95f" lineWidth={1.4} transparent opacity={0.92} />}
    </group>
    <Line points={[[ -1.06, 0.36, 0.805], [1.06, 0.36, 0.805]]} color="#829099" lineWidth={0.55} transparent opacity={0.6} />
      <Line points={[[0.77, 0.43, 0.82], [0.77, 2.01, 0.82]]} color="#7b8a92" lineWidth={0.55} transparent opacity={0.5} />
    {[0.74, 1.3, 1.86].map((y) => <mesh key={y} position={[0.79, y, 0.838]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.026, 0.026, 0.13, 12]} /><meshStandardMaterial color="#46545c" metalness={0.82} roughness={0.2} /></mesh>)}
    <mesh position={[-0.96, 0.48, 0.837]}><planeGeometry args={[0.25, 0.17]} /><meshStandardMaterial color="#d7ad48" roughness={0.56} /></mesh>
    <mesh position={[-0.96, 0.48, 0.842]} rotation={[0, 0, 0.76]}><boxGeometry args={[0.16, 0.018, 0.006]} /><meshBasicMaterial color="#20262a" /></mesh>
    <group position={[-0.62, 0.26, 0.838]}>{Array.from({ length: 8 }, (_, index) => <mesh key={index} position={[(index % 4) * 0.13, Math.floor(index / 4) * 0.09, 0]}><planeGeometry args={[0.085, 0.026]} /><meshBasicMaterial color="#26333b" /></mesh>)}</group>
    {[-0.9, 0.9].map((x) => <mesh key={x} position={[x, 0.04, 0.55]} castShadow><cylinderGeometry args={[0.075, 0.09, 0.12, 16]} /><meshStandardMaterial color="#313e45" metalness={0.74} roughness={0.3} /></mesh>)}
    <RoundedBox args={[0.42, 0.62, 0.1]} radius={0.04} position={[0.9, 0.62, 0.8]}><meshBasicMaterial color="#0a161c" /></RoundedBox>
    <mesh position={[0.9, 0.69, 0.856]}><planeGeometry args={[0.26, 0.026]} /><meshBasicMaterial color={referenceRead ? '#51e19a' : active ? '#4dd5ed' : '#5c7583'} /></mesh>
    {[0.81, 0.98].map((x, index) => { const proven = index === 0 ? shutterProven : referenceRead; return <mesh key={x} position={[x, 0.48, 0.858]}><circleGeometry args={[0.035, 16]} /><meshStandardMaterial color={proven ? '#51e19a' : index === 0 ? '#617883' : '#f4b95f'} emissive={proven ? '#238253' : index === 0 ? '#172a31' : '#6d471c'} emissiveIntensity={proven ? 1.1 : 0.45} /></mesh>; })}
    <group ref={enclosureDoor} position={[1.96, 1.39, 0.925]}>
      <mesh position={[0, 0.67, 0]} castShadow><boxGeometry args={[2.02, 0.085, 0.09]} /><meshPhysicalMaterial color="#6d7d84" metalness={0.88} roughness={0.2} clearcoat={0.28} /></mesh>
      <mesh position={[0, -0.67, 0]} castShadow><boxGeometry args={[2.02, 0.085, 0.09]} /><meshPhysicalMaterial color="#6d7d84" metalness={0.88} roughness={0.2} clearcoat={0.28} /></mesh>
      {[-0.97, 0.97].map((x) => <mesh key={x} position={[x, 0, 0]} castShadow><boxGeometry args={[0.085, 1.42, 0.09]} /><meshPhysicalMaterial color="#687980" metalness={0.88} roughness={0.2} clearcoat={0.28} /></mesh>)}
      <mesh position={[0, 0, 0.01]}><planeGeometry args={[1.84, 1.25]} /><meshPhysicalMaterial color={focused ? '#7699a0' : '#26343a'} transparent={focused} opacity={focused ? enclosureClosed ? 0.28 : 0.18 : 1} transmission={focused ? 0.18 : 0} roughness={focused ? 0.08 : 0.42} metalness={0.06} /></mesh>
      <mesh position={[-0.78, 0.47, 0.07]}><planeGeometry args={[0.23, 0.2]} /><meshBasicMaterial color="#d9b94f" /></mesh>
      <mesh position={[-0.78, 0.47, 0.076]} rotation={[0, 0, 0.78]}><boxGeometry args={[0.14, 0.02, 0.008]} /><meshBasicMaterial color="#252a28" /></mesh>
      <group position={[0.82, -0.48, 0.08]}>
        <mesh><boxGeometry args={[0.12, 0.25, 0.08]} /><meshStandardMaterial color="#35464d" metalness={0.72} roughness={0.28} /></mesh>
        <mesh position={[0, 0.07, 0.045]}><circleGeometry args={[0.026, 14]} /><meshStandardMaterial color={enclosureClosed ? '#51e19a' : '#f4b95f'} emissive={enclosureClosed ? '#1d6543' : '#6c451b'} emissiveIntensity={0.8} /></mesh>
      </group>
    </group>
    <mesh position={[-0.12, 2.13, 0.9]} castShadow><boxGeometry args={[2.12, 0.07, 0.12]} /><meshStandardMaterial color="#52636a" metalness={0.86} roughness={0.22} /></mesh>
    <mesh position={[-0.12, 0.64, 0.9]} castShadow><boxGeometry args={[2.12, 0.07, 0.12]} /><meshStandardMaterial color="#52636a" metalness={0.86} roughness={0.22} /></mesh>
    <group position={[-1.22, 0.47, -0.58]}>
      <RoundedBox args={[0.72, 0.86, 0.62]} radius={0.055} castShadow><meshPhysicalMaterial color="#9ca8aa" metalness={0.05} roughness={0.42} clearcoat={0.08} /></RoundedBox>
      {[-0.2, -0.1, 0, 0.1, 0.2].map((y) => <mesh key={y} position={[0, y, 0.32]}><planeGeometry args={[0.42, 0.025]} /><meshBasicMaterial color="#3f5157" /></mesh>)}
      <mesh position={[0, 0.3, 0.325]}><planeGeometry args={[0.34, 0.08]} /><meshBasicMaterial color="#102129" /></mesh>
      <mesh position={[-0.1, 0.3, 0.33]}><planeGeometry args={[0.1, 0.014]} /><meshBasicMaterial color="#51e19a" /></mesh>
      <Line points={[[0.28, 0.2, -0.04], [0.58, 0.48, -0.02], [0.72, 0.76, 0.18]]} color="#4d7482" lineWidth={1.5} />
      <Line points={[[0.3, 0.06, -0.08], [0.66, 0.26, -0.08], [0.76, 0.58, 0.12]]} color="#53636b" lineWidth={1.35} />
    </group>
  </group>;
}

function SemEds({ active, controls }: { active: boolean; controls: string[] }) {
  const beamBlanked = controls.includes('Verify beam blanked');
  const vacuumEstablished = controls.includes('Establish chamber vacuum');
  const clearanceVerified = controls.includes('Verify stage clearance');
  const detectorsArmed = controls.includes('Arm BSE / EDS detectors');
  return <group position={[0, 0.18, 0]}>
    <RoundedBox args={[1.64, 0.46, 1.18]} radius={0.1} smoothness={4} position={[-0.22, 0.15, 0.04]} castShadow>
      <meshPhysicalMaterial color="#66757c" metalness={0.1} roughness={0.4} clearcoat={0.1} />
    </RoundedBox>
    <RoundedBox args={[1.26, 0.19, 0.055]} radius={0.025} position={[-0.22, 0.16, 0.635]}><meshStandardMaterial color="#26363e" metalness={0.52} roughness={0.34} /></RoundedBox>
    {[-0.66, 0.22].flatMap((x) => [-0.38, 0.38].map((z) => <group key={`${x}-${z}`} position={[x, -0.055, z]}>
      <mesh castShadow><cylinderGeometry args={[0.09, 0.11, 0.09, 18]} /><meshStandardMaterial color="#26343a" metalness={0.72} roughness={0.3} /></mesh>
      <mesh position={[0, 0.047, 0]}><cylinderGeometry args={[0.065, 0.075, 0.018, 18]} /><meshStandardMaterial color="#8b999d" metalness={0.84} roughness={0.18} /></mesh>
    </group>))}
    <RoundedBox args={[1.58, 0.78, 1.34]} radius={0.22} smoothness={5} position={[-0.25, 0.62, 0.06]} castShadow>
      <meshPhysicalMaterial color="#8c999f" metalness={0.08} roughness={0.38} clearcoat={0.12} />
    </RoundedBox>
    <mesh position={[-0.25, 1.12, 0.04]} castShadow><cylinderGeometry args={[0.38, 0.52, 0.45, 32]} /><meshStandardMaterial color="#657783" metalness={0.86} roughness={0.2} /></mesh>
    <mesh position={[-0.25, 1.72, 0.04]} castShadow><cylinderGeometry args={[0.17, 0.3, 0.83, 32]} /><meshPhysicalMaterial color="#d0d5d4" metalness={0.06} roughness={0.36} clearcoat={0.12} /></mesh>
    <mesh position={[-0.25, 2.24, 0.04]} castShadow><cylinderGeometry args={[0.24, 0.17, 0.28, 32]} /><meshStandardMaterial color="#6d7b82" metalness={0.85} roughness={0.2} /></mesh>
    {[1.36, 1.6, 1.94, 2.18].map((y, index) => <mesh key={y} position={[-0.25, y, 0.04]} castShadow><cylinderGeometry args={[0.22 - index * 0.018, 0.22 - index * 0.018, 0.055, 28]} /><meshStandardMaterial color={index === 3 && beamBlanked ? '#548675' : index % 2 ? '#89969b' : '#3f505a'} emissive={index === 3 && beamBlanked ? '#245e45' : '#000000'} emissiveIntensity={index === 3 && beamBlanked ? 0.75 : 0} metalness={0.86} roughness={0.18} /></mesh>)}
    <group position={[-0.25, 1.28, 0.04]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.17, 0.024, 10, 32]} /><meshStandardMaterial color={detectorsArmed ? '#77a896' : '#6f7e82'} emissive={detectorsArmed ? '#1e6047' : '#000000'} emissiveIntensity={detectorsArmed ? 0.55 : 0} metalness={0.76} roughness={0.22} /></mesh>
      <mesh position={[0, -0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.07, 0.145, 32]} /><meshStandardMaterial color="#26373d" metalness={0.54} roughness={0.28} side={THREE.DoubleSide} /></mesh>
    </group>
    <Line points={[[-0.25, 2.04, 0.76], [-0.25, 0.65, 0.76]]} color={vacuumEstablished ? '#51e19a' : '#4dd5ed'} lineWidth={vacuumEstablished || active ? 1.3 : 0.5} transparent opacity={vacuumEstablished || active ? 0.9 : 0.25} />
    <mesh position={[-0.25, 0.62, 0.76]}><circleGeometry args={[0.22, 32]} /><meshPhysicalMaterial color="#14242d" metalness={0.55} roughness={0.16} /></mesh>
    <mesh position={[-0.25, 0.62, 0.775]}><torusGeometry args={[0.29, 0.045, 12, 40]} /><meshStandardMaterial color={vacuumEstablished ? '#51e19a' : '#71828b'} emissive={vacuumEstablished ? '#1d6645' : '#000000'} emissiveIntensity={vacuumEstablished ? 0.7 : 0} metalness={0.9} roughness={0.15} /></mesh>
    <mesh position={[-0.25, clearanceVerified ? 0.68 : 0.57, 0.788]}><circleGeometry args={[0.09, 28]} /><meshStandardMaterial color={clearanceVerified ? '#b8c7c7' : '#6b777b'} emissive={clearanceVerified ? '#245b4a' : '#000000'} emissiveIntensity={clearanceVerified ? 0.5 : 0} metalness={0.78} roughness={0.2} /></mesh>
    {Array.from({ length: 10 }, (_, index) => { const angle = index * Math.PI / 5; return <mesh key={index} position={[-0.25 + Math.cos(angle) * 0.29, 0.62 + Math.sin(angle) * 0.29, 0.824]}><cylinderGeometry args={[0.018, 0.018, 0.03, 10]} /><meshStandardMaterial color="#c5ccce" metalness={0.92} roughness={0.14} /></mesh>; })}
    <group position={[-0.82, 0.58, 0.62]} rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow><cylinderGeometry args={[0.1, 0.1, 0.34, 22]} /><meshStandardMaterial color="#52636d" metalness={0.82} roughness={0.24} /></mesh>
      <mesh position={[0, 0.21, 0]}><cylinderGeometry args={[0.15, 0.15, 0.08, 24]} /><meshStandardMaterial color="#87949a" metalness={0.9} roughness={0.16} /></mesh>
      <mesh position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.11, 0.022, 10, 24]} /><meshStandardMaterial color="#aab3b6" metalness={0.9} roughness={0.14} /></mesh>
    </group>
    <group position={[0.36, 1.18, 0.48]} rotation={[0, 0, 0.96]}>
      <mesh castShadow><cylinderGeometry args={[0.1, 0.14, 0.5, 24]} /><meshPhysicalMaterial color={detectorsArmed ? '#8aa99e' : '#768894'} emissive={detectorsArmed ? '#1d5c45' : '#000000'} emissiveIntensity={detectorsArmed ? 0.55 : 0} metalness={0.86} roughness={0.2} clearcoat={0.35} /></mesh>
      <mesh position={[0, -0.3, 0]}><cylinderGeometry args={[0.06, 0.09, 0.14, 20]} /><meshStandardMaterial color="#303f49" metalness={0.8} roughness={0.22} /></mesh>
      <mesh position={[0, 0.29, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.12, 0.025, 10, 24]} /><meshStandardMaterial color="#a2adb1" metalness={0.9} roughness={0.16} /></mesh>
    </group>
    <group position={[-0.76, 1.28, 0.28]} rotation={[0, 0, -0.88]}>
      <mesh castShadow><cylinderGeometry args={[0.075, 0.11, 0.42, 22]} /><meshPhysicalMaterial color="#596d78" metalness={0.86} roughness={0.2} clearcoat={0.24} /></mesh>
      <mesh position={[0, -0.24, 0]}><cylinderGeometry args={[0.045, 0.07, 0.1, 18]} /><meshStandardMaterial color="#1f3038" metalness={0.76} roughness={0.25} /></mesh>
    </group>
    <Line points={[[0.57, 1.4, 0.44], [1.04, 1.72, 0.04], [1.18, 0.92, -0.42]]} color="#4a5f6e" lineWidth={1.1} />
    <RoundedBox args={[0.72, 0.62, 0.62]} radius={0.07} position={[0.9, 0.5, -0.43]} castShadow><meshStandardMaterial color="#374b58" metalness={0.68} roughness={0.33} /></RoundedBox>
    <mesh position={[0.9, 0.66, -0.115]}><planeGeometry args={[0.44, 0.18]} /><meshBasicMaterial color="#09161c" /></mesh>
    <mesh position={[0.9, 0.67, -0.119]}><planeGeometry args={[0.28, 0.024]} /><meshBasicMaterial color={detectorsArmed ? '#51e19a' : active ? '#4dd5ed' : '#6a7f8d'} /></mesh>
    <group position={[-0.96, 0.3, -0.48]}>
      <RoundedBox args={[0.48, 0.4, 0.54]} radius={0.055} castShadow><meshStandardMaterial color="#263640" metalness={0.68} roughness={0.34} /></RoundedBox>
      {[-0.13, -0.04, 0.05, 0.14].map((y) => <mesh key={y} position={[0, y, 0.277]}><planeGeometry args={[0.28, 0.025]} /><meshBasicMaterial color="#526672" /></mesh>)}
      <Line points={[[0.2, 0.13, 0.03], [0.34, 0.45, 0.08], [0.46, 0.74, 0.2]]} color="#354c58" lineWidth={2.1} />
    </group>
    <group position={[0.95, 0.7, 0.2]}>
      <mesh position={[0, 0.6, 0]} castShadow><boxGeometry args={[1.0, 0.7, 0.08]} /><meshStandardMaterial color="#1f303e" metalness={0.55} roughness={0.3} /></mesh>
      <mesh position={[0, 0.6, 0.046]}><planeGeometry args={[0.86, 0.55]} /><meshBasicMaterial color="#071317" /></mesh>
      {Array.from({ length: 14 }, (_, i) => <mesh key={i} position={[-0.34 + (i % 5) * 0.17, 0.43 + Math.floor(i / 5) * 0.16, 0.052]}><circleGeometry args={[0.012 + (i % 3) * 0.006, 10]} /><meshBasicMaterial color={i % 4 === 0 ? '#f4b95f' : '#9ab0b8'} /></mesh>)}
      <mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.045, 0.06, 0.45, 16]} /><meshStandardMaterial color="#667987" metalness={0.72} /></mesh>
      <mesh position={[0, -0.1, 0]}><boxGeometry args={[0.74, 0.06, 0.42]} /><meshStandardMaterial color="#394b58" metalness={0.65} /></mesh>
    </group>
    <SemPreparationModule active={active} />
  </group>;
}

function SemPreparationModule({ active }: { active: boolean }) {
  return <group position={[1.15, 0.44, -0.62]}>
    <RoundedBox args={[0.72, 0.5, 0.6]} radius={0.075} castShadow><meshStandardMaterial color="#34474f" metalness={0.58} roughness={0.32} /></RoundedBox>
    <mesh position={[0, 0.34, 0]} castShadow><cylinderGeometry args={[0.24, 0.3, 0.23, 32]} /><meshPhysicalMaterial color="#8da6aa" transparent opacity={0.38} transmission={0.16} roughness={0.12} metalness={0.08} /></mesh>
    <mesh position={[0, 0.21, 0]}><cylinderGeometry args={[0.3, 0.3, 0.06, 32]} /><meshStandardMaterial color="#707f83" metalness={0.84} roughness={0.18} /></mesh>
    {[-0.12, 0, 0.12].map((x) => <mesh key={x} position={[x, 0.25, 0]}><cylinderGeometry args={[0.035, 0.04, 0.03, 16]} /><meshStandardMaterial color="#c7cfd0" metalness={0.82} roughness={0.18} /></mesh>)}
    <mesh position={[0, 0.02, 0.306]}><planeGeometry args={[0.48, 0.16]} /><meshBasicMaterial color="#07161a" /></mesh>
    <mesh position={[0, 0.04, 0.31]}><planeGeometry args={[0.28, 0.02]} /><meshBasicMaterial color={active ? '#51e19a' : '#4dd5ed'} /></mesh>
    <Line points={[[0.3, 0.12, -0.12], [0.48, 0.42, -0.16], [0.42, 0.66, -0.06]]} color="#435b62" lineWidth={1.1} />
  </group>;
}

function Bet({ active, focused, tone, controls }: { active: boolean; focused: boolean; tone: string; controls: string[] }) {
  const dewarLift = useRef<THREE.Group>(null);
  const portsIsolated = controls.includes('Isolate analysis ports');
  const leakCheckPassed = controls.includes('Run manifold leak check');
  const gasProven = controls.includes('Prove N₂ supply state');
  const dewarPositioned = controls.includes('Position 77 K Dewar');
  useFrame((_, delta) => {
    if (dewarLift.current) dewarLift.current.position.y = THREE.MathUtils.damp(dewarLift.current.position.y, dewarPositioned ? 0.92 : 0.43, 3.4, delta);
  });
  return <group position={[0, 0.18, 0]}>
    {[-0.54, 0.16].map((x, moduleIndex) => <group key={x} position={[x, 0, 0]}>
      <RoundedBox args={[0.62, 1.02, 0.72]} radius={0.06} position={[0, 0.66, 0]} castShadow>
        <meshPhysicalMaterial color={moduleIndex === 0 ? '#d0d4d3' : '#c5cbca'} metalness={0.03} roughness={0.38} clearcoat={0.1} />
      </RoundedBox>
      <RoundedBox args={[0.46, 0.2, 0.025]} radius={0.025} position={[0, 0.78, 0.374]}>
        <meshBasicMaterial color="#0b171c" />
      </RoundedBox>
      <mesh position={[-0.08, 0.81, 0.39]}><planeGeometry args={[0.2, 0.022]} /><meshBasicMaterial color={active ? '#b48cff' : '#64818d'} /></mesh>
      {[0.1, -0.02, -0.14].map((y, index) => <mesh key={y} position={[0.19, 0.78 + y, 0.39]}><circleGeometry args={[0.018, 14]} /><meshStandardMaterial color={index === 0 && leakCheckPassed ? '#51e19a' : '#66777c'} emissive={index === 0 && leakCheckPassed ? '#205e43' : '#000000'} emissiveIntensity={0.65} /></mesh>)}
      <mesh position={[0, 0.17, 0.35]}><boxGeometry args={[0.42, 0.12, 0.05]} /><meshStandardMaterial color="#24343a" roughness={0.42} /></mesh>
    </group>)}
    <mesh position={[-0.19, 1.64, 0.3]}><boxGeometry args={[1.22, 0.1, 0.15]} /><meshStandardMaterial color="#53656a" metalness={0.72} roughness={0.24} /></mesh>
    {[-0.72, -0.44, 0.02, 0.3].map((x, i) => <group key={x} position={[x, 1.4, 0.45]}>
      <Line points={[[0, 0.255, 0], [0, 0.255, -0.15]]} color="#aab7ba" lineWidth={2.2} />
      <mesh position={[0, -0.015, 0]}><cylinderGeometry args={[0.022, 0.025, 0.47, 18]} /><meshPhysicalMaterial color="#d9e5e4" transparent opacity={focused ? 0.78 : 0.62} transmission={0.12} roughness={0.06} /></mesh>
      <mesh position={[0, -0.04, 0]}><cylinderGeometry args={[0.035, 0.035, 0.34, 18, 1, true]} /><meshPhysicalMaterial color="#9fb9bd" transparent opacity={0.22} roughness={0.06} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, -0.255, 0]}><sphereGeometry args={[0.052, 20, 14]} /><meshStandardMaterial color={leakCheckPassed ? '#77968d' : active && i !== 2 ? '#8f73b5' : '#829197'} roughness={0.35} /></mesh>
      <mesh position={[0, 0.24, 0]}><cylinderGeometry args={[0.062, 0.062, 0.105, 20]} /><meshStandardMaterial color="#9ea9aa" metalness={0.7} roughness={0.22} /></mesh>
      <mesh position={[0, 0.302, 0]}><cylinderGeometry args={[0.032, 0.032, 0.055, 16]} /><meshStandardMaterial color="#64777d" metalness={0.72} roughness={0.24} /></mesh>
      <mesh position={[0, 0.332, 0]}><boxGeometry args={[0.13, 0.018, 0.025]} /><meshStandardMaterial color={portsIsolated ? '#51e19a' : '#718790'} emissive={portsIsolated ? '#1b5b3d' : '#000000'} emissiveIntensity={0.45} metalness={0.65} roughness={0.25} /></mesh>
    </group>)}
    {[-0.72, -0.44, 0.02, 0.3].map((x) => <mesh key={`union-${x}`} position={[x, 1.655, 0.3]} castShadow><cylinderGeometry args={[0.045, 0.045, 0.09, 18]} /><meshStandardMaterial color="#798b8f" metalness={0.82} roughness={0.2} /></mesh>)}
    <group ref={dewarLift} position={[-0.21, 0.43, 0.48]}>
      {[-0.51, -0.23, 0.23, 0.51].map((x) => <group key={x} position={[x, 0, 0]}>
        <mesh castShadow><cylinderGeometry args={[0.13, 0.15, 0.4, 28, 1, true]} /><meshPhysicalMaterial color="#b8c1c0" metalness={0.76} roughness={0.2} clearcoat={0.2} side={THREE.DoubleSide} /></mesh>
        <mesh position={[0, -0.195, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.145, 28]} /><meshStandardMaterial color="#8e9b9a" metalness={0.68} roughness={0.25} /></mesh>
        <mesh position={[0, 0.205, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.132, 0.012, 10, 28]} /><meshStandardMaterial color="#697b80" metalness={0.78} roughness={0.22} /></mesh>
        <mesh position={[0, 0.198, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.112, 28]} /><meshStandardMaterial color={dewarPositioned ? '#bce6ee' : '#17272c'} emissive={dewarPositioned ? '#3c7b85' : '#000000'} emissiveIntensity={dewarPositioned ? 0.35 : 0} roughness={0.28} /></mesh>
      </group>)}
      <mesh position={[0, -0.24, -0.05]}><boxGeometry args={[1.28, 0.08, 0.36]} /><meshStandardMaterial color="#47595e" metalness={0.68} roughness={0.3} /></mesh>
    </group>
    <group position={[0.68, 0.43, -0.2]}>
      <RoundedBox args={[0.48, 0.56, 0.58]} radius={0.055} castShadow><meshStandardMaterial color="#26343a" roughness={0.42} metalness={0.16} /></RoundedBox>
      {[-0.15, -0.05, 0.05, 0.15].map((y) => <mesh key={y} position={[0, y, 0.3]}><planeGeometry args={[0.28, 0.025]} /><meshBasicMaterial color="#52656b" /></mesh>)}
      <Line points={[[0.18, 0.18, 0.05], [0.34, 0.6, 0.08], [0.08, 0.83, 0.18], [-0.19, 0.85, 0.24]]} color={leakCheckPassed ? '#51e19a' : '#607985'} lineWidth={1.25} />
    </group>
    <group position={[1.08, 0.61, 0.04]}>
      <mesh castShadow><cylinderGeometry args={[0.18, 0.2, 1.02, 28]} /><meshPhysicalMaterial color={gasProven ? '#668a7d' : '#607788'} emissive={gasProven ? '#183e31' : '#000000'} emissiveIntensity={gasProven ? 0.18 : 0} metalness={0.18} roughness={0.34} clearcoat={0.16} /></mesh>
      <mesh position={[0, 0.55, 0]}><cylinderGeometry args={[0.07, 0.07, 0.1, 18]} /><meshStandardMaterial color="#aab7bc" metalness={0.78} /></mesh>
      <mesh position={[0, 0.02, 0.2]}><planeGeometry args={[0.24, 0.28]} /><meshBasicMaterial color="#e5e2d5" /></mesh>
      <Html transform center position={[0, 0.02, 0.206]} scale={0.18} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}><span className="gas-cylinder-physical-label"><b>N₂</b></span></Html>
      <Line points={[[-0.25, 0.18, 0.22], [0.25, 0.18, 0.22]]} color="#c7a34f" lineWidth={1.8} />
    </group>
    <group position={[1.08, 0.73, 0.02]}>
      {[-0.27, 0.27].map((x) => <mesh key={x} position={[x, 0, -0.18]}><boxGeometry args={[0.035, 1.25, 0.035]} /><meshStandardMaterial color="#526268" metalness={0.68} roughness={0.27} /></mesh>)}
      <Line points={[[ -0.27, 0.24, 0.2 ], [ 0.27, 0.24, 0.2 ]]} color="#c7a34f" lineWidth={1.7} />
      <Line points={[[ -0.27, -0.24, 0.2 ], [ 0.27, -0.24, 0.2 ]]} color="#c7a34f" lineWidth={1.7} />
    </group>
    <group position={[1.08, 1.31, 0.04]}>
      {[-0.13, 0.13].map((x) => <group key={x} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh><cylinderGeometry args={[0.105, 0.105, 0.035, 22]} /><meshStandardMaterial color="#c2cbce" metalness={0.84} roughness={0.17} /></mesh>
        <mesh position={[0, -0.02, 0]}><circleGeometry args={[0.075, 20]} /><meshBasicMaterial color={gasProven ? '#17402f' : '#101d23'} /></mesh>
      </group>)}
      <mesh position={[0, -0.13, 0]}><boxGeometry args={[0.38, 0.12, 0.14]} /><meshStandardMaterial color="#415460" metalness={0.72} roughness={0.28} /></mesh>
    </group>
    <Line points={[[1.08, 1.22, 0.05], [0.83, 1.54, 0.02], [-0.18, 1.55, 0.18]]} color={gasProven ? '#51e19a' : tone} lineWidth={gasProven ? 1.35 : 0.8} transparent opacity={gasProven ? 0.84 : 0.55} />
    <Line points={[[0.68, 0.68, -0.2], [0.74, 1.36, 0.02], [0.36, 1.64, 0.3]]} color={leakCheckPassed ? '#51e19a' : '#607985'} lineWidth={leakCheckPassed ? 1.35 : 1.0} />
    <BetDegasStation active={active} controls={controls} />
  </group>;
}

function BetDegasStation({ active, controls }: { active: boolean; controls: string[] }) {
  const prepared = controls.includes('Run manifold leak check') || controls.includes('Prove N₂ supply state');
  return <group position={[-1.12, 0.45, -0.48]}>
    <RoundedBox args={[0.78, 0.58, 0.62]} radius={0.075} castShadow><meshStandardMaterial color="#33454b" metalness={0.52} roughness={0.34} /></RoundedBox>
    <mesh position={[0, 0.04, 0.316]}><planeGeometry args={[0.58, 0.21]} /><meshBasicMaterial color="#07171b" /></mesh>
    <mesh position={[-0.12, 0.07, 0.32]}><planeGeometry args={[0.22, 0.025]} /><meshBasicMaterial color={prepared ? '#51e19a' : active ? '#f4b95f' : '#5f7e87'} /></mesh>
    {[ -0.22, 0, 0.22 ].map((x) => <group key={x} position={[x, 0.5, 0]}>
      <mesh><cylinderGeometry args={[0.045, 0.055, 0.48, 18]} /><meshPhysicalMaterial color="#dbe5e3" transparent opacity={0.62} roughness={0.08} /></mesh>
      <mesh position={[0, -0.26, 0]}><cylinderGeometry args={[0.1, 0.1, 0.18, 22]} /><meshStandardMaterial color={prepared ? '#6c8b80' : '#6e7880'} emissive={prepared ? '#1d503d' : '#000000'} emissiveIntensity={prepared ? 0.45 : 0} metalness={0.42} roughness={0.32} /></mesh>
      <mesh position={[0, 0.27, 0]}><torusGeometry args={[0.052, 0.01, 8, 20]} /><meshStandardMaterial color="#aab5b6" metalness={0.8} roughness={0.19} /></mesh>
    </group>)}
    <Line points={[[ -0.22, 0.79, 0], [0.22, 0.79, 0], [0.48, 0.61, 0.04]]} color={prepared ? '#51e19a' : '#617b82'} lineWidth={1.15} />
  </group>;
}

function TgaDsc({ active, focused, controls }: { active: boolean; focused: boolean; controls: string[] }) {
  const carousel = useRef<THREE.Group>(null);
  const startTemperatureProven = controls.includes('Confirm furnace at start temperature');
  const tareProven = controls.includes('Tare balance channel');
  const purgeProven = controls.includes('Prove purge path');
  const carouselHomed = controls.includes('Home autosampler carousel');
  useFrame((_, delta) => {
    if (carousel.current) carousel.current.rotation.y = THREE.MathUtils.damp(carousel.current.rotation.y, carouselHomed ? 0 : 0.48, 3, delta);
  });
  return <group position={[0, 0.18, 0]}>
    <LabBench position={[0, 0, 0.28]} width={2.66} />
    <RoundedBox args={[1.54, 0.72, 0.92]} radius={0.1} smoothness={4} position={[-0.12, 0.8, 0.06]} castShadow>
      <meshPhysicalMaterial color="#d0d5d6" metalness={0.03} roughness={0.38} clearcoat={0.12} />
    </RoundedBox>
    <RoundedBox args={[0.78, 0.3, 0.065]} radius={0.035} position={[0.12, 0.82, 0.535]}><meshBasicMaterial color="#07161d" /></RoundedBox>
    <mesh position={[0.12, 0.86, 0.569]}><planeGeometry args={[0.52, 0.03]} /><meshBasicMaterial color={tareProven ? '#51e19a' : active ? '#4dd5ed' : '#f4b95f'} /></mesh>
    <Line points={[[ -0.92, 0.56, 0.595], [0.62, 0.56, 0.595]]} color="#8b979b" lineWidth={0.55} transparent opacity={0.55} />
    <group position={[0.2, 0.69, 0.637]}>{[-0.18, -0.06, 0.06, 0.18].map((x, index) => <mesh key={x} position={[x, 0, 0]}><circleGeometry args={[0.022, 14]} /><meshStandardMaterial color={index === 0 ? '#51e19a' : '#6f8088'} emissive={index === 0 ? '#1d6645' : '#1a252b'} emissiveIntensity={0.5} /></mesh>)}</group>
    <group position={[-0.72, 1.3, -0.25]}>
      <RoundedBox args={[0.18, 1.52, 0.28]} radius={0.045} castShadow><meshStandardMaterial color="#465963" metalness={0.42} roughness={0.34} /></RoundedBox>
      <RoundedBox args={[0.62, 0.18, 0.3]} radius={0.045} position={[0.3, 0.68, 0]} castShadow><meshStandardMaterial color="#4f626c" metalness={0.46} roughness={0.32} /></RoundedBox>
      <Line points={[[0.02, -0.64, -0.15], [0.02, 0.62, -0.15], [0.5, 0.62, -0.15]]} color="#26373f" lineWidth={1.4} />
    </group>
    <group position={[-0.42, 1.74, -0.05]}>
      <RoundedBox args={[0.66, 0.38, 0.5]} radius={0.07} castShadow><meshPhysicalMaterial color="#576a75" metalness={0.14} roughness={0.4} clearcoat={0.12} /></RoundedBox>
      <mesh position={[0, 0.03, 0.255]}><planeGeometry args={[0.42, 0.1]} /><meshBasicMaterial color="#18272e" /></mesh>
      <mesh position={[-0.12, 0.035, 0.26]}><planeGeometry args={[0.12, 0.018]} /><meshBasicMaterial color={tareProven ? '#51e19a' : '#6e828a'} /></mesh>
      <mesh position={[0, 0.23, 0]}><cylinderGeometry args={[0.12, 0.15, 0.08, 26]} /><meshStandardMaterial color="#aab5b9" metalness={0.72} roughness={0.22} /></mesh>
      <mesh position={[0, 0.275, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.1, 0.018, 9, 26]} /><meshStandardMaterial color="#42545e" metalness={0.72} roughness={0.25} /></mesh>
      <mesh position={[0, -0.26, 0.15]}><cylinderGeometry args={[0.014, 0.014, 0.26, 12]} /><meshStandardMaterial color="#d6dcdb" metalness={0.76} roughness={0.18} /></mesh>
    </group>
    <group position={[-0.42, 1.2, 0.12]}>
      <mesh castShadow><cylinderGeometry args={[0.21, 0.27, 0.32, 32]} /><meshPhysicalMaterial color="#71828d" metalness={0.22} roughness={0.38} clearcoat={0.12} /></mesh>
      <mesh position={[0, 0.19, 0]}><cylinderGeometry args={[0.13, 0.18, 0.09, 28]} /><meshStandardMaterial color="#b8c1c4" metalness={0.7} roughness={0.22} /></mesh>
      <mesh position={[0, 0.25, 0]}><torusGeometry args={[0.1, 0.018, 10, 28]} /><meshStandardMaterial color={startTemperatureProven ? '#4f8875' : '#293943'} emissive={focused ? startTemperatureProven ? '#2b9a68' : '#7c351e' : '#000000'} emissiveIntensity={focused ? startTemperatureProven ? 0.65 : active ? 0.8 : 0.12 : 0} /></mesh>
      <mesh position={[0.22, 0.05, 0.03]} rotation={[0, 0, -0.38]} castShadow><boxGeometry args={[0.055, 0.24, 0.08]} /><meshStandardMaterial color="#475b65" metalness={0.68} roughness={0.28} /></mesh>
      <mesh position={[0.26, -0.08, 0.03]}><cylinderGeometry args={[0.04, 0.04, 0.06, 16]} /><meshStandardMaterial color="#b2bdc1" metalness={0.78} roughness={0.18} /></mesh>
      {focused && <pointLight position={[0, 0.27, 0]} intensity={startTemperatureProven ? 0.55 : active ? 1.5 : 0.25} distance={1.1} color={startTemperatureProven ? '#69d7ad' : '#ff8b4d'} />}
      <mesh position={[0, -0.21, 0]}><cylinderGeometry args={[0.025, 0.025, 0.18, 14]} /><meshStandardMaterial color="#c4cdcc" metalness={0.7} roughness={0.2} /></mesh>
      <mesh position={[-0.055, -0.31, 0]}><cylinderGeometry args={[0.025, 0.035, 0.018, 18]} /><meshStandardMaterial color="#d6c7a4" roughness={0.5} /></mesh>
      <mesh position={[0.055, -0.31, 0]}><cylinderGeometry args={[0.025, 0.035, 0.018, 18]} /><meshStandardMaterial color="#d6c7a4" roughness={0.5} /></mesh>
    </group>
    <group ref={carousel} position={[0.55, 1.04, 0.08]} rotation={[0, 0.48, 0]}>
      <mesh castShadow><cylinderGeometry args={[0.29, 0.29, 0.075, 36]} /><meshPhysicalMaterial color="#647681" metalness={0.2} roughness={0.36} clearcoat={0.12} /></mesh>
      {Array.from({ length: 12 }, (_, index) => { const angle = index * Math.PI / 6; return <group key={index} position={[Math.cos(angle) * 0.2, 0.065, Math.sin(angle) * 0.2]}><mesh><cylinderGeometry args={[0.025, 0.03, 0.024, 14]} /><meshStandardMaterial color="#d7dfe0" metalness={0.72} roughness={0.2} /></mesh>{index < 2 && <mesh position={[0, 0.018, 0]}><cylinderGeometry args={[0.018, 0.022, 0.008, 14]} /><meshStandardMaterial color="#cfa65d" roughness={0.45} /></mesh>}</group>; })}
      <mesh position={[0, 0.15, 0]} castShadow><cylinderGeometry args={[0.05, 0.065, 0.24, 18]} /><meshStandardMaterial color="#51646f" metalness={0.7} roughness={0.25} /></mesh>
      <mesh position={[0, 0.16, 0]}><cylinderGeometry args={[0.32, 0.32, 0.28, 40, 1, true]} /><meshPhysicalMaterial color="#71858d" transparent opacity={focused ? 0.16 : 0.52} roughness={focused ? 0.08 : 0.34} transmission={focused ? 0.12 : 0} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 0.31, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.31, 0.018, 10, 36]} /><meshStandardMaterial color="#778b94" metalness={0.72} roughness={0.22} /></mesh>
    </group>
    <Line points={[[0.62, 0.68, 0.5], [0.92, 0.92, 0.44], [0.92, 1.36, 0.12], [0.72, 1.47, 0.08]]} color={purgeProven ? '#51e19a' : '#6c8795'} lineWidth={purgeProven ? 1.5 : 1.1} />
    <mesh position={[1.0, 0.68, 0.2]} castShadow><cylinderGeometry args={[0.11, 0.13, 0.68, 24]} /><meshStandardMaterial color="#57717f" metalness={0.2} roughness={0.36} /></mesh>
    <mesh position={[1.0, 1.04, 0.2]}><cylinderGeometry args={[0.045, 0.045, 0.08, 18]} /><meshStandardMaterial color="#b0bec3" metalness={0.74} /></mesh>
    <Line points={[[0.79, 0.38, 0.42], [1.21, 0.38, 0.42]]} color="#c7a34f" lineWidth={1.6} />
    <group position={[1.0, 0.67, 0.18]}>
      {[-0.2, 0.2].map((x) => <mesh key={x} position={[x, 0, -0.15]}><boxGeometry args={[0.03, 0.92, 0.03]} /><meshStandardMaterial color="#526268" metalness={0.68} roughness={0.27} /></mesh>)}
      <Line points={[[ -0.2, 0.13, 0.16 ], [ 0.2, 0.13, 0.16 ]]} color="#c7a34f" lineWidth={1.6} />
      <RoundedBox args={[0.5, 0.05, 0.42]} radius={0.02} position={[0, -0.38, 0]}><meshStandardMaterial color="#344449" roughness={0.46} /></RoundedBox>
    </group>
    <group position={[0.9, 1.18, 0.2]}>
      {[-0.11, 0.11].map((x) => <group key={x} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh><cylinderGeometry args={[0.085, 0.085, 0.03, 20]} /><meshStandardMaterial color="#aeb9bd" metalness={0.84} roughness={0.17} /></mesh>
        <mesh position={[0, -0.018, 0]}><circleGeometry args={[0.058, 18]} /><meshBasicMaterial color={purgeProven ? '#153a2b' : '#0b1a20'} /></mesh>
      </group>)}
      <mesh position={[0, -0.12, 0]}><boxGeometry args={[0.34, 0.12, 0.12]} /><meshStandardMaterial color="#405560" metalness={0.7} roughness={0.27} /></mesh>
    </group>
  </group>;
}

function LabBench({ position, width }: { position: [number, number, number]; width: number }) {
  return <group position={position}>
    <mesh position={[0, 0.42, 0]} castShadow receiveShadow><boxGeometry args={[width, 0.12, 1.15]} /><meshPhysicalMaterial color="#9aa5aa" metalness={0.08} roughness={0.42} clearcoat={0.08} /></mesh>
    {[-width * 0.4, width * 0.4].map((x) => <group key={x}>
      <mesh position={[x, 0.1, -0.4]}><boxGeometry args={[0.08, 0.72, 0.08]} /><meshStandardMaterial color="#42525e" metalness={0.75} /></mesh>
      <mesh position={[x, 0.1, 0.4]}><boxGeometry args={[0.08, 0.72, 0.08]} /><meshStandardMaterial color="#42525e" metalness={0.75} /></mesh>
    </group>)}
  </group>;
}

function ControlProofLights({ count }: { count: number }) {
  return <group position={[-1.28, 0.16, 1.13]}>
    <RoundedBox args={[0.38, 0.12, 0.18]} radius={0.025} castShadow><meshStandardMaterial color="#26343b" metalness={0.72} roughness={0.3} /></RoundedBox>
    {[0, 1, 2].map((index) => { const proven = index < count; return <mesh key={index} position={[-0.11 + index * 0.11, 0.065, 0]}>
      <cylinderGeometry args={[0.025, 0.025, 0.025, 16]} />
      <meshStandardMaterial color={proven ? '#51e19a' : '#46535a'} emissive={proven ? '#2ca96d' : '#182027'} emissiveIntensity={proven ? 1.4 : 0.2} roughness={0.25} />
    </mesh>; })}
    {count > 0 && <pointLight position={[0, 0.14, 0]} intensity={0.7 + count * 0.2} distance={0.75} color="#51e19a" decay={2} />}
  </group>;
}

function StatusBeacon({ position, color, active }: { position: [number, number, number]; color: string; active: boolean }) {
  const activeIndex = color === TONE_COLORS.ready || color === TONE_COLORS.run ? 0 : color === TONE_COLORS.off ? 2 : 1;
  return <group position={position}>
    <mesh position={[0, 0.055, 0]} castShadow><cylinderGeometry args={[0.085, 0.1, 0.11, 18]} /><meshStandardMaterial color="#202d35" metalness={0.78} roughness={0.28} /></mesh>
    <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.035, 0.04, 0.12, 14]} /><meshStandardMaterial color="#52616a" metalness={0.82} roughness={0.22} /></mesh>
    {[0.235, 0.315, 0.395].map((y, index) => <group key={y} position={[0, y, 0]}>
      <mesh><cylinderGeometry args={[0.062, 0.062, 0.07, 18]} />{index === activeIndex ? <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 1.25 : 0.52} transparent opacity={0.94} /> : <meshPhysicalMaterial color={index === 0 ? '#25483a' : index === 1 ? '#4b4124' : '#4c2828'} emissive={index === 0 ? '#173427' : index === 1 ? '#342b16' : '#351919'} emissiveIntensity={0.18} transparent opacity={0.82} roughness={0.18} />}</mesh>
      <mesh position={[0, index === 2 ? 0.043 : -0.043, 0]}><cylinderGeometry args={[0.067, 0.067, 0.012, 18]} /><meshStandardMaterial color="#27343c" metalness={0.76} roughness={0.26} /></mesh>
    </group>)}
    <mesh position={[0, 0.44, 0]}><cylinderGeometry args={[0.066, 0.058, 0.025, 18]} /><meshStandardMaterial color="#52616a" metalness={0.82} roughness={0.2} /></mesh>
  </group>;
}

function MaterialRoute() {
  const points = useMemo(() => (['PREP-01', 'ROBO-02', 'FURN-04', 'XRD-03'] as const).map((stationId) => {
    const [x, , z] = getStationSceneSpec(stationId).position;
    return new THREE.Vector3(x, 0.18, z + 1.18);
  }), []);
  const routeColor = '#4dd5ed';
  return <group>
    <Line points={points} color={routeColor} lineWidth={0.52} dashed dashSize={0.18} gapSize={0.16} transparent opacity={0.34} />
    <group position={points[0]}><SampleCarrier routeColor={routeColor} /></group>
  </group>;
}

function SampleCarrier({ routeColor }: { routeColor: string }) {
  return <group rotation={[0, Math.PI / 4, 0]}>
    <RoundedBox args={[0.76, 0.14, 0.58]} radius={0.06} position={[0, 0.02, 0]} castShadow><meshStandardMaterial color="#26343a" metalness={0.58} roughness={0.34} /></RoundedBox>
    {[-0.27, 0.27].flatMap((x) => [-0.2, 0.2].map((z) => <mesh key={`${x}-${z}`} position={[x, -0.07, z]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.055, 0.055, 0.045, 16]} /><meshStandardMaterial color="#11191d" roughness={0.78} /></mesh>))}
    <RoundedBox args={[0.62, 0.07, 0.44]} radius={0.025} position={[0, 0.14, 0]} castShadow><meshPhysicalMaterial color="#76858b" metalness={0.8} roughness={0.22} clearcoat={0.24} /></RoundedBox>
    {[-0.17, 0, 0.17].flatMap((x) => [-0.105, 0.105].map((z, index) => <group key={`${x}-${z}`} position={[x, 0.215, z]}>
      <mesh castShadow><cylinderGeometry args={[0.055, 0.06, 0.07, 18]} /><meshStandardMaterial color="#c8d0d2" metalness={0.72} roughness={0.22} /></mesh>
      <mesh position={[0, 0.037, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.045, 18]} /><meshStandardMaterial color={x === 0 && index === 1 ? '#b76756' : '#d1ad69'} roughness={0.68} /></mesh>
    </group>))}
    <RoundedBox args={[0.58, 0.14, 0.39]} radius={0.035} position={[0, 0.31, 0]} castShadow><meshPhysicalMaterial color="#9eb5b9" transparent opacity={0.2} transmission={0.16} roughness={0.08} /></RoundedBox>
    <mesh position={[0, 0.035, 0.294]}><planeGeometry args={[0.45, 0.08]} /><meshBasicMaterial color="#0a151a" /></mesh>
    <mesh position={[0, 0.035, 0.297]}><planeGeometry args={[0.32, 0.015]} /><meshBasicMaterial color={routeColor} /></mesh>
  </group>;
}
