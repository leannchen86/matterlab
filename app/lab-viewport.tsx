'use client';

import { lazy, Suspense, useState } from 'react';
import { LabCanvas } from './lab-canvas';
import type { Station } from './sim-data';

const Lab3D = lazy(() => import('./lab-3d').then((module) => ({ default: module.Lab3D })));

export function LabViewport({ stations, selectedId, phase, scenarioId = 'xrd', onSelect }: {
  stations: Station[];
  selectedId: string;
  phase: number;
  scenarioId?: 'xrd' | 'bet' | 'furnace';
  onSelect: (id: string) => void;
}) {
  const [mode, setMode] = useState<'3d' | '2d'>('3d');
  return <div className={`lab-viewport mode-${mode}`}>
    <div className="view-switch" role="group" aria-label="Facility map view">
      <button type="button" className={mode === '3d' ? 'active' : ''} onClick={() => setMode('3d')} aria-pressed={mode === '3d'}><span>◇</span> 3D TWIN</button>
      <button type="button" className={mode === '2d' ? 'active' : ''} onClick={() => setMode('2d')} aria-pressed={mode === '2d'}><span>⌗</span> 2D MAP</button>
    </div>
    {mode === '3d'
      ? <Suspense fallback={<SceneBoot />}><Lab3D stations={stations} selectedId={selectedId} phase={phase} scenarioId={scenarioId} onSelect={onSelect} /></Suspense>
      : <LabCanvas stations={stations} selectedId={selectedId} phase={phase} scenarioId={scenarioId} onSelect={onSelect} />}
  </div>;
}

function SceneBoot() {
  return <div className="scene-boot" role="status" aria-label="Loading 3D digital twin">
    <div className="scene-boot-grid">{Array.from({ length: 6 }, (_, index) => <i key={index} />)}</div>
    <div className="scene-boot-status"><span /><div><b>INITIALIZING SPATIAL TWIN</b><small>scene graph · asset state · live routes</small></div></div>
  </div>;
}
