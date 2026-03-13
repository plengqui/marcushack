/**
 * GDTF Stage Lighting Rig Viewer — entry point
 */

import './style.css';
import { GdtfViewer } from './viewer';
import { setupUI } from './ui';

const canvas = document.getElementById('viewport') as HTMLCanvasElement;

const viewer = new GdtfViewer(canvas, (_meta) => {
  // Selection handled by UI module
});

setupUI(viewer);
