'use client';

import { ContactShadows, Environment, Grid, Html, Lightformer, Line, OrbitControls, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Station } from './sim-data';

type ScenarioId = 'xrd' | 'bet' | 'furnace';
type SceneProps = {
  stations: Station[];
  selectedId: string;
  phase: number;
  scenarioId: ScenarioId;
  onSelect: (id: string) => void;
};

const STATION_POSITIONS: [number, number, number][] = [
  [-5.25, 0, -2.15],
  [-1.75, 0, -2.15],
  [1.75, 0, -2.15],
  [-5.25, 0, 1.75],
  [-1.75, 0, 1.75],
  [1.75, 0, 1.75],
];

const TONE_COLORS: Record<Station['tone'], string> = {
  ready: '#51e19a',
  hold: '#718198',
  run: '#4dd5ed',
  warn: '#f4b95f',
  off: '#586579',
};

export function Lab3D({ stations, selectedId, phase, scenarioId, onSelect }: SceneProps) {
  return (
    <div className="lab-3d" aria-label="Orbitable 3D digital twin of six materials laboratory stations">
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
        {stations.map((station, index) => (
          <StationCell
            key={station.id}
            station={station}
            index={index}
            position={STATION_POSITIONS[index]}
            selected={selectedId === station.id}
            active={station.tone === 'run'}
            onSelect={onSelect}
          />
        ))}
        <ContactShadows position={[0, 0.025, 0]} opacity={0.58} scale={22} blur={2.6} far={8} resolution={512} color="#000713" />
        <OrbitControls
          makeDefault
          target={[-1.55, 0.72, -0.18]}
          enableDamping
          dampingFactor={0.075}
          minDistance={11}
          maxDistance={34}
          minPolarAngle={0.55}
          maxPolarAngle={1.36}
          minAzimuthAngle={-1.45}
          maxAzimuthAngle={1.25}
        />
      </Canvas>
      <div className="canvas-a11y">{stations.map((station) => <button key={station.id} type="button" onClick={() => onSelect(station.id)}>{station.name}: {station.state}</button>)}</div>
      <div className="scene-corner scene-corner-top"><span>LIVE SPATIAL TWIN</span><b>LAB 04 · BAY A/B</b></div>
      <div className="scene-corner scene-corner-bottom"><span>DRAG</span> ORBIT <i>·</i> <span>SCROLL</span> ZOOM <i>·</i> <span>CLICK</span> INSPECT</div>
    </div>
  );
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
    <group position={[2.18, 0.07, 5.7]} rotation={[0, 0.18, 0]}>
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

function StationCell({ station, index, position, selected, active, onSelect }: {
  station: Station;
  index: number;
  position: [number, number, number];
  selected: boolean;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const tone = TONE_COLORS[station.tone];
  const setCursor = (cursor: string) => { document.body.style.cursor = cursor; };
  return (
    <group
      position={position}
      onClick={(event) => { event.stopPropagation(); onSelect(station.id); }}
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
      <Equipment index={index} active={active} tone={tone} />
      {selected && <InspectionHotspots index={index} tone={tone} />}
      <StatusBeacon position={[1.32, 0.34, 1.08]} color={tone} active={active || selected} />
      <Html center position={[index === 3 ? 0.5 : index === 2 ? -0.38 : 0, index < 3 ? 2.98 : 2.72, index < 3 ? -0.2 : 0.2]} distanceFactor={10.5} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`station-3d-label ${selected ? 'selected' : ''}`} style={{ '--station-tone': tone } as React.CSSProperties}>
          <span>{station.id}</span><b>{station.name}</b><i>{station.state}</i>
        </div>
      </Html>
    </group>
  );
}

function Equipment({ index, active, tone }: { index: number; active: boolean; tone: string }) {
  if (index === 0) return <PowderPrep />;
  if (index === 1) return <RobotCell active={active} />;
  if (index === 2) return <Furnace active={active} />;
  if (index === 3) return <Xrd active={active} />;
  if (index === 4) return <SemEds active={active} />;
  return <Bet active={active} tone={tone} />;
}

const HOTSPOTS: { position: [number, number, number]; label: string }[][] = [
  [{ position: [-0.65, 1.25, 0.68], label: 'SASH' }, { position: [0.86, 0.97, 0.55], label: 'BALANCE' }, { position: [-0.15, 0.68, 0.58], label: 'LOT' }],
  [{ position: [-1.32, 1.45, 1.06], label: 'GATE' }, { position: [0.55, 2.42, 0.35], label: 'GRIPPER' }, { position: [1.05, 1.05, -0.32], label: 'HMI' }],
  [{ position: [0.82, 1.55, 0.93], label: 'INTERLOCK' }, { position: [-0.38, 0.58, 0.9], label: 'CONTROLLER' }, { position: [0, 1.38, 0.94], label: 'CHAMBER' }],
  [{ position: [-0.12, 1.23, 0.98], label: 'HOLDER' }, { position: [0.9, 0.7, 0.92], label: 'HMI' }, { position: [-0.58, 1.7, 0.92], label: 'SHUTTER' }],
  [{ position: [-0.25, 1.2, 0.82], label: 'CHAMBER' }, { position: [-0.25, 2.08, 0.42], label: 'COLUMN' }, { position: [0.95, 1.32, 0.3], label: 'BSE / EDS' }],
  [{ position: [-0.3, 1.45, 0.88], label: 'PORTS' }, { position: [0.98, 1.42, 0.34], label: 'N₂' }, { position: [-0.6, 0.62, 0.84], label: 'VACUUM' }],
];

function InspectionHotspots({ index, tone }: { index: number; tone: string }) {
  return <group>{HOTSPOTS[index].map((hotspot, hotspotIndex) => <Hotspot key={hotspot.label} {...hotspot} tone={tone} delay={hotspotIndex * 0.8} />)}</group>;
}

function Hotspot({ position, label, tone, delay }: { position: [number, number, number]; label: string; tone: string; delay: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pulse = 0.86 + Math.sin(clock.elapsedTime * 2.2 + delay) * 0.18;
    ref.current.scale.setScalar(pulse);
  });
  return <group ref={ref} position={position}>
    <mesh><sphereGeometry args={[0.045, 14, 10]} /><meshStandardMaterial color={tone} emissive={tone} emissiveIntensity={1.7} /></mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.11, 0.012, 8, 28]} /><meshBasicMaterial color={tone} transparent opacity={0.72} /></mesh>
    <pointLight intensity={0.65} distance={0.75} color={tone} />
    <Html center position={[0, 0.22, 0]} distanceFactor={8} zIndexRange={[18, 0]} style={{ pointerEvents: 'none' }}><span className="hotspot-label" style={{ '--hotspot': tone } as React.CSSProperties}>{label}</span></Html>
  </group>;
}

