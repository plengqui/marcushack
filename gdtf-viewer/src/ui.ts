/**
 * UI logic — wires DOM events to the GdtfViewer and manages sidebars,
 * loading overlay, scene tree, and properties panel.
 */

import type { GdtfViewer } from './viewer';
import type { MvrScene, SceneObjectMeta } from './types';
import { generateDemoMvr } from './demo-scene';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Element #${id} not found`);
  return e as T;
}

function setVisible(id: string, visible: boolean) {
  const e = document.getElementById(id);
  if (e) {
    e.classList.toggle('hidden', !visible);
  }
}

// ─── Loading overlay ──────────────────────────────────────────────────────────

let _loadingEl: HTMLElement | null = null;
let _loadingTextEl: HTMLElement | null = null;

function showLoading(msg: string) {
  if (!_loadingEl) _loadingEl = document.getElementById('loading-overlay');
  if (!_loadingTextEl) _loadingTextEl = document.getElementById('loading-text');
  if (_loadingEl) _loadingEl.classList.remove('hidden');
  if (_loadingTextEl) _loadingTextEl.textContent = msg;
}

function hideLoading() {
  if (!_loadingEl) _loadingEl = document.getElementById('loading-overlay');
  if (_loadingEl) _loadingEl.classList.add('hidden');
}

// ─── Scene tree ───────────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, string> = {
  Fixture: '💡',
  Truss: '⚙️',
  GroupObject: '📁',
  SceneObject: '🟦',
  VideoScreen: '🖥️',
  Projector: '📽️',
  Support: '🔩',
  FocusPoint: '🎯',
};

