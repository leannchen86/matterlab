'use client';

import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { emitLabEvent, subscribeLabEvent } from './lab-events';
import type { Station } from './sim-data';
import type { CameraMode } from './lab-scene-config';

const Lab3D = lazy(() => import('./lab-3d').then((module) => ({ default: module.Lab3D })));

export function LabViewport({ stations, selectedId, phase, inspectionState, onInspectionChange, onSelect }: {
  stations: Station[];
  selectedId: string;
  phase: number;
  inspectionState?: Record<string, string[]>;
  onInspectionChange?: (stationId: string, checks: string[]) => void;
  onSelect: (id: string) => void;
}) {
  const [reviewCameraId] = useState(() => {
    if (typeof window === 'undefined') return null;
    const camera = new URLSearchParams(window.location.search).get('camera');
    return camera && /^C(?:0[1-9]|1[0-6])$/.test(camera) ? camera : null;
  });
  const [cameraMode, setCameraMode] = useState<CameraMode>('overview');
  const [controlFeedback, setControlFeedback] = useState<Record<string, string[]>>({});
  const [immersive, setImmersive] = useState(Boolean(reviewCameraId));
  const [tourActive, setTourActive] = useState(false);
  const [tourRun, setTourRun] = useState(0);
  const [tourPaused, setTourPaused] = useState(false);
  const chooseCamera = (mode: CameraMode) => {
    setTourActive(false);
    setCameraMode(mode);
  };
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
      if (tourActive) {
        setTourActive(false);
        setCameraMode('overview');
        event.preventDefault();
        return;
      }
      if (cameraMode === 'focus') {
        setCameraMode('overview');
        return;
      }
      setImmersive(false);
    };
    window.addEventListener('keydown', stepBackOnEscape);
    return () => window.removeEventListener('keydown', stepBackOnEscape);
  }, [cameraMode, immersive, tourActive]);

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
      setTourActive(false);
      setCameraMode('walk');
      setImmersive(true);
    });
  }, [onSelect]);

  const enterLab = () => {
    setTourActive(false);
    setCameraMode('walk');
    setImmersive(true);
  };

  const exitLab = () => {
    setTourActive(false);
    setImmersive(false);
  };

  const replayTour = () => {
    setTourPaused(false);
    setTourRun((run) => run + 1);
    setCameraMode('overview');
    setTourActive(true);
    setImmersive(true);
  };

  const openSelectedConsole = () => {
    setTourActive(false);
    setImmersive(false);
    emitLabEvent('open-console', { stationId: selectedId });
  };

  const viewport = <div
    className={`lab-viewport mode-3d${immersive ? ' is-immersive' : ''}${reviewCameraId ? ' is-review' : ''}${tourActive ? ' is-tour' : ''}`}
    aria-label={immersive ? 'Immersive facility view' : undefined}
    style={immersive ? { position: 'fixed', zIndex: 240, inset: 0, width: '100vw', height: '100dvh', background: '#c8c2b8' } : undefined}
  >
    {!reviewCameraId && <div className="camera-switch" role="group" aria-label="3D camera mode">
      <button type="button" className={!tourActive && cameraMode === 'overview' ? 'active' : ''} onClick={() => chooseCamera('overview')} aria-pressed={!tourActive && cameraMode === 'overview'}>⌂ OVERVIEW</button>
      <button type="button" className={cameraMode === 'walk' ? 'active' : ''} onClick={() => chooseCamera('walk')} aria-pressed={cameraMode === 'walk'}>⇧ WALK AISLE</button>
      <button type="button" className={cameraMode === 'focus' ? 'active' : ''} onClick={() => chooseCamera('focus')} aria-pressed={cameraMode === 'focus'}>◎ FOCUS {selectedId}</button>
      <button type="button" className={tourActive ? 'active tour-toggle' : 'tour-toggle'} onClick={replayTour} aria-pressed={tourActive}>▶ TOUR</button>
    </div>}
    {!reviewCameraId && !immersive && cameraMode === 'overview' && <button className="enter-lab-button" type="button" onClick={enterLab}><span>↳</span><b>ENTER LAB</b><i>→</i></button>}
    {!reviewCameraId && immersive && <button className="exit-lab-button" type="button" onClick={exitLab} aria-label="Exit immersive view">EXIT LAB</button>}
    <Suspense fallback={<SceneBoot />}><Lab3D stations={stations} selectedId={selectedId} phase={phase} cameraMode={cameraMode} lightingMode="inspection" reviewCameraId={reviewCameraId} tourActive={tourActive} tourRun={tourRun} tourPaused={tourPaused} onTourComplete={() => chooseCamera('overview')} controlFeedback={controlFeedback} onCameraMode={chooseCamera} onOpenConsole={openSelectedConsole} inspectionState={inspectionState} onInspectionChange={onInspectionChange} onSelect={onSelect} /></Suspense>
    {tourActive && <div className="cinematic-hud" role="status">
      <span>CINEMATIC FACILITY TOUR</span>
      <button type="button" aria-label={tourPaused ? 'Resume tour' : 'Pause tour'} onClick={() => setTourPaused((paused) => !paused)}>{tourPaused ? 'RESUME' : 'PAUSE'}</button>
      <button type="button" onClick={() => chooseCamera('overview')}>EXIT TOUR</button>
    </div>}
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
