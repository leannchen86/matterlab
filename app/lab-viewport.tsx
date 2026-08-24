'use client';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCampaignSnapshot } from './campaign-context';
import { LabCanvas } from './lab-canvas';
import type { Station } from './sim-data';

const Lab3D = lazy(() => import('./lab-3d').then((module) => ({ default: module.Lab3D })));

export function LabViewport({ stations, selectedId, phase, scenarioId = 'xrd', inspectionState, onInspectionChange, onSelect }: {
  stations: Station[];
  selectedId: string;
  phase: number;
  scenarioId?: 'xrd' | 'bet' | 'furnace' | 'tga' | 'facility';
  inspectionState?: Record<string, string[]>;
  onInspectionChange?: (stationId: string, checks: string[]) => void;
  onSelect: (id: string) => void;
}) {
  const [mode, setMode] = useState<'3d' | '2d'>('3d');
  const [cameraMode, setCameraMode] = useState<'overview' | 'walk' | 'focus'>('overview');
  const [lightingMode, setLightingMode] = useState<'inspection' | 'run'>('inspection');
  const [controlFeedback, setControlFeedback] = useState<Record<string, string[]>>({});
  const [immersive, setImmersive] = useState(false);
  const [ambienceOn, setAmbienceOn] = useState(false);
  const campaign = useCampaignSnapshot();
  const campaignStage = campaign.stage;
  const campaignSelected = campaign.selected;
  const campaignRunNumber = campaign.runNumber;
  const activeCampaignStage = scenarioId === 'xrd' ? campaignStage : 0;
  const ambienceContext = useRef<AudioContext | null>(null);

  const toggleAmbience = async () => {
    if (ambienceContext.current) {
      const context = ambienceContext.current;
      ambienceContext.current = null;
      setAmbienceOn(false);
      await context.close();
      return;
    }
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = 0.035;
    master.connect(context.destination);

    const electricalHum = context.createOscillator();
    const humGain = context.createGain();
    electricalHum.type = 'sine';
    electricalHum.frequency.value = 60;
    humGain.gain.value = 0.055;
    electricalHum.connect(humGain).connect(master);
    electricalHum.start();

    const airBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const airData = airBuffer.getChannelData(0);
    for (let index = 0; index < airData.length; index += 1) airData[index] = Math.random() * 2 - 1;
    const airHandler = context.createBufferSource();
    const airFilter = context.createBiquadFilter();
    const airGain = context.createGain();
    airHandler.buffer = airBuffer;
    airHandler.loop = true;
    airFilter.type = 'lowpass';
    airFilter.frequency.value = 420;
    airFilter.Q.value = 0.55;
    airGain.gain.value = 0.075;
    airHandler.connect(airFilter).connect(airGain).connect(master);
    airHandler.start();

    ambienceContext.current = context;
    await context.resume();
    setAmbienceOn(true);
  };

  useEffect(() => () => {
    const context = ambienceContext.current;
    ambienceContext.current = null;
    if (context) void context.close();
  }, []);

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
      setMode('3d');
      setCameraMode('walk');
      setImmersive(true);
    };
    window.addEventListener('mattershift:return-to-lab', returnToAsset);
    return () => window.removeEventListener('mattershift:return-to-lab', returnToAsset);
  }, [onSelect]);

  const toggleImmersive = () => {
    if (!immersive) setMode('3d');
    else setCameraMode('overview');
    setImmersive((value) => !value);
  };

  const enterLab = () => {
    setMode('3d');
    setCameraMode('walk');
    setImmersive(true);
  };

  const openSelectedConsole = () => {
    const campaignStationId = activeCampaignStage === 1 ? 'PREP-01' : activeCampaignStage <= 3 ? 'ROBO-02' : activeCampaignStage <= 5 ? 'FURN-04' : activeCampaignStage <= 7 ? 'XRD-03' : 'SEM-01';
    const inspectionKey = activeCampaignStage > 0 && campaignStationId === selectedId ? `${selectedId}:RUN-${campaignRunNumber}:${campaignSelected}:S${activeCampaignStage}` : selectedId;
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

  const openFacilityPlanning = () => {
    setImmersive(false);
    window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('mattershift:open-campaign', { detail: { view: 'facility' } })));
  };

  const viewport = <div
    className={`lab-viewport mode-${mode}${immersive ? ' is-immersive' : ''}`}
    aria-label={immersive ? 'Immersive facility view' : undefined}
    style={immersive ? { position: 'fixed', zIndex: 240, inset: 0, width: '100vw', height: '100dvh', background: '#050911' } : undefined}
  >
    <div className="view-switch" role="group" aria-label="Facility map view">
      <button type="button" className={mode === '3d' ? 'active' : ''} onClick={() => setMode('3d')} aria-pressed={mode === '3d'}><span>◇</span> 3D TWIN</button>
      <button type="button" className={mode === '2d' ? 'active' : ''} onClick={() => setMode('2d')} aria-pressed={mode === '2d'}><span>⌗</span> 2D MAP</button>
      <button type="button" className="facility-build-switch" onClick={openFacilityPlanning}><span>▦</span> BUILD</button>
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
    {mode === '3d' && <button
      type="button"
      className={`ambience-switch${ambienceOn ? ' is-on' : ''}`}
      onClick={toggleAmbience}
      aria-label={`Laboratory ambience ${ambienceOn ? 'on' : 'off'}. Activate to ${ambienceOn ? 'mute' : 'play'} the air-handler and electrical room tone.`}
      aria-pressed={ambienceOn}
    ><span>{ambienceOn ? '◖' : '○'}</span>{ambienceOn ? 'LAB HUM ON' : 'LAB AUDIO'}</button>}
    {mode === '3d' && !immersive && <button className="enter-lab-button" type="button" onClick={enterLab}><span>↳</span><b>ENTER LAB</b><small>HUMAN-SCALE AISLE</small><i>→</i></button>}
    {mode === '3d'
      ? <Suspense fallback={<SceneBoot />}><Lab3D stations={stations} selectedId={selectedId} phase={phase} campaignStage={activeCampaignStage} campaignSelected={campaignSelected} campaignRunNumber={campaignRunNumber} campaignResultElapsed={campaign.resultElapsed} campaignResultMeasured={campaign.resultMeasured} campaignConfirmationSource={campaign.confirmationSource} campaignMissionId={campaign.missionId} campaignThermalBayLevel={campaign.thermalBayLevel} campaignInventory={campaign.inventory} campaignBacklog={campaign.backlog} scenarioId={scenarioId} cameraMode={cameraMode} lightingMode={lightingMode} controlFeedback={controlFeedback} onCameraMode={setCameraMode} onOpenConsole={openSelectedConsole} onOpenInventory={openMaterialStaging} onOpenCampaign={openCampaignPlanning} inspectionState={inspectionState} onInspectionChange={onInspectionChange} onSelect={onSelect} /></Suspense>
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
