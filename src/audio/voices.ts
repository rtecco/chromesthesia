import { getAudioContext } from './engine';
import type { VoiceParams, PositionMod } from './mappings';
import { debugParams } from '../ui/debug';

const VELOCITY_ATTACK_SCALE = 0.5;  // how much velocity shortens attack
const BRIGHTNESS_BOOST = 0.5;       // upper partial gain from X position
const NOISE_THRESHOLD = 0.01;       // below this, skip noise layer
const NOISE_BUFFER_DURATION = 0.5;  // seconds
const NOISE_VELOCITY_SCALE = 2;     // velocity multiplier for noise amount
const NOISE_BANDPASS_Q = 2;         // Q for noise bandpass filter
const PARAM_RAMP_TIME = 0.02;       // seconds for position update smoothing
const RELEASE_BUFFER = 0.05;        // extra time after release before stopping nodes

export type Voice = {
  output: GainNode;
  stop: (when?: number) => void;
  updatePosition: (mod: PositionMod) => void;
};

export function createVoice(
  params: VoiceParams,
  mod: PositionMod,
  velocity: number,
  gainScale = 1.0,
): Voice {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Master voice gain with envelope
  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0, now);
  const attackTime = params.attackTime * (1 - velocity * VELOCITY_ATTACK_SCALE);
  const peakGain = debugParams.peakGain * gainScale;
  voiceGain.gain.linearRampToValueAtTime(peakGain, now + attackTime);

  // Filter
  const filter = ctx.createBiquadFilter();
  filter.type = params.filterType;
  filter.frequency.value = params.filterFreq * mod.filterCutoffMul;
  filter.Q.value = params.filterQ;
  filter.connect(voiceGain);

  // Pitch shift from Y position
  const freqMul = Math.pow(2, mod.pitchShift / 12);
  const baseFreq = params.baseFreq * freqMul;

  // Oscillators
  const oscs: OscillatorNode[] = [];
  const oscGains: GainNode[] = [];

  for (let i = 0; i < params.oscillators.length; i++) {
    const spec = params.oscillators[i];
    const osc = ctx.createOscillator();
    osc.type = spec.type;
    osc.frequency.value = baseFreq * (i === 0 ? 1 : i + 1); // harmonic series
    // Detune for richness
    osc.detune.value = (Math.random() - 0.5) * 2 * spec.detuneRange;

    const oscGain = ctx.createGain();
    // Upper partials boosted by brightness (X position)
    const brightBoost = i > 0 ? mod.brightness * BRIGHTNESS_BOOST : 0;
    oscGain.gain.value = spec.gainScale * (1 + brightBoost);

    osc.connect(oscGain);
    oscGain.connect(filter);
    osc.start(now);
    oscs.push(osc);
    oscGains.push(oscGain);
  }

  // Noise layer — filtered band around the fundamental
  let noiseSource: AudioBufferSourceNode | null = null;
  if (params.noiseAmount > NOISE_THRESHOLD) {
    const noiseBuffer = createNoiseBuffer(ctx, NOISE_BUFFER_DURATION);
    noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const noiseGain = ctx.createGain();
    // More noise at high velocity
    noiseGain.gain.value = params.noiseAmount * (1 + velocity * NOISE_VELOCITY_SCALE);

    const noiseBP = ctx.createBiquadFilter();
    noiseBP.type = 'bandpass';
    noiseBP.frequency.value = baseFreq;
    noiseBP.Q.value = NOISE_BANDPASS_Q;

    noiseSource.connect(noiseBP);
    noiseBP.connect(noiseGain);
    noiseGain.connect(filter);
    noiseSource.start(now);
  }

  return {
    output: voiceGain,

    stop(when?: number) {
      const t = when ?? ctx.currentTime;
      const release = params.releaseTime;
      voiceGain.gain.cancelScheduledValues(t);
      voiceGain.gain.setValueAtTime(voiceGain.gain.value, t);
      voiceGain.gain.linearRampToValueAtTime(0, t + release);

      const stopAt = t + release + RELEASE_BUFFER;
      for (const osc of oscs) {
        try { osc.stop(stopAt); } catch (_) { /* already stopped */ }
      }
      if (noiseSource) {
        try { noiseSource.stop(stopAt); } catch (_) { /* already stopped */ }
      }
    },

    updatePosition(newMod: PositionMod) {
      const t = ctx.currentTime;
      filter.frequency.linearRampToValueAtTime(
        params.filterFreq * newMod.filterCutoffMul,
        t + PARAM_RAMP_TIME,
      );
      // Update brightness on upper partials
      for (let i = 1; i < oscGains.length; i++) {
        const spec = params.oscillators[i];
        const brightBoost = newMod.brightness * BRIGHTNESS_BOOST;
        oscGains[i].gain.linearRampToValueAtTime(
          spec.gainScale * (1 + brightBoost),
          t + PARAM_RAMP_TIME,
        );
      }
    },
  };
}

// Shared noise buffer cache
let cachedNoiseBuffer: AudioBuffer | null = null;

function createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  if (cachedNoiseBuffer && cachedNoiseBuffer.sampleRate === ctx.sampleRate) {
    return cachedNoiseBuffer;
  }
  const length = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  cachedNoiseBuffer = buffer;
  return buffer;
}
