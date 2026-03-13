/**
 * Three.js scene builder — converts parsed MVR/GDTF data into a 3D scene.
 *
 * Coordinate system notes:
 *   MVR/GDTF use right-handed Z-up Cartesian coordinates (X right, Y into screen, Z up),
 *   units are millimetres for MVR matrices, metres for GDTF model dimensions.
 *   Three.js uses right-handed Y-up coordinates.
 *
 *   Conversion: apply a -90° X rotation to the root scene group so that
 *   Z-up maps to Y-up. Individual object matrices are applied as-is within
 *   that root, then scaled from mm to metres.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import type {
  MvrScene,
  MvrLayer,
  MvrSceneNode,
  MvrMatrix,
  MvrFixture,
  MvrTruss,
  SceneObjectMeta,
} from './types';
import type { GdtfFixtureType } from './types';
import { getBestModelFile, getFixtureBounds } from './gdtf-parser';

// ─── Colour palette ───────────────────────────────────────────────────────────

const FIXTURE_COLOUR = new THREE.Color(0x4fc3f7);     // light blue
const TRUSS_COLOUR = new THREE.Color(0xb0bec5);        // steel grey
const SUPPORT_COLOUR = new THREE.Color(0x8d6e63);      // brown
const FOCUS_COLOUR = new THREE.Color(0xfff176);        // yellow
const SCENE_OBJ_COLOUR = new THREE.Color(0x80cbc4);   // teal
const VIDEO_COLOUR = new THREE.Color(0xce93d8);        // purple
const SELECTED_COLOUR = new THREE.Color(0xff6f00);     // amber

// Layer opacity for hidden layers
const HIDDEN_OPACITY = 0;

// ─── Blob URL registry (cleaned up on scene rebuild) ─────────────────────────
const blobUrls: string[] = [];
function makeBlobUrl(data: ArrayBuffer, mime = 'model/gltf-binary'): string {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  blobUrls.push(url);
  return url;
}
export function revokeBlobUrls() {
  blobUrls.forEach(u => URL.revokeObjectURL(u));
  blobUrls.length = 0;
}

// ─── Matrix conversion ────────────────────────────────────────────────────────

const MM_TO_M = 0.001;

/**
 * Convert an MVR {u}{v}{w}{o} matrix to a Three.js Matrix4.
 * MVR is Z-up, mm. The returned matrix is in metres (for Three.js world space).
 */
function mvrMatrixToThree(m: MvrMatrix): THREE.Matrix4 {
  // MVR columns: u=right(X), v=up(Z in MVR), w=fwd(Y into screen in MVR), o=origin
  // We apply coordinate system flip at the root group level (see buildScene).
  // Here we just convert mm→m and pack into Matrix4 row-major via .set().
  const [ux, uy, uz] = m.u;
  const [vx, vy, vz] = m.v;
  const [wx, wy, wz] = m.w;
  const [ox, oy, oz] = m.o;
  const s = MM_TO_M;

  // Three.js Matrix4.set() is row-major: (row0col0, row0col1, ...)
  // Standard column-vector transform matrix:
  //   | ux  vx  wx  ox |
  //   | uy  vy  wy  oy |
  //   | uz  vz  wz  oz |
  //   | 0   0   0   1  |
  const mat = new THREE.Matrix4();
  mat.set(
    ux,     vx,     wx,     ox * s,
    uy,     vy,     wy,     oy * s,
    uz,     vz,     wz,     oz * s,
    0,      0,      0,      1,
  );
  return mat;
}

// ─── Placeholder geometry factory ─────────────────────────────────────────────

function makePlaceholderFixture(
  gdtf: GdtfFixtureType | null,
  colour: THREE.Color,
): THREE.Group {
  const group = new THREE.Group();

  let l = 0.25, w = 0.25, h = 0.35;
  if (gdtf) {
    const b = getFixtureBounds(gdtf);
    l = b.l || 0.25;
    w = b.w || 0.25;
    h = b.h || 0.35;
  }

  // Body
  const bodyGeo = new THREE.BoxGeometry(l, h * 0.7, w);
  const bodyMat = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = h * 0.35;
  body.castShadow = true;
  group.add(body);

  // Lens disc
  const lensGeo = new THREE.CylinderGeometry(Math.min(l, w) * 0.35, Math.min(l, w) * 0.3, 0.04, 16);
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffee,
    emissiveIntensity: 0.5,
    roughness: 0.1,
    metalness: 0.2,
  });
  const lens = new THREE.Mesh(lensGeo, lensMat);
  lens.rotation.x = Math.PI / 2;
  lens.position.y = h * 0.7 + 0.02;
  group.add(lens);

  return group;
}

