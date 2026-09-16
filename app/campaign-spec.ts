import { campaignComposition, campaignPhaseReportable, campaignSecondaryPhase, campaignTargetShare, type CampaignSecondaryPhase } from './xrd/campaign.ts';

export type CampaignCandidateId = 'C-42' | 'Z-17' | 'D-08' | 'A-29' | 'R-31' | `U-${string}`;
export type CampaignMissionId = 'purity' | 'low-energy' | 'throughput';

export type CampaignMission = {
  id: CampaignMissionId;
  label: string;
  shortLabel: string;
  target: string;
  brief: string;
};

export type CustomComposition = {
  caExcess: number;
  zrDopant: number;
  temperature: number;
  dwell: number;
};

export type CampaignSpec = {
  id: CampaignCandidateId;
  name: string;
  formula: string;
  precursorLabel: string;
  targetMass: string;
  temperature: string;
  temperatureShort: string;
  dwell: string;
  prediction: string;
  uncertainty: string;
  profile: string;
  measured: string;
  gap: string;
  objectiveMet: boolean;
  insightReward: number;
  thermalMinutes: number;
  throughput: string;
  point: [number, number];
  composition?: CustomComposition;
};

export type CampaignOperations = {
  activeFurnaceRun: string;
  furnaceLane: 'FURN-04A' | 'FURN-04B';
  queueMinutes: number;
  furnaceCondition: 'nominal' | 'thermocouple-drift' | 'door-seal';
  furnaceConstraint: boolean;
  furnaceRecoveryMinutes: number;
  furnaceResult: string;
  robotCondition: 'nominal' | 'grip-force' | 'contamination';
  robotConstraint: boolean;
  robotRecoveryMinutes: number;
  referenceCondition: 'current' | 'trend-review' | 'age-due';
  referenceConstraint: boolean;
  referenceAgeHours: number;
  referenceResult: string;
};

export const campaignMissions: CampaignMission[] = [
  { id: 'purity', label: 'Phase purity', shortLabel: 'PURITY', target: '≥ 96.0% target phase', brief: 'Maximize qualified target-phase fraction.' },
  { id: 'low-energy', label: 'Low-energy route', shortLabel: 'ENERGY', target: '≥ 94.5% · ≤ 950 °C', brief: 'Meet a useful phase floor inside a lower-temperature window.' },
  { id: 'throughput', label: 'Fast campaign', shortLabel: 'RATE', target: '≥ 95.5% · ≤ 420 min', brief: 'Balance qualified phase fraction against release-to-result cycle time.' },
];

export function getCampaignMission(id?: string) {
  return campaignMissions.find((mission) => mission.id === id) ?? campaignMissions[0];
}

export function evaluateCampaignMission(spec: CampaignSpec, missionId: CampaignMissionId = 'purity', operationalMinutes?: number) {
  const measured = Number(spec.measured);
  const temperature = spec.composition?.temperature ?? Number(spec.temperature.replace(/[^\d]/g, ''));
  if (missionId === 'low-energy') {
    const phasePass = measured >= 94.5;
    const temperaturePass = temperature <= 950;
    return {
      met: phasePass && temperaturePass,
      gap: !phasePass ? `−${(94.5 - measured).toFixed(1)} pp` : !temperaturePass ? `+${temperature - 950} °C` : 'WINDOW PASS',
      targetText: 'Phase ≥ 94.5% · calcine ≤ 950 °C',
      resultText: `${campaignShareLabel(measured.toFixed(1))} · ${temperature} °C`,
      constraintText: !phasePass ? 'phase floor missed' : !temperaturePass ? 'temperature ceiling exceeded' : 'energy window achieved',
    };
  }
  if (missionId === 'throughput') {
    const phasePass = measured >= 95.5;
    const cycleMinutes = operationalMinutes ?? spec.thermalMinutes + 48;
    const durationPass = cycleMinutes <= 420;
    return {
      met: phasePass && durationPass,
      gap: !phasePass ? `−${(95.5 - measured).toFixed(1)} pp` : !durationPass ? `+${cycleMinutes - 420} min` : 'RATE PASS',
      targetText: 'Phase ≥ 95.5% · release-to-result ≤ 420 min',
      resultText: `${campaignShareLabel(measured.toFixed(1))} · ${cycleMinutes} min cycle`,
      constraintText: !phasePass ? 'phase floor missed' : !durationPass ? 'cycle-time window exceeded' : 'throughput window achieved',
    };
  }
  const gap = measured - 96;
  return {
    met: gap >= 0,
    gap: `${gap >= 0 ? '+' : '−'}${Math.abs(gap).toFixed(1)} pp`,
    targetText: 'Target phase ≥ 96.0%',
    resultText: `${campaignShareLabel(measured.toFixed(1))} target phase`,
    constraintText: gap >= 0 ? 'purity objective achieved' : 'purity objective missed',
  };
}

