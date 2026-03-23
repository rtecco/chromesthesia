# Audio Engine

## Overview

The audio engine uses the Web Audio API to synthesize sound from painted strokes. No external audio libraries are used.

## Architecture

```
Color (HSL) ──→ mappings.ts ──→ VoiceParams ──→ voices.ts ──→ Voice (oscillators + filter + noise)
                                                                │
Position (x,y) → mappings.ts ──→ PositionMod ──────────────────→│ (real-time modulation)
                                                                │
Brush type ────→ effects.ts ──→ EffectChain ←───────────────────┘
                                    │
                                    ↓
                               engine.ts (master gain → compressor → destination)
```

## Color → Sound Mapping (`mappings.ts`)

HSL values drive all synthesis parameters:

- **Hue → waveform character**: Warm hues (reds/oranges) produce sawtooth waves (brassy). Cool hues (blues/purples) produce sine waves (glassy). Mid hues get triangle waves (reedy).
- **Hue → filter type**: Warm → highpass (bright/open), mid → bandpass, cool → lowpass (round/full).
- **Saturation → harmonic richness**: Higher saturation adds more oscillator partials, wider detuning, and higher filter resonance (Q).
- **Lightness → pitch**: Light colors are high-pitched, dark colors are low-pitched.

## Position Modulation (`mappings.ts`)

Canvas position modulates the voice in real-time as the stroke moves:

- **X axis → filter cutoff** (exponential curve) and upper partial brightness
- **Y axis → pitch shift** (semitones) and reverb mix

## Voice Synthesis (`voices.ts`)

Each voice consists of:
- 2–4 oscillators in a harmonic series, randomly detuned for richness
- A biquad filter (type determined by hue warmth)
- An optional band-passed noise layer around the fundamental
- Attack/release gain envelope

## Effect Chains (`effects.ts`)

Each brush type has a dedicated cached effect chain:

| Brush | Effect |
|---|---|
| Oil Flat | Convolution reverb (synthetic impulse response) |
| Oil Round | Chorus (2 LFO-modulated delays) |
| Palette Knife | Waveshaper distortion + slap delay with feedback |
| Dry Brush | Square-wave tremolo at 35 Hz (stutter texture) |
| Erasers | Passthrough (no sound) |

## Replay System (`playhead.ts`)

Replays strokes sequentially as sound, matching live audition fidelity:

- One voice per stroke, with `updatePosition` called at each recorded point's timestamp
- Strokes play at their original recorded speed
- Strokes >50% covered by later eraser strokes are skipped
- Loops with a configurable pause between iterations

## Engine (`engine.ts`)

Singleton AudioContext with a master gain node feeding a dynamics compressor. All effect chains connect to the master output.
