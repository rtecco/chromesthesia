import { getAudioContext } from './engine';
import type { VoiceParams, PositionMod } from './mappings';

export type Voice = {
  output: GainNode;
  stop: (when?: number) => void;
  updatePosition: (mod: PositionMod) => void;
};

export function createVoice(
  params: VoiceParams,
  mod: PositionMod,
  velocity: number,
): Voice {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Master voice gain with envelope
  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0, now);
  const attackTime = params.attackTime * (1 - velocity * 0.5); // faster attack at high velocity
  const peakGain = 0.25;
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
    const brightBoost = i > 0 ? mod.brightness * 0.5 : 0;
    oscGain.gain.value = spec.gainScale * (1 + brightBoost);

    osc.connect(oscGain);
    oscGain.connect(filter);
    osc.start(now);
    oscs.push(osc);
    oscGains.push(oscGain);
  }

  // Noise layer — filtered band around the fundamental
  let noiseSource: AudioBufferSourceNode | null = null;
  if (params.noiseAmount > 0.01) {
    const noiseBuffer = createNoiseBuffer(ctx, 0.5);
    noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const noiseGain = ctx.createGain();
    // More noise at high velocity
    noiseGain.gain.value = params.noiseAmount * (1 + velocity * 2);

    const noiseBP = ctx.createBiquadFilter();
    noiseBP.type = 'bandpass';
    noiseBP.frequency.value = baseFreq;
    noiseBP.Q.value = 2;

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

      const stopAt = t + release + 0.05;
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
        t + 0.02,
      );
      // Update brightness on upper partials
      for (let i = 1; i < oscGains.length; i++) {
        const spec = params.oscillators[i];
        const brightBoost = newMod.brightness * 0.5;
        oscGains[i].gain.linearRampToValueAtTime(
          spec.gainScale * (1 + brightBoost),
          t + 0.02,
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
