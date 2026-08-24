'use client';

import { ContactShadows, Environment, Grid, Html, Lightformer, Line, OrbitControls, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { evaluateCampaignMission, getCampaignIdentity, getCampaignOperations, getCampaignSpec } from './campaign-spec';
import type { CampaignMissionId } from './campaign-spec';
import type { Station } from './sim-data';

type OrbitControlsHandle = React.ComponentRef<typeof OrbitControls>;

type ScenarioId = 'xrd' | 'bet' | 'furnace' | 'tga' | 'facility';
type CameraMode = 'overview' | 'walk' | 'focus';
type LightingMode = 'inspection' | 'run';
type WalkDirection = 'forward' | 'back' | 'left' | 'right';
type WalkCommand = { id: number; direction: WalkDirection };
type SceneProps = {
  stations: Station[];
  selectedId: string;
  phase: number;
  campaignStage: number;
  campaignSelected: string;
  campaignRunNumber: number;
  campaignResultElapsed: number;
  campaignResultMeasured: string;
  campaignConfirmationSource: { runNumber: number; measured: string } | null;
  campaignMissionId: CampaignMissionId;
  campaignThermalBayLevel: number;
  campaignInventory: { crucibles: number; liners: number; carbonTabs: number };
  campaignBacklog: Array<{ runNumber: number; candidate: string; missionId: CampaignMissionId }>;
  scenarioId: ScenarioId;
  cameraMode: CameraMode;
  lightingMode: LightingMode;
  controlFeedback?: Record<string, string[]>;
  onCameraMode: (mode: CameraMode) => void;
  onOpenConsole: () => void;
  onOpenInventory: () => void;
  onOpenCampaign: () => void;
  inspectionState?: Record<string, string[]>;
  onInspectionChange?: (stationId: string, checks: string[]) => void;
  onSelect: (id: string) => void;
};

const STATION_POSITIONS: [number, number, number][] = [
  [-5.25, 0, -2.15],
  [-1.75, 0, -2.15],
  [1.75, 0, -2.15],
  [-5.25, 0, 1.75],
  [-1.75, 0, 1.75],
  [1.75, 0, 1.75],
  [1.75, 0, 5.35],
];

// Technician approach points stay outside equipment clearances and preserve a readable working
// face. Most stations are approached from the primary aisle; TGA/DSC is approached from its open
// side because it sits at the front boundary of the modeled room.
const WALK_APPROACH_OFFSETS: [number, number, number][] = [
  [-2.35, 1.68, 2.15],
  [-2.5, 1.68, 2.15],
  [2.35, 1.68, 2.15],
  [0, 1.68, 5.45],
  [0, 1.68, 5.2],
  [2.35, 1.68, 3.65],
  [-4.45, 1.68, 1.65],
];

const TONE_COLORS: Record<Station['tone'], string> = {
  ready: '#51e19a',
  hold: '#718198',
  run: '#4dd5ed',
  warn: '#f4b95f',
  off: '#586579',
};

export function Lab3D({ stations, selectedId, phase, campaignStage, campaignSelected, campaignRunNumber, campaignResultElapsed, campaignResultMeasured, campaignConfirmationSource, campaignMissionId, campaignThermalBayLevel, campaignInventory, campaignBacklog, scenarioId, cameraMode, lightingMode, controlFeedback, onCameraMode, onOpenConsole, onOpenInventory, onOpenCampaign, inspectionState, onInspectionChange, onSelect }: SceneProps) {
  const controlsRef = useRef<OrbitControlsHandle>(null);
  const [localVisited, setLocalVisited] = useState<Record<string, string[]>>({});
  const visited = inspectionState ?? localVisited;
  const [observationRecord, setObservationRecord] = useState<{ stationId: string; point: InspectionPoint } | null>(null);
  const [walkCommand, setWalkCommand] = useState<WalkCommand>({ id: 0, direction: 'forward' });
  const selectedIndex = Math.max(0, stations.findIndex((station) => station.id === selectedId));
  const selectedStation = stations[selectedIndex];
  const campaignIndex = getCampaignStationIndex(campaignStage);
  const inspectionKey = getInspectionKey(selectedId, selectedIndex, campaignStage, campaignSelected, campaignRunNumber);
  const selectedHotspots = getInspectionPoints(selectedIndex, scenarioId, phase, campaignStage, campaignSelected, campaignRunNumber, campaignThermalBayLevel, campaignResultMeasured);
  const inspected = visited[inspectionKey] ?? [];
  const activeObservation = cameraMode === 'focus' && observationRecord?.stationId === selectedId ? observationRecord.point : null;
  const campaignState = getCampaignRoomState(campaignStage, campaignSelected, campaignRunNumber, campaignMissionId, campaignResultElapsed, campaignResultMeasured, campaignConfirmationSource);
  const inspect = (label: string) => {
    const point = selectedHotspots.find((hotspot) => hotspot.label === label);
    if (point) setObservationRecord({ stationId: selectedId, point });
    const checks = Array.from(new Set([...(visited[inspectionKey] ?? []), label]));
    if (!inspectionState) setLocalVisited((current) => ({ ...current, [inspectionKey]: checks }));
    onInspectionChange?.(inspectionKey, checks);
  };
  return (
    <div className={`lab-3d camera-${cameraMode}`} aria-label="Orbitable 3D digital twin of seven materials laboratory stations">
      <Canvas
        shadows
        dpr={[1, 1.55]}
        camera={{ position: [10.5, 11.8, 19.5], fov: 55, near: 0.1, far: 90 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
        }}
      >
        <FacilityLighting mode={lightingMode} />

        <LabArchitecture lightingMode={lightingMode} />
        <OperationsProps scenarioId={scenarioId} phase={phase} inventory={campaignInventory} onOpenInventory={onOpenInventory} />
        <CampaignBacklogRack backlog={campaignBacklog} thermalBayLevel={campaignThermalBayLevel} onOpenCampaign={onOpenCampaign} />
        <MaterialRoute scenarioId={scenarioId} phase={phase} />
        <CampaignMaterialRoute stage={campaignStage} selected={campaignSelected} runNumber={campaignRunNumber} missionId={campaignMissionId} resultElapsed={campaignResultElapsed} resultMeasured={campaignResultMeasured} confirmationSource={campaignConfirmationSource} />
        {stations.map((station, index) => (cameraMode !== 'focus' || selectedId === station.id) ? (
          <StationCell
            key={station.id}
            station={station}
            index={index}
            position={STATION_POSITIONS[index]}
            selected={selectedId === station.id}
            active={station.tone === 'run' || campaignIndex === index}
            toneOverride={campaignIndex === index ? campaignState.color : undefined}
            stateOverride={campaignIndex === index ? campaignState.label : undefined}
            showHotspots={selectedId === station.id && cameraMode === 'focus'}
            inspected={visited[getInspectionKey(station.id, index, campaignStage, campaignSelected, campaignRunNumber)] ?? []}
            inspectionPoints={getInspectionPoints(index, scenarioId, phase, campaignStage, campaignSelected, campaignRunNumber, campaignThermalBayLevel)}
            controls={controlFeedback?.[station.id] ?? []}
            scenarioId={scenarioId}
            phase={phase}
            thermalBayLevel={campaignThermalBayLevel}
            campaignStage={campaignStage}
            campaignRunNumber={campaignRunNumber}
            onInspect={inspect}
            onFocus={() => onCameraMode('focus')}
            onSelect={onSelect}
          />
        ) : null)}
        <ContactShadows position={[0, 0.025, 0]} opacity={0.58} scale={22} blur={2.6} far={8} resolution={512} color="#000713" />
        <CameraDirector mode={cameraMode} selectedIndex={selectedIndex} controls={controlsRef} />
        <AisleNavigator active={cameraMode === 'walk'} controls={controlsRef} command={walkCommand} scenarioId={scenarioId} phase={phase} />
        <OrbitControls
          ref={controlsRef}
          makeDefault
          target={[-1.55, 0.72, -0.18]}
          enableDamping
          dampingFactor={0.075}
          enablePan={cameraMode !== 'walk'}
          minDistance={cameraMode === 'focus' ? 3.8 : cameraMode === 'walk' ? 2.8 : 11}
          maxDistance={cameraMode === 'walk' ? 5.7 : 34}
          minPolarAngle={cameraMode === 'walk' ? 1.05 : 0.55}
          maxPolarAngle={cameraMode === 'walk' ? 1.55 : 1.36}
          minAzimuthAngle={-1.45}
          maxAzimuthAngle={1.25}
        />
      </Canvas>
      <nav className="scene-station-picker" aria-label="Select a lab station">
        {stations.map((station, index) => <button key={station.id} type="button" className={`${selectedId === station.id ? 'active ' : ''}${campaignIndex === index ? 'campaign-active' : ''}`} style={{ '--station-tone': campaignIndex === index ? campaignState.color : TONE_COLORS[station.tone] } as React.CSSProperties} onClick={() => onSelect(station.id)} onDoubleClick={() => { onSelect(station.id); onCameraMode('focus'); }} aria-pressed={selectedId === station.id}><i />{station.id.replace('-0', '·')}</button>)}
      </nav>
      <div className="scene-corner scene-corner-top"><span>LIVE SPATIAL TWIN</span><b>LAB 04 · BAY A/B</b></div>
      <div className="scene-corner scene-corner-bottom">{cameraMode === 'walk' ? <><span>WASD</span> MOVE <i>·</i> <span>DRAG</span> LOOK <i>·</i> <span>SELECT</span> APPROACH</> : <><span>DRAG</span> ORBIT <i>·</i> <span>SCROLL</span> ZOOM <i>·</i> <span>CLICK</span> INSPECT</>}</div>
      {campaignStage > 0 && <div className={`campaign-room-hud ${campaignState.tone}`}><span>CAMPAIGN TWIN · {getCampaignIdentity(campaignRunNumber).runId} · {campaignSelected}</span><b>{campaignState.station} / {campaignState.label}</b><i>{campaignStage >= 7 ? campaignState.result : `${String(campaignStage + 1).padStart(2, '0')} / 08`}</i></div>}
      {campaignBacklog.length > 0 && <button type="button" className={`campaign-backlog-hud${campaignStage > 0 ? ' with-campaign' : ''}`} onClick={onOpenCampaign}><span>OPERATE SHIFT BACKLOG</span><b>{campaignBacklog.length} PLANS · {campaignBacklog.reduce((total, item) => total + getCampaignSpec(item.candidate).thermalMinutes, 0)} FURNACE MIN</b><i>OPEN →</i></button>}
      {selectedId === 'PREP-01' && <button type="button" className={`material-room-hud${campaignInventory.crucibles < 6 || campaignInventory.liners < 1 ? ' low' : ''}${campaignBacklog.length ? ' with-backlog' : ''}`} onClick={onOpenInventory}><span>OPERATE POINT-OF-USE RACK</span><b>{campaignInventory.crucibles} CRUC · {campaignInventory.liners} LIN · {campaignInventory.carbonTabs} TAB</b><i>OPEN →</i></button>}
      {cameraMode === 'walk' && <div className="walk-hud">
        <header><span>HUMAN-SCALE AISLE</span><b>{selectedStation.id} · {selectedStation.name}</b></header>
        <div className="walk-pad" role="group" aria-label="Aisle movement controls">
          <button type="button" className="walk-forward" onClick={() => setWalkCommand((command) => ({ id: command.id + 1, direction: 'forward' }))} aria-label="Step forward">↑</button>
          <button type="button" className="walk-left" onClick={() => setWalkCommand((command) => ({ id: command.id + 1, direction: 'left' }))} aria-label="Step left">←</button>
          <button type="button" className="walk-back" onClick={() => setWalkCommand((command) => ({ id: command.id + 1, direction: 'back' }))} aria-label="Step back">↓</button>
          <button type="button" className="walk-right" onClick={() => setWalkCommand((command) => ({ id: command.id + 1, direction: 'right' }))} aria-label="Step right">→</button>
        </div>
        <button type="button" className="walk-console" onClick={onOpenConsole}>OPERATE LOCAL CONSOLE <i>↗</i></button>
        <small>WASD / ARROWS · choose a station to approach</small>
        <button type="button" className="walk-inspect" onClick={() => onCameraMode('focus')}>◎ INSPECT ASSET <i>{inspected.length}/{selectedHotspots.length}</i></button>
      </div>}
      {cameraMode === 'focus' && <div className="walkaround-panel">
        <header><div><span>PHYSICAL WALKAROUND</span><b>{selectedStation.id} · {selectedStation.name}</b></div><em>{inspected.length} / {selectedHotspots.length}</em></header>
        <div>{selectedHotspots.map((hotspot) => <button key={hotspot.label} type="button" className={inspected.includes(hotspot.label) ? 'visited' : ''} onClick={() => inspect(hotspot.label)}><i>{inspected.includes(hotspot.label) ? '✓' : '○'}</i>{hotspot.label}</button>)}</div>
        {activeObservation && <div className={`walkaround-observation ${activeObservation.state}`}><span>{activeObservation.label} OBSERVATION</span><b>{activeObservation.observation}</b><em>{activeObservation.state === 'attention' ? 'ATTENTION' : 'CAPTURED'}</em></div>}
        {inspected.length === selectedHotspots.length && <button type="button" className="walkaround-next" onClick={onOpenConsole}>OPEN LOCAL CONSOLE <i>→</i></button>}
        <small>{inspected.length === selectedHotspots.length ? 'Walkaround captured. Compare physical state with the local console.' : 'Select each marker on the asset or checklist.'}</small>
      </div>}
    </div>
  );
}

function CampaignBacklogRack({ backlog, thermalBayLevel, onOpenCampaign }: { backlog: Array<{ runNumber: number; candidate: string; missionId: CampaignMissionId }>; thermalBayLevel: number; onOpenCampaign: () => void }) {
  const missionColors: Record<CampaignMissionId, string> = { purity: '#4dd5ed', 'low-energy': '#78bf89', throughput: '#9b91df' };
  const thermalMinutes = backlog.reduce((total, item) => total + getCampaignSpec(item.candidate).thermalMinutes, 0);
  const congested = thermalMinutes > (thermalBayLevel >= 2 ? 720 : 360);
  return <group position={[-6.65, 0.04, 4.65]} rotation={[0, Math.PI / 2, 0]} onClick={(event) => { event.stopPropagation(); onOpenCampaign(); }} onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = 'default'; }}>
    <RoundedBox args={[1.72, 0.08, 0.72]} radius={0.025} position={[0, 0.08, 0]} castShadow><meshStandardMaterial color="#45565b" metalness={0.75} roughness={0.28} /></RoundedBox>
    {[-0.79, 0.79].flatMap((x) => [-0.27, 0.27].map((z) => <mesh key={`${x}-${z}`} position={[x, 1.08, z]} castShadow><boxGeometry args={[0.055, 2.02, 0.055]} /><meshStandardMaterial color="#687a7f" metalness={0.88} roughness={0.2} /></mesh>))}
    {[0.29, 0.86, 1.43].map((y) => <RoundedBox key={y} args={[1.65, 0.055, 0.66]} radius={0.016} position={[0, y, 0]} castShadow><meshPhysicalMaterial color="#63757a" metalness={0.84} roughness={0.24} clearcoat={0.16} /></RoundedBox>)}
    {[0, 1, 2].map((slot) => {
      const item = backlog[slot];
      const y = 0.48 + slot * 0.57;
      const color = item ? missionColors[item.missionId] : '#46565d';
      return <group key={slot} position={[0, y, 0]}>
        <RoundedBox args={[1.35, 0.3, 0.5]} radius={0.035} castShadow><meshStandardMaterial color={item ? '#26363b' : '#202b2f'} roughness={0.54} transparent opacity={item ? 1 : 0.54} /></RoundedBox>
        <mesh position={[0, 0.02, 0.256]}><planeGeometry args={[0.88, 0.13]} /><meshBasicMaterial color={item ? '#d9ddd2' : '#3c494e'} /></mesh>
        <mesh position={[-0.29, 0.02, 0.261]}><planeGeometry args={[0.19, 0.035]} /><meshBasicMaterial color={color} /></mesh>
        <mesh position={[0.18, 0.02, 0.262]}><planeGeometry args={[0.42, 0.018]} /><meshBasicMaterial color={item ? '#45545a' : '#2c373b'} /></mesh>
        {item && <StatusBeacon position={[0.57, 0.18, 0.2]} color={color} active />}
      </group>;
    })}
    <mesh position={[0, 1.83, 0.02]}><planeGeometry args={[1.55, 0.3]} /><meshBasicMaterial color="#1c3339" /></mesh>
    <mesh position={[0, 1.86, 0.026]}><planeGeometry args={[1.06, 0.035]} /><meshBasicMaterial color={congested ? '#f4b95f' : '#63c99c'} /></mesh>
    <Line points={[[ -1.05, 0.01, -0.5], [1.05, 0.01, -0.5], [1.05, 0.01, 0.5], [-1.05, 0.01, 0.5], [-1.05, 0.01, -0.5]]} color={congested ? '#d6a241' : '#5c9b87'} lineWidth={0.8} transparent opacity={0.68} />
  </group>;
}

