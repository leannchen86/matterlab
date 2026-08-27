'use client';

import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCampaignSnapshot } from './campaign-context';
import type { Station } from './sim-data';

const Lab3D = lazy(() => import('./lab-3d').then((module) => ({ default: module.Lab3D })));

export function LabViewport({ stations, selectedId, phase, scenarioId = 'xrd', campaignEnabled = false, inspectionState, onInspectionChange, onSelect }: {
  stations: Station[];
  selectedId: string;
  phase: number;
  scenarioId?: 'xrd' | 'bet' | 'furnace' | 'tga' | 'facility';
  campaignEnabled?: boolean;
  inspectionState?: Record<string, string[]>;
  onInspectionChange?: (stationId: string, checks: string[]) => void;
  onSelect: (id: string) => void;
}) {
  const [cameraMode, setCameraMode] = useState<'overview' | 'walk' | 'focus'>('overview');
  const [controlFeedback, setControlFeedback] = useState<Record<string, string[]>>({});
  const [immersive, setImmersive] = useState(false);
  const campaign = useCampaignSnapshot();
  const campaignStage = campaign.stage;
  const campaignSelected = campaign.selected;
  const campaignRunNumber = campaign.runNumber;
  const activeCampaignStage = scenarioId === 'xrd' && campaignEnabled ? campaignStage : 0;
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
    const retainControlFeedback = (event: Event) => {
      const request = event as CustomEvent<{ stationId?: string; type?: string; action?: string }>;
      if (request.detail?.type !== 'control' || !request.detail.stationId || !request.detail.action) return;
      setControlFeedback((current) => ({
        ...current,
        [request.detail.stationId as string]: Array.from(new Set([...(current[request.detail.stationId as string] ?? []), request.detail.action as string])),
      }));
    };
    window.addEventListener('mattershift:station-event', retainControlFeedback);
    return () => window.removeEventListener('mattershift:station-event', retainControlFeedback);
  }, []);

  useEffect(() => {
    const returnToAsset = (event: Event) => {
      const request = event as CustomEvent<{ stationId?: string }>;
      if (!request.detail?.stationId) return;
      onSelect(request.detail.stationId);
      setCameraMode('walk');
      setImmersive(true);
    };
    window.addEventListener('mattershift:return-to-lab', returnToAsset);
    return () => window.removeEventListener('mattershift:return-to-lab', returnToAsset);
  }, [onSelect]);

  const enterLab = () => {
    setCameraMode('walk');
    setImmersive(true);
  };

  const openSelectedConsole = () => {
    const campaignStationId = activeCampaignStage === 1 ? 'PREP-01' : activeCampaignStage <= 3 ? 'ROBO-02' : activeCampaignStage <= 5 ? 'FURN-04' : activeCampaignStage <= 7 ? 'XRD-03' : 'SEM-01';
    const inspectionKey = activeCampaignStage > 0 && campaignStationId === selectedId ? `${selectedId}:RUN-${campaignRunNumber}:${campaignSelected}` : selectedId;
    const physicalChecks = inspectionState?.[inspectionKey] ?? [];
    setImmersive(false);
    window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('mattershift:open-console', { detail: { stationId: selectedId, physicalChecks } })));
  };

  const openMaterialStaging = () => {
    setImmersive(false);
    window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('mattershift:open-material-staging')));
  };

  const openCampaignPlanning = () => {
    setImmersive(false);
    window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('mattershift:open-campaign')));
  };

  const viewport = <div
    className={`lab-viewport mode-3d${immersive ? ' is-immersive' : ''}`}
    aria-label={immersive ? 'Immersive facility view' : undefined}
    style={immersive ? { position: 'fixed', zIndex: 240, inset: 0, width: '100vw', height: '100dvh', background: '#c8c2b8' } : undefined}
  >
    <div className="camera-switch" role="group" aria-label="3D camera mode">
      <button type="button" className={cameraMode === 'overview' ? 'active' : ''} onClick={() => setCameraMode('overview')} aria-pressed={cameraMode === 'overview'}>⌂ OVERVIEW</button>
      <button type="button" className={cameraMode === 'walk' ? 'active' : ''} onClick={() => setCameraMode('walk')} aria-pressed={cameraMode === 'walk'}>⇧ WALK AISLE</button>
      <button type="button" className={cameraMode === 'focus' ? 'active' : ''} onClick={() => setCameraMode('focus')} aria-pressed={cameraMode === 'focus'}>◎ FOCUS {selectedId}</button>
    </div>
    {!immersive && cameraMode === 'overview' && <button className="enter-lab-button" type="button" onClick={enterLab}><span>↳</span><b>ENTER LAB</b><small>WALK THROUGH THE AISLES</small><i>→</i></button>}
    <Suspense fallback={<SceneBoot />}><Lab3D stations={stations} selectedId={selectedId} phase={phase} campaignStage={activeCampaignStage} campaignSelected={campaignSelected} campaignRunNumber={campaignRunNumber} campaignResultElapsed={campaign.resultElapsed} campaignResultMeasured={campaign.resultMeasured} campaignConfirmationSource={campaign.confirmationSource} campaignMissionId={campaign.missionId} campaignThermalBayLevel={campaign.thermalBayLevel} campaignStagingBayLevel={campaign.stagingBayLevel} campaignInventory={campaign.inventory} campaignBacklog={campaign.backlog} scenarioId={scenarioId} cameraMode={cameraMode} lightingMode="inspection" controlFeedback={controlFeedback} onCameraMode={setCameraMode} onOpenConsole={openSelectedConsole} onOpenInventory={openMaterialStaging} onOpenCampaign={openCampaignPlanning} inspectionState={inspectionState} onInspectionChange={onInspectionChange} onSelect={onSelect} /></Suspense>
  </div>;

  return immersive && typeof document !== 'undefined' ? createPortal(viewport, document.body) : viewport;
}

function SceneBoot() {
  return <div className="scene-boot" role="status" aria-label="Loading 3D lab">
    <div className="scene-boot-grid">{Array.from({ length: 6 }, (_, index) => <i key={index} />)}</div>
    <div className="scene-boot-status"><span /><div><b>LOADING 3D LAB</b><small>equipment · lighting · navigation</small></div></div>
  </div>;
}
