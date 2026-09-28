# OpenLeira launch video

A 24-second launch film made with [Remotion](https://www.remotion.dev) following the `brag-slim` skill, cut to `public/music.mp3`. The plan is in `brag-output/brag-plan.md`, the share caption in `brag-output/share-copy.txt`.

- **The real app, not a mock-up.** `src/brag/AppWindow.tsx` renders the app's own `OfficeCanvas`, `CoordinatorDock` and `ModeSwitch` components with its built stylesheet (`src/app.css`, from `vite build`) and fonts. `remotion.config.ts` points `@/` at `../src`, resolves the app's dependencies from `../node_modules` and keeps a single React (18.3, as the app). `src/brag/story.ts` drives what the app shows per frame: the prompt typed into the real work chat, the teams running along the flow, the audit, a work list running in order.
- **On the beat.** `src/brag/beats.ts` holds the song's beat map (librosa, ≈103 BPM); every scene starts on a bar and cuts there, dipping through the background instead of cross-fading.
- **Look.** The app's gothic tokens (`docs/DESIGN.md`), the landing page's rose, a parallax dot grid with dust at three depths, `CameraMotionBlur` on fast type, and `AppCamera` gliding between the parts of the UI that matter.
- **Poster.** Frame 0 is the settled hook (frame 80), frozen in, so thumbnails show it without changing the length or the audio sync.

```bash
npm install
(cd .. && npx vite build)   # refresh src/app.css from the app's build when the app's styles change
npm run studio              # preview
npm run render              # brag-output/brag.mp4 and brag-output/brag.jpg
```

In a container without Remotion's own browser, add `--browser-executable=<chrome-headless-shell>` to the render and still commands.
