# GDTF Stage Lighting Rig Viewer

A browser-based 3D visualiser for stage lighting professionals. Load an `.mvr` file to see trusses and lighting fixtures rendered in 3D — entirely client-side, nothing is uploaded to any server.

## Standards

| Standard | Description |
|---|---|
| **GDTF** DIN SPEC 15800:2022-02 v1.2 | General Device Type Format — fixture type definitions (geometry, DMX, 3D models) |
| **MVR** DIN SPEC 15801:2023-12 v1.6 | My Virtual Rig — complete scene description (fixture placement, patching, layers) |

## File formats

- **`.mvr`** — ZIP archive containing `GeneralSceneDescription.xml` + embedded `.gdtf` files + optional geometry/textures
- **`.gdtf`** — ZIP archive containing `description.xml` + `models/gltf/*.glb` + `models/3ds/*.3ds` + `wheels/*.png`

### GDTF coordinate system
Right-handed Cartesian, Z-up, metric:
- X → stage right
- Y → into the stage (upstage)
- Z → up

### MVR transformation matrices
Each scene object carries a 4×4 matrix in `{u}{v}{w}{o}` format (mm):
- `u` = right vector (local X)
- `v` = up vector (local Y in MVR Z-up space)
- `w` = at/look-at vector (local Z)
- `o` = origin/translation (millimetres)

## Features

- Drag-and-drop `.mvr` file load (or click Browse)
- Demo concert rig scene (no file needed)
- 3D rendering via Three.js / WebGL
  - Loads embedded GLB/GLTF fixture models from GDTF archives
  - Falls back to procedural placeholder geometry when no model present
  - Trusses, moving heads, PAR fixtures, video screens, focus points
- Layer visibility toggles
- Multiple camera views: orbit, top, front, side (keyboard: T / F / S / R)
- Click-to-select with properties panel (name, DMX address, GDTF type, position)
- Scene statistics panel
- Light beam cone visualisation toggle
- Runs fully offline — all processing is in-browser

## Development

```bash
npm install
npm run dev      # Dev server at http://localhost:5173
npm run build    # Production build → dist/
```

## Tech stack

| Library | Role |
|---|---|
| [Three.js](https://threejs.org) | WebGL 3D renderer |
| [JSZip](https://stuk.github.io/jszip/) | Read `.mvr` and `.gdtf` ZIP archives in-browser |
| [Vite](https://vitejs.dev) | Build tool & dev server |
| TypeScript | Type safety throughout |

## Architecture

```
src/
├── main.ts           Entry point
├── types.ts          TypeScript interfaces for MVR & GDTF data
├── mvr-parser.ts     Unzip .mvr → parse GeneralSceneDescription.xml → MvrScene
├── gdtf-parser.ts    Unzip .gdtf → parse description.xml → GdtfFixtureType + model bytes
├── scene-builder.ts  MvrScene + GdtfFixtureType[] → Three.js Group hierarchy
├── viewer.ts         Three.js renderer, camera, OrbitControls, raycasting
├── demo-scene.ts     Synthetic MVR scene generator for demo mode
├── ui.ts             DOM event wiring, scene tree, properties panel
└── style.css         Dark-theme CSS
```

## MVR spec resources

- Specification: <https://github.com/mvrdevelopment/spec/blob/main/mvr-spec.md>
- GDTF specification: <https://github.com/mvrdevelopment/spec/blob/main/gdtf-spec.md>
- GDTF Share (fixture library): <https://gdtf-share.com>
- GDTF Hub: <https://www.gdtf.eu>
