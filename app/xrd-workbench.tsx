'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useModalFocusTrap } from './mission-ui';

export type XrdBenchStage = 'idle' | 'open' | 'loaded' | 'closed' | 'scanning' | 'review' | 'complete';
export type XrdPhaseKey = 'catio3' | 'tio2' | 'batio3' | 'al2o3' | 'amorphous';
export type XrdRunContext = {
  sampleId: string;
  sampleName: string;
  prep: string;
  scan: string;
  scanMinutes: number;
  runNumber: number;
};
export type XrdRunResult = XrdRunContext & {
  selectedPhases: XrdPhaseKey[];
  matched: number;
  total: number;
  supported: boolean;
  uncertain: boolean;
  summary: string;
};

type Peak = { x: number; height: number; width?: number };
type PhaseReference = { key: XrdPhaseKey; formula: string; name: string; color: string; peaks: Peak[] };
type Sample = {
  id: string;
  name: string;
  cue: string;
  color: string;
  texture: 'fine' | 'spark' | 'glass' | 'mixed';
  phases: { key: Exclude<XrdPhaseKey, 'amorphous'>; fraction: number }[];
  amorphous: number;
};

const phaseReferences: PhaseReference[] = [
  { key: 'catio3', formula: 'CaTiO₃', name: 'CALCIUM TITANATE', color: '#4e9d76', peaks: [{ x: 12, height: 18 }, { x: 21, height: 46 }, { x: 32, height: 88 }, { x: 44, height: 38 }, { x: 67, height: 31 }, { x: 79, height: 65 }, { x: 91, height: 24 }] },
  { key: 'tio2', formula: 'TiO₂', name: 'TITANIA', color: '#ca793d', peaks: [{ x: 17, height: 28 }, { x: 54, height: 70 }, { x: 61, height: 34 }, { x: 85, height: 42 }] },
  { key: 'batio3', formula: 'BaTiO₃', name: 'BARIUM TITANATE', color: '#7f75bd', peaks: [{ x: 15, height: 32 }, { x: 28, height: 83 }, { x: 39, height: 46 }, { x: 59, height: 61 }, { x: 74, height: 38 }, { x: 88, height: 52 }] },
  { key: 'al2o3', formula: 'Al₂O₃', name: 'ALUMINA', color: '#b98c3e', peaks: [{ x: 23, height: 39 }, { x: 36, height: 68 }, { x: 51, height: 44 }, { x: 70, height: 77 }, { x: 94, height: 35 }] },
  { key: 'amorphous', formula: 'AMORPHOUS', name: 'NON-CRYSTALLINE', color: '#718b93', peaks: [] },
];

const samples: Sample[] = [
  { id: 'S-11', name: 'WHITE STANDARD', cue: 'KNOWN CONTROL', color: '#d8d5c5', texture: 'fine', phases: [{ key: 'catio3', fraction: 1 }], amorphous: 0 },
  { id: 'S-24', name: 'FURNACE LOT', cue: 'UNKNOWN', color: '#c7b68d', texture: 'spark', phases: [{ key: 'catio3', fraction: .72 }, { key: 'tio2', fraction: .28 }], amorphous: 0 },
  { id: 'S-37', name: 'GLASSY POWDER', cue: 'UNKNOWN', color: '#91a4a3', texture: 'glass', phases: [{ key: 'catio3', fraction: .45 }], amorphous: .55 },
  { id: 'S-52', name: 'MIXED CERAMIC', cue: 'UNKNOWN', color: '#b7a5c4', texture: 'mixed', phases: [{ key: 'batio3', fraction: .58 }, { key: 'al2o3', fraction: .42 }], amorphous: 0 },
];

const prepOptions = [
  { key: 'fine', label: 'FINE + FLAT', short: 'BEST PEAKS', width: 1, shift: 0 },
  { key: 'coarse', label: 'COARSE', short: 'BROAD PEAKS', width: 1.8, shift: 0 },
  { key: 'uneven', label: 'UNEVEN', short: 'PEAK SHIFT', width: 1.2, shift: 2.1 },
] as const;

