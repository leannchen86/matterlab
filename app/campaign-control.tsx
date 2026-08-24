'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { campaignSpecs as recipes, getCampaignIdentity, getCampaignOperations, getCampaignSpec } from './campaign-spec';
import type { CampaignOperations } from './campaign-spec';

type CampaignResult = { runNumber: number; candidate: string; measured: string; gap: string; objectiveMet: boolean; elapsed: number; diagnosis?: string };
type CampaignInventory = { crucibles: number; liners: number; carbonTabs: number };

const initialInventory: CampaignInventory = { crucibles: 7, liners: 2, carbonTabs: 1 };

type CampaignRun = {
  stage: number;
  selected: string;
  elapsed: number;
  insight: number;
  message: string;
  runNumber: number;
  thermalBayLevel: number;
  inventory: CampaignInventory;
  history: CampaignResult[];
};

const initialRun: CampaignRun = {
  stage: 0,
  selected: 'C-42',
  elapsed: 0,
  insight: 248,
  runNumber: 42,
  thermalBayLevel: 1,
  inventory: initialInventory,
  history: [],
  message: 'Select a candidate and release one governed experiment into the lab.',
};

const storageKey = 'mattershift-campaign-v2';

export function CampaignControlModal({ autoOpenInventory = false, onClose }: { autoOpenInventory?: boolean; onClose: () => void }) {
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(autoOpenInventory);
  const [run, setRun] = useState<CampaignRun>(() => {
    if (typeof window === 'undefined') return initialRun;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (!saved) return initialRun;
      const parsed = JSON.parse(saved) as Partial<CampaignRun>;
      return { ...initialRun, ...parsed, inventory: { ...initialInventory, ...parsed.inventory } };
    } catch {
      return initialRun;
    }
  });

  const updateRun = (patch: Partial<CampaignRun>) => {
    setRun((current) => {
      const next = { ...current, ...patch };
      try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* no-op */ }
      return next;
    });
  };

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('mattershift:campaign-state', { detail: run }));
  }, [run]);

  const recipe = getCampaignSpec(run.selected);
  const currentRunNumber = Number(run.runNumber ?? 42);
  const history = Array.isArray(run.history) ? run.history : [];
  const adaptiveUnlocked = history.length >= 2;
  const diagnosisUnlocked = history.some((result) => result.candidate === 'D-08' && Boolean(result.diagnosis));
  const availableRecipes = recipes.filter((candidate) => (candidate.id !== 'A-29' || adaptiveUnlocked) && (candidate.id !== 'R-31' || diagnosisUnlocked));
  const identity = getCampaignIdentity(currentRunNumber);
  const operations = getCampaignOperations(currentRunNumber, run.thermalBayLevel);
  const inventory = { ...initialInventory, ...run.inventory };
  const inventoryLow = inventory.crucibles < 6 || inventory.liners < 1 || inventory.carbonTabs < 1;
  const fault = run.stage === 2 && operations.robotConstraint ? 'cell' : run.stage === 4 ? 'queue' : run.stage === 6 && operations.referenceConstraint ? 'qc' : null;
  const robotConditionLabel = operations.robotCondition === 'contamination' ? 'CLEANLINESS' : operations.robotCondition === 'grip-force' ? 'GRIP FORCE' : 'READINESS';
  const referenceConditionLabel = operations.referenceCondition === 'age-due' ? 'CONTROL DUE' : operations.referenceCondition === 'trend-review' ? 'TREND REVIEW' : 'CONTROL CURRENT';
  const conditionSignal = run.stage === 2
    ? operations.robotConstraint ? 'BOTTLENECK DETECTED' : 'ROBOT READINESS'
    : run.stage === 4 ? 'BOTTLENECK DETECTED'
      : run.stage === 6 ? operations.referenceConstraint ? 'BOTTLENECK DETECTED' : 'MEASUREMENT READINESS'
        : run.stage === 8 ? 'DIAGNOSTIC BRANCH'
          : run.stage >= 9 ? 'MECHANISM EVIDENCE RETAINED'
            : run.stage >= 7 ? recipe.objectiveMet ? 'VALID RESULT · TARGET MET' : 'VALID RESULT · TARGET MISSED'
              : 'ROUTE STATUS';
  const conditionDetail = run.stage === 2
    ? `ROBO-02 / ${robotConditionLabel}`
    : run.stage === 4 ? run.thermalBayLevel >= 2 ? 'FURN-04B / READINESS GATE' : 'FURN-04A / CAPACITY 1 OF 1'
      : run.stage === 6 ? `XRD-03 / ${referenceConditionLabel}`
        : run.stage === 8 ? `SEM-01 / ${identity.thermalSample}`
          : run.stage >= 7 ? `${recipe.measured}% · GAP ${recipe.gap}` : 'FLOW NOMINAL';
  const conditionMetric = run.stage === 2
    ? operations.robotConstraint ? `${operations.robotRecoveryMinutes} min recovery` : `${operations.robotRecoveryMinutes} min setup proof`
    : run.stage === 4 ? `${operations.queueMinutes} min wait`
      : run.stage === 6 ? `${operations.referenceAgeHours} h since reference`
        : run.stage === 8 ? '4 fields + EDS map'
          : run.stage >= 9 ? 'diagnosis linked'
            : run.stage >= 7 ? recipe.objectiveMet ? 'objective achieved' : 'valid negative result' : 'no active delay';
  const primary = getPrimaryAction(run.stage, identity.runId, operations);

  const advance = () => {
    if (run.stage === 0) {
      if (inventory.crucibles < 6 || inventory.liners < 1) {
        updateRun({ message: `Release blocked: ${identity.runId} requires six clean alumina crucibles and one sealed prep liner. Replenish the point-of-use rack before material issue.` });
        setInventoryOpen(true);
        return;
      }
      updateRun({ stage: 1, inventory: { ...inventory, crucibles: inventory.crucibles - 6, liners: inventory.liners - 1 }, message: `${recipe.id} released as ${identity.runId}. Six crucibles and one prep liner are lot-bound to the material issue record.` });
    }
    else if (run.stage >= 7) {
      const archivedHistory = history.some((result) => result.runNumber === currentRunNumber)
        ? history
        : [...history, { runNumber: currentRunNumber, candidate: recipe.id, measured: recipe.measured, gap: recipe.gap, objectiveMet: recipe.objectiveMet, elapsed: run.elapsed }];
      const mechanismRecovery = run.stage >= 9 && recipe.id === 'D-08' && archivedHistory.some((result) => result.runNumber === currentRunNumber && Boolean(result.diagnosis));
      const nextSelected = mechanismRecovery ? 'R-31' : run.selected;
      updateRun({ ...initialRun, insight: run.insight, thermalBayLevel: run.thermalBayLevel, inventory, selected: nextSelected, runNumber: currentRunNumber + 1, history: archivedHistory, message: mechanismRecovery
        ? `${identity.runId} diagnosis assimilated. R-31 raises thermal dose while preserving stoichiometry to test the incomplete-conversion hypothesis.`
        : `${identity.runId} archived. Select the next candidate.` });
    }
  };

  const rejectShortcut = (kind: 'robot' | 'furnace') => {
    updateRun({ message: kind === 'robot'
      ? operations.robotCondition === 'grip-force'
        ? 'Command blocked: bypassing the force witness could turn an intermittent grip into a carrier drop or cross-position dosing error.'
        : 'Command blocked: bypassing the cleanliness witness would make contamination indistinguishable from material behavior.'
      : `Command blocked: shortening ${operations.activeFurnaceRun} violates its governed thermal profile. ${identity.runId} remains queued.` });
  };

  const startDiagnosis = () => {
    if (inventory.carbonTabs < 1) {
      updateRun({ message: `SEM route blocked: no released conductive carbon tabs remain at point of use. Replenish and reconcile the consumable lot before mounting ${identity.thermalSample}.` });
      setInventoryOpen(true);
      return;
    }
    updateRun({ stage: 8, inventory: { ...inventory, carbonTabs: inventory.carbonTabs - 1 }, message: `${identity.thermalSample} routed to SEM-01. Carbon-tab lot CT-88 is bound to the stub; four representative BSE fields and an EDS map are required before assigning a mechanism.` });
  };

  const replenishInventory = () => {
    if (run.insight < 35) return;
    updateRun({
      inventory: { crucibles: Math.min(24, inventory.crucibles + 12), liners: Math.min(10, inventory.liners + 4), carbonTabs: Math.min(12, inventory.carbonTabs + 6) },
      elapsed: run.elapsed + 26,
      insight: run.insight - 35,
      message: 'Material issue MI-1186 received and reconciled. Crucibles, prep liners, and conductive tabs are released to their point-of-use locations.',
    });
  };

  const commissionAuxiliaryChamber = () => {
    if (run.thermalBayLevel >= 2 || run.stage > 3 || run.insight < 120) return;
    const qualifiedOperations = getCampaignOperations(currentRunNumber, 2);
    updateRun({
      thermalBayLevel: 2,
      elapsed: run.elapsed + 48,
      insight: run.insight - 120,
      message: `FURN-04B commissioned after an empty cycle and nine-point uniformity survey. ${identity.runId} now has a qualified auxiliary lane with a ${qualifiedOperations.queueMinutes}-minute readiness gate.`,
    });
  };

  const viewInLab = () => {
    const stationId = run.stage <= 1 ? 'PREP-01' : run.stage <= 3 ? 'ROBO-02' : run.stage <= 5 ? 'FURN-04' : run.stage <= 7 ? 'XRD-03' : 'SEM-01';
    onClose();
    window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('mattershift:return-to-lab', { detail: { stationId } })));
  };

  return <div className="modal-backdrop campaign-backdrop" role="presentation">
    <section className="modal-card campaign-control" role="dialog" aria-modal="true" aria-label="Materials campaign control">
      <header>
        <div><p className="section-kicker">SANDBOX CAMPAIGN · MAT-{identity.suffix}</p><h2>Materials campaign control</h2></div>
        <div className="campaign-header-actions"><button type="button" className={inventoryLow ? 'inventory-low' : ''} onClick={() => setInventoryOpen(true)}><i />MATERIAL STAGING<b>{inventory.crucibles} CRUC · {inventory.liners} LIN · {inventory.carbonTabs} TAB</b></button><button type="button" onClick={onClose} aria-label="Close dialog">×</button></div>
      </header>

      <div className="campaign-hud">
        <div><span>OBJECTIVE</span><b>Target phase ≥ 96%</b></div>
        <div><span>LAB CLOCK</span><b>+{run.elapsed} min</b></div>
        <div><span>INSIGHT</span><b>{run.insight} RP</b></div>
        <div><span>FURNACE-LIMITED RATE</span><b>{run.thermalBayLevel >= 2 ? '0.31 runs / h' : recipe.throughput}</b></div>
        <div className={fault ? 'hud-alert' : ''}><span>ACTIVE CONSTRAINT</span><b>{fault === 'cell' ? 'ROBOT CELL' : fault === 'queue' ? 'FURNACE QUEUE' : fault === 'qc' ? 'XRD QC' : 'NONE'}</b></div>
      </div>

      <div className="campaign-workspace">
        <aside className="campaign-designer">
          <div className="campaign-panel-head"><div><span>EXPERIMENT DESIGN</span><b>{diagnosisUnlocked ? 'MECHANISM CANDIDATES' : adaptiveUnlocked ? 'ADAPTIVE CANDIDATES' : 'AI CANDIDATES'}</b></div><em>{String(availableRecipes.length).padStart(2, '0')}</em></div>
          <div className="campaign-design-space" aria-label="Composition and temperature design space">
            <svg viewBox="0 0 320 180" role="img" aria-label={`${recipe.id} selected in the materials design space`}>
              <defs><radialGradient id="campaignHalo"><stop offset="0" stopColor="#4dd5ed" stopOpacity=".24" /><stop offset="1" stopColor="#4dd5ed" stopOpacity="0" /></radialGradient></defs>
              <path className="campaign-contour" d="M28 142 C72 64 126 34 191 42 C249 49 280 85 292 132" />
              <path className="campaign-contour faint" d="M51 144 C91 82 135 61 184 64 C229 67 257 93 270 132" />
              <path className="campaign-boundary" d="M40 144 L153 31 L286 144 Z" />
              <circle cx="105" cy="107" r="5" /><circle cx="142" cy="78" r="5" /><circle cx="217" cy="120" r="5" />
              {history.slice(-6).map((result, index) => {
                const measuredSpec = getCampaignSpec(result.candidate);
                const offset = (index % 3) * 4 - 4;
                return <g key={`${result.runNumber}-${result.candidate}`}>
                  <circle className={`campaign-result-point ${result.objectiveMet ? 'hit' : 'miss'}`} cx={measuredSpec.point[0] + offset} cy={measuredSpec.point[1] + 13 + Math.floor(index / 3) * 5} r="5" />
                  <text className="campaign-result-label" x={measuredSpec.point[0] + offset + 7} y={measuredSpec.point[1] + 17 + Math.floor(index / 3) * 5}>{result.measured}</text>
                </g>;
              })}
              <circle className="proposal-halo" cx={recipe.point[0]} cy={recipe.point[1]} r="24" />
              <circle className="campaign-proposal" cx={recipe.point[0]} cy={recipe.point[1]} r="7" />
              <path className="proposal-cross" d={`M${recipe.point[0] - 12} ${recipe.point[1]}h24M${recipe.point[0]} ${recipe.point[1] - 12}v24`} />
              <text x="24" y="160">Ca-rich</text><text x="145" y="23">TEMPERATURE</text><text x="265" y="160">Ti-rich</text>
              <text className="proposal-label" x={recipe.point[0] + 12} y={recipe.point[1] - 10}>{recipe.id}</text>
            </svg>
            <footer><span><i /> PRIOR</span><span><i className="proposal" /> PROPOSED</span><b>{history.length} RUNS · UNCERTAINTY {recipe.uncertainty}</b></footer>
          </div>
          <div className="candidate-list">
            {availableRecipes.map((candidate) => {
              const measured = [...history].reverse().find((result) => result.candidate === candidate.id);
              return <button key={candidate.id} type="button" className={`${candidate.id === run.selected ? 'active ' : ''}${candidate.id === 'A-29' ? 'learned' : candidate.id === 'R-31' ? 'mechanism' : ''}`} disabled={run.stage > 0} onClick={() => updateRun({ selected: candidate.id, message: `${candidate.id} selected. Review its synthesis envelope before release.` })}>
                <span>{candidate.id}</span><div><b>{candidate.name}</b><small>{candidate.formula}</small></div><em>{measured ? `${measured.measured}% ${measured.objectiveMet ? '✓' : '·'}` : candidate.prediction}</em>
              </button>;
            })}
            {!adaptiveUnlocked && <div className="candidate-lock"><span>◇</span><div><b>ADAPTIVE SLOT LOCKED</b><small>retain 2 qualified results</small></div><em>{history.length} / 2</em></div>}
          </div>
          <div className="recipe-envelope"><span>SYNTHESIS ENVELOPE</span><div><b>{recipe.temperature}</b><small>calcination</small></div><div><b>{recipe.dwell}</b><small>dwell</small></div><div><b>{recipe.prediction}</b><small>predicted phase</small></div></div>
          {history.length > 0 && <div className="campaign-history"><span>MODEL MEMORY</span>{history.slice(-3).map((result) => <div key={result.runNumber}><b>RUN-{String(result.runNumber).padStart(3, '0')}</b><i>{result.candidate}{result.diagnosis ? ' · DIAG' : ''}</i><em className={result.objectiveMet ? 'hit' : 'miss'}>{result.measured}%</em></div>)}</div>}
        </aside>

        <section className="campaign-routing">
          <div className="campaign-panel-head"><div><span>LIVE MATERIAL ROUTE</span><b>{identity.runId} · {recipe.id}</b></div><em>{run.stage >= 8 ? '09 / 09' : `${String(Math.min(run.stage + 1, 8)).padStart(2, '0')} / 08`}</em></div>
          <div className="route-board">
            <RouteCell code="PREP-01" label="PREP" cycle="12 MIN" state={routeState(run.stage, 1, 2)} current={run.stage === 1} job={run.stage >= 1 ? identity.runId : 'OPEN'} />
            <RouteCell code="ROBO-02" label="SYNTHESIZE" cycle="14 MIN" state={run.stage === 2 ? operations.robotConstraint ? 'fault' : 'active' : routeState(run.stage, 3, 4)} current={run.stage === 2 || run.stage === 3} job={run.stage === 2 ? operations.robotCondition === 'contamination' ? 'CONTAM HOLD' : operations.robotCondition === 'grip-force' ? 'FORCE CHECK' : 'READY CHECK' : run.stage >= 3 ? identity.runId : 'WAIT'} />
            <RouteCell code={operations.furnaceLane} label="CALCINE" cycle={`${recipe.thermalMinutes} MIN`} state={run.stage === 4 ? 'queued' : routeState(run.stage, 5, 6)} current={run.stage === 5} job={run.stage === 4 ? run.thermalBayLevel >= 2 ? 'READY GATE' : 'Q 01' : run.stage >= 5 ? identity.runId : run.thermalBayLevel >= 2 ? 'QUALIFIED' : operations.activeFurnaceRun} />
            <RouteCell code="XRD-03" label="MEASURE" cycle="18 MIN" state={run.stage === 6 ? operations.referenceConstraint ? 'fault' : 'active' : routeState(run.stage, 6, 7)} current={run.stage === 6} job={run.stage === 6 ? operations.referenceCondition === 'age-due' ? 'QC HOLD' : operations.referenceCondition === 'trend-review' ? 'TREND CHECK' : 'ACQUIRE' : run.stage >= 7 ? identity.runId : 'RUN-038'} />
            <RouteCell code={run.stage >= 8 ? 'SEM-01' : 'MODEL'} label={run.stage >= 8 ? 'DIAGNOSE' : 'LEARN'} cycle={run.stage >= 8 ? '26 MIN' : 'GATED'} state={run.stage >= 9 ? 'complete' : run.stage === 8 ? 'active' : run.stage >= 7 ? 'complete' : 'waiting'} current={run.stage === 8} job={run.stage >= 9 ? '4 FIELDS + MAP' : run.stage === 8 ? identity.thermalSample : run.stage >= 7 ? `+${recipe.insightReward} RP` : 'EVIDENCE'} />
          </div>

          <div className={`constraint-console ${fault ? `fault-${fault}` : run.stage === 8 ? 'fault-qc' : run.stage >= 7 ? recipe.objectiveMet ? 'result-hit' : 'result-miss' : ''}`}>
            <div className="constraint-signal"><span>{conditionSignal}</span><b>{conditionDetail}</b><i /></div>
            <div className="constraint-visual" aria-label="Campaign queue visualization">
              <span className="queue-axis">QUEUE</span>
              <div className={`queue-token token-a ${run.stage >= 4 ? 'visible' : ''}`}>{identity.suffix}</div>
              <div className={`queue-token token-b ${run.stage === 4 ? 'visible' : ''}`}>{String(currentRunNumber + 1).padStart(3, '0')}</div>
              <div className={`machine-aperture ${fault ? 'held' : ''}`}><i /><b>{fault ? run.thermalBayLevel >= 2 && fault === 'queue' ? 'QUAL' : 'HOLD' : 'READY'}</b></div>
              <em>{conditionMetric}</em>
            </div>
            <p>{run.message}</p>
          </div>

          <div className="campaign-timeline" aria-label="Equipment schedule">
            <header><span>EQUIPMENT SCHEDULE</span><b>NOW</b><i>+2 H</i><i>+4 H</i><i>+6 H</i></header>
            <div><span>ROBO-02</span><i className="bar robot" /><b>{identity.runId}</b></div>
            <div><span>FURN-04A</span><i className="bar furnace" /><b>{operations.activeFurnaceRun.replace('RUN-', '')}</b>{run.thermalBayLevel < 2 && <><i className="bar furnace queued" /><b>{identity.suffix}</b></>}</div>
            {run.thermalBayLevel >= 2 && <div><span>FURN-04B</span><i className="bar furnace aux" /><b>{run.stage >= 5 ? identity.suffix : 'QUAL'}</b></div>}
            <div><span>XRD-03</span><i className="bar xrd" /><b>REF</b><i className="bar xrd queued" /><b>{identity.suffix}</b></div>
            {run.stage >= 8 && <div><span>SEM-01</span><i className="bar sem" /><b>{run.stage >= 9 ? 'MAP' : '4× BSE'}</b></div>}
          </div>

          <div className={`thermal-capacity-panel level-${run.thermalBayLevel}`}>
            <header><div><span>THERMAL BAY CONFIGURATION</span><b>FURN-04 · INDEPENDENT CHAMBERS</b></div><em>{run.thermalBayLevel} / 2 QUALIFIED</em></header>
            <div className="thermal-bay-mimic" aria-label={`Thermal bay with ${run.thermalBayLevel} qualified chamber${run.thermalBayLevel === 1 ? '' : 's'}`}>
              <article className="online"><i /><span>CHAMBER A</span><b>{operations.activeFurnaceRun}</b><small>occupied · governed profile</small></article>
              <i className="thermal-bus" />
              <article className={run.thermalBayLevel >= 2 ? 'online auxiliary' : 'offline'}><i /><span>CHAMBER B</span><b>{run.thermalBayLevel >= 2 ? 'QUALIFIED' : 'NOT COMMISSIONED'}</b><small>{run.thermalBayLevel >= 2 ? `${operations.queueMinutes} min readiness · independent TC` : 'empty cycle + 9-point survey required'}</small></article>
            </div>
            <div className="thermal-capacity-metrics"><span>QUALIFICATION<b>{run.thermalBayLevel >= 2 ? 'IQ / OQ RETAINED' : '120 RP · 48 MIN'}</b></span><span>CAMPAIGN WAIT<b>{operations.queueMinutes} MIN</b></span><span>RATE<b>{run.thermalBayLevel >= 2 ? '0.31 RUNS / H' : recipe.throughput.toUpperCase()}</b></span></div>
            <button type="button" disabled={run.thermalBayLevel < 2 && (run.stage > 3 || run.insight < 120)} onClick={() => setCommissionOpen(true)}>{run.thermalBayLevel >= 2 ? 'VIEW IQ / OQ RECORD' : run.stage > 3 ? 'COMMISSIONING WINDOW CLOSED' : run.insight < 120 ? '120 RP REQUIRED' : 'OPEN COMMISSIONING'}<span>→</span></button>
          </div>
        </section>
      </div>

      <footer className="campaign-actions">
        <div><span>PLAYER COMMAND</span><b>{run.stage === 8 || run.stage >= 9 ? primary.hint : run.stage >= 7 ? `${recipe.id} · ${recipe.measured}% · ${recipe.gap}` : primary.hint}</b></div>
        {run.stage === 2 && operations.robotConstraint && <button type="button" className="secondary" onClick={() => rejectShortcut('robot')}>{operations.robotCondition === 'grip-force' ? 'BYPASS FORCE WITNESS' : 'BYPASS CLEAN WITNESS'}</button>}
        {run.stage === 4 && <button type="button" className="secondary" onClick={() => rejectShortcut('furnace')}>SHORTEN {operations.activeFurnaceRun}</button>}
        {run.stage === 7 && !recipe.objectiveMet && <button type="button" className="secondary diagnosis" onClick={startDiagnosis}>ROUTE TO SEM / EDS</button>}
        <button type="button" onClick={run.stage > 0 && (run.stage < 7 || run.stage === 8) ? viewInLab : advance}>{primary.label}<span>→</span></button>
      </footer>
    </section>
    {commissionOpen && <ThermalCommissioningModal alreadyQualified={run.thermalBayLevel >= 2} activeRun={operations.activeFurnaceRun} queueMinutes={getCampaignOperations(currentRunNumber, 2).queueMinutes} onComplete={() => { commissionAuxiliaryChamber(); setCommissionOpen(false); }} onClose={() => setCommissionOpen(false)} />}
    {inventoryOpen && <InventoryServiceModal inventory={inventory} budgetReady={run.insight >= 35} onComplete={() => { replenishInventory(); setInventoryOpen(false); }} onClose={() => setInventoryOpen(false)} />}
  </div>;
}

