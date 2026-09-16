import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCustomCampaignSpec, CAMPAIGN_SHARE_CEILING, campaignShareLabel, campaignSpecs, customCompositionOptions, evaluateCampaignMission, forecastCampaignMission, getAuthoredCampaignFollowUp, getCampaignFinding, getCampaignObservedPhase, getCampaignSpec, recomputeCampaignHistory, type CampaignMissionId, type CustomComposition } from '../campaign-spec.ts';
import { campaignComposition, campaignHistory, campaignPattern, campaignSecondaryPhase, campaignTargetShare, siliconQcPattern, type CampaignPattern } from './campaign.ts';
import { synthesize } from './synthesis.ts';

function strongestAngle({ angles, intensities }: CampaignPattern) {
  let top = 0;
  intensities.forEach((value, index) => { if (value > intensities[top]) top = index; });
  return angles[top];
}

function windowMax({ angles, intensities }: CampaignPattern, from: number, to: number) {
  let best = 0;
  angles.forEach((angle, index) => { if (angle >= from && angle <= to) best = Math.max(best, intensities[index]); });
  return best;
}

const customSpec = (composition: Partial<CustomComposition>) => buildCustomCampaignSpec({ caExcess: 0, zrDopant: 0, temperature: 1000, dwell: 4.5, ...composition });
const custom = (composition: Partial<CustomComposition>) => campaignPattern(customSpec(composition));

const FLOORS: Record<CampaignMissionId, number> = { purity: 96, 'low-energy': 94.5, throughput: 95.5 };

test('patterns are deterministic, normalised and at most 400 points', async () => {
  const fresh: typeof import('./campaign.ts') = await import(new URL('./campaign.ts?fresh', import.meta.url).href);
  const spec = getCampaignSpec('R-31');
  const pattern = campaignPattern(spec);
  assert.deepEqual(fresh.campaignPattern({ ...spec }), pattern);
  assert.deepEqual(fresh.siliconQcPattern(), siliconQcPattern());
  assert.ok(pattern.angles.length <= 400);
  assert.equal(pattern.angles.length, pattern.intensities.length);
  assert.equal(Math.max(...pattern.intensities), 1);
});

test('R-31 peaks in the CaTiO3 cluster near 33 degrees', () => {
  const angle = strongestAngle(campaignPattern(getCampaignSpec('R-31')));
  assert.ok(angle > 32.8 && angle < 33.4, `strongest line at ${angle}`);
});

test('Zr on the Ti site moves the strongest line to lower angle', () => {
  assert.ok(strongestAngle(custom({ zrDopant: 6 })) < strongestAngle(custom({ zrDopant: 0 })));
});

test('Ca excess adds lime (200) signal near 37.4 degrees', () => {
  assert.ok(windowMax(custom({ caExcess: 8 }), 37.0, 37.6) > windowMax(custom({ caExcess: 0 }), 37.0, 37.6));
});

test('900 C with a short dwell leaves rutile (110) near 27.4 degrees', () => {
  const cold = windowMax(custom({ temperature: 900, dwell: 2.5 }), 27.2, 27.7);
  const hot = windowMax(custom({ temperature: 1050, dwell: 6 }), 27.2, 27.7);
  assert.ok(cold > 2 * hot, `rutile window ${cold} vs ${hot}`);
});

test('silicon QC peaks at Si (111)', () => {
  assert.ok(Math.abs(strongestAngle(siliconQcPattern()) - 28.44) < 0.1);
});

test('measured share is the CaTiO3 weight share of the synthesized batch, capped at the reporting ceiling', () => {
  for (const spec of [...campaignSpecs, customSpec({ caExcess: 8, zrDopant: 2, temperature: 900, dwell: 2.5 })]) {
    const phases = synthesize(campaignHistory(spec));
    const total = phases.reduce((sum, phase) => sum + phase.weightFraction, 0);
    const host = phases.reduce((sum, phase) => sum + (phase.structureId === 'catio3' ? phase.weightFraction : 0), 0);
    assert.ok(Math.abs(campaignTargetShare(spec) - (100 * host) / total) <= 0.05, spec.id);
    assert.equal(spec.measured, Math.min(campaignTargetShare(spec), CAMPAIGN_SHARE_CEILING).toFixed(1), spec.id);
  }
});

test('each authored verdict is the reported share against the mission floor', () => {
  for (const spec of campaignSpecs) {
    const share = Number(spec.measured);
    const { temperature } = campaignComposition(spec);
    assert.equal(spec.objectiveMet, share >= FLOORS.purity, spec.id);
    for (const missionId of Object.keys(FLOORS) as CampaignMissionId[]) {
      const withinWindow = missionId === 'low-energy' ? temperature <= 950 : missionId === 'throughput' ? spec.thermalMinutes + 48 <= 420 : true;
      assert.equal(evaluateCampaignMission(spec, missionId).met, share >= FLOORS[missionId] && withinWindow, `${spec.id} ${missionId}`);
    }
  }
});

