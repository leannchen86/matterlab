# MatterLab realism audit — 17 September 2026

**Later update:** The user subsequently requested removal of the Tour option. Its UI and animation have been removed; manual Overview, Walk Aisle and Focus remain. The tour notes below describe the audit history, not an available feature.

Baseline: `252852b`; resulting simulation: `xrd-engine-4`, reference library `refs-3cfb0e4e`.

This audit covers all seven sample histories, all fourteen crystallographic references, peak generation and fitting, chemical follow-ups, plot semantics, saved-session behavior, and the seven-station 3D interface. It extends the earlier independent CIF/peak audit and its fixes. The simulator remains an educational model, not a validated predictor of experimental results.

## Confirmed defects corrected

| Area | Defect | Correction |
| --- | --- | --- |
| Reference coverage | The generator cut off at Cu Kα1 120°, excluding allowed high-angle Kβ reflections. | Generate using the shortest modeled wavelength, 3° edge margin, and maximum supported lattice expansion. Silicon 620 at 108.316242° and 533 at 114.382811° now appear. |
| Phase evidence | Ordinary phases paid a three-parameter penalty despite fitting scale, cell, size and strain. | Four parameters per ordinary phase; three for a fixed-cell standard. Correct total parameter count and reduced χ². |
| Uncertainty | Lattice covariance held fitted amplitudes/background fixed. | Project final derivatives against active linear nuisance terms before calculating covariance. Optimization and fitted parameters are unchanged by this correction. |
| Chemistry | CaTi₂O₄ was given an imprecise titanate name. | Use calcium titanium(III) oxide, consistent with charge balance and its source CIF. |
| Follow-up interpretation | A weak Ba signal could be both unresolved by Ti overlap and counted as confirmed. | Apply the same ambiguity rule to area and particle spectra; an independently Ba-rich particle can establish Ba. Label the ambiguity “Ba / Ti OVERLAP,” not an asserted Ba detection. |
| Remediation | “Agate media” implied remilling could remove existing contamination. | “Remake with agate” explicitly remakes the batch from the precursor history. |
| Intro | Isolated colored ticks and a question mark had no clear meaning. | Label the powder trace and reference A/B rows; label the unexplained peak; explicitly identify the graphic as schematic. |
| Tour | OrbitControls kept updating and clamping a separately directed camera; interpolated paths passed through equipment. | Remove OrbitControls during directed views. Use stable, fully framed instrument views with fades, pause and previous/next controls. Camera/station selection exits the tour. |
| Walking | Furnace spawn overlapped the gas bay; button focus could disable movement. | Move spawn to a clear aisle, allow movement after navigation buttons, and suppress movement behind modal dialogs. |
| Inspection | Changing XRD component keys and exact checklist lengths could lock a completed inspection. | Stable component identity, count only expected unique keys, and refresh displayed observations when instrument phase changes. |
| Visual state | Idle XRD showed a beam, and sample routing suggested unrelated operations followed XRD progress. | Show the schematic beam only during acquisition; remove automatic routing tied to XRD phase. Mark local consoles as illustrative walkthroughs. |
| Persistence | Completed calls depended on the bench remaining mounted; reload left the lab apparently unused. | Page-owned restoration and asynchronous completion; reject superseded results by operation and seed. Settle old animations before commit. |
| Other controls | Uncertainty was mislabeled as a hold; one new-shift path bypassed confirmation; plot shortcuts intercepted browser zoom. | Explicit held state, consistent new-shift confirmation, and preserve modified browser shortcuts. |
| Entry | “OPEN XRD LAB” was unnecessarily long. | “OPEN XRD.” |

## Validation evidence

- Independently recomputed all fourteen raw-CIF Kβ patterns with pymatgen over 5–120°. No missing or extra lines above 1% of maximum; largest strong-peak position difference **0.000117°**, consistent with stored rounding. The earlier Kα reference audit remains valid.
- Reference library expanded from **1,842 to 2,664 reflections**. Every previous reflection entry is preserved exactly. Holding grain factors fixed leaves survey expected counts unchanged for all fourteen references; supported high-angle scans gain the missing reflections.
- A noiseless 1.7%-relative rutile fixture demonstrates the evidence correction: Δ falls from about 12.00 to 5.27, so that weak addition is no longer labeled required solely because its complexity was undercounted.
- Independent NumPy covariance calculations across six scans agree with the projected calculation to approximately 1e-11 relative. In the tested S-130 close-up, baddeleyite lattice uncertainty increased about 30%, host uncertainty about 7.7%.
- All seven sample histories conserve Ca/Ti/Zr. Regression cases cover partial reaction and Ca/Ti-limited mixtures, EDS ambiguity, and remaking with agate while retaining deliberately added Zr. The EDS change preserves all **700** current-case/seed outputs checked.
- Navigation geometry checks cover all seven spawn points, room bounds, camera constraints and four walking directions. The previous furnace spawn allowed zero of four ordinary keyboard steps; the corrected spawn is clear.
- Browser checks cover all seven tour stop renderings, pause/manual stepping/overview exit, the revised intro at desktop and phone-width layout, OPEN XRD, scanning/fitting, and persisted presentation.
- `pnpm check`: **94/94 tests**, TypeScript and ESLint pass. `pnpm build:pages`: production build passes; the existing large 3D chunk warning remains.
- Automated regression checks include saved calls completed without a mounted bench, a later scan or new shift superseding an outstanding result, and an older run deliberately used as a call basis.

## Boundaries retained explicitly

- Reaction constants, wear rates, humidity effects and process durations are illustrative, not experimentally fitted kinetics.
- Zr substitution uses scalar cell expansion with the original host structure factors. Composition estimates remain approximate; atomic coordinates and occupancies are not refined.
- The phase evidence is **BIC-style**, not exact BIC: deletion re-solves linear terms while keeping other nonlinear parameters fixed. It is not a probability or confidence level.
- Qualitative EDS overlap/detection thresholds are educational choices. Real standards-based full-spectrum fitting can resolve difficult overlaps. TGA losses support water/carbonate interpretations without uniquely identifying phases.
- Peak profiles use finite numerical windows and an existing 3° reflection-selection margin. A 56-case/window comparison found at most 0.0423% integrated profile difference from this approximation; no claim of infinite-tail exactness is made.
- Equipment geometry, screens and walkthrough checks are schematic. The visible beam is a diagram, not a visible physical X-ray beam. The tour isolates each featured station for inspection.

Because reference coverage changes deterministic grain/noise seeds, engine 4 starts a fresh shift. The existing migration keeps the previous action log in browser storage under the previous-session key rather than replaying it into different measurements.

## Scientific sources

- [Schwarz (1978), model dimension penalty](https://sites.stat.washington.edu/courses/stat527/s14/readings/ann_stat1978.pdf).
- [IUCr Rietveld refinement guidelines](https://journals.iucr.org/j/issues/1999/01/00/gl0561/), including parameter correlations and uncertainties.
- Source CIFs and full provenance are tracked in `data/crystal-structures/` and generated reference metadata. CaTi₂O₄: Bertaut and Blum, Acta Crystallographica 9, 121–126 (1956), [DOI](https://doi.org/10.1107/S0365110X56003132).
- [NIST, Mengason and Ritchie (2017)](https://www.nist.gov/publications/overcoming-peak-overlaps-titanium-and-vanadium-bearing-materials-multiple-linear-least), resolving EDS peak overlaps with standards-based analysis.
- [Three.js OrbitControls](https://threejs.org/docs/pages/OrbitControls.html), camera updates and distance/angle constraints.
