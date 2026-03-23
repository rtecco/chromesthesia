## Chromesthesia

### Project Overview
- Audio toy
- A 2-D canvas
- Press play, press stop, NO AUTOPLAY
- Press play, the loop starts (NO AUTOPLAY)
    - TODO: How long?
- Clear clears the canvas
- Color == sound timbre
- Texture from brush == effects
- Direction of a brush stroke determines the change in tone / color from the base
    - Increase in the X-axis - brighter tone / color
    - Decrease in the Y-axis - darker tone / color
- Soft white background
- Interesting default palette (see @default-palette.jpeg)
- 3 - 4 brush types
- Paint has an interesting oil texture
- Simple sharing through a Gist
    - Implies a file format of some type (just use JSON)
- The sound being interesting and textured is more important that the absolute fidelity to the color metaphor.

### Code
- Browser app
    - Vanilla Typescript
    - No React
    - Vite for build
- Typescript
    - strict mode
    - Prefer DTOs and functions to complex classes
    - Type driven development
        - Make impossible states impossible
    - Minimize 3rd party dependencies
        - ASK before importing something into the project
- Easy as possible to deploy, ideally through Github Pages
- Clean separation between "one-time" controls, the render loop for the canvas /w the blobs and the audio synthesis