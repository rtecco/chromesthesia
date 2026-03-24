# Chromesthesia

An audio toy where painting on a 2D canvas creates sound. Color determines timbre, brush type applies effects, and position modulates tone.

**Try it:** [https://rtecco.github.io/chromesthesia/](https://rtecco.github.io/chromesthesia/)

## How it works

Every brush stroke generates sound in real time. The mapping from paint to audio:

- **Color (HSL)**: Hue sets the waveform character (warm reds are brassy sawtooths, cool blues are smooth sines). Saturation controls harmonic richness. Lightness controls pitch — light colors are high, dark colors are low.
- **Position**: Moving left/right sweeps the filter cutoff. Moving up/down shifts pitch and adds reverb depth.
- **Brush**: Each brush type runs through a different effect chain — reverb, chorus, distortion + slap delay, or tremolo.
- **Erasers**: Scraper and solvent remove paint visually and suppress erased strokes from replay.

## UI

- **Palette**: 5 default colors + 3 empty slots. Click to select, double-click to edit or fill an empty slot.
- **Brushes**: Oil Flat, Oil Round, Palette Knife, Dry Brush — each with distinct stroke feel and audio effect.
- **Erasers**: Scraper (hard-edged removal) and Solvent (soft radial dissolve).
- **Live / Replay**: In Live mode, you hear sound as you paint. Replay mode plays back all strokes sequentially with a shimmer effect on the active stroke. Drawing is disabled during replay.
- **Clear**: Wipes the canvas and all stroke data.
- **Debug panel**: Gear icon in the bottom-right reveals sliders for tuning all audio parameters at runtime.
- **Keyboard shortcuts**: Space toggles Live/Replay, Escape returns to Live, Delete clears the canvas.

## Tech

Vanilla TypeScript + Vite. No frameworks, no audio libraries — all synthesis is Web Audio API. Canvas2D with an offscreen buffer for stroke compositing.

## Local development

```bash
git clone https://github.com/rtecco/chromesthesia.git
cd chromesthesia
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```
