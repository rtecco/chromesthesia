import type { BrushType } from '../types';
import { getAudioContext, getMasterOutput } from './engine';

export type EffectChain = {
  input: GainNode;
};

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
    reverbIR = createReverbIR(ctx, 2.5, 0.6);
  }
  return reverbIR;
}

// Waveshaper curve for distortion
function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 256;
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
  wetGain.gain.value = 0.35;
  const dryGain = ctx.createGain();
  dryGain.gain.value = 0.65;

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
  dry.gain.value = 0.6;
  input.connect(dry);
  dry.connect(master);

  for (const rate of [1.8, 2.3]) {
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = 0.005;

    // LFO modulating delay time
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = rate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.002; // subtle modulation
    lfo.connect(lfoGain);
    lfoGain.connect(delay.delayTime);
    lfo.start();

    const wet = ctx.createGain();
    wet.gain.value = 0.3;
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
  shaper.curve = makeDistortionCurve(3);
  shaper.oversample = '2x';

  // Slap delay
  const delay = ctx.createDelay(0.2);
  delay.delayTime.value = 0.08;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.25;
  const delayWet = ctx.createGain();
  delayWet.gain.value = 0.3;

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
  tremGain.gain.value = 0.5;

  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 35; // fast stutter
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.5;
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