test('a batch with a visible secondary phase never scores above the stoichiometric batch at the same firing', () => {
  for (const temperature of customCompositionOptions.temperature) for (const dwell of customCompositionOptions.dwell) {
    const clean = customSpec({ temperature, dwell });
    for (const caExcess of customCompositionOptions.caExcess) for (const zrDopant of customCompositionOptions.zrDopant) {
      const spec = customSpec({ caExcess, zrDopant, temperature, dwell });
      assert.equal(spec.measured, Math.min(campaignTargetShare(spec), CAMPAIGN_SHARE_CEILING).toFixed(1), spec.id);
      if (spec.id === clean.id || campaignSecondaryPhase(spec) === 'none') continue;
      assert.ok(Number(spec.measured) <= Number(clean.measured), `${spec.id} ${spec.measured}% above ${clean.id} ${clean.measured}%`);
    }
  }
});

test('the SEM finding follows the leftover phase of the model batch', () => {
  assert.equal(getCampaignFinding(customSpec({ caExcess: -4 })).label, 'Ti-rich cores');
  assert.equal(getCampaignFinding(customSpec({ temperature: 900, dwell: 2.5 })).label, 'Ti-rich cores');
  assert.equal(getCampaignFinding(customSpec({ caExcess: 8 })).label, 'Ca-rich secondary grains');
  assert.equal(getCampaignFinding(getCampaignSpec('C-42')).kind, 'calcium');
  assert.equal(getCampaignFinding(getCampaignSpec('R-31')).kind, 'none');
});

test('SEM-informed follow-ups move the batch toward stoichiometry or longer conversion', () => {
  const tiRich = customSpec({ caExcess: -4 });
  const tiFollowUp = getAuthoredCampaignFollowUp(tiRich, 'purity', getCampaignFinding(tiRich).label);
  assert.equal(tiFollowUp?.composition?.caExcess, 0);
  assert.ok(Number(tiFollowUp?.measured) > Number(tiRich.measured));
  const caRich = customSpec({ caExcess: 8 });
  const caFollowUp = getAuthoredCampaignFollowUp(caRich, 'purity', getCampaignFinding(caRich).label);
  assert.equal(caFollowUp?.composition?.caExcess, 4);
  assert.ok(Number(caFollowUp?.measured) > Number(caRich.measured));
  const cold = customSpec({ temperature: 900, dwell: 2.5 });
  const coldFollowUp = getAuthoredCampaignFollowUp(cold, 'purity', getCampaignFinding(cold).label);
  assert.equal(coldFollowUp?.composition?.dwell, 3.5);
  assert.ok(Number(coldFollowUp?.measured) > Number(cold.measured));
});

test('replicates stay within 0.2 percentage points of the model share', () => {
  const spec = getCampaignSpec('C-42');
  for (let count = 0; count < 4; count += 1) {
    assert.ok(Math.abs(Number(getCampaignObservedPhase(spec, count)) - Number(spec.measured)) <= 0.2 + 1e-9, `replicate ${count}`);
  }
});

test('the authored firings include purity misses from excess Ca and from a short cold firing', () => {
  assert.ok(campaignSpecs.some((spec) => !evaluateCampaignMission(spec, 'purity').met));
  const caRich = getCampaignSpec('C-42');
  assert.equal(evaluateCampaignMission(caRich, 'purity').met, false);
  assert.equal(getCampaignFinding(caRich).kind, 'calcium');
  const lowEnergy = getCampaignSpec('D-08');
  assert.equal(evaluateCampaignMission(lowEnergy, 'purity').met, false);
  assert.equal(evaluateCampaignMission(lowEnergy, 'low-energy').met, true);
  assert.equal(getCampaignFinding(lowEnergy).kind, 'titania');
  assert.equal(evaluateCampaignMission(getCampaignSpec('R-31'), 'purity').met, true);
});

test('every authored forecast brackets its reported share within two sigma', () => {
  for (const spec of campaignSpecs) {
    const prediction = Number.parseFloat(spec.prediction);
    const sigma = Number.parseFloat(spec.uncertainty.replace(/[^\d.]/g, ''));
    assert.ok(Math.abs(Number(spec.measured) - prediction) <= 2 * sigma + 1e-9, `${spec.id} ${spec.measured}% vs ${spec.prediction} ${spec.uncertainty}`);
  }
  assert.ok(['MODEL EDGE', 'PHASE RISK'].includes(forecastCampaignMission(getCampaignSpec('C-42'), 'purity').status));
});

