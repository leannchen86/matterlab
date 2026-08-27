'use client';

import { useEffect, useState } from 'react';
import { evaluateCampaignMission, getCampaignIdentity, getCampaignObservedPhase, getCampaignOperations, getCampaignSpec } from './campaign-spec';
import type { CampaignMissionId, CampaignSpec } from './campaign-spec';
import { getCampaignStationId, getCampaignStationView } from './campaign-context';
import type { Station } from './sim-data';

type ScenarioId = 'xrd' | 'bet' | 'furnace' | 'tga' | 'facility';
type CampaignBacklogItem = { runNumber: number; candidate: string; missionId: CampaignMissionId };
type ConsoleSession = { completed: boolean; hmiOperations: string[] };

const emptyConsoleSession = (): ConsoleSession => ({ completed: false, hmiOperations: [] });

const profiles: Record<string, {
  controller: string;
  safe: string[];
  method: string[];
  sample: [string, string, string];
  workOrder: string;
  service: string;
  health: number;
  supplies: string[];
}> = {
  'PREP-01': { controller: 'BAL-01 / LEV-01', safe: ['LEV airflow proven', 'balance level valid', 'door sash in range', 'balance draft shield closed'], method: ['Receive lot', 'Verify balance', 'Weigh portion', 'Bind specimen'], sample: ['LOT-91', 'PREP-91-06', 'BC-184'], workOrder: 'PM-104', service: 'Filter ΔP check · 12 d', health: 94, supplies: ['weigh boats 83%', 'antistatic brush', 'P100 filters'] },
  'ROBO-02': { controller: 'RC-02 / SAFE-PLC', safe: ['area scanner clear', 'gate chain closed', 'gripper pressure valid'], method: ['Read carrier', 'Confirm destination', 'Execute transfer', 'Write handshake'], sample: ['BC-184', 'POSE-1192', 'XRD-03'], workOrder: 'WO-775', service: 'Gripper inspection · 4 d', health: 88, supplies: ['jaw inserts 2', 'vacuum cups 8', 'grease kit'] },
  'FURN-04': { controller: 'TC-04 / OT-04', safe: ['door interlock closed', 'overtemp relay armed', 'exhaust flow proven'], method: ['Verify occupancy', 'Load recipe', 'Ramp + dwell', 'Cool / release'], sample: ['BC-207', 'RCP-1000C', 'RUN-882'], workOrder: 'CAL-092', service: 'Thermocouple survey · 18 d', health: 91, supplies: ['type-K TC 3', 'hearth plate', 'door rope'] },
  'XRD-03': { controller: 'XRD-03 / RAD-PLC', safe: ['enclosure closed', 'shutter feedback closed', 'generator standby'], method: ['Load silicon QC material', 'Align holder', 'Acquire scan', 'Review QC tolerance'], sample: ['BC-184-06', 'CA-TI-031', 'PAT-7738'], workOrder: 'QC-2841', service: 'NIST SRM 640f QC check · due', health: 76, supplies: ['zero-background holders 4', 'Si QC material', 'Kapton film'] },
  'SEM-01': { controller: 'SEM-01 / VAC-1', safe: ['chamber vacuum established', 'stage Z clearance valid', 'HV blanked'], method: ['Mount stub', 'Pump chamber', 'Set field + kV', 'Capture BSE / EDS'], sample: ['CA-TI-031', 'STUB-118', 'MAP-04'], workOrder: 'PM-318', service: 'Aperture clean · 23 d', health: 96, supplies: ['carbon tabs 41', 'Al stubs 18', 'aperture set'] },
  'BET-02': { controller: 'BET-02 / VAC-MFD', safe: ['vacuum trend stable', 'N₂ supply in range', 'tube ports isolated', '77 K bath in analysis position'], method: ['Verify pretreatment', 'Enter dry mass', 'Leak test', 'Acquire isotherm'], sample: ['ADS-77-C', 'DEGAS-771', 'ISO-220'], workOrder: 'MX-233', service: 'Vendor recommission · open', health: 63, supplies: ['sample tubes 12', 'filler rods 8', 'LN₂ dewar'] },
  'TGA-01': { controller: 'TGA-01 / GAS-3', safe: ['furnace near ambient', 'purge path proven', 'autosampler clear'], method: ['Select pan pair', 'Record sample mass', 'Run empty-pan check', 'Review mass + heat flow'], sample: ['LOT-91-T', 'PANSET-14', 'THM-208'], workOrder: 'QC-621', service: 'Empty-pan + balance check · due', health: 84, supplies: ['Al pans 26', 'Pt pans 4', 'pan crimper'] },
};

const HMI_OPERATIONS: Record<string, string[]> = {
  'PREP-01': ['Prove enclosure flow', 'Close balance draft shield', 'Zero analytical balance', 'Confirm antistatic state'],
  'ROBO-02': ['Close access gate', 'Reset safeguarded stop', 'Home transfer axes', 'Prove gripper state', 'Execute transfer'],
  'FURN-04': ['Read overtemperature relay', 'Verify door chain', 'Confirm empty-cell state'],
  'XRD-03': ['Home specimen stage', 'Close radiation enclosure', 'Prove shutter feedback', 'Read silicon QC position'],
  'SEM-01': ['Verify beam blanked', 'Verify stage clearance', 'Establish chamber vacuum', 'Arm BSE / EDS detectors'],
  'BET-02': ['Isolate analysis ports', 'Run manifold leak check', 'Prove N₂ supply state', 'Position 77 K Dewar'],
  'TGA-01': ['Confirm furnace at start temperature', 'Tare balance channel', 'Prove purge path', 'Home autosampler carousel'],
};

function getFurnaceStartOperations(runOps: ReturnType<typeof getCampaignOperations>, profile: string) {
  if (runOps.furnaceCondition === 'thermocouple-drift') return ['Review witness thermocouple', 'Apply qualified controller offset', 'Prove overtemperature independence', `Start ${profile} profile`];
  if (runOps.furnaceCondition === 'door-seal') return ['Inspect door gasket witness', 'Adjust latch compression', 'Prove door-chain stability', `Start ${profile} profile`];
  return ['Read overtemperature relay', 'Verify door chain', `Start ${profile} profile`];
}

function getCampaignHmiOperations(stationId: string, stage: number, selected: string, runNumber: number, thermalBayLevel = 1): string[] | null {
  const spec = getCampaignSpec(selected);
  const identity = getCampaignIdentity(runNumber);
  const runOps = getCampaignOperations(runNumber, thermalBayLevel);
  if (!stage) return null;
  if (stationId === 'ROBO-02' && stage === 2) return runOps.robotCondition === 'contamination'
    ? ['Clean gripper tooling', 'Acquire witness coupon', 'Close access gate', 'Verify safeguarded stop']
    : runOps.robotCondition === 'grip-force'
      ? ['Inspect jaw pads', 'Acquire force witness', 'Close access gate', 'Verify safeguarded stop']
      : ['Confirm clean tool ID', 'Close access gate', 'Verify safeguarded stop', 'Prove carrier handshake'];
  if (stationId === 'ROBO-02') return [`Scan ${identity.carrier} carrier`, 'Verify six dose positions', 'Close access gate', 'Execute crucible dosing'];
  if (stationId === 'FURN-04' && stage === 4) return thermalBayLevel >= 2
    ? ['Read chamber A profile state', 'Confirm chamber B readiness', `Route ${identity.carrier} to chamber B`]
    : ['Read active profile state', 'Verify queue position', `Confirm ${identity.carrier} hold location`];
  if (stationId === 'FURN-04') return getFurnaceStartOperations(runOps, spec.profile);
  if (stationId === 'XRD-03' && stage === 6) return runOps.referenceCondition === 'age-due'
    ? ['Home specimen stage', 'Close radiation enclosure', 'Prove shutter feedback', 'Measure silicon QC material', `Acquire ${identity.runId} pattern`]
    : runOps.referenceCondition === 'trend-review'
      ? ['Home specimen stage', 'Close radiation enclosure', 'Prove shutter feedback', 'Review silicon QC trend', 'Confirm silicon QC position', `Acquire ${identity.runId} pattern`]
      : ['Home specimen stage', 'Close radiation enclosure', 'Prove shutter feedback', 'Review current Si control', `Acquire ${identity.runId} pattern`];
  if (stationId === 'XRD-03' && stage >= 7) return ['Review silicon QC check', 'Review phase fit', `Approve ${identity.pattern} evidence`];
  if (stationId === 'SEM-01' && stage === 8) return ['Verify beam blanked', 'Verify stage clearance', 'Establish chamber vacuum', 'Arm BSE / EDS detectors', 'Acquire four preplanned BSE fields', 'Acquire EDS map across the field grid'];
  if (stationId === 'SEM-01' && stage >= 9) return ['Verify beam blanked', 'Review field coverage', 'Review EDS association', `Approve ${identity.runId} diagnosis`];
  return HMI_OPERATIONS[stationId] ?? null;
}


