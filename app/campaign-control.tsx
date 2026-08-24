'use client';

import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { buildCustomCampaignSpec, campaignMissions, campaignSpecs as recipes, customCompositionOptions, evaluateCampaignMission, forecastCampaignMission, getAuthoredCampaignFollowUp, getCampaignIdentity, getCampaignMission, getCampaignOperations, getCampaignSpec } from './campaign-spec';
import type { CampaignMissionId, CampaignOperations, CampaignSpec, CustomComposition } from './campaign-spec';

type CampaignCycle = { handling: number; queue: number; recovery: number; thermal: number; measure: number; decisions: number };
type CampaignResult = { runNumber: number; candidate: string; measured: string; gap: string; objectiveMet: boolean; elapsed: number; missionId?: CampaignMissionId; diagnosis?: string; thermalBayLevel?: number; cycle?: CampaignCycle };
type CampaignInventory = { crucibles: number; liners: number; carbonTabs: number };
type CampaignBacklogItem = { runNumber: number; candidate: string; missionId: CampaignMissionId };

const initialInventory: CampaignInventory = { crucibles: 7, liners: 2, carbonTabs: 1 };

type CampaignRun = {
  stage: number;
  selected: string;
  elapsed: number;
  insight: number;
  message: string;
  runNumber: number;
  missionId: CampaignMissionId;
  thermalBayLevel: number;
  customCandidate?: string;
  inventory: CampaignInventory;
  history: CampaignResult[];
  backlog: CampaignBacklogItem[];
  plannedThermalUpgrade?: boolean;
  resultDecision?: 'diagnose' | 'synthesize';
};

const initialRun: CampaignRun = {
  stage: 0,
  selected: 'C-42',
  elapsed: 0,
  insight: 248,
  runNumber: 42,
  missionId: 'purity',
  thermalBayLevel: 1,
  inventory: initialInventory,
  history: [],
  backlog: [],
  plannedThermalUpgrade: false,
  message: 'Select a candidate and release one governed experiment into the lab.',
};

const storageKey = 'mattershift-campaign-v2';

function meanThermalCompletion(items: CampaignBacklogItem[], lanes: number) {
  if (!items.length) return 0;
  const laneLoads = Array.from({ length: Math.max(1, lanes) }, () => 0);
  const completions = items.map((item) => {
    const laneIndex = laneLoads.indexOf(Math.min(...laneLoads));
    laneLoads[laneIndex] += getCampaignSpec(item.candidate).thermalMinutes;
    return laneLoads[laneIndex];
  });
  return Math.round(completions.reduce((total, completion) => total + completion, 0) / completions.length);
}

