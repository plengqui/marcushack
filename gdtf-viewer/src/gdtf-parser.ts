/**
 * GDTF (General Device Type Format) parser — DIN SPEC 15800 v1.2
 *
 * A .gdtf file is a ZIP archive containing:
 *   description.xml          — fixture type definition (mandatory)
 *   thumbnail.png / .svg     — fixture icon
 *   models/gltf/             — GLTF/GLB 3D models
 *   models/3ds/              — 3DS format 3D models (legacy)
 *   wheels/                  — gobo/colour wheel images
 */

import JSZip from 'jszip';
import type { GdtfFixtureType, GdtfGeometry, GdtfModel } from './types';

// ─── XML helpers ──────────────────────────────────────────────────────────────

function attr(el: Element, name: string, fallback = ''): string {
  return el.getAttribute(name) ?? fallback;
}

function numAttr(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name);
  if (!v) return fallback;
  return parseFloat(v) || fallback;
}

// ─── Geometry parser ──────────────────────────────────────────────────────────

/**
 * Parse a Geometry (or subtype) element from description.xml.
 * GDTF geometries form a tree mirroring the physical fixture structure.
 */
function parseGeometry(el: Element): GdtfGeometry {
  const tag = el.tagName;
  const children: GdtfGeometry[] = [];

  Array.from(el.children).forEach(child => {
    // Any child element that represents a geometry node
    if (child.tagName !== 'Beam' && isGeometryTag(child.tagName)) {
      children.push(parseGeometry(child));
    } else if (isGeometryTag(child.tagName)) {
      children.push(parseGeometry(child));
    }
  });

  // Parse 3×3 rotation matrix attribute (if present on the geometry element itself)
  const matrixStr = el.getAttribute('Matrix');
  let matrix: number[] | null = null;
  if (matrixStr) {
    const nums = matrixStr
      .replace(/[{}]/g, ' ')
      .trim()
      .split(/[,\s]+/)
      .map(parseFloat)
      .filter(n => !isNaN(n));
    if (nums.length === 9 || nums.length === 12) matrix = nums;
  }

  const geom: GdtfGeometry = {
    name: attr(el, 'Name', tag),
    modelRef: el.getAttribute('Model'),
    matrix,
    geometryType: tag,
    children,
  };

  // Beam-specific attributes
  if (tag === 'Beam') {
    geom.beamAngle = numAttr(el, 'BeamAngle', 25);
    geom.fieldAngle = numAttr(el, 'FieldAngle', 30);
    geom.power = numAttr(el, 'Power', 100);
    geom.colorTemperature = numAttr(el, 'ColorTemperature', 6500);
    geom.luminousFlux = numAttr(el, 'LuminousFlux', 1000);
  }

  return geom;
}

const GEOMETRY_TAGS = new Set([
  'Geometry', 'Axis', 'Beam', 'MediaServerLayer', 'MediaServerCamera',
  'MediaServerMaster', 'Display', 'Laser', 'WiringObject', 'Inventory',
  'Structure', 'Support', 'Magnet', 'GeometryReference',
  'BeamFilter', 'ColorFilter', 'GoboFilter', 'ShaperFilter',
]);

function isGeometryTag(tag: string): boolean {
  return GEOMETRY_TAGS.has(tag);
}

// ─── Model parser ─────────────────────────────────────────────────────────────

type PrimitiveType = GdtfModel['primitiveType'];
const VALID_PRIMITIVES: PrimitiveType[] = [
  'Cube', 'Cylinder', 'Sphere', 'Base', 'Yoke', 'Head', 'Scanner',
  'Conventional', 'Pigtail', 'Base1_1', 'Scanner1_1', 'Conventional1_1',
];

