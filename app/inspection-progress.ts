/** Inspection credit belongs to expected component keys, not the length of a historical checklist. */
export function inspectionProgress(expectedLabels: readonly string[], checkedLabels: readonly string[]) {
  const expected = new Set(expectedLabels);
  const checked = new Set(checkedLabels);
  const count = [...expected].filter((label) => checked.has(label)).length;
  return { count, total: expected.size, complete: expected.size > 0 && count === expected.size };
}