export function CampaignControlModal({ autoOpenInventory = false, onClose }: { autoOpenInventory?: boolean; onClose: () => void }) {
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(autoOpenInventory);
  const [facilityOpen, setFacilityOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
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
    const decisionMessage = patch.message && patch.message !== run.message ? patch.message : '';
    setRun((current) => {
      const next = { ...current, ...patch };
      try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* no-op */ }
      return next;
    });
    if (decisionMessage) window.queueMicrotask(() => window.dispatchEvent(new CustomEvent('mattershift:station-event', { detail: { type: 'campaign', text: decisionMessage } })));
  };

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('mattershift:campaign-state', { detail: run }));
  }, [run]);

  const recipe = getCampaignSpec(run.selected);
  const currentRunNumber = Number(run.runNumber ?? 42);
  const history = Array.isArray(run.history) ? run.history : [];
  const backlog = Array.isArray(run.backlog) ? run.backlog : [];
  const adaptiveUnlocked = history.length >= 2;
  const diagnosisUnlocked = history.some((result) => result.candidate === 'D-08' && Boolean(result.diagnosis));
  const customCandidate = run.customCandidate ? getCampaignSpec(run.customCandidate) : null;
  const availableRecipes = [...recipes, ...(customCandidate ? [customCandidate] : [])].filter((candidate) => (candidate.id !== 'A-29' || adaptiveUnlocked) && (candidate.id !== 'R-31' || diagnosisUnlocked));
  const identity = getCampaignIdentity(currentRunNumber);
  const operations = getCampaignOperations(currentRunNumber, run.thermalBayLevel);
  const mission = getCampaignMission(run.missionId);
  const retainedResult = run.history.find((result) => result.runNumber === currentRunNumber);
  const observedRecipe = retainedResult?.measured ? { ...recipe, measured: retainedResult.measured } : recipe;
  const observedMeasured = observedRecipe.measured;
  const evaluation = evaluateCampaignMission(observedRecipe, run.missionId, run.stage >= 7 ? retainedResult?.elapsed ?? run.elapsed : undefined);
  const retainedElapsed = retainedResult?.elapsed ?? run.elapsed;
  const retainedBayLevel = retainedResult?.thermalBayLevel ?? run.thermalBayLevel;
  const retainedOperations = getCampaignOperations(currentRunNumber, retainedBayLevel);
  const knownCycleMinutes = 12 + retainedOperations.robotRecoveryMinutes + 14 + retainedOperations.queueMinutes + retainedOperations.furnaceRecoveryMinutes + recipe.thermalMinutes + 18;
  const retainedCycle: CampaignCycle = retainedResult?.cycle ?? {
    handling: 12 + retainedOperations.robotRecoveryMinutes + 14,
    queue: retainedOperations.queueMinutes,
    recovery: retainedOperations.furnaceRecoveryMinutes,
    thermal: recipe.thermalMinutes,
    measure: 18,
    decisions: Math.max(0, retainedElapsed - knownCycleMinutes),
  };
  const cycleBreakdown = [
    { id: 'handling', label: 'PREP + ROBOT', minutes: retainedCycle.handling },
    { id: 'queue', label: 'QUEUE', minutes: retainedCycle.queue },
    { id: 'recovery', label: 'RECOVERY', minutes: retainedCycle.recovery },
    { id: 'thermal', label: 'THERMAL', minutes: retainedCycle.thermal },
    { id: 'measure', label: 'XRD', minutes: retainedCycle.measure },
    { id: 'decisions', label: 'DECISIONS', minutes: retainedCycle.decisions },
  ].filter((item) => item.minutes > 0);
  const alternateBayLevel = retainedBayLevel >= 2 ? 1 : 2;
  const alternateOperations = getCampaignOperations(currentRunNumber, alternateBayLevel);
  const counterfactualElapsed = retainedElapsed - retainedCycle.queue + alternateOperations.queueMinutes;
  const counterfactualEvaluation = evaluateCampaignMission(observedRecipe, 'throughput', counterfactualElapsed);
  const capacityDelta = Math.abs(alternateOperations.queueMinutes - retainedCycle.queue);
  const cycleWithinTarget = retainedElapsed <= 420;
  const followUp = getAuthoredCampaignFollowUp(observedRecipe, run.missionId, retainedResult?.diagnosis);
  const followUpQueued = Boolean(followUp && backlog.some((item) => item.candidate === followUp.id));
  const confirmationQueued = backlog.some((item) => item.candidate === recipe.id);
  const recipeObservations = history.filter((result) => result.candidate === recipe.id && result.runNumber <= currentRunNumber);
  const observationMean = recipeObservations.length ? recipeObservations.reduce((total, result) => total + Number(result.measured), 0) / recipeObservations.length : Number(observedMeasured);
  const modelResidual = observationMean - Number.parseFloat(recipe.prediction);
  const posteriorUncertainty = Math.max(.7, 2 / Math.sqrt(recipeObservations.length + 1)).toFixed(1);
  const followUpLever = !followUp?.composition || !recipe.composition ? 'MISSION-DIRECTED STEP'
    : followUp.composition.dwell < recipe.composition.dwell ? 'SHORTER DWELL'
      : followUp.composition.dwell > recipe.composition.dwell ? 'EXTEND DWELL'
        : followUp.composition.temperature < recipe.composition.temperature ? 'LOWER SETPOINT'
          : followUp.composition.temperature > recipe.composition.temperature ? 'RAISE SETPOINT'
            : followUp.composition.zrDopant > recipe.composition.zrDopant ? 'INCREASE ZR'
              : followUp.composition.caExcess < recipe.composition.caExcess ? 'REDUCE CA EXCESS'
                : followUp.composition.caExcess > recipe.composition.caExcess ? 'INCREASE CA EXCESS' : 'COMPOSITION STEP';
  const selectedForecast = forecastCampaignMission(recipe, run.missionId);
  const backlogThermalMinutes = backlog.reduce((total, item) => total + getCampaignSpec(item.candidate).thermalMinutes, 0);
  const backlogCapacityMinutes = run.thermalBayLevel >= 2 ? 720 : 360;
  const backlogPressure = backlog.length === 0 ? 'NO PLANS' : backlogThermalMinutes > backlogCapacityMinutes ? 'FURNACE CONGESTION' : 'CAPACITY BALANCED';
  const backlogMeanCompletion = meanThermalCompletion(backlog, run.thermalBayLevel);
  const phaseFloor = run.missionId === 'low-energy' ? 94.5 : run.missionId === 'throughput' ? 95.5 : 96;
  const needsMicroscopy = Number(observedMeasured) < phaseFloor;
  const resultDecision = run.resultDecision ?? (followUpQueued ? 'synthesize' : undefined);
  const evidenceDecisionOpen = run.stage === 7 && !evaluation.met && needsMicroscopy && Boolean(recipe.composition && followUp) && !resultDecision;
  const sourceResult = [...history].reverse().find((result) => result.runNumber < currentRunNumber);
  const sourceSpec = sourceResult ? getCampaignSpec(sourceResult.candidate) : null;
  const isConfirmationRun = Boolean(sourceResult && sourceResult.candidate === recipe.id);
  const sourceOperations = sourceResult ? getCampaignOperations(sourceResult.runNumber, sourceResult.thermalBayLevel ?? run.thermalBayLevel) : null;
  const conditionLabels: Record<string, string> = { 'grip-force': 'FORCE CHECK', contamination: 'CLEAN RECOVERY', nominal: 'NOMINAL', 'thermocouple-drift': 'TC OFFSET', 'door-seal': 'SEAL RECOVERY', current: 'CURRENT SI', 'trend-review': 'TREND CHECK', 'age-due': 'DUE SI' };
  const conditionLabel = (condition: string) => conditionLabels[condition] ?? condition.toUpperCase();
  const routeCovariates = sourceOperations ? [
    { label: 'ROBOT', before: conditionLabel(sourceOperations.robotCondition), after: conditionLabel(operations.robotCondition) },
    { label: 'FURNACE', before: conditionLabel(sourceOperations.furnaceCondition), after: conditionLabel(operations.furnaceCondition) },
    { label: 'XRD', before: conditionLabel(sourceOperations.referenceCondition), after: conditionLabel(operations.referenceCondition) },
  ] : [];
  const changedCovariates = routeCovariates.filter((factor) => factor.before !== factor.after).length;
  const experimentFactors = sourceSpec?.composition && recipe.composition && sourceSpec.id !== recipe.id ? [
    { label: 'CA EXCESS', before: `${sourceSpec.composition.caExcess > 0 ? '+' : ''}${sourceSpec.composition.caExcess}%`, after: `${recipe.composition.caExcess > 0 ? '+' : ''}${recipe.composition.caExcess}%`, changed: sourceSpec.composition.caExcess !== recipe.composition.caExcess },
    { label: 'ZR', before: `${sourceSpec.composition.zrDopant}%`, after: `${recipe.composition.zrDopant}%`, changed: sourceSpec.composition.zrDopant !== recipe.composition.zrDopant },
    { label: 'SETPOINT', before: `${sourceSpec.composition.temperature}°`, after: `${recipe.composition.temperature}°`, changed: sourceSpec.composition.temperature !== recipe.composition.temperature },
    { label: 'DWELL', before: `${sourceSpec.composition.dwell}h`, after: `${recipe.composition.dwell}h`, changed: sourceSpec.composition.dwell !== recipe.composition.dwell },
  ] : null;
  const changedFactors = experimentFactors?.filter((factor) => factor.changed) ?? [];
  const heldFactors = experimentFactors?.filter((factor) => !factor.changed) ?? [];
  const experimentExpectation = !sourceSpec?.composition || !recipe.composition ? 'MISSION RESPONSE ↑'
    : sourceResult?.diagnosis?.includes('Ca-rich') && recipe.composition.caExcess < sourceSpec.composition.caExcess ? 'SECONDARY PHASE ↓'
      : sourceResult?.diagnosis?.includes('Ti-rich') && recipe.composition.dwell > sourceSpec.composition.dwell ? 'CORE CONVERSION ↑'
        : recipe.composition.zrDopant > sourceSpec.composition.zrDopant ? 'TARGET PHASE ↑'
          : recipe.composition.dwell < sourceSpec.composition.dwell ? 'CYCLE ↓ · PHASE HELD'
            : recipe.composition.temperature < sourceSpec.composition.temperature ? 'THERMAL DOSE ↓' : 'MISSION RESPONSE ↑';
  const phaseResponse = sourceResult ? Number.parseFloat(observedMeasured) - Number.parseFloat(sourceResult.measured) : 0;
  const inventory = { ...initialInventory, ...run.inventory };
  const inventoryLow = inventory.crucibles < 6 || inventory.liners < 1 || inventory.carbonTabs < 1;
  const fault = run.stage === 2 && operations.robotConstraint ? 'cell' : run.stage === 4 ? 'queue' : run.stage === 5 && operations.furnaceConstraint ? 'thermal' : run.stage === 6 && operations.referenceConstraint ? 'qc' : null;
  const robotConditionLabel = operations.robotCondition === 'contamination' ? 'CLEANLINESS' : operations.robotCondition === 'grip-force' ? 'GRIP FORCE' : 'READINESS';
  const referenceConditionLabel = operations.referenceCondition === 'age-due' ? 'CONTROL DUE' : operations.referenceCondition === 'trend-review' ? 'TREND REVIEW' : 'CONTROL CURRENT';
  const conditionSignal = run.stage === 2
    ? operations.robotConstraint ? 'BOTTLENECK DETECTED' : 'ROBOT READINESS'
    : run.stage === 4 ? 'BOTTLENECK DETECTED'
      : run.stage === 5 ? operations.furnaceConstraint ? 'EQUIPMENT CONDITION' : 'THERMAL START READINESS'
      : run.stage === 6 ? operations.referenceConstraint ? 'BOTTLENECK DETECTED' : 'MEASUREMENT READINESS'
        : run.stage === 8 ? 'DIAGNOSTIC BRANCH'
          : run.stage >= 9 ? 'MECHANISM EVIDENCE RETAINED'
            : run.stage >= 7 ? evaluation.met ? 'VALID RESULT · MISSION MET' : 'VALID RESULT · MISSION MISSED'
              : 'ROUTE STATUS';
  const conditionDetail = run.stage === 2
    ? `ROBO-02 / ${robotConditionLabel}`
    : run.stage === 4 ? run.thermalBayLevel >= 2 ? 'FURN-04B / READINESS GATE' : 'FURN-04A / CAPACITY 1 OF 1'
      : run.stage === 5 ? `FURN-04 / ${operations.furnaceCondition === 'thermocouple-drift' ? 'TC OFFSET HOLD' : operations.furnaceCondition === 'door-seal' ? 'DOOR SEAL HOLD' : 'START PROOF'}`
      : run.stage === 6 ? `XRD-03 / ${referenceConditionLabel}`
        : run.stage === 8 ? `SEM-01 / ${identity.thermalSample}`
          : run.stage >= 7 ? `${evaluation.resultText} · ${evaluation.gap}` : 'FLOW NOMINAL';
  const conditionMetric = run.stage === 2
    ? operations.robotConstraint ? `${operations.robotRecoveryMinutes} min recovery` : `${operations.robotRecoveryMinutes} min setup proof`
    : run.stage === 4 ? `${operations.queueMinutes} min wait`
      : run.stage === 5 ? `${operations.furnaceRecoveryMinutes} min recovery`
      : run.stage === 6 ? `${operations.referenceAgeHours} h since reference`
        : run.stage === 8 ? '4 fields + EDS map'
          : run.stage >= 9 ? 'diagnosis linked'
            : run.stage >= 7 ? evaluation.met ? 'mission achieved' : evaluation.constraintText : 'no active delay';
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
        : [...history, { runNumber: currentRunNumber, candidate: recipe.id, measured: observedMeasured, gap: evaluation.gap, objectiveMet: evaluation.met, elapsed: run.elapsed, missionId: run.missionId }];
      const mechanismRecovery = run.stage >= 9 && recipe.id === 'D-08' && archivedHistory.some((result) => result.runNumber === currentRunNumber && Boolean(result.diagnosis));
      const diagnosticFollowUp = run.stage >= 9 && recipe.composition ? followUp : null;
      const nextPlan = !mechanismRecovery && !diagnosticFollowUp ? backlog[0] : undefined;
      const nextSelected = mechanismRecovery ? 'R-31' : diagnosticFollowUp?.id ?? nextPlan?.candidate ?? run.selected;
      const nextMission = nextPlan?.missionId ?? run.missionId;
      const remainingBacklog = (nextPlan ? backlog.slice(1) : backlog).map((item, index) => ({ ...item, runNumber: currentRunNumber + index + 2 }));
      updateRun({ ...initialRun, insight: run.insight, missionId: nextMission, thermalBayLevel: run.plannedThermalUpgrade ? 2 : run.thermalBayLevel, customCandidate: nextSelected.startsWith('U-') ? nextSelected : run.customCandidate, inventory, selected: nextSelected, runNumber: currentRunNumber + 1, history: archivedHistory, backlog: remainingBacklog, plannedThermalUpgrade: false, resultDecision: undefined, message: mechanismRecovery
        ? `${identity.runId} diagnosis assimilated. R-31 raises thermal dose while preserving stoichiometry to test the incomplete-conversion hypothesis.`
        : diagnosticFollowUp ? `${identity.runId} SEM / EDS evidence assimilated. ${diagnosticFollowUp.id} changes one governed lever (${followUpLever.toLowerCase()}) while retaining the measured phase map as its mechanism basis.`
        : nextPlan ? `${identity.runId} archived. RUN-${String(currentRunNumber + 1).padStart(3, '0')} loaded from the shift backlog: ${nextPlan.candidate} · ${getCampaignMission(nextPlan.missionId).shortLabel}.`
          : `${identity.runId} archived. Select the next candidate.` });
    }
  };

  const rejectShortcut = (kind: 'robot' | 'furnace' | 'furnace-condition') => {
    updateRun({ elapsed: kind === 'furnace-condition' ? run.elapsed + 2 : run.elapsed, message: kind === 'robot'
      ? operations.robotCondition === 'grip-force'
        ? 'Command blocked: bypassing the force witness could turn an intermittent grip into a carrier drop or cross-position dosing error.'
        : 'Command blocked: bypassing the cleanliness witness would make contamination indistinguishable from material behavior.'
      : kind === 'furnace-condition'
        ? operations.furnaceCondition === 'thermocouple-drift'
          ? 'Start rejected by OT-04: controller PV cannot release a load while the independent witness is biased. Two minutes were lost reviewing the failed permissive; the specimen remains cold-held.'
          : 'Start rejected by the door-chain proof: closed feedback does not demonstrate hot-zone uniformity across a leaking seal. Two minutes were lost; the specimen remains cold-held.'
        : `Command blocked: shortening ${operations.activeFurnaceRun} violates its governed thermal profile. ${identity.runId} remains queued.` });
  };

  const startDiagnosis = () => {
    if (inventory.carbonTabs < 1) {
      updateRun({ message: `SEM route blocked: no released conductive carbon tabs remain at point of use. Replenish and reconcile the consumable lot before mounting ${identity.thermalSample}.` });
      setInventoryOpen(true);
      return;
    }
    updateRun({ stage: 8, resultDecision: 'diagnose', inventory: { ...inventory, carbonTabs: inventory.carbonTabs - 1 }, message: `${identity.thermalSample} routed to SEM-01. Carbon-tab lot CT-88 is bound to the stub; four representative BSE fields and an EDS map are required before assigning a mechanism.` });
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

  const retainCustomCandidate = (candidate: CampaignSpec) => {
    updateRun({ selected: candidate.id, customCandidate: candidate.id, message: `${candidate.id} authored and retained in the candidate tray. Review its predicted envelope before release.` });
    setComposerOpen(false);
  };

  const reindexBacklog = (items: CampaignBacklogItem[]) => items.map((item, index) => ({ ...item, runNumber: currentRunNumber + index + 1 }));

  const addToBacklog = () => {
    if (run.stage > 0 || backlog.length >= 3) return;
    const next = reindexBacklog([...backlog, { runNumber: 0, candidate: recipe.id, missionId: run.missionId }]);
    updateRun({ backlog: next, message: `${recipe.id} added to the unreleased shift backlog under the ${mission.label.toLowerCase()} mission. Materials remain unissued until that run is released.` });
  };

  const queueAuthoredFollowUp = () => {
    if (!followUp || followUpQueued || backlog.length >= 3 || run.stage < 7) return;
    const next = reindexBacklog([...backlog, { runNumber: 0, candidate: followUp.id, missionId: run.missionId }]);
    updateRun({ backlog: next, resultDecision: 'synthesize', message: `${followUp.id} queued as a governed follow-up to ${recipe.id}. The completed ${identity.runId} result remains retained; the next run changes only the mission-directed process lever.` });
  };

  const queueConfirmation = () => {
    if (confirmationQueued || backlog.length >= 3 || run.stage < 7 || !evaluation.met) return;
    const next = reindexBacklog([...backlog, { runNumber: 0, candidate: recipe.id, missionId: run.missionId }]);
    updateRun({ backlog: next, message: `${recipe.id} queued as a confirmation replicate. ${identity.runId} remains the first qualified observation; the repeat holds formulation, process, and mission constant before the candidate is treated as robust.` });
  };

  const moveBacklog = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= backlog.length) return;
    const next = [...backlog];
    [next[index], next[destination]] = [next[destination], next[index]];
    updateRun({ backlog: reindexBacklog(next), message: `Shift backlog reprioritized. RUN-${String(currentRunNumber + 1).padStart(3, '0')} remains the next unreleased experiment.` });
  };

  const removeFromBacklog = (index: number) => {
    const removed = backlog[index];
    updateRun({ backlog: reindexBacklog(backlog.filter((_, itemIndex) => itemIndex !== index)), message: `${removed.candidate} removed from the unreleased backlog; no materials or equipment time had been committed.` });
  };

  const sequenceBacklog = (policy: 'shortest' | 'energy') => {
    if (backlog.length < 2) return;
    const before = meanThermalCompletion(backlog, run.thermalBayLevel);
    const sorted = [...backlog].sort((left, right) => {
      const leftSpec = getCampaignSpec(left.candidate);
      const rightSpec = getCampaignSpec(right.candidate);
      if (policy === 'shortest') return leftSpec.thermalMinutes - rightSpec.thermalMinutes;
      const leftTemperature = leftSpec.composition?.temperature ?? Number(leftSpec.temperature.replace(/[^\d]/g, ''));
      const rightTemperature = rightSpec.composition?.temperature ?? Number(rightSpec.temperature.replace(/[^\d]/g, ''));
      return leftTemperature - rightTemperature || leftSpec.thermalMinutes - rightSpec.thermalMinutes;
    });
    const next = reindexBacklog(sorted);
    const after = meanThermalCompletion(next, run.thermalBayLevel);
    updateRun({ backlog: next, elapsed: run.elapsed + 4, message: policy === 'shortest'
      ? `Dispatch review retained: shortest thermal job first. Mean furnace completion changes from ${before} to ${after} minutes; scientific missions and material status are unchanged.`
      : `Dispatch review retained: lowest setpoint first. The furnace sequence now reduces early-shift thermal severity; mean completion is ${after} minutes.` });
  };

  const commissionAuxiliaryChamber = () => {
    if (run.thermalBayLevel >= 2 || run.plannedThermalUpgrade || run.insight < 120) return;
    const qualifiedOperations = getCampaignOperations(currentRunNumber, 2);
    if (run.stage >= 7) {
      const snapshottedHistory = history.map((result) => result.runNumber === currentRunNumber ? { ...result, thermalBayLevel: retainedBayLevel, cycle: retainedCycle } : result);
      updateRun({
        plannedThermalUpgrade: true,
        elapsed: run.elapsed + 48,
        insight: run.insight - 120,
        history: snapshottedHistory,
        message: `FURN-04B qualification scheduled after ${identity.runId}. The retained ${retainedElapsed}-minute result is unchanged; the next campaign will receive a ${qualifiedOperations.queueMinutes}-minute auxiliary-lane readiness gate.`,
      });
      return;
    }
    if (run.stage > 3) return;
    updateRun({
      thermalBayLevel: 2,
      elapsed: run.elapsed + 48,
      insight: run.insight - 120,
      message: `FURN-04B commissioned after an empty cycle and nine-point uniformity survey. ${identity.runId} now has a qualified auxiliary lane with a ${qualifiedOperations.queueMinutes}-minute readiness gate.`,
    });
  };

  const activeLabStationId = run.stage <= 1 ? 'PREP-01' : run.stage <= 3 ? 'ROBO-02' : run.stage <= 5 ? 'FURN-04' : run.stage <= 7 ? 'XRD-03' : 'SEM-01';
  const activeLabStationStatus = fault ? 'HOLD' : run.stage === 0 ? 'NEXT' : run.stage === 7 ? 'REVIEW' : run.stage >= 8 ? 'DIAG' : 'ACTIVE';
  const viewInLab = () => {
    const stationId = activeLabStationId;
    onClose();
    window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('mattershift:return-to-lab', { detail: { stationId } })));
  };
  const viewAssetInLab = (stationId: string) => {
    setFacilityOpen(false);
    onClose();
    window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('mattershift:return-to-lab', { detail: { stationId } })));
  };

  return <div className="modal-backdrop campaign-backdrop" role="presentation">
    <section className="modal-card campaign-control" role="dialog" aria-modal="true" aria-label="Materials campaign control">
      <header>
        <div><p className="section-kicker">SANDBOX CAMPAIGN · MAT-{identity.suffix}</p><h2>Materials campaign control</h2></div>
        <div className="campaign-header-actions"><button type="button" className={inventoryLow ? 'inventory-low' : ''} onClick={() => setInventoryOpen(true)}><i />MATERIAL STAGING<b>{inventory.crucibles} CRUC · {inventory.liners} LIN · {inventory.carbonTabs} TAB</b></button><button type="button" className="facility-layout-button" onClick={() => setFacilityOpen(true)}><i />LAB BUILD<b>{run.thermalBayLevel} / 2 THERMAL LANES</b></button><button type="button" onClick={onClose} aria-label="Close dialog">×</button></div>
      </header>

      <div className="campaign-hud">
        <div><span>OBJECTIVE · {mission.shortLabel}</span><b>{mission.target}</b></div>
        <div><span>LAB CLOCK</span><b>+{run.elapsed} min</b></div>
        <div><span>INSIGHT</span><b>{run.insight} RP</b></div>
        <div><span>FURNACE-LIMITED RATE</span><b>{run.thermalBayLevel >= 2 ? '0.31 runs / h' : recipe.throughput}</b></div>
        <div className={fault ? 'hud-alert' : ''}><span>ACTIVE CONSTRAINT</span><b>{fault === 'cell' ? 'ROBOT CELL' : fault === 'queue' ? 'FURNACE QUEUE' : fault === 'thermal' ? 'FURNACE CHECK' : fault === 'qc' ? 'XRD QC' : 'NONE'}</b></div>
      </div>

      <div className="campaign-mission-strip" aria-label="Scientific mission selection">
        <span>SCIENTIFIC MISSION</span>
        {campaignMissions.map((candidateMission) => <button key={candidateMission.id} type="button" className={run.missionId === candidateMission.id ? 'active' : ''} disabled={run.stage > 0} onClick={() => updateRun({ missionId: candidateMission.id, message: `${candidateMission.label} mission selected. Candidate outcomes will be judged against ${candidateMission.target}.` })}><i>{candidateMission.shortLabel}</i><b>{candidateMission.label}</b><small>{candidateMission.target}</small></button>)}
      </div>

      <div className="campaign-workspace">
        <aside className="campaign-designer">
          <div className="campaign-panel-head"><div><span>EXPERIMENT DESIGN</span><b>{diagnosisUnlocked ? 'MECHANISM CANDIDATES' : adaptiveUnlocked ? 'ADAPTIVE CANDIDATES' : 'AI CANDIDATES'}</b></div><div className="campaign-panel-tools"><button type="button" disabled={run.stage > 0} onClick={() => setComposerOpen(true)}>＋ COMPOSE</button><button type="button" disabled={run.stage > 0 || backlog.length >= 3} onClick={addToBacklog}>＋ QUEUE</button><em>{String(availableRecipes.length).padStart(2, '0')}</em></div></div>
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
              const forecast = forecastCampaignMission(candidate, run.missionId);
              return <button key={candidate.id} type="button" className={`${candidate.id === run.selected ? 'active ' : ''}${candidate.id === 'A-29' ? 'learned' : candidate.id === 'R-31' ? 'mechanism' : candidate.id.startsWith('U-') ? 'scientist' : ''}`} disabled={run.stage > 0} onClick={() => updateRun({ selected: candidate.id, message: `${candidate.id} selected. Review its synthesis envelope before release.` })}>
                <span>{candidate.id}</span><div><b>{candidate.name}</b><small>{candidate.formula}</small></div><div className="candidate-outcome"><em>{measured ? `${measured.measured}%` : candidate.prediction}</em><u className={measured ? measured.objectiveMet ? 'fit' : 'risk' : forecast.tone}>{measured ? measured.objectiveMet ? 'PASS' : 'MISS' : forecast.status}</u></div>
              </button>;
            })}
            {!adaptiveUnlocked && <div className="candidate-lock"><span>◇</span><div><b>ADAPTIVE SLOT LOCKED</b><small>retain 2 qualified results</small></div><em>{history.length} / 2</em></div>}
          </div>
          <div className="recipe-envelope"><span>SYNTHESIS ENVELOPE</span><div><b>{recipe.temperature}</b><small>calcination</small></div><div><b>{recipe.dwell}</b><small>dwell</small></div><div><b>{recipe.prediction}</b><small>predicted phase</small></div></div>
          <div className={`mission-forecast ${selectedForecast.tone}`}><span>MISSION FORECAST · {mission.shortLabel}</span><b>{selectedForecast.status}</b><small>{selectedForecast.detail}</small><i /></div>
          {history.length > 0 && <div className="campaign-history"><span>MODEL MEMORY</span>{history.slice(-3).map((result) => <div key={result.runNumber}><b>RUN-{String(result.runNumber).padStart(3, '0')}</b><i>{result.candidate}{result.diagnosis ? ' · DIAG' : ''}</i><em className={result.objectiveMet ? 'hit' : 'miss'}>{result.measured}%</em></div>)}</div>}
        </aside>

        <section className="campaign-routing">
          <div className="campaign-panel-head"><div><span>LIVE MATERIAL ROUTE</span><b>{identity.runId} · {recipe.id}</b></div><em>{run.stage >= 8 ? '09 / 09' : `${String(Math.min(run.stage + 1, 8)).padStart(2, '0')} / 08`}</em></div>
          {experimentFactors && changedFactors.length > 0 && <div className={`experiment-contract ${run.stage >= 7 ? phaseResponse >= 0 ? 'response-up' : 'response-down' : ''}`}>
            <div className="contract-source"><span>CONTROLLED EXPERIMENT</span><b>{sourceSpec.id} → {recipe.id}</b><small>{sourceResult?.diagnosis ? 'SEM / EDS EVIDENCE' : 'MODEL RESIDUAL'}</small></div>
            <div className="contract-change"><span>CHANGE ONE LEVER</span>{changedFactors.map((factor) => <b key={factor.label}>{factor.label}<i>{factor.before}</i><u>→</u><em>{factor.after}</em></b>)}</div>
            <div className="contract-held"><span>HOLD CONSTANT</span><b>{heldFactors.map((factor) => factor.label).join(' · ')}</b><small>{heldFactors.map((factor) => factor.after).join(' · ')}</small></div>
            <div className="contract-readout"><span>EXPECTED READOUT</span><b>{experimentExpectation}</b><small>XRD primary · microscopy optional</small></div>
            <em>{run.stage >= 7 ? `${phaseResponse >= 0 ? '+' : '−'}${Math.abs(phaseResponse).toFixed(1)} pp PHASE RESPONSE` : 'RESULT PENDING'}</em>
          </div>}
          <div className="route-board">
            <RouteCell code="PREP-01" label="PREP" cycle="12 MIN" state={routeState(run.stage, 1, 2)} current={run.stage === 1} job={run.stage >= 1 ? identity.runId : 'OPEN'} />
            <RouteCell code="ROBO-02" label="SYNTHESIZE" cycle="14 MIN" state={run.stage === 2 ? operations.robotConstraint ? 'fault' : 'active' : routeState(run.stage, 3, 4)} current={run.stage === 2 || run.stage === 3} job={run.stage === 2 ? operations.robotCondition === 'contamination' ? 'CONTAM HOLD' : operations.robotCondition === 'grip-force' ? 'FORCE CHECK' : 'READY CHECK' : run.stage >= 3 ? identity.runId : 'WAIT'} />
            <RouteCell code={operations.furnaceLane} label="CALCINE" cycle={`${recipe.thermalMinutes} MIN`} state={run.stage === 4 ? 'queued' : run.stage === 5 && operations.furnaceConstraint ? 'fault' : routeState(run.stage, 5, 6)} current={run.stage === 5} job={run.stage === 4 ? run.thermalBayLevel >= 2 ? 'READY GATE' : 'Q 01' : run.stage === 5 && operations.furnaceConstraint ? operations.furnaceCondition === 'thermocouple-drift' ? 'TC HOLD' : 'SEAL HOLD' : run.stage >= 5 ? identity.runId : run.thermalBayLevel >= 2 ? 'QUALIFIED' : operations.activeFurnaceRun} />
            <RouteCell code="XRD-03" label="MEASURE" cycle="18 MIN" state={run.stage === 6 ? operations.referenceConstraint ? 'fault' : 'active' : routeState(run.stage, 6, 7)} current={run.stage === 6} job={run.stage === 6 ? operations.referenceCondition === 'age-due' ? 'QC HOLD' : operations.referenceCondition === 'trend-review' ? 'TREND CHECK' : 'ACQUIRE' : run.stage >= 7 ? identity.runId : 'RUN-038'} />
            <RouteCell code={run.stage >= 8 ? 'SEM-01' : 'MODEL'} label={run.stage >= 8 ? 'DIAGNOSE' : 'LEARN'} cycle={run.stage >= 8 ? '26 MIN' : 'GATED'} state={run.stage >= 9 ? 'complete' : run.stage === 8 ? 'active' : run.stage >= 7 ? 'complete' : 'waiting'} current={run.stage === 8} job={run.stage >= 9 ? '4 FIELDS + MAP' : run.stage === 8 ? identity.thermalSample : run.stage >= 7 ? `+${recipe.insightReward} RP` : 'EVIDENCE'} />
          </div>

          <div className={`constraint-console ${fault ? `fault-${fault}` : run.stage === 8 ? 'fault-qc' : run.stage >= 7 ? evaluation.met ? 'result-hit' : 'result-miss' : ''}`}>
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

          {run.stage >= 7 && run.missionId === 'throughput' && <div className={`cycle-ledger ${cycleWithinTarget ? 'within' : 'over'}`}>
            <header><div><span>RELEASE-TO-RESULT CYCLE</span><b>ACTUAL LOSS BUDGET · RETAINED RESULT</b></div><em>{cycleWithinTarget ? `${420 - retainedElapsed} MIN TIME MARGIN` : `${retainedElapsed - 420} MIN OVER`}</em></header>
            <div className="cycle-ledger-bar" aria-label={`${retainedElapsed} minute campaign cycle broken down by handling, queue, recovery, thermal processing, measurement, and operator decisions`}>
              {cycleBreakdown.map((item) => <i key={item.id} className={item.id} style={{ width: `${item.minutes / retainedElapsed * 100}%` }} />)}
              <u style={{ left: `${Math.min(100, 420 / retainedElapsed * 100)}%` }}><span>420</span></u>
            </div>
            <div className="cycle-ledger-key">{cycleBreakdown.map((item) => <span key={item.id} className={item.id}><i />{item.label}<b>{item.minutes}m</b></span>)}<strong>{retainedElapsed} MIN</strong></div>
            <div className={`capacity-counterfactual ${counterfactualEvaluation.met ? 'would-pass' : 'would-miss'}`}>
              <div><span>CAPACITY COUNTERFACTUAL</span><b>{retainedBayLevel >= 2 ? 'WITHOUT FURN-04B' : 'QUALIFY FURN-04B'}</b></div>
              <dl><div><dt>QUEUE</dt><dd>{retainedCycle.queue} → {alternateOperations.queueMinutes} min</dd></div><div><dt>CYCLE</dt><dd>{retainedElapsed} → {counterfactualElapsed} min</dd></div><div><dt>MISSION</dt><dd>{counterfactualEvaluation.met ? 'WOULD PASS' : `WOULD MISS · ${counterfactualEvaluation.gap}`}</dd></div></dl>
              {retainedBayLevel < 2 ? <button type="button" disabled={run.plannedThermalUpgrade || run.insight < 120} onClick={commissionAuxiliaryChamber}>{run.plannedThermalUpgrade ? '✓ QUALIFICATION SCHEDULED' : 'QUALIFY FOR NEXT RUN · 120 RP'}</button> : <em>LANE B PROTECTS {capacityDelta} MIN</em>}
            </div>
          </div>}

          {run.stage === 7 && !evaluation.met && needsMicroscopy && recipe.composition && followUp && <div className={`evidence-fork ${resultDecision ? `committed-${resultDecision}` : ''}`}>
            <header><div><span>POST-RESULT EVIDENCE GATE</span><b>XRD VALID · PHASE FLOOR MISSED</b></div><em>{resultDecision ? 'ROUTE COMMITTED' : 'SCIENTIST DECISION'}</em></header>
            <div className="evidence-fork-body">
              <article className="diagnose-path">
                <div className="fork-preview sem-preview" aria-hidden="true"><i /><i /><i /><i /><u /></div>
                <span>RESOLVE MECHANISM</span><b>SEM / EDS</b>
                <dl><div><dt>SHIFT COST</dt><dd>+26 MIN</dd></div><div><dt>CONSUMABLE</dt><dd>1 × TAB</dd></div><div><dt>EVIDENCE</dt><dd>GRAIN MAP</dd></div></dl>
                <button type="button" disabled={Boolean(resultDecision)} onClick={startDiagnosis}>{resultDecision === 'diagnose' ? '✓ ROUTED TO SEM-01' : 'INVESTIGATE PHASE →'}</button>
              </article>
              <div className="fork-junction" aria-hidden="true"><i /><b>{identity.thermalSample}</b><span>VALID<br />NEGATIVE</span><u /><u /></div>
              <article className="synthesize-path">
                <div className="fork-preview synthesis-preview" aria-hidden="true"><i /><i /><i /><i /><u /></div>
                <span>ACCEPT MODEL RISK</span><b>NEXT SYNTHESIS</b>
                <dl><div><dt>SHIFT COST</dt><dd>+0 MIN</dd></div><div><dt>NEXT ISSUE</dt><dd>6 × CRUC</dd></div><div><dt>LEVER</dt><dd>{followUpLever}</dd></div></dl>
                <button type="button" disabled={Boolean(resultDecision) || followUpQueued || backlog.length >= 3} onClick={queueAuthoredFollowUp}>{resultDecision === 'synthesize' || followUpQueued ? `✓ ${followUp.id} COMMITTED` : `COMMIT ${followUp.id} →`}</button>
              </article>
            </div>
          </div>}

          {run.stage >= 7 && recipe.composition && followUp && <div className="authored-learning">
            <header><div><span>{retainedResult?.diagnosis ? 'EVIDENCE UPDATE · SEM / EDS INFORMED' : 'MODEL UPDATE · AUTHORED MATERIAL'}</span><b>{recipe.id} → {followUp.id}</b></div><em>{recipeObservations.length > 1 ? 'MEAN ' : ''}{modelResidual >= 0 ? '+' : '−'}{Math.abs(modelResidual).toFixed(1)} pp RESIDUAL</em></header>
            <div className="learning-posterior"><span>PRIOR<b>{recipe.prediction}</b></span><i><u style={{ left: `${Math.max(5, Math.min(95, (Number.parseFloat(recipe.prediction) - 90) * 10))}%` }} />{recipeObservations.slice(-3).map((result) => <u key={result.runNumber} className={result.runNumber === currentRunNumber ? 'measured' : 'replicate'} style={{ left: `${Math.max(5, Math.min(95, (Number.parseFloat(result.measured) - 90) * 10))}%` }} />)}</i><span>{recipeObservations.length > 1 ? 'MEAN' : 'MEASURED'}<b>{recipeObservations.length > 1 ? observationMean.toFixed(1) : observedMeasured}%</b></span><span>{recipeObservations.length > 1 ? `n = ${recipeObservations.length} REPEATS` : 'CURRENT POINT'}<b>±2.1 → ±{posteriorUncertainty}%</b></span></div>
            <div className="learning-proposal"><div><span>NEXT MISSION LEVER</span><b>{followUpLever}</b></div><dl><div><dt>RECIPE</dt><dd>{followUp.id}</dd></div><div><dt>PROGRAM</dt><dd>{followUp.temperatureShort} · {followUp.dwell}</dd></div><div><dt>MODEL</dt><dd>{followUp.prediction} · {followUp.uncertainty}</dd></div></dl><button type="button" disabled>✓ CANDIDATE GENERATED</button></div>
          </div>}

          {run.stage >= 7 && recipe.composition && !followUp && evaluation.met && !isConfirmationRun && <div className="confirmation-gate">
            <header><div><span>REPRODUCIBILITY GATE</span><b>MISSION CANDIDATE · ONE QUALIFIED RESULT</b></div><em>n = 1</em></header>
            <div className="replicate-track"><article className="qualified"><i>1</i><span>{identity.runId}</span><b>{observedMeasured}%</b><small>{retainedElapsed} MIN · PASS</small></article><u>→</u><article className={confirmationQueued ? 'queued' : ''}><i>2</i><span>CONFIRMATION</span><b>{confirmationQueued ? `RUN-${String(currentRunNumber + 1).padStart(3, '0')}` : 'UNPLANNED'}</b><small>SAME RECIPE · SAME PROGRAM</small></article></div>
            <dl><div><dt>RECIPE</dt><dd>{recipe.id}</dd></div><div><dt>PHASE FLOOR</dt><dd>{phaseFloor.toFixed(1)}%</dd></div><div><dt>OBSERVED</dt><dd>{observedMeasured}%</dd></div><div><dt>CONTROL</dt><dd>NO LEVER CHANGE</dd></div></dl>
            <button type="button" disabled={confirmationQueued || backlog.length >= 3} onClick={queueConfirmation}>{confirmationQueued ? '✓ CONFIRMATION QUEUED' : 'QUEUE CONFIRMATION →'}</button>
          </div>}

          {run.stage >= 7 && isConfirmationRun && sourceResult && <div className={`replicate-result ${evaluation.met ? 'robust' : 'unstable'}`}>
            <header><div><span>REPRODUCIBILITY RESULT</span><b>{evaluation.met ? 'BOUNDARY REPEATED · CANDIDATE ROBUST' : 'BOUNDARY FAILED · ROBUSTNESS NOT DEMONSTRATED'}</b></div><em>n = 2</em></header>
            <div className={`comparability-audit ${changedCovariates ? 'conditional' : 'matched'}`}><div><span>COMPARABILITY AUDIT</span><b>{changedCovariates ? `${changedCovariates} ROUTE CONDITIONS CHANGED` : 'ROUTES MATCHED'}</b></div>{routeCovariates.map((factor) => <span key={factor.label}><i>{factor.label}</i><b>{factor.before}</b><u>→</u><em>{factor.after}</em></span>)}<strong>{changedCovariates ? 'ATTRIBUTION CONDITIONAL' : 'MATERIAL EFFECT ISOLATED'}</strong></div>
            <div className="replicate-pair"><article><span>RUN-{String(sourceResult.runNumber).padStart(3, '0')}</span><b>{sourceResult.measured}%</b><small>{sourceResult.elapsed} MIN</small></article><i>↔</i><article><span>{identity.runId}</span><b>{observedMeasured}%</b><small>{retainedElapsed} MIN</small></article></div>
            <dl><div><dt>RECIPE</dt><dd>{recipe.id} × 2</dd></div><div><dt>PHASE SPREAD</dt><dd>{Math.abs(Number(observedMeasured) - Number(sourceResult.measured)).toFixed(1)} pp</dd></div><div><dt>FLOOR</dt><dd>{phaseFloor.toFixed(1)}%</dd></div><div><dt>VERDICT</dt><dd>{evaluation.met ? 'REPEATED PASS' : 'MARGIN LOST'}</dd></div></dl>
            <em>{evaluation.met ? 'RELEASE ROBUSTNESS CLAIM' : 'RETURN TO DESIGN SPACE'}</em>
          </div>}

          <div className={`shift-backlog ${backlog.length ? 'populated' : ''}`}>
            <header><div><span>SHIFT BACKLOG</span><b>UNRELEASED EXPERIMENTS</b></div><em>{backlog.length} / 3 PLANNED · {backlogPressure}</em></header>
            <div className="backlog-slots">
              {[0, 1, 2].map((slot) => {
                const item = backlog[slot];
                if (!item) return <article className="empty" key={slot}><span>PLAN {slot + 1}</span><b>OPEN SLOT</b><small>select candidate · ＋ queue</small></article>;
                const itemSpec = getCampaignSpec(item.candidate);
                const itemMission = getCampaignMission(item.missionId);
                return <article key={`${item.runNumber}-${item.candidate}-${slot}`} className={`mission-${item.missionId}`}><span>RUN-{String(item.runNumber).padStart(3, '0')}</span><b>{item.candidate} · {itemMission.shortLabel}</b><small>{itemSpec.temperatureShort} · {itemSpec.thermalMinutes} min furnace</small><nav aria-label={`Reorder ${item.candidate}`}><button type="button" disabled={slot === 0} onClick={() => moveBacklog(slot, -1)} aria-label={`Move ${item.candidate} earlier`}>↑</button><button type="button" disabled={slot === backlog.length - 1} onClick={() => moveBacklog(slot, 1)} aria-label={`Move ${item.candidate} later`}>↓</button><button type="button" onClick={() => removeFromBacklog(slot)} aria-label={`Remove ${item.candidate} from backlog`}>×</button></nav></article>;
              })}
            </div>
            <footer><span>THERMAL DEMAND <b>{backlogThermalMinutes} MIN</b></span><span>MEAN COMPLETE <b>{backlogMeanCompletion} MIN</b></span><span>XRD LOAD <b>{backlog.length * 18} MIN</b></span><span>LANES <b>{run.thermalBayLevel} QUALIFIED</b></span><button type="button" disabled={backlog.length < 2} onClick={() => sequenceBacklog('shortest')}>↓ SHORTEST</button><button type="button" disabled={backlog.length < 2} onClick={() => sequenceBacklog('energy')}>↓ SETPOINT</button><i className={backlogPressure === 'FURNACE CONGESTION' ? 'hot' : ''} /></footer>
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
            <header><div><span>THERMAL BAY CONFIGURATION</span><b>FURN-04 · INDEPENDENT CHAMBERS</b></div><em>{run.plannedThermalUpgrade ? '1 QUALIFIED · +1 SCHEDULED' : `${run.thermalBayLevel} / 2 QUALIFIED`}</em></header>
            <div className="thermal-bay-mimic" aria-label={`Thermal bay with ${run.thermalBayLevel} qualified chamber${run.thermalBayLevel === 1 ? '' : 's'}`}>
              <article className="online"><i /><span>CHAMBER A</span><b>{operations.activeFurnaceRun}</b><small>occupied · governed profile</small></article>
              <i className="thermal-bus" />
              <article className={run.thermalBayLevel >= 2 ? 'online auxiliary' : run.plannedThermalUpgrade ? 'scheduled' : 'offline'}><i /><span>CHAMBER B</span><b>{run.thermalBayLevel >= 2 ? 'QUALIFIED' : run.plannedThermalUpgrade ? 'QUALIFICATION SCHEDULED' : 'NOT COMMISSIONED'}</b><small>{run.thermalBayLevel >= 2 ? `${operations.queueMinutes} min readiness · independent TC` : run.plannedThermalUpgrade ? 'post-run empty cycle + 9-point survey' : 'empty cycle + 9-point survey required'}</small></article>
            </div>
            <div className="thermal-capacity-metrics"><span>QUALIFICATION<b>{run.thermalBayLevel >= 2 ? 'IQ / OQ RETAINED' : run.plannedThermalUpgrade ? 'POST-RUN · SCHEDULED' : '120 RP · 48 MIN'}</b></span><span>CAMPAIGN WAIT<b>{operations.queueMinutes} MIN</b></span><span>RATE<b>{run.thermalBayLevel >= 2 ? '0.31 RUNS / H' : recipe.throughput.toUpperCase()}</b></span></div>
            <button type="button" disabled={Boolean(run.plannedThermalUpgrade) || (run.thermalBayLevel < 2 && (run.stage > 3 || run.insight < 120))} onClick={() => setCommissionOpen(true)}>{run.thermalBayLevel >= 2 ? 'VIEW IQ / OQ RECORD' : run.plannedThermalUpgrade ? 'QUALIFICATION SCHEDULED' : run.stage > 3 ? 'COMMISSIONING WINDOW CLOSED' : run.insight < 120 ? '120 RP REQUIRED' : 'OPEN COMMISSIONING'}<span>{run.plannedThermalUpgrade ? '✓' : '→'}</span></button>
          </div>
        </section>
      </div>

      <footer className="campaign-actions">
        <div><span>PLAYER COMMAND</span><b>{evidenceDecisionOpen ? 'Choose what evidence the next experiment will be allowed to use' : run.stage === 8 || run.stage >= 9 ? primary.hint : run.stage >= 7 ? `${recipe.id} · ${evaluation.resultText} · ${evaluation.gap}` : primary.hint}</b></div>
        {run.stage === 2 && operations.robotConstraint && <button type="button" className="secondary" onClick={() => rejectShortcut('robot')}>{operations.robotCondition === 'grip-force' ? 'BYPASS FORCE WITNESS' : 'BYPASS CLEAN WITNESS'}</button>}
        {run.stage === 4 && <button type="button" className="secondary" onClick={() => rejectShortcut('furnace')}>SHORTEN {operations.activeFurnaceRun}</button>}
        {run.stage === 5 && operations.furnaceConstraint && <button type="button" className="secondary" onClick={() => rejectShortcut('furnace-condition')}>{operations.furnaceCondition === 'thermocouple-drift' ? 'START ON CONTROLLER PV' : 'ACCEPT CLOSED FEEDBACK'}</button>}
        {run.stage === 7 && !evaluation.met && needsMicroscopy && !(recipe.composition && followUp) && <button type="button" className="secondary diagnosis" onClick={startDiagnosis}>ROUTE TO SEM / EDS</button>}
        <button type="button" disabled={evidenceDecisionOpen} onClick={run.stage > 0 && (run.stage < 7 || run.stage === 8) ? viewInLab : advance}>{evidenceDecisionOpen ? 'CHOOSE EVIDENCE ROUTE' : primary.label}<span>→</span></button>
      </footer>
    </section>
    {commissionOpen && <ThermalCommissioningModal alreadyQualified={run.thermalBayLevel >= 2} activeRun={operations.activeFurnaceRun} queueMinutes={getCampaignOperations(currentRunNumber, 2).queueMinutes} onComplete={() => { commissionAuxiliaryChamber(); setCommissionOpen(false); }} onClose={() => setCommissionOpen(false)} />}
    {facilityOpen && <FacilityBuildModal thermalBayLevel={run.thermalBayLevel} scheduled={Boolean(run.plannedThermalUpgrade)} insight={run.insight} commissioningAvailable={run.stage <= 3} queueMinutes={operations.queueMinutes} activeStationId={activeLabStationId} activeRunId={identity.runId} activeStatus={activeLabStationStatus} constraintKind={fault} constraintLabel={conditionDetail} constraintMetric={conditionMetric} onCommission={() => { setFacilityOpen(false); setCommissionOpen(true); }} onViewAsset={viewAssetInLab} onClose={() => setFacilityOpen(false)} />}
    {inventoryOpen && <InventoryServiceModal inventory={inventory} budgetReady={run.insight >= 35} onComplete={() => { replenishInventory(); setInventoryOpen(false); }} onClose={() => setInventoryOpen(false)} />}
    {composerOpen && <FormulationComposer initial={customCandidate?.composition} onRetain={retainCustomCandidate} onClose={() => setComposerOpen(false)} />}
  </div>;
}