function makePlaceholderTruss(colour: THREE.Color): THREE.Group {
  const group = new THREE.Group();
  // Simplified truss: a horizontal box, 3 m long by default
  const geo = new THREE.BoxGeometry(3, 0.25, 0.25);
  const mat = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.5, metalness: 0.4 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

function makePlaceholderGeneric(colour: THREE.Color, scale = 0.3): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(scale, scale, scale);
  const mat = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.7 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  group.add(mesh);
  return group;
}

// ─── GLTF model loader ────────────────────────────────────────────────────────

async function loadGltfModel(data: ArrayBuffer): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.parse(
      data,
      '',
      gltf => {
        const scene = gltf.scene;
        scene.traverse(obj => {
          if ((obj as THREE.Mesh).isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        resolve(scene);
      },
      err => reject(err),
    );
  });
}

async function load3dsModel(data: ArrayBuffer): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    const loader = new TDSLoader();
    try {
      const group = loader.parse(data, '');
      group.traverse(obj => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      resolve(group);
    } catch (e) {
      reject(e);
    }
  });
}

// ─── Node builder ─────────────────────────────────────────────────────────────

async function buildObject3D(
  node: MvrSceneNode,
  gdtfCache: Map<string, GdtfFixtureType>,
  metaMap: Map<THREE.Object3D, SceneObjectMeta>,
  layerName: string,
): Promise<THREE.Object3D> {
  const wrapper = new THREE.Group();
  wrapper.name = node.name;

  // Apply MVR transformation matrix
  if (node.matrix) {
    wrapper.matrix.copy(mvrMatrixToThree(node.matrix));
    wrapper.matrix.decompose(wrapper.position, wrapper.quaternion, wrapper.scale);
    wrapper.matrixAutoUpdate = false;
  }

  let content: THREE.Object3D | null = null;

  switch (node.type) {
    case 'Fixture': {
      const fixture = node as MvrFixture;
      const gdtf = fixture.gdtfSpec ? gdtfCache.get(fixture.gdtfSpec) ?? null : null;
      let loaded = false;

      if (gdtf) {
        const modelFile = getBestModelFile(gdtf);
        if (modelFile) {
          try {
            const lc = modelFile.path.toLowerCase();
            if (lc.endsWith('.glb') || lc.endsWith('.gltf')) {
              content = await loadGltfModel(modelFile.data);
            } else if (lc.endsWith('.3ds')) {
              content = await load3dsModel(modelFile.data);
            }
            loaded = true;
          } catch (e) {
            console.warn(`Failed to load model for ${fixture.name}:`, e);
          }
        }
      }

      if (!loaded) {
        content = makePlaceholderFixture(gdtf, FIXTURE_COLOUR);
      }

      metaMap.set(wrapper, { mvrNode: node, gdtfFixture: gdtf, layerName });
      break;
    }

    case 'Truss': {
      const truss = node as MvrTruss;
      const gdtf = truss.gdtfSpec ? gdtfCache.get(truss.gdtfSpec) ?? null : null;
      let loaded = false;

      if (gdtf) {
        const modelFile = getBestModelFile(gdtf);
        if (modelFile) {
          try {
            const lc = modelFile.path.toLowerCase();
            if (lc.endsWith('.glb') || lc.endsWith('.gltf')) {
              content = await loadGltfModel(modelFile.data);
            } else if (lc.endsWith('.3ds')) {
              content = await load3dsModel(modelFile.data);
            }
            loaded = true;
          } catch (e) {
            console.warn(`Failed to load truss model for ${truss.name}:`, e);
          }
        }
      }

      if (!loaded) content = makePlaceholderTruss(TRUSS_COLOUR);
      metaMap.set(wrapper, { mvrNode: node, gdtfFixture: gdtf, layerName });
      break;
    }

    case 'GroupObject': {
      // Recurse into children
      const childPromises = node.children.map(child =>
        buildObject3D(child, gdtfCache, metaMap, layerName),
      );
      const childObjects = await Promise.all(childPromises);
      childObjects.forEach(c => wrapper.add(c));
      metaMap.set(wrapper, { mvrNode: node, gdtfFixture: null, layerName });
      return wrapper; // skip adding content below
    }

    case 'VideoScreen':
      content = makePlaceholderGeneric(VIDEO_COLOUR, 1.5);
      metaMap.set(wrapper, { mvrNode: node, gdtfFixture: null, layerName });
      break;

    case 'Support':
      content = makePlaceholderGeneric(SUPPORT_COLOUR, 0.1);
      metaMap.set(wrapper, { mvrNode: node, gdtfFixture: null, layerName });
      break;

    case 'FocusPoint':
      content = makePlaceholderGeneric(FOCUS_COLOUR, 0.2);
      metaMap.set(wrapper, { mvrNode: node, gdtfFixture: null, layerName });
      break;

    case 'Projector':
    case 'SceneObject':
    default:
      content = makePlaceholderGeneric(SCENE_OBJ_COLOUR, 0.3);
      metaMap.set(wrapper, { mvrNode: node, gdtfFixture: null, layerName });
      break;
  }

  if (content) wrapper.add(content);
  return wrapper;
}

