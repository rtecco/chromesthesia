
### Motivation

I had a few ideas going into this take home:
- An interactive widget to help visualize convex optimization problems written in CVXPY (constraints, interior point methods)
- An actor-style programming language where backpressure is a first-class concept
- Some kind of interactive music toy - initially iterations on the "step sequencer" concept.

I was flipping through a MOMA book and spotted an image of a textured, painted canvas. The idea of painting with sound clicked, especially since the step sequencer felt throughly explored.

### Key Design Decisions

See [SPEC.md](SPEC.md) for more.

- A 2-D canvas
- Color == sound timbre
- Texture from brush == effects
- Direction of a brush stroke determines the change in tone / color from the base
    - Increase in the X-axis - brighter tone / color
    - Decrease in the Y-axis - darker tone / color
- Soft white background
- Interesting default palette (see @default-palette.jpeg)
- 3 - 4 brush types
- Paint has an interesting oil texture
- The sound being interesting and textured is more important that the absolute fidelity to the color metaphor.

I wanted to stick to the metaphor of painting as close as possible to constrain the app. This meant trading off on more sophisticated functionality around rhythm and ordering. In return, the sound would be interesting because color could create timbre and the brush tools could provide texture.
I found a souvenir notepad with an interesting color palette for a default to get the user going immediately. I found that I didn't end up creating
too many of my own custom colorsounds.

Playback was a place where Claude had suggested "scanning" the painting from left to right and compositing all of the strokes together. This
was basically just noise! So we iterated there to come up with a replay mode that honored the sequence of the strokes.

### Extensions

Things I'd do with more time:
- Create an "Overlay" mode where you can add new strokes while the existing canvas is playing.
- Improve mixing. Right now, there's some basic visual blend, but nothing on the audio side.
- Improve erasure. Right now, it's too basic: you erase >50% of a stroke and it removes it from the playback.
- Sharing compositions through Gists and a simple JSON file format. I had this originally in the [spec](SPEC.md) and [plan](PLAN.md) and it would be an easy add.
- Go deeper into the audio synthesis. I had Claude put together an [overview of the synthesis flow](src/audio/README.md) and expose all of the internal parameters as sliders in the 
settings. I already spent too much time playing with these!
- Sometimes there are some strange timing issues on the replay that could use some more investigation.
- I wanted to use the Claude Chrome extension to drive more automated validation testing.

### Time Spent

Approx. 3 - 4 hours