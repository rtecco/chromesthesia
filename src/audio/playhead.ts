import type { BrushType, EraserTool, PaletteColor, Painting, StrokePoint } from '../types';
import { getAudioContext, ensureResumed } from './engine';
import { createVoice, type Voice } from './voices';
import { voiceParamsFromColor, positionMod } from './mappings';
import { getEffectChain } from './effects';
import { debugParams } from '../ui/debug';

const COLUMNS = 128;
const LOOKAHEAD_MS = 50;
const SCHEDULE_INTERVAL_MS = 25;

const ERASERS: ReadonlySet<BrushType> = new Set<EraserTool>(['scraper', 'solvent']);

export type Playhead = {
  start: () => void;
  stop: () => void;
  isPlaying: () => boolean;
  getPosition: () => number; // 0..1 normalized X position
};

type ActivePlayheadVoice = {
  voice: Voice;
  startedAtCol: number;
};

export function createPlayhead(
  getPainting: () => Painting,
  onPositionChange: (x: number) => void,
): Playhead {
  let playing = false;
  let schedulerTimer: ReturnType<typeof setInterval> | null = null;
  let animFrameId = 0;
  let loopStartTime = 0; // AudioContext time when loop started
  let lastScheduledCol = -1;
  const activeVoices: ActivePlayheadVoice[] = [];

  function getLoopDuration(): number {
    return getPainting().loopLengthMs / 1000; // seconds
  }

  function getColumnDuration(): number {
    return getLoopDuration() / COLUMNS;
  }

  // Find strokes that pass through a given column (normalized X range)
  function strokesAtColumn(col: number): { color: PaletteColor; brush: BrushType; avgPoint: StrokePoint }[] {
    const painting = getPainting();
    const colStart = col / COLUMNS;
    const colEnd = (col + 1) / COLUMNS;
    const results: { color: PaletteColor; brush: BrushType; avgPoint: StrokePoint }[] = [];

    for (const stroke of painting.strokes) {
      if (ERASERS.has(stroke.brush)) continue;

      // Find points within this column's X range
      const pointsInCol: StrokePoint[] = [];
      for (const pt of stroke.points) {
        if (pt.x >= colStart && pt.x < colEnd) {
          pointsInCol.push(pt);
        }
      }
      // Also check segments that cross through this column
      for (let i = 1; i < stroke.points.length; i++) {
        const a = stroke.points[i - 1];
        const b = stroke.points[i];
        if ((a.x < colStart && b.x >= colStart) || (a.x >= colEnd && b.x < colEnd)) {
          // Interpolate a point at the column boundary
          const t = (colStart - a.x) / (b.x - a.x);
          if (t >= 0 && t <= 1) {
            pointsInCol.push({
              x: colStart,
              y: a.y + (b.y - a.y) * t,
              pressure: a.pressure + (b.pressure - a.pressure) * t,
              timestamp: a.timestamp + (b.timestamp - a.timestamp) * t,
            });
          }
        }
      }

      if (pointsInCol.length === 0) continue;

      // Average the points for this stroke in this column
      let sumX = 0, sumY = 0, sumP = 0;
      for (const p of pointsInCol) {
        sumX += p.x;
        sumY += p.y;
        sumP += p.pressure;
      }
      const n = pointsInCol.length;
      results.push({
        color: stroke.color,
        brush: stroke.brush,
        avgPoint: {
          x: sumX / n,
          y: sumY / n,
          pressure: sumP / n,
          timestamp: 0,
        },
      });
    }

    return results;
  }

  function triggerColumn(col: number, when: number) {
    const colDur = getColumnDuration();
    const hits = strokesAtColumn(col);

    // Scale gain down when many strokes hit the same column
    const density = hits.length;
    const gainScale = density <= 1 ? 1.0 : 1.0 / Math.sqrt(density);

    for (const hit of hits) {
      // Voice stealing: remove oldest if at limit
      while (activeVoices.length >= debugParams.maxVoices) {
        const oldest = activeVoices.shift()!;
        oldest.voice.stop();
      }

      const params = voiceParamsFromColor(hit.color);
      const mod = positionMod(hit.avgPoint);
      const voice = createVoice(params, mod, hit.avgPoint.pressure, gainScale);
      const chain = getEffectChain(hit.brush);
      voice.output.connect(chain.input);

      // Schedule stop — overlap controlled by debug slider
      voice.stop(when + colDur * debugParams.voiceOverlap);

      activeVoices.push({ voice, startedAtCol: col });
    }

    // Clean up voices that have finished
    const now = getAudioContext().currentTime;
    for (let i = activeVoices.length - 1; i >= 0; i--) {
      const age = (now - when) + (col - activeVoices[i].startedAtCol) * colDur;
      if (age > colDur * 2) {
        activeVoices.splice(i, 1);
      }
    }
  }

  function schedule() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const loopDur = getLoopDuration();
    const colDur = getColumnDuration();
    const lookaheadSec = LOOKAHEAD_MS / 1000;

    // How far into the loop are we?
    const elapsed = now - loopStartTime;

    // Schedule columns up to the lookahead window
    const endTime = now + lookaheadSec;
    let col = lastScheduledCol + 1;
    if (col >= COLUMNS) col = 0;

    while (true) {
      // Time when this column should play
      const colLoopTime = (col / COLUMNS) * loopDur;
      // Which loop iteration are we in?
      const loopIteration = Math.floor(elapsed / loopDur);
      let colAbsTime = loopStartTime + loopIteration * loopDur + colLoopTime;

      // If this column's time has already passed in this iteration, it's in the next one
      if (colAbsTime < now - colDur) {
        colAbsTime += loopDur;
      }

      if (colAbsTime > endTime) break;
      if (colAbsTime >= now - 0.01) {
        triggerColumn(col, colAbsTime);
        lastScheduledCol = col;
      }

      col = (col + 1) % COLUMNS;
      // Safety: don't schedule more than COLUMNS in one pass
      if (col === (lastScheduledCol + 1) % COLUMNS) break;
    }
  }

  function updateVisual() {
    if (!playing) return;
    const ctx = getAudioContext();
    const elapsed = ctx.currentTime - loopStartTime;
    const loopDur = getLoopDuration();
    const position = (elapsed % loopDur) / loopDur;
    onPositionChange(position);
    animFrameId = requestAnimationFrame(updateVisual);
  }

  function stopAllVoices() {
    for (const v of activeVoices) {
      v.voice.stop();
    }
    activeVoices.length = 0;
  }

  return {
    start() {
      if (playing) return;
      playing = true;
      void ensureResumed();
      const ctx = getAudioContext();
      loopStartTime = ctx.currentTime;
      lastScheduledCol = -1;

      schedulerTimer = setInterval(schedule, SCHEDULE_INTERVAL_MS);
      schedule(); // immediate first pass
      animFrameId = requestAnimationFrame(updateVisual);
    },

    stop() {
      if (!playing) return;
      playing = false;
      if (schedulerTimer !== null) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
      }
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = 0;
      }
      stopAllVoices();
      onPositionChange(-1); // hide playhead
    },

    isPlaying: () => playing,
    getPosition() {
      if (!playing) return 0;
      const ctx = getAudioContext();
      const elapsed = ctx.currentTime - loopStartTime;
      return (elapsed % getLoopDuration()) / getLoopDuration();
    },
  };
}