function PowderPrep() {
  return <group position={[0, 0.18, 0]}>
    <LabBench position={[0, 0, 0.26]} width={2.62} />
    <RoundedBox args={[1.75, 1.72, 0.82]} radius={0.06} smoothness={3} position={[-0.32, 1.18, -0.22]} castShadow>
      <meshPhysicalMaterial color="#5c6975" roughness={0.25} metalness={0.8} clearcoat={0.45} />
    </RoundedBox>
    <mesh position={[-0.32, 1.18, 0.205]}>
      <planeGeometry args={[1.42, 1.25]} />
      <meshPhysicalMaterial color="#8fc6d1" transparent opacity={0.18} roughness={0.08} metalness={0.1} transmission={0.18} />
    </mesh>
    <mesh position={[-0.32, 0.56, 0.24]} castShadow><boxGeometry args={[1.5, 0.08, 0.72]} /><meshStandardMaterial color="#263542" metalness={0.55} roughness={0.32} /></mesh>
    <RoundedBox args={[0.58, 0.42, 0.58]} radius={0.045} position={[0.86, 0.7, 0.18]} castShadow>
      <meshStandardMaterial color="#293b4c" metalness={0.45} roughness={0.4} />
    </RoundedBox>
    <mesh position={[0.86, 0.925, 0.37]} rotation={[-0.08, 0, 0]}><planeGeometry args={[0.41, 0.16]} /><meshBasicMaterial color="#07151b" /></mesh>
    <mesh position={[0.86, 0.928, 0.375]} rotation={[-0.08, 0, 0]}><planeGeometry args={[0.28, 0.025]} /><meshBasicMaterial color="#4dd5ed" /></mesh>
    {[-0.68, -0.32, 0.05].map((x, i) => <group key={x} position={[x, 0.67, 0.38]}>
      <mesh castShadow><cylinderGeometry args={[0.09, 0.08, 0.28, 18]} /><meshPhysicalMaterial color={['#d5b66e', '#c7795f', '#8bbaca'][i]} roughness={0.36} clearcoat={0.4} /></mesh>
      <mesh position={[0, 0.16, 0]}><cylinderGeometry args={[0.072, 0.072, 0.04, 18]} /><meshStandardMaterial color="#d6e0e5" metalness={0.62} roughness={0.2} /></mesh>
    </group>)}
  </group>;
}

