import type { BrushType, EraserTool, Painting, Stroke, StrokePoint } from './types';
import { createRenderer } from './canvas/renderer';
import { createBrushState, type BrushState } from './canvas/brushes';
import { initStrokeRecorder } from './canvas/stroke-recorder';
import { initControls, type AudioMode } from './ui/controls';
import { ensureResumed } from './audio/engine';
import { createVoice, type Voice } from './audio/voices';
import { voiceParamsFromColor, positionMod } from './audio/mappings';
import { getEffectChain } from './audio/effects';
import { createPlayhead } from './audio/playhead';
import { initDebugPanel } from './ui/debug';
import { getMasterOutput } from './audio/engine';

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

const playhead = createPlayhead(() => painting);

// Feed active replay strokes to renderer for shimmer effect
function updateShimmer() {
  renderer.setShimmerStrokes(
    playhead.getActiveStrokes().map((s) => ({
      points: s.points,
      color: s.color,
      progress: s.progress,
    })),
  );
  requestAnimationFrame(updateShimmer);
}
requestAnimationFrame(updateShimmer);

const { state: controls, setMode } = initControls({
  onModeChange(mode: AudioMode) {
    canvas.classList.toggle('input-disabled', mode === 'playhead');
    if (mode === 'playhead') {
      playhead.start();
    } else {
      playhead.stop();
    }
  },
  onClear() {
    playhead.stop();
    painting = { ...painting, strokes: [] };
    activeStrokes.clear();
    renderer.clear();
  },
});

initStrokeRecorder(canvas, {
  getActiveColor: () => controls.activeColor,
  getActiveBrush: () => controls.activeBrush,
  isInputDisabled: () => controls.audioMode === 'playhead',

  onStrokeStart(stroke: Stroke) {
    const brushState = createBrushState(stroke.brush);
    let voice: Voice | null = null;

    // Live audition: only in live mode, only for paint brushes
    if (controls.audioMode === 'live' && !ERASERS.has(stroke.brush)) {
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

    if (entry.voice) {
      const mod = positionMod(point);
      entry.voice.updatePosition(mod);
    }
  },

  onStrokeEnd(strokeId: string) {
    const entry = activeStrokes.get(strokeId);
    if (!entry) return;

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

initDebugPanel((v) => {
  getMasterOutput().gain.value = v;
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  // Ignore when typing in an input
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      setMode(controls.audioMode === 'live' ? 'playhead' : 'live');
      break;
    case 'Escape':
      setMode('live');
      break;
    case 'Delete':
    case 'Backspace':
      e.preventDefault();
      playhead.stop();
      painting = { ...painting, strokes: [] };
      activeStrokes.clear();
      renderer.clear();
      setMode('live');
      break;
  }
});
