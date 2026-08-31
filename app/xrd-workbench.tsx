'use client';

import { useEffect, useMemo, useState } from 'react';
import { useModalFocusTrap } from './mission-ui';

export type XrdBenchStage = 'idle' | 'open' | 'loaded' | 'closed' | 'scanning' | 'review' | 'complete';
export type XrdDisposition = 'expected' | 'extra' | 'unclear';

type Peak = { x: number; height: number; width?: number };

const targetPeaks: Peak[] = [
  { x: 12, height: 18 }, { x: 21, height: 46 }, { x: 32, height: 88 },
  { x: 44, height: 38 }, { x: 67, height: 31 }, { x: 79, height: 65 }, { x: 91, height: 24 },
];

const extraPeaks: Peak[] = [{ x: 54, height: 51, width: 1.35 }, { x: 61, height: 17, width: 1.1 }];
const measuredPeaks = [...targetPeaks, ...extraPeaks];

function patternPath(peaks: Peak[]) {
  const width = 720;
  const baseline = 190;
  const points = Array.from({ length: 241 }, (_, index) => {
    const percent = index / 2.4;
    const signal = peaks.reduce((total, peak) => {
      const spread = peak.width ?? 1.05;
      return total + peak.height * Math.exp(-0.5 * ((percent - peak.x) / spread) ** 2);
    }, 0);
    const texture = Math.sin(index * 0.83) * 1.3 + Math.sin(index * 0.19) * 1.1;
    return `${index === 0 ? 'M' : 'L'} ${(percent / 100 * width).toFixed(1)} ${(baseline - signal * 1.65 - texture).toFixed(1)}`;
  });
  return points.join(' ');
}

const stageOrder: XrdBenchStage[] = ['idle', 'open', 'loaded', 'closed', 'scanning', 'review', 'complete'];