function InventoryServiceModal({ inventory, budgetReady, onComplete, onClose }: { inventory: CampaignInventory; budgetReady: boolean; onComplete: () => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [feedback, setFeedback] = useState('');
  const accepted = step >= 3;
  const execute = (target: number) => {
    if (target !== step + 1) return;
    setFeedback('');
    setStep(target);
  };
  return <div className="inventory-service-backdrop" role="presentation">
    <section className="inventory-service" role="dialog" aria-modal="true" aria-label="Point-of-use material staging">
      <header><div><p className="section-kicker">MATERIAL ISSUE · MI-1186</p><h2>Point-of-use replenishment</h2></div><button type="button" onClick={onClose} aria-label="Close material staging">×</button></header>
      <div className="inventory-status"><span>MOVE TOTE<b>MAT-MOV-1186</b></span><span>RECEIPT STATE<b>{accepted ? 'RECONCILED' : step >= 1 ? 'IN PROCESS' : 'AWAITING SCAN'}</b></span><span>LAB IMPACT<b>26 MIN · 35 RP</b></span></div>
      <div className="inventory-workspace">
        <div className="inventory-rack" aria-label="Point-of-use consumables rack">
          <header><span>PREP / CHARACTERIZATION CONSUMABLES</span><b>{accepted ? 'RELEASE READY' : 'CURRENT + INBOUND'}</b></header>
          <div className="stock-bins">
            <StockBin kind="crucibles" label="ALUMINA CRUCIBLES" lot="ALC-806" count={inventory.crucibles} inbound={12} capacity={24} active={step >= 2} />
            <StockBin kind="liners" label="SEALED PREP LINERS" lot="PL-219" count={inventory.liners} inbound={4} capacity={10} active={step >= 2} />
            <StockBin kind="tabs" label="CONDUCTIVE TABS" lot="CT-88" count={inventory.carbonTabs} inbound={6} capacity={12} active={step >= 2} />
          </div>
          <div className="material-flow"><i className={step >= 1 ? 'active' : ''} /><span>RECEIVING</span><i className={step >= 2 ? 'active' : ''} /><span>LOT RECONCILE</span><i className={step >= 3 ? 'active' : ''} /><span>POINT OF USE</span></div>
        </div>
        <div className="inventory-controls">
          <p className="modal-intro">Receive the material tote against its move record, reconcile each physical lot, then release the bins to point of use. Stock counts do not change until the receipt is retained.</p>
          <ol>
            <InventoryStep number="01" title="Scan move tote + destination" note="MAT-MOV-1186 · PREP-01" done={step >= 1} active={step === 0} onClick={() => execute(1)} />
            <InventoryStep number="02" title="Reconcile lots + quantities" note="12 crucibles · 4 liners · 6 tabs" done={step >= 2} active={step === 1} onClick={() => execute(2)} />
            <InventoryStep number="03" title="Inspect seals + release bins" note="packaging intact · locations matched" done={step >= 3} active={step === 2} onClick={() => execute(3)} />
          </ol>
          {!accepted && <button type="button" className="inventory-shortcut" onClick={() => setFeedback('Blocked: an unscanned tote can place the correct-looking material under the wrong lot, location, or expiry state.')}>RECEIVE WITHOUT SCAN</button>}
          {feedback && <p className="inventory-feedback">{feedback}</p>}
          <button type="button" className="inventory-accept" disabled={!accepted || !budgetReady} onClick={onComplete}>{!budgetReady ? '35 RP OPERATIONS BUDGET REQUIRED' : accepted ? 'RETAIN RECEIPT · RELEASE STOCK' : 'COMPLETE MATERIAL RECEIPT'}</button>
        </div>
      </div>
    </section>
  </div>;
}

function StockBin({ kind, label, lot, count, inbound, capacity, active }: { kind: string; label: string; lot: string; count: number; inbound: number; capacity: number; active: boolean }) {
  const projected = Math.min(capacity, count + inbound);
  return <article className={`stock-bin ${kind} ${active ? 'receiving' : ''}`}><div className="stock-bin-visual"><div>{Array.from({ length: Math.min(projected, 12) }, (_, index) => <i key={index} className={index >= Math.min(count, 12) ? 'inbound' : ''} />)}</div><em style={{ '--stock': `${Math.min(100, (projected / capacity) * 100)}%` } as CSSProperties} /></div><span>{label}</span><b>{count} <small>+ {active ? inbound : 0}</small></b><footer>{lot} · MAX {capacity}</footer></article>;
}

function InventoryStep({ number, title, note, done, active, onClick }: { number: string; title: string; note: string; done: boolean; active: boolean; onClick: () => void }) {
  return <li className={done ? 'done' : active ? 'active' : ''}><button type="button" disabled={!active || done} onClick={onClick}><i>{done ? '✓' : number}</i><span><b>{title}</b><small>{done ? 'physical + digital state retained' : note}</small></span></button></li>;
}

function ThermalCommissioningModal({ alreadyQualified, activeRun, queueMinutes, onComplete, onClose }: { alreadyQualified: boolean; activeRun: string; queueMinutes: number; onComplete: () => void; onClose: () => void }) {
  const [isolated, setIsolated] = useState(false);
  const [emptyProven, setEmptyProven] = useState(false);
  const [cycleRan, setCycleRan] = useState(false);
  const [surveyRetained, setSurveyRetained] = useState(false);
  const [feedback, setFeedback] = useState('');
  const isolationReady = alreadyQualified || isolated;
  const emptyReady = alreadyQualified || emptyProven;
  const cycleReady = alreadyQualified || cycleRan;
  const surveyReady = alreadyQualified || surveyRetained;
  const temperatures = [988.1, 991.4, 986.8, 989.7, 993.2, 987.6, 990.8, 985.8, 992.1];
  const execute = (step: 'isolate' | 'empty' | 'cycle' | 'survey') => {
    setFeedback('');
    if (step === 'isolate') setIsolated(true);
    if (step === 'empty' && isolated) setEmptyProven(true);
    if (step === 'cycle' && isolated && emptyProven) setCycleRan(true);
    if (step === 'survey' && cycleRan) setSurveyRetained(true);
  };
  return <div className="commissioning-backdrop" role="presentation">
    <section className="thermal-commissioning" role="dialog" aria-modal="true" aria-label="FURN-04B commissioning workflow">
      <header><div><p className="section-kicker">ASSET COMMISSIONING · FURN-04B</p><h2>Auxiliary chamber IQ / OQ</h2></div><button type="button" onClick={onClose} aria-label="Close commissioning workflow">×</button></header>
      <div className="commissioning-status"><span>CHAMBER A<b>{activeRun} · GOVERNED</b></span><span>CHAMBER B<b>{surveyReady ? 'QUALIFIED' : cycleReady ? 'SURVEY REVIEW' : 'COMMISSIONING HOLD'}</b></span><span>PROJECTED GATE<b>{queueMinutes} MIN</b></span></div>
      <div className="commissioning-workspace">
        <div className="commissioning-visual">
          <div className="commissioning-visual-head"><span>EMPTY-CYCLE THERMAL UNIFORMITY</span><b>{surveyReady ? 'IQ / OQ ACCEPTED' : cycleReady ? '9-POINT DATA READY' : 'NO QUALIFIED TRACE'}</b></div>
          <svg viewBox="0 0 620 310" role="img" aria-label="Dual chamber furnace commissioning with empty-cycle trace and nine-point uniformity survey">
            <defs><pattern id="commissionGrid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" className="grid" /></pattern><radialGradient id="commissionHeat"><stop stopColor="#ffb268" stopOpacity=".7" /><stop offset="1" stopColor="#a34d20" stopOpacity=".08" /></radialGradient></defs>
            <rect width="620" height="310" fill="url(#commissionGrid)" />
            <rect x="28" y="38" width="238" height="160" rx="7" className="commission-cabinet" /><rect x="49" y="63" width="196" height="104" rx="4" className="commission-chamber active" /><ellipse cx="147" cy="114" rx="78" ry="40" fill="url(#commissionHeat)" /><text x="92" y="119">CHAMBER A</text><text x="93" y="139">{activeRun}</text>
            <rect x="354" y="38" width="238" height="160" rx="7" className={isolationReady ? 'commission-cabinet proven' : 'commission-cabinet'} /><rect x="375" y="63" width="196" height="104" rx="4" className={cycleReady ? 'commission-chamber qualified' : 'commission-chamber'} />
            <text x="434" y="91">CHAMBER B</text>{temperatures.map((temperature, index) => { const x = 409 + (index % 3) * 64; const y = 113 + Math.floor(index / 3) * 22; return <g key={temperature} className={cycleReady ? 'survey-point ready' : 'survey-point'}><circle cx={x} cy={y} r="7" /><text x={x + 10} y={y + 3}>{cycleReady ? temperature.toFixed(1) : '—'}</text></g>; })}
            <line x1="28" x2="592" y1="237" y2="237" className="commission-axis" /><path d={cycleReady ? 'M32 278 C92 277 112 254 146 246 S205 238 244 238 L432 238 C470 239 498 247 520 262 S560 278 588 279' : 'M32 279 H588'} className={cycleReady ? 'commission-trace ready' : 'commission-trace'} /><text x="30" y="300">23 °C</text><text x="272" y="300">990 °C EMPTY CYCLE</text><text x="546" y="300">COOL</text>
          </svg>
          <div className="commissioning-result-strip"><span>SETPOINT<b>990.0 °C</b></span><span>MEAN<b>{cycleReady ? '989.5 °C' : '—'}</b></span><span>SPAN<b>{cycleReady ? '7.4 °C' : '—'}</b></span><span>LIMIT<b>≤ 8.0 °C</b></span></div>
        </div>
        <div className="commissioning-controls">
          <p className="modal-intro">Qualify chamber B without disturbing the governed run in chamber A. Each proof is independent; copied calibration values are not current equipment evidence.</p>
          <ol>
            <CommissionStep number="01" title="Isolate chamber B outputs" note="Independent controller + contactor state" done={isolationReady} active={!isolationReady} onClick={() => execute('isolate')} />
            <CommissionStep number="02" title="Prove empty chamber + door" note="No carrier · latch chain closed" done={emptyReady} active={isolationReady && !emptyReady} onClick={() => execute('empty')} />
            <CommissionStep number="03" title="Run 990 °C empty cycle" note="Ramp · dwell · controlled cool" done={cycleReady} active={emptyReady && !cycleReady} onClick={() => execute('cycle')} />
            <CommissionStep number="04" title="Retain nine-point survey" note="Span ≤ 8.0 °C · independent TC" done={surveyReady} active={cycleReady && !surveyReady} onClick={() => execute('survey')} />
          </ol>
          {!alreadyQualified && !cycleReady && <button type="button" className="commission-shortcut" onClick={() => setFeedback('Blocked: chamber A calibration does not prove chamber B uniformity, controller accuracy, or current empty-cycle behavior.')}>COPY CHAMBER A CALIBRATION</button>}
          {feedback && <p className="commission-feedback">{feedback}</p>}
          <button type="button" className="commission-accept" disabled={!surveyReady} onClick={alreadyQualified ? onClose : onComplete}>{alreadyQualified ? 'CLOSE QUALIFICATION RECORD' : surveyReady ? 'ACCEPT IQ / OQ · RELEASE CHAMBER B' : 'COMPLETE COMMISSIONING SEQUENCE'}</button>
        </div>
      </div>
    </section>
  </div>;
}

function CommissionStep({ number, title, note, done, active, onClick }: { number: string; title: string; note: string; done: boolean; active: boolean; onClick: () => void }) {
  return <li className={done ? 'done' : active ? 'active' : ''}><button type="button" disabled={!active || done} onClick={onClick}><i>{done ? '✓' : number}</i><span><b>{title}</b><small>{done ? 'equipment feedback retained' : note}</small></span></button></li>;
}

function RouteCell({ code, label, cycle, state, current, job }: { code: string; label: string; cycle: string; state: string; current: boolean; job: string }) {
  return <article className={`route-cell state-${state} ${current ? 'current' : ''}`}>
    <header><span>{code}</span><i>{state === 'complete' ? '✓' : state === 'fault' ? '!' : state === 'queued' ? 'Q' : '·'}</i></header>
    <div className="route-machine"><i /><i /><b /></div>
    <h3>{label}</h3><small>{cycle}</small><em>{job}</em>
  </article>;
}

function routeState(stage: number, active: number, complete: number) {
  if (stage >= complete) return 'complete';
  if (stage === active) return 'active';
  return 'waiting';
}

function getPrimaryAction(stage: number, runId: string, operations: CampaignOperations) {
  return [
    { label: 'QUEUE GOVERNED RUN', hint: 'Release the selected recipe to PREP-01' },
    { label: 'OPERATE PREP-01', hint: 'Walk down the setup, then prove the preparation controls' },
    operations.robotCondition === 'contamination'
      ? { label: 'RECOVER ROBO-02', hint: 'Inspect, clean, and qualify the gripper at the cell' }
      : operations.robotCondition === 'grip-force'
        ? { label: 'PROVE ROBO-02 TOOLING', hint: 'Inspect the jaw pads and acquire a governed force witness' }
        : { label: 'PROVE ROBO-02 READY', hint: 'Confirm tool identity and the carrier handshake before dosing' },
    { label: 'OPERATE ROBO-02', hint: 'Prove the carrier and execute six-position dosing' },
    { label: 'OPERATE FURN-04', hint: 'Verify occupancy, Q01, and the physical hold location' },
    { label: 'START FURN-04 PROFILE', hint: 'Prove the load and start the governed thermal cycle' },
    operations.referenceCondition === 'age-due'
      ? { label: 'QUALIFY XRD-03', hint: `Run the due Si control before measuring ${runId}` }
      : operations.referenceCondition === 'trend-review'
        ? { label: 'REVIEW XRD-03 TREND', hint: `Confirm the Si trend before measuring ${runId}` }
        : { label: 'OPERATE XRD-03', hint: `Review the current Si control and acquire ${runId}` },
    { label: 'START NEXT CAMPAIGN', hint: 'AI-eligible result · objective missed by 0.2 percentage point' },
    { label: 'OPERATE SEM-01', hint: 'Acquire representative BSE fields and an EDS map' },
    { label: 'PROPOSE RECOVERY RUN', hint: 'Use the diagnosis to change the next governed experiment' },
  ][stage] ?? { label: 'START NEXT CAMPAIGN', hint: 'Clear the completed lane' };
}
