import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analysisOf, apply, createLab } from '../xrd/lab.ts';
import { plotScalePeak } from './plot-scale.ts';

test('a zoomed comparison includes the inactive fit and keeps the scale when A and B swap', () => {
  const scanned = apply(createLab('test', ['S-101']), { type: 'scan', code: 'S-101', program: 'survey' });
  if (!scanned.ok) return assert.fail(scanned.error);
  const run = scanned.state.samples[0].runs[0];
  const a = analysisOf(run, { candidates: ['catio3'] });
  const b = analysisOf(run, { candidates: ['anatase'] });
  const input = { grid: run.grid, counts: run.counts, view: { startDeg: 24.7, endDeg: 25.14 } };
  const observed = plotScalePeak(input);
  const aOnly = plotScalePeak({ ...input, fit: a });
  const bOnly = plotScalePeak({ ...input, fit: b });
  const comparison = plotScalePeak({ ...input, fit: a, other: b });
  assert.ok(bOnly > observed * 4, 'fixture must contain the tall wrong-reference peak');
  assert.ok(bOnly > aOnly * 4, 'active fit alone cannot provide enough vertical range');
  assert.equal(comparison, bOnly);
  assert.equal(plotScalePeak({ ...input, fit: b, other: a }), comparison);
});

test('unrevealed observations do not set the scale, while supplied fits retain their full visible range', () => {
  const input = {
    grid: { startDeg: 10, stepDeg: 1, count: 4 },
    counts: Uint32Array.of(3, 8, 100, 999),
    view: { startDeg: 10, endDeg: 13 },
  };
  assert.equal(plotScalePeak({ ...input, revealDeg: 11 }), 8);
  assert.equal(plotScalePeak(input), 999);
  assert.equal(plotScalePeak({ ...input, revealDeg: 9 }), 1);
  assert.equal(plotScalePeak({ ...input, revealDeg: 11, other: { calculated: [2, 3, 4, 1500] } }), 1500);
});

test('viewport margins and a scaled overlay use each run’s own angular grid', () => {
  const input = {
    grid: { startDeg: 10, stepDeg: 0.5, count: 6 },
    counts: Uint32Array.of(999, 40, 6, 7, 50, 1000),
    view: { startDeg: 11, endDeg: 11.5 },
  };
  // The visible samples are 6 and 7; one neighboring sample on either side also contributes.
  assert.equal(plotScalePeak(input), 50);
  const overlay = {
    grid: { startDeg: 8, stepDeg: 1, count: 8 },
    counts: Uint32Array.of(10000, 10000, 10, 20, 40, 30, 10000, 10000),
    scale: 2,
  };
  assert.equal(plotScalePeak({ ...input, overlay }), 80);
});
