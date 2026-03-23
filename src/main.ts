import type { Painting, PlaybackState } from './types';

const LOOP_LENGTH_MS = 4000;

const painting: Painting = {
  version: 1,
  canvasAspect: 16 / 9,
  loopLengthMs: LOOP_LENGTH_MS,
  strokes: [],
};

const playback: PlaybackState = { status: 'stopped' };

void painting;
void playback;

console.log('Sound Painter loaded');
