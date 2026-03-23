import type { BrushType, EraserTool, Painting, PaletteColor, StrokePoint } from '../types';
import { getAudioContext, ensureResumed } from './engine';
import { createVoice, type Voice } from './voices';
import { voiceParamsFromColor, positionMod } from './mappings';
import { getEffectChain } from './effects';
import { debugParams } from '../ui/debug';

const ERASERS: ReadonlySet<BrushType> = new Set<EraserTool>(['scraper', 'solvent']);
const LOOKAHEAD_MS = 80;
const SCHEDULE_INTERVAL_MS = 30;

export type Playhead = {
  start: () => void;
  stop: () => void;
  isPlaying: () => boolean;
};

/**
 * Stroke-replay: replays each stroke as a single continuous voice
 * (matching live audition behavior), updating position along the
 * recorded trajectory. Loops with a pause at the end.
 */
export function createPlayhead(
  getPainting: () => Painting,
): Playhead {
  let playing = false;
  let schedulerTimer: ReturnType<typeof setInterval> | null = null;
  let loopStartTime = 0;
  let loopDuration = 0;

  type ScheduledStroke = {
    color: PaletteColor;
    brush: BrushType;
    startOffset: number;   // seconds from loop start
    duration: number;      // seconds
    points: readonly StrokePoint[];
  };

  let schedule: ScheduledStroke[] = [];
  let nextStrokeIdx = 0;

  type ActiveStrokeVoice = {
    voice: Voice;
    ss: ScheduledStroke;
    voiceStartTime: number; // absolute AudioContext time when voice started
    nextPointIdx: number;
    stopTime: number;
  };
  const activeVoices: ActiveStrokeVoice[] = [];

  // Check what fraction of a stroke's points have been erased
  function erasedFraction(
    strokeIdx: number,
    allStrokes: readonly { brush: BrushType; points: readonly StrokePoint[] }[],
  ): number {
    const stroke = allStrokes[strokeIdx];
    const RADIUS = 0.04; // normalized distance threshold
    const rSq = RADIUS * RADIUS;

    // Collect all eraser points from strokes painted AFTER this one
    const eraserPoints: StrokePoint[] = [];
    for (let i = strokeIdx + 1; i < allStrokes.length; i++) {
      if (ERASERS.has(allStrokes[i].brush)) {
        for (const pt of allStrokes[i].points) {
          eraserPoints.push(pt);
        }
      }
    }
    if (eraserPoints.length === 0) return 0;

    let erased = 0;
    for (const pt of stroke.points) {
      for (const ep of eraserPoints) {
        const dx = pt.x - ep.x;
        const dy = pt.y - ep.y;
        if (dx * dx + dy * dy < rSq) {
          erased++;
          break;
        }
      }
    }
    return erased / stroke.points.length;
  }

  function buildSchedule(): { items: ScheduledStroke[]; totalDuration: number } {
    const painting = getPainting();
    const allStrokes = painting.strokes.filter((s) => s.points.length >= 2);
    const paintStrokes = allStrokes
      .map((s, i) => ({ stroke: s, originalIdx: i }))
      .filter(({ stroke }) => !ERASERS.has(stroke.brush));

    if (paintStrokes.length === 0) return { items: [], totalDuration: 0 };

    const GAP = 0.08;
    const items: ScheduledStroke[] = [];
    let offset = 0;

    for (const { stroke, originalIdx } of paintStrokes) {
      // Skip strokes that are mostly erased
      if (erasedFraction(originalIdx, allStrokes) > 0.5) continue;

      const pts = stroke.points;
      const dur = Math.max(pts[pts.length - 1].timestamp - pts[0].timestamp, 200) / 1000;
      items.push({
        color: stroke.color,
        brush: stroke.brush,
        startOffset: offset,
        duration: dur,
        points: pts,
      });
      offset += dur + GAP;
    }

    const pauseDuration = 1.0;
    const totalDuration = offset - (items.length > 1 ? GAP : 0) + pauseDuration;
    return { items, totalDuration };
  }

  function startStrokeVoice(ss: ScheduledStroke, when: number) {
    // Voice stealing
    while (activeVoices.length >= debugParams.maxVoices) {
      const oldest = activeVoices.shift()!;
      oldest.voice.stop();
    }

    const firstPoint = ss.points[0];
    const params = voiceParamsFromColor(ss.color);
    const mod = positionMod(firstPoint);
    const voice = createVoice(params, mod, 0.5);
    const chain = getEffectChain(ss.brush);
    voice.output.connect(chain.input);

    const stopTime = when + ss.duration;
    voice.stop(stopTime);

    activeVoices.push({ voice, ss, voiceStartTime: when, nextPointIdx: 1, stopTime });
  }

  function scheduleAhead() {
    if (schedule.length === 0) return;

    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const lookahead = LOOKAHEAD_MS / 1000;

    // Check if we need to start a new loop
    if (nextStrokeIdx >= schedule.length && now >= loopStartTime + loopDuration - lookahead) {
      loopStartTime = Math.max(loopStartTime + loopDuration, now);
      nextStrokeIdx = 0;
    }

    // Start new stroke voices that fall within the lookahead window
    while (nextStrokeIdx < schedule.length) {
      const ss = schedule[nextStrokeIdx];
      const absTime = loopStartTime + ss.startOffset;

      if (absTime > now + lookahead) break;

      // Use absTime directly — Web Audio handles near-past scheduling,
      // and this preserves relative timing between strokes
      startStrokeVoice(ss, absTime);
      nextStrokeIdx++;
    }

    // Update position on active voices using their own start time
    for (const av of activeVoices) {
      const strokeElapsed = now - av.voiceStartTime;
      if (strokeElapsed < 0) continue;

      while (av.nextPointIdx < av.ss.points.length) {
        const pointTime = (av.ss.points[av.nextPointIdx].timestamp - av.ss.points[0].timestamp) / 1000;
        if (pointTime > strokeElapsed) break;

        const mod = positionMod(av.ss.points[av.nextPointIdx]);
        av.voice.updatePosition(mod);
        av.nextPointIdx++;
      }
    }

    // Cleanup finished voices
    for (let i = activeVoices.length - 1; i >= 0; i--) {
      if (activeVoices[i].stopTime < now - 0.5) {
        activeVoices.splice(i, 1);
      }
    }
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

      const built = buildSchedule();
      schedule = built.items;
      loopDuration = built.totalDuration;
      if (loopDuration <= 0) {
        playing = false;
        return;
      }

      nextStrokeIdx = 0;
      loopStartTime = getAudioContext().currentTime;

      schedulerTimer = setInterval(scheduleAhead, SCHEDULE_INTERVAL_MS);
      scheduleAhead();
    },

    stop() {
      if (!playing) return;
      playing = false;
      if (schedulerTimer !== null) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
      }
      stopAllVoices();
      schedule = [];
    },

    isPlaying: () => playing,
  };
}