function FacilityLighting({ mode }: { mode: LightingMode }) {
  const inspection = mode === 'inspection';
  return <>
    <color attach="background" args={[inspection ? '#171d21' : '#070b12']} />
    <fog attach="fog" args={[inspection ? '#171d21' : '#070b12', inspection ? 22 : 17, inspection ? 43 : 34]} />
    <ambientLight intensity={inspection ? 1.08 : 0.68} color={inspection ? '#e3e9e8' : '#9fb6d5'} />
    <hemisphereLight args={[inspection ? '#f4f8f5' : '#d5e8ff', inspection ? '#3c4546' : '#111722', inspection ? 1.6 : 1.08]} />
    <directionalLight
      castShadow
      position={[7, 11, 8]}
      intensity={inspection ? 3.7 : 2.7}
      color={inspection ? '#fffaf0' : '#e7f1ff'}
      shadow-mapSize-width={1536}
      shadow-mapSize-height={1536}
      shadow-camera-left={-12}
      shadow-camera-right={12}
      shadow-camera-top={10}
      shadow-camera-bottom={-10}
      shadow-bias={-0.00035}
    />
    <pointLight position={[-4, 4.5, 1]} intensity={inspection ? 8 : 24} distance={10} color="#4dd5ed" decay={2} />
    <pointLight position={[3.5, 3.4, -2]} intensity={inspection ? 5 : 18} distance={8} color="#f4b95f" decay={2} />
    <Environment key={mode} resolution={128} frames={1}>
      <Lightformer form="rect" intensity={inspection ? 5.4 : 3.2} color={inspection ? '#f5f5ed' : '#d9edff'} position={[0, 7, 1]} rotation={[Math.PI / 2, 0, 0]} scale={[11, 8, 1]} />
      <Lightformer form="rect" intensity={inspection ? 2.6 : 2.1} color={inspection ? '#dce9e7' : '#75d9ee'} position={[-8, 3, 3]} rotation={[0, Math.PI / 2, 0]} scale={[5, 3, 1]} />
      <Lightformer form="rect" intensity={inspection ? 2.2 : 1.8} color={inspection ? '#f0e4d3' : '#ffb469'} position={[6, 2, -2]} rotation={[0, -Math.PI / 2, 0]} scale={[4, 2, 1]} />
    </Environment>
  </>;
}

function CameraDirector({ mode, selectedIndex, controls }: { mode: CameraMode; selectedIndex: number; controls: React.RefObject<OrbitControlsHandle | null> }) {
  const { camera } = useThree();
  const animating = useRef(true);
  const overviewPosition = useMemo(() => new THREE.Vector3(10.5, 11.8, 19.5), []);
  const overviewTarget = useMemo(() => new THREE.Vector3(-1.55, 0.72, -0.18), []);
  const focusPosition = useMemo(() => {
    const [x, , z] = STATION_POSITIONS[selectedIndex];
    const horizontalOffset = selectedIndex % 3 === 2 ? -2.6 : 3.2;
    return new THREE.Vector3(x + horizontalOffset, 3.35, z + 5.6);
  }, [selectedIndex]);
  const focusTarget = useMemo(() => {
    const [x, , z] = STATION_POSITIONS[selectedIndex];
    return new THREE.Vector3(x + (selectedIndex === 1 ? 0.42 : 0), 1.05, z);
  }, [selectedIndex]);
  const walkPosition = useMemo(() => {
    const [x, , z] = STATION_POSITIONS[selectedIndex];
    const [offsetX, height, offsetZ] = WALK_APPROACH_OFFSETS[selectedIndex];
    return new THREE.Vector3(x + offsetX, height, z + offsetZ);
  }, [selectedIndex]);
  const walkTarget = useMemo(() => {
    const [x, , z] = STATION_POSITIONS[selectedIndex];
    return new THREE.Vector3(x, 1.28, z + 0.2);
  }, [selectedIndex]);
  useEffect(() => { animating.current = true; }, [mode, selectedIndex]);
  useFrame((_, delta) => {
    const orbit = controls.current;
    if (!orbit || !animating.current) return;
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

function getPalletJackPosition(scenarioId: ScenarioId, phase: number): [number, number, number] {
  if (scenarioId !== 'facility') return [-0.32, 0.07, 6.15];
  return phase < 2 ? [-6.2, 0.07, -0.95] : [3.58, 0.07, 3.52];
}

function AisleNavigator({ active, controls, command, scenarioId, phase }: { active: boolean; controls: React.RefObject<OrbitControlsHandle | null>; command: WalkCommand; scenarioId: ScenarioId; phase: number }) {
  const { camera } = useThree();
  const keys = useRef(new Set<string>());
  const handledCommand = useRef(0);
  useEffect(() => {
    const pressedKeys = keys.current;
    if (!active) {
      pressedKeys.clear();
      return;
    }
    const keyDown = (event: KeyboardEvent) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      pressedKeys.add(event.code);
    };
    const keyUp = (event: KeyboardEvent) => pressedKeys.delete(event.code);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    return () => {
      pressedKeys.clear();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  }, [active]);
  useFrame((_, delta) => {
    if (!active || !controls.current) return;
    const orbit = controls.current;
    const forward = orbit.target.clone().sub(camera.position);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
    forward.normalize();
    const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const movement = new THREE.Vector3();
    if (keys.current.has('KeyW') || keys.current.has('ArrowUp')) movement.add(forward);
    if (keys.current.has('KeyS') || keys.current.has('ArrowDown')) movement.sub(forward);
    if (keys.current.has('KeyD') || keys.current.has('ArrowRight')) movement.add(right);
    if (keys.current.has('KeyA') || keys.current.has('ArrowLeft')) movement.sub(right);
    let distance = Math.min(delta, 0.04) * (keys.current.has('ShiftLeft') ? 2.6 : 1.45);
    if (command.id !== handledCommand.current) {
      handledCommand.current = command.id;
      distance = 0.62;
      movement.copy(command.direction === 'forward' ? forward : command.direction === 'back' ? forward.clone().negate() : command.direction === 'right' ? right : right.clone().negate());
    }
    if (movement.lengthSq() === 0) return;
    movement.normalize().multiplyScalar(distance);
    const next = camera.position.clone().add(movement);
    next.x = THREE.MathUtils.clamp(next.x, -8.1, 4.25);
    next.z = THREE.MathUtils.clamp(next.z, -3.8, 8.75);
    const occupied = (position: THREE.Vector3) => {
      const [jackX, , jackZ] = getPalletJackPosition(scenarioId, phase);
      const station = STATION_POSITIONS.some(([stationX, , stationZ]) => Math.abs(position.x - stationX) < 1.72 && Math.abs(position.z - stationZ) < 1.58);
      const facilityProps = [
        { x: -3.95, z: 5.65, halfX: 0.98, halfZ: 0.66 },
        { x: jackX, z: jackZ, halfX: scenarioId === 'facility' && phase < 2 ? 1.18 : 0.72, halfZ: scenarioId === 'facility' && phase < 2 ? 0.72 : 1.18 },
        { x: 4.42, z: 1.58, halfX: 0.72, halfZ: 1.62 },
        { x: -8.18, z: 5.45, halfX: 0.58, halfZ: 1.42 },
      ].some((box) => Math.abs(position.x - box.x) < box.halfX && Math.abs(position.z - box.z) < box.halfZ);
      return station || facilityProps;
    };
    let resolved = next;
    if (occupied(resolved)) {
      const slideX = camera.position.clone();
      slideX.x = next.x;
      const slideZ = camera.position.clone();
      slideZ.z = next.z;
      resolved = !occupied(slideX) ? slideX : !occupied(slideZ) ? slideZ : camera.position.clone();
    }
    const applied = resolved.sub(camera.position);
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
      <boxGeometry args={[14.4, 0.14, 13.1]} />
      <meshPhysicalMaterial color={inspection ? '#30383b' : '#111924'} roughness={0.76} metalness={0.12} clearcoat={0.3} clearcoatRoughness={0.8} />
    </mesh>
    <Grid position={[-1.75, 0.012, 2.05]} args={[14.2, 13]} cellSize={0.5} cellThickness={0.38} cellColor={inspection ? '#465156' : '#26384d'} sectionSize={2} sectionThickness={0.75} sectionColor={inspection ? '#5b686e' : '#34506c'} fadeDistance={19} fadeStrength={1.6} infiniteGrid={false} />
    <mesh receiveShadow position={[-1.75, 2.45, -4.42]}>
      <boxGeometry args={[14.4, 5, 0.18]} />
      <meshStandardMaterial color={inspection ? '#566064' : '#101923'} roughness={0.68} metalness={0.18} />
    </mesh>
    <mesh receiveShadow position={[-8.86, 2.45, -0.15]}>
      <boxGeometry args={[0.18, 5, 8.7]} />
      <meshStandardMaterial color={inspection ? '#4d575b' : '#0d151f'} roughness={0.72} metalness={0.14} />
    </mesh>
    {[-5.8, -1.75, 2.3].map((x) => <group key={x} position={[x, 4.65, -4.25]}>
      <mesh castShadow><boxGeometry args={[2.7, 0.07, 0.12]} /><meshStandardMaterial color="#d7f2ff" emissive="#bdeaff" emissiveIntensity={inspection ? 2.8 : 0.7} /></mesh>
      <pointLight position={[0, -0.3, 1.2]} intensity={inspection ? 8 : 1.8} distance={6.5} color="#caeaff" decay={2} />
    </group>)}
    {[[-5.25, -1.55], [-1.75, -1.55], [1.75, -1.55], [-5.25, 2.15], [-1.75, 2.15], [1.75, 2.15], [-1.75, 5.5], [1.75, 5.5]].map(([x, z]) => <group key={`${x}-${z}`} position={[x, 4.72, z]}>
      <mesh castShadow><boxGeometry args={[2.25, 0.12, 0.72]} /><meshStandardMaterial color="#687176" metalness={0.52} roughness={0.35} /></mesh>
      <mesh position={[0, -0.07, 0]}><boxGeometry args={[2.02, 0.035, 0.56]} /><meshStandardMaterial color={inspection ? '#f4f4e9' : '#a9c2ca'} emissive={inspection ? '#fffbea' : '#a8d9e5'} emissiveIntensity={inspection ? 2.8 : 0.7} roughness={0.48} /></mesh>
      <pointLight position={[0, -0.25, 0]} intensity={inspection ? 8.5 : 1.8} distance={6.8} color={inspection ? '#fff7df' : '#c5e6ed'} decay={2} />
    </group>)}
    <mesh position={[-1.75, 0.025, 2.05]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.08, 12.7]} />
      <meshBasicMaterial color="#f4b95f" transparent opacity={0.42} />
    </mesh>
    {[-7.7, 4.15].map((x) => <mesh key={x} position={[x, 0.028, 2.05]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.05, 12.5]} /><meshBasicMaterial color="#5a708a" transparent opacity={0.42} />
    </mesh>)}
    {[-5.7, -4.9, -4.1].map((x) => <mesh key={x} position={[x, 0.03, 5.6]} rotation={[-Math.PI / 2, 0, -0.7]}><planeGeometry args={[0.09, 1.3]} /><meshBasicMaterial color="#f4b95f" transparent opacity={0.3} /></mesh>)}
    <UtilityServices />
    <FacilitySafetyInfrastructure inspection={inspection} />
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

function OperationsProps({ scenarioId, phase, inventory, onOpenInventory }: { scenarioId: ScenarioId; phase: number; inventory: { crucibles: number; liners: number; carbonTabs: number }; onOpenInventory: () => void }) {
  return <group>
    <group position={[-3.95, 0.08, 5.65]} rotation={[0, -0.12, 0]}>
      {[0.32, 1.02].map((y) => <RoundedBox key={y} args={[1.5, 0.12, 0.82]} radius={0.04} position={[0, y, 0]} castShadow><meshPhysicalMaterial color="#647481" metalness={0.8} roughness={0.25} clearcoat={0.28} /></RoundedBox>)}
      {[-0.65, 0.65].flatMap((x) => [-0.3, 0.3].map((z) => <mesh key={`${x}-${z}`} position={[x, 0.65, z]}><boxGeometry args={[0.055, 0.7, 0.055]} /><meshStandardMaterial color="#465661" metalness={0.78} /></mesh>))}
      {[-0.62, 0.62].flatMap((x) => [-0.28, 0.28].map((z) => <mesh key={`w-${x}-${z}`} position={[x, 0.12, z]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.09, 0.035, 10, 18]} /><meshStandardMaterial color="#111921" roughness={0.75} /></mesh>))}
      {[-0.42, 0, 0.42].map((x, i) => <mesh key={x} position={[x, 1.17, 0]} castShadow><cylinderGeometry args={[0.1, 0.09, 0.26, 18]} /><meshStandardMaterial color={['#d7b66e', '#90b9c3', '#c97860'][i]} roughness={0.4} /></mesh>)}
    </group>
    <PoweredPalletJack scenarioId={scenarioId} phase={phase} />
    <GasServiceBay active={scenarioId === 'facility'} accepted={scenarioId === 'facility' && phase >= 3} />
    <FurnaceQuarantineStand active={scenarioId === 'furnace'} occupied={scenarioId === 'furnace' && phase >= 2} />
    <SampleStagingRack inventory={inventory} onOpenInventory={onOpenInventory} />
  </group>;
}

function FurnaceQuarantineStand({ active, occupied }: { active: boolean; occupied: boolean }) {
  if (!active) return null;
  const color = occupied ? '#f39a62' : '#80664e';
  return <group position={[3.72, 0.045, -0.55]}>
    <RoundedBox args={[1.18, 0.055, 1.02]} radius={0.03} receiveShadow><meshStandardMaterial color="#2a2422" roughness={0.9} /></RoundedBox>
    <Line points={[[ -0.53, 0.035, -0.45 ], [ 0.53, 0.035, -0.45 ], [ 0.53, 0.035, 0.45 ], [ -0.53, 0.035, 0.45 ], [ -0.53, 0.035, -0.45 ]]} color={color} lineWidth={0.9} transparent opacity={0.8} />
    <mesh position={[0, 0.052, -0.34]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[0.72, 0.12]} /><meshBasicMaterial color={color} transparent opacity={0.42} /></mesh>
    <group position={[0.48, 0.52, -0.42]}>
      <mesh position={[0, -0.21, 0]} castShadow><boxGeometry args={[0.045, 0.48, 0.045]} /><meshStandardMaterial color="#56636a" metalness={0.75} roughness={0.26} /></mesh>
      <RoundedBox args={[0.72, 0.28, 0.055]} radius={0.025} castShadow><meshStandardMaterial color="#3b302b" metalness={0.32} roughness={0.56} /></RoundedBox>
      <mesh position={[0, 0.03, 0.031]}><planeGeometry args={[0.5, 0.035]} /><meshBasicMaterial color={color} /></mesh>
    </group>
  </group>;
}

function PoweredPalletJack({ scenarioId, phase }: { scenarioId: ScenarioId; phase: number }) {
  const initial = useRef(new THREE.Vector3(...getPalletJackPosition(scenarioId, phase)));
  const group = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(...getPalletJackPosition(scenarioId, phase)), [scenarioId, phase]);
  const active = scenarioId === 'facility' && phase < 2;
  const released = scenarioId === 'facility' && phase >= 1;
  const statusColor = active ? (released ? '#68d4ad' : '#d6a249') : '#6a7f88';
  useFrame((_, delta) => {
    if (!group.current) return;
    initial.current.x = THREE.MathUtils.damp(initial.current.x, target.x, 2.6, delta);
    initial.current.z = THREE.MathUtils.damp(initial.current.z, target.z, 2.6, delta);
    group.current.position.copy(initial.current);
  });
  return <group ref={group} rotation={[0, scenarioId === 'facility' && phase < 2 ? -Math.PI / 2 : -0.08, 0]}>
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
    <mesh position={[0.42, 0.68, 0.64]}><cylinderGeometry args={[0.045, 0.06, 0.18, 16]} /><meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={active ? 1 : 0.25} transparent opacity={0.9} /></mesh>
    {active && <pointLight position={[0.42, 0.72, 0.64]} intensity={released ? 0.8 : 0.55} distance={1.3} color={statusColor} decay={2} />}
  </group>;
}

function GasServiceBay({ active, accepted }: { active: boolean; accepted: boolean }) {
  const cylinderPositions = [-0.72, 0, 0.72];
  const serviceColor = accepted ? '#68d4ad' : active ? '#d2a24e' : '#73a6c7';
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
        <Line points={[[0, 0.036, 0], [index === 1 ? (accepted ? 0.035 : -0.015) : -0.025, 0.038, -0.045]]} color={index === 1 ? serviceColor : '#c28f4e'} lineWidth={1.2} />
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
    {active && <pointLight position={[0.2, 2.15, 0]} intensity={accepted ? 1.4 : 0.9} distance={2.1} color={serviceColor} decay={2} />}
  </group>;
}

function SampleStagingRack({ inventory, onOpenInventory }: { inventory: { crucibles: number; liners: number; carbonTabs: number }; onOpenInventory: () => void }) {
  const low = inventory.crucibles < 6 || inventory.liners < 1 || inventory.carbonTabs < 1;
  const crucibleCount = Math.min(12, inventory.crucibles);
  const linerCount = Math.min(6, inventory.liners);
  const tabCount = Math.min(6, inventory.carbonTabs);
  return <group position={[-8.18, 0.04, 5.45]} rotation={[0, Math.PI / 2, 0]} onClick={(event) => { event.stopPropagation(); onOpenInventory(); }} onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = 'default'; }}>
    {[-1.08, 1.08].flatMap((x) => [-0.24, 0.24].map((z) => <mesh key={`${x}-${z}`} position={[x, 1.18, z]} castShadow><boxGeometry args={[0.055, 2.32, 0.055]} /><meshStandardMaterial color="#69787d" metalness={0.86} roughness={0.22} /></mesh>))}
    {[0.22, 0.82, 1.42, 2.02].map((y) => <RoundedBox key={y} args={[2.28, 0.075, 0.58]} radius={0.02} position={[0, y, 0]} castShadow><meshPhysicalMaterial color="#697b80" metalness={0.83} roughness={0.24} clearcoat={0.18} /></RoundedBox>)}
    {Array.from({ length: crucibleCount }, (_, index) => { const x = -0.88 + (index % 6) * 0.35; const z = index < 6 ? -0.11 : 0.13; return <group key={`cruc-${index}`} position={[x, 0.47, z]}><mesh castShadow><cylinderGeometry args={[0.12, 0.1, 0.27, 20]} /><meshPhysicalMaterial color="#b9b19a" roughness={0.45} clearcoat={0.12} /></mesh><mesh position={[0, 0.14, 0]}><torusGeometry args={[0.095, 0.018, 10, 20]} /><meshStandardMaterial color="#d6cfbb" roughness={0.38} /></mesh></group>; })}
    {Array.from({ length: linerCount }, (_, index) => { const x = -0.78 + (index % 3) * 0.78; const z = index < 3 ? -0.11 : 0.13; return <RoundedBox key={`liner-${index}`} args={[0.58, 0.12, 0.34]} radius={0.025} position={[x, 1.08, z]} castShadow><meshPhysicalMaterial color="#9fb7b2" roughness={0.36} clearcoat={0.22} /></RoundedBox>; })}
    {Array.from({ length: tabCount }, (_, index) => <group key={`tab-${index}`} position={[-0.88 + index * 0.35, 1.7, 0]} rotation={[Math.PI / 2, 0, 0]}><mesh castShadow><cylinderGeometry args={[0.1, 0.1, 0.055, 22]} /><meshStandardMaterial color="#20282d" metalness={0.5} roughness={0.42} /></mesh><mesh position={[0, 0.03, 0]}><circleGeometry args={[0.055, 20]} /><meshBasicMaterial color="#0b0e10" /></mesh></group>)}
    {low && <group position={[0, 0.43, -0.83]}><RoundedBox args={[1.46, 0.72, 0.76]} radius={0.06} castShadow><meshStandardMaterial color="#72512b" roughness={0.62} /></RoundedBox><mesh position={[0, 0.05, 0.386]}><planeGeometry args={[0.92, 0.22]} /><meshBasicMaterial color="#d4b66e" /></mesh><mesh position={[0, 0.05, 0.39]}><planeGeometry args={[0.62, 0.03]} /><meshBasicMaterial color="#5d4725" /></mesh></group>}
    <mesh position={[0, 2.34, 0.01]}><planeGeometry args={[1.52, 0.22]} /><meshBasicMaterial color="#233b3d" /></mesh>
    <mesh position={[0, 2.34, 0.015]}><planeGeometry args={[1.08, 0.034]} /><meshBasicMaterial color={low ? '#f4b95f' : '#8cb9b3'} /></mesh>
    <StatusBeacon position={[0.98, 2.3, 0.04]} color={low ? '#f4b95f' : '#51e19a'} active />
  </group>;
}

