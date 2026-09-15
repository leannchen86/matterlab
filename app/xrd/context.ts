// Chemical context the player can actually know: elements listed in the sample record, plus elements confirmed by a
// revealed notebook cue or by EDS. Records can be wrong or incomplete, so the library search can always be broadened; a
// phase whose elements lack support may still fit well, but a call that relies on it is not chemically supported.
import type { ElementSymbol } from './elements.ts';
import { LIBRARY_PHASE_IDS, catalogPhase, searchLibrary } from './phases.ts';

export type ElementSource = 'record' | 'notebook' | 'eds';
export type ElementEvidence = { readonly element: ElementSymbol; readonly source: ElementSource };

/** Records and EDS handle H, C and O poorly, so support is judged on the heavier elements only. */
const LIGHT: ReadonlySet<ElementSymbol> = new Set<ElementSymbol>(['H', 'C', 'O']);

export function supportedElements(evidence: readonly ElementEvidence[]): ElementSymbol[] {
  return [...new Set(evidence.map((item) => item.element))].sort();
}

/** Library phases consistent with the supported elements, or the whole library when the search is broadened. */
export function candidateLibrary(evidence: readonly ElementEvidence[], broaden: boolean): string[] {
  return broaden ? [...LIBRARY_PHASE_IDS] : searchLibrary(supportedElements(evidence));
}

export type ChemicalSupport = {
  readonly supported: boolean;
  /** Heavy elements of the phase that no record, cue or EDS result supports. */
  readonly unsupported: readonly ElementSymbol[];
};

export function chemicalSupport(phaseId: string, evidence: readonly ElementEvidence[]): ChemicalSupport {
  const unsupported = catalogPhase(phaseId).elements.filter((element) => !LIGHT.has(element) && !evidence.some((item) => item.element === element));
  return { supported: unsupported.length === 0, unsupported };
}