function completeCampaignMachineStage(stage: number) {
  if (stage < 1 || (stage > 6 && stage !== 8)) return null;
  try {
    const current = JSON.parse(window.localStorage.getItem('mattershift-campaign-v2') ?? '{}') as { stage?: number; elapsed?: number; insight?: number; selected?: string; runNumber?: number; missionId?: CampaignMissionId; thermalBayLevel?: number; history?: unknown[]; [key: string]: unknown };
    if (Number(current.stage) !== stage) return null;
    const elapsed = Number(current.elapsed ?? 0);
    const insight = Number(current.insight ?? 248);
    const spec = getCampaignSpec(String(current.selected ?? 'C-42'));
    const missionId = current.missionId ?? 'purity';
    const identity = getCampaignIdentity(Number(current.runNumber ?? 42));
    const history = Array.isArray(current.history) ? current.history : [];
    const priorReplicateCount = history.filter((result) => result && typeof result === 'object' && 'candidate' in result && String((result as { candidate?: string }).candidate) === spec.id && Number((result as { runNumber?: number }).runNumber) < identity.runNumber).length;
    const observedMeasured = getCampaignObservedPhase(spec, priorReplicateCount);
    const observedSpec = { ...spec, measured: observedMeasured };
    const evaluation = evaluateCampaignMission(observedSpec, missionId, stage === 6 ? elapsed + 18 : undefined);
    const thermalBayLevel = Number(current.thermalBayLevel ?? 1);
    const runOps = getCampaignOperations(identity.runNumber, thermalBayLevel);
    const robotEntryMessage = runOps.robotCondition === 'contamination'
      ? `${identity.prepSample} evidence retained. ROBO-02 stopped on a gripper cleanliness fault before dosing.`
      : runOps.robotCondition === 'grip-force'
        ? `${identity.prepSample} evidence retained. ROBO-02 detected grip-force drift during its pre-dose tool check.`
        : `${identity.prepSample} evidence retained. ROBO-02 is nominal; tool identity and carrier handshake remain to be proved.`;
    const robotExitMessage = runOps.robotCondition === 'contamination'
      ? `Gripper cleaned and witness coupon passed after ${runOps.robotRecoveryMinutes} minutes. Robot synthesis resumed with lineage intact.`
      : runOps.robotCondition === 'grip-force'
        ? `Jaw pads were reseated and the force witness passed after ${runOps.robotRecoveryMinutes} minutes. Robot synthesis resumed with controlled grip force.`
        : `Tool identity and carrier handshake passed in ${runOps.robotRecoveryMinutes} minutes. Robot synthesis entered dosing without a recovery delay.`;
    const referenceEntryMessage = runOps.referenceCondition === 'age-due'
      ? `${spec.temperature} / ${spec.dwell} thermal trace retained. XRD sample testing is blocked; the last silicon QC check was ${runOps.referenceAgeHours} hours ago.`
      : runOps.referenceCondition === 'trend-review'
        ? `${spec.temperature} / ${spec.dwell} thermal trace retained. The ${runOps.referenceAgeHours}-hour silicon QC check remains valid, but its position trend needs confirmation before specimen acquisition.`
        : `${spec.temperature} / ${spec.dwell} thermal trace retained. The ${runOps.referenceAgeHours}-hour silicon QC check is current; XRD-03 is ready for specimen acquisition.`;
    const furnaceEntryMessage = runOps.furnaceCondition === 'thermocouple-drift'
      ? `${runOps.furnaceLane} became available after ${runOps.queueMinutes} minutes, but its independent witness reads ${runOps.furnaceResult}. Qualified offset recovery is required before ${spec.profile}.`
      : runOps.furnaceCondition === 'door-seal'
        ? `${runOps.furnaceLane} became available after ${runOps.queueMinutes} minutes. The preheat survey shows ${runOps.furnaceResult}; inspect gasket and latch compression before ${spec.profile}.`
        : `${runOps.furnaceLane} became available after ${runOps.queueMinutes} minutes. Controller agreement is ${runOps.furnaceResult}; start-readiness proof remains.`;
    const furnaceExitMessage = runOps.furnaceCondition === 'thermocouple-drift'
      ? `Witness bias corrected and overtemperature independence proved in ${runOps.furnaceRecoveryMinutes} minutes.`
      : runOps.furnaceCondition === 'door-seal'
        ? `Door gasket and latch compression recovered in ${runOps.furnaceRecoveryMinutes} minutes.`
        : `Controller, door chain, and overtemperature relay agreed in ${runOps.furnaceRecoveryMinutes} minutes.`;
    const robotInsightCost = runOps.robotCondition === 'contamination' ? 8 : runOps.robotCondition === 'grip-force' ? 4 : 0;
    const transition = {
      1: { stage: 2, elapsed: 12, insight, message: robotEntryMessage },
      2: { stage: 3, elapsed: elapsed + runOps.robotRecoveryMinutes, insight: insight - robotInsightCost, message: robotExitMessage },
      3: { stage: 4, elapsed: elapsed + 14, insight, message: thermalBayLevel >= 2 ? `Six crucibles dosed and ${identity.carrier} released. ${runOps.furnaceLane} is qualified; independent readiness proof is required while chamber A runs ${runOps.activeFurnaceRun}.` : `Six crucibles dosed and ${identity.carrier} released. FURN-04A is occupied by ${runOps.activeFurnaceRun}; ${identity.runId} is now queue constrained.` },
      4: { stage: 5, elapsed: elapsed + runOps.queueMinutes, insight, message: furnaceEntryMessage },
      5: { stage: 6, elapsed: elapsed + runOps.furnaceRecoveryMinutes + spec.thermalMinutes, insight, message: `${furnaceExitMessage} ${referenceEntryMessage}` },
      6: { stage: 7, elapsed: elapsed + 18, insight: insight + spec.insightReward, message: `${runOps.referenceCondition === 'current' ? 'Current silicon QC check reviewed' : runOps.referenceCondition === 'trend-review' ? 'Confirmatory silicon QC check passed' : 'Silicon QC check passed'} at ${runOps.referenceResult}. ${spec.id}: ${evaluation.resultText}; valid evidence, ${evaluation.met ? 'mission achieved.' : `${evaluation.constraintText}.`}` },
      8: { stage: 9, elapsed: elapsed + 26, insight: insight + 15, message: `Four preplanned BSE fields and an EDS map retained. ${spec.id === 'D-08' ? 'Ti-rich cores support incomplete conversion as the follow-up hypothesis.' : 'Ca-rich secondary grains support precursor excess as the follow-up hypothesis.'}` },
    }[stage];
    if (!transition) return null;
    const nextHistory = stage === 6
      ? [...history, {
        runNumber: identity.runNumber,
        candidate: spec.id,
        measured: observedMeasured,
        gap: evaluation.gap,
        objectiveMet: evaluation.met,
        missionId,
        elapsed: transition.elapsed,
        thermalBayLevel,
        cycle: {
          handling: 12 + runOps.robotRecoveryMinutes + 14,
          queue: runOps.queueMinutes,
          recovery: runOps.furnaceRecoveryMinutes,
          thermal: spec.thermalMinutes,
          measure: 18,
          decisions: Math.max(0, transition.elapsed - (12 + runOps.robotRecoveryMinutes + 14 + runOps.queueMinutes + runOps.furnaceRecoveryMinutes + spec.thermalMinutes + 18)),
        },
      }]
      : stage === 8
        ? history.map((result) => result && typeof result === 'object' && 'runNumber' in result && Number((result as { runNumber?: number }).runNumber) === identity.runNumber ? { ...result, diagnosis: spec.id === 'D-08' ? 'Ti-rich cores' : 'Ca-rich secondary grains' } : result)
        : history;
    const next = { ...current, ...transition, history: nextHistory };
    window.localStorage.setItem('mattershift-campaign-v2', JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('mattershift:campaign-state', { detail: next }));
    return transition.stage;
  } catch {
    return null;
  }
}

function getContextProfile(stationId: string, scenarioId: ScenarioId, campaignStage = 0, selected = 'C-42', runNumber = 42, thermalBayLevel = 1, missionId: CampaignMissionId = 'purity', resultElapsed = 0): typeof profiles[string] {
  const profile = profiles[stationId] ?? profiles['XRD-03'];
  const spec = getCampaignSpec(selected);
  const identity = getCampaignIdentity(runNumber);
  const runOps = getCampaignOperations(runNumber, thermalBayLevel);
  const evaluation = evaluateCampaignMission(spec, missionId, campaignStage >= 7 && resultElapsed > 0 ? resultElapsed : undefined);
  if (campaignStage === 1 && stationId === 'PREP-01') return { ...profile, controller: `BAL-01 / LES-${spec.id.replace('-', '')}`, method: ['Scan precursor lots', `Weigh ${spec.id} formulation`, 'Homogenize + seal', `Release ${identity.runId}`], sample: [spec.id, identity.prepSample, identity.carrier], workOrder: `MAT-${identity.suffix}`, service: 'Campaign preparation · active', supplies: [spec.precursorLabel, `target ${spec.targetMass}`, 'sealed liners 14'] };
  if (campaignStage >= 2 && campaignStage <= 3 && stationId === 'ROBO-02') {
    const conditionMethod = runOps.robotCondition === 'contamination' ? 'Clean + witness gripper' : runOps.robotCondition === 'grip-force' ? 'Inspect pads + force witness' : 'Prove tool ID + handshake';
    const conditionService = runOps.robotCondition === 'contamination' ? 'Gripper cleanliness recovery' : runOps.robotCondition === 'grip-force' ? 'Jaw-force verification' : 'Pre-dose cell readiness';
    return { ...profile, controller: 'RC-02 / CAMPAIGN-PLC', safe: campaignStage === 2 ? ['area scanner clear', 'gate chain closed', runOps.robotCondition === 'contamination' ? 'cleaning mode selected' : 'setup mode selected'] : ['area scanner clear', 'gate chain closed', 'gripper witness valid'], method: [`Receive ${identity.carrier}`, conditionMethod, 'Dose crucibles', 'Write carrier handshake'], sample: [identity.prepSample, identity.carrier, identity.furnaceQueue], workOrder: `MAT-${identity.suffix}`, service: campaignStage === 2 ? `${conditionService} · active` : 'Campaign dosing · active', health: campaignStage === 2 ? runOps.robotCondition === 'nominal' ? 96 : runOps.robotCondition === 'grip-force' ? 86 : 79 : 90 };
  }
  if (campaignStage >= 4 && campaignStage <= 5 && stationId === 'FURN-04') {
    const furnaceMethod = runOps.furnaceCondition === 'thermocouple-drift' ? 'Correct witnessed TC bias' : runOps.furnaceCondition === 'door-seal' ? 'Recover door sealing' : 'Prove start readiness';
    const furnaceService = runOps.furnaceCondition === 'thermocouple-drift' ? `Witness TC drift · ${runOps.furnaceResult}` : runOps.furnaceCondition === 'door-seal' ? `Door-seal survey · ${runOps.furnaceResult}` : `Controller agreement · ${runOps.furnaceResult}`;
    return { ...profile, controller: thermalBayLevel >= 2 ? `TC-04A/B / MES-Q${identity.suffix}` : `TC-04 / MES-Q${identity.suffix}`, method: [`Accept ${identity.carrier}`, campaignStage === 4 ? thermalBayLevel >= 2 ? 'Prove independent chamber' : 'Respect active queue' : furnaceMethod, `Load ${spec.temperature} profile`, 'Cool + release'], sample: [identity.carrier, spec.profile, identity.thermalSample], workOrder: `MAT-${identity.suffix}`, service: campaignStage === 4 ? `${runOps.furnaceLane} · ${runOps.queueMinutes} min readiness` : furnaceService, health: campaignStage === 5 && runOps.furnaceConstraint ? 81 : 94 };
  }
  if (campaignStage >= 6 && stationId === 'XRD-03') {
    const referenceMethod = runOps.referenceCondition === 'age-due' ? 'Measure NIST SRM 640f QC material' : runOps.referenceCondition === 'trend-review' ? 'Review trend + confirm silicon position' : 'Review current silicon QC check';
    const referenceService = runOps.referenceCondition === 'age-due' ? 'Silicon QC check due' : runOps.referenceCondition === 'trend-review' ? 'Silicon QC trend confirmation' : 'Silicon QC check current';
    return { ...profile, controller: 'XRD-03 / CAMPAIGN-QC', method: [referenceMethod, `Prove ${runOps.referenceResult}`, `Acquire ${identity.runId}`, `Review ${evaluation.resultText}`], sample: [identity.thermalSample, identity.xrdDataset, identity.pattern], workOrder: `MAT-${identity.suffix}`, service: campaignStage === 6 ? `${referenceService} · ${runOps.referenceAgeHours} h` : `Valid result · mission ${evaluation.met ? 'met' : 'missed'}`, health: campaignStage === 6 ? runOps.referenceConstraint ? 78 : 94 : 92 };
  }
  if (campaignStage >= 8 && stationId === 'SEM-01') return { ...profile, controller: 'SEM-01 / DIAG-EDS', method: [`Load ${identity.thermalSample}`, 'Acquire four preplanned BSE fields', 'Acquire EDS map across the field grid', 'Route mechanism hypothesis'], sample: [identity.thermalSample, `STUB-${identity.suffix}`, `MAP-${identity.suffix}`], workOrder: `MAT-${identity.suffix}`, service: campaignStage === 8 ? 'Valid-negative diagnosis · active' : 'Multi-location follow-up · retained', health: 96 };
  if (scenarioId === 'xrd' && stationId === 'FURN-04' && thermalBayLevel >= 2) return { ...profile, controller: 'TC-04A/B / ASSET-PLC', safe: ['chamber A chain independent', 'chamber B chain independent', 'overtemperature relays armed'], method: ['Review chamber assignment', 'Review IQ / OQ survey', 'Verify controller independence', 'Retain asset state'], sample: ['FURN-04A', 'FURN-04B', 'OQ-04B-990'], workOrder: 'OQ-04B', service: 'Chamber B IQ / OQ · retained', health: 95, supplies: ['survey TC set', 'empty hearth', 'door seal kit'] };
  if (scenarioId === 'facility' && stationId === 'PREP-01') return { ...profile, controller: 'MOVE-HMI / MES-A2', method: ['Scan both totes', 'Inspect powered jack', 'Secure load + route', 'Retain move receipt'], sample: ['LOT-3024-A', 'MOV-3024', 'REC-BET-02'], workOrder: 'MOV-3024', service: 'Powered-jack pre-use · current', supplies: ['restraint straps 6', 'spill kit sealed', 'tote covers 12'] };
  if (scenarioId === 'facility' && stationId === 'ROBO-02') return { ...profile, method: ['Reserve cross-aisle', 'Park robot', 'Prove safeguarded boundary', 'Release move priority'], sample: ['MOV-3024', 'A2-RESERVE', 'BET-02'], workOrder: 'MOV-3024', service: 'Cross-aisle coordination · active' };
  if (scenarioId === 'facility' && stationId === 'BET-02') return { ...profile, controller: 'BET-02 / GAS-MFD', method: ['Isolate service boundary', 'Verify GAS-41 identity', 'Run leak + QC check', 'Approve post-check results'], sample: ['GAS-41', 'MS-ALU-21', 'POST-GAS-41'], workOrder: 'GAS-41', service: 'N₂ service transition · active', health: 89 };
  if (scenarioId === 'furnace' && stationId === 'ROBO-02') return { ...profile, method: ['Observe cell', 'Reconcile occupancy', 'Dry-cycle handshake', 'Park + retain state'], sample: ['BC-207', 'I-204', 'REC-HT44'], workOrder: 'WO-2954', service: 'Recovery inspection · active' };
  if (scenarioId === 'xrd' && stationId === 'FURN-04') return { ...profile, method: ['Verify BC-184 occupancy', 'Load HT-1000', 'Ramp + dwell', 'Cool / release'], sample: ['BC-184', 'HT-1000', 'CA-TI-031'], workOrder: 'WO-2841', service: 'Campaign cycle · controlled' };
  if (scenarioId === 'xrd' && stationId === 'SEM-01') return { ...profile, sample: ['SPEC-184-03', 'BSE-F01', 'MAP-04'], workOrder: 'WO-2841', service: 'Inclusion triage · active' };
  return profile;
}