function StationCell({ station, index, position, selected, active, toneOverride, stateOverride, showHotspots, inspected, inspectionPoints, controls, scenarioId, phase, thermalBayLevel, campaignStage, campaignRunNumber, onInspect, onFocus, onSelect }: {
  station: Station;
  index: number;
  position: [number, number, number];
  selected: boolean;
  active: boolean;
  toneOverride?: string;
  stateOverride?: string;
  showHotspots: boolean;
  inspected: string[];
  inspectionPoints: InspectionPoint[];
  controls: string[];
  scenarioId: ScenarioId;
  phase: number;
  thermalBayLevel: number;
  campaignStage: number;
  campaignRunNumber: number;
  onInspect: (label: string) => void;
  onFocus: () => void;
  onSelect: (id: string) => void;
}) {
  const tone = toneOverride ?? TONE_COLORS[station.tone];
  const [hovered, setHovered] = useState(false);
  const setCursor = (cursor: string) => { document.body.style.cursor = cursor; };
  return (
    <group
      position={position}
      onClick={(event) => { event.stopPropagation(); onSelect(station.id); }}
      onDoubleClick={(event) => { event.stopPropagation(); onSelect(station.id); onFocus(); }}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); setCursor('pointer'); }}
      onPointerOut={() => { setHovered(false); setCursor('default'); }}
    >
      <RoundedBox args={[3.08, index === 3 || index === 4 ? 0.09 : 0.055, 2.72]} radius={0.045} smoothness={3} position={[0, index === 3 || index === 4 ? 0.045 : 0.028, 0]} receiveShadow>
        <meshPhysicalMaterial color={index === 3 || index === 4 ? '#27323b' : '#18212a'} emissive={selected ? '#16404b' : '#000000'} emissiveIntensity={selected ? 0.08 : 0} roughness={0.72} metalness={0.14} clearcoat={0.12} />
      </RoundedBox>
      <Line points={[[-1.54, 0.082, -1.36], [1.54, 0.082, -1.36], [1.54, 0.082, 1.36], [-1.54, 0.082, 1.36], [-1.54, 0.082, -1.36]]} color={selected ? '#4dd5ed' : tone} lineWidth={selected ? 1.05 : 0.55} transparent opacity={selected ? 0.48 : 0.12} />
      {[-1.36, 1.36].flatMap((x) => [-1.18, 1.18].map((z) => <mesh key={`${x}-${z}`} position={[x, 0.09, z]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.035, 0.055, 16]} /><meshStandardMaterial color="#687681" metalness={0.78} roughness={0.26} /></mesh>))}
      <Equipment index={index} active={active} tone={tone} focused={showHotspots} controls={controls} scenarioId={scenarioId} phase={phase} thermalBayLevel={thermalBayLevel} campaignStage={campaignStage} campaignRunNumber={campaignRunNumber} />
      {showHotspots && <InspectionHotspots points={inspectionPoints} tone={tone} inspected={inspected} onInspect={onInspect} />}
      <StatusBeacon position={[1.32, 0.34, 1.08]} color={tone} active={active || selected} />
      <ControlProofLights count={controls.length} />
      {(selected || hovered) && <Html center position={[index === 3 ? 0.5 : index === 2 ? -0.38 : 0, index < 3 ? 2.98 : 2.72, index < 3 ? -0.2 : 0.2]} distanceFactor={10.5} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`station-3d-label ${selected ? 'selected' : ''}`} style={{ '--station-tone': tone } as React.CSSProperties}>
          <span>{station.id}</span><b>{station.name}</b><i>{stateOverride ?? station.state}</i>
        </div>
      </Html>}
    </group>
  );
}

function Equipment({ index, active, tone, focused, controls, scenarioId, phase, thermalBayLevel, campaignStage, campaignRunNumber }: { index: number; active: boolean; tone: string; focused: boolean; controls: string[]; scenarioId: ScenarioId; phase: number; thermalBayLevel: number; campaignStage: number; campaignRunNumber: number }) {
  if (index === 0) return <PowderPrep controls={controls} />;
  if (index === 1) return <RobotCell active={active} focused={focused} controls={controls} campaignStage={scenarioId === 'xrd' ? campaignStage : 0} campaignRunNumber={campaignRunNumber} />;
  if (index === 2) return <Furnace active={active} controls={controls} scenarioId={scenarioId} phase={phase} thermalBayLevel={thermalBayLevel} campaignStage={campaignStage} campaignRunNumber={campaignRunNumber} />;
  if (index === 3) return <Xrd active={active} controls={controls} />;
  if (index === 4) return <SemEds active={active} controls={controls} />;
  if (index === 5) return <Bet active={active} tone={tone} controls={controls} />;
  return <TgaDsc active={active} controls={controls} />;
}

type InspectionPoint = { position: [number, number, number]; label: string; observation: string; state: 'pass' | 'attention' };

const HOTSPOTS: InspectionPoint[][] = [
  [{ position: [-0.65, 1.25, 0.68], label: 'SASH', observation: '420 mm opening · airflow normal', state: 'pass' }, { position: [0.86, 0.97, 0.55], label: 'BALANCE', observation: 'level centered · zero 0.000 g', state: 'pass' }, { position: [-0.15, 0.68, 0.58], label: 'LOT', observation: 'LOT-91 · physical ID legible', state: 'pass' }],
  [{ position: [-1.32, 1.45, 1.06], label: 'GATE', observation: 'CH1 interlock closed · no bypass', state: 'pass' }, { position: [1.08, 1.48, 0.18], label: 'GRIPPER', observation: 'carrier jaws clear · tool seated', state: 'pass' }, { position: [1.05, 0.92, -0.32], label: 'HMI', observation: 'AUTO hold · route inhibited', state: 'attention' }],
  [{ position: [0.82, 1.55, 0.93], label: 'INTERLOCK', observation: 'door input closed · latch engaged', state: 'pass' }, { position: [-0.38, 0.58, 0.9], label: 'CONTROLLER', observation: 'PV 982 °C · SP 1,000 °C', state: 'pass' }, { position: [0, 1.38, 0.94], label: 'CHAMBER', observation: 'load present · hot-zone active', state: 'attention' }],
  [{ position: [-0.12, 1.23, 0.98], label: 'HOLDER', observation: 'surface clean · specimen flat', state: 'pass' }, { position: [0.9, 0.7, 0.92], label: 'HMI', observation: 'reference drift +0.17° 2θ', state: 'attention' }, { position: [-0.58, 1.7, 0.92], label: 'SHUTTER', observation: 'closed feedback TRUE', state: 'pass' }],
  [{ position: [-0.25, 1.2, 0.82], label: 'CHAMBER', observation: 'vacuum 2.1e−5 Pa · stable', state: 'pass' }, { position: [-0.25, 2.08, 0.42], label: 'COLUMN', observation: 'HV standby · aperture seated', state: 'pass' }, { position: [0.95, 1.32, 0.3], label: 'BSE / EDS', observation: 'EDS dead time 27% · detector ready', state: 'pass' }],
  [{ position: [-0.3, 1.45, 0.88], label: 'PORTS', observation: 'analysis ports mechanically locked', state: 'attention' }, { position: [0.98, 1.42, 0.34], label: 'N₂', observation: 'supply normal · regulator stable', state: 'pass' }, { position: [-0.6, 0.62, 0.84], label: 'VACUUM', observation: 'service isolation active · pump off', state: 'attention' }],
  [{ position: [-0.58, 1.12, 0.76], label: 'PAN', observation: 'matched empty-pan pair · clean', state: 'pass' }, { position: [0.82, 0.78, 0.7], label: 'PURGE', observation: 'N₂ flow stable · outlet clear', state: 'pass' }, { position: [0.08, 1.28, 0.82], label: 'FURNACE', observation: '28 °C · baseline check due', state: 'attention' }],
];

