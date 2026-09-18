'use client';

import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { emitLabEvent, subscribeLabEvent } from './lab-events';
import type { Station } from './sim-data';
import type { CameraMode } from './lab-scene-config';

const Lab3D = lazy(() => import('./lab-3d').then((module) => ({ default: module.Lab3D })));

export function LabViewport({ stations, selectedId, phase, inspectionState, onInspectionChange, onSelect, onOpenXrd }: {
  stations: Station[];
  selectedId: string;
  phase: number;
  inspectionState?: Record<string, string[]>;
  onInspectionChange?: (stationId: string, checks: string[]) => void;
  onSelect: (id: string) => void;
  onOpenXrd: () => void;
}) {
  const [reviewCameraId] = useState(() => {
    if (typeof window === 'undefined') return null;
    const camera = new URLSearchParams(window.location.search).get('camera');
    return camera && /^C(?:0[1-9]|1[0-6])$/.test(camera) ? camera : null;
  });
  const [cameraMode, setCameraMode] = useState<CameraMode>('overview');
  const [controlFeedback, setControlFeedback] = useState<Record<string, string[]>>({});
  const [immersive, setImmersive] = useState(Boolean(reviewCameraId));
  useEffect(() => {
    if (!immersive) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [immersive]);

  useEffect(() => {
    if (!immersive && cameraMode !== 'focus') return;
    const stepBackOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (cameraMode === 'focus') {
        setCameraMode('overview');
        return;
      }
      setImmersive(false);
    };
    window.addEventListener('keydown', stepBackOnEscape);
    return () => window.removeEventListener('keydown', stepBackOnEscape);
  }, [cameraMode, immersive]);

  useEffect(() => {
    return subscribeLabEvent('station-event', (event) => {
      setControlFeedback((current) => ({
        ...current,
        [event.stationId]: Array.from(new Set([...(current[event.stationId] ?? []), event.action])),
      }));
    });
  }, []);

  useEffect(() => {
    return subscribeLabEvent('return-to-lab', ({ stationId }) => {
      onSelect(stationId);
      setCameraMode('walk');
      setImmersive(true);
    });
  }, [onSelect]);

  const enterLab = () => {
    setCameraMode('walk');
    setImmersive(true);
  };

  const exitLab = () => {
    setImmersive(false);
  };

  const openSelectedConsole = () => {
    setImmersive(false);
    emitLabEvent('open-console', { stationId: selectedId });
  };

  const openXrd = () => {
    setImmersive(false);
    onOpenXrd();
  };

  const viewport = <div
    className={`lab-viewport mode-3d${immersive ? ' is-immersive' : ''}${reviewCameraId ? ' is-review' : ''}`}
    aria-label={immersive ? 'Immersive facility view' : undefined}
    style={immersive ? { position: 'fixed', zIndex: 240, inset: 0, width: '100vw', height: '100dvh', background: '#c8c2b8' } : undefined}
  >
    {!reviewCameraId && <header className="lab-toolbar">
      <div className="camera-switch" role="group" aria-label="3D camera mode">
        <button type="button" className={cameraMode === 'overview' ? 'active' : ''} onClick={() => setCameraMode('overview')} aria-pressed={cameraMode === 'overview'}>⌂ OVERVIEW</button>
        <button type="button" className={cameraMode === 'walk' ? 'active' : ''} onClick={() => setCameraMode('walk')} aria-pressed={cameraMode === 'walk'}>⇧ WALK AISLE</button>
      </div>
      <div className="lab-toolbar-actions">
        {immersive && <button className="exit-lab-button" type="button" onClick={exitLab} aria-label="Exit immersive view">EXIT LAB</button>}
        <button className="open-xrd-button" type="button" onClick={openXrd}>OPEN XRD<span aria-hidden="true">→</span></button>
      </div>
    </header>}
    {!reviewCameraId && !immersive && cameraMode === 'overview' && <button className="enter-lab-button" type="button" onClick={enterLab}><span>↳</span><b>ENTER LAB</b><i>→</i></button>}
    <Suspense fallback={<SceneBoot />}><Lab3D stations={stations} selectedId={selectedId} phase={phase} cameraMode={cameraMode} lightingMode="inspection" reviewCameraId={reviewCameraId} controlFeedback={controlFeedback} onCameraMode={setCameraMode} onOpenConsole={openSelectedConsole} inspectionState={inspectionState} onInspectionChange={onInspectionChange} onSelect={onSelect} /></Suspense>
    {reviewCameraId && <div className="review-camera-stamp" aria-hidden="true">MATTERLAB JUDGESET · {reviewCameraId}</div>}
  </div>;

  return immersive && typeof document !== 'undefined' ? createPortal(viewport, document.body) : viewport;
}

function SceneBoot() {
  return <div className="scene-boot" role="status" aria-label="Loading 3D lab">
    <div className="scene-boot-grid">{Array.from({ length: 6 }, (_, index) => <i key={index} />)}</div>
    <div className="scene-boot-status"><span /><div><b>LOADING 3D LAB</b></div></div>
  </div>;
}
