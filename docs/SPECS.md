# FORCE LIFE — Game Specification (v0.5)

> Open-world campus life game set at **Force Life Institute of Technology**, a fictional air-force-run campus in Kaduna.
> Fictional campus. Not affiliated with any real institution or the Nigerian Air Force.

## 1. Vision

An open-world, third-person campus sim with a GTA-style feel: free roaming, getting in and out of vehicles, a rotating radar minimap, mission markers, a clock that drives the day, and a "heat" system. It is set on a military-run institute in northern Nigeria.

The fun comes from the campus's mix of university life and military-base life: a checkpoint at the gate, airmen drilling on the parade ground, the 6 PM Retreat when everyone stops, the Base Provost, aircraft in the hangar, Mammy Market, whitewashed tree trunks and painted kerbs, the harmattan haze, and the everyday student routine of registration, hostels, lectures, the cafeteria and curfew.

## 2. Setting: Force Life Institute of Technology, Kaduna

| Zone | Notes |
|---|---|
| Main gate checkpoint | Barrier, red-and-white drums, sandbags, "Stop · show your ID" sign, airmen on guard, and a Guard Room |
| Chancellor's Boulevard and roundabout | Palm-lined approach with a monument |
| Senate Building | Clock tower, portico and flag line |
| Multipurpose Hall, Force Life Library | |
| Faculty of Air Engineering, Faculty of Ground Engineering, Faculty of Sciences | Faculty blocks |
| Lecture Theatre (LT1) | **Walk-in interior** |
| Hangar 1 and apron | Static jet-trainer airframes for Air Engineering training |
| Parade Ground and saluting base | A squad drills here. The flag is lowered at Retreat |
| Base Medical Centre | |
| Base Chapel and Base Central Mosque | |
| Registry & Bursary | Registration and fees |
| Cafeteria | **Walk-in interior**, with northern and southern dishes |
| Mammy Market | Canteen, business centre, POS/airtime, suya and kilishi, provisions, barber and tailor, ATM gallery |
| Hostels A–B (male), C–D (female) | Room B14 in Hostel B is a **walk-in interior** |
| Sports Complex | |
| Base Access Road | Zinc-roof shops, billboards, a bus stop and kekes |

**Kaduna feel:** drier, yellower grass than the south; neem and mango trees with whitewashed trunks; fewer palms; strong harmattan haze; kilishi, tuwo shinkafa, miyan kuka, zobo and kunu on sale; KAD number plates.

## 3. Gameplay systems

| System | Build 0.3 (now) | Planned |
|---|---|---|
| Characters | Jointed bodies (hips, knees, shoulders, elbows) with faces. Walk, run and marching animations, plus breathing, sitting and standing to attention. Outfits for students, airmen (blue camouflage and beret), lecturers (kaftan and cap) and cafeteria staff | Imported, motion-captured models |
| Interiors | Hostel room B14 (bunks, reading tables, buckets, rules notice, ceiling fan), Lecture Theatre LT1 (98 seats, slides, lecturer, students), Cafeteria (food warmers, menu board, staff, diners). Press **E** at a door to go in or out | Library, Registry, Mammy Market shops, hangar interior |
| Vehicles | Shaped car, SUV and pickup bodies with windscreens, pillars and roof panels, plus keke and shuttle bus | Damage, fuel, radio |
| Base life | Squad drills on the parade ground; guards at the gate; traffic and students on the sidewalks | Provost patrols that chase you |
| Retreat (6:00–6:15 PM) | A bugle banner sounds and the flag comes down. Students, squad and traffic stop. Anyone who keeps moving outdoors gets a Provost fine | Bugle sound, reveille at 6 AM |
| Base Provost (heat) | 0–3 shields. Speeding over 40 km/h, breaking curfew or moving during Retreat raises the level. At level 3 you are arrested, fined ₦5,000 and returned to Hostel B | |
| Time, money, energy | 24-minute day, ₦ wallet, ATM, food restores energy | |

### Day One mission chain