export type CampaignMissionForecast = {
  tone: 'fit' | 'uncertain' | 'risk';
  status: 'ROBUST FIT' | 'MODEL EDGE' | 'PHASE RISK' | 'TEMP RISK' | 'TIME RISK';
  detail: string;
};

export function forecastCampaignMission(spec: CampaignSpec, missionId: CampaignMissionId = 'purity'): CampaignMissionForecast {
  const prediction = Number.parseFloat(spec.prediction);
  const uncertainty = Number.parseFloat(spec.uncertainty.replace(/[^\d.]/g, ''));
  const conservativePhase = prediction - uncertainty;
  const temperature = spec.composition?.temperature ?? Number(spec.temperature.replace(/[^\d]/g, ''));
  const phaseFloor = missionId === 'low-energy' ? 94.5 : missionId === 'throughput' ? 95.5 : 96;

  if (missionId === 'low-energy' && temperature > 950) {
    return { tone: 'risk', status: 'TEMP RISK', detail: `${temperature - 950} °C above mission ceiling` };
  }
  const nominalCycleMinutes = spec.thermalMinutes + 48;
  if (missionId === 'throughput' && nominalCycleMinutes > 420) {
    return { tone: 'risk', status: 'TIME RISK', detail: `${nominalCycleMinutes - 420} min above nominal cycle ceiling` };
  }
  if (conservativePhase >= phaseFloor) {
    return { tone: 'fit', status: 'ROBUST FIT', detail: `${conservativePhase.toFixed(1)}% lower confidence bound` };
  }
  if (prediction >= phaseFloor) {
    return { tone: 'uncertain', status: 'MODEL EDGE', detail: `${prediction.toFixed(1)} ± ${uncertainty.toFixed(1)}% crosses phase floor` };
  }
  return { tone: 'risk', status: 'PHASE RISK', detail: `${(phaseFloor - prediction).toFixed(1)} pp below predicted floor` };
}

/**
 * Highest target-phase share a campaign result reports, in percent: 100 minus the 0.5 wt% floor below which a leftover phase is
 * not reportable, so a batch with no resolved secondary phase reads as at least 99.5%, never as a proven 100%.
 */
export const CAMPAIGN_SHARE_CEILING = 99.5;

/** A reported share for display: '≥99.5%' at the reporting ceiling, otherwise the share with a percent sign. */
export function campaignShareLabel(measured: string) {
  return Number.parseFloat(measured) >= CAMPAIGN_SHARE_CEILING ? `≥${CAMPAIGN_SHARE_CEILING.toFixed(1)}%` : `${measured}%`;
}

/** A candidate before it is made: recipe, process, and the authored forecast (prediction and uncertainty). */
type CampaignRecipe = Omit<CampaignSpec, 'measured' | 'gap' | 'objectiveMet'>;

/**
 * Adds the batch result. `measured` is the target-phase share from the shared synthesis model that also draws the campaign
 * trace (app/xrd/campaign.ts), capped at the reporting ceiling, so every verdict read from it agrees with that trace.
 * `gap` and `objectiveMet` are against the purity floor.
 */
function withModelResult(recipe: CampaignRecipe): CampaignSpec {
  const measured = Math.min(campaignTargetShare(recipe), CAMPAIGN_SHARE_CEILING);
  const gap = measured - 96;
  return { ...recipe, measured: measured.toFixed(1), gap: `${gap >= 0 ? '+' : '−'}${Math.abs(gap).toFixed(1)} pp`, objectiveMet: gap >= 0 };
}