export function StationAccess({ station, scenarioId = 'xrd', campaignEnabled = false, physicalChecks = [] }: { station: Station; scenarioId?: ScenarioId; campaignEnabled?: boolean; physicalChecks?: string[] }) {
  const [open, setOpen] = useState(false);
  const [enteredFromLab, setEnteredFromLab] = useState(false);
  const [enteredChecks, setEnteredChecks] = useState<string[]>([]);
  const [sessions, setSessions] = useState<Record<string, ConsoleSession>>({});
  const [campaignStage, setCampaignStage] = useState(0);
  const [campaignSelected, setCampaignSelected] = useState('C-42');
  const [campaignRunNumber, setCampaignRunNumber] = useState(42);
  const [campaignResultElapsed, setCampaignResultElapsed] = useState(0);
  const [campaignResultMeasured, setCampaignResultMeasured] = useState('');
  const [campaignMissionId, setCampaignMissionId] = useState<CampaignMissionId>('purity');
  const [campaignThermalBayLevel, setCampaignThermalBayLevel] = useState(1);
  const [campaignBacklog, setCampaignBacklog] = useState<CampaignBacklogItem[]>([]);
  const campaignActive = campaignEnabled && scenarioId === 'xrd' && getCampaignStationId(campaignStage) === station.id;
  const facilityConfigured = campaignEnabled && scenarioId === 'xrd' && station.id === 'FURN-04' && campaignThermalBayLevel >= 2;
  const contextKey = campaignActive ? `${station.id}:RUN-${campaignRunNumber}:${campaignSelected}:${campaignMissionId}:S${campaignStage}` : facilityConfigured ? `${station.id}:CONFIG-L2` : station.id;
  const consoleStation = campaignActive ? getCampaignStationView(station, campaignStage, campaignSelected, campaignRunNumber, campaignThermalBayLevel, campaignMissionId, campaignResultElapsed, campaignResultMeasured) : station;
  const session = sessions[contextKey] ?? emptyConsoleSession();
  const completed = session.completed;
  const hmiOperations = session.hmiOperations;
  const profile = getContextProfile(station.id, scenarioId, campaignActive ? campaignStage : 0, campaignSelected, campaignRunNumber, campaignThermalBayLevel, campaignMissionId, campaignResultElapsed);
  const activePhysicalChecks = campaignActive ? (enteredFromLab ? enteredChecks : []) : physicalChecks;
  const recordStationEvent = (type: string, text: string, action?: string) => window.dispatchEvent(new CustomEvent('mattershift:station-event', { detail: { stationId: station.id, type, text, action } }));
  const finish = () => {
    setSessions((current) => {
      const active = current[contextKey] ?? emptyConsoleSession();
      return { ...current, [contextKey]: { ...active, completed: true } };
    });
    recordStationEvent('attestation', `${station.id} machine check completed by TECH-07.`);
    if (campaignActive) {
      const nextStage = completeCampaignMachineStage(campaignStage);
      if (nextStage) window.setTimeout(() => {
        setOpen(false);
        setEnteredFromLab(false);
        setEnteredChecks([]);
        const stationId = getCampaignStationId(nextStage);
        window.dispatchEvent(new CustomEvent('mattershift:return-to-lab', { detail: { stationId } }));
      }, 420);
    }
  };
  const commitHmiOperation = (operation: string) => {
    if (hmiOperations.includes(operation)) return;
    setSessions((current) => {
      const active = current[contextKey] ?? emptyConsoleSession();
      return { ...current, [contextKey]: { ...active, hmiOperations: [...active.hmiOperations, operation] } };
    });
    recordStationEvent('control', `${station.id} local control: ${operation}; equipment feedback retained.`, operation);
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = JSON.parse(window.localStorage.getItem('mattershift-campaign-v2') ?? '{}') as { stage?: number; selected?: string; runNumber?: number; missionId?: CampaignMissionId; thermalBayLevel?: number; backlog?: CampaignBacklogItem[]; history?: Array<{ runNumber?: number; elapsed?: number; measured?: string }> };
        const storedRunNumber = Number(stored.runNumber ?? 42);
        const retainedResult = stored.history?.find((item) => Number(item.runNumber) === storedRunNumber);
        setCampaignStage(Number(stored.stage ?? 0));
        setCampaignSelected(String(stored.selected ?? 'C-42'));
        setCampaignRunNumber(storedRunNumber);
        setCampaignResultElapsed(Number(retainedResult?.elapsed ?? 0));
        setCampaignResultMeasured(String(retainedResult?.measured ?? ''));
        setCampaignMissionId(stored.missionId ?? 'purity');
        setCampaignThermalBayLevel(Number(stored.thermalBayLevel ?? 1));
        setCampaignBacklog(Array.isArray(stored.backlog) ? stored.backlog.slice(0, 3) : []);
      } catch { /* preserve the deterministic server defaults */ }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const followCampaign = (event: Event) => {
      const detail = (event as CustomEvent<{ stage?: number; selected?: string; runNumber?: number; missionId?: CampaignMissionId; thermalBayLevel?: number; backlog?: CampaignBacklogItem[]; history?: Array<{ runNumber?: number; elapsed?: number; measured?: string }> }>).detail;
      const nextRunNumber = Number(detail?.runNumber ?? campaignRunNumber);
      const retainedResult = detail?.history?.find((item) => Number(item.runNumber) === nextRunNumber);
      setCampaignStage(Number(detail?.stage ?? 0));
      if (detail?.selected) setCampaignSelected(String(detail.selected));
      if (detail?.runNumber) setCampaignRunNumber(nextRunNumber);
      setCampaignResultElapsed(Number(retainedResult?.elapsed ?? 0));
      setCampaignResultMeasured(String(retainedResult?.measured ?? ''));
      if (detail?.missionId) setCampaignMissionId(detail.missionId);
      if (detail?.thermalBayLevel) setCampaignThermalBayLevel(Number(detail.thermalBayLevel));
      setCampaignBacklog(Array.isArray(detail?.backlog) ? detail.backlog.slice(0, 3) : []);
    };
    window.addEventListener('mattershift:campaign-state', followCampaign);
    return () => window.removeEventListener('mattershift:campaign-state', followCampaign);
  }, [campaignRunNumber]);

  useEffect(() => {
    const openFromLab = (event: Event) => {
      const request = event as CustomEvent<{ stationId?: string; physicalChecks?: string[] }>;
      if (request.detail?.stationId === station.id) {
        setEnteredFromLab(true);
        setEnteredChecks(request.detail.physicalChecks ?? []);
        setOpen(true);
      }
    };
    window.addEventListener('mattershift:open-console', openFromLab);
    return () => window.removeEventListener('mattershift:open-console', openFromLab);
  }, [station.id]);

  const closeConsole = () => {
    setOpen(false);
    setEnteredFromLab(false);
    setEnteredChecks([]);
  };
  const returnToAsset = () => {
    setOpen(false);
    setEnteredFromLab(false);
    setEnteredChecks([]);
    window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('mattershift:return-to-lab', { detail: { stationId: station.id } })));
  };
  const openStationAccess = () => {
    if (campaignActive && physicalChecks.length < 3) {
      window.dispatchEvent(new CustomEvent('mattershift:return-to-lab', { detail: { stationId: station.id } }));
      return;
    }
    const retainWalkaround = campaignActive && physicalChecks.length === 3;
    setEnteredFromLab(retainWalkaround);
    setEnteredChecks(retainWalkaround ? physicalChecks : []);
    setOpen(true);
  };

  return <>
    <button className="station-access-button" type="button" onClick={openStationAccess}><span>⌁</span><b>{campaignActive && physicalChecks.length < 3 ? 'INSPECT THIS MACHINE' : campaignActive ? 'USE THIS MACHINE' : 'OPERATE MACHINE'}</b>{campaignActive && <i>{physicalChecks.length === 3 ? 'Inspection complete' : `${physicalChecks.length} of 3 inspection points checked`}</i>}<em>→</em></button>
    {open && <div className="modal-backdrop station-console-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeConsole(); }}>
      <section className="modal-card wide station-console" role="dialog" aria-modal="true" aria-label={`${consoleStation.name} local station console`}>
        <header><div><p className="section-kicker">INSTRUMENT CONTROL · {profile.controller}</p><h2>{consoleStation.name}</h2></div><div className="console-header-actions">{enteredFromLab && <button type="button" className="return-asset" onClick={returnToAsset}>← BACK TO MACHINE</button>}<button type="button" onClick={closeConsole} aria-label="Close">×</button></div></header>
        <div className="console-main compact-console-main">
          <HmiView station={consoleStation} scenarioId={scenarioId} campaignStage={campaignActive ? campaignStage : 0} campaignSelected={campaignSelected} campaignRunNumber={campaignRunNumber} campaignMissionId={campaignMissionId} campaignResultElapsed={campaignResultElapsed} campaignThermalBayLevel={campaignThermalBayLevel} campaignBacklog={campaignBacklog} physicalChecks={activePhysicalChecks} operations={hmiOperations} onOperation={commitHmiOperation} complete={completed} onComplete={finish} />
        </div>
      </section>
    </div>}
  </>;
}

