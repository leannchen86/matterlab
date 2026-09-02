# MatterLab measured spatial plan

The modeled floor plate is 15.0 m × 13.5 m. The back wall spans 14.4 m; the left service wall spans 8.7 m. The scene is a high-bay robotics and characterization room, so the 4.7–5.0 m service/lighting zone is an intentional exception to the 2.7–3.2 m general-lab ceiling target. Technician work surfaces and inspection controls stay at ordinary human scale.

## Station grid

| Bay | Center (x, z), m | Primary envelope | Notes |
| --- | --- | --- | --- |
| PREP-01 | -5.25, -2.15 | 3.44 × 3.16 m | Ventilated prep, balance, extraction, sample tools |
| ROBO-02 | -1.75, -2.15 | 3.44 × 3.16 m | Guarded articulated workcell and keep-clear zone |
| FURN-04 | 1.75, -2.15 | 3.44 × 3.16 m | Furnace, local controller, egress-side safety hardware |
| XRD-03 | -5.25, 1.75 | 3.44 × 3.16 m | Enclosed powder XRD and local load/control area |
| SEM-01 | -1.75, 1.75 | 3.44 × 3.16 m | Column, chamber, EDS detector, workstation |
| BET-02 | 1.75, 1.75 | 3.44 × 3.16 m | Manifold, sample tubes, vacuum and gas boundary |
| TGA-01 | 1.75, 5.35 | 3.44 × 3.16 m | Thermal analyzer, pan area, carousel and purge |

## Circulation and scale

- Main technician sightline runs from z ≈ 10.7 m toward the center bay at a 1.68 m eye height.
- Walk navigation uses station collision envelopes plus cart, pallet jack, service bay, and staging obstacles.
- A 1.75 m technician proxy stands near the front-right aisle in wide views.
- Benches and instrument stands land between 0.84 and 0.92 m where human interaction occurs.
- Emergency shower/eyewash and emergency-control routes are kept at the left wall; fire extinguisher, oxygen monitor, and utilities occupy the back-right boundary.

The frozen view definitions live in `cameras.json`. C01–C04 and C15–C16 judge the whole room; C05–C11 judge instrument families; C12–C14 judge safety, utilities, and material staging.

