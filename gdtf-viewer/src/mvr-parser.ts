/**
 * MVR (My Virtual Rig) parser — DIN SPEC 15801 v1.6
 *
 * An .mvr file is an uncompressed ZIP archive containing:
 *   - GeneralSceneDescription.xml  (mandatory, UTF-8)
 *   - *.gdtf files                 (fixture type definitions)
 *   - *.glb / *.3ds / etc.         (additional geometry)
 *   - *.png                        (textures)
 */

import JSZip from 'jszip';
import type {
  MvrScene,
  MvrLayer,
  MvrSceneNode,
  MvrMatrix,
  MvrFixture,
  MvrTruss,
  MvrGroupObject,
  MvrSceneObject,
  MvrVideoScreen,
  MvrProjector,
  MvrSupport,
  MvrFocusPoint,
} from './types';

// ─── Matrix parsing ───────────────────────────────────────────────────────────

/**
 * Parse the MVR matrix string format: {ux,uy,uz}{vx,vy,vz}{wx,wy,wz}{ox,oy,oz}
 * Each triplet is a column vector; values are in millimetres.
 */
function parseMatrix(raw: string | null): MvrMatrix | null {
  if (!raw) return null;
  // Match all groups inside braces
  const groups = [...raw.matchAll(/\{([^}]+)\}/g)].map(m => m[1]);
  if (groups.length < 4) return null;

  function parseVec(s: string): [number, number, number] {
    const parts = s.split(',').map(v => parseFloat(v.trim()));
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  }

  return {
    u: parseVec(groups[0]),
    v: parseVec(groups[1]),
    w: parseVec(groups[2]),
    o: parseVec(groups[3]),
  };
}

// ─── XML helpers ──────────────────────────────────────────────────────────────

function attr(el: Element, name: string, fallback = ''): string {
  return el.getAttribute(name) ?? fallback;
}

function childText(el: Element, tagName: string): string | null {
  const child = el.querySelector(`:scope > ${tagName}`);
  return child?.textContent?.trim() ?? null;
}

// ─── Node parsers ─────────────────────────────────────────────────────────────

function parseAddresses(el: Element): string[] {
  const addresses: string[] = [];
  el.querySelectorAll(':scope > Addresses > Address').forEach(addr => {
    const break_ = addr.getAttribute('break');
    const address = addr.getAttribute('address') ?? addr.textContent?.trim() ?? '';
    // If there's a break attribute it is a Universe.Address format
    if (break_ !== null && break_ !== '') {
      addresses.push(`${break_}.${address}`);
    } else if (address) {
      addresses.push(address);
    }
  });
  // Fallback: try DMX addresses node
  if (addresses.length === 0) {
    el.querySelectorAll(':scope > DMXAddress').forEach(a => {
      const t = a.textContent?.trim();
      if (t) addresses.push(t);
    });
  }
  return addresses;
}

function parseFixture(el: Element, layerName: string): MvrFixture {
  const matrix = parseMatrix(el.querySelector(':scope > Matrix')?.textContent?.trim() ?? null);
  return {
    type: 'Fixture',
    name: attr(el, 'name', 'Fixture'),
    uuid: attr(el, 'uuid', crypto.randomUUID()),
    matrix,
    children: [],
    classing: el.querySelector(':scope > Classing')?.textContent?.trim() ?? null,
    gdtfSpec: el.querySelector(':scope > GDTFSpec')?.textContent?.trim() ?? '',
    gdtfMode: el.querySelector(':scope > GDTFMode')?.textContent?.trim() ?? 'Default',
    addresses: parseAddresses(el),
    fixtureId: el.querySelector(':scope > FixtureID')?.textContent?.trim() ?? '',
    unitNumber: parseInt(el.querySelector(':scope > UnitNumber')?.textContent?.trim() ?? '0') || 0,
    colour: el.querySelector(':scope > Color')?.textContent?.trim() ?? null,
    customId: el.querySelector(':scope > CustomId')?.textContent?.trim() ?? null,
    focusPoint: el.querySelector(':scope > FocusPoint')?.textContent?.trim() ?? null,
    position: el.querySelector(':scope > Position')?.textContent?.trim() ?? null,
  };
}

