import type { Painting, Stroke, StrokePoint } from './types';
import { createRenderer } from './canvas/renderer';
import { createBrushState, type BrushState } from './canvas/brushes';
import { initStrokeRecorder } from './canvas/stroke-recorder';
import { initControls } from './ui/controls';

const LOOP_LENGTH_MS = 4000;

let painting: Painting = {
  version: 1,
  canvasAspect: 16 / 9,
  loopLengthMs: LOOP_LENGTH_MS,
  strokes: [],
};

// Active strokes being drawn (mutable during recording, frozen on end)
const activeStrokes = new Map<string, { stroke: Stroke; points: StrokePoint[]; brushState: BrushState }>();

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const renderer = createRenderer(canvas);

const controls = initControls({
  onPlay() {
    // TODO: Stage 4 — playhead
  },
  onStop() {
    // TODO: Stage 4 — playhead
  },
  onClear() {
    painting = { ...painting, strokes: [] };
    activeStrokes.clear();
    renderer.clear();
  },
});

initStrokeRecorder(canvas, {
  getActiveColor: () => controls.activeColor,
  getActiveBrush: () => controls.activeBrush,

  onStrokeStart(stroke: Stroke) {
    const brushState = createBrushState(stroke.brush);
    activeStrokes.set(stroke.id, { stroke, points: [...stroke.points], brushState });
  },

  onStrokePoint(strokeId: string, point: StrokePoint) {
    const entry = activeStrokes.get(strokeId);
    if (!entry) return;

    const prev = entry.points[entry.points.length - 1];
    entry.points.push(point);
    renderer.drawSegment(entry.stroke, prev, point, entry.brushState);
  },

  onStrokeEnd(strokeId: string) {
    const entry = activeStrokes.get(strokeId);
    if (!entry) return;

    const finishedStroke: Stroke = {
      ...entry.stroke,
      points: entry.points,
    };
    painting = { ...painting, strokes: [...painting.strokes, finishedStroke] };
    activeStrokes.delete(strokeId);
  },
});

window.addEventListener('resize', () => renderer.resize());
