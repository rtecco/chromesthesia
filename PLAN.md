# Sound Painter — Implementation Plan

## Context

Building an audio toy from scratch: a 2D canvas where painting creates sound. A vertical playhead scans left-to-right across the painting in a loop, triggering voices based on what's painted. Color = timbre, brush type = effects, position = modulation. The reference palette (`default-palette.jpeg`) shows bold reds, blues, lavender, and ochre with thick oil paint texture.

**Priority:** Interesting, textured sound > absolute fidelity to the color metaphor.

---

## Architecture

```
src/
  main.ts              — Entry point, wires controls + canvas + audio
  types.ts             — All DTOs and type aliases

  canvas/
    renderer.ts        — requestAnimationFrame loop, offscreen canvas compositing
    brushes.ts         — 4 brush texture generators (oil flat, oil round, palette knife, dry brush)
    palette.ts         — Default 5-color palette + color metadata
    stroke-recorder.ts — PointerEvent capture → normalized StrokePoint[]

  audio/
    engine.ts          — AudioContext lifecycle, master gain/compressor, play/stop
    voices.ts          — Layered oscillator voices per color (the core sound design)
    effects.ts         — Per-brush effect chains (reverb, chorus, distortion, tremolo)
    playhead.ts        — Column-scanning sequencer, voice scheduling
    mappings.ts        — Pure functions: position → audio params

  ui/
    controls.ts        — Play/Stop/Clear, brush picker, color picker
    sharing.ts         — JSON export/import, Gist API

  utils/
    math.ts            — lerp, clamp, scale
    color.ts           — RGB↔HSL, warmth calculation
```

**Three clean separations:** UI controls (one-time setup) | Canvas render loop | Audio synthesis. They communicate through a shared `Painting` DTO in `main.ts`.

---

## Data Model (JSON format for sharing)

- `Painting { version, canvasAspect, loopLengthMs, strokes[] }`
- `Stroke { id, color, brush, points[] }`
- `StrokePoint { x, y, pressure, timestamp }` — coordinates normalized to 0..1
- `BrushType = 'oil-flat' | 'oil-round' | 'palette-knife' | 'dry-brush'`
- 5 palette colors: Cadmium Red, Cobalt Blue, Lavender, Ochre Gold, Titanium White (silence/eraser)

---

## Audio Design

**Voice per color** — not single oscillators but layered subtractive-additive patches:
- **Cadmium Red:** 3 detuned saws + sub square, warm low-pass w/ resonance — growling, brassy
- **Cobalt Blue:** 2 triangles + sine, band-pass sweep — hollow, woody
- **Lavender:** 4 sines in harmonic series (1,2,3,5), high-shelf — glassy, bell-like
- **Ochre Gold:** 2 squares + noise burst, LP w/ envelope — percussive, earthy
- Every voice has +/- 3-12 cent detuning for richness + filtered noise layer for "breath"

**Position modulation:**
- X-axis → filter cutoff (200-4200Hz), upper partial amplitude (left=dark, right=bright)
- Y-axis → pitch register (top=higher, bottom=lower), reverb wet mix (top=dry, bottom=wet)
- Stroke velocity → attack sharpness + noise burst amount

**Brush = effects chain:**
- Oil Flat → reverb (synthetic IR, no external file)
- Oil Round → chorus + vibrato (LFO-modulated delay)
- Palette Knife → waveshaper distortion + 80ms slap delay
- Dry Brush → rapid gain tremolo (20-60Hz) — gritty, broken

**Playhead:** 128 columns over 4-second loop. Scheduled via Web Audio clock (look-ahead pattern), not setInterval. Max 16 simultaneous voices with oldest-voice stealing.

---

## Stages

### Stage 1: Project Scaffold (on `main`)
- `git init`, `.gitignore`, Vite vanilla-ts template
- `tsconfig.json` strict mode, `vite.config.ts` with `base: '/soundpaint/'`
- Directory structure, `types.ts` with all DTOs
- Minimal `index.html`: canvas + toolbar buttons + CSS (soft white `#faf9f6`)
- Verify `npm run dev` and `npm run build`

### Stage 2: Canvas Drawing (branch: `stage-2-canvas`)
- Stroke recording via PointerEvent (normalize coords, capture pressure)
- 4 brush texture renderers with oil paint bristle simulation
- Offscreen canvas buffer for accumulated strokes
- 5-color palette UI, brush picker, Clear button
- **Files:** `stroke-recorder.ts`, `brushes.ts`, `renderer.ts`, `palette.ts`, `controls.ts`

### Stage 3: Audio Engine + Voices (branch: `stage-3-audio`)
- AudioContext with resume-on-gesture, master gain + compressor
- Voice synthesis per color (layered oscillators, detuning, noise, filters)
- Position → modulation mappings
- Brush → effects chains (synthetic reverb IR, chorus, distortion, tremolo)
- Live audition: sound plays while painting
- **Files:** `engine.ts`, `voices.ts`, `effects.ts`, `mappings.ts`

### Stage 4: Playhead Loop (branch: `stage-4-playhead`)
- Column-based scanning, stroke intersection queries
- Web Audio clock scheduling (look-ahead pattern)
- Visual playhead line sweeping across canvas
- Play/Stop wired up, 4-second loop
- Painting while playing works (live + playhead)
- **Files:** `playhead.ts`, updates to `engine.ts`, `renderer.ts`, `controls.ts`

### Stage 5: Polish (branch: `stage-5-polish`)
- Tune voice recipes, effects, envelopes until they sound great
- Smooth parameter interpolation (no zipper noise)
- Paint mixing visuals at stroke overlaps
- Subtle canvas grain texture on background
- Stroke width variation with velocity
- UI polish: hover states, active indicators
- Keyboard shortcuts: Space=play/stop, Escape=stop, Delete=clear

### Stage 6: Sharing (branch: `stage-6-sharing`)
- Export `Painting` to JSON → anonymous GitHub Gist
- Import from `?gist=ID` URL parameter
- Share button → copy URL
- Hand-rolled runtime validation (no Zod)
- **Files:** `sharing.ts`, updates to `main.ts`

### Stage 7: Deploy (branch: `stage-7-deploy`)
- GitHub Actions workflow for Pages deployment
- Merge all branches to `main`
- Meta tags for social sharing
- Mobile touch verification
- Performance audit (60fps canvas, glitch-free audio)
- Push to GitHub

---

## Key Decisions
- **No external audio libs** (no Tone.js) — Web Audio API is sufficient, keeps deps minimal
- **No WebGL** — Canvas2D is enough for oil texture with bristle simulation
- **Synthetic reverb IR** — generated programmatically, no external files
- **4-second default loop** — short enough for rhythm, long enough for phrases
- **Normalized coords** — resolution-independent paintings, compact JSON

## Verification
- Each stage: `npm run dev`, test in browser, verify feature works
- Stage 3: test each color voice individually, verify position modulation is audible
- Stage 4: paint a simple pattern, play it, verify sound matches visual position
- Stage 5: A/B compare before/after tuning
- Stage 6: export → import round-trip, share URL works in incognito
- Stage 7: deploy to Pages, test on mobile Safari + Chrome
