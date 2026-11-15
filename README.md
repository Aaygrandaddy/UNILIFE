# Force Life (UNILIFE)

Force Life is a university-based game that depicts a world where students interact and share their university life experiences together.

Open-world 3D campus game set at a fictional air-force-run institute in Kaduna, with an in-game phone (chat, snaps, photos, posts) and Waka ride-hailing. Built with Three.js, TypeScript, Vite and Firebase.

See [docs/SPECS.md](docs/SPECS.md) for the game specification and roadmap, and [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) to put accounts and chat online.

## Run it

```bash
npm install
npm run dev
```

Production build: `npm run build` (output in `dist/`). Add `?fps` to the URL to show the frame counter, or `?debug` to expose `window.uni` helpers (teleport, set time, drive a vehicle, enter a room, fast-forward with `uni.warp(n)`).

## Code map

| File | What it does |
|---|---|
| `src/config.ts` | Campus layout: buildings, roads, routes, parked vehicles, spawn point |
| `src/world.ts` | Builds the world: ground, roads, kerbs, buildings, gate, landmarks, trees, lamps |
| `src/textures.ts` | Canvas-generated textures (facades, roads, pavers, signs, flags) |
| `src/human.ts` | Player and student models with walk animation |
| `src/vehicles.ts` | Cars, SUV, keke, bus; player driving and AI traffic |
| `src/npcs.ts` | Students walking the sidewalks and chatting outside buildings |
| `src/missions.ts` | The Day One mission chain |
| `src/hud.ts` | HUD, rotating radar minimap, toasts and banners |
| `src/interiors.ts` | Walk-in rooms: Hostel B Room B14, Lecture Theatre LT1, Cafeteria |
| `src/online/` | Accounts, chat, posts and snaps: `firebaseBackend.ts` (online) and `localBackend.ts` (on-device fallback) |
| `src/phone.ts` | The phone UI and its apps |
| `src/rides.ts`, `src/roadgraph.ts`, `src/music.ts` | Waka rides, road routing, generated radio |
| `src/main.ts` | Game loop, camera, day–night lighting, Retreat, Base Provost, interactions |
