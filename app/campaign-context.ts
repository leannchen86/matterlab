'use client';

import { useSyncExternalStore } from 'react';
import { evaluateCampaignMission, getCampaignIdentity, getCampaignOperations, getCampaignSpec } from './campaign-spec';
import type { CampaignMissionId } from './campaign-spec';
import type { Station } from './sim-data';

export type CampaignSnapshot = {
  stage: number;
  selected: string;
  runNumber: number;
  elapsed: number;
  resultElapsed: number;
  resultMeasured: string;
  confirmationSource: { runNumber: number; measured: string } | null;
  missionId: CampaignMissionId;
  thermalBayLevel: number;
  inventory: { crucibles: number; liners: number; carbonTabs: number };
  backlog: Array<{ runNumber: number; candidate: string; missionId: CampaignMissionId }>;
};

const fallbackCampaign: CampaignSnapshot = { stage: 0, selected: 'C-42', runNumber: 42, elapsed: 0, resultElapsed: 0, resultMeasured: '', confirmationSource: null, missionId: 'purity', thermalBayLevel: 1, inventory: { crucibles: 7, liners: 2, carbonTabs: 1 }, backlog: [] };
const fallbackSerialized = JSON.stringify(fallbackCampaign);

function readCampaign(): CampaignSnapshot {
  if (typeof window === 'undefined') return fallbackCampaign;
  try {
    const stored = JSON.parse(window.localStorage.getItem('mattershift-campaign-v2') ?? '{}');
    const runNumber = Number(stored.runNumber ?? fallbackCampaign.runNumber);
    const history = Array.isArray(stored.history) ? stored.history : [];
    const selected = String(stored.selected ?? fallbackCampaign.selected);
    const retainedResult = history.find((item: { runNumber?: number }) => Number(item?.runNumber) === runNumber);
    const confirmationSource = [...history].reverse().find((item: { runNumber?: number; candidate?: string }) => Number(item?.runNumber) < runNumber && String(item?.candidate) === selected);
    return {
      stage: Number(stored.stage ?? fallbackCampaign.stage),
      selected,
      runNumber,
      elapsed: Number(stored.elapsed ?? fallbackCampaign.elapsed),
      resultElapsed: Number(retainedResult?.elapsed ?? 0),
      resultMeasured: String(retainedResult?.measured ?? ''),
      confirmationSource: confirmationSource ? { runNumber: Number(confirmationSource.runNumber), measured: String(confirmationSource.measured ?? '') } : null,
      missionId: stored.missionId === 'low-energy' || stored.missionId === 'throughput' ? stored.missionId : 'purity',
      thermalBayLevel: Number(stored.thermalBayLevel ?? fallbackCampaign.thermalBayLevel),
      inventory: {
        crucibles: Number(stored.inventory?.crucibles ?? fallbackCampaign.inventory.crucibles),
        liners: Number(stored.inventory?.liners ?? fallbackCampaign.inventory.liners),
        carbonTabs: Number(stored.inventory?.carbonTabs ?? fallbackCampaign.inventory.carbonTabs),
      },
      backlog: Array.isArray(stored.backlog) ? stored.backlog.slice(0, 3).map((item: { runNumber?: number; candidate?: string; missionId?: string }, index: number) => ({
        runNumber: Number(item.runNumber ?? Number(stored.runNumber ?? fallbackCampaign.runNumber) + index + 1),
        candidate: String(item.candidate ?? 'C-42'),
        missionId: item.missionId === 'low-energy' || item.missionId === 'throughput' ? item.missionId : 'purity',
      })) : [],
    };
  } catch {
    return fallbackCampaign;
  }
}

export function getCampaignStationId(stage: number) {
  if (stage === 1) return 'PREP-01';
  if (stage >= 2 && stage <= 3) return 'ROBO-02';
  if (stage >= 4 && stage <= 5) return 'FURN-04';
  if (stage >= 6 && stage <= 7) return 'XRD-03';
  if (stage >= 8) return 'SEM-01';
  return '';
}