function parseModel(el: Element): GdtfModel {
  const rawPrimitive = el.getAttribute('PrimitiveType') as PrimitiveType;
  const primitiveType = VALID_PRIMITIVES.includes(rawPrimitive) ? rawPrimitive : 'Undefined';

  // File attribute — may be "modelName" without extension,
  // actual files are in models/gltf/ or models/3ds/
  const file = el.getAttribute('File') ?? null;

  return {
    name: attr(el, 'Name', 'Model'),
    // GDTF dimensions are in metres
    length: numAttr(el, 'Length', 0.3),
    width: numAttr(el, 'Width', 0.3),
    height: numAttr(el, 'Height', 0.3),
    primitiveType,
    file3D: file,
  };
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export async function parseGdtf(buffer: ArrayBuffer): Promise<GdtfFixtureType> {
  const zip = await JSZip.loadAsync(buffer);

  // 1. Parse description.xml
  const descFile = zip.file('description.xml');
  if (!descFile) {
    throw new Error('Invalid GDTF: description.xml not found');
  }
  const xmlText = await descFile.async('text');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const gdtfRoot = doc.documentElement;
  if (gdtfRoot.tagName !== 'GDTF') {
    throw new Error(`Unexpected GDTF root element: ${gdtfRoot.tagName}`);
  }

  const fixtureTypeEl = gdtfRoot.querySelector('FixtureType');
  if (!fixtureTypeEl) {
    throw new Error('GDTF missing <FixtureType> element');
  }

  const name = attr(fixtureTypeEl, 'Name', 'Unknown Fixture');
  const shortName = attr(fixtureTypeEl, 'ShortName', name);
  const longName = attr(fixtureTypeEl, 'LongName', name);
  const manufacturer = attr(fixtureTypeEl, 'Manufacturer', 'Unknown');
  const description = attr(fixtureTypeEl, 'Description', '');
  const fixtureTypeId = attr(fixtureTypeEl, 'FixtureTypeID', crypto.randomUUID());
  const thumbnail = fixtureTypeEl.getAttribute('Thumbnail');

  // 2. Parse Models section
  const models = new Map<string, GdtfModel>();
  fixtureTypeEl.querySelectorAll('Models > Model').forEach(el => {
    const m = parseModel(el);
    models.set(m.name, m);
  });

  // 3. Parse top-level Geometries
  const geometries: GdtfGeometry[] = [];
  const geometriesEl = fixtureTypeEl.querySelector('Geometries');
  if (geometriesEl) {
    Array.from(geometriesEl.children).forEach(child => {
      if (isGeometryTag(child.tagName)) {
        geometries.push(parseGeometry(child));
      }
    });
  }

  // 4. Extract 3D model files from zip
  const modelFiles = new Map<string, ArrayBuffer>();

  // Prefer glTF (.glb) over 3DS
  const modelDirs = ['models/gltf/', 'models/3ds/', 'models/'];
  const extractPromises: Promise<void>[] = [];

  zip.forEach((relativePath, file) => {
    if (file.dir) return;
    const lc = relativePath.toLowerCase();
    if (!lc.endsWith('.glb') && !lc.endsWith('.gltf') && !lc.endsWith('.3ds')) return;

    extractPromises.push(
      file.async('arraybuffer').then(data => {
        modelFiles.set(relativePath, data);
        // Also index by basename for easier lookup
        const base = relativePath.split('/').pop() ?? relativePath;
        if (!modelFiles.has(base)) modelFiles.set(base, data);
      }),
    );
  });

  await Promise.all(extractPromises);

  // Resolve file3D references in models to actual file paths
  models.forEach((model, key) => {
    if (model.file3D) {
      // Try to find the actual file (check common patterns)
      const candidates = [
        `models/gltf/${model.file3D}.glb`,
        `models/gltf/${model.file3D}`,
        `models/3ds/${model.file3D}.3ds`,
        `models/3ds/${model.file3D}`,
        `${model.file3D}.glb`,
        `${model.file3D}`,
      ];
      for (const c of candidates) {
        if (modelFiles.has(c)) {
          model.file3D = c;
          break;
        }
      }
    }
  });

  return {
    fixtureTypeId,
    name,
    shortName,
    longName,
    manufacturer,
    description,
    thumbnail: thumbnail ?? null,
    models,
    geometries,
    modelFiles,
  };
}

/** Find the best 3D model file for a GDTF fixture (prefer GLB) */
export function getBestModelFile(gdtf: GdtfFixtureType): { path: string; data: ArrayBuffer } | null {
  // First, try to find a GLB file linked to geometry
  for (const model of gdtf.models.values()) {
    if (model.file3D) {
      const data = gdtf.modelFiles.get(model.file3D);
      if (data) return { path: model.file3D, data };
    }
  }

  // Fallback: any GLB in the archive
  for (const [path, data] of gdtf.modelFiles) {
    if (path.toLowerCase().endsWith('.glb')) return { path, data };
  }

  // Fallback: any GLTF in the archive
  for (const [path, data] of gdtf.modelFiles) {
    if (path.toLowerCase().endsWith('.gltf')) return { path, data };
  }

  // Fallback: any 3DS in the archive
  for (const [path, data] of gdtf.modelFiles) {
    if (path.toLowerCase().endsWith('.3ds')) return { path, data };
  }

  return null;
}

/** Get estimated bounding box from GDTF model definitions (metres) */
export function getFixtureBounds(gdtf: GdtfFixtureType): { l: number; w: number; h: number } {
  let maxL = 0.2, maxW = 0.2, maxH = 0.3;
  gdtf.models.forEach(m => {
    if (m.length > maxL) maxL = m.length;
    if (m.width > maxW) maxW = m.width;
    if (m.height > maxH) maxH = m.height;
  });
  return { l: maxL, w: maxW, h: maxH };
}