const scanOptions = [
  { key: 'quick', label: 'QUICK', short: 'NOISY', minutes: 1, noise: 4.2, width: 1.15, duration: 2200 },
  { key: 'standard', label: 'STANDARD', short: 'BALANCED', minutes: 4, noise: 2, width: 1, duration: 3600 },
  { key: 'detail', label: 'DETAIL', short: 'CLEAN', minutes: 12, noise: .7, width: .86, duration: 5000 },
] as const;

type PrepKey = typeof prepOptions[number]['key'];
type ScanKey = typeof scanOptions[number]['key'];

function patternPath(peaks: Peak[], noise: number, seed: number, amorphous: number) {
  const width = 720;
  const baseline = 190;
  return Array.from({ length: 241 }, (_, index) => {
    const percent = index / 2.4;
    const crystalline = peaks.reduce((total, peak) => {
      const spread = peak.width ?? 1.05;
      return total + peak.height * Math.exp(-0.5 * ((percent - peak.x) / spread) ** 2);
    }, 0);
    const glassHump = amorphous * 52 * Math.exp(-0.5 * ((percent - 48) / 12) ** 2);
    const texture = (Math.sin((index + seed * 17) * .83) + Math.sin((index + seed * 11) * .19) * .75 + Math.sin((index + seed) * 2.13) * .35) * noise;
    const y = Math.max(8, baseline - crystalline * 1.48 - glassHump - texture);
    return `${index === 0 ? 'M' : 'L'} ${(percent / 100 * width).toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function buildRun(sample: Sample, prepKey: PrepKey, scanKey: ScanKey, seed: number) {
  const prep = prepOptions.find((option) => option.key === prepKey) ?? prepOptions[0];
  const scan = scanOptions.find((option) => option.key === scanKey) ?? scanOptions[1];
  const peaks = sample.phases.flatMap((phase) => {
    const reference = phaseReferences.find((item) => item.key === phase.key);
    if (!reference) return [];
    return reference.peaks.map((peak) => ({
      x: peak.x + prep.shift,
      height: peak.height * (.35 + phase.fraction * .92),
      width: (peak.width ?? 1) * prep.width * scan.width,
      phase: phase.key,
    }));
  });
  return { peaks, path: patternPath(peaks, scan.noise, seed, sample.amorphous), prep, scan };
}

const stageOrder: XrdBenchStage[] = ['idle', 'open', 'loaded', 'closed', 'scanning', 'review', 'complete'];

export function XrdWorkbench({ stage, result, onStage, onResult, onClose }: {
  stage: XrdBenchStage;
  result: XrdRunResult | null;
  onStage: (stage: XrdBenchStage, context: XrdRunContext) => void;
  onResult: (result: XrdRunResult) => void;
  onClose: () => void;
}) {
  const dialogRef = useModalFocusTrap();
  const [guided, setGuided] = useState(false);
  const [sampleId, setSampleId] = useState<string | null>(result?.sampleId ?? null);
  const [prepKey, setPrepKey] = useState<PrepKey>(() => prepOptions.find((option) => option.label === result?.prep)?.key ?? 'fine');
  const [scanKey, setScanKey] = useState<ScanKey>(() => scanOptions.find((option) => option.label === result?.scan)?.key ?? 'standard');
  const [holderArmed, setHolderArmed] = useState(false);
  const [selectedPhases, setSelectedPhases] = useState<XrdPhaseKey[]>(result?.selectedPhases ?? []);
  const [runNumber, setRunNumber] = useState(result?.runNumber ?? 1);
  const selectedSample = samples.find((sample) => sample.id === sampleId) ?? null;
  const stageIndex = stageOrder.indexOf(stage);
  const doorOpen = stage === 'open' || stage === 'loaded';
  const holderLoaded = stageIndex >= stageOrder.indexOf('loaded');
  const scanVisible = stage === 'scanning' || stage === 'review' || stage === 'complete';
  const run = useMemo(() => selectedSample ? buildRun(selectedSample, prepKey, scanKey, runNumber) : null, [prepKey, runNumber, scanKey, selectedSample]);

  const context = useMemo<XrdRunContext>(() => ({
    sampleId: selectedSample?.id ?? 'NO SAMPLE',
    sampleName: selectedSample?.name ?? 'UNSELECTED',
    prep: run?.prep.label ?? prepOptions[0].label,
    scan: run?.scan.label ?? scanOptions[1].label,
    scanMinutes: run?.scan.minutes ?? 4,
    runNumber,
  }), [run, runNumber, selectedSample]);

  const closeWorkbench = useCallback(() => {
    if (stage !== 'idle' && stage !== 'complete') onStage('idle', context);
    onClose();
  }, [context, onClose, onStage, stage]);

  const actualPhaseKeys = useMemo(() => selectedSample
    ? [...selectedSample.phases.map((phase) => phase.key), ...(selectedSample.amorphous > 0 ? ['amorphous' as const] : [])]
    : [], [selectedSample]);
  const measuredPositions = run?.peaks.map((peak) => peak.x) ?? [];
  const referencePositions = selectedPhases.flatMap((key) => phaseReferences.find((phase) => phase.key === key)?.peaks.map((peak) => peak.x) ?? []);
  const crystallineMatches = measuredPositions.filter((position) => referencePositions.some((reference) => Math.abs(reference - position) <= 1.35)).length;
  const amorphousMatch = selectedSample?.amorphous && selectedPhases.includes('amorphous') ? 1 : 0;
  const matched = crystallineMatches + amorphousMatch;
  const total = measuredPositions.length + (selectedSample?.amorphous ? 1 : 0);
  const falseReferences = selectedPhases.filter((phase) => !actualPhaseKeys.includes(phase));
  const supported = total > 0 && matched / total >= .85 && falseReferences.length === 0 && actualPhaseKeys.every((phase) => selectedPhases.includes(phase));

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeWorkbench(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [closeWorkbench]);

  useEffect(() => {
    if (stage !== 'scanning' || !run) return;
    const timer = window.setTimeout(() => onStage('review', context), run.scan.duration);
    return () => window.clearTimeout(timer);
  }, [context, onStage, run, stage]);

  const selectMode = (nextGuided: boolean) => {
    if (stage !== 'idle') return;
    setGuided(nextGuided);
    setSampleId(nextGuided ? 'S-24' : null);
    setPrepKey('fine');
    setScanKey('standard');
    setSelectedPhases([]);
    setHolderArmed(false);
  };

  const chooseSample = (nextSampleId: string) => {
    if (stage !== 'idle' || guided) return;
    setSampleId(nextSampleId);
    setSelectedPhases([]);
  };

  const loadHolder = () => {
    if (stage !== 'open' || !holderArmed || !selectedSample) return;
    setHolderArmed(false);
    onStage('loaded', context);
  };

  const togglePhase = (phase: XrdPhaseKey) => {
    if (stage !== 'review') return;
    setSelectedPhases((current) => current.includes(phase) ? current.filter((item) => item !== phase) : [...current, phase]);
  };

  const finishRun = (uncertain: boolean) => {
    if (!selectedSample || (!uncertain && selectedPhases.length === 0)) return;
    const unresolved = Math.max(0, total - matched);
    const summary = uncertain
      ? `${selectedSample.id} held without forcing a phase call.`
      : supported
        ? `${matched}/${total} measured features explained.`
        : falseReferences.length
          ? `${falseReferences.length} selected reference${falseReferences.length === 1 ? ' is' : 's are'} not supported.`
          : `${unresolved} measured feature${unresolved === 1 ? '' : 's'} remain unexplained.`;
    onResult({ ...context, selectedPhases, matched, total, supported: uncertain || supported, uncertain, summary });
  };

  const restart = (newSample: boolean) => {
    setSelectedPhases([]);
    setHolderArmed(false);
    setRunNumber((current) => current + 1);
    if (newSample) {
      setGuided(false);
      setSampleId(null);
      setPrepKey('fine');
      setScanKey('standard');
    }
    onStage('idle', context);
  };

  const decisionHint = selectedPhases.length === 0
    ? 'Try one or more reference cards.'
    : supported
      ? 'The selected references explain the pattern.'
      : prepKey === 'uneven'
        ? 'The peaks are shifted. A flatter preparation may help.'
        : falseReferences.length
          ? 'One selected reference adds unsupported peaks.'
          : `${Math.max(0, total - matched)} feature${total - matched === 1 ? '' : 's'} remain.`;

  return <div className="modal-backdrop xrd-workbench-backdrop" role="presentation">
    <section ref={dialogRef} className={`xrd-workbench xrd-free-workbench stage-${stage}`} role="dialog" aria-modal="true" aria-label="XRD free lab">
      <header>
        <div><span>{guided ? 'GUIDED RUN · S-24' : 'XRD FREE LAB'}</span><h2>{guided ? 'Find what the furnace made' : 'Choose. Scan. Try again.'}</h2></div>
        <div className="xrd-bench-steps" aria-label="Choose, scan, compare, and decide">
          <i className={stageIndex >= 2 ? 'done' : 'active'}><b>1</b><span>CHOOSE</span></i>
          <i className={stageIndex >= 5 ? 'done' : stageIndex >= 3 ? 'active' : ''}><b>2</b><span>SCAN</span></i>
          <i className={stageIndex >= 6 ? 'done' : stageIndex >= 5 ? 'active' : ''}><b>3</b><span>COMPARE</span></i>
        </div>
        <div className="xrd-header-actions">
          <div className="xrd-mode-switch" role="group" aria-label="XRD lab mode">
            <button type="button" className={!guided ? 'active' : ''} disabled={stage !== 'idle'} onClick={() => selectMode(false)}>FREE LAB</button>
            <button type="button" className={guided ? 'active' : ''} disabled={stage !== 'idle'} onClick={() => selectMode(true)}>GUIDED</button>
          </div>
          <button type="button" className="xrd-close" onClick={closeWorkbench} aria-label="Close XRD workbench">×</button>
        </div>
      </header>

      <div className="xrd-workbench-main">
        <section className="xrd-machine-bay" aria-label={`XRD enclosure ${doorOpen ? 'open' : 'closed'}, specimen ${holderLoaded ? 'loaded' : 'not loaded'}`}>
          <div className="xrd-machine-label"><b>XRD-03</b><span>{stage === 'scanning' ? 'SCANNING' : stageIndex >= 3 ? 'READY' : doorOpen ? 'LOAD' : selectedSample ? 'SAMPLE CHOSEN' : 'FREE LAB'}</span></div>
          <div className={`xrd-enclosure ${doorOpen ? 'door-open' : ''}`}>
            <div className="xrd-door"><i /><i /><span>RADIATION ENCLOSURE</span></div>
            <div className="xrd-chamber">
              <div className="xrd-goniometer"><i className="source" /><i className="detector" /><span className={stage === 'scanning' ? 'scanning' : ''} /></div>
              <button type="button" className={`xrd-stage ${holderArmed ? 'drop-ready' : ''}`} disabled={stage !== 'open' || !holderArmed} onClick={loadHolder} aria-label={holderArmed && selectedSample ? `Place ${selectedSample.id} holder on the specimen stage` : 'Specimen stage'}>
                <i className={holderLoaded ? 'loaded' : ''}><span>{holderLoaded ? selectedSample?.id : 'EMPTY'}</span></i>
              </button>
            </div>
          </div>
          <div className="xrd-machine-floor">
            {selectedSample && !holderLoaded && <button type="button" className={`xrd-sample-puck texture-${selectedSample.texture} ${holderArmed ? 'armed' : ''}`} style={{ '--sample-color': selectedSample.color } as React.CSSProperties} disabled={stage !== 'open'} onClick={() => setHolderArmed((current) => !current)}>
              <i /><span>{selectedSample.id}</span><small>{selectedSample.name}</small>
            </button>}
            {stage === 'open' && <span className="xrd-load-cue">{holderArmed ? 'PLACE ON STAGE →' : 'SELECT HOLDER'}</span>}
            {!selectedSample && <span className="xrd-load-cue rack-cue">CHOOSE A SAMPLE →</span>}
          </div>
        </section>

        <aside className="xrd-local-panel">
          <div className="xrd-local-display">
            <span>{selectedSample ? `${selectedSample.id} · RUN ${String(runNumber).padStart(2, '0')}` : 'NO SAMPLE'}</span>
            <b>{!selectedSample ? 'CHOOSE SAMPLE' : stage === 'idle' ? 'OPEN ENCLOSURE' : stage === 'open' ? 'DOOR OPEN' : stage === 'loaded' ? 'SAMPLE SEATED' : stage === 'closed' ? 'READY TO SCAN' : stage === 'scanning' ? 'ACQUIRING' : 'SCAN COMPLETE'}</b>
            <div className="xrd-ready-lamps"><i className={stageIndex >= 2 ? 'on' : ''} /><i className={stageIndex >= 3 ? 'on' : ''} /><i className={stage === 'scanning' ? 'scan' : stageIndex >= 5 ? 'on' : ''} /></div>
          </div>
          <div className="xrd-method-chip"><span>RUN SETUP</span><b>{run?.prep.label ?? '—'}</b><small>{run ? `${run.scan.label} · ${run.scan.minutes} min` : 'CHOOSE ON RIGHT'}</small></div>
          <div className="xrd-machine-controls">
            <button type="button" className="door" disabled={!selectedSample || !['idle', 'loaded'].includes(stage)} onClick={() => onStage(stage === 'idle' ? 'open' : 'closed', context)}><i />{stage === 'loaded' ? 'CLOSE' : 'OPEN'}</button>
            <button type="button" className="start" disabled={stage !== 'closed'} onClick={() => onStage('scanning', context)}><i />START</button>
          </div>
          <div className="xrd-control-proof"><i className={stageIndex >= 3 ? 'ok' : ''} /><span>ENCLOSURE</span><b>{stageIndex >= 3 ? 'CLOSED' : doorOpen ? 'OPEN' : 'STANDBY'}</b></div>
        </aside>

        <section className={`xrd-pattern-desk ${scanVisible ? 'visible' : ''}`} style={{ '--xrd-scan-duration': `${run?.scan.duration ?? 3600}ms` } as React.CSSProperties}>
          <header><div><span>{selectedSample?.id ?? 'FREE LAB'}</span><b>{stage === 'scanning' ? 'PATTERN FORMING' : scanVisible ? 'PATTERN READY' : guided ? 'GUIDED SETUP READY' : 'BUILD A RUN'}</b></div><em>{stage === 'scanning' ? 'LIVE' : scanVisible ? 'MEASURED' : `RUN ${String(runNumber).padStart(2, '0')}`}</em></header>

          {!scanVisible && <div className="xrd-free-config">
            <section className="xrd-sample-rack"><div className="xrd-config-title"><span>1</span><b>SAMPLE RACK</b></div><div>{samples.map((sample) => <button key={sample.id} type="button" disabled={stage !== 'idle' || guided} className={sample.id === sampleId ? 'active' : ''} style={{ '--sample-color': sample.color } as React.CSSProperties} onClick={() => chooseSample(sample.id)}><i className={`texture-${sample.texture}`} /><span>{sample.id}</span><b>{sample.name}</b><small>{sample.cue}</small></button>)}</div></section>
            <div className="xrd-run-choices">
              <section><div className="xrd-config-title"><span>2</span><b>PREP</b></div><div>{prepOptions.map((option) => <button key={option.key} type="button" disabled={stage !== 'idle'} className={prepKey === option.key ? 'active' : ''} onClick={() => setPrepKey(option.key)}><i className={`prep-${option.key}`} /><b>{option.label}</b><small>{option.short}</small></button>)}</div></section>
              <section><div className="xrd-config-title"><span>3</span><b>SCAN</b></div><div>{scanOptions.map((option) => <button key={option.key} type="button" disabled={stage !== 'idle'} className={scanKey === option.key ? 'active' : ''} onClick={() => setScanKey(option.key)}><i className={`scan-${option.key}`} /><b>{option.label}</b><small>{option.minutes} MIN · {option.short}</small></button>)}</div></section>
            </div>
            <div className={`xrd-run-ready ${selectedSample ? 'ready' : ''}`}><span>{selectedSample ? `${selectedSample.id} · ${prepOptions.find((option) => option.key === prepKey)?.label} · ${scanOptions.find((option) => option.key === scanKey)?.label}` : 'CHOOSE ANY SAMPLE'}</span><b>{selectedSample ? 'OPEN THE MACHINE →' : 'START WITH THE RACK'}</b></div>
          </div>}

          {scanVisible && <>
            <svg viewBox="0 0 720 220" role="img" aria-label="Measured diffraction pattern with selectable phase reference markers">
              {[72, 144, 216, 288, 360, 432, 504, 576, 648].map((x) => <line key={x} x1={x} x2={x} y1="18" y2="190" className="grid" />)}
              {[50, 85, 120, 155, 190].map((y) => <line key={y} x1="0" x2="720" y1={y} y2={y} className="grid" />)}
              {selectedPhases.includes('amorphous') && <path d="M180 190 C260 175 300 145 360 142 C425 144 462 176 540 190" className="amorphous-reference" />}
              {selectedPhases.flatMap((key) => phaseReferences.find((phase) => phase.key === key)?.peaks.map((peak) => <line key={`${key}-${peak.x}`} x1={peak.x * 7.2} x2={peak.x * 7.2} y1={194} y2={202 - peak.height * .34} className="phase-stick" style={{ '--phase-color': phaseReferences.find((phase) => phase.key === key)?.color } as React.CSSProperties} />) ?? [])}
              {run && <path d={run.path} pathLength="1" className={stage === 'scanning' ? 'measured-trace acquiring' : 'measured-trace'} />}
              {stage === 'scanning' && <line x1="0" x2="0" y1="18" y2="190" className="scan-cursor" />}
              <text x="0" y="216">10°</text><text x="350" y="216">2θ</text><text x="690" y="216">80°</text>
            </svg>
            <div className="xrd-phase-library">
              {phaseReferences.map((phase) => <button key={phase.key} type="button" disabled={stage !== 'review'} className={selectedPhases.includes(phase.key) ? 'active' : ''} style={{ '--phase-color': phase.color } as React.CSSProperties} onClick={() => togglePhase(phase.key)}><i /><span>{phase.formula}</span><small>{phase.name}</small></button>)}
              <div className={selectedPhases.length ? supported ? 'match-on supported' : 'match-on' : ''}><span>MATCH</span><b>{selectedPhases.length ? `${matched}/${total}` : '—'}</b></div>
            </div>
          </>}
        </section>
      </div>

      {stage === 'review' && <footer className="xrd-disposition-bar xrd-free-decision">
        <div><span>YOUR CALL</span><b>{decisionHint}</b></div>
        <button type="button" disabled={!selectedPhases.length} className={supported ? 'supported' : ''} onClick={() => finishRun(false)}><i className="match" />SAVE CALL</button>
        <button type="button" onClick={() => restart(false)}><i />RERUN</button>
        <button type="button" onClick={() => finishRun(true)}><i className="unclear">?</i>HOLD UNCLEAR</button>
      </footer>}

      {stage === 'complete' && result && <footer className={`xrd-result-strip ${result.uncertain ? 'uncertain' : result.supported ? 'correct' : 'recovered'}`}>
        <div className="result-icon">{result.uncertain ? '?' : result.supported ? '✓' : '!'}</div>
        <div><span>{result.uncertain ? 'VALID HOLD' : result.supported ? 'SUPPORTED CALL' : 'WEAK CALL'}</span><b>{result.summary}</b></div>
        <div className="result-chain"><i>{result.sampleId}</i><u>→</u><i>RUN {String(result.runNumber).padStart(2, '0')}</i><u>→</u><i>{result.uncertain ? 'HOLD' : result.supported ? 'SAVE' : 'REVIEW'}</i></div>
        <div className="xrd-result-actions"><button type="button" onClick={() => restart(false)}>RERUN</button><button type="button" onClick={() => restart(true)}>NEW SAMPLE</button><button type="button" onClick={onClose}>RETURN</button></div>
      </footer>}
    </section>
  </div>;
}