function buildLayerTree(scene: MvrScene, viewer: GdtfViewer): void {
  const treeEl = document.getElementById('scene-tree');
  if (!treeEl) return;
  treeEl.innerHTML = '';

  for (const layer of scene.layers) {
    const layerDiv = document.createElement('div');
    layerDiv.className = 'tree-layer';

    // Layer header with eye toggle
    const header = document.createElement('div');
    header.className = 'tree-layer-header';

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = true;
    toggle.className = 'layer-toggle';
    toggle.addEventListener('change', () => {
      viewer.setLayerVisible(layer.name, toggle.checked);
    });

    const arrow = document.createElement('span');
    arrow.className = 'tree-arrow expanded';
    arrow.textContent = '▾';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tree-layer-name';
    nameSpan.textContent = layer.name;

    const countSpan = document.createElement('span');
    countSpan.className = 'tree-count';
    countSpan.textContent = `${layer.nodes.length}`;

    header.appendChild(toggle);
    header.appendChild(arrow);
    header.appendChild(nameSpan);
    header.appendChild(countSpan);
    layerDiv.appendChild(header);

    // Node list (collapsed by default if many nodes)
    const nodeList = document.createElement('ul');
    nodeList.className = 'tree-node-list';

    layer.nodes.forEach(node => {
      const li = document.createElement('li');
      li.className = 'tree-node';
      const icon = TYPE_ICON[node.type] ?? '▪';
      li.innerHTML = `<span class="node-icon">${icon}</span><span class="node-name">${escapeHtml(node.name)}</span>`;
      nodeList.appendChild(li);
    });

    layerDiv.appendChild(nodeList);

    // Toggle expand/collapse
    arrow.addEventListener('click', () => {
      const expanded = arrow.classList.toggle('expanded');
      nodeList.style.display = expanded ? '' : 'none';
      arrow.textContent = expanded ? '▾' : '▸';
    });

    treeEl.appendChild(layerDiv);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Stats panel ──────────────────────────────────────────────────────────────

function updateStats(stats: {
  fixtures: number;
  trusses: number;
  other: number;
}, scene: MvrScene) {
  const el = document.getElementById('stats-content');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-row"><span>Fixtures</span><strong>${stats.fixtures}</strong></div>
    <div class="stat-row"><span>Trusses</span><strong>${stats.trusses}</strong></div>
    <div class="stat-row"><span>Other Objects</span><strong>${stats.other}</strong></div>
    <div class="stat-row"><span>Layers</span><strong>${scene.layers.length}</strong></div>
    <div class="stat-row"><span>GDTF Types</span><strong>${scene.gdtfFiles.size}</strong></div>
    <div class="stat-row"><span>MVR Version</span><strong>${scene.version.major}.${scene.version.minor}</strong></div>
    <div class="stat-row"><span>Provider</span><strong>${escapeHtml(scene.provider)}</strong></div>
  `;
}

// ─── Properties panel ─────────────────────────────────────────────────────────

function updateProperties(meta: SceneObjectMeta | null) {
  const panel = document.getElementById('properties-content');
  if (!panel) return;

  if (!meta) {
    panel.innerHTML = '<p class="empty-hint">Select an object in the viewport to view properties</p>';
    return;
  }

  const { mvrNode, gdtfFixture } = meta;

  let html = `
    <div class="prop-section">
      <div class="prop-row"><span class="prop-label">Name</span><span class="prop-value">${escapeHtml(mvrNode.name)}</span></div>
      <div class="prop-row"><span class="prop-label">Type</span><span class="prop-value prop-type-${mvrNode.type.toLowerCase()}">${mvrNode.type}</span></div>
      <div class="prop-row"><span class="prop-label">Layer</span><span class="prop-value">${escapeHtml(meta.layerName)}</span></div>
      <div class="prop-row"><span class="prop-label">UUID</span><span class="prop-value prop-uuid">${mvrNode.uuid}</span></div>
    </div>`;

  if (mvrNode.type === 'Fixture') {
    const f = mvrNode as import('./types').MvrFixture;
    html += `
    <div class="prop-section">
      <h4 class="prop-section-title">Patch</h4>
      <div class="prop-row"><span class="prop-label">GDTF</span><span class="prop-value prop-mono">${escapeHtml(f.gdtfSpec || '—')}</span></div>
      <div class="prop-row"><span class="prop-label">Mode</span><span class="prop-value">${escapeHtml(f.gdtfMode)}</span></div>
      <div class="prop-row"><span class="prop-label">Fixture ID</span><span class="prop-value">${escapeHtml(f.fixtureId || '—')}</span></div>
      <div class="prop-row"><span class="prop-label">Unit #</span><span class="prop-value">${f.unitNumber}</span></div>
      <div class="prop-row"><span class="prop-label">DMX Address</span><span class="prop-value prop-dmx">${f.addresses.join(', ') || '—'}</span></div>
    </div>`;
  }

  if (mvrNode.type === 'Truss') {
    const t = mvrNode as import('./types').MvrTruss;
    html += `
    <div class="prop-section">
      <h4 class="prop-section-title">Truss</h4>
      <div class="prop-row"><span class="prop-label">GDTF</span><span class="prop-value prop-mono">${escapeHtml(t.gdtfSpec || '—')}</span></div>
      <div class="prop-row"><span class="prop-label">Function</span><span class="prop-value">${escapeHtml(t.function || '—')}</span></div>
    </div>`;
  }

  if (gdtfFixture) {
    html += `
    <div class="prop-section">
      <h4 class="prop-section-title">Fixture Type</h4>
      <div class="prop-row"><span class="prop-label">Name</span><span class="prop-value">${escapeHtml(gdtfFixture.name)}</span></div>
      <div class="prop-row"><span class="prop-label">Manufacturer</span><span class="prop-value">${escapeHtml(gdtfFixture.manufacturer)}</span></div>
      <div class="prop-row"><span class="prop-label">Short Name</span><span class="prop-value">${escapeHtml(gdtfFixture.shortName)}</span></div>
      <div class="prop-row"><span class="prop-label">Type ID</span><span class="prop-value prop-uuid">${gdtfFixture.fixtureTypeId}</span></div>
      <div class="prop-row"><span class="prop-label">3D Models</span><span class="prop-value">${gdtfFixture.modelFiles.size}</span></div>
      <div class="prop-row"><span class="prop-label">Geometry Nodes</span><span class="prop-value">${gdtfFixture.geometries.length}</span></div>
    </div>`;
  }

  if (mvrNode.matrix) {
    const m = mvrNode.matrix;
    html += `
    <div class="prop-section">
      <h4 class="prop-section-title">Position (mm)</h4>
      <div class="prop-row"><span class="prop-label">X</span><span class="prop-value">${m.o[0].toFixed(0)}</span></div>
      <div class="prop-row"><span class="prop-label">Y</span><span class="prop-value">${m.o[1].toFixed(0)}</span></div>
      <div class="prop-row"><span class="prop-label">Z</span><span class="prop-value">${m.o[2].toFixed(0)}</span></div>
    </div>`;
  }

  panel.innerHTML = html;
}

// ─── File loading ─────────────────────────────────────────────────────────────

async function loadFile(
  buffer: ArrayBuffer,
  filename: string,
  viewer: GdtfViewer,
) {
  setVisible('drop-zone', false);
  setVisible('viewer-layout', true);
  showLoading('Parsing MVR…');

  try {
    const { mvrScene, stats } = await viewer.loadMvr(buffer, msg => {
      showLoading(msg);
    });

    // Update UI with scene name
    const nameEl = document.getElementById('scene-name');
    if (nameEl) nameEl.textContent = filename;

    buildLayerTree(mvrScene, viewer);
    updateStats(stats, mvrScene);
    hideLoading();
  } catch (err) {
    hideLoading();
    alert(`Failed to load MVR file:\n${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
    setVisible('drop-zone', true);
    setVisible('viewer-layout', false);
  }
}

// ─── Main UI setup ─────────────────────────────────────────────────────────────

export function setupUI(viewer: GdtfViewer) {
  // ── File input
  const fileInput = el<HTMLInputElement>('file-input');
  const browseBtn = el('browse-btn');
  const demoBtn = el('demo-btn');

  browseBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    await loadFile(buffer, file.name, viewer);
    fileInput.value = '';
  });

  // ── Demo scene
  demoBtn.addEventListener('click', async () => {
    showLoading('Generating demo scene…');
    try {
      const buffer = await generateDemoMvr();
      await loadFile(buffer, 'Demo Concert Rig.mvr', viewer);
    } catch (err) {
      hideLoading();
      console.error(err);
      alert(`Demo scene failed: ${err}`);
    }
  });

  // ── Drag and drop onto drop zone
  const dropZone = el('drop-zone');
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', async e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.mvr')) {
      alert('Please drop a .mvr file');
      return;
    }
    const buffer = await file.arrayBuffer();
    await loadFile(buffer, file.name, viewer);
  });

  // ── Also allow drop anywhere on the viewport
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', async e => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (!file || !file.name.toLowerCase().endsWith('.mvr')) return;
    const buffer = await file.arrayBuffer();
    await loadFile(buffer, file.name, viewer);
  });

  // ── Camera controls
  document.getElementById('btn-reset')?.addEventListener('click', () => viewer.fitCameraToScene());
  document.getElementById('btn-top')?.addEventListener('click', () => viewer.setTopView());
  document.getElementById('btn-front')?.addEventListener('click', () => viewer.setFrontView());
  document.getElementById('btn-side')?.addEventListener('click', () => viewer.setSideView());

  // ── Load new file
  document.getElementById('btn-load-new')?.addEventListener('click', () => {
    setVisible('drop-zone', true);
    setVisible('viewer-layout', false);
  });

  // ── Grid toggle
  const gridToggle = document.getElementById('toggle-grid') as HTMLInputElement | null;
  gridToggle?.addEventListener('change', () => viewer.setGridVisible(gridToggle.checked));

  // ── Beam toggle
  const beamToggle = document.getElementById('toggle-beams') as HTMLInputElement | null;
  beamToggle?.addEventListener('change', () => viewer.setBeamVisible(beamToggle.checked));

  // ── Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    switch (e.key.toLowerCase()) {
      case 'r': viewer.fitCameraToScene(); break;
      case 't': viewer.setTopView(); break;
      case 'f': viewer.setFrontView(); break;
      case 's': viewer.setSideView(); break;
    }
  });

  // ── Selection callback
  viewer.setSelectionCallback((meta: SceneObjectMeta | null) => {
    updateProperties(meta);
  });
}