export function getCampaignStationView(station: Station, stage: number, selected: string, runNumber: number, thermalBayLevel = 1, missionId: CampaignMissionId = 'purity', resultElapsed = 0, resultMeasured = ''): Station {
  const spec = getCampaignSpec(selected);
  const observedSpec = resultMeasured ? { ...spec, measured: resultMeasured } : spec;
  const identity = getCampaignIdentity(runNumber);
  const operations = getCampaignOperations(runNumber, thermalBayLevel);
  const evaluation = evaluateCampaignMission(observedSpec, missionId, stage >= 7 && resultElapsed > 0 ? resultElapsed : undefined);
  if (stage === 1) return { ...station, state: 'CAMPAIGN PREP', tone: 'run', meta: `${spec.id} formulation · ${identity.runId}`, technicianView: [`Formula: ${spec.formula}`, `Run: ${identity.runId}`, `Target mass: ${spec.targetMass}`, `Carrier: ${identity.carrier}`] };
  if (stage === 2 && operations.robotCondition === 'contamination') return { ...station, state: 'CLEANLINESS HOLD', tone: 'warn', meta: 'Gripper witness required', technicianView: [`Run: ${identity.runId}`, 'Cell boundary: proven', 'Gripper: cleanliness fault', 'Witness coupon: due'] };
  if (stage === 2 && operations.robotCondition === 'grip-force') return { ...station, state: 'TOOLING CHECK', tone: 'warn', meta: 'Jaw-force witness required', technicianView: [`Run: ${identity.runId}`, 'Cell boundary: proven', 'Jaw pads: inspect seating', 'Force witness: due'] };
  if (stage === 2) return { ...station, state: 'CELL READINESS', tone: 'run', meta: 'Tool identity + handshake', technicianView: [`Run: ${identity.runId}`, 'Cell boundary: proven', 'Gripper: nominal', 'Carrier handshake: prove'] };
  if (stage === 3) return { ...station, state: 'DOSING', tone: 'run', meta: `${identity.carrier} · crucible dosing`, technicianView: [`Run: ${identity.runId}`, `Carrier: ${identity.carrier}`, 'Dose positions: 6', `${operations.robotCondition === 'nominal' ? 'Cell setup' : 'Gripper witness'}: passed`] };
  if (stage === 4) return { ...station, name: thermalBayLevel >= 2 ? 'Dual-chamber furnace' : station.name, state: thermalBayLevel >= 2 ? 'LANE B READINESS' : 'QUEUE HOLD', tone: 'warn', meta: `${operations.furnaceLane} · ${operations.queueMinutes} min`, technicianView: [`Run: ${identity.runId}`, `Assigned lane: ${operations.furnaceLane}`, `Chamber A: ${operations.activeFurnaceRun}`, `${thermalBayLevel >= 2 ? 'Readiness gate' : 'Estimated wait'}: ${operations.queueMinutes} min`] };
  if (stage === 5 && operations.furnaceCondition === 'thermocouple-drift') return { ...station, name: thermalBayLevel >= 2 ? 'Dual-chamber furnace' : station.name, state: 'TC OFFSET HOLD', tone: 'warn', meta: operations.furnaceResult, technicianView: [`Run: ${identity.runId}`, `Witness: ${operations.furnaceResult}`, 'Controller offset: verify', `Profile: ${spec.profile}`] };
  if (stage === 5 && operations.furnaceCondition === 'door-seal') return { ...station, name: thermalBayLevel >= 2 ? 'Dual-chamber furnace' : station.name, state: 'DOOR SEAL HOLD', tone: 'warn', meta: operations.furnaceResult, technicianView: [`Run: ${identity.runId}`, `Survey: ${operations.furnaceResult}`, 'Latch compression: verify', `Profile: ${spec.profile}`] };
  if (stage === 5) return { ...station, name: thermalBayLevel >= 2 ? 'Dual-chamber furnace' : station.name, state: 'START READINESS', tone: 'run', meta: `${operations.furnaceLane} · ${spec.temperature}`, technicianView: [`Run: ${identity.runId}`, `Profile: ${spec.profile}`, `Witness: ${operations.furnaceResult}`, `Carrier: ${identity.carrier}`] };
  if (stage === 6 && operations.referenceCondition === 'age-due') return { ...station, state: 'QC HOLD', tone: 'warn', meta: `Si reference · ${operations.referenceAgeHours} h`, technicianView: [`Run: ${identity.runId}`, 'Reference: NIST Si', `Last qualified: ${operations.referenceAgeHours} h ago`, 'Specimen release: held'] };
  if (stage === 6 && operations.referenceCondition === 'trend-review') return { ...station, state: 'TREND REVIEW', tone: 'run', meta: `Si control trend · ${operations.referenceAgeHours} h`, technicianView: [`Run: ${identity.runId}`, 'Reference: NIST Si', `Last qualified: ${operations.referenceAgeHours} h ago`, 'Trend: confirm before sample'] };
  if (stage === 6) return { ...station, state: 'ACQUISITION READY', tone: 'run', meta: `Si control current · ${operations.referenceAgeHours} h`, technicianView: [`Run: ${identity.runId}`, 'Reference: NIST Si', `Last qualified: ${operations.referenceAgeHours} h ago`, 'Specimen: ready to acquire'] };
  if (stage === 8) return { ...station, state: 'DIAGNOSTIC RUN', tone: 'run', meta: `${identity.runId} · four-field BSE / EDS`, technicianView: [`Run: ${identity.runId}`, `Specimen: ${identity.thermalSample}`, 'Coverage: 0 / 4 fields', 'EDS map: queued'] };
  if (stage >= 9) return { ...station, state: 'DIAGNOSIS READY', tone: 'ready', meta: `${identity.runId} · representative follow-up`, technicianView: [`Run: ${identity.runId}`, 'Coverage: 4 / 4 fields', `Finding: ${spec.id === 'D-08' ? 'Ti-rich cores' : 'Ca-rich secondary grains'}`, 'Interpretation: model-linked'] };
  return { ...station, state: 'RESULT REVIEW', tone: 'ready', meta: `${evaluation.resultText} · mission ${evaluation.met ? 'met' : 'missed'}`, technicianView: [`Reference: ${operations.referenceResult}`, `Run: ${identity.runId}`, `Result: ${evaluation.resultText}`, `Mission gap: ${evaluation.gap}`] };
}

