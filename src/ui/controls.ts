import type { BrushType, PaletteColor } from '../types';
import { createPalette } from '../canvas/palette';
import { hexToRgb, rgbToHex, rgbToHsl } from '../utils/color';

export type AudioMode = 'live' | 'playhead';

export type ControlState = {
  activeColor: PaletteColor | null;
  activeBrush: BrushType;
  palette: (PaletteColor | null)[];
  audioMode: AudioMode;
};

export type ControlCallbacks = {
  onModeChange: (mode: AudioMode) => void;
  onClear: () => void;
};

const PAINT_BRUSHES: { type: BrushType; label: string }[] = [
  { type: 'oil-flat', label: 'Flat' },
  { type: 'oil-round', label: 'Round' },
  { type: 'palette-knife', label: 'Knife' },
  { type: 'dry-brush', label: 'Dry' },
];

const ERASER_TOOLS: { type: BrushType; label: string }[] = [
  { type: 'scraper', label: 'Scraper' },
  { type: 'solvent', label: 'Solvent' },
];

function isEraserTool(brush: BrushType): boolean {
  return brush === 'scraper' || brush === 'solvent';
}

export function initControls(callbacks: ControlCallbacks): ControlState {
  const palette = createPalette();

  const state: ControlState = {
    activeColor: palette[0],
    activeBrush: 'oil-flat',
    palette,
    audioMode: 'live',
  };

  // Hidden color input for editing swatches
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.style.position = 'absolute';
  colorInput.style.opacity = '0';
  colorInput.style.pointerEvents = 'none';
  document.body.appendChild(colorInput);

  let editingIndex = -1;
  let editingSwatch: HTMLButtonElement | null = null;

  colorInput.addEventListener('input', () => {
    if (editingIndex < 0 || !editingSwatch) return;
    const [r, g, b] = hexToRgb(colorInput.value);
    const hsl = rgbToHsl(r, g, b);
    const updated: PaletteColor = {
      name: `Custom (${colorInput.value})`,
      rgb: [r, g, b],
      hsl,
    };
    palette[editingIndex] = updated;
    state.activeColor = updated;
    editingSwatch.style.background = `rgb(${r},${g},${b})`;
    editingSwatch.classList.remove('empty');
    editingSwatch.title = updated.name;
  });

  function selectSwatch(swatch: HTMLButtonElement, index: number) {
    const color = palette[index];
    if (!color) return; // can't select empty slot
    state.activeColor = color;
    // If we were on an eraser, switch back to last paint brush
    if (isEraserTool(state.activeBrush)) {
      state.activeBrush = 'oil-flat';
      updateBrushSelection();
    }
    colorContainer.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active'));
    swatch.classList.add('active');
  }

  function openColorPicker(swatch: HTMLButtonElement, index: number) {
    editingIndex = index;
    editingSwatch = swatch;
    const c = palette[index];
    colorInput.value = c ? rgbToHex(c.rgb[0], c.rgb[1], c.rgb[2]) : '#808080';
    colorInput.click();
  }

  // Color picker
  const colorContainer = document.getElementById('color-picker')!;
  palette.forEach((color, index) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'swatch';
    if (color) {
      swatch.style.background = `rgb(${color.rgb[0]},${color.rgb[1]},${color.rgb[2]})`;
      swatch.title = color.name;
    } else {
      swatch.classList.add('empty');
      swatch.title = 'Double-click to add color';
    }
    if (index === 0) swatch.classList.add('active');

    swatch.addEventListener('click', () => selectSwatch(swatch, index));

    swatch.addEventListener('dblclick', (e) => {
      e.preventDefault();
      openColorPicker(swatch, index);
    });

    colorContainer.appendChild(swatch);
  });

  // Brush picker
  const brushContainer = document.getElementById('brush-picker')!;

  function updateBrushSelection() {
    brushContainer.querySelectorAll('.brush-btn').forEach((b) => b.classList.remove('active'));
    const active = brushContainer.querySelector(`[data-brush="${state.activeBrush}"]`);
    if (active) active.classList.add('active');
  }

  PAINT_BRUSHES.forEach(({ type, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'brush-btn';
    btn.dataset.brush = type;
    btn.textContent = label;
    if (type === state.activeBrush) btn.classList.add('active');

    btn.addEventListener('click', () => {
      state.activeBrush = type;
      updateBrushSelection();
    });

    brushContainer.appendChild(btn);
  });

  // Separator
  const sep = document.createElement('span');
  sep.className = 'toolbar-sep';
  brushContainer.appendChild(sep);

  ERASER_TOOLS.forEach(({ type, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'brush-btn eraser-btn';
    btn.dataset.brush = type;
    btn.textContent = label;

    btn.addEventListener('click', () => {
      state.activeBrush = type;
      updateBrushSelection();
      // Deselect color swatch when using eraser
      colorContainer.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active'));
    });

    brushContainer.appendChild(btn);
  });

  // Mode toggle
  const liveBtn = document.getElementById('btn-live')!;
  const playheadBtn = document.getElementById('btn-playhead')!;

  function setMode(mode: AudioMode) {
    state.audioMode = mode;
    liveBtn.classList.toggle('active', mode === 'live');
    playheadBtn.classList.toggle('active', mode === 'playhead');
    callbacks.onModeChange(mode);
  }

  liveBtn.addEventListener('click', () => setMode('live'));
  playheadBtn.addEventListener('click', () => setMode('playhead'));

  document.getElementById('btn-clear')!.addEventListener('click', () => {
    callbacks.onClear();
    setMode('live');
  });

  return state;
}