function getCampaignInspectionPoints(index: number, stage: number, selected: string, runNumber: number, thermalBayLevel = 1, resultMeasured = ''): InspectionPoint[] | null {
  const spec = getCampaignSpec(selected);
  const identity = getCampaignIdentity(runNumber);
  const operations = getCampaignOperations(runNumber, thermalBayLevel);
  if (stage === 1 && index === 0) return [
    { position: [-0.65, 1.25, 0.68], label: 'SASH', observation: '420 mm opening · LEV airflow proven', state: 'pass' },
    { position: [0.86, 0.97, 0.55], label: 'BALANCE', observation: `zero 0.000 g · ${spec.id} target ${spec.targetMass}`, state: 'pass' },
    { position: [-0.15, 0.68, 0.58], label: 'LOT', observation: `${spec.precursorLabel} match ${identity.prepSample}`, state: 'pass' },
  ];
  if (stage >= 2 && stage <= 3 && index === 1) return [
    { position: [-1.32, 1.45, 1.06], label: 'GATE', observation: 'CH1 safeguard closed · scanner field clear', state: 'pass' },
    { position: [1.08, 1.48, 0.18], label: 'GRIPPER', observation: stage === 2 ? operations.robotCondition === 'contamination' ? 'residue witness visible · cleaning proof required' : operations.robotCondition === 'grip-force' ? 'jaw-force trend low · pad seating inspection due' : 'tool face clean · ID legible · nominal state' : `witness passed · jaws seated on ${identity.carrier}`, state: stage === 2 && operations.robotConstraint ? 'attention' : 'pass' },
    { position: [1.05, 0.92, -0.32], label: 'HMI', observation: stage === 2 ? operations.robotCondition === 'contamination' ? `${identity.runId} held before dosing · motion inhibited` : operations.robotCondition === 'grip-force' ? `${identity.runId} held for force witness · setup mode` : `${identity.runId} setup mode · handshake proof pending` : `${identity.runId} dosing 6 crucibles · route active`, state: stage === 2 && operations.robotConstraint ? 'attention' : 'pass' },
  ];
  if (stage === 5 && index === 2 && operations.furnaceCondition === 'door-seal') return [
    { position: [0, 1.78, 0.94], label: 'GASKET', observation: `upper-edge witness ${operations.furnaceResult} · hot-zone uniformity not proven`, state: 'attention' },
    { position: [0.82, 1.55, 0.93], label: 'LATCH', observation: 'compression handle misaligned · mechanical adjustment required', state: 'attention' },
    { position: [-0.38, 0.58, 0.9], label: 'DOOR CHAIN', observation: 'closed input TRUE · switch state is not a seal-uniformity proof', state: 'attention' },
  ];
  if (stage === 5 && index === 2 && operations.furnaceCondition === 'thermocouple-drift') return [
    { position: [0, 1.38, 0.94], label: 'WITNESS TC', observation: `${operations.furnaceResult} · independent witness correction required`, state: 'attention' },
    { position: [-0.38, 0.58, 0.9], label: 'CONTROLLER', observation: 'primary PV stable · cannot substitute for biased witness', state: 'attention' },
    { position: [0.82, 1.55, 0.93], label: 'OVERTEMP', observation: 'independent trip proof required before thermal start', state: 'attention' },
  ];
  if (stage >= 4 && stage <= 5 && index === 2) return [
    { position: [0.82, 1.55, 0.93], label: 'INTERLOCK', observation: stage === 4 ? `door closed · ${operations.activeFurnaceRun} cycle owns chamber` : operations.furnaceCondition === 'door-seal' ? 'door chain closed · latch compression witness inconsistent' : `door chain closed · ${spec.profile} start held`, state: stage === 5 && operations.furnaceCondition === 'door-seal' ? 'attention' : 'pass' },
    { position: [-0.38, 0.58, 0.9], label: 'CONTROLLER', observation: stage === 4 ? `${operations.activeFurnaceRun} in chamber A · ${operations.furnaceLane} ${operations.queueMinutes} min` : operations.furnaceCondition === 'thermocouple-drift' ? `${operations.furnaceResult} · qualified offset proof required` : operations.furnaceCondition === 'door-seal' ? `${operations.furnaceResult} · edge loss above start limit` : `${operations.furnaceResult} · controller agreement nominal`, state: stage === 4 || stage === 5 && operations.furnaceConstraint ? 'attention' : 'pass' },
    { position: stage === 4 ? [0, 0.42, 1.04] : [0, 1.38, 0.94], label: 'CARRIER', observation: stage === 4 ? thermalBayLevel >= 2 ? `${identity.carrier} assigned chamber B · readiness proof pending` : `${identity.carrier} parked at marked queue stand · seal intact` : `${identity.carrier} loaded · ${spec.profile} not started`, state: stage === 4 || stage === 5 && operations.furnaceConstraint ? 'attention' : 'pass' },
  ];
  if (stage >= 6 && stage <= 7 && index === 3) return [
    { position: [-0.12, 1.23, 0.98], label: 'HOLDER', observation: stage === 6 ? operations.referenceCondition === 'age-due' ? `NIST Si reference seated · ${identity.thermalSample} held` : operations.referenceCondition === 'trend-review' ? `NIST Si staged · ${identity.thermalSample} queued behind trend check` : `${identity.thermalSample} flat · current control linked` : `${identity.thermalSample} flat · reference accepted`, state: 'pass' },
    { position: [0.9, 0.7, 0.92], label: 'HMI', observation: stage === 6 ? operations.referenceCondition === 'age-due' ? `${operations.referenceAgeHours} h since reference · specimen release inhibited` : operations.referenceCondition === 'trend-review' ? `${operations.referenceAgeHours} h control · position trend confirmation due` : `${operations.referenceAgeHours} h control · within governed window` : `${operations.referenceResult} · ${resultMeasured || spec.measured}% target phase`, state: stage === 6 && operations.referenceCondition !== 'current' ? 'attention' : 'pass' },
    { position: [-0.58, 1.7, 0.92], label: 'SHUTTER', observation: 'closed feedback TRUE · radiation chain healthy', state: 'pass' },
  ];
  if (stage >= 8 && index === 4) return [
    { position: [-0.25, 1.2, 0.82], label: 'CHAMBER', observation: `${identity.thermalSample} on STUB-${identity.suffix} · clearance proven`, state: 'pass' },
    { position: [-0.25, 2.08, 0.42], label: 'COLUMN', observation: 'BSE 15 kV · working distance 9.8 mm · aperture seated', state: 'pass' },
    { position: [0.95, 1.32, 0.3], label: 'BSE / EDS', observation: stage === 8 ? 'coverage 0 / 4 · representative map required' : `4 fields + map · ${spec.id === 'D-08' ? 'Ti-rich cores' : 'Ca-rich secondary grains'}`, state: stage === 8 ? 'attention' : 'pass' },
  ];
  return null;
}

function getInspectionPoints(index: number, scenarioId: ScenarioId, phase: number, campaignStage = 0, campaignSelected = 'C-42', campaignRunNumber = 42, campaignThermalBayLevel = 1, campaignResultMeasured = ''): InspectionPoint[] {
  const campaignPoints = getCampaignInspectionPoints(index, campaignStage, campaignSelected, campaignRunNumber, campaignThermalBayLevel, campaignResultMeasured);
  if (campaignPoints) return campaignPoints;
  if (scenarioId === 'xrd' && index === 3 && phase >= 1) return [
    { position: [-0.12, 1.23, 0.98], label: 'HOLDER', observation: phase >= 4 ? 'run holder clear · specimen record retained' : 'NIST Si seated · surface clean', state: 'pass' },
    { position: [0.9, 0.7, 0.92], label: 'HMI', observation: phase >= 4 ? 'CA-TI-031 complete · anomaly review open' : 'current reference +0.02° 2θ · in control', state: phase >= 4 ? 'attention' : 'pass' },
    { position: [-0.58, 1.7, 0.92], label: 'SHUTTER', observation: 'closed feedback TRUE · interlock chain healthy', state: 'pass' },
  ];
  if (scenarioId === 'xrd' && index === 1 && phase >= 2) return [
    { position: [-1.32, 1.45, 1.06], label: 'GATE', observation: 'CH1 interlock closed · route authorized', state: 'pass' },
    { position: [1.08, 1.48, 0.18], label: 'GRIPPER', observation: phase === 3 ? 'BC-184 seated · transfer in progress' : 'jaws clear · BC-184 handoff retained', state: 'pass' },
    { position: [1.05, 0.92, -0.32], label: 'HMI', observation: phase === 3 ? 'AUTO route active · 5 eligible specimens' : 'route complete · quarantined specimen excluded', state: 'pass' },
  ];
  if (scenarioId === 'xrd' && index === 4 && phase >= 5) return [
    { position: [-0.25, 1.2, 0.82], label: 'CHAMBER', observation: 'SPEC-184-03 loaded · vacuum stable', state: 'pass' },
    { position: [-0.25, 2.08, 0.42], label: 'COLUMN', observation: 'BSE conditions retained · working distance linked', state: 'pass' },
    { position: [0.95, 1.32, 0.3], label: 'BSE / EDS', observation: phase >= 6 ? '4 fields + EDS map retained' : 'field 01 inclusion · coverage incomplete', state: phase >= 6 ? 'pass' : 'attention' },
  ];
  if ((scenarioId === 'bet' || scenarioId === 'facility') && index === 5) {
    if (scenarioId === 'bet' && phase === 0) return HOTSPOTS[index];
    const analyzing = scenarioId === 'bet' && phase === 3;
    const resultReview = scenarioId === 'bet' && phase >= 4;
    const serviceAccepted = scenarioId === 'facility' && phase >= 3;
    const facilityReceivingHold = scenarioId === 'facility' && phase < 2;
    const facilityUtilityHold = scenarioId === 'facility' && phase === 2;
    return [
      { position: [-0.3, 1.45, 0.88], label: 'PORTS', observation: analyzing ? 'analysis ports engaged · ADS-77 batch active' : resultReview ? 'ALU-21 run complete · ports isolated' : serviceAccepted ? 'analysis boundary released · reference staged' : facilityReceivingHold ? 'sample ports isolated · receiving release pending' : facilityUtilityHold ? 'ports isolated · GAS-41 proof pending' : 'ports available · tube eligibility gate active', state: facilityReceivingHold || facilityUtilityHold ? 'attention' : 'pass' },
      { position: [0.98, 1.42, 0.34], label: 'N₂', observation: serviceAccepted ? 'GAS-41 N₂ 5.0 · certificate + tag linked' : facilityUtilityHold ? 'GAS-41 connected · identity + boundary unproven' : facilityReceivingHold ? 'service changeover staged · analyzer isolated' : 'N₂ supply verified · regulator stable', state: facilityReceivingHold || facilityUtilityHold ? 'attention' : 'pass' },
      { position: [-0.6, 0.62, 0.84], label: 'VACUUM', observation: resultReview ? 'native isotherm retained · low control under review' : serviceAccepted ? 'leak 0.7 µbar·L/s · accepted' : facilityReceivingHold ? 'receiving bay clear · analyzer isolation active' : facilityUtilityHold ? 'automated leak check due · release held' : 'blank/leak acceptance retained · pump ready', state: resultReview || facilityReceivingHold || facilityUtilityHold ? 'attention' : 'pass' },
    ];
  }
  if (scenarioId === 'tga' && index === 6) {
    if (phase === 0) return HOTSPOTS[index];
    return [
      { position: [-0.58, 1.12, 0.76], label: 'PAN', observation: phase === 1 ? 'mixed Pt/Al pair · association held' : phase === 2 ? 'PANSET-14 Pt/Pt · blank pending' : 'PANSET-14 linked · specimen position retained', state: phase === 1 ? 'attention' : 'pass' },
      { position: [0.82, 0.78, 0.7], label: 'PURGE', observation: phase >= 4 ? 'transient at 412.5 °C · review required' : 'N₂ 60 mL/min · stable trend retained', state: phase >= 4 ? 'attention' : 'pass' },
      { position: [0.08, 1.28, 0.82], label: 'FURNACE', observation: phase === 2 ? '28 °C · paired-pan blank ready' : phase === 3 ? 'THM-208 active · LOT-91-T at 64%' : phase >= 4 ? 'run complete · coupled channels retained' : 'method hold · baseline failure retained', state: phase >= 4 ? 'attention' : 'pass' },
    ];
  }
  if (scenarioId === 'facility' && index === 0) return [
    { position: [-0.65, 1.25, 0.68], label: 'SASH', observation: 'prep enclosure clear · dry-powder boundary normal', state: 'pass' },
    { position: [0.86, 0.97, 0.55], label: 'BALANCE', observation: 'gross load 184 kg · move ticket reconciled', state: phase === 0 ? 'attention' : 'pass' },
    { position: [-0.15, 0.68, 0.58], label: 'LOT', observation: phase === 0 ? 'two totes present · target identity unresolved' : 'LOT-3024-A physical ID + departure scan linked', state: phase === 0 ? 'attention' : 'pass' },
  ];
  if (scenarioId === 'furnace' && index === 1) return [
    { position: [-1.32, 1.45, 1.06], label: 'GATE', observation: phase >= 2 ? 'recovery boundary clear · safeguard ready' : 'cell held · motion inhibited', state: phase >= 2 ? 'pass' : 'attention' },
    { position: [1.08, 1.48, 0.18], label: 'GRIPPER', observation: 'gripper empty · BC-207 disposition retained', state: 'pass' },
    { position: [1.05, 0.92, -0.32], label: 'HMI', observation: phase >= 3 ? 'recovery handshake complete · robot parked' : phase >= 2 ? 'recovery mode armed · dry cycle pending' : 'digital transfer state conflicts with furnace occupancy', state: phase >= 2 ? 'pass' : 'attention' },
  ];
  if (index !== 2 || scenarioId !== 'furnace') return HOTSPOTS[index];
  if (phase >= 3) return [
    { position: [0.82, 1.55, 0.93], label: 'INTERLOCK', observation: 'access loop closed · dry-cycle proof linked', state: 'pass' },
    { position: [-0.38, 0.58, 0.9], label: 'CONTROLLER', observation: 'recovery sequence complete · I-204 retained', state: 'pass' },
    { position: [0, 1.38, 0.94], label: 'CHAMBER', observation: 'empty · BC-207 at quarantine stand', state: 'pass' },
  ];
  if (phase >= 2) return [
    { position: [0.82, 1.55, 0.93], label: 'INTERLOCK', observation: 'access loop ready · coordinated proof pending', state: 'attention' },
    { position: [-0.38, 0.58, 0.9], label: 'CONTROLLER', observation: 'recovery mode armed · I-204 retained', state: 'pass' },
    { position: [0, 1.38, 0.94], label: 'CHAMBER', observation: 'empty · BC-207 physically quarantined', state: 'pass' },
  ];
  return [
    { position: [0.82, 1.55, 0.93], label: 'INTERLOCK', observation: 'I-204 active · reset inhibited', state: 'attention' },
    { position: [-0.38, 0.58, 0.9], label: 'CONTROLLER', observation: 'cycle interrupted at 742 °C · trace held', state: 'attention' },
    { position: [0, 1.38, 0.94], label: 'CHAMBER', observation: 'BC-207 present · thermal history interrupted', state: 'attention' },
  ];
}

function InspectionHotspots({ points, tone, inspected, onInspect }: { points: InspectionPoint[]; tone: string; inspected: string[]; onInspect: (label: string) => void }) {
  return <group>{points.map((hotspot, hotspotIndex) => <Hotspot key={hotspot.label} {...hotspot} tone={tone} visited={inspected.includes(hotspot.label)} delay={hotspotIndex * 0.8} onInspect={onInspect} />)}</group>;
}

function Hotspot({ position, label, tone, visited, delay, onInspect }: { position: [number, number, number]; label: string; tone: string; visited: boolean; delay: number; onInspect: (label: string) => void }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pulse = 0.86 + Math.sin(clock.elapsedTime * 2.2 + delay) * 0.18;
    ref.current.scale.setScalar(pulse);
  });
  const color = visited ? '#51e19a' : tone;
  return <group ref={ref} position={position} onClick={(event) => { event.stopPropagation(); onInspect(label); }}>
    <mesh><sphereGeometry args={[0.045, 14, 10]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.7} /></mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.11, 0.012, 8, 28]} /><meshBasicMaterial color={color} transparent opacity={0.72} /></mesh>
    <pointLight intensity={0.65} distance={0.75} color={color} />
    <Html center position={[0, 0.22, 0]} distanceFactor={8} zIndexRange={[18, 0]} style={{ pointerEvents: 'none' }}><span className="hotspot-label" style={{ '--hotspot': color } as React.CSSProperties}>{visited ? '✓ ' : ''}{label}</span></Html>
  </group>;
}