function HmiView({ station, scenarioId, campaignStage, campaignSelected, campaignRunNumber, campaignMissionId, campaignResultElapsed, campaignThermalBayLevel, campaignBacklog, physicalChecks, operations, onOperation, complete, onComplete }: { station: Station; scenarioId: ScenarioId; campaignStage: number; campaignSelected: string; campaignRunNumber: number; campaignMissionId: CampaignMissionId; campaignResultElapsed: number; campaignThermalBayLevel: number; campaignBacklog: CampaignBacklogItem[]; physicalChecks: string[]; operations: string[]; onOperation: (operation: string) => void; complete: boolean; onComplete: () => void }) {
  const releaseBlocked = station.tone === 'warn' || station.tone === 'off' || station.tone === 'hold';
  const walkaroundComplete = physicalChecks.length === 3;
  const operationSteps = getCampaignHmiOperations(station.id, campaignStage, campaignSelected, campaignRunNumber, campaignThermalBayLevel) ?? (station.id === 'FURN-04' && station.state !== 'READY'
    ? ['Read overtemperature relay', 'Verify door chain', 'Confirm chamber occupancy']
    : HMI_OPERATIONS[station.id] ?? HMI_OPERATIONS['XRD-03']);
  const completedOperations = operationSteps.filter((operation) => operations.includes(operation)).length;
  const operationsComplete = operationSteps.every((operation) => operations.includes(operation));
  const semFieldsReady = operations.includes('Acquire four preplanned BSE fields');
  const semEdsReady = operations.includes('Acquire EDS map across the field grid');
  const liveStation = campaignStage === 8 && station.id === 'SEM-01'
    ? {
        ...station,
        state: semEdsReady ? 'DIAGNOSIS READY' : semFieldsReady ? 'EDS MAP REQUIRED' : station.state,
        technicianView: station.technicianView.map((item) => item.startsWith('Coverage:')
          ? `Coverage: ${semFieldsReady ? '4 / 4 fields' : '0 / 4 fields'}`
          : item.startsWith('EDS map:')
            ? `EDS map: ${semEdsReady ? 'acquired' : 'queued'}`
            : item),
      }
    : station;
  return <div className="console-view hmi-view compact-hmi-view">
    <div className="console-view-head compact-console-head"><div><p className="section-kicker">{liveStation.id} · MACHINE CONTROL</p><h3>{liveStation.state}</h3></div><div className="compact-console-progress"><span>{physicalChecks.length}/3 inspected</span><b>{completedOperations}/{operationSteps.length} steps</b></div></div>
    <div className="compact-readouts">{liveStation.technicianView.slice(0, 3).map((item) => { const [key, value = '—'] = item.split(': '); return <div key={item}><span>{key}</span><b>{value}</b></div>; })}</div>
    {campaignStage === 1 && station.id === 'PREP-01' && <PrepCampaignPanel selected={campaignSelected} runNumber={campaignRunNumber} operations={operations} />}
    {campaignStage >= 2 && campaignStage <= 3 && station.id === 'ROBO-02' && <RobotCampaignPanel stage={campaignStage} selected={campaignSelected} runNumber={campaignRunNumber} operations={operations} />}
    {campaignStage >= 4 && campaignStage <= 5 && station.id === 'FURN-04' && <FurnaceCampaignPanel stage={campaignStage} selected={campaignSelected} runNumber={campaignRunNumber} thermalBayLevel={campaignThermalBayLevel} backlog={campaignBacklog} operations={operations} />}
    {campaignStage >= 6 && station.id === 'XRD-03' && <XrdCampaignPanel stage={campaignStage} selected={campaignSelected} runNumber={campaignRunNumber} missionId={campaignMissionId} resultElapsed={campaignResultElapsed} backlog={campaignBacklog} operations={operations} />}
    {campaignStage >= 8 && station.id === 'SEM-01' && <SemCampaignPanel stage={campaignStage} selected={campaignSelected} runNumber={campaignRunNumber} operations={operations} />}
    {!campaignStage && scenarioId === 'bet' && station.id === 'BET-02' && <BetHmiPanel station={station} operations={operations} />}
    {!campaignStage && scenarioId === 'tga' && station.id === 'TGA-01' && <TgaHmiPanel station={station} operations={operations} />}
    <div className="hmi-operations">
      <div><p className="mini-label">OPERATING STEPS</p><span>{completedOperations} of {operationSteps.length}</span></div>
      {operationSteps.map((operation, index) => { const done = operations.includes(operation); const priorComplete = operationSteps.slice(0, index).every((prior) => operations.includes(prior)); const qualityBlocked = !campaignStage && releaseBlocked && /^(Execute|Start|Acquire)\b/.test(operation); const active = walkaroundComplete && priorComplete && !done && !qualityBlocked; return <button key={operation} type="button" className={done ? 'done' : qualityBlocked && priorComplete ? 'quality-blocked' : active ? 'active' : ''} disabled={!walkaroundComplete || !priorComplete || done || qualityBlocked} onClick={() => onOperation(operation)}><i>{done ? '✓' : qualityBlocked && priorComplete ? '!' : `0${index + 1}`}</i><b>{operation}</b><small>{done ? 'Done' : qualityBlocked && priorComplete ? 'On hold' : active ? 'Ready' : 'Waiting'}</small></button>; })}
    </div>
    <ConsoleAction complete={complete} disabled={!walkaroundComplete || !operationsComplete} idle={!walkaroundComplete ? 'INSPECTION REQUIRED' : operationsComplete ? 'FINISH MACHINE CHECK' : 'COMPLETE THE STEPS'} done="CHECK COMPLETE" note={complete ? 'Machine check saved.' : !walkaroundComplete ? `Inspect all 3 points on the machine first.` : operationsComplete ? 'All required feedback is present.' : 'Complete each step in order.'} onClick={onComplete} />
  </div>;
}

const PRECURSOR_PROGRAMS: Record<string, Array<{ lot: string; material: string; mass: string }>> = {
  'C-42': [{ lot: 'CA-21A', material: 'CaCO₃', mass: '13.82 g' }, { lot: 'TI-09C', material: 'TiO₂', mass: '10.18 g' }],
  'Z-17': [{ lot: 'CA-21A', material: 'CaCO₃', mass: '12.39 g' }, { lot: 'TI-09C', material: 'TiO₂', mass: '9.50 g' }, { lot: 'ZR-04B', material: 'ZrO₂', mass: '0.61 g' }],
  'D-08': [{ lot: 'CA-21A', material: 'CaCO₃', mass: '13.35 g' }, { lot: 'TI-09C', material: 'TiO₂', mass: '10.65 g' }],
  'A-29': [{ lot: 'CA-21A', material: 'CaCO₃', mass: '13.28 g' }, { lot: 'TI-09C', material: 'TiO₂', mass: '10.39 g' }, { lot: 'ZR-04B', material: 'ZrO₂', mass: '0.33 g' }],
  'R-31': [{ lot: 'CA-21A', material: 'CaCO₃', mass: '13.35 g' }, { lot: 'TI-09C', material: 'TiO₂', mass: '10.65 g' }],
};

function PrepCampaignPanel({ selected, runNumber, operations }: { selected: string; runNumber: number; operations: string[] }) {
  const spec = getCampaignSpec(selected);
  const identity = getCampaignIdentity(runNumber);
  const airflowProven = operations.includes('Prove enclosure flow');
  const zeroed = operations.includes('Zero analytical balance');
  const antistatic = operations.includes('Confirm antistatic state');
  const target = Number.parseFloat(spec.targetMass);
  const offset = spec.id === 'Z-17' ? -.0002 : spec.id === 'D-08' ? .0001 : .0002;
  const actual = (target + offset).toFixed(4);
  const lots = spec.composition ? (() => {
    const caMoles = 1 + spec.composition.caExcess / 100;
    const tiMoles = 1 - spec.composition.zrDopant / 100;
    const zrMoles = spec.composition.zrDopant / 100;
    const rawCa = caMoles * 100.0869; // CaCO3 formula weight, g mol-1
    const rawTi = tiMoles * 79.8658; // TiO2 formula weight, g mol-1
    const rawZr = zrMoles * 123.222; // ZrO2 formula weight, g mol-1
    const scale = target / (rawCa + rawTi + rawZr);
    return [
      { lot: 'CA-21A', material: 'CaCO₃', mass: `${(rawCa * scale).toFixed(2)} g` },
      { lot: 'TI-09C', material: 'TiO₂', mass: `${(rawTi * scale).toFixed(2)} g` },
      ...(spec.composition.zrDopant > 0 ? [{ lot: 'ZR-04B', material: 'ZrO₂', mass: `${(rawZr * scale).toFixed(2)} g` }] : []),
    ];
  })() : PRECURSOR_PROGRAMS[spec.id] ?? PRECURSOR_PROGRAMS['C-42'];
  const status = antistatic ? 'PORTION RELEASED' : zeroed ? 'MASS STABLE' : airflowProven ? 'READY TO TARE' : 'ENCLOSURE HOLD';
  const massPath = zeroed ? 'M257 125 C276 124 287 126 301 124 S327 125 341 124 S366 126 383 124 S411 125 431 124 S456 123 479 124' : 'M257 146 H479';
  return <section className={`campaign-prep-console${antistatic ? ' operation-complete' : ''}`}>
    <header><div><span>POWDER PREPARATION RECORD</span><b>BAL-01 / LEV-01 · MAT-{identity.suffix} · {spec.id}</b></div><em>{status}</em></header>
    <div className="campaign-prep-layout">
      <svg viewBox="0 0 520 180" role="img" aria-label={`${identity.runId} ${spec.formula} precursor weighing program`}>
        <defs><pattern id="prepGrid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" className="grid" /></pattern><linearGradient id="balanceGlow" x1="0" x2="1"><stop stopColor="#4dd5ed" stopOpacity=".05" /><stop offset=".5" stopColor="#4dd5ed" stopOpacity=".26" /><stop offset="1" stopColor="#4dd5ed" stopOpacity=".05" /></linearGradient></defs>
        <rect width="520" height="180" fill="url(#prepGrid)" />
        <rect x="20" y="21" width="207" height="136" rx="3" className={airflowProven ? 'prep-enclosure proven' : 'prep-enclosure'} /><path d="M35 46 H211 M35 61 H211" className={airflowProven ? 'airflow proven' : 'airflow'} /><text x="34" y="35">LEV-01 · {airflowProven ? '0.48 m/s PROVEN' : 'FLOW PROOF REQUIRED'}</text>
        {lots.map((lot, index) => <g key={lot.lot} transform={`translate(34 ${77 + index * 23})`} className="precursor-lot"><rect width="176" height="18" rx="2" /><text x="7" y="12">{lot.lot}</text><text x="62" y="12">{lot.material}</text><text x="132" y="12">{lot.mass}</text></g>)}
        <rect x="247" y="21" width="252" height="136" rx="3" className="balance-deck" /><text x="259" y="36">ANALYTICAL BALANCE · ±0.2 mg</text>
        <rect x="258" y="48" width="229" height="45" rx="2" className={zeroed ? 'balance-display stable' : 'balance-display'} /><text x="270" y="64">{identity.prepSample}</text><text x="270" y="84" className="mass-value">{zeroed ? actual : '—.——'} g</text><text x="422" y="84" className={zeroed ? 'within' : ''}>{zeroed ? 'STABLE' : 'NOT TARED'}</text>
        <line x1="258" x2="487" y1="146" y2="146" className="mass-baseline" /><path d={massPath} className={zeroed ? 'mass-trace stable' : 'mass-trace'} /><line x1="258" x2="487" y1="119" y2="119" className="mass-target" /><text x="259" y="111">TARGET {spec.targetMass} · LIMIT ±0.0002 g</text>
        {antistatic && <g className="release-stamp"><rect x="392" y="97" width="94" height="20" rx="2" /><text x="404" y="110">RELEASE → {identity.carrier}</text></g>}
      </svg>
      <aside>
        <div className={airflowProven ? 'pass' : 'hold'}><span>ENCLOSURE FLOW</span><b>{airflowProven ? '0.48 m/s' : 'HOLD'}</b><small>{airflowProven ? 'LEV feedback true' : 'prove local capture'}</small></div>
        <div className={zeroed ? 'pass' : airflowProven ? 'review' : 'waiting'}><span>NET MASS</span><b>{zeroed ? `${actual} g` : '—'}</b><small>{zeroed ? `${offset >= 0 ? '+' : '−'}${Math.abs(offset * 1000).toFixed(1)} mg` : 'tare required'}</small></div>
        <div className={antistatic ? 'pass' : 'waiting'}><span>PORTION RECORD</span><b>{identity.prepSample}</b><small>{antistatic ? `${identity.carrier} linked` : 'antistatic gate'}</small></div>
      </aside>
    </div>
  </section>;
}

