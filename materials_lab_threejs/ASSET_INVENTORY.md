# MatterLab asset inventory

All visual assets are procedural React Three Fiber / Three.js geometry; play does not depend on external GLTF or texture packs.

## Architecture and infrastructure

- Epoxy floor plate, measured grid, back and left walls
- Eight ceiling task fixtures plus back-wall strip lighting
- Galvanized ceiling service grid with paired fixture suspension drops and utility risers
- Branded MatterLab bay identity sign with procedural high-resolution face texture
- Overhead cable tray, service drops, gas/vacuum manifolds, wall panels
- Emergency shower/eyewash, emergency control, fire extinguisher, oxygen monitor
- Personnel door, keep-clear markings, fencing and station platforms
- 1.75 m technician scale proxy

## Instruments

- PREP-01 ventilated powder hood, balance, sample boats, charge, spatula and extraction
- ROBO-02 articulated robot, end effector, guarded enclosure, carrier and local controls
- FURN-04 box furnace, door, chamber, controller and quarantine support
- XRD-03 enclosed diffractometer, goniometer cues, holder and local HMI
- SEM-01 column, chamber, stage, EDS detector, vacuum support and workstation
- BET-02 analysis ports, manifold, sample tubes, dewar/vacuum equipment and gas service
- TGA-01 furnace, paired pans, balance head, autosampler carousel and purge routing
- Seven bolted physical equipment plates carrying formal name, sample interface and utility specification
- Seven local service termination boxes with color-coded floor umbilicals

## Operations and small props

- Mobile sample cart, powered pallet jack, point-of-use rack or staging carousel
- Campaign backlog rack, retained sample containers, crucibles, liners and carbon tabs
- Gas cylinders, regulator frames, support carts, control pendants and stack lights
- Generated screen content, diffraction/spectrum/micrograph visualizations and local status panels

## Rendering and interaction

- ACESFilmic, sRGB output, PBR materials, environment lightformers
- Directional and practical lights, percentage-filtered shadow maps in focus views
- EffectComposer with SSAO, thresholded UnrealBloom, FXAA and OutputPass
- Orbit, technician-scale walk collision, station focus, inspection pins and cinematic spline tour
- Sixteen deterministic review cameras selected with `?camera=C01` through `?camera=C16`