function PowderPrep({ controls }: { controls: string[] }) {
  const flowProven = controls.includes('Prove enclosure flow');
  const balanceZeroed = controls.includes('Zero analytical balance');
  const antistaticProven = controls.includes('Confirm antistatic state');
  return <group position={[0, 0.18, 0]}>
    <LabBench position={[0, 0, 0.26]} width={2.62} />
    <mesh position={[-0.32, 2.22, -0.23]} castShadow><cylinderGeometry args={[0.18, 0.18, 0.62, 24]} /><meshStandardMaterial color="#73818a" metalness={0.85} roughness={0.27} /></mesh>
    <mesh position={[-0.32, 1.88, -0.23]}><torusGeometry args={[0.18, 0.045, 10, 28, Math.PI]} /><meshStandardMaterial color="#5d6c76" metalness={0.84} roughness={0.28} /></mesh>
    <RoundedBox args={[1.75, 1.72, 0.82]} radius={0.06} smoothness={3} position={[-0.32, 1.18, -0.22]} castShadow>
      <meshPhysicalMaterial color="#5c6975" roughness={0.25} metalness={0.8} clearcoat={0.45} />
    </RoundedBox>
    <mesh position={[-0.32, 1.18, 0.205]}>
      <planeGeometry args={[1.42, 1.25]} />
      <meshPhysicalMaterial color="#8fc6d1" transparent opacity={0.18} roughness={0.08} metalness={0.1} transmission={0.18} />
    </mesh>
    <mesh position={[-0.32, 0.56, 0.24]} castShadow><boxGeometry args={[1.5, 0.08, 0.72]} /><meshStandardMaterial color="#263542" metalness={0.55} roughness={0.32} /></mesh>
    <mesh position={[-0.32, 1.68, 0.225]}><boxGeometry args={[1.32, 0.045, 0.04]} /><meshStandardMaterial color={flowProven ? '#83e7b8' : '#d7f4ff'} emissive={flowProven ? '#2d9c68' : '#a7e9ff'} emissiveIntensity={2.2} /></mesh>
    <pointLight position={[-0.32, 1.45, 0.45]} intensity={3.2} distance={2.1} color={flowProven ? '#7ee3b4' : '#c7efff'} decay={2} />
    <RoundedBox args={[0.58, 0.42, 0.58]} radius={0.045} position={[0.86, 0.7, 0.18]} castShadow>
      <meshStandardMaterial color="#293b4c" metalness={0.45} roughness={0.4} />
    </RoundedBox>
    <mesh position={[0.86, 0.925, 0.37]} rotation={[-0.08, 0, 0]}><planeGeometry args={[0.41, 0.16]} /><meshBasicMaterial color="#07151b" /></mesh>
    <mesh position={[0.86, 0.928, 0.375]} rotation={[-0.08, 0, 0]}><planeGeometry args={[0.28, 0.025]} /><meshBasicMaterial color={balanceZeroed ? '#51e19a' : '#4dd5ed'} /></mesh>
    <mesh position={[0.86, 0.985, 0.04]} castShadow><cylinderGeometry args={[0.19, 0.21, 0.045, 28]} /><meshStandardMaterial color="#d6dfe2" metalness={0.88} roughness={0.15} /></mesh>
    <group position={[-0.28, 0.66, 0.5]}>
      <RoundedBox args={[0.46, 0.035, 0.2]} radius={0.02} castShadow><meshStandardMaterial color="#d6dde0" metalness={0.7} roughness={0.22} /></RoundedBox>
      <mesh position={[0, 0.026, 0]}><boxGeometry args={[0.35, 0.018, 0.11]} /><meshStandardMaterial color="#d7ae63" roughness={0.72} /></mesh>
      <mesh position={[0.42, 0.04, -0.02]} rotation={[0, 0, Math.PI / 2.7]} castShadow><cylinderGeometry args={[0.018, 0.018, 0.62, 12]} /><meshStandardMaterial color={antistaticProven ? '#6bcf9f' : '#b7c2c8'} emissive={antistaticProven ? '#1f6044' : '#000000'} emissiveIntensity={antistaticProven ? 0.65 : 0} metalness={0.85} roughness={0.18} /></mesh>
      {antistaticProven && <pointLight position={[0.46, 0.1, 0]} intensity={1.1} distance={0.8} color="#51e19a" decay={2} />}
    </group>
    {[-0.68, -0.32, 0.05].map((x, i) => <group key={x} position={[x, 0.67, 0.38]}>
      <mesh castShadow><cylinderGeometry args={[0.09, 0.08, 0.28, 18]} /><meshPhysicalMaterial color={['#d5b66e', '#c7795f', '#8bbaca'][i]} roughness={0.36} clearcoat={0.4} /></mesh>
      <mesh position={[0, 0.16, 0]}><cylinderGeometry args={[0.072, 0.072, 0.04, 18]} /><meshStandardMaterial color="#d6e0e5" metalness={0.62} roughness={0.2} /></mesh>
    </group>)}
  </group>;
}

function RobotCell({ active, focused, controls, campaignStage, campaignRunNumber }: { active: boolean; focused: boolean; controls: string[]; campaignStage: number; campaignRunNumber: number }) {
  const campaignOperations = getCampaignOperations(campaignRunNumber);
  const safeguardReset = controls.includes('Reset safeguarded stop') || controls.includes('Verify safeguarded stop');
  const axesHomed = controls.includes('Home transfer axes') || controls.some((operation) => ['Clean gripper tooling', 'Inspect jaw pads', 'Confirm clean tool ID'].includes(operation));
  const gripperProven = campaignStage >= 3 || controls.includes('Prove gripper state') || controls.some((operation) => ['Acquire witness coupon', 'Acquire force witness', 'Prove carrier handshake'].includes(operation));
  const robotMode = campaignStage === 2 ? campaignOperations.robotConstraint ? 'recovery' : 'transfer' : campaignStage === 3 ? 'dose' : active ? 'transfer' : 'idle';
  return <group position={[0, 0.18, 0]}>
    <SafetyCage focused={focused} reset={safeguardReset} />
    <RobotArm mode={robotMode} homed={axesHomed} gripperProven={gripperProven} />
    <RobotProcessFixture mode={robotMode} gripperProven={gripperProven} />
    <RoundedBox args={[0.72, 1.1, 0.5]} radius={0.05} position={[1.05, 0.72, -0.62]} castShadow>
      <meshStandardMaterial color="#263745" metalness={0.72} roughness={0.28} />
    </RoundedBox>
    <mesh position={[1.05, 0.86, -0.365]}><planeGeometry args={[0.48, 0.3]} /><meshBasicMaterial color="#06151a" /></mesh>
    <mesh position={[1.05, 0.89, -0.37]}><planeGeometry args={[0.34, 0.025]} /><meshBasicMaterial color={safeguardReset ? '#51e19a' : active ? '#4dd5ed' : '#6c7b8a'} /></mesh>
  </group>;
}

function SafetyCage({ focused, reset }: { focused: boolean; reset: boolean }) {
  const posts: [number, number, number][] = [[-1.35, 1.15, -1.05], [1.35, 1.15, -1.05], [-1.35, 1.15, 1.05], [1.35, 1.15, 1.05]];
  return <group>
    {posts.map((position, index) => <mesh key={index} position={position} castShadow><boxGeometry args={[0.055, 2.25, 0.055]} /><meshStandardMaterial color={reset && index === 2 ? '#51e19a' : '#c89a38'} emissive={reset && index === 2 ? '#1d6042' : '#000000'} emissiveIntensity={reset && index === 2 ? 0.55 : 0} metalness={0.55} roughness={0.34} transparent={focused} opacity={focused ? 0.78 : 1} /></mesh>)}
    {[0.55, 1.65].map((y) => <group key={y}>
      <mesh position={[0, y, -1.05]}><boxGeometry args={[2.7, 0.035, 0.035]} /><meshStandardMaterial color="#926e28" metalness={0.4} transparent={focused} opacity={focused ? 0.56 : 1} /></mesh>
      <mesh position={[0, y, 1.05]}><boxGeometry args={[2.7, 0.035, 0.035]} /><meshStandardMaterial color="#926e28" metalness={0.4} transparent={focused} opacity={focused ? 0.56 : 1} /></mesh>
    </group>)}
  </group>;
}

function RobotArm({ mode, homed, gripperProven }: { mode: 'idle' | 'recovery' | 'dose' | 'transfer'; homed: boolean; gripperProven: boolean }) {
  const base = useRef<THREE.Group>(null);
  const shoulder = useRef<THREE.Group>(null);
  const elbow = useRef<THREE.Group>(null);
  const wrist = useRef<THREE.Group>(null);
  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const slot = Math.floor(t * 0.72) % 6;
    const targetBase = mode === 'recovery' ? 0.72 : mode === 'dose' ? -0.7 + (slot % 3) * 0.34 : mode === 'transfer' ? -0.2 + Math.sin(t * 0.55) * 0.46 : homed ? 0 : -0.42;
    const targetShoulder = mode === 'recovery' ? -0.78 : mode === 'dose' ? -0.48 - Math.floor(slot / 3) * 0.08 : mode === 'transfer' ? -0.58 + Math.sin(t * 0.72) * 0.18 : homed ? -0.44 : -0.62;
    const targetElbow = mode === 'recovery' ? -1.22 : mode === 'dose' ? -1.14 + Math.sin(t * 2.3) * 0.035 : mode === 'transfer' ? -1.02 + Math.sin(t * 0.92 + 1.2) * 0.23 : homed ? -1.08 : -0.94;
    const targetWrist = mode === 'recovery' ? gripperProven ? 0 : Math.sin(t * 1.6) * 0.12 : mode === 'dose' ? Math.sin(t * 2.3) * 0.18 : mode === 'transfer' ? Math.sin(t * 1.15) * 0.7 : homed ? 0 : 0.18;
    if (base.current) base.current.rotation.y = THREE.MathUtils.damp(base.current.rotation.y, targetBase, mode === 'dose' ? 4.2 : 3.1, delta);
    if (shoulder.current) shoulder.current.rotation.z = THREE.MathUtils.damp(shoulder.current.rotation.z, targetShoulder, 3.5, delta);
    if (elbow.current) elbow.current.rotation.z = THREE.MathUtils.damp(elbow.current.rotation.z, targetElbow, 3.8, delta);
    if (wrist.current) wrist.current.rotation.y = THREE.MathUtils.damp(wrist.current.rotation.y, targetWrist, 4.5, delta);
  });
  return <group position={[-0.15, 0.08, 0.08]} ref={base}>
    <mesh castShadow><cylinderGeometry args={[0.46, 0.55, 0.25, 32]} /><meshPhysicalMaterial color="#53626c" metalness={0.82} roughness={0.25} clearcoat={0.32} /></mesh>
    <mesh position={[0, 0.16, 0]} castShadow><cylinderGeometry args={[0.35, 0.4, 0.14, 32]} /><meshStandardMaterial color="#202e37" metalness={0.78} roughness={0.28} /></mesh>
    <mesh position={[0, 0.245, 0]}><torusGeometry args={[0.29, 0.025, 10, 32]} /><meshStandardMaterial color="#4c8795" metalness={0.68} roughness={0.26} /></mesh>
    <group ref={shoulder} position={[0, 0.23, 0]}>
      <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.31, 0.31, 0.42, 28]} /><meshPhysicalMaterial color="#c4cbcc" metalness={0.63} roughness={0.31} clearcoat={0.28} /></mesh>
      <mesh position={[0, 0.12, 0.23]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.19, 0.19, 0.045, 24]} /><meshStandardMaterial color="#344650" metalness={0.8} roughness={0.24} /></mesh>
      <mesh position={[0, 0.12, 0.258]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.055, 0.055, 0.02, 18]} /><meshStandardMaterial color="#8b9ba1" metalness={0.9} roughness={0.16} /></mesh>
      <RoundedBox args={[0.38, 1.28, 0.38]} radius={0.18} smoothness={4} position={[0, 0.75, 0]} castShadow>
        <meshPhysicalMaterial color="#b8c1c3" metalness={0.66} roughness={0.28} clearcoat={0.32} />
      </RoundedBox>
      <Line points={[[0.23, 0.25, -0.16], [0.23, 1.18, -0.16], [0.12, 1.32, -0.16]]} color="#273740" lineWidth={1.6} />
      <group ref={elbow} position={[0, 1.39, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.28, 0.28, 0.38, 28]} /><meshStandardMaterial color="#40525e" metalness={0.8} roughness={0.24} /></mesh>
        <mesh position={[0, 0, 0.21]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.2, 0.027, 10, 28]} /><meshStandardMaterial color="#6e828b" metalness={0.84} roughness={0.2} /></mesh>
        <RoundedBox args={[0.3, 1.05, 0.3]} radius={0.14} smoothness={4} position={[0, 0.61, 0]} castShadow>
          <meshPhysicalMaterial color="#c6cdce" metalness={0.68} roughness={0.26} clearcoat={0.32} />
        </RoundedBox>
        <Line points={[[0.18, 0.16, -0.12], [0.18, 1.0, -0.12], [0.08, 1.1, -0.12]]} color="#253740" lineWidth={1.45} />
        <group ref={wrist} position={[0, 1.18, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.2, 0.22, 0.28, 24]} /><meshStandardMaterial color="#435a65" metalness={0.78} roughness={0.24} /></mesh>
          <mesh position={[0, 0.15, 0]} castShadow><cylinderGeometry args={[0.13, 0.16, 0.22, 22]} /><meshPhysicalMaterial color="#aeb9bc" metalness={0.72} roughness={0.24} clearcoat={0.24} /></mesh>
          <mesh position={[0, 0.27, 0]}><cylinderGeometry args={[0.16, 0.16, 0.045, 22]} /><meshStandardMaterial color="#263841" metalness={0.83} roughness={0.2} /></mesh>
          <mesh position={[0, 0.3, 0]} castShadow><boxGeometry args={[0.34, 0.16, 0.25]} /><meshStandardMaterial color="#26343d" metalness={0.76} roughness={0.3} /></mesh>
          {[-0.12, 0.12].map((x) => <group key={x} position={[x + (gripperProven ? -Math.sign(x) * 0.025 : 0), 0.52, 0]}>
            <mesh castShadow><boxGeometry args={[0.065, 0.38, 0.1]} /><meshStandardMaterial color="#151f26" metalness={0.72} roughness={0.32} /></mesh>
            <mesh position={[-Math.sign(x) * 0.025, 0.17, 0]}><boxGeometry args={[0.11, 0.05, 0.12]} /><meshStandardMaterial color="#65747b" metalness={0.82} roughness={0.22} /></mesh>
          </group>)}
          <mesh position={[0, 0.3, 0.13]}><circleGeometry args={[0.035, 18]} /><meshStandardMaterial color={gripperProven || mode === 'dose' || mode === 'transfer' ? '#51e19a' : mode === 'recovery' ? '#f4b95f' : '#4f6670'} emissive={gripperProven || mode === 'dose' || mode === 'transfer' ? '#24744f' : mode === 'recovery' ? '#6b451c' : '#132029'} emissiveIntensity={gripperProven ? 1.1 : mode === 'idle' ? 0.12 : 0.6} /></mesh>
        </group>
      </group>
    </group>
  </group>;
}

function RobotProcessFixture({ mode, gripperProven }: { mode: 'idle' | 'recovery' | 'dose' | 'transfer'; gripperProven: boolean }) {
  const doseMarker = useRef<THREE.Group>(null);
  const powderMaterials = useRef<Array<THREE.MeshStandardMaterial | null>>([]);
  const slots: [number, number, number][] = [[-0.34, 0, -0.21], [0, 0, -0.21], [0.34, 0, -0.21], [-0.34, 0, 0.21], [0, 0, 0.21], [0.34, 0, 0.21]];
  useFrame(({ clock }, delta) => {
    if (!doseMarker.current) return;
    const activeSlot = Math.floor(clock.elapsedTime * 0.72) % slots.length;
    const target = slots[activeSlot];
    doseMarker.current.position.x = THREE.MathUtils.damp(doseMarker.current.position.x, target[0], 5, delta);
    doseMarker.current.position.z = THREE.MathUtils.damp(doseMarker.current.position.z, target[2], 5, delta);
    powderMaterials.current.forEach((material, index) => material?.color.set(index <= activeSlot ? '#c79652' : '#403930'));
  });
  return <group>
    <group position={[-0.86, 0.3, 0.58]}>
      <RoundedBox args={[1.18, 0.1, 0.82]} radius={0.04} castShadow><meshStandardMaterial color="#4c5960" metalness={0.72} roughness={0.3} /></RoundedBox>
      {slots.map(([x, , z], index) => <group key={`${x}-${z}`} position={[x, 0.12, z]}><mesh castShadow><cylinderGeometry args={[0.105, 0.09, 0.18, 20]} /><meshPhysicalMaterial color="#c8c1ad" roughness={0.46} clearcoat={0.1} /></mesh><mesh position={[0, 0.1, 0]}><torusGeometry args={[0.083, 0.014, 8, 20]} /><meshStandardMaterial color="#e0dac6" roughness={0.38} /></mesh>{mode === 'dose' && <mesh position={[0, 0.105, 0]}><circleGeometry args={[0.065, 18]} /><meshStandardMaterial ref={(material) => { powderMaterials.current[index] = material; }} color="#403930" roughness={0.72} /></mesh>}</group>)}
      {mode === 'dose' && <group ref={doseMarker} position={[slots[0][0], 0.5, slots[0][2]]}><mesh><cylinderGeometry args={[0.018, 0.035, 0.48, 12]} /><meshBasicMaterial color="#dfb56b" transparent opacity={0.72} /></mesh><pointLight intensity={0.45} distance={0.75} color="#f4b95f" /></group>}
    </group>
    <group position={[0.84, 0.31, 0.62]}>
      <RoundedBox args={[0.68, 0.12, 0.64]} radius={0.04} castShadow><meshStandardMaterial color="#34434b" metalness={0.72} roughness={0.32} /></RoundedBox>
      <mesh position={[0, 0.095, 0]}><cylinderGeometry args={[0.19, 0.19, 0.045, 24]} /><meshStandardMaterial color={mode === 'recovery' ? gripperProven ? '#3d8e6d' : '#8c6031' : '#4f626a'} emissive={mode === 'recovery' ? gripperProven ? '#174d38' : '#5a3517' : '#000000'} emissiveIntensity={mode === 'recovery' ? 0.75 : 0} roughness={0.46} /></mesh>
      <mesh position={[0, 0.13, 0]}><circleGeometry args={[0.11, 22]} /><meshBasicMaterial color={gripperProven ? '#77d9aa' : mode === 'recovery' ? '#d7a35a' : '#788a8f'} /></mesh>
      <mesh position={[0, 0.08, 0.33]}><planeGeometry args={[0.44, 0.08]} /><meshBasicMaterial color={mode === 'recovery' ? gripperProven ? '#51e19a' : '#f4b95f' : '#617985'} /></mesh>
    </group>
  </group>;
}

