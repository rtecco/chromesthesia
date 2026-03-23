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

// Warmth thresholds for waveform selection (0=cool, 1=warm)
const WARMTH_SAWTOOTH = 0.6;   // above → sawtooth (brassy)
const WARMTH_TRIANGLE = 0.3;   // above → triangle (reedy), below → sine (glassy)
const WARMTH_SQUARE = 0.5;     // secondary waveform: above → square, below → triangle

// Warmth thresholds for filter type
const WARMTH_HIGHPASS = 0.5;   // warm hues get highpass (bright/open)
const WARMTH_BANDPASS = 0.2;   // mid hues get bandpass, cool hues get lowpass (round/full)

// Lightness influence on filter frequency
const LIGHTNESS_FILTER_LO = 0.6;
const LIGHTNESS_FILTER_HI = 1.4;

// Minimum detune at zero saturation
const MIN_DETUNE = 2;

// Minimum noise floor for pure tones
const NOISE_FLOOR = 0.02;

// Velocity normalization for speed → 0..1
const VELOCITY_SCALE = 500;

export function voiceParamsFromColor(color: PaletteColor): VoiceParams {
  const [h, s, l] = color.hsl;

  // Lightness → base pitch (light=high, dark=low) — wide range for drama
  const baseFreq = scale(l, 0, 100, debugParams.baseFreqMin, debugParams.baseFreqMax);

  // Saturation → harmonic richness
  const richness = s / 100; // 0..1
  const detuneRange = lerp(MIN_DETUNE, debugParams.detuneMax, richness);
  const partialCount = richness > 0.5 ? 4 : richness > 0.25 ? 3 : 2;

  // Hue → waveform character
  const warmth = hueWarmth(h); // 0=cool, 1=warm
  const primaryWave: OscillatorType = warmth > WARMTH_SAWTOOTH ? 'sawtooth' : warmth > WARMTH_TRIANGLE ? 'triangle' : 'sine';
  const secondaryWave: OscillatorType = warmth > WARMTH_SQUARE ? 'square' : 'triangle';

  const oscillators: VoiceParams['oscillators'] = [];
  for (let i = 0; i < partialCount; i++) {
    oscillators.push({
      type: i === 0 ? primaryWave : i === 1 ? secondaryWave : 'sine',
      detuneRange,
      gainScale: 1 / (i + 1), // each partial quieter
    });
  }

  // Hue + saturation → filter character
  const filterType: BiquadFilterType = warmth > WARMTH_HIGHPASS ? 'highpass' : warmth > WARMTH_BANDPASS ? 'bandpass' : 'lowpass';
  const filterFreq = lerp(debugParams.filterFreqMin, debugParams.filterFreqMax, warmth) * lerp(LIGHTNESS_FILTER_LO, LIGHTNESS_FILTER_HI, l / 100);
  const filterQ = lerp(debugParams.filterQMin, debugParams.filterQMax, richness);

  // Noise: more for warm/saturated, less for cool/pure
  const noiseAmount = lerp(NOISE_FLOOR, debugParams.noiseMax, warmth * richness);

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
  return clamp(speed * VELOCITY_SCALE, 0, 1); // normalized 0..1
}
