import type { BrushType } from '../types';
import { getAudioContext, getMasterOutput } from './engine';

export type EffectChain = {
  input: GainNode;
};

// Reverb
const REVERB_DURATION = 2.5;     // impulse response length (seconds)
const REVERB_DECAY = 0.6;        // exponential decay rate
const REVERB_WET = 0.35;
const REVERB_DRY = 0.65;

// Chorus (oil-round)
const CHORUS_DRY = 0.6;
const CHORUS_RATES = [1.8, 2.3]; // LFO rates (Hz)
const CHORUS_MAX_DELAY = 0.05;   // seconds
const CHORUS_BASE_DELAY = 0.005; // seconds
const CHORUS_DEPTH = 0.002;      // LFO modulation amount
const CHORUS_WET = 0.3;

// Distortion + slap delay (palette-knife)
const DISTORTION_AMOUNT = 3;
const DISTORTION_CURVE_SIZE = 256;
const SLAP_DELAY_TIME = 0.08;    // seconds
const SLAP_FEEDBACK = 0.25;
const SLAP_WET = 0.3;

// Tremolo (dry-brush)
const TREMOLO_RATE = 35;         // Hz — fast stutter
const TREMOLO_DEPTH = 0.5;

// Synthetic impulse response for reverb — exponentially decaying noise
function createReverbIR(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * decay));
    }
  }
  return buffer;
}

let reverbIR: AudioBuffer | null = null;

function getReverbIR(ctx: AudioContext): AudioBuffer {
  if (!reverbIR || reverbIR.sampleRate !== ctx.sampleRate) {
    reverbIR = createReverbIR(ctx, REVERB_DURATION, REVERB_DECAY);
  }
  return reverbIR;
}

// Waveshaper curve for distortion
function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = DISTORTION_CURVE_SIZE;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(x * amount);
  }
  return curve;
}

function createOilFlatChain(): EffectChain {
  const ctx = getAudioContext();
  const master = getMasterOutput();

  const input = ctx.createGain();
  input.gain.value = 1.0;

  // Reverb
  const convolver = ctx.createConvolver();
  convolver.buffer = getReverbIR(ctx);
  const wetGain = ctx.createGain();
  wetGain.gain.value = REVERB_WET;
  const dryGain = ctx.createGain();
  dryGain.gain.value = REVERB_DRY;

  input.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(master);
  input.connect(dryGain);
  dryGain.connect(master);

  return { input };
}

function createOilRoundChain(): EffectChain {
  const ctx = getAudioContext();
  const master = getMasterOutput();

  const input = ctx.createGain();
  input.gain.value = 1.0;

  // Chorus: two slightly detuned delayed copies
  const dry = ctx.createGain();
  dry.gain.value = CHORUS_DRY;
  input.connect(dry);
  dry.connect(master);

  for (const rate of CHORUS_RATES) {
    const delay = ctx.createDelay(CHORUS_MAX_DELAY);
    delay.delayTime.value = CHORUS_BASE_DELAY;

    // LFO modulating delay time
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = rate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = CHORUS_DEPTH;
    lfo.connect(lfoGain);
    lfoGain.connect(delay.delayTime);
    lfo.start();

    const wet = ctx.createGain();
    wet.gain.value = CHORUS_WET;
    input.connect(delay);
    delay.connect(wet);
    wet.connect(master);
  }

  return { input };
}

function createPaletteKnifeChain(): EffectChain {
  const ctx = getAudioContext();
  const master = getMasterOutput();

  const input = ctx.createGain();
  input.gain.value = 1.0;

  // Distortion
  const shaper = ctx.createWaveShaper();
  shaper.curve = makeDistortionCurve(DISTORTION_AMOUNT);
  shaper.oversample = '2x';

  // Slap delay
  const delay = ctx.createDelay(SLAP_DELAY_TIME * 3);
  delay.delayTime.value = SLAP_DELAY_TIME;
  const feedback = ctx.createGain();
  feedback.gain.value = SLAP_FEEDBACK;
  const delayWet = ctx.createGain();
  delayWet.gain.value = SLAP_WET;

  input.connect(shaper);
  shaper.connect(master);

  shaper.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(delayWet);
  delayWet.connect(master);

  return { input };
}

function createDryBrushChain(): EffectChain {
  const ctx = getAudioContext();
  const master = getMasterOutput();

  const input = ctx.createGain();
  input.gain.value = 1.0;

  // Rapid tremolo — gritty, broken texture
  const tremGain = ctx.createGain();
  tremGain.gain.value = TREMOLO_DEPTH;

  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = TREMOLO_RATE;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = TREMOLO_DEPTH;
  lfo.connect(lfoDepth);
  lfoDepth.connect(tremGain.gain);
  lfo.start();

  input.connect(tremGain);
  tremGain.connect(master);

  return { input };
}

function createPassthroughChain(): EffectChain {
  const ctx = getAudioContext();
  const master = getMasterOutput();
  const input = ctx.createGain();
  input.gain.value = 1.0;
  input.connect(master);
  return { input };
}

const chainFactories: Record<BrushType, () => EffectChain> = {
  'oil-flat': createOilFlatChain,
  'oil-round': createOilRoundChain,
  'palette-knife': createPaletteKnifeChain,
  'dry-brush': createDryBrushChain,
  'scraper': createPassthroughChain,
  'solvent': createPassthroughChain,
};

// Cache one effect chain per brush type
const chainCache = new Map<BrushType, EffectChain>();

export function getEffectChain(brush: BrushType): EffectChain {
  let chain = chainCache.get(brush);
  if (!chain) {
    chain = chainFactories[brush]();
    chainCache.set(brush, chain);
  }
  return chain;
}