// ─── Main scene builder ───────────────────────────────────────────────────────

export interface BuildResult {
  root: THREE.Group;
  /** Map from Three.js Object3D to its MVR metadata */
  metaMap: Map<THREE.Object3D, SceneObjectMeta>;
  /** Map from layer name to the Three.js group for that layer */
  layerGroups: Map<string, THREE.Group>;
  stats: {
    fixtures: number;
    trusses: number;
    other: number;
    gdtfLoaded: number;
    gdtfFailed: number;
  };
}

export async function buildScene(
  scene: MvrScene,
  gdtfCache: Map<string, GdtfFixtureType>,
  onProgress?: (msg: string) => void,
): Promise<BuildResult> {
  revokeBlobUrls();

  // Root group with coordinate system conversion: MVR is Z-up, Three.js is Y-up
  // Rotate -90° around X so that +Z_mvr → +Y_three
  const root = new THREE.Group();
  root.name = 'MVR Scene Root';
  root.rotation.x = -Math.PI / 2;

  const metaMap = new Map<THREE.Object3D, SceneObjectMeta>();
  const layerGroups = new Map<string, THREE.Group>();

  const stats = { fixtures: 0, trusses: 0, other: 0, gdtfLoaded: 0, gdtfFailed: 0 };

  let layerIdx = 0;
  for (const layer of scene.layers) {
    onProgress?.(`Building layer "${layer.name}" (${layerIdx + 1}/${scene.layers.length})…`);
    const layerGroup = new THREE.Group();
    layerGroup.name = `Layer: ${layer.name}`;
    layerGroups.set(layer.name, layerGroup);

    const nodePromises = layer.nodes.map(node =>
      buildObject3D(node, gdtfCache, metaMap, layer.name).then(obj3d => {
        // Count stats
        if (node.type === 'Fixture') stats.fixtures++;
        else if (node.type === 'Truss') stats.trusses++;
        else stats.other++;
        return obj3d;
      }),
    );

    const objects = await Promise.all(nodePromises);
    objects.forEach(o => layerGroup.add(o));
    root.add(layerGroup);
    layerIdx++;
  }

  // Count GDTF hits/misses
  gdtfCache.forEach((_gdtf, key) => {
    if (key) stats.gdtfLoaded++;
  });

  return { root, metaMap, layerGroups, stats };
}

// ─── Beam cone helper ─────────────────────────────────────────────────────────

/** Add or remove visible light beam cones from all fixtures in the scene */
export function setBeamVisibility(root: THREE.Group, visible: boolean) {
  root.traverse(obj => {
    if (obj.userData.isBeamCone) {
      obj.visible = visible;
    }
  });

  if (!visible) return;

  // Create beam cones where they don't exist
  root.traverse(obj => {
    if (!obj.userData.isFixtureContent) return;
    const parent = obj.parent;
    if (!parent) return;
    const existing = parent.children.find(c => c.userData.isBeamCone);
    if (existing) return;

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 3, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffffcc,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    cone.position.y = 1.5;
    cone.rotation.x = Math.PI; // point downward
    cone.userData.isBeamCone = true;
    parent.add(cone);
  });
}

// ─── Selection highlight ──────────────────────────────────────────────────────

let _previousMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]> = new Map();

export function highlightObject(obj: THREE.Object3D | null, previousObj: THREE.Object3D | null) {
  // Restore previous
  if (previousObj) {
    previousObj.traverse(node => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        const prev = _previousMaterials.get(mesh);
        if (prev) mesh.material = prev;
      }
    });
    _previousMaterials.clear();
  }

  if (!obj) return;

  // Highlight new
  obj.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) {
      _previousMaterials.set(mesh, mesh.material);
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      const highlighted = mat.clone() as THREE.MeshStandardMaterial;
      highlighted.emissive = SELECTED_COLOUR;
      highlighted.emissiveIntensity = 0.6;
      mesh.material = highlighted;
    }
  });
}
