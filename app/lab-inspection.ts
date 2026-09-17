import type { StationKind } from './lab-scene-config.ts';

export type InspectionPoint = { position: [number, number, number]; label: string; displayLabel?: string; observation: string; state: 'pass' | 'attention' };

export const HOTSPOTS: Record<StationKind, InspectionPoint[]> = {
  prep: [{ position: [-0.65, 1.25, 0.68], label: 'SASH', observation: '420 mm opening · airflow normal', state: 'pass' }, { position: [0.86, 0.97, 0.55], label: 'BALANCE', observation: 'level centered · zero 0.000 g', state: 'pass' }, { position: [-0.15, 0.68, 0.58], label: 'LOT', observation: 'three capped powder vials retained in secondary tray', state: 'pass' }],
  robot: [{ position: [1.17, 1.28, 1.1], label: 'GATE', displayLabel: 'GATE INTERLOCK', observation: 'CH1 interlock closed · no bypass', state: 'pass' }, { position: [0.98, 0.84, 0.18], label: 'GRIPPER', displayLabel: 'GRIPPER TOOL', observation: 'carrier jaws clear · tool seated', state: 'pass' }, { position: [1.55, 0.86, 0.81], label: 'HMI', displayLabel: 'ROBOT HMI', observation: 'AUTO hold · route inhibited', state: 'attention' }],
  furnace: [{ position: [0.59, 1.38, 0.93], label: 'INTERLOCK', displayLabel: 'DOOR INTERLOCK', observation: 'door input closed · latch engaged', state: 'pass' }, { position: [-0.38, 0.58, 0.9], label: 'CONTROLLER', observation: 'PV 982 °C · SP 1,000 °C', state: 'pass' }, { position: [0, 1.38, 0.94], label: 'CHAMBER', displayLabel: 'HOT CHAMBER', observation: 'load present · hot-zone active', state: 'attention' }],
  xrd: [{ position: [-0.12, 1.23, 0.98], label: 'HOLDER', displayLabel: 'SAMPLE HOLDER', observation: 'surface clean · specimen flat', state: 'pass' }, { position: [0.9, 0.7, 0.92], label: 'HMI', displayLabel: 'LOCAL HMI', observation: 'FREE LAB READY · choose a sample in the XRD bench', state: 'pass' }, { position: [-0.48, 1.52, 0.92], label: 'ENCLOSURE', displayLabel: 'RADIATION ENCLOSURE', observation: 'source shutter closed · no acquisition running', state: 'pass' }],
  sem: [{ position: [-0.25, 0.92, 0.82], label: 'CHAMBER', displayLabel: 'VACUUM CHAMBER', observation: 'specimen stage inside sealed chamber · vacuum 2.1e−5 Pa', state: 'pass' }, { position: [-0.25, 2.08, 0.42], label: 'COLUMN', displayLabel: 'ELECTRON COLUMN', observation: 'electron-optics stack above specimen · HV standby', state: 'pass' }, { position: [0.48, 1.22, 0.55], label: 'BSE / EDS', displayLabel: 'DETECTOR ARRAY', observation: 'annular BSE below the lens · EDS and SE on side ports', state: 'pass' }],
  bet: [{ position: [-0.3, 1.62, 0.38], label: 'PORTS', displayLabel: 'ANALYSIS PORTS', observation: 'sealed manifold feeds four sample tubes independently', state: 'attention' }, { position: [0.98, 1.42, 0.34], label: 'N₂', displayLabel: 'N₂ GAS SUPPLY', observation: 'analysis and backfill gas · regulator stable', state: 'pass' }, { position: [0.68, 0.5, 0.1], label: 'VACUUM', displayLabel: 'VACUUM SYSTEM', observation: 'evacuates sample tubes before adsorption measurement', state: 'attention' }],
  tga: [{ position: [-0.42, 1.04, 0.44], label: 'PAN', displayLabel: 'PAN SET', observation: 'matched sample/reference pans suspend from microbalance', state: 'pass' }, { position: [1, 0.95, 0.42], label: 'PURGE', displayLabel: 'PURGE GAS', observation: 'N₂ controls the furnace atmosphere and clears evolved gas', state: 'pass' }, { position: [-0.42, 1.42, 0.42], label: 'FURNACE', displayLabel: 'MOVABLE FURNACE', observation: 'furnace rises around suspended pans · 28 °C', state: 'attention' }],
};

export function getInspectionPoints(kind: StationKind, phase: number): InspectionPoint[] {
  if (kind === 'xrd' && phase >= 1) return [
    { position: [-0.12, 1.23, 0.98], label: 'HOLDER', displayLabel: 'SAMPLE HOLDER', observation: phase === 1 ? 'stage empty · selected holder at load position' : phase === 2 ? 'selected holder seated · preparation retained with run' : phase === 3 ? 'holder centered · diffraction acquisition running' : 'measured pattern retained · holder identity preserved', state: phase === 1 ? 'attention' : 'pass' },
    { position: [0.9, 0.7, 0.92], label: 'HMI', displayLabel: 'LOCAL HMI', observation: phase <= 2 ? 'READY' : phase === 3 ? 'SCANNING' : phase === 4 ? 'ANALYSIS' : 'SAVED', state: 'pass' },
    { position: [-0.58, 1.7, 0.92], label: 'ENCLOSURE', displayLabel: 'RADIATION ENCLOSURE', observation: phase === 1 ? 'door open · source shutter closed' : phase === 2 ? 'door closed · interlock ready' : phase === 3 ? 'door locked · X-ray source enabled' : 'source off · door remains interlocked', state: 'pass' },
  ];
  return HOTSPOTS[kind];
}