function FormulationComposer({ initial, onRetain, onClose }: { initial?: CustomComposition; onRetain: (candidate: CampaignSpec) => void; onClose: () => void }) {
  const [composition, setComposition] = useState<CustomComposition>(initial ?? { caExcess: 4, zrDopant: 2, temperature: 1000, dwell: 3.5 });
  const candidate = buildCustomCampaignSpec(composition);
  const zrSites = composition.zrDopant === 0 ? [] : composition.zrDopant <= 2 ? [3] : composition.zrDopant <= 4 ? [1, 6] : [1, 4, 7];
  const update = (key: keyof CustomComposition, value: number) => setComposition((current) => ({ ...current, [key]: value }));
  return <div className="formulation-composer-backdrop" role="presentation">
    <section className="formulation-composer" role="dialog" aria-modal="true" aria-label="Scientist formulation composer">
      <header><div><p className="section-kicker">SCIENTIST WORKBENCH · USER FORMULATION</p><h2>Compose a governed experiment</h2></div><button type="button" onClick={onClose} aria-label="Close formulation composer">×</button></header>
      <div className="composer-status"><span>CANDIDATE<b>{candidate.id}</b></span><span>MODEL PRIOR<b>{candidate.prediction}</b></span><span>UNCERTAINTY<b>{candidate.uncertainty}</b></span><span>THERMAL OCCUPANCY<b>{candidate.thermalMinutes} MIN</b></span></div>
      <div className="composer-workspace">
        <div className="composer-visual">
          <svg viewBox="0 0 560 330" role="img" aria-label={`${candidate.formula} lattice and thermal program preview`}>
            <defs><pattern id="composerGrid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" className="grid" /></pattern><radialGradient id="composerAtom"><stop stopColor="#eaf8fa" /><stop offset=".42" stopColor="#81cedc" /><stop offset="1" stopColor="#264e5c" /></radialGradient></defs>
            <rect width="560" height="330" fill="url(#composerGrid)" />
            <text x="24" y="28">PEROVSKITE DESIGN CELL · A / B SITE SUBSTITUTION</text>
            <g className="composer-lattice">
              {[0, 1, 2].map((row) => [0, 1, 2].map((column) => {
                const index = row * 3 + column;
                const x = 65 + column * 74;
                const y = 72 + row * 68;
                const zr = zrSites.includes(index);
                return <g key={`${row}-${column}`}><line x1={x} x2={x + 74} y1={y} y2={y} /><line x1={x} x2={x} y1={y} y2={y + 68} /><circle cx={x} cy={y} r={zr ? 15 : 13} className={zr ? 'zr' : 'ti'} /><text x={x - (zr ? 8 : 6)} y={y + 4}>{zr ? 'Zr' : 'Ti'}</text><circle cx={x + 37} cy={y + 34} r={composition.caExcess > 0 ? 11.5 : 10} className="ca" /><text x={x + 29} y={y + 38}>Ca</text><circle cx={x + 37} cy={y} r="5" className="oxygen" /><circle cx={x} cy={y + 34} r="5" className="oxygen" /></g>;
              }))}
            </g>
            <g className="composer-thermal-preview">
              <text x="322" y="72">GOVERNED THERMAL PROGRAM</text>
              {[102, 150, 198, 246].map((y) => <line key={y} x1="322" x2="528" y1={y} y2={y} />)}
              <path d={`M326 244 C350 238 368 ${226 - (composition.temperature - 900) * .48} 392 ${226 - (composition.temperature - 900) * .48} L${436 + composition.dwell * 8} ${226 - (composition.temperature - 900) * .48} C492 ${226 - (composition.temperature - 900) * .48} 505 230 526 244`} />
              <circle cx="392" cy={226 - (composition.temperature - 900) * .48} r="4" />
              <text x="326" y="270">23 °C</text><text x="470" y="270">{candidate.temperatureShort}</text>
              <text x="326" y="298">RAMP</text><text x="397" y="298">{candidate.dwell} DWELL</text><text x="501" y="298">COOL</text>
            </g>
            <text x="24" y="306" className="composer-formula">{candidate.formula}</text>
          </svg>
          <div className="composer-envelope"><span><i style={{ width: `${Number.parseFloat(candidate.prediction)}%` }} />MODEL PRIOR<b>{candidate.prediction}</b></span><span><i style={{ width: `${Math.max(8, 100 - candidate.thermalMinutes / 5)}%` }} />THROUGHPUT<b>{candidate.throughput}</b></span></div>
        </div>
        <div className="composer-controls">
          <p>Author the material and process together. The model prior guides the choice; the retained run remains the evidence.</p>
          <CompositionControl label="CA A-SITE EXCESS" value={composition.caExcess} values={customCompositionOptions.caExcess} format={(value) => `${value >= 0 ? '+' : ''}${value} mol%`} onChange={(value) => update('caExcess', value)} />
          <CompositionControl label="ZR B-SITE SUBSTITUTION" value={composition.zrDopant} values={customCompositionOptions.zrDopant} format={(value) => `${value} mol%`} onChange={(value) => update('zrDopant', value)} />
          <CompositionControl label="CALCINATION SETPOINT" value={composition.temperature} values={customCompositionOptions.temperature} format={(value) => `${value.toLocaleString('en-US')} °C`} onChange={(value) => update('temperature', value)} />
          <CompositionControl label="DWELL TIME" value={composition.dwell} values={customCompositionOptions.dwell} format={(value) => `${value.toFixed(1)} h`} onChange={(value) => update('dwell', value)} />
          <div className="composer-custody"><i />RECIPE ID, MODEL PRIOR, AND FULL PARAMETER SET WILL BE LOCKED TO THE RUN RECORD.</div>
          <button type="button" className="composer-retain" onClick={() => onRetain(candidate)}>RETAIN IN CANDIDATE TRAY<span>→</span></button>
        </div>
      </div>
    </section>
  </div>;
}