const authoredRecipes: CampaignRecipe[] = [
  {
    id: 'C-42', name: 'Ca-rich edge', formula: 'CaTiO₃ + 8.3 mol% Ca excess', precursorLabel: 'Ca + Ti precursor lots', targetMass: '24.00 g',
    temperature: '1,100 °C', temperatureShort: '1100 °C', dwell: '3.5 h', prediction: '96.4%', uncertainty: '±1.9%',
    profile: 'C42-1100-3H30', insightReward: 46, thermalMinutes: 330, throughput: '0.18 runs / h', point: [140, 48],
  },
  {
    id: 'Z-17', name: 'Zr-doped', formula: 'CaTi₀.₉₆Zr₀.₀₄O₃', precursorLabel: 'Ca + Ti + Zr precursor lots', targetMass: '22.50 g',
    temperature: '1,020 °C', temperatureShort: '1020 °C', dwell: '3.5 h', prediction: '97.1%', uncertainty: '±2.6%',
    profile: 'Z17-1020-3H30', insightReward: 58, thermalMinutes: 330, throughput: '0.18 runs / h', point: [230, 91],
  },
  {
    id: 'D-08', name: 'Low-energy', formula: 'CaTiO₃', precursorLabel: 'stoichiometric Ca + Ti lots', targetMass: '24.00 g',
    temperature: '900 °C', temperatureShort: '900 °C', dwell: '2.5 h', prediction: '94.8%', uncertainty: '±1.2%',
    profile: 'D08-900-2H30', insightReward: 38, thermalMinutes: 270, throughput: '0.22 runs / h', point: [166, 124],
  },
  {
    id: 'A-29', name: 'Model-learned', formula: 'CaTi₀.₉₈Zr₀.₀₂O₃', precursorLabel: 'Ca + Ti + Zr adaptive lots', targetMass: '24.00 g',
    temperature: '1,000 °C', temperatureShort: '1000 °C', dwell: '3.75 h', prediction: '98.4%', uncertainty: '±0.9%',
    profile: 'A29-1000-3H45', insightReward: 65, thermalMinutes: 345, throughput: '0.17 runs / h', point: [212, 82],
  },
  {
    id: 'R-31', name: 'Conversion recovery', formula: 'CaTiO₃', precursorLabel: 'stoichiometric Ca + Ti recovery lots', targetMass: '24.00 g',
    temperature: '990 °C', temperatureShort: '990 °C', dwell: '4.0 h', prediction: '98.6%', uncertainty: '±0.8%',
    profile: 'R31-990-4H', insightReward: 70, thermalMinutes: 360, throughput: '0.17 runs / h', point: [174, 78],
  },
];

export const campaignSpecs: CampaignSpec[] = authoredRecipes.map(withModelResult);

export function getCampaignSpec(id?: string) {
  if (id?.startsWith('U-')) return parseCustomCampaignSpec(id);
  return campaignSpecs.find((candidate) => candidate.id === id) ?? campaignSpecs[0];
}

export type CampaignFinding = { readonly kind: CampaignSecondaryPhase; readonly label: string; readonly hypothesis: string };

/**
 * What the SEM / EDS follow-up finds: the leftover phase that dominates the model batch, or none above the reportable floor.
 * The hypothesis reads the batch chemistry too: leftover titania in a Ca-deficient batch points to the weighing, not to conversion.
 */
export function getCampaignFinding(spec: CampaignSpec): CampaignFinding {
  const kind = campaignSecondaryPhase(spec);
  const { caExcess } = campaignComposition(spec);
  if (kind === 'titania') return { kind, label: 'Ti-rich cores', hypothesis: `Ti-rich cores support ${caExcess < 0 ? 'a Ca-deficient batch' : 'incomplete conversion'} as the follow-up hypothesis.` };
  if (kind === 'calcium') {
    // Ca₄Ti₃O₁₀ takes up excess Ca only at a hot setpoint, and then only part of it (most stays as lime), so a reportable amount ties part of the excess to the firing.
    const reacted = caExcess > 0 && campaignPhaseReportable(spec, ['ca4ti3o10']);
    return { kind, label: 'Ca-rich secondary grains', hypothesis: `Ca-rich secondary grains support ${reacted ? 'precursor excess, part of which reacted into Ca₄Ti₃O₁₀ at the hot setpoint' : caExcess > 0 ? 'precursor excess' : 'incomplete conversion'} as the follow-up hypothesis.` };
  }
  if (kind === 'zirconia') return { kind, label: 'Zr-rich grains', hypothesis: 'Zr-rich grains support undissolved zirconia as the follow-up hypothesis.' };
  return { kind, label: 'No secondary grains resolved', hypothesis: 'No secondary grains were resolved. That is not proof of a single-phase batch.' };
}