function RobotCell({ active }: { active: boolean }) {
  return <group position={[0, 0.18, 0]}>
    <SafetyCage />
    <RobotArm active={active} />
    <RoundedBox args={[0.72, 1.1, 0.5]} radius={0.05} position={[1.05, 0.72, -0.62]} castShadow>
      <meshStandardMaterial color="#263745" metalness={0.72} roughness={0.28} />
    </RoundedBox>
    <mesh position={[1.05, 0.86, -0.365]}><planeGeometry args={[0.48, 0.3]} /><meshBasicMaterial color="#06151a" /></mesh>
    <mesh position={[1.05, 0.89, -0.37]}><planeGeometry args={[0.34, 0.025]} /><meshBasicMaterial color={active ? '#51e19a' : '#6c7b8a'} /></mesh>
  </group>;
}

function SafetyCage() {
  const posts: [number, number, number][] = [[-1.35, 1.15, -1.05], [1.35, 1.15, -1.05], [-1.35, 1.15, 1.05], [1.35, 1.15, 1.05]];
  return <group>
    {posts.map((position, index) => <mesh key={index} position={position} castShadow><boxGeometry args={[0.055, 2.25, 0.055]} /><meshStandardMaterial color="#c89a38" metalness={0.55} roughness={0.34} /></mesh>)}
    {[0.55, 1.65].map((y) => <group key={y}>
      <mesh position={[0, y, -1.05]}><boxGeometry args={[2.7, 0.035, 0.035]} /><meshStandardMaterial color="#926e28" metalness={0.4} /></mesh>
      <mesh position={[0, y, 1.05]}><boxGeometry args={[2.7, 0.035, 0.035]} /><meshStandardMaterial color="#926e28" metalness={0.4} /></mesh>
    </group>)}
  </group>;
}