const CRUCIBLE_POSITIONS = [[362, 64], [408, 64], [454, 64], [362, 116], [408, 116], [454, 116]];

function RobotCampaignPanel({ stage, selected, runNumber, operations }: { stage: number; selected: string; runNumber: number; operations: string[] }) {
  const spec = getCampaignSpec(selected);
  const identity = getCampaignIdentity(runNumber);
  const runOps = getCampaignOperations(runNumber);
  const recovery = stage === 2;
  const boundaryProven = stage >= 3 || operations.includes('Verify safeguarded stop');
  const toolingChecked = stage >= 3 || (runOps.robotCondition === 'contamination'
    ? operations.includes('Clean gripper tooling')
    : runOps.robotCondition === 'grip-force'
      ? operations.includes('Inspect jaw pads')
      : operations.includes('Confirm clean tool ID'));
  const witnessPassed = stage >= 3 || (runOps.robotCondition === 'contamination'
    ? operations.includes('Acquire witness coupon')
    : runOps.robotCondition === 'grip-force'
      ? operations.includes('Acquire force witness')
      : operations.includes('Prove carrier handshake'));
  const carrierScanned = stage >= 3 && operations.includes(`Scan ${identity.carrier} carrier`);
  const positionsProven = stage >= 3 && operations.includes('Verify six dose positions');
  const dosingComplete = stage >= 3 && operations.includes('Execute crucible dosing');
  const perPosition = `${(Number.parseFloat(spec.targetMass) / 6).toFixed(2)} g`;
  const armPath = recovery
    ? witnessPassed ? 'M178 96 L238 58 L302 83' : toolingChecked ? 'M178 96 L224 129 L302 126' : 'M178 96 L232 83 L278 104'
    : dosingComplete ? 'M178 96 L272 52 L408 90' : positionsProven ? 'M178 96 L278 70 L362 64' : carrierScanned ? 'M178 96 L252 126 L322 132' : 'M178 96 L228 74 L270 92';
  const endpoint = recovery
    ? witnessPassed ? [302, 83] : toolingChecked ? [302, 126] : [278, 104]
    : dosingComplete ? [408, 90] : positionsProven ? [362, 64] : carrierScanned ? [322, 132] : [270, 92];
  const status = recovery
    ? witnessPassed
      ? runOps.robotCondition === 'contamination' ? 'CLEAN WITNESS PASS' : runOps.robotCondition === 'grip-force' ? 'FORCE WITNESS PASS' : 'CELL READY'
      : toolingChecked
        ? runOps.robotCondition === 'contamination' ? 'CLEANING COMPLETE' : runOps.robotCondition === 'grip-force' ? 'PADS INSPECTED' : 'TOOL ID CONFIRMED'
        : boundaryProven ? runOps.robotCondition === 'contamination' ? 'CLEANING ENABLED' : 'SETUP ENABLED' : 'SAFEGUARD HOLD'
    : dosingComplete ? 'DOSE COMPLETE' : positionsProven ? 'PROGRAM PROVEN' : carrierScanned ? 'CARRIER BOUND' : 'IDENTITY REQUIRED';
  return <section className={`campaign-robot-console${dosingComplete || witnessPassed ? ' operation-complete' : ''}`}>
    <header><div><span>ROBOT CELL PROGRAM</span><b>RC-02 · MAT-{identity.suffix} · {spec.id}</b></div><em>{status}</em></header>
    <div className="campaign-robot-layout">
      <svg viewBox="0 0 520 180" role="img" aria-label={`${identity.runId} robotic ${recovery ? `${runOps.robotCondition} setup` : 'six-position dosing'} program`}>
        <defs><pattern id="robotGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" className="grid" /></pattern><linearGradient id="robotArmMetal" x1="0" x2="1"><stop stopColor="#a9bac2" /><stop offset=".55" stopColor="#536977" /><stop offset="1" stopColor="#c8d3d6" /></linearGradient></defs>
        <rect width="520" height="180" fill="url(#robotGrid)" />
        <path d="M20 18 H488 V160 H20 Z" className={boundaryProven ? 'cell-boundary proven' : 'cell-boundary'} />
        <path d="M24 150 H142 V119 H24" className="feed-zone" /><text x="32" y="139">{identity.carrier} INFEED</text>
        <rect x="290" y="38" width="188" height="104" rx="4" className="dose-deck" /><text x="302" y="53">6-POSITION CRUCIBLE DECK</text>
        {!recovery && <path d="M322 132 C349 125 350 73 362 64 S397 113 408 116 S442 72 454 64" className={positionsProven ? 'dose-path proven' : 'dose-path'} />}
        {CRUCIBLE_POSITIONS.map(([x, y], index) => <g key={`${x}-${y}`} className={`crucible-position${positionsProven ? ' proven' : ''}${dosingComplete ? ' dosed' : ''}`}><circle cx={x} cy={y} r="13" /><circle cx={x} cy={y} r="6" /><text x={x - 4} y={y + 3}>{index + 1}</text></g>)}
        <circle cx="178" cy="96" r="30" className="robot-base" /><circle cx="178" cy="96" r="15" className="robot-joint" />
        <path d={armPath} className={`robot-arm-path${positionsProven && !dosingComplete ? ' executing' : ''}`} />
        <circle cx="232" cy="83" r="10" className="robot-joint arm-joint" /><circle cx={endpoint[0]} cy={endpoint[1]} r="9" className="robot-joint tool-joint" />
        <path d={`M${endpoint[0] - 9} ${endpoint[1] + 7} l-6 10 M${endpoint[0] + 9} ${endpoint[1] + 7} l6 10`} className={witnessPassed ? 'gripper clean' : 'gripper'} />
        <text x="148" y="139">R6-850 ARM</text><text x="294" y="156">{spec.formula} · {perPosition} / POSITION</text>
      </svg>
      <aside>
        <div className={carrierScanned || recovery ? recovery ? 'waiting' : 'pass' : 'hold'}><span>CARRIER</span><b>{recovery ? 'NOT LOADED' : identity.carrier}</b><small>{recovery ? 'recovery mode' : carrierScanned ? 'identity bound' : 'scan required'}</small></div>
        <div className={witnessPassed ? 'pass' : toolingChecked ? 'review' : runOps.robotCondition === 'nominal' ? 'waiting' : 'hold'}><span>{runOps.robotCondition === 'grip-force' ? 'GRIP FORCE' : runOps.robotCondition === 'nominal' ? 'TOOL / HANDSHAKE' : 'TOOL WITNESS'}</span><b>{witnessPassed ? 'PASS' : toolingChecked ? 'DUE' : runOps.robotCondition === 'contamination' ? 'CONTAM' : runOps.robotCondition === 'grip-force' ? 'DRIFT' : 'VERIFY'}</b><small>{witnessPassed ? runOps.robotCondition === 'nominal' ? 'carrier handshake retained' : 'witness retained' : toolingChecked ? runOps.robotCondition === 'grip-force' ? 'acquire force witness' : runOps.robotCondition === 'nominal' ? 'prove carrier handshake' : 'acquire coupon' : runOps.robotCondition === 'grip-force' ? 'inspect jaw pads' : runOps.robotCondition === 'nominal' ? 'confirm clean tool ID' : 'clean gripper'}</small></div>
        <div className={dosingComplete ? 'pass' : positionsProven ? 'review' : 'waiting'}><span>MASS PROGRAM</span><b>{perPosition} × 6</b><small>{dosingComplete ? `${spec.targetMass} total` : positionsProven ? 'positions proven' : 'execution held'}</small></div>
      </aside>
    </div>
  </section>;
}