function CompositionControl({ label, value, values, format, onChange }: { label: string; value: number; values: readonly number[]; format: (value: number) => string; onChange: (value: number) => void }) {
  const index = Math.max(0, values.indexOf(value));
  return <label className="composition-control"><span>{label}<b>{format(value)}</b></span><input type="range" min="0" max={values.length - 1} step="1" value={index} onChange={(event) => onChange(values[Number(event.target.value)])} /><em>{values.map((option) => <i key={option} className={option === value ? 'active' : ''}>{format(option)}</i>)}</em></label>;
}

function FacilityBuildModal({ thermalBayLevel, scheduled, insight, commissioningAvailable, queueMinutes, activeStationId, activeRunId, activeStatus, constraintKind, constraintLabel, constraintMetric, onCommission, onViewAsset, onClose }: { thermalBayLevel: number; scheduled: boolean; insight: number; commissioningAvailable: boolean; queueMinutes: number; activeStationId: string; activeRunId: string; activeStatus: string; constraintKind: string | null; constraintLabel: string; constraintMetric: string; onCommission: () => void; onViewAsset: (stationId: string) => void; onClose: () => void }) {
  const qualified = thermalBayLevel >= 2;
  const canCommission = commissioningAvailable && insight >= 120 && !scheduled;
  const buildState = qualified ? 'QUALIFIED' : scheduled ? 'COMMISSIONING SCHEDULED' : commissioningAvailable ? insight >= 120 ? 'READY TO COMMISSION' : '120 RP REQUIRED' : 'FINISH ACTIVE ROUTE';
  const handleAssetKey = (event: KeyboardEvent<SVGGElement>, stationId: string) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onViewAsset(stationId); } };
  const activeFlowX = activeStationId === 'PREP-01' || activeStationId === 'XRD-03' ? 130 : activeStationId === 'ROBO-02' || activeStationId === 'SEM-01' ? 340 : activeStationId === 'TGA-01' ? 686 : 550;
  const activeBranch = activeStationId === 'PREP-01' ? 'M130 137v78' : activeStationId === 'ROBO-02' ? 'M340 137v78' : activeStationId === 'FURN-04' ? 'M550 147v68' : activeStationId === 'XRD-03' ? 'M130 215v63' : activeStationId === 'SEM-01' ? 'M340 215v63' : activeStationId === 'BET-02' ? 'M550 215v63' : 'M686 233v45';
  return <div className="facility-build-backdrop" role="presentation">
    <section className="facility-build" role="dialog" aria-modal="true" aria-label="Facility configuration">
      <header><div><p className="section-kicker">FACILITY CONFIGURATION · LAB 04</p><h2>Build the experiment line</h2></div><button type="button" onClick={onClose} aria-label="Close facility configuration">×</button></header>
      <div className="facility-build-status"><span>INSTALLED ASSETS<b>07 ONLINE</b></span><span>THERMAL LANES<b>{thermalBayLevel} / 2</b></span><span>CAMPAIGN WAIT<b>{queueMinutes} MIN</b></span><span>BUILD CURRENCY<b>{insight} RP</b></span></div>
      <div className="facility-build-workspace">
        <div className="facility-blueprint">
          <div className={`facility-route-chip ${constraintKind ? 'hold' : ''}`}><span>LIVE EXPERIMENT ROUTE</span><b>{activeRunId} → {activeStationId}</b><em>{activeStatus}</em></div>
          <svg viewBox="0 0 760 430" role="group" aria-label="Interactive top-down layout of materials laboratory and its process flow">
            <defs><pattern id="facilityBuildGrid" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M14 0H0V14" /></pattern><linearGradient id="facilityFlow" x1="0" x2="1"><stop stopColor="#43c5df" stopOpacity=".2" /><stop offset=".5" stopColor="#85e4d4" /><stop offset="1" stopColor="#43c5df" stopOpacity=".2" /></linearGradient></defs>
            <rect className="blueprint-floor" x="20" y="20" width="720" height="390" rx="4" />
            <path className="blueprint-grid" d="M20 20h720v390H20z" fill="url(#facilityBuildGrid)" />
            <g className={`route-branches ${constraintKind ? 'route-hold' : ''}`}><path d="M130 137v78m210-78v78m210-68v68M130 215v63m210-63v63m210-63v63m136-45v45" /><path className="main-route" d="M58 215h586" /><path className="active-route-branch" d={activeBranch} /></g>
            <g className="material-spine"><rect x="58" y="202" width="586" height="26" rx="13" /><path d="M78 215h546" /><circle cx="115" cy="215" r="4" /><circle cx="310" cy="215" r="4" /><circle cx="505" cy="215" r="4" /><text x="281" y="219">MATERIAL TRANSFER SPINE</text></g>
            <g className={`build-asset ${activeStationId === 'PREP-01' ? `route-active ${constraintKind ? 'route-fault' : ''}` : ''}`} role="button" tabIndex={0} aria-label="Walk to PREP-01 powder preparation" onClick={() => onViewAsset('PREP-01')} onKeyDown={(event) => handleAssetKey(event, 'PREP-01')}><rect x="54" y="55" width="152" height="82" rx="3" /><text className="asset-id" x="66" y="73">PREP-01</text><text className="asset-name" x="66" y="88">POWDER PREPARATION</text><path d="M67 103h53v20H67zm65 0h60v20h-60z" /><circle cx="94" cy="113" r="7" /><text className="asset-state" x="146" y="116">{activeStationId === 'PREP-01' ? activeStatus : 'ONLINE'}</text></g>
            <g className={`build-asset ${activeStationId === 'ROBO-02' ? `route-active ${constraintKind ? 'route-fault' : ''}` : ''}`} role="button" tabIndex={0} aria-label="Walk to ROBO-02 synthesis cell" onClick={() => onViewAsset('ROBO-02')} onKeyDown={(event) => handleAssetKey(event, 'ROBO-02')}><rect x="264" y="55" width="152" height="82" rx="3" /><text className="asset-id" x="276" y="73">ROBO-02</text><text className="asset-name" x="276" y="88">SYNTHESIS CELL</text><circle cx="317" cy="111" r="19" /><path d="M317 111l20-14 18 11 19-9M317 111l-9 13" /><circle cx="355" cy="108" r="4" /><text className="asset-state" x="362" y="126">{activeStationId === 'ROBO-02' ? activeStatus : 'ONLINE'}</text></g>
            <g className={`build-asset thermal ${qualified ? 'expanded' : scheduled ? 'scheduled' : 'open-socket'} ${activeStationId === 'FURN-04' ? `route-active ${constraintKind ? 'route-fault' : ''}` : ''}`} role="button" tabIndex={0} aria-label="Walk to FURN-04 thermal bay" onClick={() => onViewAsset('FURN-04')} onKeyDown={(event) => handleAssetKey(event, 'FURN-04')}><rect x="474" y="45" width="152" height="102" rx="3" /><text className="asset-id" x="486" y="63">FURN-04</text><text className="asset-name" x="486" y="78">THERMAL BAY</text>{activeStationId === 'FURN-04' && <text className="asset-route-state" x="578" y="63">{activeStatus}</text>}<g className="chamber-a"><rect x="488" y="91" width="58" height="42" /><text x="498" y="107">A</text><circle cx="528" cy="104" r="3" /><text className="chamber-state" x="498" y="123">ONLINE</text></g><g className="chamber-b"><rect x="558" y="91" width="54" height="42" /><text x="568" y="107">B</text><circle cx="596" cy="104" r="3" /><text className="chamber-state" x="568" y="123">{qualified ? 'ONLINE' : scheduled ? 'IQ/OQ' : 'OPEN'}</text></g></g>
            <g className={`build-asset ${activeStationId === 'XRD-03' ? `route-active ${constraintKind ? 'route-fault' : ''}` : ''}`} role="button" tabIndex={0} aria-label="Walk to XRD-03 diffractometer" onClick={() => onViewAsset('XRD-03')} onKeyDown={(event) => handleAssetKey(event, 'XRD-03')}><rect x="54" y="278" width="152" height="82" rx="3" /><text className="asset-id" x="66" y="296">XRD-03</text><text className="asset-name" x="66" y="311">DIFFRACTION</text><path d="M69 341h122M81 341c19-2 20-21 32-21s11 16 24 16 12-9 21-9 10 7 20 7" /><text className="asset-state" x="151" y="351">{activeStationId === 'XRD-03' ? activeStatus : 'ONLINE'}</text></g>
            <g className={`build-asset ${activeStationId === 'SEM-01' ? `route-active ${constraintKind ? 'route-fault' : ''}` : ''}`} role="button" tabIndex={0} aria-label="Walk to SEM-01 BSE and EDS" onClick={() => onViewAsset('SEM-01')} onKeyDown={(event) => handleAssetKey(event, 'SEM-01')}><rect x="264" y="278" width="152" height="82" rx="3" /><text className="asset-id" x="276" y="296">SEM-01</text><text className="asset-name" x="276" y="311">BSE / EDS</text><circle cx="320" cy="334" r="15" /><path d="M320 313v42m-21-21h42" /><text className="asset-state" x="362" y="351">{activeStationId === 'SEM-01' ? activeStatus : 'ONLINE'}</text></g>
            <g className="build-asset" role="button" tabIndex={0} aria-label="Walk to BET-02 surface area analyzer" onClick={() => onViewAsset('BET-02')} onKeyDown={(event) => handleAssetKey(event, 'BET-02')}><rect x="474" y="278" width="152" height="82" rx="3" /><text className="asset-id" x="486" y="296">BET-02</text><text className="asset-name" x="486" y="311">SURFACE AREA</text><path d="M495 324h18v25h-18zm28-8h18v33h-18zm28 5h18v28h-18" /><text className="asset-state" x="580" y="351">ONLINE</text></g>
            <g className="build-asset narrow" role="button" tabIndex={0} aria-label="Walk to TGA-01 thermal analyzer" onClick={() => onViewAsset('TGA-01')} onKeyDown={(event) => handleAssetKey(event, 'TGA-01')}><rect x="652" y="278" width="69" height="82" rx="3" /><text className="asset-id" x="662" y="296">TGA</text><text className="asset-name" x="662" y="311">THERMAL</text><path d="M665 344c6 0 9-22 15-22s7 17 13 17 7-9 16-9" /></g>
            <g className="utility-spine"><rect x="652" y="45" width="69" height="188" rx="3" /><text x="666" y="62">UTIL</text><path d="M670 79v130m20-130v130m20-130v130" /><circle cx="670" cy="103" r="4" /><circle cx="690" cy="143" r="4" /><circle cx="710" cy="183" r="4" /><text transform="translate(667 224) rotate(-90)">GAS · VAC · EXHAUST</text></g>
            <circle className={`flow-token ${constraintKind ? 'hold' : ''}`} cx={activeFlowX} cy="215" r="5" /><text className="aisle-label" x="57" y="390">MAIN PERSONNEL AISLE</text><path className="aisle" d="M56 377h665" /><text className="north" x="718" y="38">N ↑</text>
          </svg>
          <footer><span><i className="online" />ONLINE</span><span><i className="flow" />MATERIAL FLOW</span><span><i className="socket" />EXPANSION SOCKET</span><strong>SELECT ASSET · WALK TO EQUIPMENT</strong><b>LAYOUT REV 04.7</b></footer>
        </div>
        <aside className="facility-build-controls">
          <article className={`facility-bottleneck ${constraintKind ? 'constrained' : ''}`}><span>ACTIVE BOTTLENECK</span><b>{constraintKind ? constraintLabel : queueMinutes > 30 ? 'THERMAL QUEUE' : 'NO CRITICAL CONSTRAINT'}</b><div><i style={{ width: `${constraintKind ? 78 : Math.min(100, Math.max(18, queueMinutes * 1.25))}%` }} /></div><small>{constraintKind ? constraintMetric : `${queueMinutes} MIN CAMPAIGN WAIT · ${thermalBayLevel} PARALLEL LANE${thermalBayLevel === 1 ? '' : 'S'}`}</small></article>
          <article className={`facility-expansion ${qualified ? 'qualified' : scheduled ? 'scheduled' : ''}`}><header><div><span>EXPANSION SOCKET</span><b>FURN-04B</b></div><em>{buildState}</em></header><div className="expansion-render"><i /><i /><i /><b>B</b><span>1,100 °C CHAMBER</span></div><dl><div><dt>BUILD COST</dt><dd>120 RP</dd></div><div><dt>QUALIFICATION</dt><dd>48 MIN</dd></div><div><dt>EFFECT</dt><dd>2 LANES</dd></div><div><dt>REQUIRES</dt><dd>IQ / OQ</dd></div></dl><button type="button" disabled={!qualified && !canCommission} onClick={onCommission}>{qualified ? 'VIEW IQ/OQ RECORD' : scheduled ? 'COMMISSIONING SCHEDULED' : !commissioningAvailable ? 'FINISH ACTIVE ROUTE' : insight < 120 ? '120 RP REQUIRED' : 'COMMISSION CHAMBER B'}</button></article>
          <p className="facility-build-rule"><i />FACILITY CHANGES APPLY TO FUTURE ROUTES. RETAINED RUNS ARE NEVER REWRITTEN.</p>
        </aside>
      </div>
    </section>
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
    operations.furnaceCondition === 'thermocouple-drift'
      ? { label: 'RECOVER TC-04', hint: `Resolve ${operations.furnaceResult} before thermal start` }
      : operations.furnaceCondition === 'door-seal'
        ? { label: 'RECOVER FURN-04 SEAL', hint: `Correct ${operations.furnaceResult} before thermal start` }
        : { label: 'START FURN-04 PROFILE', hint: 'Prove the load and start the governed thermal cycle' },
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