export const customCompositionOptions = {
  caExcess: [-4, 0, 4, 8],
  zrDopant: [0, 2, 4, 6],
  temperature: [900, 950, 1000, 1050],
  dwell: [2.5, 3.5, 4.5, 6],
} as const;

function nearestIndex(options: readonly number[], value: number) {
  return options.reduce((best, option, index) => Math.abs(option - value) < Math.abs(options[best] - value) ? index : best, 0);
}

export function getAuthoredCampaignFollowUp(spec: CampaignSpec, missionId: CampaignMissionId, diagnosis?: string) {
  if (!spec.composition) return null;
  const step = (options: readonly number[], value: number, direction: -1 | 1) => {
    const current = Math.max(0, options.indexOf(value));
    return options[Math.max(0, Math.min(options.length - 1, current + direction))] ?? value;
  };
  const composition: CustomComposition = { ...spec.composition };
  const measured = Number.parseFloat(spec.measured);
  // A secondary phase from off-stoichiometric weighing moves Ca toward stoichiometry; one from an on-stoichiometry batch extends the dwell.
  if (diagnosis?.includes('Ca-rich') && composition.caExcess > 0) {
    composition.caExcess = step(customCompositionOptions.caExcess, composition.caExcess, -1);
  } else if (diagnosis?.includes('Ti-rich') && composition.caExcess < 0) {
    composition.caExcess = step(customCompositionOptions.caExcess, composition.caExcess, 1);
  } else if ((diagnosis?.includes('Ti-rich') || diagnosis?.includes('Ca-rich')) && composition.dwell < customCompositionOptions.dwell.at(-1)!) {
    composition.dwell = step(customCompositionOptions.dwell, composition.dwell, 1);
  } else if (missionId === 'throughput') {
    if (measured >= 95.5 && composition.dwell > customCompositionOptions.dwell[0]) composition.dwell = step(customCompositionOptions.dwell, composition.dwell, -1);
    else if (measured >= 95.5) return null;
    else if (composition.zrDopant < customCompositionOptions.zrDopant.at(-1)!) composition.zrDopant = step(customCompositionOptions.zrDopant, composition.zrDopant, 1);
    else composition.dwell = step(customCompositionOptions.dwell, composition.dwell, 1);
  } else if (missionId === 'low-energy') {
    if (measured >= 94.5) composition.temperature = step(customCompositionOptions.temperature, composition.temperature, -1);
    else composition.dwell = step(customCompositionOptions.dwell, composition.dwell, 1);
  } else composition.dwell = step(customCompositionOptions.dwell, composition.dwell, measured >= 96 ? -1 : 1);
  const followUp = buildCustomCampaignSpec(composition);
  return followUp.id === spec.id ? null : followUp;
}

/**
 * A replicate's reported share: the model share plus a small fixed scatter, at most 0.2 pp, standing in for batch-to-batch variation,
 * kept between 0 and the reporting ceiling.
 */
export function getCampaignObservedPhase(spec: CampaignSpec, priorReplicateCount = 0) {
  const replicateVariation = [0, -0.2, 0.1, -0.1][Math.max(0, priorReplicateCount) % 4] ?? 0;
  return Math.max(0, Math.min(CAMPAIGN_SHARE_CEILING, Number.parseFloat(spec.measured) + replicateVariation)).toFixed(1);
}