function RobotArm({ active }: { active: boolean }) {
  const base = useRef<THREE.Group>(null);
  const shoulder = useRef<THREE.Group>(null);
  const elbow = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (base.current) base.current.rotation.y = active ? -0.2 + Math.sin(t * 0.55) * 0.46 : -0.42;
    if (shoulder.current) shoulder.current.rotation.z = active ? -0.58 + Math.sin(t * 0.72) * 0.18 : -0.62;
    if (elbow.current) elbow.current.rotation.z = active ? -1.02 + Math.sin(t * 0.92 + 1.2) * 0.23 : -0.94;
  });
  return <group position={[-0.15, 0.08, 0.08]} ref={base}>
    <mesh castShadow><cylinderGeometry args={[0.46, 0.55, 0.25, 32]} /><meshPhysicalMaterial color="#7d8992" metalness={0.84} roughness={0.22} clearcoat={0.55} /></mesh>
    <group ref={shoulder} position={[0, 0.23, 0]}>
      <mesh position={[0, 0.12, 0]} castShadow><sphereGeometry args={[0.31, 24, 16]} /><meshStandardMaterial color="#e4e8e8" metalness={0.68} roughness={0.24} /></mesh>
      <RoundedBox args={[0.38, 1.28, 0.38]} radius={0.18} smoothness={4} position={[0, 0.75, 0]} castShadow>
        <meshPhysicalMaterial color="#cdd4d6" metalness={0.74} roughness={0.2} clearcoat={0.5} />
      </RoundedBox>
      <group ref={elbow} position={[0, 1.39, 0]}>
        <mesh castShadow><sphereGeometry args={[0.28, 24, 16]} /><meshStandardMaterial color="#647484" metalness={0.82} roughness={0.2} /></mesh>
        <RoundedBox args={[0.3, 1.05, 0.3]} radius={0.14} smoothness={4} position={[0, 0.61, 0]} castShadow>
          <meshPhysicalMaterial color="#d7dcdd" metalness={0.75} roughness={0.19} clearcoat={0.55} />
        </RoundedBox>
        <group position={[0, 1.18, 0]}>
          <mesh castShadow><sphereGeometry args={[0.22, 20, 14]} /><meshStandardMaterial color="#4dd5ed" emissive="#177e93" emissiveIntensity={0.7} metalness={0.45} roughness={0.28} /></mesh>
          {[-0.11, 0.11].map((x) => <mesh key={x} position={[x, 0.27, 0]} castShadow><boxGeometry args={[0.07, 0.42, 0.11]} /><meshStandardMaterial color="#1a2530" metalness={0.7} roughness={0.3} /></mesh>)}
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
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const material = ref.current.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = active ? 1.1 + Math.sin(clock.elapsedTime * 3.2) * 0.35 : 0.45;
  });
  return <group position={position}>
    <mesh position={[0, 0.12, 0]}><cylinderGeometry args={[0.055, 0.07, 0.24, 14]} /><meshStandardMaterial color="#586873" metalness={0.75} roughness={0.22} /></mesh>
    <mesh ref={ref} position={[0, 0.28, 0]}><sphereGeometry args={[0.08, 16, 10]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} /></mesh>
  </group>;
}

function MaterialRoute({ scenarioId, phase }: { scenarioId: ScenarioId; phase: number }) {
  const carrier = useRef<THREE.Group>(null);
  const current = useRef(0.03);
  const points = useMemo(() => {
    const indexes = scenarioId === 'xrd' ? [0, 1, 2, 3] : scenarioId === 'bet' ? [0, 1, 5] : [1, 2];
    return indexes.map((index) => {
      const [x, , z] = STATION_POSITIONS[index];
      return new THREE.Vector3(x, 0.28, z);
    });
  }, [scenarioId]);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.15), [points]);
  const route = useMemo(() => curve.getPoints(50), [curve]);
  const routeColor = scenarioId === 'bet' ? '#b48cff' : scenarioId === 'furnace' ? '#f39a62' : '#4dd5ed';
  useFrame(({ clock }, delta) => {
    const maxStep = scenarioId === 'furnace' ? 2 : scenarioId === 'bet' ? 4 : 4;
    const target = Math.min(0.96, 0.04 + (Math.min(phase, maxStep) / maxStep) * 0.9);
    current.current = THREE.MathUtils.damp(current.current, target, 3.8, delta);
    const breathing = phase === 3 ? Math.sin(clock.elapsedTime * 1.6) * 0.008 : 0;
    const point = curve.getPointAt(THREE.MathUtils.clamp(current.current + breathing, 0.02, 0.98));
    if (carrier.current) carrier.current.position.copy(point);
  });
  return <group>
    <Line points={route} color={routeColor} lineWidth={0.75} dashed dashSize={0.18} gapSize={0.13} transparent opacity={0.52} />
    <group ref={carrier}>
      <mesh castShadow rotation={[0, Math.PI / 4, 0]}><boxGeometry args={[0.4, 0.12, 0.4]} /><meshPhysicalMaterial color={routeColor} emissive={routeColor} emissiveIntensity={0.48} metalness={0.72} roughness={0.2} clearcoat={0.5} /></mesh>
      <pointLight position={[0, 0.18, 0]} intensity={2.4} distance={1.5} color={routeColor} />
    </group>
  </group>;
}
