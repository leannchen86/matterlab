# MatterLab research basis

MatterLab is a fictional educational simulation. It is not a representation of a particular company, laboratory, instrument, or technician role. This document records the public sources that informed the simulation and distinguishes sourced facts from product-design interpretation.

## Operational-system boundaries

[ISA-95](https://www.isa.org/standards-and-publications/isa-standards/isa-95-standard), also published as IEC 62264, separates physical processes, sensing and control, supervisory control, manufacturing operations, and business planning. MatterLab uses that layered model to keep several kinds of evidence distinct:

- the physical machine, sample, utility connection, and safety boundary;
- local sensors, controllers, permissives, and interlocks;
- supervisory equipment state and operator controls;
- work execution, identity, maintenance, and result records; and
- downstream experiment planning.

The labels **LIMS**, **LES**, **MES**, and **SCADA** are simplified workstation concepts in the simulation. They do not claim exact ISA-95 placement, interoperability, or fidelity to a specific commercial system.

## Characterization methods

| Method | What MatterLab emphasizes | Research basis |
| --- | --- | --- |
| Powder XRD | Sample preparation, holder state, position-reference QC, control limits, fit quality, and unassigned reflections | NIST lists powder-diffraction reference materials including [SRM 640f silicon powder for line position and line shape](https://www.nist.gov/mml/mmsd/standards-and-tools/reference-materials). |
| SEM/EDS | Field selection, stage and vacuum context, local elemental evidence, and the limits of treating one feature as bulk-representative | [Thermo Fisher's EDS overview](https://www.thermofisher.com/us/en/home/materials-science/elemental-analysis/technology.html) describes elemental analysis coupled with electron microscopy. MatterLab's representativeness requirement is a conservative design choice, not a claim from that page. |
| TGA/DSC | Pan identity, empty-pan behavior, thermal program, atmosphere, mass change, and heat-flow response | [TA Instruments' thermal-analysis training library](https://www.tainstruments.com/theory-applications-training-documents/) provides technique and application background. |
| BET surface area | Sample preparation and degassing, leak state, adsorbate identity, equilibrium, control material, and fit context | See the [Micromeritics BET overview](https://micromeritics.com/bet-surface-area-analyzers/) and NIST's listed [BET specific-surface-area reference materials](https://www.nist.gov/mml/mmsd/standards-and-tools/reference-materials). |

The simulated traces, values, tolerances, and failure cases are illustrative. They are not validated analytical methods or operating limits.

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
