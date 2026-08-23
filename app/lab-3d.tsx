'use client';

import { ContactShadows, Environment, Grid, Html, Lightformer, Line, OrbitControls, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Station } from './sim-data';

type OrbitControlsHandle = React.ComponentRef<typeof OrbitControls>;

type ScenarioId = 'xrd' | 'bet' | 'furnace' | 'tga';
type SceneProps = {
  stations: Station[];
  selectedId: string;
  phase: number;
  scenarioId: ScenarioId;
  cameraMode: 'overview' | 'focus';
  onCameraMode: (mode: 'overview' | 'focus') => void;
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

const TONE_COLORS: Record<Station['tone'], string> = {
  ready: '#51e19a',
  hold: '#718198',
  run: '#4dd5ed',
  warn: '#f4b95f',
  off: '#586579',
};

export function Lab3D({ stations, selectedId, phase, scenarioId, cameraMode, onCameraMode, onInspectionChange, onSelect }: SceneProps) {
  const controlsRef = useRef<OrbitControlsHandle>(null);
  const [visited, setVisited] = useState<Record<string, string[]>>({});
  const [observationRecord, setObservationRecord] = useState<{ stationId: string; point: InspectionPoint } | null>(null);
  const selectedIndex = Math.max(0, stations.findIndex((station) => station.id === selectedId));
  const selectedStation = stations[selectedIndex];
  const inspected = visited[selectedId] ?? [];
  const activeObservation = cameraMode === 'focus' && observationRecord?.stationId === selectedId ? observationRecord.point : null;
  const inspect = (label: string) => {
    const point = HOTSPOTS[selectedIndex].find((hotspot) => hotspot.label === label);
    if (point) setObservationRecord({ stationId: selectedId, point });
    setVisited((current) => {
      const checks = Array.from(new Set([...(current[selectedId] ?? []), label]));
      onInspectionChange?.(selectedId, checks);
      return { ...current, [selectedId]: checks };
    });
  };
  return (
    <div className={`lab-3d camera-${cameraMode}`} aria-label="Orbitable 3D digital twin of seven materials laboratory stations">
      <Canvas
        shadows
        dpr={[1, 1.55]}
        camera={{ position: [10.5, 11.8, 19.5], fov: 50, near: 0.1, far: 90 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl, scene }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          scene.background = new THREE.Color('#070b12');
          scene.fog = new THREE.Fog('#070b12', 17, 34);
        }}
      >
        <ambientLight intensity={0.72} color="#9fb6d5" />
        <hemisphereLight args={['#d5e8ff', '#111722', 1.15]} />
        <directionalLight
          castShadow
          position={[7, 11, 8]}
          intensity={2.8}
          color="#e7f1ff"
          shadow-mapSize-width={1536}
          shadow-mapSize-height={1536}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
          shadow-bias={-0.00035}
        />
        <pointLight position={[-4, 4.5, 1]} intensity={24} distance={10} color="#4dd5ed" decay={2} />
        <pointLight position={[3.5, 3.4, -2]} intensity={18} distance={8} color="#f4b95f" decay={2} />
        <Environment resolution={128} frames={1}>
          <Lightformer form="rect" intensity={3.2} color="#d9edff" position={[0, 7, 1]} rotation={[Math.PI / 2, 0, 0]} scale={[11, 8, 1]} />
          <Lightformer form="rect" intensity={2.1} color="#75d9ee" position={[-8, 3, 3]} rotation={[0, Math.PI / 2, 0]} scale={[5, 3, 1]} />
          <Lightformer form="rect" intensity={1.8} color="#ffb469" position={[6, 2, -2]} rotation={[0, -Math.PI / 2, 0]} scale={[4, 2, 1]} />
        </Environment>

        <LabArchitecture />
        <OperationsProps />
        <MaterialRoute scenarioId={scenarioId} phase={phase} />
        {stations.map((station, index) => (cameraMode === 'overview' || selectedId === station.id) ? (
          <StationCell
            key={station.id}
            station={station}
            index={index}
            position={STATION_POSITIONS[index]}
            selected={selectedId === station.id}
            active={station.tone === 'run'}
            showHotspots={selectedId === station.id && cameraMode === 'focus'}
            inspected={visited[station.id] ?? []}
            onInspect={inspect}
            onFocus={() => onCameraMode('focus')}
            onSelect={onSelect}
          />
        ) : null)}
        <ContactShadows position={[0, 0.025, 0]} opacity={0.58} scale={22} blur={2.6} far={8} resolution={512} color="#000713" />
        <CameraDirector mode={cameraMode} selectedIndex={selectedIndex} controls={controlsRef} />
        <OrbitControls
          ref={controlsRef}
          makeDefault
          target={[-1.55, 0.72, -0.18]}
          enableDamping
          dampingFactor={0.075}
          minDistance={cameraMode === 'focus' ? 3.8 : 11}
          maxDistance={34}
          minPolarAngle={0.55}
          maxPolarAngle={1.36}
          minAzimuthAngle={-1.45}
          maxAzimuthAngle={1.25}
        />
      </Canvas>
      <nav className="scene-station-picker" aria-label="Select a lab station">
        {stations.map((station) => <button key={station.id} type="button" className={selectedId === station.id ? 'active' : ''} style={{ '--station-tone': TONE_COLORS[station.tone] } as React.CSSProperties} onClick={() => onSelect(station.id)} onDoubleClick={() => { onSelect(station.id); onCameraMode('focus'); }} aria-pressed={selectedId === station.id}><i />{station.id.replace('-0', '·')}</button>)}
      </nav>
      <div className="scene-corner scene-corner-top"><span>LIVE SPATIAL TWIN</span><b>LAB 04 · BAY A/B</b></div>
      <div className="scene-corner scene-corner-bottom"><span>DRAG</span> ORBIT <i>·</i> <span>SCROLL</span> ZOOM <i>·</i> <span>CLICK</span> INSPECT</div>
      {cameraMode === 'focus' && <div className="walkaround-panel">
        <header><div><span>PHYSICAL WALKAROUND</span><b>{selectedStation.id} · {selectedStation.name}</b></div><em>{inspected.length} / {HOTSPOTS[selectedIndex].length}</em></header>
        <div>{HOTSPOTS[selectedIndex].map((hotspot) => <button key={hotspot.label} type="button" className={inspected.includes(hotspot.label) ? 'visited' : ''} onClick={() => inspect(hotspot.label)}><i>{inspected.includes(hotspot.label) ? '✓' : '○'}</i>{hotspot.label}</button>)}</div>
        {activeObservation && <div className={`walkaround-observation ${activeObservation.state}`}><span>{activeObservation.label} OBSERVATION</span><b>{activeObservation.observation}</b><em>{activeObservation.state === 'attention' ? 'ATTENTION' : 'CAPTURED'}</em></div>}
        <small>{inspected.length === HOTSPOTS[selectedIndex].length ? 'Walkaround captured. Compare physical state with the local console.' : 'Select each marker on the asset or checklist.'}</small>
      </div>}
    </div>
  );
}

