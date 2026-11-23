# Launch trailer

Makes the ~54-second Force Life trailer in 16:9 and 9:16 from real gameplay, with an original
generated soundtrack and captions. Nothing here ships with the game.

1. Build a filming copy of the game (offline mode, testing tools on) and serve it on port 4196:
   ```bash
   VITE_SUPABASE_URL= VITE_SUPABASE_KEY= VITE_DEBUG_TOOLS=1 npx vite build --outDir /tmp/film-build
   python3 -m http.server 4196 --directory /tmp/film-build
   ```
2. Film frame by frame (about 40 minutes per format without a GPU): `node film.cjs wide frames-wide` and `node film.cjs vertical frames-vertical`.
   Add `from:<scene>` or a single scene id to resume or re-shoot.
3. Soundtrack: `node audio.mjs frames-wide/timeline.json soundtrack.wav`
4. Edit: put `Oswald-Bold.ttf` and `Inter-SemiBold.ttf` in `fonts/` next to compose.mjs (convert from `@fontsource` woff2 with fontTools), then
   `node compose.mjs frames-wide soundtrack.wav ForceLife-Trailer-16x9.mp4` (same for vertical).

Needs Node, Playwright with Chromium, and ffmpeg.
