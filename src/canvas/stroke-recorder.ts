import type { StrokePoint, Stroke, BrushType, PaletteColor } from '../types';

const ERASER_COLOR: PaletteColor = {
  name: 'Eraser',
  rgb: [0, 0, 0],
  hsl: [0, 0, 0],
};

export type StrokeRecorderCallbacks = {
  onStrokeStart: (stroke: Stroke) => void;
  onStrokePoint: (strokeId: string, point: StrokePoint) => void;
  onStrokeEnd: (strokeId: string) => void;
  getActiveColor: () => PaletteColor | null;
  getActiveBrush: () => BrushType;
  isInputDisabled: () => boolean;
};

export function initStrokeRecorder(
  canvas: HTMLCanvasElement,
  callbacks: StrokeRecorderCallbacks,
): () => void {
  let activeStroke: { id: string; startTime: number; points: StrokePoint[] } | null = null;

  function normalizePoint(e: PointerEvent): StrokePoint {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
      pressure: e.pressure > 0 ? e.pressure : 0.5,
      timestamp: activeStroke ? performance.now() - activeStroke.startTime : 0,
    };
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || callbacks.isInputDisabled()) return;
    canvas.setPointerCapture(e.pointerId);

    const id = crypto.randomUUID();
    const startTime = performance.now();
    activeStroke = { id, startTime, points: [] };
    const point = normalizePoint(e);
    activeStroke.points.push(point);

    const stroke: Stroke = {
      id,
      color: callbacks.getActiveColor() ?? ERASER_COLOR,
      brush: callbacks.getActiveBrush(),
      points: [point],
    };
    callbacks.onStrokeStart(stroke);
  }

  function onPointerMove(e: PointerEvent) {
    if (!activeStroke) return;
    const point = normalizePoint(e);
    activeStroke.points.push(point);
    callbacks.onStrokePoint(activeStroke.id, point);
  }

  function onPointerUp(_e: PointerEvent) {
    if (!activeStroke) return;
    callbacks.onStrokeEnd(activeStroke.id);
    activeStroke = null;
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
  };
}