export function XrdWorkbench({ stage, disposition, onStage, onDisposition, onClose }: {
  stage: XrdBenchStage;
  disposition: XrdDisposition | null;
  onStage: (stage: XrdBenchStage) => void;
  onDisposition: (decision: XrdDisposition) => void;
  onClose: () => void;
}) {
  const dialogRef = useModalFocusTrap();
  const [holderArmed, setHolderArmed] = useState(false);
  const [targetVisible, setTargetVisible] = useState(false);
  const [extraVisible, setExtraVisible] = useState(false);
  const stageIndex = stageOrder.indexOf(stage);
  const doorOpen = stage === 'open' || stage === 'loaded';
  const holderLoaded = stageIndex >= stageOrder.indexOf('loaded');
  const scanVisible = stage === 'scanning' || stage === 'review' || stage === 'complete';
  const measuredPath = useMemo(() => patternPath(measuredPeaks), []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    if (stage !== 'scanning') return;
    const timer = window.setTimeout(() => onStage('review'), 4600);
    return () => window.clearTimeout(timer);
  }, [stage, onStage]);

  const loadHolder = () => {
    if (stage !== 'open' || !holderArmed) return;
    setHolderArmed(false);
    onStage('loaded');
  };

  return <div className="modal-backdrop xrd-workbench-backdrop" role="presentation">
    <section ref={dialogRef} className={`xrd-workbench stage-${stage}`} role="dialog" aria-modal="true" aria-label="XRD sample check">
      <header>
        <div><span>SAMPLE CHECK · CT-104</span><h2>What did the furnace make?</h2></div>
        <div className="xrd-bench-steps" aria-label="Load, scan, compare, and decide">
          <i className={stageIndex >= 2 ? 'done' : 'active'}><b>1</b><span>LOAD</span></i>
          <i className={stageIndex >= 5 ? 'done' : stageIndex >= 3 ? 'active' : ''}><b>2</b><span>SCAN</span></i>
          <i className={stageIndex >= 6 ? 'done' : stageIndex >= 5 ? 'active' : ''}><b>3</b><span>COMPARE</span></i>
        </div>
        <button type="button" onClick={onClose} aria-label="Close XRD workbench">×</button>
      </header>

      <div className="xrd-workbench-main">
        <section className="xrd-machine-bay" aria-label={`XRD enclosure ${doorOpen ? 'open' : 'closed'}, specimen ${holderLoaded ? 'loaded' : 'not loaded'}`}>
          <div className="xrd-machine-label"><b>XRD-03</b><span>{stage === 'scanning' ? 'SCANNING' : stageIndex >= 3 ? 'READY' : doorOpen ? 'LOAD' : 'STANDBY'}</span></div>
          <div className={`xrd-enclosure ${doorOpen ? 'door-open' : ''}`}>
            <div className="xrd-door"><i /><i /><span>RADIATION ENCLOSURE</span></div>
            <div className="xrd-chamber">
              <div className="xrd-goniometer"><i className="source" /><i className="detector" /><span className={stage === 'scanning' ? 'scanning' : ''} /></div>
              <button type="button" className={`xrd-stage ${holderArmed ? 'drop-ready' : ''}`} disabled={stage !== 'open' || !holderArmed} onClick={loadHolder} aria-label={holderArmed ? 'Place CT-104 holder on the specimen stage' : 'Specimen stage'}>
                <i className={holderLoaded ? 'loaded' : ''}><span>{holderLoaded ? 'CT-104' : 'EMPTY'}</span></i>
              </button>
            </div>
          </div>
          <div className="xrd-machine-floor">
            {!holderLoaded && <button type="button" className={`xrd-sample-puck ${holderArmed ? 'armed' : ''}`} disabled={stage !== 'open'} onClick={() => setHolderArmed((current) => !current)}>
              <i /><span>CT-104</span><small>PREPARED POWDER</small>
            </button>}
            {stage === 'open' && <span className="xrd-load-cue">{holderArmed ? 'PLACE ON STAGE →' : 'SELECT HOLDER'}</span>}
          </div>
        </section>

        <aside className="xrd-local-panel">
          <div className="xrd-local-display">
            <span>CT-104 · Ca–Ti–O</span>
            <b>{stage === 'idle' ? 'LOAD SAMPLE' : stage === 'open' ? 'DOOR OPEN' : stage === 'loaded' ? 'SAMPLE SEATED' : stage === 'closed' ? 'READY TO SCAN' : stage === 'scanning' ? 'ACQUIRING' : 'SCAN COMPLETE'}</b>
            <div className="xrd-ready-lamps"><i className={stageIndex >= 2 ? 'on' : ''} /><i className={stageIndex >= 3 ? 'on' : ''} /><i className={stage === 'scanning' ? 'scan' : stageIndex >= 5 ? 'on' : ''} /></div>
          </div>
          <div className="xrd-method-chip"><span>METHOD</span><b>STANDARD POWDER SCAN</b><small>10–80° · ~4 min</small></div>
          <div className="xrd-machine-controls">
            <button type="button" className="door" disabled={!['idle', 'loaded'].includes(stage)} onClick={() => onStage(stage === 'idle' ? 'open' : 'closed')}><i />{stage === 'loaded' ? 'CLOSE' : 'OPEN'}</button>
            <button type="button" className="start" disabled={stage !== 'closed'} onClick={() => onStage('scanning')}><i />START</button>
          </div>
          <div className="xrd-control-proof"><i className={stageIndex >= 3 ? 'ok' : ''} /><span>ENCLOSURE</span><b>{stageIndex >= 3 ? 'CLOSED' : doorOpen ? 'OPEN' : 'STANDBY'}</b></div>
        </aside>

        <section className={`xrd-pattern-desk ${scanVisible ? 'visible' : ''}`}>
          <header><div><span>CT-104</span><b>{stage === 'scanning' ? 'PATTERN FORMING' : scanVisible ? 'PATTERN READY' : 'WAITING FOR SCAN'}</b></div><em>{stage === 'scanning' ? 'LIVE' : scanVisible ? 'MEASURED' : '—'}</em></header>
          <svg viewBox="0 0 720 220" role="img" aria-label="Measured diffraction pattern and optional expected phase markers">
            <defs><linearGradient id="simpleXrdFill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#2d8ea2" stopOpacity=".28" /><stop offset="1" stopColor="#2d8ea2" stopOpacity="0" /></linearGradient></defs>
            {[72, 144, 216, 288, 360, 432, 504, 576, 648].map((x) => <line key={x} x1={x} x2={x} y1="18" y2="190" className="grid" />)}
            {[50, 85, 120, 155, 190].map((y) => <line key={y} x1="0" x2="720" y1={y} y2={y} className="grid" />)}
            {targetVisible && targetPeaks.map((peak) => <line key={`target-${peak.x}`} x1={peak.x * 7.2} x2={peak.x * 7.2} y1={194} y2={202 - peak.height * .13} className="target-stick" />)}
            {extraVisible && extraPeaks.map((peak) => <line key={`extra-${peak.x}`} x1={peak.x * 7.2} x2={peak.x * 7.2} y1={194} y2={202 - peak.height * .5} className="extra-stick" />)}
            {scanVisible && <path d={measuredPath} pathLength="1" className={stage === 'scanning' ? 'measured-trace acquiring' : 'measured-trace'} />}
            {stage === 'scanning' && <line x1="0" x2="0" y1="18" y2="190" className="scan-cursor" />}
            <text x="0" y="216">10°</text><text x="350" y="216">2θ</text><text x="690" y="216">80°</text>
          </svg>
          <div className="xrd-pattern-tools">
            <button type="button" disabled={!scanVisible || stage === 'scanning'} className={targetVisible ? 'active target' : ''} onClick={() => setTargetVisible((current) => !current)}><i />EXPECTED <b>CaTiO₃</b></button>
            <button type="button" disabled={!targetVisible || stage === 'scanning'} className={extraVisible ? 'active extra' : ''} onClick={() => setExtraVisible((current) => !current)}><i />EXTRA <b>TiO₂?</b></button>
            <div className={targetVisible ? 'match-on' : ''}><span>MATCHED</span><b>{extraVisible ? '9 / 9' : targetVisible ? '7 / 9' : '—'}</b></div>
          </div>
        </section>
      </div>

      {stage === 'review' && <footer className="xrd-disposition-bar">
        <div><span>YOUR CALL</span><b>{targetVisible ? extraVisible ? 'Two peaks align with a possible extra phase.' : 'Most peaks match. Two remain.' : 'Overlay the expected phase first.'}</b></div>
        <button type="button" disabled={!targetVisible} onClick={() => onDisposition('expected')}><i className="match" />EXPECTED ONLY</button>
        <button type="button" disabled={!extraVisible} className="extra" onClick={() => onDisposition('extra')}><i />EXTRA PHASE</button>
        <button type="button" disabled={!targetVisible} onClick={() => onDisposition('unclear')}><i className="unclear" />UNCLEAR</button>
      </footer>}

      {stage === 'complete' && <footer className={`xrd-result-strip ${disposition === 'extra' ? 'correct' : 'recovered'}`}>
        <div className="result-icon">{disposition === 'extra' ? '✓' : '!'}</div>
        <div><span>{disposition === 'extra' ? 'SUPPORTED CALL' : 'REVIEW FEEDBACK'}</span><b>{disposition === 'extra' ? 'Expected phase + extra crystalline phase' : disposition === 'expected' ? 'Two measured peaks were left unexplained' : 'A cautious call, but the extra-phase overlay supported a stronger conclusion'}</b></div>
        <div className="result-chain"><i>CT-104</i><u>→</u><i>PATTERN</i><u>→</u><i>{disposition === 'extra' ? 'HOLD' : 'REVIEW'}</i></div>
        <button type="button" onClick={onClose}>RETURN TO LAB</button>
      </footer>}
    </section>
  </div>;
}