function Furnace({ active, controls, scenarioId, phase, thermalBayLevel, campaignStage, campaignRunNumber }: { active: boolean; controls: string[]; scenarioId: ScenarioId; phase: number; thermalBayLevel: number; campaignStage: number; campaignRunNumber: number }) {
  const campaignOperations = getCampaignOperations(campaignRunNumber, thermalBayLevel);
  const relayRead = controls.includes('Read overtemperature relay');
  const doorVerified = controls.includes('Verify door chain');
  const emptyConfirmed = controls.includes('Confirm empty-cell state');
  const occupancyConfirmed = controls.includes('Confirm chamber occupancy');
  const recoveryScenario = scenarioId === 'furnace';
  const recovered = recoveryScenario && phase >= 3;
  const recoveryHeld = recoveryScenario && phase >= 1 && phase < 3;
  const campaignStartHeld = scenarioId === 'xrd' && campaignStage === 5;
  const tcHeld = campaignStartHeld && campaignOperations.furnaceCondition === 'thermocouple-drift';
  const sealHeld = campaignStartHeld && campaignOperations.furnaceCondition === 'door-seal';
  const offsetApplied = controls.includes('Apply qualified controller offset');
  const latchAdjusted = controls.includes('Adjust latch compression');
  const conditionHeld = recoveryHeld || campaignStartHeld;
  const chamberStateConfirmed = emptyConfirmed || occupancyConfirmed || recovered;
  const chamberColor = recovered ? '#0e1916' : conditionHeld ? '#151819' : emptyConfirmed && !active ? '#111a18' : '#28120b';
  const chamberEmissive = recovered ? '#1f6b4a' : conditionHeld ? '#5f351e' : emptyConfirmed && !active ? '#1f6b4a' : '#e3672e';
  const chamberIntensity = recovered ? 0.55 : conditionHeld ? 0.18 : emptyConfirmed && !active ? 0.4 : active ? 2.7 : recoveryScenario ? 1.35 : 0.65;
  const statusGreen = relayRead || recovered || tcHeld && offsetApplied;
  const doorGreen = doorVerified || recovered || sealHeld && latchAdjusted;
  const dualChamber = scenarioId === 'xrd' && thermalBayLevel >= 2;
  return <group position={[0, 0.18, 0]}>
    <RoundedBox args={[dualChamber ? 2.62 : 2.05, 2.22, 1.5]} radius={0.09} smoothness={4} position={[0, 1.15, 0]} castShadow>
      <meshPhysicalMaterial color="#59636a" metalness={0.9} roughness={0.2} clearcoat={0.34} />
    </RoundedBox>
    {(dualChamber ? [-0.62, 0.62] : [0]).map((chamberX, index) => <group key={chamberX}>
      <RoundedBox args={[dualChamber ? 1.08 : 1.52, 1.18, 0.12]} radius={0.05} position={[chamberX, 1.37, 0.79]}>
        <meshStandardMaterial color="#15191c" metalness={0.6} roughness={0.38} />
      </RoundedBox>
      <mesh position={[chamberX, 1.39, 0.858]}><planeGeometry args={[dualChamber ? 0.82 : 1.18, 0.76]} /><meshStandardMaterial color={index === 1 ? '#101d18' : chamberColor} emissive={index === 1 ? '#1f6b4a' : chamberEmissive} emissiveIntensity={index === 1 ? 0.55 : chamberIntensity} roughness={0.85} /></mesh>
      <pointLight position={[chamberX, 1.4, 1.1]} intensity={index === 1 ? 1.3 : recovered ? 1.5 : conditionHeld ? 0.55 : emptyConfirmed && !active ? 1.2 : active ? 12 : recoveryScenario ? 5 : 2} color={index === 1 ? '#51e19a' : recovered ? '#51e19a' : conditionHeld ? '#d6894f' : emptyConfirmed && !active ? '#51e19a' : '#ff8b3d'} distance={2.5} decay={2} />
      {dualChamber && <><mesh position={[chamberX, 1.93, 0.865]}><planeGeometry args={[0.52, 0.06]} /><meshBasicMaterial color={index === 0 ? '#f4b95f' : '#51e19a'} /></mesh><mesh position={[chamberX + 0.36, 0.84, 0.87]}><circleGeometry args={[0.035, 18]} /><meshStandardMaterial color={index === 0 ? '#f4b95f' : '#51e19a'} emissive={index === 0 ? '#704718' : '#1f6947'} emissiveIntensity={0.8} /></mesh></>}
    </group>)}
    <Line points={[[dualChamber ? -1.19 : -0.77, 0.78, 0.868], [dualChamber ? -1.19 : -0.77, 1.96, 0.868], [dualChamber ? 1.19 : 0.77, 1.96, 0.868], [dualChamber ? 1.19 : 0.77, 0.78, 0.868]]} color={sealHeld ? '#f4b95f' : '#77848a'} lineWidth={sealHeld ? 1.8 : 0.65} transparent opacity={sealHeld ? 0.95 : 0.35} />
    {sealHeld && <><Line points={[[dualChamber ? -1.19 : -0.77, 1.96, 0.884], [dualChamber ? 1.19 : 0.77, 1.96, 0.884]]} color="#ff8b3d" lineWidth={2.9} /><pointLight position={[0, 1.92, 1.03]} intensity={2.4} distance={1.2} color="#ff8b3d" decay={2} /></>}
    {[-0.44, 0.44].map((offset) => <mesh key={offset} position={[dualChamber ? -1.25 : -0.83, 1.37 + offset, 0.87]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.035, 0.035, 0.17, 14]} /><meshStandardMaterial color="#a7b0b4" metalness={0.9} roughness={0.14} /></mesh>)}
    <RoundedBox args={[0.9, 0.32, 0.09]} radius={0.035} position={[-0.34, 0.55, 0.805]}>
      <meshBasicMaterial color="#08161c" />
    </RoundedBox>
    <mesh position={[-0.42, 0.56, 0.855]}><planeGeometry args={[0.42, 0.035]} /><meshBasicMaterial color={statusGreen ? '#51e19a' : conditionHeld ? '#d6894f' : active ? '#f4b95f' : '#6a8290'} /></mesh>
    <mesh position={[-0.42, 0.62, 0.856]}><planeGeometry args={[tcHeld ? 0.29 : 0.18, 0.018]} /><meshBasicMaterial color={tcHeld ? offsetApplied ? '#51e19a' : '#f4b95f' : '#364c56'} /></mesh>
    <mesh position={[dualChamber ? 1.16 : 0.82, 1.36, 0.875]} rotation={[0, 0, sealHeld && !latchAdjusted ? -0.08 : 0]} castShadow><boxGeometry args={[0.07, 0.8, 0.08]} /><meshStandardMaterial color={doorGreen ? '#64d49f' : conditionHeld ? '#c88b58' : '#9aa3a8'} emissive={doorGreen ? '#1c6545' : conditionHeld ? '#5f321c' : '#000000'} emissiveIntensity={doorGreen || conditionHeld ? 0.55 : 0} metalness={0.9} roughness={0.16} /></mesh>
    <mesh position={[0.71, 0.83, 0.87]}><circleGeometry args={[0.045, 18]} /><meshStandardMaterial color={chamberStateConfirmed ? '#51e19a' : '#6f7e82'} emissive={chamberStateConfirmed ? '#238253' : '#192428'} emissiveIntensity={chamberStateConfirmed ? 1 : 0.2} /></mesh>
    {tcHeld && <group position={[-0.15, 1.78, 0.95]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.018, 0.018, 0.72, 12]} /><meshStandardMaterial color="#d7dee0" metalness={0.92} roughness={0.12} /></mesh>
      <mesh position={[0, 0, 0.39]}><torusGeometry args={[0.055, 0.014, 10, 24]} /><meshStandardMaterial color={offsetApplied ? '#51e19a' : '#f4b95f'} emissive={offsetApplied ? '#1f6b4a' : '#764818'} emissiveIntensity={0.85} metalness={0.65} roughness={0.2} /></mesh>
      <Line points={[[0, 0, 0.4], [-0.34, -0.12, 0.34], [-0.38, -0.66, 0.16], [-0.27, -1.08, -0.08]]} color={offsetApplied ? '#51e19a' : '#f4b95f'} lineWidth={1.15} />
      <pointLight position={[0, 0, 0.42]} intensity={offsetApplied ? 1.3 : 2.1} distance={0.8} color={offsetApplied ? '#51e19a' : '#f4b95f'} decay={2} />
    </group>}
    <group position={[0.62, 2.34, -0.1]}>
      <mesh castShadow><cylinderGeometry args={[0.18, 0.23, 0.54, 24]} /><meshStandardMaterial color="#68747a" metalness={0.88} roughness={0.2} /></mesh>
      <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.25, 0.18, 0.08, 24]} /><meshStandardMaterial color="#47545b" metalness={0.82} roughness={0.25} /></mesh>
    </group>
  </group>;
}

function Xrd({ active, controls }: { active: boolean; controls: string[] }) {
  const stage = useRef<THREE.Group>(null);
  const homed = controls.includes('Home specimen stage');
  const shutterProven = controls.includes('Prove shutter feedback');
  const referenceRead = controls.includes('Read reference position');
  useFrame((_, delta) => {
    if (stage.current) stage.current.rotation.y = THREE.MathUtils.damp(stage.current.rotation.y, homed ? 0 : 0.55, 3.2, delta);
  });
  return <group position={[0, 0.18, 0]}>
    <RoundedBox args={[2.5, 2.25, 1.55]} radius={0.18} smoothness={5} position={[0, 1.15, 0]} castShadow>
      <meshPhysicalMaterial color="#d3d8da" metalness={0.72} roughness={0.2} clearcoat={0.55} />
    </RoundedBox>
    <RoundedBox args={[1.92, 1.43, 0.08]} radius={0.12} position={[-0.12, 1.37, 0.795]}>
      <meshPhysicalMaterial color="#10212b" transparent opacity={0.72} roughness={0.06} metalness={0.1} transmission={0.18} />
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
      <mesh position={[0.46, 0.29, 0]} rotation={[0, 0, 0.7]} castShadow><boxGeometry args={[0.22, 0.48, 0.2]} /><meshStandardMaterial color="#617380" metalness={0.8} roughness={0.2} /></mesh>
      {[-0.47, 0.47].map((x) => <group key={x} position={[x, 0.08, 0.005]}>
        <mesh><cylinderGeometry args={[0.13, 0.13, 0.08, 24]} /><meshStandardMaterial color="#455b68" metalness={0.86} roughness={0.18} /></mesh>
        <mesh position={[0, 0.047, 0]}><torusGeometry args={[0.085, 0.014, 8, 24]} /><meshStandardMaterial color="#aab7bc" metalness={0.9} roughness={0.14} /></mesh>
      </group>)}
      <Line points={[[-0.48, 0.37, 0.03], [0, -0.1, 0.03], [0.47, 0.4, 0.03]]} color={shutterProven ? '#51e19a' : active ? '#f4b95f' : '#6f8591'} lineWidth={shutterProven || active ? 1.4 : 0.7} transparent opacity={shutterProven || active ? 0.92 : 0.35} />
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
  </group>;
}

function SemEds({ active, controls }: { active: boolean; controls: string[] }) {
  const vacuumEstablished = controls.includes('Establish chamber vacuum');
  const clearanceVerified = controls.includes('Verify stage clearance');
  const detectorsArmed = controls.includes('Arm BSE / EDS detectors');
  return <group position={[0, 0.18, 0]}>
    <RoundedBox args={[1.58, 0.78, 1.34]} radius={0.22} smoothness={5} position={[-0.25, 0.62, 0.06]} castShadow>
      <meshPhysicalMaterial color="#8c999f" metalness={0.9} roughness={0.18} clearcoat={0.42} />
    </RoundedBox>
    <mesh position={[-0.25, 1.12, 0.04]} castShadow><cylinderGeometry args={[0.38, 0.52, 0.45, 32]} /><meshStandardMaterial color="#657783" metalness={0.86} roughness={0.2} /></mesh>
    <mesh position={[-0.25, 1.72, 0.04]} castShadow><cylinderGeometry args={[0.17, 0.3, 0.83, 32]} /><meshPhysicalMaterial color="#d0d5d4" metalness={0.82} roughness={0.2} clearcoat={0.4} /></mesh>
    <mesh position={[-0.25, 2.24, 0.04]} castShadow><cylinderGeometry args={[0.24, 0.17, 0.28, 32]} /><meshStandardMaterial color="#6d7b82" metalness={0.85} roughness={0.2} /></mesh>
    {[1.36, 1.6, 1.94, 2.18].map((y, index) => <mesh key={y} position={[-0.25, y, 0.04]} castShadow><cylinderGeometry args={[0.22 - index * 0.018, 0.22 - index * 0.018, 0.055, 28]} /><meshStandardMaterial color={index % 2 ? '#89969b' : '#3f505a'} metalness={0.86} roughness={0.18} /></mesh>)}
    <Line points={[[-0.25, 2.04, 0.76], [-0.25, 0.65, 0.76]]} color={vacuumEstablished ? '#51e19a' : '#4dd5ed'} lineWidth={vacuumEstablished || active ? 1.3 : 0.5} transparent opacity={vacuumEstablished || active ? 0.9 : 0.25} />
    <mesh position={[-0.25, 0.62, 0.76]}><circleGeometry args={[0.22, 32]} /><meshPhysicalMaterial color="#14242d" metalness={0.55} roughness={0.16} /></mesh>
    <mesh position={[-0.25, 0.62, 0.775]}><torusGeometry args={[0.29, 0.045, 12, 40]} /><meshStandardMaterial color={vacuumEstablished ? '#51e19a' : '#71828b'} emissive={vacuumEstablished ? '#1d6645' : '#000000'} emissiveIntensity={vacuumEstablished ? 0.7 : 0} metalness={0.9} roughness={0.15} /></mesh>
    <mesh position={[-0.25, clearanceVerified ? 0.68 : 0.57, 0.788]}><circleGeometry args={[0.09, 28]} /><meshStandardMaterial color={clearanceVerified ? '#b8c7c7' : '#6b777b'} emissive={clearanceVerified ? '#245b4a' : '#000000'} emissiveIntensity={clearanceVerified ? 0.5 : 0} metalness={0.78} roughness={0.2} /></mesh>
    {Array.from({ length: 10 }, (_, index) => { const angle = index * Math.PI / 5; return <mesh key={index} position={[-0.25 + Math.cos(angle) * 0.29, 0.62 + Math.sin(angle) * 0.29, 0.824]}><cylinderGeometry args={[0.018, 0.018, 0.03, 10]} /><meshStandardMaterial color="#c5ccce" metalness={0.92} roughness={0.14} /></mesh>; })}
    <group position={[-0.82, 0.58, 0.62]} rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow><cylinderGeometry args={[0.1, 0.1, 0.34, 22]} /><meshStandardMaterial color="#52636d" metalness={0.82} roughness={0.24} /></mesh>
      <mesh position={[0, 0.21, 0]}><cylinderGeometry args={[0.15, 0.15, 0.08, 24]} /><meshStandardMaterial color="#87949a" metalness={0.9} roughness={0.16} /></mesh>
      <mesh position={[0, -0.2, 0]}><torusGeometry args={[0.11, 0.022, 10, 24]} /><meshStandardMaterial color="#aab3b6" metalness={0.9} roughness={0.14} /></mesh>
    </group>
    <group position={[0.36, 1.18, 0.48]} rotation={[0, 0, 0.96]}>
      <mesh castShadow><cylinderGeometry args={[0.1, 0.14, 0.5, 24]} /><meshPhysicalMaterial color={detectorsArmed ? '#8aa99e' : '#768894'} emissive={detectorsArmed ? '#1d5c45' : '#000000'} emissiveIntensity={detectorsArmed ? 0.55 : 0} metalness={0.86} roughness={0.2} clearcoat={0.35} /></mesh>
      <mesh position={[0, -0.3, 0]}><cylinderGeometry args={[0.06, 0.09, 0.14, 20]} /><meshStandardMaterial color="#303f49" metalness={0.8} roughness={0.22} /></mesh>
      <mesh position={[0, 0.29, 0]}><torusGeometry args={[0.12, 0.025, 10, 24]} /><meshStandardMaterial color="#a2adb1" metalness={0.9} roughness={0.16} /></mesh>
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
  </group>;
}

