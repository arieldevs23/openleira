# OpenLeira trailer

A 43-second, text-driven launch trailer made with [Remotion](https://www.remotion.dev) and the `brag-slim` skill, cut to the whole of `public/music.mp3`. Indonesian copy. The plan is in `brag-output/brag-plan.md`, the share caption in `brag-output/share-copy.txt`.

- **Text first.** `src/trailer/text.tsx` has the text moves: `PopText` (letters pop with a small spring), `SpacingText` (wide and blurred, closing up), `SlideWords` (words out of a mask), `TypeText` (typed with a caret) and `BlurWord` (punch-in out of focus).
- **One background, no cuts.** `Backdrop` (glow, parallax dots, dust at three depths) and `MorphField` (three rings of gothic outlines morphing with `interpolatePaths`, turning at different speeds and breathing with the beat) run under the whole film; the parts in `src/trailer/scenes` overlap a few frames so text hands over to text.
- **Simulated, not screenshotted.** `src/trailer/Sim.tsx` draws a small, close team graph (four big nodes, sparks on the arrows, a QA mark that morphs from a ring into a check) and a simple work chat.
- **On the beat.** `src/trailer/beats.ts` is the song's beat map (librosa, ≈103 BPM); `src/trailer/timeline.ts` places each part.
- **Poster.** Frame 0 is the settled finale (frame 1200), frozen in.

```bash
npm install
npm run studio   # preview
npm run render   # brag-output/brag.mp4 and brag-output/brag.jpg
```

In a container without Remotion's own browser, add `--browser-executable=<chrome-headless-shell>` to the render and still commands.
