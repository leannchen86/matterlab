# Fixed-camera review log

The judgeset is frozen by camera ID and purpose in `cameras.json`. All screenshots use a 1440 × 900 viewport. Severity is critical, major, moderate, or minor.

## Cycle 1 — baseline rig and post stack

Mean score: 6.4 / 10.

| Camera | Evidence | Severity | Subsystem | Root cause | Fix |
| --- | --- | --- | --- | --- | --- |
| C01 | `review/cycle_1/C01.png` | major | lighting | Existing bright lab lighting combined with the new post pipeline clipped white housings | Reduced exposure, ambient/practical intensity and bloom contribution |
| C04 | `review/cycle_1/C04.png` | major | lighting | Ceiling fixtures and instrument shells lost edge definition | Lowered emissive intensity and practical-light power |
| C12 | `review/cycle_1/C12.png` | moderate | camera | Safety target was dominated by an empty wall and neighboring XRD | Repositioned toward the left safety boundary |
| C16 | `review/cycle_1/C16.png` | moderate | composition | Too much neutral surround weakened the lab silhouette | Moved closer, lowered camera, tightened FOV |

## Cycle 2 — exposure, scale and wide composition

Mean score: 7.8 / 10.

| Camera | Evidence | Severity | Subsystem | Root cause | Fix |
| --- | --- | --- | --- | --- | --- |
| C04 | `review/cycle_2/C04.png` | moderate | scale | Room had no explicit human reference | Added a 1.75 m technician proxy and moved it fully into frame |
| C05–C11 | `review/cycle_2/C05.png` | major | camera | Neighboring stations occluded the intended instrument family | Added per-camera station isolation for family judges |
| C12 | `review/cycle_2/C12.png` | moderate | camera | XRD still dominated the safety view | Tightened and moved the camera inside the left boundary |

## Cycle 3 — isolated instrument judges

Mean score: 8.5 / 10.

| Camera | Evidence | Severity | Subsystem | Root cause | Fix |
| --- | --- | --- | --- | --- | --- |
| C05–C10 | `review/cycle_3/C05.png` | moderate | composition | Isolated assets were correct but too small against the full measured room | Reduced camera-to-target distance and slightly widened FOV to protect framing |
| C11 | `review/cycle_3/C11.png` | moderate | composition | TGA judge included excessive empty floor | Moved to technician-height close range |
| C12 | `review/cycle_3/C12.png` | moderate | safety view | The approach line still crossed the XRD foreground | Moved camera behind the left instrument row and aimed directly at the shower/control boundary |

## Cycle 4 — final

Mean score: 9.0 / 10.

| Camera | Evidence | Severity | Subsystem | Result |
| --- | --- | --- | --- | --- |
| C01–C04 | `review/cycle_4/C01.png` | pass | full room | Circulation, high-bay shell, human scale and instrument families remain legible |
| C05–C11 | `review/cycle_4/C05.png` | pass | instruments | Each primary asset is isolated, framed, materially separated and grounded |
| C12–C14 | `review/cycle_4/C12.png` | pass | operations | Safety, utilities and staging views are unobstructed and purpose-specific |
| C15–C16 | `review/cycle_4/C15.png` | pass | hero views | Operational density and depth hierarchy hold without clipped primary assets |

No critical or major defect remains. Minor limitation: the high-bay fixtures are intentionally visible as a cutaway ceiling/service zone in overview cameras.
