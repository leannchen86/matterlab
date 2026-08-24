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
  { id: 'throughput', label: 'Fast campaign', shortLabel: 'RATE', target: '≥ 95.5% · ≤ 360 min', brief: 'Balance qualified phase fraction against furnace occupancy.' },
];

export function getCampaignMission(id?: string) {
  return campaignMissions.find((mission) => mission.id === id) ?? campaignMissions[0];
}

export function evaluateCampaignMission(spec: CampaignSpec, missionId: CampaignMissionId = 'purity') {
  const measured = Number(spec.measured);
  const temperature = spec.composition?.temperature ?? Number(spec.temperature.replace(/[^\d]/g, ''));
  if (missionId === 'low-energy') {
    const phasePass = measured >= 94.5;
    const temperaturePass = temperature <= 950;
    return {
      met: phasePass && temperaturePass,
      gap: !phasePass ? `−${(94.5 - measured).toFixed(1)} pp` : !temperaturePass ? `+${temperature - 950} °C` : 'WINDOW PASS',
      targetText: 'Phase ≥ 94.5% · calcine ≤ 950 °C',
      resultText: `${measured.toFixed(1)}% · ${temperature} °C`,
      constraintText: !phasePass ? 'phase floor missed' : !temperaturePass ? 'temperature ceiling exceeded' : 'energy window achieved',
    };
  }
  if (missionId === 'throughput') {
    const phasePass = measured >= 95.5;
    const durationPass = spec.thermalMinutes <= 360;
    return {
      met: phasePass && durationPass,
      gap: !phasePass ? `−${(95.5 - measured).toFixed(1)} pp` : !durationPass ? `+${spec.thermalMinutes - 360} min` : 'RATE PASS',
      targetText: 'Phase ≥ 95.5% · thermal occupancy ≤ 360 min',
      resultText: `${measured.toFixed(1)}% · ${spec.thermalMinutes} min`,
      constraintText: !phasePass ? 'phase floor missed' : !durationPass ? 'furnace window exceeded' : 'throughput window achieved',
    };
  }
  const gap = measured - 96;
  return {
    met: gap >= 0,
    gap: `${gap >= 0 ? '+' : '−'}${Math.abs(gap).toFixed(1)} pp`,
    targetText: 'Target phase ≥ 96.0%',
    resultText: `${measured.toFixed(1)}% target phase`,
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
  if (missionId === 'throughput' && spec.thermalMinutes > 360) {
    return { tone: 'risk', status: 'TIME RISK', detail: `${spec.thermalMinutes - 360} min above occupancy ceiling` };
  }
  if (conservativePhase >= phaseFloor) {
    return { tone: 'fit', status: 'ROBUST FIT', detail: `${conservativePhase.toFixed(1)}% lower confidence bound` };
  }
  if (prediction >= phaseFloor) {
    return { tone: 'uncertain', status: 'MODEL EDGE', detail: `${prediction.toFixed(1)} ± ${uncertainty.toFixed(1)}% crosses phase floor` };
  }
  return { tone: 'risk', status: 'PHASE RISK', detail: `${(phaseFloor - prediction).toFixed(1)} pp below predicted floor` };
}

export const campaignSpecs: CampaignSpec[] = [
  {
    id: 'C-42', name: 'Ca-rich edge', formula: 'CaTiO₃ + 8.3 mol% Ca excess', precursorLabel: 'Ca + Ti precursor lots', targetMass: '24.00 g',
    temperature: '980 °C', temperatureShort: '980 °C', dwell: '4.0 h', prediction: '96.4%', uncertainty: '±1.9%',
    profile: 'C42-980-4H', measured: '95.8', gap: '−0.2 pp', objectiveMet: false, insightReward: 46, thermalMinutes: 360, throughput: '0.17 runs / h', point: [196, 70],
  },
  {
    id: 'Z-17', name: 'Zr-doped', formula: 'CaTi₀.₉₆Zr₀.₀₄O₃', precursorLabel: 'Ca + Ti + Zr precursor lots', targetMass: '22.50 g',
    temperature: '1,020 °C', temperatureShort: '1020 °C', dwell: '3.5 h', prediction: '97.1%', uncertainty: '±2.6%',
    profile: 'Z17-1020-3H30', measured: '96.7', gap: '+0.7 pp', objectiveMet: true, insightReward: 58, thermalMinutes: 330, throughput: '0.18 runs / h', point: [230, 91],
  },
  {
    id: 'D-08', name: 'Low-energy', formula: 'CaTiO₃', precursorLabel: 'stoichiometric Ca + Ti lots', targetMass: '24.00 g',
    temperature: '900 °C', temperatureShort: '900 °C', dwell: '6.0 h', prediction: '94.8%', uncertainty: '±1.2%',
    profile: 'D08-900-6H', measured: '95.1', gap: '−0.9 pp', objectiveMet: false, insightReward: 38, thermalMinutes: 480, throughput: '0.13 runs / h', point: [166, 112],
  },
  {
    id: 'A-29', name: 'Model-learned', formula: 'CaTi₀.₉₈Zr₀.₀₂O₃', precursorLabel: 'Ca + Ti + Zr adaptive lots', targetMass: '24.00 g',
    temperature: '1,000 °C', temperatureShort: '1000 °C', dwell: '3.75 h', prediction: '97.4%', uncertainty: '±0.9%',
    profile: 'A29-1000-3H45', measured: '97.0', gap: '+1.0 pp', objectiveMet: true, insightReward: 65, thermalMinutes: 345, throughput: '0.17 runs / h', point: [212, 82],
  },
  {
    id: 'R-31', name: 'Conversion recovery', formula: 'CaTiO₃', precursorLabel: 'stoichiometric Ca + Ti recovery lots', targetMass: '24.00 g',
    temperature: '990 °C', temperatureShort: '990 °C', dwell: '4.0 h', prediction: '96.6%', uncertainty: '±0.8%',
    profile: 'R31-990-4H', measured: '96.2', gap: '+0.2 pp', objectiveMet: true, insightReward: 70, thermalMinutes: 360, throughput: '0.17 runs / h', point: [174, 78],
  },
];

export function getCampaignSpec(id?: string) {
  if (id?.startsWith('U-')) return parseCustomCampaignSpec(id);
  return campaignSpecs.find((candidate) => candidate.id === id) ?? campaignSpecs[0];
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
  const temperatureScore = -Math.abs(composition.temperature - 1000) * 0.024;
  const caScore = 1.15 - Math.abs(composition.caExcess - 4) * 0.19;
  const zrScore = composition.zrDopant * 0.3;
  const dwellScore = (composition.dwell - 2.5) * 0.32;
  const predictionValue = Math.max(90.2, Math.min(98.4, 93.8 + temperatureScore + caScore + zrScore + dwellScore));
  const deterministicOffset = [-0.7, 0.2, -0.3, 0.6][(caIndex + zrIndex * 2 + temperatureIndex * 3 + dwellIndex) % 4];
  const measuredValue = Math.max(89.5, Math.min(99.1, predictionValue + deterministicOffset));
  const objectiveGap = measuredValue - 96;
  const thermalMinutes = Math.round(composition.dwell * 60 + 120);
  return {
    id,
    name: `${composition.zrDopant}% Zr · ${composition.caExcess >= 0 ? '+' : ''}${composition.caExcess}% Ca`,
    formula: customFormula(composition),
    precursorLabel: `Ca + Ti${composition.zrDopant > 0 ? ' + Zr' : ''} user-selected lots`,
    targetMass: '24.00 g',
    temperature: `${composition.temperature.toLocaleString('en-US')} °C`,
    temperatureShort: `${composition.temperature} °C`,
    dwell: `${composition.dwell.toFixed(1)} h`,
    prediction: `${predictionValue.toFixed(1)}%`,
    uncertainty: '±2.1%',
    profile: `USR-${composition.temperature}-${Math.round(composition.dwell * 60)}M`,
    measured: measuredValue.toFixed(1),
    gap: `${objectiveGap >= 0 ? '+' : '−'}${Math.abs(objectiveGap).toFixed(1)} pp`,
    objectiveMet: objectiveGap >= 0,
    insightReward: 54 + zrIndex * 3,
    thermalMinutes,
    throughput: `${(60 / thermalMinutes).toFixed(2)} runs / h`,
    point: [150 + composition.zrDopant * 18 + composition.caExcess * 2.5, 132 - (composition.temperature - 900) * 0.27 - composition.dwell * 3],
    composition,
  };
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