function parseTruss(el: Element): MvrTruss {
  const matrix = parseMatrix(el.querySelector(':scope > Matrix')?.textContent?.trim() ?? null);
  return {
    type: 'Truss',
    name: attr(el, 'name', 'Truss'),
    uuid: attr(el, 'uuid', crypto.randomUUID()),
    matrix,
    children: [],
    classing: el.querySelector(':scope > Classing')?.textContent?.trim() ?? null,
    gdtfSpec: el.querySelector(':scope > GDTFSpec')?.textContent?.trim() ?? null,
    gdtfMode: el.querySelector(':scope > GDTFMode')?.textContent?.trim() ?? null,
    function: el.querySelector(':scope > Function')?.textContent?.trim() ?? null,
    position: el.querySelector(':scope > Position')?.textContent?.trim() ?? null,
  };
}

function parseGroupObject(el: Element, layerName: string): MvrGroupObject {
  const matrix = parseMatrix(el.querySelector(':scope > Matrix')?.textContent?.trim() ?? null);
  return {
    type: 'GroupObject',
    name: attr(el, 'name', 'Group'),
    uuid: attr(el, 'uuid', crypto.randomUUID()),
    matrix,
    children: parseChildren(el, layerName),
    classing: null,
  };
}

function parseSceneObject(el: Element): MvrSceneObject {
  const matrix = parseMatrix(el.querySelector(':scope > Matrix')?.textContent?.trim() ?? null);
  return {
    type: 'SceneObject',
    name: attr(el, 'name', 'Object'),
    uuid: attr(el, 'uuid', crypto.randomUUID()),
    matrix,
    children: [],
    classing: null,
    gdtfSpec: el.querySelector(':scope > GDTFSpec')?.textContent?.trim() ?? null,
    gdtfMode: el.querySelector(':scope > GDTFMode')?.textContent?.trim() ?? null,
  };
}

function parseVideoScreen(el: Element): MvrVideoScreen {
  const matrix = parseMatrix(el.querySelector(':scope > Matrix')?.textContent?.trim() ?? null);
  return {
    type: 'VideoScreen',
    name: attr(el, 'name', 'Video Screen'),
    uuid: attr(el, 'uuid', crypto.randomUUID()),
    matrix,
    children: [],
    classing: null,
    gdtfSpec: el.querySelector(':scope > GDTFSpec')?.textContent?.trim() ?? null,
    gdtfMode: el.querySelector(':scope > GDTFMode')?.textContent?.trim() ?? null,
  };
}

function parseProjector(el: Element): MvrProjector {
  const matrix = parseMatrix(el.querySelector(':scope > Matrix')?.textContent?.trim() ?? null);
  return {
    type: 'Projector',
    name: attr(el, 'name', 'Projector'),
    uuid: attr(el, 'uuid', crypto.randomUUID()),
    matrix,
    children: [],
    classing: null,
    gdtfSpec: el.querySelector(':scope > GDTFSpec')?.textContent?.trim() ?? null,
    gdtfMode: el.querySelector(':scope > GDTFMode')?.textContent?.trim() ?? null,
  };
}

function parseSupport(el: Element): MvrSupport {
  const matrix = parseMatrix(el.querySelector(':scope > Matrix')?.textContent?.trim() ?? null);
  return {
    type: 'Support',
    name: attr(el, 'name', 'Support'),
    uuid: attr(el, 'uuid', crypto.randomUUID()),
    matrix,
    children: [],
    classing: null,
    gdtfSpec: el.querySelector(':scope > GDTFSpec')?.textContent?.trim() ?? null,
    gdtfMode: el.querySelector(':scope > GDTFMode')?.textContent?.trim() ?? null,
    function: el.querySelector(':scope > Function')?.textContent?.trim() ?? null,
  };
}

function parseFocusPoint(el: Element): MvrFocusPoint {
  const matrix = parseMatrix(el.querySelector(':scope > Matrix')?.textContent?.trim() ?? null);
  return {
    type: 'FocusPoint',
    name: attr(el, 'name', 'Focus Point'),
    uuid: attr(el, 'uuid', crypto.randomUUID()),
    matrix,
    children: [],
    classing: null,
    gdtfSpec: el.querySelector(':scope > GDTFSpec')?.textContent?.trim() ?? null,
  };
}