/**
 * A saved campaign history recomputed from the current model, so saves made under older firings, forecasts, or reporting rules read
 * like new results. Each result's share is its candidate's replicate share (counting earlier results for that candidate), its gap and
 * verdict are re-evaluated for its mission and retained cycle, and a recorded SEM finding is re-derived. Other fields are kept, and
 * items that are not results of a known candidate pass through unchanged.
 */
export function recomputeCampaignHistory<T>(history: readonly T[]): T[] {
  const replicates = new Map<string, number>();
  return history.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const result = item as { candidate?: unknown; missionId?: unknown; elapsed?: unknown; diagnosis?: unknown };
    if (typeof result.candidate !== 'string') return item;
    const spec = getCampaignSpec(result.candidate);
    if (spec.id !== result.candidate) return item;
    const priorReplicateCount = replicates.get(spec.id) ?? 0;
    replicates.set(spec.id, priorReplicateCount + 1);
    const measured = getCampaignObservedPhase(spec, priorReplicateCount);
    const missionId: CampaignMissionId = result.missionId === 'low-energy' || result.missionId === 'throughput' ? result.missionId : 'purity';
    const elapsed = Number(result.elapsed);
    const evaluation = evaluateCampaignMission({ ...spec, measured }, missionId, Number.isFinite(elapsed) ? elapsed : undefined);
    return { ...item, measured, gap: evaluation.gap, objectiveMet: evaluation.met, ...(result.diagnosis === undefined ? {} : { diagnosis: getCampaignFinding(spec).label }) };
  });
}

