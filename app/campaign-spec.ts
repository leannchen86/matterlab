export type CampaignCandidateId = 'C-42' | 'Z-17' | 'D-08';

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
    id: 'C-42', name: 'Ca-rich edge', formula: 'Ca₀.₅₂Ti₀.₄₈O₃', precursorLabel: 'Ca + Ti precursor lots', targetMass: '24.00 g',
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
];

export function getCampaignSpec(id?: string) {
  return campaignSpecs.find((candidate) => candidate.id === id) ?? campaignSpecs[0];
}
