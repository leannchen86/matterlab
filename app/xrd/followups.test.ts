import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sampleCase, specimenFor } from './cases.ts';
import { edsElements, runSemEds, runTga } from './followups.ts';

function tgaFor(code: string, key = `test/${code}`) {
  const source = sampleCase(code);
  return runTga(specimenFor(source), key, source.history.storage.relativeHumidity);
}

const semFor = (code: string, key = `test/${code}`) => runSemEds(specimenFor(sampleCase(code)), key);

test('TGA reports mass-loss steps, with a carbonate step only when carbonate is in the powder', () => {
  assert.ok(tgaFor('S-101').steps.every((step) => step.fromC < 200));
  const weathered = tgaFor('S-142');
  assert.ok(weathered.steps.some((step) => step.fromC >= 550 && step.lossPercent >= 0.3));
  assert.deepEqual(tgaFor('S-142'), weathered);
});

test('EDS finds media wear the record omits and never counts tape carbon as sample', () => {
  const milled = semFor('S-163');
  assert.ok(edsElements(milled).includes('Zr'));
  assert.ok(!edsElements(semFor('S-101')).includes('Zr'));
  assert.ok(milled.area.some((signal) => signal.element === 'C' && signal.artefact === 'tape'));
  assert.ok(!edsElements(milled).includes('C'));
  assert.deepEqual(milled.unresolved, [{ element: 'Ba', hiddenBy: 'Ti' }]);
  assert.deepEqual(semFor('S-163'), milled);
});

test('TGA thresholds the raw measurement before rounding its display', () => {
  // These null signals used to round up to 0.1% and become spurious decomposition steps.
  for (const key of ['tga-audit-17', 'tga-audit-37', 'tga-audit-49']) {
    assert.ok(tgaFor('S-101', key).steps.every((step) => step.fromC < 200), key);
  }
  let falseSteps = 0;
  for (let index = 0; index < 10000; index += 1) {
    falseSteps += tgaFor('S-101', `tga-audit-${index}`).steps.filter((step) => step.fromC > 300).length;
  }
  // A null window must clear 0.1 / 0.03 = 3.33 standard deviations, not 1.67.
  assert.ok(falseSteps < 30, `${falseSteps} false steps across 20000 null windows`);
});
