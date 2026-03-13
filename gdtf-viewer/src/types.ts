/**
 * Type definitions for MVR (My Virtual Rig) — DIN SPEC 15801
 * and GDTF (General Device Type Format) — DIN SPEC 15800
 */

// ─── MVR Types ────────────────────────────────────────────────────────────────

/** 4×4 transformation matrix from MVR {u}{v}{w}{o} format, in millimetres */
export interface MvrMatrix {
  /** Right vector (local X axis) */
  u: [number, number, number];
  /** Up vector (local Y axis) */
  v: [number, number, number];
  /** At/look-at vector (local Z axis) */
  w: [number, number, number];
  /** Origin / translation, millimetres */
  o: [number, number, number];
}

export type MvrNodeType =
  | 'Fixture'
  | 'GroupObject'
  | 'SceneObject'
  | 'Truss'
  | 'VideoScreen'
  | 'Projector'
  | 'Support'
  | 'FocusPoint';

export interface MvrBaseNode {
  type: MvrNodeType;
  name: string;
  uuid: string;
  matrix: MvrMatrix | null;
  /** Children (for GroupObject, Layer) */
  children: MvrSceneNode[];
  /** Display class membership */
  classing: string | null;
}

export interface MvrFixture extends MvrBaseNode {
  type: 'Fixture';
  /** Filename of the GDTF inside the MVR archive (e.g. "Robin Pointe.gdtf") */
  gdtfSpec: string;
  /** DMX mode name within the GDTF */
  gdtfMode: string;
  /** DMX addresses: array of "universe.address" strings */
  addresses: string[];
  fixtureId: string;
  unitNumber: number;
  /** Custom colour assigned by the designer */
  colour: string | null;
  /** Custom label/note */
  customId: string | null;
  /** Reference to a focus point UUID */
  focusPoint: string | null;
  position: string | null; // position name/reference
}

export interface MvrTruss extends MvrBaseNode {
  type: 'Truss';
  /** GDTF file for the truss geometry */
  gdtfSpec: string | null;
  gdtfMode: string | null;
  /** Functional name (e.g. "Upstage Truss") */
  function: string | null;
  position: string | null;
}

export interface MvrGroupObject extends MvrBaseNode {
  type: 'GroupObject';
}

export interface MvrSceneObject extends MvrBaseNode {
  type: 'SceneObject';
  gdtfSpec: string | null;
  gdtfMode: string | null;
}

export interface MvrVideoScreen extends MvrBaseNode {
  type: 'VideoScreen';
  gdtfSpec: string | null;
  gdtfMode: string | null;
}

export interface MvrProjector extends MvrBaseNode {
  type: 'Projector';
  gdtfSpec: string | null;
  gdtfMode: string | null;
}

export interface MvrSupport extends MvrBaseNode {
  type: 'Support';
  gdtfSpec: string | null;
  gdtfMode: string | null;
  function: string | null;
}

export interface MvrFocusPoint extends MvrBaseNode {
  type: 'FocusPoint';
  gdtfSpec: string | null;
}

export type MvrSceneNode =
  | MvrFixture
  | MvrTruss
  | MvrGroupObject
  | MvrSceneObject
  | MvrVideoScreen
  | MvrProjector
  | MvrSupport
  | MvrFocusPoint;

export interface MvrLayer {
  name: string;
  uuid: string;
  nodes: MvrSceneNode[];
}

export interface MvrScene {
  /** MVR format version */
  version: { major: number; minor: number };
  provider: string;
  providerVersion: string;
  layers: MvrLayer[];
  /** Map of GDTF filename → raw ZIP bytes */
  gdtfFiles: Map<string, ArrayBuffer>;
  /** Map of filename → raw bytes (3D geometry, textures) */
  auxFiles: Map<string, ArrayBuffer>;
}

// ─── GDTF Types ───────────────────────────────────────────────────────────────

export interface GdtfModel {
  /** Model name, referenced by geometry nodes */
  name: string;
  /** Length in metres */
  length: number;
  /** Width in metres */
  width: number;
  /** Height in metres */
  height: number;
  /** Primitive type fallback when no 3D file present */
  primitiveType: 'Undefined' | 'Cube' | 'Cylinder' | 'Sphere' | 'Base' | 'Yoke' | 'Head' | 'Scanner' | 'Conventional' | 'Pigtail' | 'Base1_1' | 'Scanner1_1' | 'Conventional1_1';
  /** Relative path to the 3D file within the GDTF archive */
  file3D: string | null;
}

export interface GdtfGeometry {
  name: string;
  modelRef: string | null;
  /** 3×3 rotation matrix (row-major) from GDTF spec */
  matrix: number[] | null;
  geometryType: string;
  children: GdtfGeometry[];
  /** Beam-specific: beam angle in degrees */
  beamAngle?: number;
  /** Beam-specific: field angle in degrees */
  fieldAngle?: number;
  /** Beam-specific: power in watts */
  power?: number;
  /** Beam-specific: colour temperature K */
  colorTemperature?: number;
  /** Beam-specific: luminous flux lm */
  luminousFlux?: number;
}

export interface GdtfFixtureType {
  /** Unique identifier (GUID) for this fixture type */
  fixtureTypeId: string;
  name: string;
  shortName: string;
  longName: string;
  manufacturer: string;
  description: string;
  /** Path to thumbnail file within the GDTF archive */
  thumbnail: string | null;
  models: Map<string, GdtfModel>;
  geometries: GdtfGeometry[];
  /** Map of model name → extracted GLB bytes */
  modelFiles: Map<string, ArrayBuffer>;
}

// ─── Scene Graph (Three.js side) ─────────────────────────────────────────────

export interface SceneObjectMeta {
  mvrNode: MvrSceneNode;
  gdtfFixture: GdtfFixtureType | null;
  layerName: string;
}
