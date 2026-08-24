export type CampaignCandidateId = 'C-42' | 'Z-17' | 'D-08' | 'A-29';

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
};

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
];

export function getCampaignSpec(id?: string) {
  return campaignSpecs.find((candidate) => candidate.id === id) ?? campaignSpecs[0];
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
