'use client';

import { useSyncExternalStore } from 'react';
import { getCampaignIdentity, getCampaignSpec } from './campaign-spec';
import type { Station } from './sim-data';

export type CampaignSnapshot = {
  stage: number;
  selected: string;
  runNumber: number;
};

const fallbackCampaign: CampaignSnapshot = { stage: 0, selected: 'C-42', runNumber: 42 };
const fallbackSerialized = JSON.stringify(fallbackCampaign);

function readCampaign(): CampaignSnapshot {
  if (typeof window === 'undefined') return fallbackCampaign;
  try {
    const stored = JSON.parse(window.localStorage.getItem('mattershift-campaign-v2') ?? '{}');
    return {
      stage: Number(stored.stage ?? fallbackCampaign.stage),
      selected: String(stored.selected ?? fallbackCampaign.selected),
      runNumber: Number(stored.runNumber ?? fallbackCampaign.runNumber),
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

export function getCampaignStationView(station: Station, stage: number, selected: string, runNumber: number): Station {
  const spec = getCampaignSpec(selected);
  const identity = getCampaignIdentity(runNumber);
  if (stage === 1) return { ...station, state: 'CAMPAIGN PREP', tone: 'run', meta: `${spec.id} formulation · ${identity.runId}`, technicianView: [`Formula: ${spec.formula}`, `Run: ${identity.runId}`, `Target mass: ${spec.targetMass}`, `Carrier: ${identity.carrier}`] };
  if (stage === 2) return { ...station, state: 'CLEANLINESS HOLD', tone: 'warn', meta: 'Gripper witness required', technicianView: [`Run: ${identity.runId}`, 'Cell boundary: proven', 'Gripper: cleanliness fault', 'Witness coupon: due'] };
  if (stage === 3) return { ...station, state: 'DOSING', tone: 'run', meta: `${identity.carrier} · crucible dosing`, technicianView: [`Run: ${identity.runId}`, `Carrier: ${identity.carrier}`, 'Dose positions: 6', 'Gripper witness: passed'] };
  if (stage === 4) return { ...station, state: 'QUEUE HOLD', tone: 'warn', meta: 'Q01 · RUN-039 active', technicianView: [`Run: ${identity.runId}`, 'Queue position: 01', 'Active profile: RUN-039', 'Estimated wait: 62 min'] };
  if (stage === 5) return { ...station, state: 'HEATING', tone: 'run', meta: `${spec.temperature} · ${spec.dwell} profile`, technicianView: [`Run: ${identity.runId}`, `Profile: ${spec.profile}`, 'Atmosphere: air', `Carrier: ${identity.carrier}`] };
  if (stage === 6) return { ...station, state: 'QC HOLD', tone: 'warn', meta: 'Si reference overdue', technicianView: [`Run: ${identity.runId}`, 'Reference: NIST Si', 'Control limit: ±0.05° 2θ', 'Specimen release: held'] };
  if (stage === 8) return { ...station, state: 'DIAGNOSTIC RUN', tone: 'run', meta: `${identity.runId} · four-field BSE / EDS`, technicianView: [`Run: ${identity.runId}`, `Specimen: ${identity.thermalSample}`, 'Coverage: 0 / 4 fields', 'EDS map: queued'] };
  if (stage >= 9) return { ...station, state: 'DIAGNOSIS READY', tone: 'ready', meta: `${identity.runId} · representative follow-up`, technicianView: [`Run: ${identity.runId}`, 'Coverage: 4 / 4 fields', `Finding: ${spec.id === 'D-08' ? 'Ti-rich cores' : 'Ca-rich secondary grains'}`, 'Interpretation: model-linked'] };
  return { ...station, state: 'RESULT REVIEW', tone: 'ready', meta: `${spec.measured}% · ${spec.objectiveMet ? 'target met' : 'valid target miss'}`, technicianView: ['Reference: +0.01° 2θ', `Run: ${identity.runId}`, `Target phase: ${spec.measured}%`, `Objective gap: ${spec.gap}`] };
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
    ? getCampaignStationView(station, campaign.stage, campaign.selected, campaign.runNumber)
    : station;
}