function Bet({ active, tone, controls }: { active: boolean; tone: string; controls: string[] }) {
  const portsIsolated = controls.includes('Isolate analysis ports');
  const leakCheckPassed = controls.includes('Run manifold leak check');
  const gasProven = controls.includes('Prove N₂ supply state');
  return <group position={[0, 0.18, 0]}>
    <RoundedBox args={[2.0, 2.2, 1.42]} radius={0.1} smoothness={4} position={[-0.28, 1.14, 0]} castShadow>
      <meshPhysicalMaterial color="#4b5b67" metalness={0.78} roughness={0.25} clearcoat={0.4} />
    </RoundedBox>
    <RoundedBox args={[1.48, 1.2, 0.08]} radius={0.05} position={[-0.28, 1.4, 0.735]}>
      <meshPhysicalMaterial color="#0b1920" transparent opacity={0.82} roughness={0.08} transmission={0.12} />
    </RoundedBox>
    {[-0.72, -0.42, -0.13, 0.16].map((x, i) => <group key={x} position={[x, 1.4, 0.8]}>
      <mesh><cylinderGeometry args={[0.045, 0.055, 0.72, 18]} /><meshPhysicalMaterial color="#c4d9de" transparent opacity={0.58} roughness={0.08} /></mesh>
      <mesh position={[0, -0.39, 0]}><sphereGeometry args={[0.095, 18, 12]} /><meshStandardMaterial color={leakCheckPassed ? '#51e19a' : active && i !== 2 ? '#b48cff' : '#6f8390'} emissive={leakCheckPassed ? '#24744f' : active && i !== 2 ? '#5f36a0' : '#000000'} emissiveIntensity={leakCheckPassed || active ? 1.3 : 0} /></mesh>
      <mesh position={[0, 0.39, 0]}><cylinderGeometry args={[0.07, 0.07, 0.06, 18]} /><meshStandardMaterial color="#b7c4c8" metalness={0.82} roughness={0.18} /></mesh>
      <mesh position={[0, 0.47, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.085, 0.016, 8, 20]} /><meshStandardMaterial color={i === 2 ? '#b7853d' : '#688796'} metalness={0.72} roughness={0.25} /></mesh>
      <mesh position={[0, -0.48, 0]}><cylinderGeometry args={[0.125, 0.145, 0.18, 22]} /><meshPhysicalMaterial color="#8a9aa2" metalness={0.7} roughness={0.22} clearcoat={0.25} /></mesh>
    </group>)}
    <mesh position={[-0.28, 1.98, 0.81]}><boxGeometry args={[1.25, 0.05, 0.06]} /><meshStandardMaterial color="#7e939e" metalness={0.8} /></mesh>
    {[-0.72, -0.42, -0.13, 0.16].map((x) => <group key={`valve-${x}`} position={[x, 2.04, 0.82]} rotation={[0, portsIsolated ? Math.PI / 2 : 0, 0]}>
      <mesh><cylinderGeometry args={[0.035, 0.035, 0.12, 14]} /><meshStandardMaterial color="#9eaaae" metalness={0.9} roughness={0.14} /></mesh>
      <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.075, 0.012, 8, 20]} /><meshStandardMaterial color={portsIsolated ? '#51e19a' : '#6b8490'} emissive={portsIsolated ? '#1c5d3f' : '#000000'} emissiveIntensity={portsIsolated ? 0.55 : 0} metalness={0.75} roughness={0.24} /></mesh>
    </group>)}
    <mesh position={[0.46, 1.55, 0.784]}><circleGeometry args={[0.18, 30]} /><meshStandardMaterial color="#101d24" metalness={0.4} roughness={0.24} /></mesh>
    <mesh position={[0.46, 1.55, 0.798]}><torusGeometry args={[0.18, 0.025, 10, 30]} /><meshStandardMaterial color="#94a3a9" metalness={0.88} roughness={0.16} /></mesh>
    <Line points={[[0.46, 1.55, 0.81], [leakCheckPassed ? 0.42 : 0.51, leakCheckPassed ? 1.64 : 1.62, 0.82]]} color={leakCheckPassed ? '#51e19a' : '#f4b95f'} lineWidth={1.2} />
    <group position={[-0.74, 0.48, 0.78]}>{[-0.12, -0.04, 0.04, 0.12].map((y) => <mesh key={y} position={[0, y, 0]}><planeGeometry args={[0.52, 0.025]} /><meshBasicMaterial color="#334753" /></mesh>)}</group>
    <mesh position={[0.98, 0.7, 0.08]} castShadow><cylinderGeometry args={[0.32, 0.36, 1.2, 28]} /><meshPhysicalMaterial color={gasProven ? '#668a7d' : '#607788'} emissive={gasProven ? '#183e31' : '#000000'} emissiveIntensity={gasProven ? 0.34 : 0} metalness={0.72} roughness={0.25} clearcoat={0.4} /></mesh>
    <mesh position={[0.98, 1.35, 0.08]}><cylinderGeometry args={[0.1, 0.1, 0.12, 18]} /><meshStandardMaterial color="#aab7bc" metalness={0.86} /></mesh>
    <group position={[0.98, 1.5, 0.08]}>
      {[-0.13, 0.13].map((x) => <group key={x} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh><cylinderGeometry args={[0.105, 0.105, 0.035, 22]} /><meshStandardMaterial color="#c2cbce" metalness={0.84} roughness={0.17} /></mesh>
        <mesh position={[0, -0.02, 0]}><circleGeometry args={[0.075, 20]} /><meshBasicMaterial color={gasProven ? '#17402f' : '#101d23'} /></mesh>
      </group>)}
      <mesh position={[0, -0.13, 0]}><boxGeometry args={[0.38, 0.12, 0.14]} /><meshStandardMaterial color="#415460" metalness={0.72} roughness={0.28} /></mesh>
    </group>
    <Line points={[[0.98, 1.39, 0.1], [0.8, 1.92, 0.1], [0.3, 1.98, 0.1]]} color={tone} lineWidth={0.8} transparent opacity={0.55} />
    <Line points={[[0.82, 1.48, 0.12], [0.55, 1.94, 0.12], [-0.28, 2.02, 0.12]]} color="#738b98" lineWidth={1.4} transparent opacity={0.72} />
  </group>;
}

function TgaDsc({ active, controls }: { active: boolean; controls: string[] }) {
  const carousel = useRef<THREE.Group>(null);
  const tareProven = controls.includes('Tare balance channel');
  const purgeProven = controls.includes('Prove purge path');
  const carouselHomed = controls.includes('Home autosampler carousel');
  useFrame((_, delta) => {
    if (carousel.current) carousel.current.rotation.y = THREE.MathUtils.damp(carousel.current.rotation.y, carouselHomed ? 0 : 0.48, 3, delta);
  });
  return <group position={[0, 0.18, 0]}>
    <LabBench position={[0, 0, 0.28]} width={2.66} />
    <RoundedBox args={[1.7, 0.76, 1.05]} radius={0.12} smoothness={4} position={[-0.15, 0.82, 0.06]} castShadow>
      <meshPhysicalMaterial color="#d0d5d6" metalness={0.76} roughness={0.21} clearcoat={0.48} />
    </RoundedBox>
    <RoundedBox args={[0.96, 0.38, 0.08]} radius={0.04} position={[0.2, 0.82, 0.59]}><meshBasicMaterial color="#07161d" /></RoundedBox>
    <mesh position={[0.2, 0.87, 0.635]}><planeGeometry args={[0.68, 0.035]} /><meshBasicMaterial color={tareProven ? '#51e19a' : active ? '#4dd5ed' : '#f4b95f'} /></mesh>
    <Line points={[[ -0.92, 0.56, 0.595], [0.62, 0.56, 0.595]]} color="#8b979b" lineWidth={0.55} transparent opacity={0.55} />
    <group position={[0.2, 0.69, 0.637]}>{[-0.18, -0.06, 0.06, 0.18].map((x, index) => <mesh key={x} position={[x, 0, 0]}><circleGeometry args={[0.022, 14]} /><meshStandardMaterial color={index === 0 ? '#51e19a' : '#6f8088'} emissive={index === 0 ? '#1d6645' : '#1a252b'} emissiveIntensity={0.5} /></mesh>)}</group>
    <group position={[-0.46, 1.83, -0.03]}>
      <RoundedBox args={[0.56, 0.72, 0.52]} radius={0.14} castShadow><meshPhysicalMaterial color="#576a75" metalness={0.82} roughness={0.2} clearcoat={0.35} /></RoundedBox>
      <mesh position={[0, 0.37, 0]}><cylinderGeometry args={[0.16, 0.19, 0.12, 26]} /><meshStandardMaterial color="#aab5b9" metalness={0.86} roughness={0.17} /></mesh>
      <mesh position={[0, 0.45, 0]}><torusGeometry args={[0.12, 0.02, 9, 26]} /><meshStandardMaterial color="#42545e" metalness={0.8} roughness={0.2} /></mesh>
    </group>
    <group position={[-0.46, 1.26, 0.14]}>
      <mesh castShadow><cylinderGeometry args={[0.3, 0.38, 0.42, 32]} /><meshPhysicalMaterial color="#71828d" metalness={0.86} roughness={0.18} clearcoat={0.35} /></mesh>
      <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.18, 0.25, 0.12, 28]} /><meshStandardMaterial color="#b8c1c4" metalness={0.86} roughness={0.16} /></mesh>
      <mesh position={[0, 0.34, 0]}><torusGeometry args={[0.14, 0.025, 10, 28]} /><meshStandardMaterial color="#293943" emissive="#c45b2e" emissiveIntensity={active ? 1.7 : 0.24} /></mesh>
      <mesh position={[0.29, 0.08, 0.04]} rotation={[0, 0, -0.38]} castShadow><boxGeometry args={[0.08, 0.32, 0.1]} /><meshStandardMaterial color="#475b65" metalness={0.78} roughness={0.24} /></mesh>
      <mesh position={[0.34, -0.09, 0.04]}><cylinderGeometry args={[0.055, 0.055, 0.08, 16]} /><meshStandardMaterial color="#b2bdc1" metalness={0.88} roughness={0.15} /></mesh>
      <pointLight position={[0, 0.38, 0]} intensity={active ? 4 : 0.6} distance={1.5} color="#ff8b4d" />
    </group>
    <group ref={carousel} position={[0.78, 1.12, 0.1]} rotation={[0, 0.48, 0]}>
      <mesh castShadow><cylinderGeometry args={[0.42, 0.42, 0.1, 36]} /><meshPhysicalMaterial color="#647681" metalness={0.82} roughness={0.2} clearcoat={0.34} /></mesh>
      {Array.from({ length: 6 }, (_, index) => { const angle = index * Math.PI / 3; return <group key={index} position={[Math.cos(angle) * 0.26, 0.09, Math.sin(angle) * 0.26]}><mesh><cylinderGeometry args={[0.055, 0.07, 0.035, 18]} /><meshStandardMaterial color="#d7dfe0" metalness={0.88} roughness={0.14} /></mesh>{index < 2 && <mesh position={[0, 0.028, 0]}><cylinderGeometry args={[0.038, 0.045, 0.012, 18]} /><meshStandardMaterial color="#cfa65d" roughness={0.45} /></mesh>}</group>; })}
      <mesh position={[0, 0.2, 0]} castShadow><cylinderGeometry args={[0.07, 0.09, 0.34, 18]} /><meshStandardMaterial color="#51646f" metalness={0.78} roughness={0.22} /></mesh>
      <mesh position={[0, 0.21, 0]}><cylinderGeometry args={[0.47, 0.47, 0.38, 40, 1, true]} /><meshPhysicalMaterial color="#a8c4cf" transparent opacity={0.14} roughness={0.06} transmission={0.18} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 0.42, 0]}><torusGeometry args={[0.45, 0.024, 10, 36]} /><meshStandardMaterial color="#778b94" metalness={0.84} roughness={0.18} /></mesh>
    </group>
    <Line points={[[0.82, 0.7, 0.55], [1.12, 1.02, 0.48], [1.12, 1.52, 0.12], [0.92, 1.66, 0.08]]} color={purgeProven ? '#51e19a' : '#6c8795'} lineWidth={purgeProven ? 1.5 : 1.1} />
    <mesh position={[1.14, 0.76, 0.22]} castShadow><cylinderGeometry args={[0.13, 0.15, 0.78, 24]} /><meshStandardMaterial color="#57717f" metalness={0.72} roughness={0.28} /></mesh>
    <mesh position={[1.14, 1.18, 0.22]}><cylinderGeometry args={[0.05, 0.05, 0.09, 18]} /><meshStandardMaterial color="#b0bec3" metalness={0.84} /></mesh>
    <group position={[1.02, 1.34, 0.22]}>
      {[-0.11, 0.11].map((x) => <group key={x} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh><cylinderGeometry args={[0.085, 0.085, 0.03, 20]} /><meshStandardMaterial color="#aeb9bd" metalness={0.84} roughness={0.17} /></mesh>
        <mesh position={[0, -0.018, 0]}><circleGeometry args={[0.058, 18]} /><meshBasicMaterial color={purgeProven ? '#153a2b' : '#0b1a20'} /></mesh>
      </group>)}
      <mesh position={[0, -0.12, 0]}><boxGeometry args={[0.34, 0.12, 0.12]} /><meshStandardMaterial color="#405560" metalness={0.7} roughness={0.27} /></mesh>
    </group>
    <group position={[-1.0, 0.68, 0.62]}>{[-0.09, 0, 0.09].map((x) => <mesh key={x} position={[x, 0, 0]}><planeGeometry args={[0.055, 0.24]} /><meshBasicMaterial color="#41545d" /></mesh>)}</group>
  </group>;
}

function LabBench({ position, width }: { position: [number, number, number]; width: number }) {
  return <group position={position}>
    <mesh position={[0, 0.42, 0]} castShadow receiveShadow><boxGeometry args={[width, 0.12, 1.15]} /><meshPhysicalMaterial color="#9aa5aa" metalness={0.84} roughness={0.23} clearcoat={0.3} /></mesh>
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
  const ref = useRef<THREE.Mesh>(null);
  const activeIndex = color === TONE_COLORS.ready || color === TONE_COLORS.run ? 0 : color === TONE_COLORS.off ? 2 : 1;
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const material = ref.current.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = active ? 1.25 + Math.sin(clock.elapsedTime * 3.2) * 0.28 : 0.52;
  });
  return <group position={position}>
    <mesh position={[0, 0.055, 0]} castShadow><cylinderGeometry args={[0.085, 0.1, 0.11, 18]} /><meshStandardMaterial color="#202d35" metalness={0.78} roughness={0.28} /></mesh>
    <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.035, 0.04, 0.12, 14]} /><meshStandardMaterial color="#52616a" metalness={0.82} roughness={0.22} /></mesh>
    {[0.235, 0.315, 0.395].map((y, index) => <group key={y} position={[0, y, 0]}>
      <mesh ref={index === activeIndex ? ref : undefined}><cylinderGeometry args={[0.062, 0.062, 0.07, 18]} />{index === activeIndex ? <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} transparent opacity={0.94} /> : <meshPhysicalMaterial color={index === 0 ? '#25483a' : index === 1 ? '#4b4124' : '#4c2828'} emissive={index === 0 ? '#173427' : index === 1 ? '#342b16' : '#351919'} emissiveIntensity={0.18} transparent opacity={0.82} roughness={0.18} />}</mesh>
      <mesh position={[0, index === 2 ? 0.043 : -0.043, 0]}><cylinderGeometry args={[0.067, 0.067, 0.012, 18]} /><meshStandardMaterial color="#27343c" metalness={0.76} roughness={0.26} /></mesh>
    </group>)}
    <mesh position={[0, 0.44, 0]}><cylinderGeometry args={[0.066, 0.058, 0.025, 18]} /><meshStandardMaterial color="#52616a" metalness={0.82} roughness={0.2} /></mesh>
  </group>;
}

