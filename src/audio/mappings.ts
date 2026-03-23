import type { PaletteColor, StrokePoint } from '../types';
import { clamp, lerp, scale } from '../utils/math';
import { debugParams } from '../ui/debug';

// --- HSL-derived voice parameters ---

export type VoiceParams = {
  baseFreq: number;
  oscillators: { type: OscillatorType; detuneRange: number; gainScale: number }[];
  filterType: BiquadFilterType;
  filterFreq: number;
  filterQ: number;
  noiseAmount: number;
  attackTime: number;
  releaseTime: number;
};

// Hue regions (0-360):
//   0-60: red/orange — warm saws, brassy
//  60-180: yellow/green — mixed saw+triangle, reedy
// 180-270: blue/purple — triangles+sines, hollow/glassy
// 270-360: magenta/red — saws with high resonance

export function voiceParamsFromColor(color: PaletteColor): VoiceParams {
  const [h, s, l] = color.hsl;

  // Lightness → base pitch (light=high, dark=low) — wide range for drama
  const baseFreq = scale(l, 0, 100, debugParams.baseFreqMin, debugParams.baseFreqMax);

  // Saturation → harmonic richness
  const richness = s / 100; // 0..1
  const detuneRange = lerp(2, debugParams.detuneMax, richness);
  const partialCount = richness > 0.5 ? 4 : richness > 0.25 ? 3 : 2;

  // Hue → waveform character
  const warmth = hueWarmth(h); // 0=cool, 1=warm
  const primaryWave: OscillatorType = warmth > 0.6 ? 'sawtooth' : warmth > 0.3 ? 'triangle' : 'sine';
  const secondaryWave: OscillatorType = warmth > 0.5 ? 'square' : 'triangle';

  const oscillators: VoiceParams['oscillators'] = [];
  for (let i = 0; i < partialCount; i++) {
    oscillators.push({
      type: i === 0 ? primaryWave : i === 1 ? secondaryWave : 'sine',
      detuneRange,
      gainScale: 1 / (i + 1), // each partial quieter
    });
  }

  // Hue + saturation → filter character
  const filterType: BiquadFilterType = warmth > 0.5 ? 'highpass' : warmth > 0.2 ? 'bandpass' : 'lowpass';
  const filterFreq = lerp(debugParams.filterFreqMin, debugParams.filterFreqMax, warmth) * lerp(0.6, 1.4, l / 100);
  const filterQ = lerp(debugParams.filterQMin, debugParams.filterQMax, richness);

  // Noise: more for warm/saturated, less for cool/pure
  const noiseAmount = lerp(0.02, debugParams.noiseMax, warmth * richness);

  return {
    baseFreq,
    oscillators,
    filterType,
    filterFreq,
    filterQ,
    noiseAmount,
    attackTime: lerp(debugParams.attackMin, debugParams.attackMax, 1 - richness),
    releaseTime: lerp(debugParams.releaseMin, debugParams.releaseMax, 1 - warmth),
  };
}

// How "warm" a hue feels: reds/oranges/yellows are warm, blues/purples are cool
function hueWarmth(h: number): number {
  // Red=0/360 warm, orange=30 warmest, blue=240 coolest
  if (h <= 60) return lerp(0.85, 1.0, h / 60);
  if (h <= 120) return lerp(1.0, 0.5, (h - 60) / 60);
  if (h <= 180) return lerp(0.5, 0.2, (h - 120) / 60);
  if (h <= 270) return lerp(0.2, 0.0, (h - 180) / 90);
  return lerp(0.0, 0.85, (h - 270) / 90);
}

// --- Position modulation ---

export type PositionMod = {
  filterCutoffMul: number;  // multiply the base filter freq
  pitchShift: number;       // semitones offset
  brightness: number;       // 0..1, controls upper partial gain
  reverbMix: number;        // 0..1
};

export function positionMod(point: StrokePoint): PositionMod {
  const x = clamp(point.x, 0, 1);
  const y = clamp(point.y, 0, 1);

  const p = debugParams;
  return {
    filterCutoffMul: lerp(p.filterCutoffMin, p.filterCutoffMax, x * x),
    brightness: x,
    pitchShift: lerp(p.pitchShiftRange, -p.pitchShiftRange, y),
    reverbMix: lerp(p.reverbMixMin, p.reverbMixMax, y),
  };
}

export function velocityFromPoints(prev: StrokePoint, curr: StrokePoint): number {
  const dx = curr.x - prev.x;
  const dy = curr.y - prev.y;
  const dt = Math.max(curr.timestamp - prev.timestamp, 1);
  const speed = Math.sqrt(dx * dx + dy * dy) / dt;
  return clamp(speed * 500, 0, 1); // normalized 0..1
}
