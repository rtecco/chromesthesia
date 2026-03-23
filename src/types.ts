export type PaintBrush = 'oil-flat' | 'oil-round' | 'palette-knife' | 'dry-brush';
export type EraserTool = 'scraper' | 'solvent';
export type BrushType = PaintBrush | EraserTool;

export type PaletteColor = {
  readonly name: string;
  readonly rgb: readonly [number, number, number];
  readonly hsl: readonly [number, number, number];
};

export type StrokePoint = {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly timestamp: number;
};

export type Stroke = {
  readonly id: string;
  readonly color: PaletteColor;
  readonly brush: BrushType;
  readonly points: readonly StrokePoint[];
};

export type Painting = {
  readonly version: 1;
  readonly canvasAspect: number;
  readonly loopLengthMs: number;
  readonly strokes: readonly Stroke[];
};

export type PlaybackState =
  | { readonly status: 'stopped' }
  | { readonly status: 'playing'; readonly startedAt: number; readonly loopLengthMs: number };