/** Parse all direct child scene nodes of a container element */
function parseChildren(container: Element, layerName: string): MvrSceneNode[] {
  const nodes: MvrSceneNode[] = [];

  container.children && Array.from(container.children).forEach(child => {
    switch (child.tagName) {
      case 'Fixture':
        nodes.push(parseFixture(child, layerName));
        break;
      case 'Truss':
        nodes.push(parseTruss(child));
        break;
      case 'GroupObject':
        nodes.push(parseGroupObject(child, layerName));
        break;
      case 'SceneObject':
        nodes.push(parseSceneObject(child));
        break;
      case 'VideoScreen':
        nodes.push(parseVideoScreen(child));
        break;
      case 'Projector':
        nodes.push(parseProjector(child));
        break;
      case 'Support':
        nodes.push(parseSupport(child));
        break;
      case 'FocusPoint':
        nodes.push(parseFocusPoint(child));
        break;
      // ChildList is sometimes used as a wrapper
      case 'ChildList':
        nodes.push(...parseChildren(child, layerName));
        break;
    }
  });

  return nodes;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export async function parseMvr(
  buffer: ArrayBuffer,
  onProgress?: (msg: string) => void,
): Promise<MvrScene> {
  onProgress?.('Unzipping MVR archive…');
  const zip = await JSZip.loadAsync(buffer);

  // 1. Read GeneralSceneDescription.xml
  const xmlFile = zip.file('GeneralSceneDescription.xml');
  if (!xmlFile) {
    throw new Error('Invalid MVR file: GeneralSceneDescription.xml not found');
  }
  const xmlText = await xmlFile.async('text');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const root = doc.documentElement;
  if (root.tagName !== 'GeneralSceneDescription') {
    throw new Error(`Unexpected XML root element: ${root.tagName}`);
  }

  const verMajor = parseInt(attr(root, 'verMajor', '1'));
  const verMinor = parseInt(attr(root, 'verMinor', '0'));
  const provider = attr(root, 'provider', 'Unknown');
  const providerVersion = attr(root, 'providerVersion', '');

  onProgress?.(`Parsing MVR v${verMajor}.${verMinor} from ${provider}…`);

  // 2. Parse scene layers
  const layers: MvrLayer[] = [];
  const sceneEl = root.querySelector('Scene');
  if (sceneEl) {
    const layersEl = sceneEl.querySelector('Layers');
    if (layersEl) {
      Array.from(layersEl.querySelectorAll(':scope > Layer')).forEach(layerEl => {
        const layerName = attr(layerEl, 'name', 'Layer');
        const layerUuid = attr(layerEl, 'uuid', crypto.randomUUID());

        // Layer children may be directly inside Layer or inside ChildList
        const childList = layerEl.querySelector(':scope > ChildList') ?? layerEl;
        const nodes = parseChildren(childList, layerName);

        layers.push({ name: layerName, uuid: layerUuid, nodes });
      });
    }
  }

  // 3. Extract all resource files from ZIP
  onProgress?.('Extracting embedded files…');
  const gdtfFiles = new Map<string, ArrayBuffer>();
  const auxFiles = new Map<string, ArrayBuffer>();

  const extractPromises: Promise<void>[] = [];
  zip.forEach((relativePath, file) => {
    if (file.dir) return;
    if (relativePath === 'GeneralSceneDescription.xml') return;
    // Skip checksum files
    if (relativePath.endsWith('.checksum.txt')) return;

    extractPromises.push(
      file.async('arraybuffer').then(data => {
        const lc = relativePath.toLowerCase();
        if (lc.endsWith('.gdtf')) {
          // Store by basename for easy lookup
          const baseName = relativePath.split('/').pop() ?? relativePath;
          gdtfFiles.set(baseName, data);
          // Also store by full path
          if (baseName !== relativePath) gdtfFiles.set(relativePath, data);
        } else {
          auxFiles.set(relativePath, data);
        }
      }),
    );
  });
  await Promise.all(extractPromises);

  onProgress?.(`Found ${layers.length} layer(s), ${gdtfFiles.size} GDTF file(s)`);

  return {
    version: { major: verMajor, minor: verMinor },
    provider,
    providerVersion,
    layers,
    gdtfFiles,
    auxFiles,
  };
}

/** Collect all unique GDTF filenames referenced in the scene */
export function collectGdtfRefs(scene: MvrScene): Set<string> {
  const refs = new Set<string>();

  function walk(nodes: MvrSceneNode[]) {
    for (const node of nodes) {
      if ('gdtfSpec' in node && node.gdtfSpec) refs.add(node.gdtfSpec);
      if (node.children.length > 0) walk(node.children);
    }
  }

  for (const layer of scene.layers) {
    walk(layer.nodes);
  }

  return refs;
}

/** Flatten all scene nodes into a flat list */
export function flattenNodes(scene: MvrScene): MvrSceneNode[] {
  const result: MvrSceneNode[] = [];

  function walk(nodes: MvrSceneNode[]) {
    for (const n of nodes) {
      result.push(n);
      if (n.children.length > 0) walk(n.children);
    }
  }

  for (const layer of scene.layers) {
    walk(layer.nodes);
  }

  return result;
}