test('no reported share or replicate exceeds the reporting ceiling', () => {
  const { caExcess, zrDopant, temperature, dwell } = customCompositionOptions;
  const customs = caExcess.flatMap((ca) => zrDopant.flatMap((zr) => temperature.flatMap((t) => dwell.map((hours) => customSpec({ caExcess: ca, zrDopant: zr, temperature: t, dwell: hours })))));
  for (const spec of [...campaignSpecs, ...customs]) {
    assert.ok(Number(spec.measured) <= CAMPAIGN_SHARE_CEILING, spec.id);
    for (let count = 0; count < 4; count += 1) assert.ok(Number(getCampaignObservedPhase(spec, count)) <= CAMPAIGN_SHARE_CEILING, `${spec.id} replicate ${count}`);
  }
  const clean = getCampaignSpec('R-31');
  assert.equal(clean.measured, '99.5');
  assert.equal(campaignShareLabel(clean.measured), '≥99.5%');
  assert.equal(campaignShareLabel(getCampaignSpec('C-42').measured), `${getCampaignSpec('C-42').measured}%`);
});

test('the custom forecast peaks at stoichiometric Ca, is lowest at +8 mol% Ca, and ranks undoped batches as the model does', () => {
  const byShare = (share: (ca: number) => number) => [...customCompositionOptions.caExcess].sort((a, b) => share(b) - share(a)).join(' > ');
  for (const zr of customCompositionOptions.zrDopant) for (const t of customCompositionOptions.temperature) for (const hours of customCompositionOptions.dwell) {
    const spec = (ca: number) => customSpec({ caExcess: ca, zrDopant: zr, temperature: t, dwell: hours });
    const forecast = (ca: number) => Number.parseFloat(spec(ca).prediction);
    for (const ca of customCompositionOptions.caExcess) {
      if (ca !== 0) assert.ok(forecast(ca) < forecast(0), `${ca} mol% Ca at ${zr}% Zr, ${t} °C, ${hours} h`);
      if (ca !== 8) assert.ok(forecast(8) < forecast(ca), `+8 vs ${ca} mol% Ca at ${zr}% Zr, ${t} °C, ${hours} h`);
    }
    if (zr === 0) assert.equal(byShare(forecast), byShare((ca) => Number(spec(ca).measured)), `${t} °C, ${hours} h`);
  }
});

test('custom forecasts bracket most model results within two sigma', () => {
  const { caExcess, zrDopant, temperature, dwell } = customCompositionOptions;
  const customs = caExcess.flatMap((ca) => zrDopant.flatMap((zr) => temperature.flatMap((t) => dwell.map((hours) => customSpec({ caExcess: ca, zrDopant: zr, temperature: t, dwell: hours })))));
  const bracketed = customs.filter((spec) => Math.abs(Number(spec.measured) - Number.parseFloat(spec.prediction)) <= 2 * Number.parseFloat(spec.uncertainty.replace(/[^\d.]/g, '')) + 1e-9);
  assert.ok(bracketed.length >= 0.9 * customs.length, `${bracketed.length} of ${customs.length}`);
});

test('a saved history is recomputed from the current model and malformed items pass through', () => {
  const stale = [
    { runNumber: 40, candidate: 'D-08', measured: '99.9', gap: '+3.9 pp', objectiveMet: true, elapsed: 540, missionId: 'purity', diagnosis: 'No secondary grains resolved', thermalBayLevel: 1 },
    { runNumber: 41, candidate: 'D-08', measured: '99.7', gap: 'WINDOW PASS', objectiveMet: true, elapsed: 540, missionId: 'low-energy' },
    { runNumber: 42, candidate: 'C-42', measured: '96.6', gap: '+0.6 pp', objectiveMet: true, elapsed: 470, missionId: 'throughput' },
  ];
  const [first, second, third] = recomputeCampaignHistory(stale);
  const lowEnergy = getCampaignSpec('D-08');
  assert.deepEqual(first, { ...stale[0], measured: lowEnergy.measured, gap: lowEnergy.gap, objectiveMet: false, diagnosis: 'Ti-rich cores' });
  assert.equal(second.measured, getCampaignObservedPhase(lowEnergy, 1));
  assert.equal(second.objectiveMet, true);
  assert.equal('diagnosis' in second, false);
  assert.equal(third.measured, getCampaignSpec('C-42').measured);
  assert.equal(third.objectiveMet, false);
  assert.equal(third.gap, evaluateCampaignMission({ ...getCampaignSpec('C-42'), measured: third.measured }, 'throughput', 470).gap);
  const malformed = [null, 7, 'C-42', {}, { candidate: 42 }, { candidate: 'X-99', measured: '99.9' }, { candidate: 'U-9999' }];
  assert.doesNotThrow(() => recomputeCampaignHistory(malformed));
  assert.deepEqual(recomputeCampaignHistory(malformed), malformed);
});
