# MatterLab research basis

MatterLab is a fictional educational simulation. It is not a representation of a particular company, laboratory, instrument, or technician role. This document records the public sources that informed the simulation and distinguishes sourced facts from product-design interpretation.

## Operational-system boundaries

[ISA-95](https://www.isa.org/standards-and-publications/isa-standards/isa-95-standard), also published as IEC 62264, separates physical processes, sensing and control, supervisory control, manufacturing operations, and business planning. MatterLab uses that layered model to keep several kinds of evidence distinct:

- the physical machine, sample, utility connection, and safety boundary;
- local sensors, controllers, permissives, and interlocks;
- supervisory equipment state and operator controls;
- work execution, identity, maintenance, and result records; and
- downstream experiment planning.

## Characterization methods

| Method | What MatterLab emphasizes | Research basis |
| --- | --- | --- |
| Powder XRD | Sample preparation, holder state, position-reference QC, control limits, fit quality, and unassigned reflections | NIST lists powder-diffraction reference materials including [SRM 640f silicon powder for line position and line shape](https://www.nist.gov/mml/mmsd/standards-and-tools/reference-materials). |
| SEM/EDS | Field selection, stage and vacuum context, local elemental evidence, and the limits of treating one feature as bulk-representative | [Thermo Fisher's EDS overview](https://www.thermofisher.com/us/en/home/materials-science/elemental-analysis/technology.html) describes elemental analysis coupled with electron microscopy. MatterLab's representativeness requirement is a conservative design choice, not a claim from that page. |
| TGA/DSC | Pan identity, empty-pan behavior, thermal program, atmosphere, mass change, and heat-flow response | [TA Instruments' thermal-analysis training library](https://www.tainstruments.com/theory-applications-training-documents/) provides technique and application background. |
| BET surface area | Sample preparation and degassing, leak state, adsorbate identity, equilibrium, control material, and fit context | See the [Micromeritics BET overview](https://micromeritics.com/bet-surface-area-analyzers/) and NIST's listed [BET specific-surface-area reference materials](https://www.nist.gov/mml/mmsd/standards-and-tools/reference-materials). |

The simulated traces, values, tolerances, and failure cases are illustrative. They are not validated analytical methods or operating limits.

## XRD model

The XRD bench in `app/xrd/` generates each pattern from hidden sample state and analyses it from counts alone. Numbers below are the values the code defines.

### Reference structures

`scripts/build-references.ts` (`pnpm references`) reads the CIFs in `data/crystal-structures/` and writes `app/xrd/references.generated.ts`: reflections covering scans through 120° 2θ for all modeled Cu emissions (including Kβ), the 3° line-selection margin, and lattice scales through 1.01, cell contents, and each structure's literature citation. The build checks calculated reflections against the Pnma, Pbca, and Cmcm reflection conditions. Anisotropic U_ij or B_ij reduce to the equivalent isotropic value Ueq = ⅓ Σ Uⁱʲ a*ᵢ a*ⱼ (aᵢ · aⱼ) (R. X. Fischer and E. Tillmanns, Acta Cryst. C44 (1988) 775), which equals the mean of the diagonal only in orthogonal cells. Where a CIF gives no displacement parameter, or gives zero, the build assumes B = 0.5 Å² (1.5 Å² for H) and records the assumption.

| Phase | Source | Build notes |
| --- | --- | --- |
| CaTiO₃, Pnma | COD 1567488 | Converted from Pbnm to Pnma (a′ = b, b′ = c, c′ = a). |
| Rutile TiO₂, P4₂/mnm | COD 9004141 | |
| Anatase TiO₂, I4₁/amd | COD 9015929 | The CIF's anisotropic columns are mislabelled; B recomputed from the reordered diagonal: Ti 0.458 Å², O 0.568 Å². |
| CaO, Fm-3m | COD 9006694 | B assumed. |
| Ca(OH)₂, P-3m1 | COD 1008781 | |
| CaCO₃, R-3c | COD 1547350 | |
| Al₂O₃, R-3c | COD 1000032 | |
| Si, Fd-3m | COD 9011998 | Cell set to the NIST SRM 640f certified value a = 5.431144 Å at 22.5 °C. B = 0.469 Å² from C. Flensburg and R. F. Stewart, Phys. Rev. B 60 (1999) 284, [doi:10.1103/PhysRevB.60.284](https://doi.org/10.1103/PhysRevB.60.284). |
| ZrO₂, P2₁/c | COD 2108450 | |
| CaZrO₃, Pnma | COD 1532747 | Converted from Pcmn to Pnma (a′ = c, c′ = a). B assumed (reported as zero). |
| BaTiO₃, P4mm | COD 2100858 | The CIF lists no symmetry operations; the build script supplies P4mm. B assumed. |
| BaCO₃, Pnma | COD 9010928 | Converted from Pmcn to Pnma (a′ = c, b′ = a, c′ = b). |
| CaTi₂O₄, Cmcm | COD 1008077 | Converted from Bbmm to Cmcm (a′ = c, b′ = a, c′ = b). Early structure determination with R = 0.16. B assumed. |
| Ca₄Ti₃O₁₀, Pbca | Materials Project mp-15315, computed coordinates, CC BY 4.0 | DFT-relaxed coordinates in the experimental cell of Elcombe et al. (1991), Acta Cryst. B47, 305 (Pcab, b and c exchanged to Pbca). B assumed. Used only to generate samples. |

### Forward model

`synthesis.ts` turns a hidden synthesis history into phases. `measure.ts`, `profile.ts`, and `pattern.ts` turn phases, mount, and program into Poisson counts that name no phase.

- **Synthesis:** CaCO₃ + TiO₂ (+ ZrO₂) calcined in air, then stored. Subsolidus CaO–TiO₂ fields set the end state: Ca/Ti < 1 gives CaTiO₃ + TiO₂; 1 < Ca/Ti ≤ 4/3 gives CaTiO₃ + Ca₄Ti₃O₁₀. Rate constants are illustrative first-order game constants, not fitted kinetics. They follow trends: hotter, longer, reground, and finer-TiO₂ batches react further; coarse ZrO₂ dissolves slowly; Ca₄Ti₃O₁₀ needs higher temperatures than perovskite; free CaO hydrates, then carbonates, in humid storage; zirconia milling media add ZrO₂. Reacted Ti and Zr are allocated by their available moles; unreacted Zr remains zirconia, the pure-Ti RP phase cannot consume Zr, and the doped host uses a composition-dependent formula mass. Dissolved Zr expands the CaTiO₃ cell by 0.0005 per mol%.
- **Radiation:** Cu Kα1, λ = 1.5405929 Å (G. Hölzer et al., Phys. Rev. A 56 (1997) 4554, as used by the SRM 640f certificate), with Kα2 at 1.544426 Å (weight 0.5) and Kβ at 1.39225 Å (weight 0.01) through a Ni filter.
- **Intensity:** λ³/(32πV²ρ) · M|F|²·LP · w/μ* (Klug & Alexander, 1974), with LP = (1 + cos²2θ)/(sin²θ cosθ). March–Dollase preferred orientation applies to portlandite (001), calcite (104), and Ca₄Ti₃O₁₀ (001), less on back-loaded mounts.
- **Profile:** Thompson–Cox–Hastings pseudo-Voigt (J. Appl. Cryst. 20 (1987) 79). Gaussian width from Caglioti terms (G. Caglioti et al., 1958; U 0.004, V −0.002, W 0.002) and microstrain (4ε tanθ); Lorentzian width from X/cosθ (X 0.02) and Scherrer size (K = 0.9). A split profile widens the low-angle side below 90° 2θ. Each bin integrates the profile, so narrow peaks keep their area at any step.
- **Mount:** grinding scales grain size by 1.6 (as received), 0.7 (hand), or 0.3 (extended), with a 0.8 µm floor. Extended grinding of grains ≤ 4 µm shrinks crystallites (×0.6, 25 nm floor), adds 0.0006 microstrain, and adds amorphous surface (0.03 of the damaged share). Specimen displacement s is drawn per mount (SD 0.04 mm front-loaded, 0.02 mm back-loaded) and moves peaks by −2s cosθ/R with R = 240 mm. The instrument zero is drawn once per shift (SD 0.012°, clamped to ±0.03°).
- **Grain statistics:** each reflection gets a lognormal intensity factor with mean 1 and coefficient of variation min(0.6, 0.02 (grain size/10 µm)^1.5/√N), where N = (multiplicity/8) × weight fraction, ×4 when spinning. The factors stay fixed until a remount.
- **Internal standard:** a silicon (600 nm crystallites) or corundum (300 nm) spike at fraction 0.1, with no preferred orientation.
- **Background:** Compton and thermal diffuse scattering from each phase, an amorphous hump centred at 30° 2θ, air scatter decaying from 5° 2θ, and a fluorescence term scaled by Ti mass fraction plus a holder floor. Only the flux (3.2 × 10⁷), air scatter, and fluorescence constants are calibrated; the flux is set so a hand-ground CaTiO₃ survey peaks near 4000 counts.
- **Counting:** a 2.5° strip detector gives exposure = minutes × 2.5/(span + 2.5). Counts are Poisson draws (Knuth below mean 10, PTRS above; W. Hörmann, 1993) from an sfc32 generator seeded via splitmix32. A rescan redraws counting noise only.
- **Programs:** survey 10–80° at 0.02° for 6 min; standard 10–80° at 0.01° for 30 min; slow 10–80° at 0.01° for 120 min; wide 5–100° at 0.02° for 12 min; targeted ±1.5° around a chosen angle at 0.01° for 15 min. Each scan adds 2 min of handling.

### Analysis

`analysis.ts` reads the counts, recorded mount facts, and the candidates the player chose, never the specimen.

- **Linear fit:** Lawson–Hanson NNLS for non-negative phase scales on bin-integrated reference patterns, with an unconstrained background of five Chebyshev terms and two low-angle terms (a straight line for spans under 8°). Optional broad humps at 22, 30, and 38° 2θ take up diffuse scatter and are never reported as phases. Weights are 1/(N + 1), then 1/max(model, 1).
- **Nonlinear fit:** coarse scans over displacement (±0.45 mm) and lattice scale (0.994–1.006), then Levenberg–Marquardt within bounds: displacement ±0.6 mm, zero ±0.2° (fixed when a standard check measured it), lattice scale 0.99–1.01 (the spike cell stays fixed), crystallite size 20–3000 nm, microstrain 0–0.004. A second search starts again from the coarse values: with a refined zero it first holds the zero, then refines everything with microstrain searched as ε², rescans each lattice scale within ±0.006, and replaces the first result only when its deviance is lower. Uncertainties project the central-difference Jacobian against fitted phase scales, background, and active broad components before computing covariance, scaled by max(1, χ²ν); a checked zero (SD 0.002°) adds the lattice shift that follows it.
- **Phase status:** BIC-style evidence Δ = Δχ²/max(1, χ²ν) − k ln N_eff, with k = 4 for an ordinary phase (scale, lattice, size, strain) and k = 3 for a fixed-cell internal standard. Phase deletion refits linear terms while holding the remaining nonlinear parameters fixed, so this is a penalized fit heuristic rather than exact model-selection BIC. Unique Kα1 lines (at least 1% of the phase's strongest line, other phases at most 0.2 of it) are tested against Currie limits (L. A. Currie, Anal. Chem. 40 (1968) 586): L_C = 1.645√B, L_D = 2.71 + 3.29√B. Above Δ 10 a phase is required when a line is detected (predicted and net counts above L_C), otherwise overlapped. A zero scale is not detected; anything else is not required. A line predicted above L_D but observed below L_C is missing. Candidates whose weighted patterns have cosine > 0.95 are indistinguishable.
- **Residual:** the plot shows z = (obs − calc)/√max(calc, 1) per bin. Features are scanned in windows about one FWHM wide (at least 3 bins, half overlapping) with z = Σ(obs − calc)/√Σmax(calc, 1). Z_THRESHOLD = 4 flags a window, as do two halves that both reach |z| 4 with opposite signs.
- **Features:** position (|z| ≥ 3 on both sides of the modelled maximum, opposite signs); unexplained (excess at least the modelled peak); intensity (|excess| ≥ 0.15 of the modelled peak, reported as the grains limit); broad (2° windows outside narrow features, z divided by √max(1, χ²ν), |z| ≥ 6).
- **Limits:** counts when the strongest peak above the fitted background is under 3000 counts, an illustrative identification threshold used by the sim; sampling when points per FWHM (mid-range FWHM/step) fall below 3; missing lines when a phase misses 2 or more; overlap for overlapped or indistinguishable phases. Without an internal standard the fit also carries a shift-correlated warning.
- **ROBUST_Z = 5:** the code notes that counting noise reaches z 4 about once in twenty scans and almost never z 5. A call that leaves unexplained features unflagged is graded poor on support when one reaches z 5, mixed otherwise.
- **Comparison:** delta = Δdeviance/max(1, min χ²ν) + Δparameters × ln N_eff, from the Poisson deviance. B is much worse above 100, worse above 10, better below −10, much better below −100, and similar otherwise. Fit statistics serve comparison only and are never shown as confidence.

### Heuristic boundaries

- The intro pattern is a schematic. Reference preview heights are relative within one phase; barcode ticks mark positions only. Both candidate fits contribute to the plot scale.
- Zr substitution is an illustrative cell-expansion model: it retains the undoped host's structure factors and does not recompute Zr occupancies, atomic coordinates, or scattering intensities. The displayed Zr estimate is approximate, not a calibrated composition measurement.
- There is no Rietveld structure refinement. Atomic positions, occupancies, and displacement parameters stay at the reference values; only lattice scale, crystallite size, microstrain, displacement, and zero are refined.
- Weight fractions are indicative. `normalizedWeightFractions` (Hill & Howard, J. Appl. Cryst. 20 (1987) 467) is valid only when every crystalline phase is identified and nothing is amorphous; it validates the engine and is never shown to players. The debrief shows true phases only as major (> 0.2), minor (≥ 0.02), or trace (≥ 0.001) by weight fraction.
- **Probe:** a tap names library phases with a Kα1 line (at least 0.03 of the strongest) whose maximum could sit there: below the line by the largest displacement (the generator's normal-deviate limit × 0.04 mm), the ±0.03° zero clamp and the largest lattice scale any case gives that phase, evaluated at its exact expanded Bragg angle; above it by the displacement, the zero and the Kα2 pull on an unresolved doublet. Past that window a line's Kα2 or Kβ component, at least 0.01 of the strongest line after its emission weight, names the phase marked Kα2 or Kβ. It reads no sample state.
- **Shared lines:** lines of a fitted phase where the other phases put more than a fifth of its predicted counts are shared: counted as neither seen nor absent.
- **Detection reach:** for a candidate the fit did not need, the smallest scale at which a line of its own reaches the Currie L_D, as a share of the fitted crystalline phases' scales with the spike excluded (a scale is about weight fraction/μ of the mixture, so scale ratios approximate weight shares). Up to 0.005 reads as small amounts would show, above it only larger amounts would, and a phase with no line of its own in the scan has none. It says what amount would have shown in this scan, not a limit of detection for the powder, and it never rules a phase out.
- **Spacing reading:** Zr mol% from the host cell with the illustrative linear expansion of 0.0005 per mol% Zr, rounded and never below zero. It is shown only after a zero check or with a positive-scale, required spike having at least two detected unique lines and no missing lines, because a refined zero trades against the cell; for a Zr aim the debrief lets an earlier run settle the call only on the same condition.
- The search library covers the 13 catalogued COD phases only, limited to phases whose heavy elements are on record or confirmed unless the player broadens the search.
- Ca₄Ti₃O₁₀ has a computed structure but no library entry, so no fit can claim it. Its peaks stay unexplained, and a call can hold for a missing reference.
- Synthesis rate constants, bench minutes, powder amounts, instrument slots, and the 480-minute shift are illustrative game values.
- TGA is a qualitative model. It reports mass-loss steps, never phases, in fixed windows (adsorbed water 40–160 °C, portlandite 390–480 °C, calcite 650–800 °C, or 600–730 °C for crystallites under 50 nm), with temperatures jittered in 5 °C steps, 0.03% loss noise, and a 0.1% detection limit applied before rounding the displayed loss.
- SEM/EDS is a qualitative model. It reports elements as major (≥ 10 wt%), minor (≥ 1 wt%), or trace (≥ 0.3 wt%) after about 25% lognormal scatter, plus 8 particle spots, carbon from tape, an Al stub signal with probability 0.35, and Ba unresolved under Ti when Ti ≥ 1 wt% and Ba < 10 wt%. It returns no images or quantities.

## Autonomous-laboratory precedent

The primary precedent is Szymanski et al., [“An autonomous laboratory for the accelerated synthesis of inorganic materials”](https://doi.org/10.1038/s41586-023-06734-w), *Nature* 624, 86–91 (2023).

The published A-Lab combined precursor preparation, robotic transfers, multiple furnaces, powder handling, XRD characterization, automated phase analysis, and follow-up experiment planning. The paper also documents operational work that remained manual: loading consumables and precursor bottles, cleaning depleted XRD holders, refilling powders, and resolving hardware exceptions.

The study further reports that automated XRD interpretation was useful for guiding synthesis but could be inconclusive for multiphase materials. Reported successes were later checked with manual refinement, and several claims were judged inconclusive from XRD alone. The article page links a correction published in 2026; readers should consult the current version of record.

MatterLab draws three design inferences from this precedent:

1. Automation does not remove physical preparation, replenishment, maintenance, or exception handling.
2. A measurement can be technically acquired while still lacking sufficient context for scientific reuse.
3. Experiment-planning software should receive governed evidence rather than silently interpreting every instrument output as valid training data.

These are MatterLab design conclusions, not quoted requirements from the A-Lab authors.

## Spatial implementation references

The 3D laboratory is built with Three.js, React Three Fiber, and Drei. The [Three.js fundamentals guide](https://threejs.org/manual/en/fundamentals.html) informed the scene, camera, lighting, mesh, and material structure. Equipment is represented as hierarchical scene objects so that selection, articulated parts, inspection hotspots, state-dependent materials, and carrier motion can share one spatial model.

Early visual prototyping also reviewed Dilum Sanjaya's public [hexapod robot simulator](https://github.com/dilums/hexapod-robot-simulator) and [AI SDK + Three.js starter](https://github.com/dilums/aisdk-threejs-starter). MatterLab retains the general scene-first principle while using original laboratory geometry, interaction design, and styling.

## Scope and safety

Sources inform the simulation's concepts, not the safe operation of real equipment. MatterLab deliberately omits hazardous-process instructions and vendor-specific control procedures. Real work requires applicable SOPs, training, risk assessment, interlocks, and manufacturer documentation.

### Equipment presentation

The seven 3D stations and local walkthrough checks are schematic. Only the XRD bench and its requested follow-ups generate sample measurements; the walkthrough does not calibrate or operate physical hardware. The visible XRD beam path appears only during simulated acquisition. XRD activity does not imply a furnace run or a robot transfer. The tour restores the September 1 continuous 24-second camera/target spline and field-of-view easing through the full facility, with pause and exit controls. The tour applies its historical overview framing bounds directly, independent of the currently selected camera mode; live OrbitControls remain unmounted during the animation.

The qualitative EDS model treats unresolved Ba/Ti overlap consistently across area and particle results. Its 1% Ti / 10% Ba ambiguity rule is an illustrative threshold: standards-based full-spectrum fitting can resolve difficult overlaps in real EDS ([Mengason and Ritchie, 2017](https://www.nist.gov/publications/overcoming-peak-overlaps-titanium-and-vanadium-bearing-materials-multiple-linear-least)). “Remake with agate” replays the precursor history with different milling media; it does not remove Zr already present in a powder.
