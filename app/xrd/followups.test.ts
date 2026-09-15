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
