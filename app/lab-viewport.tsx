'use client';

import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LabCanvas } from './lab-canvas';
import type { Station } from './sim-data';

const Lab3D = lazy(() => import('./lab-3d').then((module) => ({ default: module.Lab3D })));

export function LabViewport({ stations, selectedId, phase, scenarioId = 'xrd', inspectionState, onInspectionChange, onSelect }: {
  stations: Station[];
  selectedId: string;
  phase: number;
  scenarioId?: 'xrd' | 'bet' | 'furnace' | 'tga';
  inspectionState?: Record<string, string[]>;
  onInspectionChange?: (stationId: string, checks: string[]) => void;
  onSelect: (id: string) => void;
}) {
  const [mode, setMode] = useState<'3d' | '2d'>('3d');
  const [cameraMode, setCameraMode] = useState<'overview' | 'walk' | 'focus'>('overview');
  const [lightingMode, setLightingMode] = useState<'inspection' | 'run'>('inspection');
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    if (!immersive) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setImmersive(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [immersive]);

  useEffect(() => {
    const returnToAsset = (event: Event) => {
      const request = event as CustomEvent<{ stationId?: string }>;
      if (!request.detail?.stationId) return;
      onSelect(request.detail.stationId);
      setMode('3d');
      setCameraMode('walk');
      setImmersive(true);
    };
    window.addEventListener('mattershift:return-to-lab', returnToAsset);
    return () => window.removeEventListener('mattershift:return-to-lab', returnToAsset);
  }, [onSelect]);

  const toggleImmersive = () => {
    if (!immersive) setMode('3d');
    setImmersive((value) => !value);
  };

  const openSelectedConsole = () => {
    setImmersive(false);
    window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('mattershift:open-console', { detail: { stationId: selectedId } })));
  };

  const viewport = <div
    className={`lab-viewport mode-${mode}${immersive ? ' is-immersive' : ''}`}
    aria-label={immersive ? 'Immersive facility view' : undefined}
    style={immersive ? { position: 'fixed', zIndex: 240, inset: 0, width: '100vw', height: '100dvh', background: '#050911' } : undefined}
  >
    <div className="view-switch" role="group" aria-label="Facility map view">
      <button type="button" className={mode === '3d' ? 'active' : ''} onClick={() => setMode('3d')} aria-pressed={mode === '3d'}><span>◇</span> 3D TWIN</button>
      <button type="button" className={mode === '2d' ? 'active' : ''} onClick={() => setMode('2d')} aria-pressed={mode === '2d'}><span>⌗</span> 2D MAP</button>
      <button type="button" className={immersive ? 'active immersive-toggle' : 'immersive-toggle'} onClick={toggleImmersive} aria-pressed={immersive}><span>{immersive ? '×' : '⛶'}</span> {immersive ? 'EXIT' : 'EXPAND'}</button>
    </div>
    {mode === '3d' && <div className="camera-switch" role="group" aria-label="3D camera mode">
      <button type="button" className={cameraMode === 'overview' ? 'active' : ''} onClick={() => setCameraMode('overview')} aria-pressed={cameraMode === 'overview'}>⌂ OVERVIEW</button>
      <button type="button" className={cameraMode === 'walk' ? 'active' : ''} onClick={() => setCameraMode('walk')} aria-pressed={cameraMode === 'walk'}>⇧ WALK AISLE</button>
      <button type="button" className={cameraMode === 'focus' ? 'active' : ''} onClick={() => setCameraMode('focus')} aria-pressed={cameraMode === 'focus'}>◎ FOCUS {selectedId}</button>
    </div>}
    {mode === '3d' && <button
      type="button"
      className={`lighting-switch mode-${lightingMode}`}
      onClick={() => setLightingMode((current) => current === 'inspection' ? 'run' : 'inspection')}
      aria-label={`Facility lighting: ${lightingMode === 'inspection' ? 'inspection light' : 'instrument run light'}. Activate to change lighting.`}
      aria-pressed={lightingMode === 'inspection'}
    ><span>{lightingMode === 'inspection' ? '☼' : '◐'}</span>{lightingMode === 'inspection' ? 'INSPECTION LIGHT' : 'RUN LIGHT'}</button>}
    {mode === '3d'
      ? <Suspense fallback={<SceneBoot />}><Lab3D stations={stations} selectedId={selectedId} phase={phase} scenarioId={scenarioId} cameraMode={cameraMode} lightingMode={lightingMode} onCameraMode={setCameraMode} onOpenConsole={openSelectedConsole} inspectionState={inspectionState} onInspectionChange={onInspectionChange} onSelect={onSelect} /></Suspense>
      : <LabCanvas stations={stations} selectedId={selectedId} phase={phase} scenarioId={scenarioId} onSelect={onSelect} />}
  </div>;

  return immersive && typeof document !== 'undefined' ? createPortal(viewport, document.body) : viewport;
}

function SceneBoot() {
  return <div className="scene-boot" role="status" aria-label="Loading 3D digital twin">
    <div className="scene-boot-grid">{Array.from({ length: 6 }, (_, index) => <i key={index} />)}</div>
    <div className="scene-boot-status"><span /><div><b>INITIALIZING SPATIAL TWIN</b><small>scene graph · asset state · live routes</small></div></div>
  </div>;
}
