import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectionProgress } from './inspection-progress.ts';

const expected = ['HOLDER', 'HMI', 'ENCLOSURE'];

test('an extra historical component cannot block a complete current inspection', () => {
  assert.deepEqual(inspectionProgress(expected, ['HOLDER', 'HMI', 'SHUTTER', 'ENCLOSURE']), { count: 3, total: 3, complete: true });
});

test('stale keys and repeated observations do not substitute for an expected component', () => {
  assert.deepEqual(inspectionProgress(expected, ['HOLDER', 'HMI', 'SHUTTER']), { count: 2, total: 3, complete: false });
  assert.deepEqual(inspectionProgress(expected, ['HOLDER', 'HOLDER', 'HMI']), { count: 2, total: 3, complete: false });
  assert.deepEqual(inspectionProgress([], ['HOLDER', 'HMI', 'ENCLOSURE']), { count: 0, total: 0, complete: false });
});