function customFormula({ caExcess, zrDopant }: CustomComposition) {
  const subscript = (value: string) => value.replace(/[0-9.]/g, (character) => ({ '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '.': '.' })[character] ?? character);
  const tiFraction = (1 - zrDopant / 100).toFixed(2);
  const zrFraction = (zrDopant / 100).toFixed(2);
  const lattice = zrDopant > 0 ? `CaTi${subscript(tiFraction)}Zr${subscript(zrFraction)}O₃` : 'CaTiO₃';
  return caExcess === 0 ? lattice : `${lattice} · ${caExcess > 0 ? '+' : ''}${caExcess} mol% Ca`;
}

export function buildCustomCampaignSpec(input: CustomComposition): CampaignSpec {
  const caIndex = nearestIndex(customCompositionOptions.caExcess, input.caExcess);
  const zrIndex = nearestIndex(customCompositionOptions.zrDopant, input.zrDopant);
  const temperatureIndex = nearestIndex(customCompositionOptions.temperature, input.temperature);
  const dwellIndex = nearestIndex(customCompositionOptions.dwell, input.dwell);
  const composition: CustomComposition = {
    caExcess: customCompositionOptions.caExcess[caIndex],
    zrDopant: customCompositionOptions.zrDopant[zrIndex],
    temperature: customCompositionOptions.temperature[temperatureIndex],
    dwell: customCompositionOptions.dwell[dwellIndex],
  };
  const id: CampaignCandidateId = `U-${caIndex}${zrIndex}${temperatureIndex}${dwellIndex}`;
  // A heuristic forecast, not a fit to the model. Only setpoints below 1000 °C are penalized, since hotter firings convert fully.
  const temperatureScore = -Math.max(0, 1000 - composition.temperature) * 0.024;
  // Stoichiometric Ca scores best; a mol% of deficit leaves heavier rutile than a mol% of excess leaves lime, so it costs more.
  const caScore = 1.15 - Math.abs(composition.caExcess) * (composition.caExcess > 0 ? 0.16 : 0.24);
  const zrScore = composition.zrDopant * 0.3;
  const dwellScore = (composition.dwell - 2.5) * 0.32;
  const predictionValue = Math.max(90.2, Math.min(99, 95.3 + temperatureScore + caScore + zrScore + dwellScore));
  const thermalMinutes = Math.round(composition.dwell * 60 + 120);
  return withModelResult({
    id,
    name: `${composition.zrDopant}% Zr · ${composition.caExcess >= 0 ? '+' : ''}${composition.caExcess}% Ca`,
    formula: customFormula(composition),
    precursorLabel: `Ca + Ti${composition.zrDopant > 0 ? ' + Zr' : ''} user-selected lots`,
    targetMass: '24.00 g',
    temperature: `${composition.temperature.toLocaleString('en-US')} °C`,
    temperatureShort: `${composition.temperature} °C`,
    dwell: `${composition.dwell.toFixed(1)} h`,
    prediction: `${predictionValue.toFixed(1)}%`,
    uncertainty: '±2.4%',
    profile: `USR-${composition.temperature}-${Math.round(composition.dwell * 60)}M`,
    insightReward: 54 + zrIndex * 3,
    thermalMinutes,
    throughput: `${(60 / thermalMinutes).toFixed(2)} runs / h`,
    point: [150 + composition.zrDopant * 18 - composition.caExcess * 2.5, 132 - (composition.temperature - 900) * 0.27 - composition.dwell * 3],
    composition,
  });
}

function parseCustomCampaignSpec(id: string) {
  const encoded = id.match(/^U-(\d)(\d)(\d)(\d)$/);
  if (!encoded) return campaignSpecs[0];
  return buildCustomCampaignSpec({
    caExcess: customCompositionOptions.caExcess[Number(encoded[1])] ?? 0,
    zrDopant: customCompositionOptions.zrDopant[Number(encoded[2])] ?? 0,
    temperature: customCompositionOptions.temperature[Number(encoded[3])] ?? 1000,
    dwell: customCompositionOptions.dwell[Number(encoded[4])] ?? 3.5,
  });
}

export function getCampaignOperations(runNumber = 42, thermalBayLevel = 1): CampaignOperations {
  const activeRunNumber = Math.max(1, runNumber - (2 + runNumber % 3));
  const referenceResults = ['+0.01° 2θ', '−0.02° 2θ', '+0.03° 2θ', '+0.00° 2θ'];
  const robotCondition = (['nominal', 'grip-force', 'contamination'] as const)[runNumber % 3];
  const furnaceCondition = (['nominal', 'nominal', 'thermocouple-drift', 'door-seal'] as const)[runNumber % 4];
  const referenceCondition = (['current', 'trend-review', 'current', 'age-due'] as const)[runNumber % 4];
  const robotRecoveryMinutes = robotCondition === 'nominal'
    ? 4 + runNumber % 2
    : robotCondition === 'grip-force'
      ? 9 + (runNumber % 3) * 2
      : 12 + (runNumber % 4) * 3;
  const referenceAgeHours = referenceCondition === 'current'
    ? 2 + runNumber % 3
    : referenceCondition === 'trend-review'
      ? 6 + runNumber % 2
      : 8 + runNumber % 7;
  return {
    activeFurnaceRun: getCampaignIdentity(activeRunNumber).runId,
    furnaceLane: thermalBayLevel >= 2 ? 'FURN-04B' : 'FURN-04A',
    queueMinutes: thermalBayLevel >= 2 ? 8 + (runNumber * 5) % 9 : 36 + (runNumber * 17) % 31,
    furnaceCondition,
    furnaceConstraint: furnaceCondition !== 'nominal',
    furnaceRecoveryMinutes: furnaceCondition === 'thermocouple-drift' ? 14 + runNumber % 4 : furnaceCondition === 'door-seal' ? 18 + runNumber % 5 : 4,
    furnaceResult: furnaceCondition === 'thermocouple-drift' ? '+11.8 °C witness bias' : furnaceCondition === 'door-seal' ? '12.6 °C edge-center span' : '±4.2 °C agreement',
    robotCondition,
    robotConstraint: robotCondition !== 'nominal',
    robotRecoveryMinutes,
    referenceCondition,
    referenceConstraint: referenceCondition === 'age-due',
    referenceAgeHours,
    referenceResult: referenceResults[runNumber % referenceResults.length],
  };
}

export function getCampaignIdentity(runNumber = 42) {
  const suffix = String(runNumber).padStart(3, '0');
  return {
    runNumber,
    suffix,
    runId: `RUN-${suffix}`,
    carrier: `BC-${suffix}`,
    prepSample: `RUN-${suffix}-P`,
    thermalSample: `RUN-${suffix}-T`,
    xrdDataset: `XRD-${suffix}`,
    pattern: `PAT-${suffix}`,
    furnaceQueue: `FURN-Q${suffix}`,
  };
}
