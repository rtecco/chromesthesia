import type { BrushType, EraserTool, Painting, Stroke, StrokePoint } from './types';
import { createRenderer } from './canvas/renderer';
import { createBrushState, type BrushState } from './canvas/brushes';
import { initStrokeRecorder } from './canvas/stroke-recorder';
import { initControls } from './ui/controls';
import { ensureResumed } from './audio/engine';
import { createVoice, type Voice } from './audio/voices';
import { voiceParamsFromColor, positionMod } from './audio/mappings';
import { getEffectChain } from './audio/effects';

const LOOP_LENGTH_MS = 4000;
const ERASERS: ReadonlySet<BrushType> = new Set<EraserTool>(['scraper', 'solvent']);

let painting: Painting = {
  version: 1,
  canvasAspect: 16 / 9,
  loopLengthMs: LOOP_LENGTH_MS,
  strokes: [],
};

type ActiveStroke = {
  stroke: Stroke;
  points: StrokePoint[];
  brushState: BrushState;
  voice: Voice | null;
};

const activeStrokes = new Map<string, ActiveStroke>();

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const renderer = createRenderer(canvas);

let playing = false;

const controls = initControls({
  onPlayStop() {
    playing = !playing;
    // TODO: Stage 4 — start/stop playhead
    return playing;
  },
  onClear() {
    playing = false;
    // TODO: Stage 4 — stop playhead
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
    let voice: Voice | null = null;

    // Only create sound for paint brushes, not erasers
    if (!ERASERS.has(stroke.brush)) {
      void ensureResumed();
      const params = voiceParamsFromColor(stroke.color);
      const mod = positionMod(stroke.points[0]);
      voice = createVoice(params, mod, 0.5);
      const chain = getEffectChain(stroke.brush);
      voice.output.connect(chain.input);
    }

    activeStrokes.set(stroke.id, { stroke, points: [...stroke.points], brushState, voice });
  },

  onStrokePoint(strokeId: string, point: StrokePoint) {
    const entry = activeStrokes.get(strokeId);
    if (!entry) return;

    const prev = entry.points[entry.points.length - 1];
    entry.points.push(point);
    renderer.drawSegment(entry.stroke, prev, point, entry.brushState);

    // Update voice with new position
    if (entry.voice) {
      const mod = positionMod(point);
      entry.voice.updatePosition(mod);
    }
  },

  onStrokeEnd(strokeId: string) {
    const entry = activeStrokes.get(strokeId);
    if (!entry) return;

    // Release the voice
    if (entry.voice) {
      entry.voice.stop();
    }

    const finishedStroke: Stroke = {
      ...entry.stroke,
      points: entry.points,
    };
    painting = { ...painting, strokes: [...painting.strokes, finishedStroke] };
    activeStrokes.delete(strokeId);
  },
});

window.addEventListener('resize', () => renderer.resize());