function FurnaceCampaignPanel({ stage, selected, runNumber, thermalBayLevel, backlog, operations }: { stage: number; selected: string; runNumber: number; thermalBayLevel: number; backlog: CampaignBacklogItem[]; operations: string[] }) {
  const spec = getCampaignSpec(selected);
  const identity = getCampaignIdentity(runNumber);
  const runOps = getCampaignOperations(runNumber, thermalBayLevel);
  const queued = stage === 4;
  const auxiliary = thermalBayLevel >= 2;
  const startOperations = getFurnaceStartOperations(runOps, spec.profile);
  const profileRead = operations.includes(queued ? auxiliary ? 'Read chamber A profile state' : 'Read active profile state' : startOperations[0]);
  const secondGate = operations.includes(queued ? auxiliary ? 'Confirm chamber B readiness' : 'Verify queue position' : startOperations[1]);
  const thirdGate = queued || startOperations.length < 4 || operations.includes(startOperations[2]);
  const finalGate = operations.includes(queued ? auxiliary ? `Route ${identity.carrier} to chamber B` : `Confirm ${identity.carrier} hold location` : startOperations[startOperations.length - 1]);
  const setpoint = Number.parseFloat(spec.temperature);
  const dwellMinutes = Number.parseFloat(spec.dwell) * 60;
  const dwellFraction = Math.min(.66, Math.max(.42, dwellMinutes / spec.thermalMinutes));
  const rampEnd = 132;
  const dwellEnd = rampEnd + dwellFraction * 300;
  const temperatureY = 146 - Math.min(1, setpoint / 1100) * 108;
  const thermalPath = `M42 146 C70 144 94 102 ${rampEnd} ${temperatureY} L${dwellEnd.toFixed(0)} ${temperatureY} C${(dwellEnd + 31).toFixed(0)} ${temperatureY + 8} 449 128 478 146`;
  const actualPath = `M42 147 C70 145 96 105 ${rampEnd} ${temperatureY + 3} L${dwellEnd.toFixed(0)} ${temperatureY + 3} C${(dwellEnd + 35).toFixed(0)} ${temperatureY + 12} 452 132 478 147`;
  const status = queued ? auxiliary ? finalGate ? 'LANE B READY' : secondGate ? 'ROUTE CHECK' : profileRead ? 'LANE B CHECK' : 'CHAMBER A ACTIVE' : finalGate ? 'QUEUE PROVEN' : secondGate ? 'LOCATION CHECK' : profileRead ? 'Q01 CONFIRMED' : 'OCCUPANCY HOLD' : finalGate ? 'PROFILE ACTIVE' : thirdGate ? 'START ENABLED' : secondGate ? runOps.furnaceCondition === 'thermocouple-drift' ? 'OFFSET APPLIED' : runOps.furnaceCondition === 'door-seal' ? 'LATCH ADJUSTED' : 'DOOR CHECK' : profileRead ? runOps.furnaceCondition === 'thermocouple-drift' ? 'TC BIAS CONFIRMED' : runOps.furnaceCondition === 'door-seal' ? 'SEAL LOSS CONFIRMED' : 'SAFETY CHAIN' : runOps.furnaceCondition === 'thermocouple-drift' ? 'TC OFFSET HOLD' : runOps.furnaceCondition === 'door-seal' ? 'DOOR SEAL HOLD' : 'RECIPE LOADED';
  return <section className={`campaign-furnace-console${finalGate ? ' operation-complete' : ''}`}>
    <header><div><span>THERMAL PROCESS CONTROL</span><b>TC-04 / OT-04 · MAT-{identity.suffix} · {spec.profile}</b></div><em>{status}</em></header>
    <StationBacklogStrip backlog={backlog} station="furnace" lanes={thermalBayLevel} />
    <div className="campaign-furnace-layout">
      <svg viewBox="0 0 520 180" role="img" aria-label={queued ? `${identity.runId} furnace queue behind ${runOps.activeFurnaceRun}` : `${identity.runId} ${spec.temperature} ${spec.dwell} thermal profile`}>
        <defs><pattern id="furnaceGrid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" className="grid" /></pattern><linearGradient id="furnaceGlow" x1="0" x2="1"><stop stopColor="#ff9a58" stopOpacity=".12" /><stop offset=".5" stopColor="#ff9a58" stopOpacity=".55" /><stop offset="1" stopColor="#ffca79" stopOpacity=".12" /></linearGradient></defs>
        <rect width="520" height="180" fill="url(#furnaceGrid)" />
        {queued ? <>
          <text x="24" y="25">{auxiliary ? 'DUAL-CHAMBER BAY · INDEPENDENT CONTROLLERS' : 'CAPACITY-ONE RESOURCE · PHYSICAL OCCUPANCY'}</text>
          <rect x="26" y="42" width="170" height="91" rx="4" className="furnace-chamber" /><rect x="43" y="57" width="136" height="58" rx="3" className="furnace-hot-zone" /><path d="M54 103 C74 58 95 111 115 67 S153 105 169 64" className="heat-wave" /><text x="65" y="88">{runOps.activeFurnaceRun} ACTIVE</text><text x="71" y="103">{runOps.queueMinutes} MIN REMAINING</text>
          <path d="M204 87 H252" className={finalGate ? 'queue-arrow released' : 'queue-arrow'} /><rect x="258" y="53" width="205" height="70" rx="3" className={secondGate ? 'queue-carrier proven' : 'queue-carrier'} /><text x="278" y="77">{auxiliary ? 'CHAMBER B' : 'Q01'} · {identity.runId}</text><text x="278" y="93">{identity.carrier} · {spec.profile}</text><text x="278" y="108">{auxiliary ? 'IQ / OQ RETAINED' : `HOLD LOCATION ${finalGate ? 'PROVEN' : 'PENDING'}`}</text>
          <line x1="28" y1="151" x2="470" y2="151" className="timeline" /><rect x="28" y="145" width="206" height="12" className="timeline-active" /><rect x="237" y="145" width="222" height="12" className={finalGate ? 'timeline-queued proven' : 'timeline-queued'} /><text x="32" y="171">NOW</text><text x="224" y="171">+{runOps.queueMinutes} MIN</text><text x="436" y="171">+{runOps.queueMinutes + spec.thermalMinutes} MIN</text>
        </> : <>
          {[42, 146, 250, 354, 478].map((x) => <line key={`fx-${x}`} x1={x} x2={x} y1="23" y2="148" className="plot-grid" />)}{[38, 74, 110, 146].map((y) => <line key={`fy-${y}`} x1="42" x2="478" y1={y} y2={y} className="plot-grid" />)}
          <text x="12" y="42">{spec.temperature}</text><text x="18" y="149">23 °C</text><text x="40" y="169">0</text><text x="224" y="169">TIME · MIN</text><text x="460" y="169">{spec.thermalMinutes}</text>
          <path d={thermalPath} className="thermal-setpoint" /><path d={actualPath} className={finalGate ? 'thermal-actual active' : runOps.furnaceConstraint ? 'thermal-actual fault' : 'thermal-actual'} />
          <line x1={rampEnd} x2={rampEnd} y1="28" y2="151" className="phase-mark" /><line x1={dwellEnd} x2={dwellEnd} y1="28" y2="151" className="phase-mark" /><text x="75" y="27">RAMP</text><text x={rampEnd + 15} y="27">DWELL · {spec.dwell}</text><text x={dwellEnd + 14} y="27">COOL</text>
          {finalGate && <g className="profile-cursor"><line x1="72" x2="72" y1="27" y2="151" /><circle cx="72" cy="131" r="4" /><text x="79" y="137">PROFILE STARTED</text></g>}
        </>}
      </svg>
      <aside>
        <div className={profileRead ? 'pass' : 'hold'}><span>{queued ? auxiliary ? 'CHAMBER A' : 'OCCUPANCY' : runOps.furnaceCondition === 'thermocouple-drift' ? 'WITNESS TC' : runOps.furnaceCondition === 'door-seal' ? 'DOOR SURVEY' : 'OVERTEMP'}</span><b>{queued ? runOps.activeFurnaceRun : runOps.furnaceConstraint ? runOps.furnaceCondition === 'thermocouple-drift' ? '+11.8 °C' : '12.6 °C' : profileRead ? 'ARMED' : 'READ'}</b><small>{queued ? auxiliary ? 'independent TC active' : 'capacity 1 / 1' : profileRead ? runOps.furnaceResult : 'proof required'}</small></div>
        <div className={secondGate && thirdGate ? 'pass' : secondGate ? 'review' : 'waiting'}><span>{queued ? auxiliary ? 'CHAMBER B' : 'QUEUE' : runOps.furnaceCondition === 'thermocouple-drift' ? 'TC / OVERTEMP' : runOps.furnaceCondition === 'door-seal' ? 'LATCH / CHAIN' : 'DOOR CHAIN'}</span><b>{queued ? auxiliary ? secondGate ? 'READY' : 'VERIFY' : 'Q01' : thirdGate ? 'PROVEN' : secondGate ? 'VERIFY' : '—'}</b><small>{queued ? auxiliary ? 'independent TC + pre-start survey' : identity.carrier : thirdGate ? 'independent proof retained' : secondGate ? 'secondary proof due' : 'awaiting sequence'}</small></div>
        <div className={finalGate ? 'pass' : 'waiting'}><span>{queued ? 'RELEASE' : 'THERMAL DOSE'}</span><b>{queued ? `${runOps.queueMinutes} min` : spec.temperature}</b><small>{queued ? finalGate ? 'location proven' : 'carrier held' : finalGate ? `${spec.dwell} dwell · recovery retained` : `${runOps.furnaceRecoveryMinutes} min recovery`}</small></div>
      </aside>
    </div>
  </section>;
}

const XRD_PEAKS: Record<string, Array<[number, number]>> = {
  'C-42': [[23.2, .28], [33.1, 1], [40.8, .36], [47.6, .55], [59.2, .72], [69.4, .31]],
  'Z-17': [[22.9, .22], [29.5, .27], [32.8, 1], [40.4, .41], [47.1, .61], [58.8, .78], [69.1, .38], [74.2, .18]],
  'D-08': [[23.1, .25], [33.0, 1], [40.6, .34], [47.4, .49], [59.0, .68], [69.3, .29]],
  'A-29': [[22.8, .2], [29.4, .16], [32.9, 1], [40.5, .39], [47.2, .58], [58.9, .76], [69.2, .35], [74.0, .14]],
  'R-31': [[23.1, .18], [33.0, 1], [40.7, .38], [47.5, .57], [59.1, .74], [69.3, .34]],
};

function getSamplePeaks(spec: CampaignSpec) {
  const retained = XRD_PEAKS[spec.id];
  if (retained) return retained;
  if (!spec.composition) return XRD_PEAKS['C-42'];
  const { caExcess, zrDopant, temperature, dwell } = spec.composition;
  const latticeShift = -zrDopant * .043;
  const mainPhase = XRD_PEAKS['R-31'].map(([center, height]) => [center + latticeShift, height] as [number, number]);
  const impurityScale = Math.max(.04, Math.min(.28, (100 - Number(spec.measured)) / 18));
  const secondary: Array<[number, number]> = [];
  if (Math.abs(caExcess) >= 4) {
    secondary.push([29.38 + latticeShift * .18, impurityScale * (.75 + Math.abs(caExcess) / 16)]);
    secondary.push([36.16, impurityScale * .58]);
  }
  if (temperature <= 950 || dwell <= 3.5) {
    secondary.push([27.43, impurityScale * (temperature <= 900 ? 1.05 : .65)]);
    secondary.push([54.32, impurityScale * .42]);
  }
  if (zrDopant >= 2) secondary.push([74.08 + latticeShift, Math.min(.22, .06 + zrDopant * .02)]);
  return [...mainPhase, ...secondary].sort((left, right) => left[0] - right[0]);
}