function getCampaignStationIndex(stage: number) {
  if (stage <= 0) return -1;
  if (stage === 1) return 0;
  if (stage <= 3) return 1;
  if (stage <= 5) return 2;
  if (stage <= 7) return 3;
  return 4;
}

function getInspectionKey(stationId: string, stationIndex: number, campaignStage: number, selected: string, runNumber: number) {
  return getCampaignStationIndex(campaignStage) === stationIndex ? `${stationId}:RUN-${runNumber}:${selected}:S${campaignStage}` : stationId;
}

function getCampaignRoomState(stage: number, selected = 'C-42', runNumber = 42, missionId: CampaignMissionId = 'purity', resultElapsed = 0, resultMeasured = '', confirmationSource: { runNumber: number; measured: string } | null = null) {
  const spec = getCampaignSpec(selected);
  const observedSpec = resultMeasured ? { ...spec, measured: resultMeasured } : spec;
  const operations = getCampaignOperations(runNumber);
  const evaluation = evaluateCampaignMission(observedSpec, missionId, stage >= 7 && resultElapsed > 0 ? resultElapsed : undefined);
  if (stage === 1) return { station: 'PREP-01', label: `${spec.id} PREP`, color: '#4dd5ed', tone: 'running', result: '' };
  if (stage === 2 && operations.robotCondition === 'contamination') return { station: 'ROBO-02', label: 'CLEANLINESS FAULT', color: '#f4b95f', tone: 'held', result: '' };
  if (stage === 2 && operations.robotCondition === 'grip-force') return { station: 'ROBO-02', label: 'GRIP-FORCE CHECK', color: '#f4b95f', tone: 'held', result: '' };
  if (stage === 2) return { station: 'ROBO-02', label: 'CELL READINESS', color: '#4dd5ed', tone: 'running', result: '' };
  if (stage === 3) return { station: 'ROBO-02', label: `${spec.id} DOSING`, color: '#4dd5ed', tone: 'running', result: '' };
  if (stage === 4) return { station: 'FURN-04', label: 'QUEUE 01', color: '#f4b95f', tone: 'held', result: '' };
  if (stage === 5 && operations.furnaceCondition === 'thermocouple-drift') return { station: 'FURN-04', label: 'TC OFFSET HOLD', color: '#f4b95f', tone: 'held', result: '' };
  if (stage === 5 && operations.furnaceCondition === 'door-seal') return { station: 'FURN-04', label: 'DOOR SEAL HOLD', color: '#f4b95f', tone: 'held', result: '' };
  if (stage === 5) return { station: 'FURN-04', label: 'START READINESS', color: '#ff955c', tone: 'running', result: '' };
  if (stage === 6 && operations.referenceCondition === 'age-due') return { station: 'XRD-03', label: 'REFERENCE DUE', color: '#f4b95f', tone: 'held', result: '' };
  if (stage === 6 && operations.referenceCondition === 'trend-review') return { station: 'XRD-03', label: 'CONTROL TREND REVIEW', color: '#4dd5ed', tone: 'running', result: '' };
  if (stage === 6) return { station: 'XRD-03', label: 'ACQUISITION READY', color: '#4dd5ed', tone: 'running', result: '' };
  if (stage === 7) return { station: 'XRD-03', label: confirmationSource ? `${resultMeasured}% · ${evaluation.met ? 'REPEAT PASS' : 'REPEAT FAILED'}` : `${evaluation.resultText} · ${evaluation.met ? 'MISSION MET' : 'MISSION MISS'}`, color: evaluation.met ? '#51e19a' : confirmationSource ? '#f4b95f' : '#8fcf8f', tone: 'complete', result: confirmationSource ? evaluation.met ? 'ROBUSTNESS PASS' : 'NOT ROBUST' : evaluation.met ? 'MISSION MET' : 'VALID MISS' };
  if (stage === 8) return { station: 'SEM-01', label: 'REPRESENTATIVE FOLLOW-UP', color: '#b7d4d8', tone: 'running', result: 'DIAGNOSTIC RUN' };
  if (stage >= 9) return { station: 'SEM-01', label: spec.id === 'D-08' ? 'TI-RICH CORES' : 'CA-RICH SECONDARY GRAINS', color: '#51e19a', tone: 'complete', result: 'DIAGNOSIS LINKED' };
  return { station: 'PREP-01', label: 'CAMPAIGN READY', color: '#4dd5ed', tone: 'running', result: '' };
}

function CampaignMaterialRoute({ stage, selected, runNumber, missionId, resultElapsed, resultMeasured, confirmationSource }: { stage: number; selected: string; runNumber: number; missionId: CampaignMissionId; resultElapsed: number; resultMeasured: string; confirmationSource: { runNumber: number; measured: string } | null }) {
  const carrier = useRef<THREE.Group>(null);
  const current = useRef(0.02);
  const points = useMemo(() => [0, 1, 2, 3, 4].map((index) => {
    const [x, , z] = STATION_POSITIONS[index];
    return new THREE.Vector3(x, 0.26, z + 0.86);
  }), []);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.12), [points]);
  const route = useMemo(() => curve.getPoints(64), [curve]);
  const target = stage <= 1 ? 0.02 : stage <= 3 ? 0.25 : stage <= 5 ? 0.5 : stage <= 7 ? 0.75 : 0.98;
  const state = getCampaignRoomState(stage, selected, runNumber, missionId, resultElapsed, resultMeasured, confirmationSource);
  const identity = getCampaignIdentity(runNumber);
  useFrame(({ clock }, delta) => {
    current.current = THREE.MathUtils.damp(current.current, target, 3.2, delta);
    const activity = [1, 3, 5, 8].includes(stage) ? Math.sin(clock.elapsedTime * 1.7) * 0.006 : 0;
    if (carrier.current) carrier.current.position.copy(curve.getPointAt(THREE.MathUtils.clamp(current.current + activity, 0.01, 0.99)));
  });
  if (stage <= 0) return null;
  return <group>
    <Line points={route} color={state.color} lineWidth={0.72} dashed dashSize={0.14} gapSize={0.11} transparent opacity={0.58} />
    <group ref={carrier}>
      <SampleCarrier scenarioId="xrd" routeColor={state.color} />
      <pointLight position={[0, 0.18, 0]} intensity={stage === 2 || stage === 4 || stage === 6 ? 1.1 : 0.7} distance={1.1} color={state.color} />
      <Html center position={[0, 0.78, 0]} distanceFactor={9.5} zIndexRange={[18, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`campaign-carrier-label ${state.tone}`}><span>{identity.runId}</span><b>{state.label}</b></div>
      </Html>
    </group>
  </group>;
}

function MaterialRoute({ scenarioId, phase }: { scenarioId: ScenarioId; phase: number }) {
  const carrier = useRef<THREE.Group>(null);
  const current = useRef(0.03);
  const points = useMemo(() => {
    if (scenarioId === 'furnace') {
      const [furnaceX, , furnaceZ] = STATION_POSITIONS[2];
      return [new THREE.Vector3(furnaceX, 0.18, furnaceZ + 1.18), new THREE.Vector3(3.72, 0.18, -0.55)];
    }
    const indexes = scenarioId === 'xrd' ? [0, 1, 2, 3] : scenarioId === 'bet' ? [0, 1, 5] : scenarioId === 'tga' ? [0, 6] : scenarioId === 'facility' ? [0, 1, 5] : [1, 2];
    return indexes.map((index) => {
      const [x, , z] = STATION_POSITIONS[index];
      return new THREE.Vector3(x, 0.18, z + 1.18);
    });
  }, [scenarioId]);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.15), [points]);
  const route = useMemo(() => curve.getPoints(50), [curve]);
  const routeColor = scenarioId === 'bet' ? '#b48cff' : scenarioId === 'furnace' ? '#f39a62' : scenarioId === 'tga' ? '#e2a64f' : scenarioId === 'facility' ? '#68d4ad' : '#4dd5ed';
  useFrame(({ clock }, delta) => {
    const maxStep = scenarioId === 'facility' ? 2 : 4;
    const target = scenarioId === 'furnace' ? (phase < 2 ? 0.04 + phase * 0.05 : 0.96) : Math.min(0.96, 0.04 + (Math.min(phase, maxStep) / maxStep) * 0.9);
    current.current = THREE.MathUtils.damp(current.current, target, 3.8, delta);
    const breathing = phase === 3 && scenarioId !== 'furnace' ? Math.sin(clock.elapsedTime * 1.6) * 0.008 : 0;
    const point = curve.getPointAt(THREE.MathUtils.clamp(current.current + breathing, 0.02, 0.98));
    if (carrier.current) carrier.current.position.copy(point);
  });
  return <group>
    <Line points={route} color={routeColor} lineWidth={0.52} dashed dashSize={0.18} gapSize={0.16} transparent opacity={0.34} />
    <group ref={carrier}>
      <SampleCarrier scenarioId={scenarioId} routeColor={routeColor} />
      <pointLight position={[0, 0.16, 0]} intensity={0.45} distance={0.65} color={routeColor} />
    </group>
  </group>;
}

function SampleCarrier({ scenarioId, routeColor }: { scenarioId: ScenarioId; routeColor: string }) {
  if (scenarioId === 'facility') return <group rotation={[0, Math.PI / 4, 0]}>
    <RoundedBox args={[0.72, 0.08, 0.52]} radius={0.025} position={[0, 0.04, 0]} castShadow><meshStandardMaterial color="#8c7652" roughness={0.72} /></RoundedBox>
    {[-0.24, 0, 0.24].map((x) => <mesh key={x} position={[x, -0.01, 0]} castShadow><boxGeometry args={[0.13, 0.11, 0.58]} /><meshStandardMaterial color="#66533a" roughness={0.82} /></mesh>)}
    <RoundedBox args={[0.5, 0.48, 0.39]} radius={0.055} position={[0, 0.32, 0]} castShadow><meshPhysicalMaterial color="#b8bbb3" roughness={0.52} clearcoat={0.16} /></RoundedBox>
    <mesh position={[0, 0.56, 0]} castShadow><cylinderGeometry args={[0.11, 0.15, 0.09, 22]} /><meshStandardMaterial color="#475e58" metalness={0.5} roughness={0.32} /></mesh>
    <mesh position={[0, 0.3, 0.205]}><planeGeometry args={[0.28, 0.15]} /><meshBasicMaterial color="#f3f1dd" /></mesh>
    <mesh position={[0, 0.3, 0.208]}><planeGeometry args={[0.2, 0.025]} /><meshBasicMaterial color={routeColor} /></mesh>
    <CarrierTag color={routeColor} />
  </group>;

  if (scenarioId === 'tga') return <group rotation={[0, Math.PI / 4, 0]}>
    <RoundedBox args={[0.5, 0.07, 0.34]} radius={0.025} position={[0, 0.035, 0]} castShadow><meshStandardMaterial color="#4f5f67" metalness={0.78} roughness={0.26} /></RoundedBox>
    {[-0.13, 0.13].map((x, index) => <group key={x} position={[x, 0.09, 0]}>
      <mesh castShadow><cylinderGeometry args={[0.08, 0.085, 0.045, 24]} /><meshStandardMaterial color={index === 0 ? '#d2d6d5' : '#b7a27b'} metalness={index === 0 ? 0.74 : 0.28} roughness={0.3} /></mesh>
      <mesh position={[0, 0.028, 0]}><torusGeometry args={[0.067, 0.009, 8, 22]} /><meshStandardMaterial color="#e6e5df" metalness={0.6} roughness={0.24} /></mesh>
    </group>)}
    <mesh position={[0, 0.11, -0.11]} castShadow><cylinderGeometry args={[0.04, 0.045, 0.14, 16]} /><meshPhysicalMaterial color="#d4c7a0" roughness={0.42} clearcoat={0.2} /></mesh>
    <CarrierTag color={routeColor} />
  </group>;

  if (scenarioId === 'bet') return <group rotation={[0, Math.PI / 4, 0]}>
    <RoundedBox args={[0.54, 0.08, 0.38]} radius={0.025} position={[0, 0.04, 0]} castShadow><meshStandardMaterial color="#4a5d69" metalness={0.78} roughness={0.27} /></RoundedBox>
    {[-0.18, -0.06, 0.06, 0.18].map((x, index) => <group key={x} position={[x, 0.23, 0]}>
      <mesh castShadow><cylinderGeometry args={[0.025, 0.035, 0.34, 14]} /><meshPhysicalMaterial color="#bdd1d5" transparent opacity={0.7} roughness={0.08} transmission={0.12} /></mesh>
      <mesh position={[0, -0.13, 0]}><sphereGeometry args={[0.043, 14, 10]} /><meshStandardMaterial color={index === 2 ? '#7d6b7d' : '#a68b63'} roughness={0.58} /></mesh>
      <mesh position={[0, 0.185, 0]}><cylinderGeometry args={[0.035, 0.035, 0.035, 14]} /><meshStandardMaterial color="#b8c2c5" metalness={0.75} roughness={0.2} /></mesh>
    </group>)}
    <CarrierTag color={routeColor} />
  </group>;

  if (scenarioId === 'furnace') return <group rotation={[0, Math.PI / 4, 0]}>
    <RoundedBox args={[0.54, 0.07, 0.43]} radius={0.025} position={[0, 0.035, 0]} castShadow><meshStandardMaterial color="#a9a8a1" metalness={0.12} roughness={0.83} /></RoundedBox>
    {[-0.14, 0.14].flatMap((x) => [-0.105, 0.105].map((z, index) => <group key={`${x}-${z}`} position={[x, 0.105, z]}>
      <mesh castShadow><cylinderGeometry args={[0.065, 0.052, 0.13, 18]} /><meshStandardMaterial color="#dad5c8" roughness={0.78} /></mesh>
      <mesh position={[0, 0.07, 0]}><torusGeometry args={[0.052, 0.012, 8, 18]} /><meshStandardMaterial color="#ece6d8" roughness={0.75} /></mesh>
      <mesh position={[0, 0.075, 0]}><circleGeometry args={[0.038, 16]} /><meshStandardMaterial color={x > 0 && index > 0 ? '#705247' : '#9e7e61'} roughness={0.85} /></mesh>
    </group>))}
    <CarrierTag color={routeColor} />
  </group>;

  return <group rotation={[0, Math.PI / 4, 0]}>
    <RoundedBox args={[0.58, 0.08, 0.42]} radius={0.025} position={[0, 0.04, 0]} castShadow><meshPhysicalMaterial color="#6f7d84" metalness={0.84} roughness={0.22} clearcoat={0.28} /></RoundedBox>
    {[-0.17, 0, 0.17].flatMap((x) => [-0.105, 0.105].map((z, index) => <group key={`${x}-${z}`} position={[x, 0.105, z]}>
      <mesh castShadow><cylinderGeometry args={[0.055, 0.06, 0.09, 18]} /><meshStandardMaterial color="#c8d0d2" metalness={0.72} roughness={0.22} /></mesh>
      <mesh position={[0, 0.05, 0]}><circleGeometry args={[0.045, 18]} /><meshStandardMaterial color={x === 0 && index === 1 ? '#b76756' : '#d1ad69'} roughness={0.68} /></mesh>
    </group>))}
    <CarrierTag color={routeColor} />
  </group>;
}

function CarrierTag({ color }: { color: string }) {
  return <group position={[0, 0.07, 0.225]} rotation={[-Math.PI / 2, 0, 0]}>
    <mesh><planeGeometry args={[0.22, 0.07]} /><meshBasicMaterial color="#101820" /></mesh>
    <mesh position={[0, 0, 0.002]}><planeGeometry args={[0.16, 0.012]} /><meshBasicMaterial color={color} /></mesh>
  </group>;
}
