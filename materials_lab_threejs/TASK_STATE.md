# MatterLab task state

Status: complete and validated.

## Environment audit

- Host: macOS on Apple M2 Pro, 19 GPU cores, Metal supported.
- System Node reported 18.18.2, below the project requirement.
- Codex bundled runtime Node 24.19.0 is used for typecheck and builds.
- Project: existing Vinext/React 19/Three.js 0.185 application with a Sites hosting configuration.

## Conservative decisions

1. Preserve the working React Three Fiber architecture instead of rewriting a mature demo to vanilla Three.js. The renderer still uses Three.js, Three addons, WebGL2-capable paths, and the requested PBR/post stack.
2. Keep the high-bay 4.7–5.0 m service zone because the room contains robotics, overhead cable routing, and suspended fixtures. Ordinary work surfaces and eye height remain human-scale.
3. Use procedural assets only. No external GLTF or optional texture dependency was introduced.
4. Add deterministic review mode through a query parameter instead of exposing production-facing debug controls.
5. Keep the existing GitHub Pages build while also validating the Vinext/Sites build.

## Completed

- [x] Runtime and GPU inspection
- [x] Art direction, spatial plan, asset inventory, acceptance rubric
- [x] Frozen 16-camera judgeset
- [x] Full-room, instrument-family, safety, utility and staging coverage
- [x] Replayable cinematic camera spline
- [x] ACES exposure correction, SSAO, thresholded bloom and FXAA
- [x] Human-scale technician proxy
- [x] Review cycles 1–6 captured and diagnosed
- [x] Suspended ceiling service grid, fixture drops and facility identity sign
- [x] Physical equipment plates, utility termination boxes and floor-level umbilicals for all seven machines
- [x] TypeScript, ESLint, static Pages build and Vinext/Sites build
- [x] Desktop fixed-camera and 390 × 844 mobile cinematic-tour verification

## Release result

The final judgeset has no critical defects. White housings retain edge definition, close judges show the intended instrument family without foreground occlusion, every machine carries a readable physical identity and service story, overhead fixtures have credible support, the safety boundary is unobstructed, and the cinematic controls remain usable at the mobile breakpoint.
