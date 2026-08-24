'use client';

import { useSyncExternalStore } from 'react';
import { getCampaignIdentity, getCampaignOperations, getCampaignSpec } from './campaign-spec';
import type { Station } from './sim-data';

export type CampaignSnapshot = {
  stage: number;
  selected: string;
  runNumber: number;
  thermalBayLevel: number;
  inventory: { crucibles: number; liners: number; carbonTabs: number };
};

const fallbackCampaign: CampaignSnapshot = { stage: 0, selected: 'C-42', runNumber: 42, thermalBayLevel: 1, inventory: { crucibles: 7, liners: 2, carbonTabs: 1 } };
const fallbackSerialized = JSON.stringify(fallbackCampaign);

function readCampaign(): CampaignSnapshot {
  if (typeof window === 'undefined') return fallbackCampaign;
  try {
    const stored = JSON.parse(window.localStorage.getItem('mattershift-campaign-v2') ?? '{}');
    return {
      stage: Number(stored.stage ?? fallbackCampaign.stage),
      selected: String(stored.selected ?? fallbackCampaign.selected),
      runNumber: Number(stored.runNumber ?? fallbackCampaign.runNumber),
      thermalBayLevel: Number(stored.thermalBayLevel ?? fallbackCampaign.thermalBayLevel),
      inventory: {
        crucibles: Number(stored.inventory?.crucibles ?? fallbackCampaign.inventory.crucibles),
        liners: Number(stored.inventory?.liners ?? fallbackCampaign.inventory.liners),
        carbonTabs: Number(stored.inventory?.carbonTabs ?? fallbackCampaign.inventory.carbonTabs),
      },
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

export function getCampaignStationView(station: Station, stage: number, selected: string, runNumber: number, thermalBayLevel = 1): Station {
  const spec = getCampaignSpec(selected);
  const identity = getCampaignIdentity(runNumber);
  const operations = getCampaignOperations(runNumber, thermalBayLevel);
  if (stage === 1) return { ...station, state: 'CAMPAIGN PREP', tone: 'run', meta: `${spec.id} formulation · ${identity.runId}`, technicianView: [`Formula: ${spec.formula}`, `Run: ${identity.runId}`, `Target mass: ${spec.targetMass}`, `Carrier: ${identity.carrier}`] };
  if (stage === 2 && operations.robotCondition === 'contamination') return { ...station, state: 'CLEANLINESS HOLD', tone: 'warn', meta: 'Gripper witness required', technicianView: [`Run: ${identity.runId}`, 'Cell boundary: proven', 'Gripper: cleanliness fault', 'Witness coupon: due'] };
  if (stage === 2 && operations.robotCondition === 'grip-force') return { ...station, state: 'TOOLING CHECK', tone: 'warn', meta: 'Jaw-force witness required', technicianView: [`Run: ${identity.runId}`, 'Cell boundary: proven', 'Jaw pads: inspect seating', 'Force witness: due'] };
  if (stage === 2) return { ...station, state: 'CELL READINESS', tone: 'run', meta: 'Tool identity + handshake', technicianView: [`Run: ${identity.runId}`, 'Cell boundary: proven', 'Gripper: nominal', 'Carrier handshake: prove'] };
  if (stage === 3) return { ...station, state: 'DOSING', tone: 'run', meta: `${identity.carrier} · crucible dosing`, technicianView: [`Run: ${identity.runId}`, `Carrier: ${identity.carrier}`, 'Dose positions: 6', `${operations.robotCondition === 'nominal' ? 'Cell setup' : 'Gripper witness'}: passed`] };
  if (stage === 4) return { ...station, name: thermalBayLevel >= 2 ? 'Dual-chamber furnace' : station.name, state: thermalBayLevel >= 2 ? 'LANE B READINESS' : 'QUEUE HOLD', tone: 'warn', meta: `${operations.furnaceLane} · ${operations.queueMinutes} min`, technicianView: [`Run: ${identity.runId}`, `Assigned lane: ${operations.furnaceLane}`, `Chamber A: ${operations.activeFurnaceRun}`, `${thermalBayLevel >= 2 ? 'Readiness gate' : 'Estimated wait'}: ${operations.queueMinutes} min`] };
  if (stage === 5) return { ...station, name: thermalBayLevel >= 2 ? 'Dual-chamber furnace' : station.name, state: 'HEATING', tone: 'run', meta: `${operations.furnaceLane} · ${spec.temperature}`, technicianView: [`Run: ${identity.runId}`, `Profile: ${spec.profile}`, `Lane: ${operations.furnaceLane}`, `Carrier: ${identity.carrier}`] };
  if (stage === 6 && operations.referenceCondition === 'age-due') return { ...station, state: 'QC HOLD', tone: 'warn', meta: `Si reference · ${operations.referenceAgeHours} h`, technicianView: [`Run: ${identity.runId}`, 'Reference: NIST Si', `Last qualified: ${operations.referenceAgeHours} h ago`, 'Specimen release: held'] };
  if (stage === 6 && operations.referenceCondition === 'trend-review') return { ...station, state: 'TREND REVIEW', tone: 'run', meta: `Si control trend · ${operations.referenceAgeHours} h`, technicianView: [`Run: ${identity.runId}`, 'Reference: NIST Si', `Last qualified: ${operations.referenceAgeHours} h ago`, 'Trend: confirm before sample'] };
  if (stage === 6) return { ...station, state: 'ACQUISITION READY', tone: 'run', meta: `Si control current · ${operations.referenceAgeHours} h`, technicianView: [`Run: ${identity.runId}`, 'Reference: NIST Si', `Last qualified: ${operations.referenceAgeHours} h ago`, 'Specimen: ready to acquire'] };
  if (stage === 8) return { ...station, state: 'DIAGNOSTIC RUN', tone: 'run', meta: `${identity.runId} · four-field BSE / EDS`, technicianView: [`Run: ${identity.runId}`, `Specimen: ${identity.thermalSample}`, 'Coverage: 0 / 4 fields', 'EDS map: queued'] };
  if (stage >= 9) return { ...station, state: 'DIAGNOSIS READY', tone: 'ready', meta: `${identity.runId} · representative follow-up`, technicianView: [`Run: ${identity.runId}`, 'Coverage: 4 / 4 fields', `Finding: ${spec.id === 'D-08' ? 'Ti-rich cores' : 'Ca-rich secondary grains'}`, 'Interpretation: model-linked'] };
  return { ...station, state: 'RESULT REVIEW', tone: 'ready', meta: `${spec.measured}% · ${spec.objectiveMet ? 'target met' : 'valid target miss'}`, technicianView: [`Reference: ${operations.referenceResult}`, `Run: ${identity.runId}`, `Target phase: ${spec.measured}%`, `Objective gap: ${spec.gap}`] };
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
  return getCampaignStationId(campaign.stage) === station.id
    ? getCampaignStationView(station, campaign.stage, campaign.selected, campaign.runNumber, campaign.thermalBayLevel)
    : station;
}
