import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plotScalePeak } from './plot-scale.ts';

test('a zoomed comparison includes the inactive fit and keeps the scale when A and B swap', () => {
  // Deterministic plot data keeps this regression independent of engine noise seeds and fit convergence.
  const a = { calculated: [2000, 8, 11, 10, 2000] };
  const b = { calculated: [2000, 10, 180, 20, 2000] };
  const input = { grid: { startDeg: 10, stepDeg: 1, count: 5 }, counts: [2000, 9, 12, 10, 2000], view: { startDeg: 12, endDeg: 12 } };
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
