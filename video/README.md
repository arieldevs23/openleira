# OpenLeira launch video

A 30-second motion graphic made with [Remotion](https://www.remotion.dev), cut to `public/music.mp3`.

- `src/beats.ts`: beat map of the song (librosa, ≈112 BPM). Every scene and most accents start on a beat; the silence before the last hit is its own scene and cuts hard to the hit at 26.33 s.
- `src/Launch.tsx`: the scenes in a `TransitionSeries` with short spring cross-fades.
- `src/scenes/*`: one file per scene, each also registered on its own in `src/Root.tsx` (folder `OpenLeira-Scenes`) so it can be previewed and edited in Studio.
- Look: the app's gothic tokens and self-hosted fonts (`docs/DESIGN.md`), the landing page's rose. Depth comes from a parallax dot grid and floating dust at three depths; fast moves use `CameraMotionBlur`, the work sparks use `Trail`.

```bash
npm install
npm run studio   # preview
npm run render   # out/openleira-launch.mp4
```

In a container without Remotion's own browser, pass one: `npx remotion render OpenLeiraLaunch out/openleira-launch.mp4 --browser-executable=<chrome-headless-shell>`.