function diffractionPath(peaks: Array<[number, number]>, baseline: number, amplitude: number) {
  return Array.from({ length: 151 }, (_, index) => {
    const angle = 10 + index * (70 / 150);
    const intensity = peaks.reduce((sum, [center, height]) => sum + height * Math.exp(-0.5 * ((angle - center) / .34) ** 2), 0);
    const x = 42 + index * (584 / 150);
    const y = baseline - Math.min(1.06, intensity) * amplitude;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function XrdCampaignPanel({ stage, selected, runNumber, missionId, resultElapsed, backlog, operations }: { stage: number; selected: string; runNumber: number; missionId: CampaignMissionId; resultElapsed: number; backlog: CampaignBacklogItem[]; operations: string[] }) {
  const spec = getCampaignSpec(selected);
  const observedMeasured = (() => {
    if (typeof window === 'undefined') return spec.measured;
    try {
      const stored = JSON.parse(window.localStorage.getItem('mattershift-campaign-v2') ?? '{}') as { history?: Array<{ runNumber?: number; candidate?: string; measured?: string }> };
      const history = Array.isArray(stored.history) ? stored.history : [];
      const retained = history.find((result) => Number(result.runNumber) === runNumber);
      if (retained?.measured) return retained.measured;
      const priorReplicateCount = history.filter((result) => result.candidate === spec.id && Number(result.runNumber) < runNumber).length;
      return getCampaignObservedPhase(spec, priorReplicateCount);
    } catch { return spec.measured; }
  })();
  const observedSpec = { ...spec, measured: observedMeasured };
  const evaluation = evaluateCampaignMission(observedSpec, missionId, stage >= 7 && resultElapsed > 0 ? resultElapsed : undefined);
  const identity = getCampaignIdentity(runNumber);
  const runOps = getCampaignOperations(runNumber);
  const referenceCaptured = stage >= 7 || (runOps.referenceCondition === 'age-due'
    ? operations.includes('Measure silicon QC material')
    : runOps.referenceCondition === 'trend-review'
      ? operations.includes('Confirm silicon QC position')
      : operations.includes('Review current Si control'));
  const sampleCaptured = stage >= 7 || operations.includes(`Acquire ${identity.runId} pattern`);
  const samplePeaks = getSamplePeaks(observedSpec);
  const referenceStatus = runOps.referenceCondition === 'age-due' ? 'SILICON QC REQUIRED' : runOps.referenceCondition === 'trend-review' ? 'QC TREND REVIEW' : 'SILICON QC CURRENT';
  return <section className={`campaign-xrd-console${sampleCaptured ? ' result-ready' : ''}`}>
    <header><div><span>DIFFRACTION ACQUISITION</span><b>{identity.xrdDataset} · Cu Kα · 10–80° 2θ</b></div><em>{sampleCaptured ? 'PATTERN COMPLETE' : referenceCaptured ? runOps.referenceCondition === 'current' ? 'QC REVIEWED' : 'QC CHECK PASSED' : referenceStatus}</em></header>
    <StationBacklogStrip backlog={backlog} station="xrd" lanes={1} />
    <div className="campaign-xrd-layout">
      <svg viewBox="0 0 660 210" role="img" aria-label={`${identity.runId} simulated silicon QC check and diffraction pattern`}>
        <defs><linearGradient id="xrdFill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#4dd5ed" stopOpacity=".25" /><stop offset="1" stopColor="#4dd5ed" stopOpacity="0" /></linearGradient></defs>
        {[42, 126, 210, 294, 378, 462, 546, 626].map((x) => <line key={`x-${x}`} x1={x} x2={x} y1="17" y2="186" className="grid" />)}
        {[30, 64, 98, 132, 166].map((y) => <line key={`y-${y}`} x1="42" x2="626" y1={y} y2={y} className="grid" />)}
        <line x1="42" x2="626" y1="76" y2="76" className="baseline" /><line x1="42" x2="626" y1="174" y2="174" className="baseline" />
        <text x="48" y="24">NIST SRM 640f CONTROL</text><text x="48" y="116">{identity.runId} · {spec.id}</text>
        {referenceCaptured ? <path d={diffractionPath([[28.44, 1], [47.3, .24], [56.1, .16]], 72, 42)} className="reference-trace" /> : <path d="M42 72 H626" className="awaiting-trace" />}
        {sampleCaptured ? <><path d={`${diffractionPath(samplePeaks, 172, 58)} L626 174 L42 174 Z`} className="sample-fill" /><path d={diffractionPath(samplePeaks, 172, 58)} className="sample-trace" /></> : <path d="M42 172 H626" className="awaiting-trace" />}
        {!sampleCaptured && referenceCaptured && <line x1="118" x2="118" y1="106" y2="176" className="scan-sweep" />}
        <text x="38" y="198">10°</text><text x="324" y="198">2θ</text><text x="609" y="198">80°</text>
      </svg>
      <aside>
        <div className={referenceCaptured ? 'pass' : runOps.referenceConstraint ? 'hold' : 'review'}><span>SILICON QC</span><b>{referenceCaptured ? runOps.referenceResult : `${runOps.referenceAgeHours} H OLD`}</b><small>{referenceCaptured ? 'inside ±0.05° QC tolerance' : runOps.referenceCondition === 'trend-review' ? 'confirm position trend' : runOps.referenceCondition === 'current' ? 'review before sample' : 'sample testing blocked'}</small></div>
        <div className={sampleCaptured ? 'pass' : 'waiting'}><span>PHASE FIT</span><b>{sampleCaptured ? `${observedMeasured}%` : '—'}</b><small>{sampleCaptured ? `fit mismatch ${spec.id === 'Z-17' ? '7.2' : spec.id === 'D-08' ? '8.1' : '7.6'}% Rwp · lower is better` : 'awaiting pattern'}</small></div>
        <div className={sampleCaptured ? evaluation.met ? 'pass' : 'miss' : 'waiting'}><span>MISSION</span><b>{sampleCaptured ? evaluation.gap : missionId === 'low-energy' ? 'ENERGY' : missionId === 'throughput' ? 'RATE' : '≥ 96%'}</b><small>{sampleCaptured ? evaluation.met ? 'mission met' : evaluation.constraintText : 'campaign gate'}</small></div>
      </aside>
    </div>
  </section>;
}

function StationBacklogStrip({ backlog, station, lanes }: { backlog: CampaignBacklogItem[]; station: 'furnace' | 'xrd'; lanes: number }) {
  const load = station === 'furnace' ? backlog.reduce((total, item) => total + getCampaignSpec(item.candidate).thermalMinutes, 0) : backlog.length * 18;
  const limit = station === 'furnace' ? lanes * 360 : 54;
  const pressure = load > limit;
  return <div className={`station-backlog-strip ${station}${pressure ? ' pressure' : ''}`}><span>NEXT</span>{[0, 1, 2].map((slot) => {
    const item = backlog[slot];
    if (!item) return <div className="empty" key={slot}><b>OPEN</b><small>unreleased</small></div>;
    const itemSpec = getCampaignSpec(item.candidate);
    return <div key={`${item.runNumber}-${item.candidate}`}><b>RUN-{String(item.runNumber).padStart(3, '0')} · {item.candidate}</b><small>{station === 'furnace' ? `${itemSpec.thermalMinutes} min · ${itemSpec.temperatureShort}` : '18 min · powder scan'}</small></div>;
  })}<em>{load} MIN · {pressure ? 'LOAD PRESSURE' : 'CAPACITY VISIBLE'}</em></div>;
}

function SemCampaignPanel({ stage, selected, runNumber, operations }: { stage: number; selected: string; runNumber: number; operations: string[] }) {
  const spec = getCampaignSpec(selected);
  const identity = getCampaignIdentity(runNumber);
  const vacuumReady = stage >= 9 || operations.includes('Establish chamber vacuum');
  const fieldsReady = stage >= 9 || operations.includes('Acquire four preplanned BSE fields');
  const edsReady = stage >= 9 || operations.includes('Acquire EDS map across the field grid');
  const finding = spec.id === 'D-08' ? 'Ti-rich cores' : 'Ca-rich secondary grains';
  const fields = [[31, 37], [183, 37], [31, 104], [183, 104]];
  const microstructures = [
    { phases: ['M1 2L31 1l14 13-9 18-31 2-4-12Z', 'M45 1h35l9 17-17 15-30-6Z', 'M88 1h49l2 25-28 8-23-16Z', 'M4 36l34-3 18 22H1Z', 'M58 34l28-12 23 14-8 19H58Z', 'M108 36l31-8v27h-38Z'], boundary: 'M0 34l38-2 7-18M42 27l16 7 28-12m0 0 23 14 31-9M58 34v22m43-1 8-19', pores: [[22,20,2],[75,44,1.7],[123,17,1.4]] },
    { phases: ['M1 1h24l16 18-10 17-30-5Z', 'M27 1h43l8 15-18 16-20-13Z', 'M72 1h37l13 20-18 15-27-20Z', 'M110 1h29v29l-17-9Z', 'M1 33l30 3 16 19H1Z', 'M31 36l29-4 20 23H47Z', 'M60 32l44 4 13 19H80Z', 'M104 36l35-6v25h-22Z'], boundary: 'M0 31l31 5 9-17M40 19l20 13 17-16m0 0 27 20 18-15m-91 15 16 19m13-23 20 23m24-19 13 19', pores: [[16,14,1.5],[56,46,2.1],[97,25,1.3],[128,44,1.8]] },
    { phases: ['M1 1h38l8 14-18 16-28-9Z', 'M41 1h27l18 20-16 16-23-22Z', 'M70 1h39l8 17-31 3Z', 'M111 1h28v28l-22-11Z', 'M1 24l28 7 5 24H1Z', 'M29 31l18-16 23 22-7 18H34Z', 'M70 37l16-16 31-3 3 37H63Z', 'M117 18l22 11v26h-19Z'], boundary: 'M0 22l29 9 18-16M39 0l8 15 23 22m-41-6 5 24m36-18 16-16 31-3m3 37-3-37 22 11', pores: [[12,41,1.8],[52,27,1.4],[91,44,2],[129,11,1.2]] },
    { phases: ['M1 1h29l12 16-15 15-26-8Z', 'M32 1h42l7 18-19 13-20-15Z', 'M76 1h34l14 15-19 20-24-17Z', 'M112 1h27v30l-15-15Z', 'M1 26l26 6 18 23H1Z', 'M27 32l15-15 20 15-4 23H45Z', 'M62 32l19-13 24 17-7 19H58Z', 'M105 36l19-20 15 15v24H98Z'], boundary: 'M0 24l27 8 15-15M30 0l12 17 20 15 19-13m-54 13 18 23m17-23-4 23m47-19-7 19m7-19 19-20 15 15', pores: [[18,12,1.4],[49,44,1.9],[88,28,1.3],[116,46,2.2]] },
  ];
  const status = edsReady ? 'DIAGNOSIS READY' : fieldsReady ? 'EDS MAP REQUIRED' : vacuumReady ? 'ACQUISITION READY' : 'VACUUM REQUIRED';
  return <section className={`campaign-sem-console${edsReady ? ' operation-complete' : ''}`}>
    <header><div><span>CORRELATED BSE / EDS FOLLOW-UP</span><b>SEM-01 · MAT-{identity.suffix} · {identity.thermalSample}</b></div><em>{status}</em></header>
    <div className="campaign-sem-layout">
      <svg viewBox="0 0 520 180" role="img" aria-label={`${identity.runId} four-field SEM EDS diagnostic acquisition`}>
        <defs><pattern id="semNoise" width="17" height="17" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r=".7" fill="#8d9ba0" opacity=".18" /><circle cx="12" cy="10" r=".5" fill="#c4ccce" opacity=".12" /></pattern></defs>
        <rect width="520" height="180" className="sem-background" /><text x="18" y="19">BSE MOSAIC · 4 PREPLANNED LOCATIONS</text>
        {fields.map(([x, y], fieldIndex) => { const micro = microstructures[fieldIndex]; return <g key={`${x}-${y}`} className={`sem-field${fieldsReady ? ' acquired' : ''}`} transform={`translate(${x} ${y})`}><rect width="140" height="56" rx="2" /><rect width="140" height="56" rx="2" fill="url(#semNoise)" />{fieldsReady && <g className="sem-microstructure">{micro.phases.map((path, phaseIndex) => <path key={path} d={path} className={`sem-phase-${phaseIndex % 3}`} />)}<path d={micro.boundary} className="sem-grain-boundary" />{micro.pores.map(([cx, cy, radius]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={radius} className="sem-pore" />)}<circle cx={105 - fieldIndex * 7} cy={23 + fieldIndex * 4} r={fieldIndex === 2 ? 7 : 4} className="sem-inclusion" /><circle cx={108 - fieldIndex * 7} cy={21 + fieldIndex * 4} r={fieldIndex === 2 ? 2.4 : 1.5} className="sem-inclusion-core" /></g>}<text x="5" y="10">F0{fieldIndex + 1}</text></g>; })}
        <g className={`sem-eds-map${edsReady ? ' ready' : ''}`}><text x="335" y="19">CORRELATED EDS MAP + SPECTRUM</text><rect x="335" y="27" width="163" height="65" rx="2" />{edsReady ? <><g className="eds-map-dots eds-o">{[[347,38],[366,45],[385,34],[403,57],[421,42],[446,68],[470,38],[486,73],[358,78],[397,80]].map(([cx,cy]) => <circle key={`o-${cx}-${cy}`} cx={cx} cy={cy} r="2.2" />)}</g><g className="eds-map-dots eds-ca">{[[351,62],[374,70],[393,48],[419,75],[440,36],[479,53]].map(([cx,cy]) => <circle key={`ca-${cx}-${cy}`} cx={cx} cy={cy} r="3" />)}</g><g className="eds-map-dots eds-ti">{[[447,51],[452,55],[457,50],[449,59],[461,57],[455,63]].map(([cx,cy]) => <circle key={`ti-${cx}-${cy}`} cx={cx} cy={cy} r={spec.id === 'D-08' ? 4 : 2.3} />)}</g><text x="340" y="88">MAP COMPLETE · {finding.toUpperCase()}</text></> : <text x="379" y="63" className="sem-map-awaiting">MAP QUEUED</text>}</g>
        <g className="sem-spectrum"><text x="335" y="108">EDS SPECTRUM</text><line x1="335" x2="498" y1="148" y2="148" />{[['O', 356, 25], ['Ca', 397, 34], ['Ti', 439, spec.id === 'D-08' ? 42 : 31], ['Zr', 474, spec.id === 'D-08' ? 8 : 18]].map(([label, x, height]) => <g key={String(label)} className={edsReady ? 'peak ready' : 'peak'}><line x1={Number(x)} x2={Number(x)} y1="148" y2={148 - Number(height)} /><text x={Number(x) - 5} y="162">{label}</text></g>)}</g>
        {!fieldsReady && <text x="112" y="98" className="sem-awaiting">ACQUISITION HELD · COVERAGE 0 / 4</text>}
        <text x="17" y="174">20 µm</text><line x1="50" x2="95" y1="171" y2="171" className="scale-bar" />
      </svg>
      <aside>
        <div className={vacuumReady ? 'pass' : 'hold'}><span>CHAMBER VACUUM</span><b>{vacuumReady ? '2.1e−5 Pa' : 'VENTED'}</b><small>{vacuumReady ? 'working distance linked' : 'pump required'}</small></div>
        <div className={fieldsReady ? 'pass' : vacuumReady ? 'review' : 'waiting'}><span>FIELD COVERAGE</span><b>{fieldsReady ? '4 / 4' : '0 / 4'}</b><small>{fieldsReady ? 'preplanned grid complete' : 'single-field claim blocked'}</small></div>
        <div className={edsReady ? 'pass' : 'waiting'}><span>INTERPRETATION</span><b>{edsReady ? finding : '—'}</b><small>{edsReady ? 'hypothesis · not proof' : 'EDS map required'}</small></div>
      </aside>
    </div>
  </section>;
}

function BetHmiPanel({ station, operations }: { station: Station; operations: string[] }) {
  const portsIsolated = operations.includes('Isolate analysis ports');
  const leakPassed = operations.includes('Run manifold leak check');
  const nitrogenProven = operations.includes('Prove N₂ supply state');
  const dewarPositioned = operations.includes('Position 77 K Dewar');
  const reviewState = station.state === 'REVIEW';
  const running = station.state === 'ANALYZING';
  const status = dewarPositioned ? 'MEASUREMENT START STATE PROVEN' : nitrogenProven ? '77 K BATH REQUIRED' : leakPassed ? 'N₂ PROOF REQUIRED' : portsIsolated ? 'LEAK CHECK READY' : 'PORT ISOLATION REQUIRED';
  const pressurePath = leakPassed
    ? 'M268 62 C294 86 316 104 340 116 S391 127 418 130 S458 132 491 132'
    : 'M268 62 H491';
  const isothermPath = reviewState || running
    ? 'M268 151 C289 149 306 145 322 139 S350 123 365 105 S391 80 413 70 S455 62 491 60'
    : 'M268 151 H491';
  return <section className={`native-characterizer-console bet-console${dewarPositioned ? ' operation-complete' : ''}`}>
    <header><div><span>GAS SORPTION MANIFOLD</span><b>BET-02 · PORTS 1–4 · MX-233</b></div><em>{status}</em></header>
    <div className="native-characterizer-layout">
      <svg viewBox="0 0 520 180" role="img" aria-label="BET-02 four-port vacuum manifold and adsorption isotherm control">
        <defs><pattern id="betGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" className="grid" /></pattern><linearGradient id="betTube" x1="0" x2="1"><stop stopColor="#192a35" /><stop offset=".5" stopColor="#597482" /><stop offset="1" stopColor="#16242d" /></linearGradient></defs>
        <rect width="520" height="180" fill="url(#betGrid)" />
        <text x="18" y="20">VACUUM MANIFOLD · ANALYSIS PORTS</text><path d="M30 53 H205 M205 53 V126 H230" className={portsIsolated ? 'manifold-line active' : 'manifold-line'} />
        {[48, 88, 128, 168].map((x, index) => <g key={x} className={`bet-port${portsIsolated ? ' isolated' : ''}`}><rect x={x - 10} y="32" width="20" height="18" rx="2" /><circle cx={x} cy="54" r="6" /><path d={`M${x - 8} 61 H${x + 8} L${x + 12} 124 Q${x} 139 ${x - 12} 124 Z`} /><text x={x - 5} y="152">P{index + 1}</text></g>)}
        <g className={leakPassed ? 'vacuum-pump active' : 'vacuum-pump'}><rect x="202" y="111" width="43" height="37" rx="4" /><circle cx="223" cy="129" r="11" /><path d="M212 129 C218 116 228 116 234 129 C228 142 218 142 212 129" /><text x="203" y="161">TURBO</text></g>
        <path d="M221 102 C232 91 239 79 244 64" className={leakPassed ? 'pump-flow active' : 'pump-flow'} />
        <text x="268" y="20">VACUUM / ADSORPTION RESPONSE</text>
        {[48, 83, 118, 153].map((y) => <line key={y} x1="268" x2="491" y1={y} y2={y} className="plot-grid" />)}
        {[268, 324, 380, 436, 491].map((x) => <line key={x} x1={x} x2={x} y1="32" y2="153" className="plot-grid" />)}
        <path d={pressurePath} className={leakPassed ? 'vacuum-trace active' : 'vacuum-trace'} /><path d={isothermPath} className={reviewState || running ? 'isotherm-trace active' : 'isotherm-trace'} />
        <text x="273" y="43">PRESSURE</text><text x="273" y="146">N₂ UPTAKE</text><text x="446" y="171">P / P₀</text>
        {leakPassed && <g className="bet-verdict"><rect x="369" y="34" width="120" height="24" rx="2" /><text x="377" y="44">LEAK RATE</text><text x="377" y="54">0.6 µbar/min · PASS</text></g>}
      </svg>
      <aside>
        <div className={portsIsolated ? 'pass' : 'hold'}><span>PORT VALVES</span><b>{portsIsolated ? '4 / 4 ISOLATED' : 'LOCKED'}</b><small>{portsIsolated ? 'cross-port path blocked' : 'prove service boundary'}</small></div>
        <div className={leakPassed ? 'pass' : portsIsolated ? 'review' : 'waiting'}><span>BASE PRESSURE</span><b>{leakPassed ? '3.2e−4 mbar' : '—'}</b><small>{leakPassed ? 'leak criterion met' : 'evacuation held'}</small></div>
        <div className={nitrogenProven ? 'pass' : 'waiting'}><span>ADSORBATE N₂</span><b>{nitrogenProven ? '4.8 bar' : 'UNPROVEN'}</b><small>{reviewState ? 'MS-ALU-21 control under review' : nitrogenProven ? 'identity + supply linked' : 'supply proof required'}</small></div>
        <div className={dewarPositioned ? 'pass' : nitrogenProven ? 'review' : 'waiting'}><span>CRYOGENIC BATH</span><b>{dewarPositioned ? '77 K · LIFTED' : 'PARKED'}</b><small>{dewarPositioned ? 'cell bulbs immersed' : nitrogenProven ? 'position Dewar under cells' : 'gas proof required first'}</small></div>
      </aside>
    </div>
  </section>;
}

function TgaHmiPanel({ station, operations }: { station: Station; operations: string[] }) {
  const startTemperatureProven = operations.includes('Confirm furnace at start temperature');
  const balanceTared = operations.includes('Tare balance channel');
  const purgeProven = operations.includes('Prove purge path');
  const carouselHomed = operations.includes('Home autosampler carousel');
  const running = station.state === 'ANALYZING';
  const review = station.state === 'REVIEW' || station.state === 'RECHECK QUEUED';
  const hasResult = running || review;
  const status = carouselHomed ? 'READY' : purgeProven ? 'HOME CAROUSEL' : balanceTared ? 'CHECK PURGE' : startTemperatureProven ? 'TARE BALANCE' : 'CHECK START TEMPERATURE';
  const massPath = review
    ? 'M60 35 C120 35 180 35 219 36 C226 36 230 55 243 60 C320 61 406 62 500 63'
    : running ? 'M60 35 C150 35 205 36 232 42 C275 55 365 59 500 61' : 'M60 35 H500';
  const heatPath = review
    ? 'M60 162 C150 162 205 163 229 160 C237 142 245 132 253 159 C290 163 390 162 500 162'
    : running ? 'M60 162 C175 162 221 160 245 148 C267 154 345 162 500 162' : 'M60 162 H500';
  return <section className={`native-characterizer-console tga-console${carouselHomed ? ' operation-complete' : ''}`}>
    <header><div><span>TGA / DSC</span><b>Mass and heat flow versus temperature</b></div><em>{status}</em></header>
    <div className="native-characterizer-layout">
      <svg className="tga-data-plot" viewBox="0 0 540 230" role="img" aria-label="TGA mass percent and DSC heat flow in milliwatts plotted separately against temperature in degrees Celsius">
        <rect x="60" y="24" width="440" height="70" className="plot-field" />
        <rect x="60" y="128" width="440" height="70" className="plot-field" />
        {[60, 161, 263, 364, 500].map((x) => <g key={x}><line x1={x} x2={x} y1="24" y2="198" className="plot-grid" /></g>)}
        {[35, 64, 93, 137, 162, 197].map((y) => <line key={y} x1="60" x2="500" y1={y} y2={y} className="plot-grid" />)}
        <text x="60" y="16" className="plot-title">MASS (%)</text><text x="17" y="38">100</text><text x="27" y="67">95</text><text x="27" y="96">90</text>
        <text x="60" y="120" className="plot-title">HEAT FLOW (mW) · EXO ↑</text><text x="29" y="140">+2</text><text x="39" y="165">0</text><text x="29" y="200">−2</text>
        {hasResult && <path d={massPath} className="tga-mass-trace active" />}
        {hasResult && <path d={heatPath} className="tga-heat-trace active" />}
        {review && <g className="tga-event"><line x1="235" x2="235" y1="24" y2="198" /><text x="240" y="82">GAS FLOW CHANGE · 412.5 °C</text><circle cx="247" cy="142" r="3" /><text x="254" y="139">HEAT-FLOW EVENT · 438 °C</text></g>}
        {!hasResult && <text x="280" y="111" textAnchor="middle" className="no-result">NO RESULT · COMPLETE SETUP AND RUN EMPTY-PAN CHECK</text>}
        {[[60, '25'], [161, '250'], [263, '500'], [364, '750'], [500, '1000']].map(([x, label]) => <text key={label} x={Number(x)} y="214" textAnchor="middle">{label}</text>)}
        <text x="280" y="227" textAnchor="middle" className="plot-title">TEMPERATURE (°C)</text>
      </svg>
      <aside>
        <div className={startTemperatureProven ? 'pass' : 'hold'}><span>START</span><b>{startTemperatureProven ? '28 °C' : 'CHECK'}</b><small>Furnace temperature</small></div>
        <div className={balanceTared ? 'pass' : 'waiting'}><span>BALANCE</span><b>{balanceTared ? '0.00 mg' : 'TARE'}</b><small>Zero before run</small></div>
        <div className={purgeProven ? 'pass' : 'waiting'}><span>PURGE</span><b>{purgeProven ? 'N₂ · 60 mL/min' : 'CHECK'}</b><small>Gas identity and flow</small></div>
        <div className={carouselHomed ? 'pass' : 'waiting'}><span>PANS</span><b>{carouselHomed ? 'A / B READY' : 'HOME'}</b><small>{review ? 'Result held for overlap' : 'Matched empty pans'}</small></div>
      </aside>
    </div>
  </section>;
}


function ConsoleAction({ complete, disabled = false, idle, done, note, onClick }: { complete: boolean; disabled?: boolean; idle: string; done: string; note: string; onClick: () => void }) {
  return <footer className="console-action"><p><i className={complete ? 'online' : ''} />{note}</p><button type="button" disabled={disabled} className={complete ? 'complete' : ''} onClick={onClick}>{complete ? '✓ ' : ''}{complete ? done : idle}</button></footer>;
}
