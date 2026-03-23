import type { BrushType, PaletteColor } from '../types';
import { DEFAULT_PALETTE } from '../canvas/palette';

export type ControlState = {
  activeColor: PaletteColor;
  activeBrush: BrushType;
};

export type ControlCallbacks = {
  onPlay: () => void;
  onStop: () => void;
  onClear: () => void;
};

const BRUSH_LABELS: Record<BrushType, string> = {
  'oil-flat': 'Flat',
  'oil-round': 'Round',
  'palette-knife': 'Knife',
  'dry-brush': 'Dry',
};

export function initControls(callbacks: ControlCallbacks): ControlState {
  const state: ControlState = {
    activeColor: DEFAULT_PALETTE[0],
    activeBrush: 'oil-flat',
  };

  // Color picker
  const colorContainer = document.getElementById('color-picker')!;
  DEFAULT_PALETTE.forEach((color) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'swatch';
    swatch.style.background = `rgb(${color.rgb[0]},${color.rgb[1]},${color.rgb[2]})`;
    swatch.title = color.name;
    if (color === state.activeColor) swatch.classList.add('active');

    swatch.addEventListener('click', () => {
      state.activeColor = color;
      colorContainer.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active'));
      swatch.classList.add('active');
    });

    colorContainer.appendChild(swatch);
  });

  // Brush picker
  const brushContainer = document.getElementById('brush-picker')!;
  (Object.keys(BRUSH_LABELS) as BrushType[]).forEach((brush) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'brush-btn';
    btn.textContent = BRUSH_LABELS[brush];
    if (brush === state.activeBrush) btn.classList.add('active');

    btn.addEventListener('click', () => {
      state.activeBrush = brush;
      brushContainer.querySelectorAll('.brush-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });

    brushContainer.appendChild(btn);
  });

  // Transport controls
  document.getElementById('btn-play')!.addEventListener('click', callbacks.onPlay);
  document.getElementById('btn-stop')!.addEventListener('click', callbacks.onStop);
  document.getElementById('btn-clear')!.addEventListener('click', callbacks.onClear);

  return state;
}
