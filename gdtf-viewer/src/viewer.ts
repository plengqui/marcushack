/**
 * Three.js viewer / renderer.
 *
 * Manages the WebGL renderer, camera, lights, grid, orbit controls,
 * raycasting for selection, and render loop.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildScene, highlightObject, setBeamVisibility } from './scene-builder';
import { parseMvr, collectGdtfRefs } from './mvr-parser';
import { parseGdtf } from './gdtf-parser';
import type { MvrScene, GdtfFixtureType, SceneObjectMeta } from './types';

// ─── Viewer class ─────────────────────────────────────────────────────────────

export type SelectionCallback = (meta: SceneObjectMeta | null) => void;
export type ProgressCallback = (msg: string) => void;

export class GdtfViewer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private grid: THREE.GridHelper;
  private directional: THREE.DirectionalLight;
  private animFrameId = 0;

  /** Currently loaded MVR scene root */
  private sceneRoot: THREE.Group | null = null;
  /** Metadata keyed by Three.js object */
  private metaMap = new Map<THREE.Object3D, SceneObjectMeta>();
  /** Layer name → group */
  private layerGroups = new Map<string, THREE.Group>();
  /** GDTF fixture type cache */
  private gdtfCache = new Map<string, GdtfFixtureType>();

  /** Currently selected object */
  private selectedObj: THREE.Object3D | null = null;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  onSelection: SelectionCallback;

  constructor(canvas: HTMLCanvasElement, onSelection: SelectionCallback) {
    this.onSelection = onSelection;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.FogExp2(0x1a1a2e, 0.008);

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 500);
    this.camera.position.set(10, 8, 15);
    this.camera.lookAt(0, 3, 0);

    // Controls
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 200;
    this.controls.target.set(0, 3, 0);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    this.directional = new THREE.DirectionalLight(0xffffff, 1.2);
    this.directional.position.set(15, 20, 10);
    this.directional.castShadow = true;
    this.directional.shadow.mapSize.set(2048, 2048);
    this.directional.shadow.camera.near = 0.5;
    this.directional.shadow.camera.far = 150;
    this.directional.shadow.camera.left = -30;
    this.directional.shadow.camera.right = 30;
    this.directional.shadow.camera.top = 30;
    this.directional.shadow.camera.bottom = -30;
    this.scene.add(this.directional);

    const fill = new THREE.DirectionalLight(0x4488ff, 0.3);
    fill.position.set(-10, 5, -8);
    this.scene.add(fill);

    // Grid — 50 m × 50 m, 1 m cells
    this.grid = new THREE.GridHelper(50, 50, 0x444466, 0x333355);
    (this.grid.material as THREE.Material).opacity = 0.6;
    (this.grid.material as THREE.Material).transparent = true;
    this.scene.add(this.grid);

    // Stage floor
    const floorGeo = new THREE.PlaneGeometry(60, 60);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1c1c2e,
      roughness: 0.9,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Event listeners
    canvas.addEventListener('click', this.onClick.bind(this));
    window.addEventListener('resize', this.onResize.bind(this));

    this.onResize();
    this.startRenderLoop();
  }

  // ─── Render loop ────────────────────────────────────────────────────────────

  private startRenderLoop() {
    const animate = () => {
      this.animFrameId = requestAnimationFrame(animate);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  dispose() {
    cancelAnimationFrame(this.animFrameId);
    this.controls.dispose();
    this.renderer.dispose();
  }

  // ─── Scene loading ──────────────────────────────────────────────────────────

  async loadMvr(buffer: ArrayBuffer, onProgress?: ProgressCallback): Promise<{
    mvrScene: MvrScene;
    stats: { fixtures: number; trusses: number; other: number };
  }> {
    // 1. Parse MVR
    const mvrScene = await parseMvr(buffer, onProgress);

    // 2. Parse all referenced GDTF files
    this.gdtfCache.clear();
    const gdtfRefs = collectGdtfRefs(mvrScene);
    let gdtfIdx = 0;
    for (const gdtfFilename of gdtfRefs) {
      gdtfIdx++;
      onProgress?.(`Loading GDTF ${gdtfIdx}/${gdtfRefs.size}: ${gdtfFilename}…`);

      // Per DIN SPEC 15801, GDTFSpec may omit the .gdtf extension.
      // Try both with and without extension.
      const candidates = [
        gdtfFilename,
        `${gdtfFilename}.gdtf`,
        gdtfFilename.replace(/\.gdtf$/i, ''),
      ];
      let data: ArrayBuffer | undefined;
      for (const c of candidates) {
        data = mvrScene.gdtfFiles.get(c);
        if (data) break;
      }

      if (!data) {
        console.warn(`GDTF file not found in archive: ${gdtfFilename}`);
        continue;
      }
      try {
        const gdtf = await parseGdtf(data);
        this.gdtfCache.set(gdtfFilename, gdtf);
      } catch (e) {
        console.warn(`Failed to parse GDTF ${gdtfFilename}:`, e);
      }
    }

    // 3. Build Three.js scene
    onProgress?.('Building 3D scene…');
    const { root, metaMap, layerGroups, stats } = await buildScene(
      mvrScene,
      this.gdtfCache,
      onProgress,
    );

    // 4. Replace old scene root
    if (this.sceneRoot) this.scene.remove(this.sceneRoot);
    this.sceneRoot = root;
    this.metaMap = metaMap;
    this.layerGroups = layerGroups;
    this.scene.add(root);

    // 5. Auto-fit camera to scene
    this.fitCameraToScene();

    return { mvrScene, stats };
  }

  // ─── Camera controls ────────────────────────────────────────────────────────

  fitCameraToScene() {
    if (!this.sceneRoot) return;

    const box = new THREE.Box3().setFromObject(this.sceneRoot);
    if (box.isEmpty()) {
      this.camera.position.set(10, 8, 15);
      this.controls.target.set(0, 3, 0);
      return;
    }

    const size = new THREE.Vector3();
    const centre = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(centre);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    const distance = Math.abs(maxDim / (2 * Math.tan(fov / 2))) * 1.8;

    this.controls.target.copy(centre);
    this.camera.position.set(
      centre.x + distance * 0.6,
      centre.y + distance * 0.4,
      centre.z + distance * 0.8,
    );
    this.camera.lookAt(centre);
    this.controls.update();
  }

  setTopView() {
    if (!this.sceneRoot) return;
    const box = new THREE.Box3().setFromObject(this.sceneRoot);
    const centre = new THREE.Vector3();
    box.getCenter(centre);
    this.controls.target.copy(centre);
    this.camera.position.set(centre.x, centre.y + 30, centre.z);
    this.camera.lookAt(centre);
    this.controls.update();
  }

  setFrontView() {
    if (!this.sceneRoot) return;
    const box = new THREE.Box3().setFromObject(this.sceneRoot);
    const centre = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(centre);
    box.getSize(size);
    this.controls.target.copy(centre);
    this.camera.position.set(centre.x, centre.y, centre.z + Math.max(size.x, size.y, size.z) * 1.5);
    this.camera.lookAt(centre);
    this.controls.update();
  }

  setSideView() {
    if (!this.sceneRoot) return;
    const box = new THREE.Box3().setFromObject(this.sceneRoot);
    const centre = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(centre);
    box.getSize(size);
    this.controls.target.copy(centre);
    this.camera.position.set(centre.x + Math.max(size.x, size.y, size.z) * 1.5, centre.y, centre.z);
    this.camera.lookAt(centre);
    this.controls.update();
  }

  // ─── Layer visibility ───────────────────────────────────────────────────────

  setLayerVisible(layerName: string, visible: boolean) {
    const group = this.layerGroups.get(layerName);
    if (group) group.visible = visible;
  }

  // ─── Toggle features ────────────────────────────────────────────────────────

  setGridVisible(visible: boolean) {
    this.grid.visible = visible;
  }

  setBeamVisible(visible: boolean) {
    if (this.sceneRoot) setBeamVisibility(this.sceneRoot, visible);
  }

  // ─── Selection / raycasting ─────────────────────────────────────────────────

  private onClick(event: MouseEvent) {
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();

    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    if (!this.sceneRoot) return;

    const intersects = this.raycaster.intersectObjects(this.sceneRoot.children, true);

    if (intersects.length === 0) {
      // Deselect
      const prev = this.selectedObj;
      this.selectedObj = null;
      highlightObject(null, prev);
      this.onSelection(null);
      return;
    }

    // Walk up to find the topmost object in metaMap
    let hit: THREE.Object3D = intersects[0].object;
    let meta: SceneObjectMeta | undefined;

    while (hit && !meta) {
      meta = this.metaMap.get(hit);
      if (!meta) hit = hit.parent as THREE.Object3D;
    }

    if (!meta) return;

    const prev = this.selectedObj;
    this.selectedObj = hit;
    highlightObject(hit, prev !== hit ? prev : null);
    this.onSelection(meta);
  }

  // ─── Resize ─────────────────────────────────────────────────────────────────

  resize() {
    const container = this.renderer.domElement.parentElement;
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private onResize() {
    this.resize();
  }

  getLayerNames(): string[] {
    return [...this.layerGroups.keys()];
  }

  getLayerVisible(name: string): boolean {
    return this.layerGroups.get(name)?.visible ?? true;
  }

  setSelectionCallback(cb: SelectionCallback) {
    this.onSelection = cb;
  }
}
