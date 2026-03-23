import type { PaletteColor } from '../types';

export const DEFAULT_PALETTE: readonly PaletteColor[] = [
  { name: 'Cadmium Red',    rgb: [220, 50, 32],   hsl: [6, 75, 49] },
  { name: 'Cobalt Blue',    rgb: [30, 60, 200],    hsl: [229, 74, 45] },
  { name: 'Lavender',       rgb: [180, 160, 210],  hsl: [264, 33, 73] },
  { name: 'Ochre Gold',     rgb: [200, 160, 50],   hsl: [44, 60, 49] },
  { name: 'Titanium White', rgb: [245, 242, 235],  hsl: [42, 33, 94] },
];

export const EMPTY_SLOTS = 3;

export function createPalette(): (PaletteColor | null)[] {
  const slots: (PaletteColor | null)[] = DEFAULT_PALETTE.map((c) => ({ ...c }));
  for (let i = 0; i < EMPTY_SLOTS; i++) slots.push(null);
  return slots;
}
