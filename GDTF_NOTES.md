# GDTF & MVR: Technical Notes

## What Is GDTF?

**General Device Type Format (GDTF)** is an open standard (DIN SPEC 15800) for machine-readable descriptions of controllable entertainment industry devices — primarily lighting fixtures, but also fog machines, lasers, media servers, trusses, and distribution boxes.

Developed jointly by **MA Lighting, Robe Lighting, and Vectorworks**. The spec is maintained openly at [github.com/mvrdevelopment/spec](https://github.com/mvrdevelopment/spec). Current published version: **DIN SPEC 15800:2022-02 (v1.2)**.

**GDTF Share** ([gdtf-share.com](https://gdtf-share.com)) is the central public repository — over 10,000 files from ~100 manufacturers. Also hosts the GDTF Builder (web editor) and GDTF Bench (quality checker).

---

## File Format

A `.gdtf` file is a **ZIP archive**. Rename to `.zip` and open with any tool.

### Naming Convention
```
<Manufacturer>@<FixtureName>@<OptionalComment>.gdtf
```
e.g. `Robe@Robin_MMX_WashBeam.gdtf`

### Archive Contents
```
Robe@Robin_MMX_WashBeam.gdtf  (ZIP)
├── description.xml          ← mandatory, UTF-8, the whole fixture definition
├── thumbnail.png            ← optional, max 1024×1024
├── thumbnail.svg            ← optional
├── wheels/                  ← gobo/color images (PNG)
└── models/
    ├── 3ds/                 ← 3DS meshes (legacy, still required)
    ├── 3ds_low/             ← ≤30% vertex count of standard
    ├── 3ds_high/            ← no vertex limit
    ├── gltf/                ← GLB files (preferred since v1.2)
    ├── gltf_low/
    ├── gltf_high/
    ├── svg/                 ← top-view 2D vector (1:1, mm units)
    ├── svg_side/
    └── svg_front/
```

Standard LOD vertex limit: **1200 vertices** per fixture.

### description.xml Root
```xml
<?xml version="1.0" encoding="UTF-8"?>
<GDTF DataVersion="1.2">
  <FixtureType Name="..." ShortName="..." Manufacturer="..."
               FixtureTypeID="RFC-4122-UUID" ...>
    <AttributeDefinitions/>  <!-- required -->
    <Wheels/>
    <PhysicalDescriptions/>
    <Models/>
    <Geometries/>            <!-- required -->
    <DMXModes/>              <!-- required -->
    <Revisions/>
    <FTPresets/>
    <Protocols/>
  </FixtureType>
</GDTF>
```

---

## Coordinate System

Both GDTF and MVR use the **same** coordinate system:

- **Right-handed, Z-up**
- X: left (−) → right (+)
- Y: toward audience (−) → into stage (+)  *(depth/forward)*
- Z: down (−) → up (+)
- **Origin**: center of device base plate
- **Units**: millimetres
- Fixtures modelled in **hanging position** (as if suspended from a truss)
- **Rotation**: right-hand rule, CCW when looking from positive axis direction
- Matrix storage: row-major, but mathematically column-major (rotation in columns)

---

## Geometry Types

Geometries form a tree describing the physical hierarchy of the fixture.

| Node | Type | Notes |
|---|---|---|
| `<Geometry>` | Generic | General-purpose |
| `<Axis>` | Rotating axis | Yoke, head — parts that rotate |
| `<Beam>` | **Light output** | Origin of rendered beam cone |
| `<Laser>` | Laser output | Has wavelength, divergence, scan angles |
| `<FilterBeam>` | Barn doors / iris | Named "BarnDoor" or "Iris" |
| `<FilterColor>` | Color filter | Named "FilterColor" |
| `<FilterGobo>` | Gobo wheel housing | Named "FilterGobo" |
| `<FilterShaper>` | Frame/shaper | Named "Shaper" |
| `<Display>` | Video screen on fixture | Self-emitting surface |
| `<GeometryReference>` | Pixel instance | Re-use geometry with DMX offset per instance |
| `<WiringObject>` | Connectors (v1.2) | Internal power/data connectors |
| `<Structure>` | Frame/truss internal | StructureType: CenterLineBased/Truss; CrossSectionType: Box/Tube |
| `<Support>` | Hoist/ground support | SupportType: Rope/GroundSupport |
| `<MediaServerLayer/Camera/Master>` | Media devices | |
| `<Inventory>` | Replaceable parts | Rain covers, etc. |
| `<Magnet>` | Attachment point | |

### Beam Geometry Attributes
- `LampType`: Discharge / Tungsten / Halogen / LED
- `BeamType`: Wash / Spot / Rectangle / PC / Fresnel / Glow / None
- `BeamAngle`, `FieldAngle` (degrees)
- `LuminousFlux` (lumens), `ColorTemperature` (K), `PowerConsumption` (W)
- Rectangle type adds `ThrowRatio`, `RectangleRatio`

### GeometryReference (LED pixel arrays)
Used to instance a pixel geometry many times. Each instance has `<Break>` children with `DMXOffset` to give each pixel its own DMX address:
```xml
<GeometryReference Geometry="Pixel" Position="{...}">
  <Break DMXBreak="1" DMXOffset="4"/>
</GeometryReference>
```

---

## DMX Channel Hierarchy

```
DMXModes
└── DMXMode (Name, Geometry)
    └── DMXChannels
        └── DMXChannel (DMXBreak, Offset, Default, Highlight, Geometry)
            └── LogicalChannel (Attribute, Snap, Master, MibFade)
                └── ChannelFunction (Attribute, DMXFrom, PhysicalFrom, PhysicalTo, ...)
                    ├── ChannelSet (Name, DMXFrom, WheelSlotIndex)
                    └── SubChannelSet
```

- **DMXBreak**: which start-address group (integer, or `"Overwrite"` for geometry references)
- **Offset**: relative byte position; multi-byte = 16/24/32-bit channel
- Resolutions: 8-bit, 16-bit, 24-bit, 32-bit, Virtual (no physical address)
- **Relations**: `Multiply` (master scales follower) or `Override`
- **Macros**: manufacturer DMX sequences (lamp strike, reset, etc.)

### Common Attributes

| Attribute | Description |
|---|---|
| `Dimmer` | Intensity |
| `Pan` / `Tilt` | Rotation axes |
| `ColorAdd_R/G/B/C/M/Y/W` | Additive color mixing |
| `ColorSub_R/G/B/C/M/Y` | Subtractive color filter |
| `CTO` / `CTB` | Color temperature offset |
| `Gobo(n)` | Gobo wheel selection |
| `Shutter(n)` | Open/close/strobe |
| `Iris` | Beam diameter |
| `Zoom` | Beam angle |
| `Focus(n)` | Edge sharpness |
| `Prism(n)` | Prism selection/rotation |
| `Frost(n)` | Diffusion |

---

## Wheels

`<Wheels>` → `<Wheel>` → `<Slot>` children.

Slots can be: color (linked to a filter for spectral accuracy), gobo (PNG in `wheels/`), prism, open, or closed. Slots are referenced by 1-based **WheelSlotIndex** in ChannelSets.

---

## PhysicalDescriptions

- **Emitters**: LED/tungsten additive sources — CIE color point + optional spectral distribution
- **Filters**: Subtractive color filters — CIE color + spectral transmission
- **DMXProfiles**: Non-linear DMX→output curves (cubic spline coefficients)
- **CRIs**: TM-30-15 color rendering fidelity (99 color samples)
- **ColorSpaces**: sRGB, ProPhoto, ANSI, or Custom

---

## MVR (My Virtual Rig)

Standardized as **DIN SPEC 15801** (current: v1.6, 2023-12).

GDTF defines the **fixture type**; MVR defines the **scene** — placing instances in 3D, patching DMX, adding scenery.

### MVR File Format
A `.mvr` file is a ZIP archive (STORE or DEFLATE only, no encryption). **All files at root level** — no subfolders.

```
scene.mvr  (ZIP)
├── GeneralSceneDescription.xml   ← mandatory
├── Robe@Robin_MMX_WashBeam.gdtf  ← embedded GDTF files (root level)
├── Generic@Truss.gdtf
└── backdrop.glb
```

### MVR Matrix Format

The `<Matrix>` element is a 4×3 transform — four rows of three values each:

```
{u1,u2,u3}   ← right vector  (local X axis in MVR Z-up space)
{v1,v2,v3}   ← forward vector (local Y axis, depth)
{w1,w2,w3}   ← up vector     (local Z axis → maps to Three.js Y)
{o1,o2,o3}   ← translation, millimetres
```

Example from the spec (a rotated fixture 6m right, 2.8m deep, 5m up):
```xml
<Matrix>
  {0.158127,-0.987419,0.000000}
  {0.987419,0.158127,0.000000}
  {0.000000,0.000000,1.000000}
  {6020.939200,2838.588955,4978.134459}
</Matrix>
```

**Layer constraint**: Layer matrices may only have a vertical (Z) translation — rotation and scale must be identity.

### Scene Object Types

| Node | Description |
|---|---|
| `<Fixture>` | Lighting device with GDTF reference |
| `<Truss>` | Structural support; children positioned in truss local space |
| `<Support>` | Vertical rigging (ChainLength attr) |
| `<VideoScreen>` | Display device |
| `<Projector>` | Projection device |
| `<GroupObject>` | Local coordinate space container |
| `<SceneObject>` | Generic graphical object |
| `<FocusPoint>` | Aim target reference |

### Fixture Element
```xml
<Fixture name="Robin MMX WashBeam" uuid="...">
  <Matrix>...</Matrix>
  <GDTFSpec>Robe@Robin_MMX_WashBeam</GDTFSpec>  <!-- NO .gdtf extension -->
  <GDTFMode>DMX Mode</GDTFMode>                  <!-- must match DMXMode Name -->
  <Addresses>
    <Address break="0">45</Address>              <!-- Universe.Address or absolute -->
  </Addresses>
</Fixture>
```

**Important:** `GDTFSpec` omits the `.gdtf` extension per DIN SPEC 15801.

---

## MVR-xchange Protocol

Real-time network protocol for sharing MVR files between applications without USB drives (part of DIN SPEC 15801).

- **TCP mode**: No config needed; discovery via mDNS (`_mvrxchange._tcp.local.`); LAN only
- **WebSocket mode**: DNS-routable; internet-capable via `wss://`
- Messages are JSON; key messages: `MVR_JOIN`, `MVR_LEAVE`, `MVR_COMMIT`
- Supported by: grandMA3, Vectorworks Spotlight, BlenderDMX, zactrack

---

## Open Source Libraries

| Library | Language | Notes |
|---|---|---|
| [libMVRgdtf](https://github.com/mvrdevelopment/libMVRgdtf) | C++ | Full GDTF 1.2 + MVR 1.6; Boost + Xerces-C; macOS/Win/Linux/iOS/Android |
| [python-gdtf (pygdtf)](https://github.com/open-stage/python-gdtf) | Python | Full GDTF 1.2 read/write; `pip install pygdtf` |
| [python-mvr (pymvr)](https://github.com/open-stage/python-mvr) | Python | MVR 1.6 read/write; `pip install pymvr`; used by BlenderDMX |
| [BlenderDMX](https://github.com/open-stage/blender-dmx) | Python (Blender) | Full GDTF+MVR import/export in Blender |
| [Omniverse converter](https://github.com/MomentFactory/Omniverse-MVR-GDTF-converter) | Python | GDTF/MVR → USD for NVIDIA Omniverse; MIT |

```python
# pygdtf usage
import pygdtf
fixture = pygdtf.FixtureType("Robe@Robin_MMX_WashBeam.gdtf")
# fixture.dmx_modes, fixture.geometries, fixture.wheels, ...
```

---

## Key References

- Spec repo: https://github.com/mvrdevelopment/spec
- GDTF spec (Markdown): https://github.com/mvrdevelopment/spec/blob/main/gdtf-spec.md
- MVR spec (Markdown): https://github.com/mvrdevelopment/spec/blob/main/mvr-spec.md
- GDTF Hub (docs): https://www.gdtf.eu/
- GDTF Share (fixture library): https://gdtf-share.com/
- Attribute list: https://www.gdtf.eu/gdtf/attributes/attributes/
- MVR-xchange: https://www.gdtf.eu/mvr/mvr-spec/xchange/