function CameraDirector({ mode, selectedIndex, controls }: { mode: 'overview' | 'focus'; selectedIndex: number; controls: React.RefObject<OrbitControlsHandle | null> }) {
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
  useEffect(() => { animating.current = true; }, [mode, selectedIndex]);
  useFrame((_, delta) => {
    const orbit = controls.current;
    if (!orbit || !animating.current) return;
    const position = mode === 'focus' ? focusPosition : overviewPosition;
    const target = mode === 'focus' ? focusTarget : overviewTarget;
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

function LabArchitecture() {
  return <group>
    <mesh receiveShadow position={[-1.75, -0.07, 2.05]}>
      <boxGeometry args={[14.4, 0.14, 13.1]} />
      <meshPhysicalMaterial color="#111924" roughness={0.76} metalness={0.12} clearcoat={0.3} clearcoatRoughness={0.8} />
    </mesh>
    <Grid position={[-1.75, 0.012, 2.05]} args={[14.2, 13]} cellSize={0.5} cellThickness={0.38} cellColor="#26384d" sectionSize={2} sectionThickness={0.75} sectionColor="#34506c" fadeDistance={19} fadeStrength={1.6} infiniteGrid={false} />
    <mesh receiveShadow position={[-1.75, 2.45, -4.42]}>
      <boxGeometry args={[14.4, 5, 0.18]} />
      <meshStandardMaterial color="#101923" roughness={0.68} metalness={0.18} />
    </mesh>
    <mesh receiveShadow position={[-8.86, 2.45, -0.15]}>
      <boxGeometry args={[0.18, 5, 8.7]} />
      <meshStandardMaterial color="#0d151f" roughness={0.72} metalness={0.14} />
    </mesh>
    {[-5.8, -1.75, 2.3].map((x) => <group key={x} position={[x, 4.65, -4.25]}>
      <mesh castShadow><boxGeometry args={[2.7, 0.07, 0.12]} /><meshStandardMaterial color="#d7f2ff" emissive="#bdeaff" emissiveIntensity={2.8} /></mesh>
      <pointLight position={[0, -0.3, 1.2]} intensity={8} distance={6.5} color="#caeaff" decay={2} />
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
      {[-0.62, 0.62].flatMap((x) => [-0.28, 0.28].map((z) => <mesh key={`w-${x}-${z}`} position={[x, 0.12, z]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.09, 0.035, 10, 18]} /><meshStandardMaterial color="#111921" roughness={0.75} /></mesh>))}
      {[-0.42, 0, 0.42].map((x, i) => <mesh key={x} position={[x, 1.17, 0]} castShadow><cylinderGeometry args={[0.1, 0.09, 0.26, 18]} /><meshStandardMaterial color={['#d7b66e', '#90b9c3', '#c97860'][i]} roughness={0.4} /></mesh>)}
    </group>
    <group position={[-0.32, 0.07, 6.15]} rotation={[0, -0.08, 0]}>
      {[-0.28, 0.28].map((x) => <RoundedBox key={x} args={[0.16, 0.1, 1.75]} radius={0.04} position={[x, 0.12, -0.25]} castShadow><meshStandardMaterial color="#d59f38" metalness={0.52} roughness={0.38} /></RoundedBox>)}
      <RoundedBox args={[0.82, 0.17, 0.52]} radius={0.06} position={[0, 0.18, 0.58]} castShadow><meshStandardMaterial color="#b78632" metalness={0.58} roughness={0.34} /></RoundedBox>
      <group position={[0, 0.32, 0.72]} rotation={[0.42, 0, 0]}>
        <mesh position={[0, 0.72, 0]} castShadow><cylinderGeometry args={[0.045, 0.045, 1.45, 14]} /><meshStandardMaterial color="#566671" metalness={0.72} roughness={0.28} /></mesh>
        <mesh position={[0, 1.45, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><torusGeometry args={[0.22, 0.045, 12, 22, Math.PI]} /><meshStandardMaterial color="#2b3942" metalness={0.62} roughness={0.35} /></mesh>
      </group>
      {[-0.37, 0.37].map((x) => <mesh key={x} position={[x, 0.12, 0.72]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.1, 0.1, 0.08, 18]} /><meshStandardMaterial color="#151d23" roughness={0.75} /></mesh>)}
    </group>
  </group>;
}

function StationCell({ station, index, position, selected, active, showHotspots, inspected, onInspect, onFocus, onSelect }: {
  station: Station;
  index: number;
  position: [number, number, number];
  selected: boolean;
  active: boolean;
  showHotspots: boolean;
  inspected: string[];
  onInspect: (label: string) => void;
  onFocus: () => void;
  onSelect: (id: string) => void;
}) {
  const tone = TONE_COLORS[station.tone];
  const setCursor = (cursor: string) => { document.body.style.cursor = cursor; };
  return (
    <group
      position={position}
      onClick={(event) => { event.stopPropagation(); onSelect(station.id); }}
      onDoubleClick={(event) => { event.stopPropagation(); onSelect(station.id); onFocus(); }}
      onPointerOver={(event) => { event.stopPropagation(); setCursor('pointer'); }}
      onPointerOut={() => setCursor('default')}
    >
      <RoundedBox args={[3.18, 0.16, 2.82]} radius={0.08} smoothness={3} position={[0, 0.08, 0]} receiveShadow>
        <meshStandardMaterial color={selected ? '#193247' : '#111b28'} emissive={selected ? '#1c91a6' : tone} emissiveIntensity={selected ? 0.25 : 0.035} roughness={0.63} metalness={0.32} />
      </RoundedBox>
      <mesh position={[0, 0.175, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.66, 1.71, 4]} />
        <meshBasicMaterial color={selected ? '#4dd5ed' : tone} transparent opacity={selected ? 0.76 : 0.18} />
      </mesh>
      <Equipment index={index} active={active} tone={tone} focused={showHotspots} />
      {showHotspots && <InspectionHotspots index={index} tone={tone} inspected={inspected} onInspect={onInspect} />}
      <StatusBeacon position={[1.32, 0.34, 1.08]} color={tone} active={active || selected} />
      <Html center position={[index === 3 ? 0.5 : index === 2 ? -0.38 : 0, index < 3 ? 2.98 : 2.72, index < 3 ? -0.2 : 0.2]} distanceFactor={10.5} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`station-3d-label ${selected ? 'selected' : ''}`} style={{ '--station-tone': tone } as React.CSSProperties}>
          <span>{station.id}</span><b>{station.name}</b><i>{station.state}</i>
        </div>
      </Html>
    </group>
  );
}

function Equipment({ index, active, tone, focused }: { index: number; active: boolean; tone: string; focused: boolean }) {
  if (index === 0) return <PowderPrep />;
  if (index === 1) return <RobotCell active={active} focused={focused} />;
  if (index === 2) return <Furnace active={active} />;
  if (index === 3) return <Xrd active={active} />;
  if (index === 4) return <SemEds active={active} />;
  if (index === 5) return <Bet active={active} tone={tone} />;
  return <TgaDsc active={active} />;
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

function InspectionHotspots({ index, tone, inspected, onInspect }: { index: number; tone: string; inspected: string[]; onInspect: (label: string) => void }) {
  return <group>{HOTSPOTS[index].map((hotspot, hotspotIndex) => <Hotspot key={hotspot.label} {...hotspot} tone={tone} visited={inspected.includes(hotspot.label)} delay={hotspotIndex * 0.8} onInspect={onInspect} />)}</group>;
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

function PowderPrep() {
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
    <mesh position={[-0.32, 1.68, 0.225]}><boxGeometry args={[1.32, 0.045, 0.04]} /><meshStandardMaterial color="#d7f4ff" emissive="#a7e9ff" emissiveIntensity={2.2} /></mesh>
    <pointLight position={[-0.32, 1.45, 0.45]} intensity={3.2} distance={2.1} color="#c7efff" decay={2} />
    <RoundedBox args={[0.58, 0.42, 0.58]} radius={0.045} position={[0.86, 0.7, 0.18]} castShadow>
      <meshStandardMaterial color="#293b4c" metalness={0.45} roughness={0.4} />
    </RoundedBox>
    <mesh position={[0.86, 0.925, 0.37]} rotation={[-0.08, 0, 0]}><planeGeometry args={[0.41, 0.16]} /><meshBasicMaterial color="#07151b" /></mesh>
    <mesh position={[0.86, 0.928, 0.375]} rotation={[-0.08, 0, 0]}><planeGeometry args={[0.28, 0.025]} /><meshBasicMaterial color="#4dd5ed" /></mesh>
    <mesh position={[0.86, 0.985, 0.04]} castShadow><cylinderGeometry args={[0.19, 0.21, 0.045, 28]} /><meshStandardMaterial color="#d6dfe2" metalness={0.88} roughness={0.15} /></mesh>
    <group position={[-0.28, 0.66, 0.5]}>
      <RoundedBox args={[0.46, 0.035, 0.2]} radius={0.02} castShadow><meshStandardMaterial color="#d6dde0" metalness={0.7} roughness={0.22} /></RoundedBox>
      <mesh position={[0, 0.026, 0]}><boxGeometry args={[0.35, 0.018, 0.11]} /><meshStandardMaterial color="#d7ae63" roughness={0.72} /></mesh>
      <mesh position={[0.42, 0.04, -0.02]} rotation={[0, 0, Math.PI / 2.7]} castShadow><cylinderGeometry args={[0.018, 0.018, 0.62, 12]} /><meshStandardMaterial color="#b7c2c8" metalness={0.85} roughness={0.18} /></mesh>
    </group>
    {[-0.68, -0.32, 0.05].map((x, i) => <group key={x} position={[x, 0.67, 0.38]}>
      <mesh castShadow><cylinderGeometry args={[0.09, 0.08, 0.28, 18]} /><meshPhysicalMaterial color={['#d5b66e', '#c7795f', '#8bbaca'][i]} roughness={0.36} clearcoat={0.4} /></mesh>
      <mesh position={[0, 0.16, 0]}><cylinderGeometry args={[0.072, 0.072, 0.04, 18]} /><meshStandardMaterial color="#d6e0e5" metalness={0.62} roughness={0.2} /></mesh>
    </group>)}
  </group>;
}

function RobotCell({ active, focused }: { active: boolean; focused: boolean }) {
  return <group position={[0, 0.18, 0]}>
    <SafetyCage focused={focused} />
    <RobotArm active={active} />
    <RoundedBox args={[0.72, 1.1, 0.5]} radius={0.05} position={[1.05, 0.72, -0.62]} castShadow>
      <meshStandardMaterial color="#263745" metalness={0.72} roughness={0.28} />
    </RoundedBox>
    <mesh position={[1.05, 0.86, -0.365]}><planeGeometry args={[0.48, 0.3]} /><meshBasicMaterial color="#06151a" /></mesh>
    <mesh position={[1.05, 0.89, -0.37]}><planeGeometry args={[0.34, 0.025]} /><meshBasicMaterial color={active ? '#51e19a' : '#6c7b8a'} /></mesh>
  </group>;
}

function SafetyCage({ focused }: { focused: boolean }) {
  const posts: [number, number, number][] = [[-1.35, 1.15, -1.05], [1.35, 1.15, -1.05], [-1.35, 1.15, 1.05], [1.35, 1.15, 1.05]];
  return <group>
    {posts.map((position, index) => <mesh key={index} position={position} castShadow><boxGeometry args={[0.055, 2.25, 0.055]} /><meshStandardMaterial color="#c89a38" metalness={0.55} roughness={0.34} transparent={focused} opacity={focused ? 0.78 : 1} /></mesh>)}
    {[0.55, 1.65].map((y) => <group key={y}>
      <mesh position={[0, y, -1.05]}><boxGeometry args={[2.7, 0.035, 0.035]} /><meshStandardMaterial color="#926e28" metalness={0.4} transparent={focused} opacity={focused ? 0.56 : 1} /></mesh>
      <mesh position={[0, y, 1.05]}><boxGeometry args={[2.7, 0.035, 0.035]} /><meshStandardMaterial color="#926e28" metalness={0.4} transparent={focused} opacity={focused ? 0.56 : 1} /></mesh>
    </group>)}
  </group>;
}

function RobotArm({ active }: { active: boolean }) {
  const base = useRef<THREE.Group>(null);
  const shoulder = useRef<THREE.Group>(null);
  const elbow = useRef<THREE.Group>(null);
  const wrist = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (base.current) base.current.rotation.y = active ? -0.2 + Math.sin(t * 0.55) * 0.46 : -0.42;
    if (shoulder.current) shoulder.current.rotation.z = active ? -0.58 + Math.sin(t * 0.72) * 0.18 : -0.62;
    if (elbow.current) elbow.current.rotation.z = active ? -1.02 + Math.sin(t * 0.92 + 1.2) * 0.23 : -0.94;
    if (wrist.current) wrist.current.rotation.y = active ? Math.sin(t * 1.15) * 0.7 : 0.18;
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
          {[-0.12, 0.12].map((x) => <group key={x} position={[x, 0.52, 0]}>
            <mesh castShadow><boxGeometry args={[0.065, 0.38, 0.1]} /><meshStandardMaterial color="#151f26" metalness={0.72} roughness={0.32} /></mesh>
            <mesh position={[-Math.sign(x) * 0.025, 0.17, 0]}><boxGeometry args={[0.11, 0.05, 0.12]} /><meshStandardMaterial color="#65747b" metalness={0.82} roughness={0.22} /></mesh>
          </group>)}
          <mesh position={[0, 0.3, 0.13]}><circleGeometry args={[0.035, 18]} /><meshStandardMaterial color={active ? '#51e19a' : '#4f6670'} emissive={active ? '#24744f' : '#132029'} emissiveIntensity={active ? 0.6 : 0.12} /></mesh>
        </group>
      </group>
    </group>
  </group>;
}

function Furnace({ active }: { active: boolean }) {
  return <group position={[0, 0.18, 0]}>
    <RoundedBox args={[2.05, 2.22, 1.5]} radius={0.09} smoothness={4} position={[0, 1.15, 0]} castShadow>
      <meshPhysicalMaterial color="#59636a" metalness={0.9} roughness={0.2} clearcoat={0.34} />
    </RoundedBox>
    <RoundedBox args={[1.52, 1.18, 0.12]} radius={0.05} position={[0, 1.37, 0.79]}>
      <meshStandardMaterial color="#15191c" metalness={0.6} roughness={0.38} />
    </RoundedBox>
    <mesh position={[0, 1.39, 0.858]}><planeGeometry args={[1.18, 0.76]} /><meshStandardMaterial color="#28120b" emissive="#e3672e" emissiveIntensity={active ? 2.7 : 0.65} roughness={0.85} /></mesh>
    <pointLight position={[0, 1.4, 1.1]} intensity={active ? 12 : 2} color="#ff8b3d" distance={3} decay={2} />
    <RoundedBox args={[0.9, 0.32, 0.09]} radius={0.035} position={[-0.34, 0.55, 0.805]}>
      <meshBasicMaterial color="#08161c" />
    </RoundedBox>
    <mesh position={[-0.42, 0.56, 0.855]}><planeGeometry args={[0.42, 0.035]} /><meshBasicMaterial color={active ? '#f4b95f' : '#6a8290'} /></mesh>
    <mesh position={[0.82, 1.36, 0.875]} castShadow><boxGeometry args={[0.07, 0.8, 0.08]} /><meshStandardMaterial color="#9aa3a8" metalness={0.9} roughness={0.16} /></mesh>
  </group>;
}

function Xrd({ active }: { active: boolean }) {
  return <group position={[0, 0.18, 0]}>
    <RoundedBox args={[2.5, 2.25, 1.55]} radius={0.18} smoothness={5} position={[0, 1.15, 0]} castShadow>
      <meshPhysicalMaterial color="#d3d8da" metalness={0.72} roughness={0.2} clearcoat={0.55} />
    </RoundedBox>
    <RoundedBox args={[1.92, 1.43, 0.08]} radius={0.12} position={[-0.12, 1.37, 0.795]}>
      <meshPhysicalMaterial color="#10212b" transparent opacity={0.72} roughness={0.06} metalness={0.1} transmission={0.18} />
    </RoundedBox>
    <group position={[-0.12, 1.25, 0.86]}>
      <mesh><torusGeometry args={[0.55, 0.07, 16, 64, Math.PI * 1.55]} /><meshStandardMaterial color="#8499a8" metalness={0.88} roughness={0.18} emissive={active ? '#174d59' : '#000000'} /></mesh>
      <mesh position={[0, -0.18, 0]}><cylinderGeometry args={[0.22, 0.28, 0.12, 28]} /><meshStandardMaterial color="#d6dee0" metalness={0.84} roughness={0.15} /></mesh>
      <mesh position={[-0.46, 0.28, 0]} rotation={[0, 0, -0.72]} castShadow><boxGeometry args={[0.2, 0.42, 0.18]} /><meshStandardMaterial color="#bec8cc" metalness={0.76} roughness={0.22} /></mesh>
      <mesh position={[0.46, 0.29, 0]} rotation={[0, 0, 0.7]} castShadow><boxGeometry args={[0.22, 0.48, 0.2]} /><meshStandardMaterial color="#617380" metalness={0.8} roughness={0.2} /></mesh>
      <Line points={[[-0.48, 0.37, 0.03], [0, -0.1, 0.03], [0.47, 0.4, 0.03]]} color={active ? '#f4b95f' : '#6f8591'} lineWidth={active ? 1.4 : 0.7} transparent opacity={active ? 0.92 : 0.35} />
    </group>
    <RoundedBox args={[0.42, 0.62, 0.1]} radius={0.04} position={[0.9, 0.62, 0.8]}><meshBasicMaterial color="#0a161c" /></RoundedBox>
    <mesh position={[0.9, 0.69, 0.856]}><planeGeometry args={[0.26, 0.026]} /><meshBasicMaterial color={active ? '#4dd5ed' : '#5c7583'} /></mesh>
  </group>;
}

function SemEds({ active }: { active: boolean }) {
  return <group position={[0, 0.18, 0]}>
    <RoundedBox args={[1.58, 0.78, 1.34]} radius={0.22} smoothness={5} position={[-0.25, 0.62, 0.06]} castShadow>
      <meshPhysicalMaterial color="#8c999f" metalness={0.9} roughness={0.18} clearcoat={0.42} />
    </RoundedBox>
    <mesh position={[-0.25, 1.12, 0.04]} castShadow><cylinderGeometry args={[0.38, 0.52, 0.45, 32]} /><meshStandardMaterial color="#657783" metalness={0.86} roughness={0.2} /></mesh>
    <mesh position={[-0.25, 1.72, 0.04]} castShadow><cylinderGeometry args={[0.17, 0.3, 0.83, 32]} /><meshPhysicalMaterial color="#d0d5d4" metalness={0.82} roughness={0.2} clearcoat={0.4} /></mesh>
    <mesh position={[-0.25, 2.24, 0.04]} castShadow><cylinderGeometry args={[0.24, 0.17, 0.28, 32]} /><meshStandardMaterial color="#6d7b82" metalness={0.85} roughness={0.2} /></mesh>
    <Line points={[[-0.25, 2.04, 0.76], [-0.25, 0.65, 0.76]]} color="#4dd5ed" lineWidth={active ? 1.3 : 0.5} transparent opacity={active ? 0.9 : 0.25} />
    <mesh position={[-0.25, 0.62, 0.76]}><circleGeometry args={[0.22, 32]} /><meshPhysicalMaterial color="#14242d" metalness={0.55} roughness={0.16} /></mesh>
    <group position={[0.36, 1.18, 0.48]} rotation={[0, 0, 0.96]}>
      <mesh castShadow><cylinderGeometry args={[0.1, 0.14, 0.5, 24]} /><meshPhysicalMaterial color="#768894" metalness={0.86} roughness={0.2} clearcoat={0.35} /></mesh>
      <mesh position={[0, -0.3, 0]}><cylinderGeometry args={[0.06, 0.09, 0.14, 20]} /><meshStandardMaterial color="#303f49" metalness={0.8} roughness={0.22} /></mesh>
      <mesh position={[0, 0.29, 0]}><torusGeometry args={[0.12, 0.025, 10, 24]} /><meshStandardMaterial color="#a2adb1" metalness={0.9} roughness={0.16} /></mesh>
    </group>
    <Line points={[[0.57, 1.4, 0.44], [1.04, 1.72, 0.04], [1.18, 0.92, -0.42]]} color="#4a5f6e" lineWidth={1.1} />
    <RoundedBox args={[0.72, 0.62, 0.62]} radius={0.07} position={[0.9, 0.5, -0.43]} castShadow><meshStandardMaterial color="#374b58" metalness={0.68} roughness={0.33} /></RoundedBox>
    <mesh position={[0.9, 0.66, -0.115]}><planeGeometry args={[0.44, 0.18]} /><meshBasicMaterial color="#09161c" /></mesh>
    <mesh position={[0.9, 0.67, -0.119]}><planeGeometry args={[0.28, 0.024]} /><meshBasicMaterial color={active ? '#51e19a' : '#6a7f8d'} /></mesh>
    <group position={[0.95, 0.7, 0.2]}>
      <mesh position={[0, 0.6, 0]} castShadow><boxGeometry args={[1.0, 0.7, 0.08]} /><meshStandardMaterial color="#1f303e" metalness={0.55} roughness={0.3} /></mesh>
      <mesh position={[0, 0.6, 0.046]}><planeGeometry args={[0.86, 0.55]} /><meshBasicMaterial color="#071317" /></mesh>
      {Array.from({ length: 14 }, (_, i) => <mesh key={i} position={[-0.34 + (i % 5) * 0.17, 0.43 + Math.floor(i / 5) * 0.16, 0.052]}><circleGeometry args={[0.012 + (i % 3) * 0.006, 10]} /><meshBasicMaterial color={i % 4 === 0 ? '#f4b95f' : '#9ab0b8'} /></mesh>)}
      <mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.045, 0.06, 0.45, 16]} /><meshStandardMaterial color="#667987" metalness={0.72} /></mesh>
      <mesh position={[0, -0.1, 0]}><boxGeometry args={[0.74, 0.06, 0.42]} /><meshStandardMaterial color="#394b58" metalness={0.65} /></mesh>
    </group>
  </group>;
}

function Bet({ active, tone }: { active: boolean; tone: string }) {
  return <group position={[0, 0.18, 0]}>
    <RoundedBox args={[2.0, 2.2, 1.42]} radius={0.1} smoothness={4} position={[-0.28, 1.14, 0]} castShadow>
      <meshPhysicalMaterial color="#4b5b67" metalness={0.78} roughness={0.25} clearcoat={0.4} />
    </RoundedBox>
    <RoundedBox args={[1.48, 1.2, 0.08]} radius={0.05} position={[-0.28, 1.4, 0.735]}>
      <meshPhysicalMaterial color="#0b1920" transparent opacity={0.82} roughness={0.08} transmission={0.12} />
    </RoundedBox>
    {[-0.72, -0.42, -0.13, 0.16].map((x, i) => <group key={x} position={[x, 1.4, 0.8]}>
      <mesh><cylinderGeometry args={[0.045, 0.055, 0.72, 18]} /><meshPhysicalMaterial color="#c4d9de" transparent opacity={0.58} roughness={0.08} /></mesh>
      <mesh position={[0, -0.39, 0]}><sphereGeometry args={[0.095, 18, 12]} /><meshStandardMaterial color={active && i !== 2 ? '#b48cff' : '#6f8390'} emissive={active && i !== 2 ? '#5f36a0' : '#000000'} emissiveIntensity={active ? 1.3 : 0} /></mesh>
      <mesh position={[0, 0.39, 0]}><cylinderGeometry args={[0.07, 0.07, 0.06, 18]} /><meshStandardMaterial color="#b7c4c8" metalness={0.82} roughness={0.18} /></mesh>
    </group>)}
    <mesh position={[-0.28, 1.98, 0.81]}><boxGeometry args={[1.25, 0.05, 0.06]} /><meshStandardMaterial color="#7e939e" metalness={0.8} /></mesh>
    <mesh position={[0.98, 0.7, 0.08]} castShadow><cylinderGeometry args={[0.32, 0.36, 1.2, 28]} /><meshPhysicalMaterial color="#607788" metalness={0.72} roughness={0.25} clearcoat={0.4} /></mesh>
    <mesh position={[0.98, 1.35, 0.08]}><cylinderGeometry args={[0.1, 0.1, 0.12, 18]} /><meshStandardMaterial color="#aab7bc" metalness={0.86} /></mesh>
    <Line points={[[0.98, 1.39, 0.1], [0.8, 1.92, 0.1], [0.3, 1.98, 0.1]]} color={tone} lineWidth={0.8} transparent opacity={0.55} />
  </group>;
}

function TgaDsc({ active }: { active: boolean }) {
  return <group position={[0, 0.18, 0]}>
    <LabBench position={[0, 0, 0.28]} width={2.66} />
    <RoundedBox args={[1.7, 0.76, 1.05]} radius={0.12} smoothness={4} position={[-0.15, 0.82, 0.06]} castShadow>
      <meshPhysicalMaterial color="#d0d5d6" metalness={0.76} roughness={0.21} clearcoat={0.48} />
    </RoundedBox>
    <RoundedBox args={[0.96, 0.38, 0.08]} radius={0.04} position={[0.2, 0.82, 0.59]}><meshBasicMaterial color="#07161d" /></RoundedBox>
    <mesh position={[0.2, 0.87, 0.635]}><planeGeometry args={[0.68, 0.035]} /><meshBasicMaterial color={active ? '#4dd5ed' : '#f4b95f'} /></mesh>
    <group position={[-0.46, 1.26, 0.14]}>
      <mesh castShadow><cylinderGeometry args={[0.3, 0.38, 0.42, 32]} /><meshPhysicalMaterial color="#71828d" metalness={0.86} roughness={0.18} clearcoat={0.35} /></mesh>
      <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.18, 0.25, 0.12, 28]} /><meshStandardMaterial color="#b8c1c4" metalness={0.86} roughness={0.16} /></mesh>
      <mesh position={[0, 0.34, 0]}><torusGeometry args={[0.14, 0.025, 10, 28]} /><meshStandardMaterial color="#293943" emissive="#c45b2e" emissiveIntensity={active ? 1.7 : 0.24} /></mesh>
      <pointLight position={[0, 0.38, 0]} intensity={active ? 4 : 0.6} distance={1.5} color="#ff8b4d" />
    </group>
    <group position={[0.78, 1.12, 0.1]}>
      <mesh castShadow><cylinderGeometry args={[0.42, 0.42, 0.1, 36]} /><meshPhysicalMaterial color="#647681" metalness={0.82} roughness={0.2} clearcoat={0.34} /></mesh>
      {Array.from({ length: 6 }, (_, index) => { const angle = index * Math.PI / 3; return <group key={index} position={[Math.cos(angle) * 0.26, 0.09, Math.sin(angle) * 0.26]}><mesh><cylinderGeometry args={[0.055, 0.07, 0.035, 18]} /><meshStandardMaterial color="#d7dfe0" metalness={0.88} roughness={0.14} /></mesh>{index < 2 && <mesh position={[0, 0.028, 0]}><cylinderGeometry args={[0.038, 0.045, 0.012, 18]} /><meshStandardMaterial color="#cfa65d" roughness={0.45} /></mesh>}</group>; })}
      <mesh position={[0, 0.2, 0]} castShadow><cylinderGeometry args={[0.07, 0.09, 0.34, 18]} /><meshStandardMaterial color="#51646f" metalness={0.78} roughness={0.22} /></mesh>
    </group>
    <Line points={[[0.82, 0.7, 0.55], [1.12, 1.02, 0.48], [1.12, 1.52, 0.12], [0.92, 1.66, 0.08]]} color="#6c8795" lineWidth={1.1} />
    <mesh position={[1.14, 0.76, 0.22]} castShadow><cylinderGeometry args={[0.13, 0.15, 0.78, 24]} /><meshStandardMaterial color="#57717f" metalness={0.72} roughness={0.28} /></mesh>
    <mesh position={[1.14, 1.18, 0.22]}><cylinderGeometry args={[0.05, 0.05, 0.09, 18]} /><meshStandardMaterial color="#b0bec3" metalness={0.84} /></mesh>
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

function MaterialRoute({ scenarioId, phase }: { scenarioId: ScenarioId; phase: number }) {
  const carrier = useRef<THREE.Group>(null);
  const current = useRef(0.03);
  const points = useMemo(() => {
    const indexes = scenarioId === 'xrd' ? [0, 1, 2, 3] : scenarioId === 'bet' ? [0, 1, 5] : scenarioId === 'tga' ? [0, 6] : [1, 2];
    return indexes.map((index) => {
      const [x, , z] = STATION_POSITIONS[index];
      return new THREE.Vector3(x, 0.18, z + 1.18);
    });
  }, [scenarioId]);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.15), [points]);
  const route = useMemo(() => curve.getPoints(50), [curve]);
  const routeColor = scenarioId === 'bet' ? '#b48cff' : scenarioId === 'furnace' ? '#f39a62' : scenarioId === 'tga' ? '#e2a64f' : '#4dd5ed';
  useFrame(({ clock }, delta) => {
    const maxStep = scenarioId === 'furnace' ? 2 : 4;
    const target = Math.min(0.96, 0.04 + (Math.min(phase, maxStep) / maxStep) * 0.9);
    current.current = THREE.MathUtils.damp(current.current, target, 3.8, delta);
    const breathing = phase === 3 ? Math.sin(clock.elapsedTime * 1.6) * 0.008 : 0;
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