export function useCampaignSnapshot() {
  const serialized = useSyncExternalStore((onStoreChange) => {
    window.addEventListener('mattershift:campaign-state', onStoreChange);
    window.addEventListener('storage', onStoreChange);
    return () => {
      window.removeEventListener('mattershift:campaign-state', onStoreChange);
      window.removeEventListener('storage', onStoreChange);
    };
  }, () => JSON.stringify(readCampaign()), () => fallbackSerialized);
  return JSON.parse(serialized) as CampaignSnapshot;
}

export function useCampaignStation(station: Station) {
  const campaign = useCampaignSnapshot();
  if (getCampaignStationId(campaign.stage) !== station.id) return station;
  const view = getCampaignStationView(station, campaign.stage, campaign.selected, campaign.runNumber, campaign.thermalBayLevel, campaign.missionId, campaign.resultElapsed, campaign.resultMeasured);
  if (campaign.stage === 7 && campaign.confirmationSource) {
    const evaluation = evaluateCampaignMission({ ...getCampaignSpec(campaign.selected), measured: campaign.resultMeasured }, campaign.missionId, campaign.resultElapsed);
    return { ...view, state: evaluation.met ? 'REPEAT PASS' : 'NOT ROBUST', tone: evaluation.met ? 'ready' : 'warn', meta: `${campaign.confirmationSource.measured}% → ${campaign.resultMeasured}%`, technicianView: [`Recipe: ${campaign.selected} unchanged`, `Prior: ${campaign.confirmationSource.measured}%`, `Repeat: ${campaign.resultMeasured}%`, `Verdict: ${evaluation.met ? 'boundary repeated' : 'phase margin lost'}`] };
  }
  return view;
}