1. **Gate Clearance.** Show your admission letter at the Guard Room.
2. **Registration.** Visit the Registry & Bursary and get Room B14 in Hostel B.
3. **Move In.** Go inside Hostel B and claim your bunk.
4. **GST 111.** Take a seat in LT1 before 10:00 AM, or you are marked absent.
5. **Cash Run.** Use the ATM Gallery at Mammy Market.
6. **Lunch.** Buy jollof rice at the cafeteria counter.
7. **Retreat.** Be at the Parade Ground at 6:00 PM and stand still until the flag is down.
8. **Curfew.** Be back at Hostel B before 10:00 PM.

## 4. Phone, accounts and rides (build 0.4)

| Feature | What it does |
|---|---|
| Phone | **P** or the 📱 button. Status bar, home screen with wallet (₦) and ride tokens, six apps. Opens automatically for sign-in |
| Accounts | Email and password sign-up with username, display name, department, level and skin tone. Each player has their own login. Online through Firebase Auth; on-device fallback when Firebase is not set up |
| **Gist** (chat) | Chats list and People list with online dots; live one-to-one messages |
| **Flash** (snaps) | Take a snap of the game view, send it to a player; it disappears 6 seconds after it is opened |
| **Frame** (photos) | Take a photo of the game view, add a caption, post to a shared feed; likes |
| **Yarn** (posts) | 280-character posts on a shared campus timeline; likes |
| **Waka** (rides) | Pick a destination, then **Keke**, **Car** or **Luxury** (black SUV). Fares in tokens: keke 2 + 1 per 250 m, car 4 + 2 per 250 m, luxury 10 + 4 per 250 m. 1 token = ₦100; start with 20. The driver follows the road network to you (purple **W** on the radar); press **F** to get in; cancel before boarding for a refund |
| Ride experience | Four cameras (chase, side, overhead, cinematic orbit) with **C** or the on-screen button. Radio with four stations of live-generated music (Arewa Vibes, Highlife Gold, Amapiano Night, Campus Lo-fi), play/pause, next/previous station, new song, volume |
| Camera | On foot, the camera swings behind the direction you face; mouse or touch look takes over for a moment |

The four social apps do the same jobs as the big social networks but have their own names and look, to keep the game clear of trademark problems. Setup steps for going online are in `docs/FIREBASE_SETUP.md`.

## 5. Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move / drive | W A S D or arrow keys | D-pad |
| Run | Shift | RUN |
| Handbrake | Space | — |
| Horn | Q | HORN |
| Interact / enter buildings | E | ACT |
| Phone | P | 📱 |
| Ride camera | C | Camera button |
| Enter / exit vehicle | F | CAR |
| Look | Drag the mouse, or double-click to lock the pointer | Drag on the screen |
| Hide help | H | — |

## 6. Technology

Three.js r170, TypeScript and Vite. Everything is generated in code (no asset downloads). People are built from merged, vertex-coloured limb meshes (11 draw calls per person). Interiors are hidden until entered, and their lights are added only while you are inside. Instancing is used for trees, kerbs, pavers, lamps and seats.

## 7. Roadmap

| Build | Focus |
|---|---|
| 0.2 | Campus, vehicles, traffic, day–night cycle, Day One missions, HUD |
| 0.3 | Air-force campus re-theme, jointed characters and uniforms, walk-in interiors, shaped vehicles, parade squad, Retreat, Base Provost |
| 0.4 | Renamed Force Life. Phone, player accounts (Firebase), online chat, Gist / Flash / Frame / Yarn apps, Waka Rides with radio and cinematic cameras, camera follows the way you face |
| **0.5 (now)** | Launch readiness: cloud save of progress (autosave every 30 s, after objectives and when leaving), report and block with server-enforced blocking, chat filter, delete account, age and consent check (18+ or guardian permission, per the NDPA), pause menu with How to play, Settings (graphics quality, look sensitivity, invert look, radio volume, frame rate) and in-game Terms and Privacy pages, App Check support, automatic deploys from GitHub. **Sound:** footsteps (outdoor and tiled floors), engines per vehicle with gear shifts, horn (Q), tyre screech, crash thuds, traffic honking when you block cars, Provost whistle, original Retreat bugle call, door sounds, objective chime, cash register, phone pings, send whoosh and camera shutter, birds by day, crickets at night, wind and indoor fan hum. All generated live; volume and background-sound settings in the menu |
| 0.6 | More missions and a daily loop, sponsor billboards, Paystack purchases, group chats, friend requests |
| 1.0 | Shared multiplayer campus, performance pass for low-end phones |
