import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acquisitionFor, type MountRecord } from './measure.ts';
import { createInterpretation, createRun, decodeCounts, encodeCounts, parseArchive, sameInterpretation, serializeArchive } from './records.ts';

const MOUNT: MountRecord = { index: 1, aliquot: 1, method: 'front', grind: 'hand', spike: 'none', spikeFraction: 0, spin: false, preparedBy: 'queue' };

function sampleRun(index = 1) {
  const counts = Uint32Array.from({ length: 60 }, (_, bin) => (bin * 7919 + index) % 70001);
  return createRun('S-900', index, MOUNT, acquisitionFor('survey'), 12, { startDeg: 10, stepDeg: 0.02, count: counts.length }, counts);
}

test('counts survive the text codec above 16 bits and across chunk boundaries', () => {
  const counts = Uint32Array.from([0, 1, 65535, 65536, 4_000_000_000, 123456]);
  assert.deepEqual(decodeCounts(encodeCounts(counts), counts.length), counts);
  const long = Uint32Array.from({ length: 20000 }, (_, bin) => (bin * 2654435761) >>> 0);
  assert.deepEqual(decodeCounts(encodeCounts(long), long.length), long);
  assert.equal(decodeCounts(encodeCounts(counts), counts.length + 1), undefined);
  assert.equal(decodeCounts('%%%', 1), undefined);
});

test('a run keeps its own copy of the counts', () => {
  const counts = Uint32Array.from([5, 6, 7]);
  const run = createRun('S-900', 1, MOUNT, acquisitionFor('survey'), 0, { startDeg: 10, stepDeg: 0.02, count: 3 }, counts);
  counts[0] = 999;
  assert.equal(run.counts[0], 5);
});

test('an archive round-trips runs and interpretations', () => {
  const run = sampleRun();
  const interpretation = createInterpretation(run, 1, { candidates: ['rutile', 'catio3', 'rutile'], internalStandard: 'silicon', zeroDeg: 0.012 }, 30);
  const restored = parseArchive(serializeArchive({ version: 1, runs: [run], interpretations: [interpretation] }));
  assert.ok(restored);
  assert.deepEqual(restored.runs, [run]);
  assert.deepEqual(restored.interpretations, [interpretation]);
});

test('malformed runs are dropped with the interpretations that read them', () => {
  const good = sampleRun(1);
  const bad = sampleRun(2);
  const text = serializeArchive({
    version: 1,
    runs: [good, bad],
    interpretations: [createInterpretation(good, 1, { candidates: ['catio3'] }, 0), createInterpretation(bad, 1, { candidates: ['catio3'] }, 0)],
  });
  const raw = JSON.parse(text);
  raw.runs[1].counts = raw.runs[1].counts.slice(8);
  const restored = parseArchive(JSON.stringify(raw));
  assert.deepEqual(restored?.runs.map((run) => run.id), [good.id]);
  assert.deepEqual(restored?.interpretations.map((item) => item.runId), [good.id]);
  assert.equal(parseArchive(JSON.stringify({ ...raw, version: 99 })), undefined);
  assert.equal(parseArchive('not json'), undefined);
});

test('interpretations with the same inputs match regardless of pick order', () => {
  const run = sampleRun();
  const a = createInterpretation(run, 1, { candidates: ['rutile', 'catio3'] }, 0);
  const b = createInterpretation(run, 2, { candidates: ['catio3', 'rutile', 'catio3'] }, 5);
  assert.deepEqual(a.candidates, ['catio3', 'rutile']);
  assert.ok(sameInterpretation(a, b));
  assert.ok(!sameInterpretation(a, { ...b, zeroDeg: 0.01 }));
  assert.ok(!sameInterpretation(a, { ...b, internalStandard: 'silicon' }));
  assert.ok(!sameInterpretation(a, { ...b, runId: 'S-900-R2' }));
});
