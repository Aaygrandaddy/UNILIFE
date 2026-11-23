// Fonts are bundled with the game (no requests to Google), SIL Open Font License.
import '@fontsource/oswald/500.css';
import '@fontsource/oswald/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import './style.css';
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BUILDINGS, FENCE, GATE, HANGAR, PARADE, PARKED, ROADS, ROUTES, SPAWN, STADIUM, UNI } from './config';
import { INTERIOR_POI_BUILDING, Interiors, type Interior } from './interiors';
import { WorldBuilder, roadAt, type AABB } from './world';
import { Human } from './human';
import { Vehicle, laneRoute } from './vehicles';
import { Crowd } from './npcs';
import { Input } from './input';
import { Hud, naira, toBlip, type Blip } from './hud';
import { Missions } from './missions';
import { angleDiff, clamp, pointInBoxes, resolveCircle, separate } from './physics';
import { createBackend } from './online/backend';
import { Rides, TOKEN_PRICE_NAIRA, type Place } from './rides';
import { Phone } from './phone';
import { clockText } from './hud';
import { Menu, type Settings } from './menu';
import { Sound } from './sfx';
import type { SaveData } from './online/backend';

declare const __APP_VERSION__: string;

const TIME_SCALE = 1; // game minutes per real second
let timeScaleOverride = 1; // debug filming: speeds up the clock for time-lapses
const SPEED_LIMIT_KMH = 40;

const $ = (id: string) => document.getElementById(id)!;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

async function boot() {
  const root = $('game-root');
  const progress = $('loading-progress') as HTMLProgressElement;
  const loadingText = $('loading-text');
  $('build-version').textContent = __APP_VERSION__;
  const menu = new Menu();
  const sound = new Sound();
  let showFps = import.meta.env.DEV || new URLSearchParams(location.search).has('fps') || menu.settings.showFps;
  $('fps').hidden = !showFps;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch {
    loadingText.textContent = 'Your browser could not start 3D graphics (WebGL). Try Chrome, Edge or Firefox with hardware acceleration turned on.';
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#d8d0bd', 140, 700);
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 6000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const step = async (pct: number, label: string, fn: () => void) => {
    progress.value = pct;
    loadingText.textContent = label;
    await nextFrame();
    fn();
  };

  // ---------- world ----------
  const wb = new WorldBuilder(scene);
  await step(5, 'Clearing the land…', () => wb.ground());
  await step(15, 'Laying roads and kerbs…', () => {
    wb.roads();
    wb.sidewalks();
  });
  await step(35, 'Raising faculties and halls…', () => wb.buildings());
  await step(55, 'Building the main gate…', () => {
    wb.gateAndFence();
    wb.landmarks();
    wb.outside();
  });
  await step(70, 'Planting palm trees…', () => {
    wb.trees();
    wb.lamps();
    wb.skyStars();
  });
  const colliders: AABB[] = wb.colliders;
  const pois = wb.pois;
  const flags: THREE.Object3D[] = [];
  scene.traverse((o) => o.userData.flag && flags.push(o));

  // ---------- sky and light ----------
  const sky = new Sky();
  sky.scale.setScalar(5000);
  const su = sky.material.uniforms;
  su.turbidity.value = 9;
  su.rayleigh.value = 1.6;
  su.mieCoefficient.value = 0.006;
  su.mieDirectionalG.value = 0.85;
  scene.add(sky);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -70;
  sc.right = sc.top = 70;
  sc.near = 1;
  sc.far = 400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight('#cfe3ff', '#6b5a3a', 0.6);
  scene.add(hemi);
  // Two lights that move into whichever interior the player is in. They are only in the scene
  // while indoors, so outdoor shading stays cheap; the shader rebuild happens behind the fade.
  const roomLights = [0, 1].map(() => new THREE.PointLight('#f4f8ff', 0, 0, 2));

  // ---------- people and vehicles ----------
  let crowd!: Crowd;
  const vehicles: Vehicle[] = [];
  const player = new Human({ skin: '#5a3825', shirt: '#ffffff', bottom: '#1b1b1f', hair: '#120d0a', backpack: '#123f6b', shoes: '#151515' });
  let interiors!: Interiors;
  await step(80, 'Furnishing hostels and lecture theatres…', () => {
    interiors = new Interiors(scene, colliders, pois);
  });
  await step(85, 'Waking up the students…', () => {
    crowd = new Crowd(scene);
    crowd.addBase(scene);
    player.group.position.set(SPAWN.x, 0, SPAWN.z);
    scene.add(player.group);
    for (const p of PARKED) {
      const v = new Vehicle(p.kind, p.color, p.label);
      v.pos.set(p.x, 0, p.z);
      v.yaw = p.yaw;
      v.syncTransform();
      scene.add(v.group);
      vehicles.push(v);
    }
    for (const r of ROUTES) {
      const expressway = r.pts.every((p) => p[1] === 300);
      const pts = laneRoute(r.pts, expressway ? 3.6 : 3, r.loop);
      const segs = r.loop ? pts.length : pts.length - 1;
      r.cars.forEach((c, i) => {
        const v = new Vehicle(c.kind, c.color, 'Traffic');
        const seg = Math.floor((i * segs) / r.cars.length);
        const a = pts[seg];
        const b = pts[(seg + 1) % pts.length];
        v.pos.set(a.x + (b.x - a.x) * 0.3, 0, a.y + (b.y - a.y) * 0.3);
        v.yaw = Math.atan2(-(b.x - a.x), -(b.y - a.y));
        const cruise = c.kind === 'keke' ? 8 : c.kind === 'bus' ? 9 : expressway ? 15 : 11;
        v.ai = { pts, idx: (seg + 1) % pts.length, loop: r.loop, cruise: cruise + Math.random() * 1.5 };
        v.syncTransform();
        scene.add(v.group);
        vehicles.push(v);
      });
    }
  });

  // ---------- mission markers ----------
  const markerMat = new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.8, side: THREE.DoubleSide, fog: false });
  const markers = [0, 1].map(() => {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 40, 24, 1, true), markerMat);
    beam.position.y = 20;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    g.add(beam, ring);
    g.visible = false;
    scene.add(g);
    return g;
  });

  progress.value = 92;
  loadingText.textContent = 'Connecting your phone…';
  const backend = await createBackend();
  await step(95, 'Opening the gates…', () => renderer.compile(scene, camera));

  // ---------- game state ----------
  const input = new Input(root);
  const hud = new Hud();
  const missions = new Missions();
  const state = {
    minutes: 7 * 60 + 30,
    day: 0,
    money: 25000,
    energy: 85,
    alert: 0,
    alertCooldown: 0,
    speeding: 0,
    curfew: 0,
    atmDay: -1,
    tokens: 20,
  };
  const absMinutes = () => state.day * 1440 + state.minutes;
  let driving: Vehicle | null = null;
  let cineCam: { p: THREE.Vector3; t: THREE.Vector3 } | null = null; // debug filming camera
  let showMarkers = true; // debug filming can hide objective beams
  let engineInput: Parameters<Sound['engineUpdate']>[0] = null;
  let stepDist = 0;
  let honkCooldown = 2;
  let dayLight = 1;
  let indoors: Interior | null = null;
  let retreatActive = false;
  let retreatOffended = false;
  const fade = $('fade');
  let playerYaw = SPAWN.yaw;
  let playerSpeed = 0;
  let camYaw = SPAWN.yaw;
  let camPitch = 0.22;
  const focus = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  // touch controls
  document.querySelectorAll<HTMLElement>('[data-move]').forEach((b) => {
    const map: Record<string, string> = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD' };
    input.bindHold(b, map[b.dataset.move!]);
  });
  input.bindHold($('run-button'), 'ShiftLeft');
  input.bindTap($('interact-button'), 'KeyE');
  input.bindTap($('vehicle-button'), 'KeyF');
  input.bindTap($('horn-button'), 'KeyQ');

  // ---------- rides and phone ----------
  const rides = new Rides(scene, vehicles, (t) => hud.toast(t, 4200));
  const places: Place[] = [
    ...BUILDINGS.map((b) => ({ id: b.id, name: b.name, pos: pois[b.id] })),
    { id: 'parade', name: 'Parade Ground', pos: pois.parade },
    { id: 'hangar', name: 'Hangar 1', pos: pois.hangar },
    { id: 'stadium', name: 'Sports Complex', pos: pois.stadium },
    { id: 'gate', name: 'Main Gate', pos: pois.gate },
  ].sort((a, b) => a.name.localeCompare(b.name));
  let captureResolve: ((s: string) => void) | null = null;
  const phone = new Phone(
    backend,
    {
      money: () => state.money,
      tokens: () => state.tokens,
      buyTokens: (n) => {
        if (state.money < n * TOKEN_PRICE_NAIRA) return false;
        state.money -= n * TOKEN_PRICE_NAIRA;
        state.tokens += n;
        return true;
      },
      spendTokens: (n) => {
        if (state.tokens < n) return false;
        state.tokens -= n;
        return true;
      },
      refundTokens: (n) => (state.tokens += n),
      clock: () => clockText(state.minutes),
      places: () => places,
      playerPos: () => player.group.position,
      capture: () => new Promise<string>((r) => (captureResolve = r)),
      toast: (t) => hud.toast(t, 3600),
      openLegal: (page) => menu.toggle(true, page),
      sound: (name) => sound[name](),
    },
    rides,
  );
  $('phone-button').addEventListener('click', () => phone.toggle());

  const hallPoi = () => pois[UNI.playerHall];

  function locate(x: number, z: number): string {
    if (indoors) return indoors.name;
    if (z > GATE.z + 1) return Math.abs(z - 300) < 12 ? 'Base Access Road' : 'Main Gate Checkpoint';
    if (Math.abs(x) > FENCE || z < -FENCE) return 'Outside Campus';
    if (z > GATE.z - 32 && Math.abs(x) < 50) return 'Main Gate';
    for (const b of BUILDINGS) {
      if (x > b.x - b.w / 2 - 12 && x < b.x + b.w / 2 + 12 && z > b.z - b.d / 2 - 12 && z < b.z + b.d / 2 + 12) return b.name;
    }
    if (Math.abs(x - STADIUM.x) < 66 && Math.abs(z - STADIUM.z) < 40) return 'Sports Complex';
    if (Math.abs(x - PARADE.x) < PARADE.w / 2 + 10 && Math.abs(z - PARADE.z) < PARADE.d / 2 + 10) return 'Parade Ground';
    if (Math.abs(x - HANGAR.x) < HANGAR.w / 2 + 8 && Math.abs(z - HANGAR.z) < HANGAR.d / 2 + 8) return 'Hangar 1 & Apron';
    const r = roadAt(x, z, 1);
    if (r === -2) return 'Unity Roundabout';
    if (r >= 0) return ROADS[r].name;
    return 'Force Life Campus';
  }

  function onCampus(p: THREE.Vector3) {
    return Math.abs(p.x) < FENCE && p.z < GATE.z && p.z > -FENCE;
  }

  function buildingOf(id: string) {
    return BUILDINGS.find((b) => b.id === id)!;
  }

  function transition(fn: () => void) {
    fade.classList.add('is-on');
    setTimeout(() => {
      fn();
      fade.classList.remove('is-on');
    }, 260);
  }

  function enterInterior(room: Interior) {
    sound.door();
    transition(() => {
      indoors = room;
      room.group.visible = true;
      player.group.position.copy(room.spawn);
      playerYaw = camYaw = 0;
      camPitch = 0.15;
      camera.far = 120;
      camera.updateProjectionMatrix();
      const strength = room.h * room.h * 3.2;
      room.lights.forEach((p, i) => {
        roomLights[i].position.copy(p);
        roomLights[i].intensity = strength;
        scene.add(roomLights[i]);
      });
      focus.copy(player.group.position).setY(1.6);
      updateCamera(1);
      camera.position.copy(camTarget);
      hud.toast(`${room.name}. Press E at the door to go back outside.`);
    });
  }

  function leaveInterior() {
    const room = indoors;
    if (!room) return;
    sound.door();
    transition(() => {
      room.group.visible = false;
      indoors = null;
      for (const l of roomLights) scene.remove(l);
      camera.far = 6000;
      camera.updateProjectionMatrix();
      const b = buildingOf(room.building);
      const e = pois[room.building];
      player.group.position.copy(e);
      playerYaw = camYaw = Math.atan2(-(e.x - b.x), -(e.z - b.z));
      focus.copy(player.group.position).setY(1.6);
      updateCamera(1);
      camera.position.copy(camTarget);
    });
  }

  /** The building door the player is standing at, if it has an interior. */
  function doorHere(): Interior | null {
    if (driving || indoors) return null;
    for (const room of interiors.list) {
      if (pois[room.building].distanceTo(player.group.position) < 3.6) return room;
    }
    return null;
  }

  function exitVehicle(force = false) {
    if (!driving) return;
    if (!force && Math.abs(driving.speed) > 4) {
      hud.toast('Slow down before you get out.');
      return;
    }
    const v = driving;
    const left = tmp.set(-Math.cos(v.yaw), 0, Math.sin(v.yaw));
    player.group.position.copy(v.pos).addScaledVector(left, v.spec.radius + 0.7);
    player.group.position.y = 0;
    resolveCircle(player.group.position, 0.35, colliders);
    player.group.visible = true;
    playerYaw = v.yaw;
    if (force) v.speed = 0;
    v.driven = false;
    driving = null;
  }

  function offence(msg: string, fine: number) {
    sound.whistle();
    state.alert = Math.min(3, state.alert + 1);
    state.money -= fine;
    state.alertCooldown = 35;
    hud.toast(msg, 4200);
    if (state.alert >= 3) {
      state.money -= 5000;
      exitVehicle(true);
      const h = hallPoi();
      player.group.position.set(h.x + 2, 0, h.z);
      state.alert = 0;
      state.speeding = 0;
      state.curfew = 0;
      if (indoors) {
        indoors.group.visible = false;
        indoors = null;
        for (const l of roomLights) scene.remove(l);
        camera.far = 6000;
        camera.updateProjectionMatrix();
      }
      hud.showBanner('ARRESTED BY THE PROVOST', `${naira(5000)} fine. You were escorted back to Hostel B.`);
    }
  }

  function completeStep() {
    const m = missions.current;
    if (!m) return;
    const late = missions.late || (m.deadline !== undefined && absMinutes() > m.deadline);
    let text = m.doneText;
    if (late && m.lateText) {
      text = m.lateText;
      if (m.lateFine) state.money -= m.lateFine;
    }
    if (m.reward && !late) {
      state.money += m.reward;
      text += ` +${naira(m.reward)}`;
    }
    hud.showBanner(late ? 'OBJECTIVE COMPLETE · LATE' : 'OBJECTIVE COMPLETE', text);
    sound.objective();
    if (m.advanceTo !== undefined && state.day === 0 && state.minutes < m.advanceTo) {
      state.minutes = m.advanceTo;
    }
    missions.advance();
    queueMicrotask(() => saveNow());
    const next = missions.current;
    if (next) setTimeout(() => hud.toast(`New objective: ${next.title}`), 2500);
  }

  function interact() {
    const p = player.group.position;
    const m = missions.current;
    if (indoors && p.distanceTo(indoors.exit) < 1.6) {
      leaveInterior();
      return true;
    }
    if (pois.atm && p.distanceTo(pois.atm) < 3.2) {
      if (state.atmDay === state.day) {
        hud.toast("You've reached today's withdrawal limit. Try again tomorrow.");
      } else {
        state.atmDay = state.day;
        state.money += 10000;
        sound.cash();
        hud.toast(`Withdrew ${naira(10000)}. Network was fast for once.`);
      }
      if (m?.interaction === 'atm') completeStep();
      return true;
    }
    if (indoors?.building === 'cafeteria' && p.distanceTo(pois['caf-counter']) < 2.2) {
      if (state.money < 1500) hud.toast('Not enough money. Visit the ATM Gallery first.');
      else {
        state.money -= 1500;
        sound.cash();
        state.energy = Math.min(100, state.energy + 45);
        hud.toast(`Jollof rice and plantain: −${naira(1500)}`);
        if (m?.interaction === 'food') completeStep();
      }
      return true;
    }
    const door = doorHere();
    if (door) {
      enterInterior(door);
      return true;
    }
    return false;
  }

  // ---------- frame update ----------
  let fpsFrames = 0;
  let fpsTime = 0;
  let elapsed = 0;
  const clock = new THREE.Clock();
  const helpEl = $('controls-hint');

  function update(dt: number) {
    elapsed += dt;
    state.minutes += dt * TIME_SCALE * timeScaleOverride;
    if (state.minutes >= 1440) {
      state.minutes -= 1440;
      state.day++;
    }

    if (input.tap('KeyH')) helpEl.hidden = !helpEl.hidden;

    // camera look
    const sens = menu.settings.sensitivity;
    camYaw -= input.lookDX * 0.0042 * sens;
    camPitch = clamp(camPitch + input.lookDY * 0.003 * sens * (menu.settings.invertY ? -1 : 1), -0.05, 1.15);

    // enter / exit vehicle
    if (input.tap('KeyP')) phone.toggle();
    if (input.tap('KeyM') || (input.tap('Escape') && !document.pointerLockElement && !phone.open)) menu.toggle();
    if (input.tap('KeyC') && rides.riding) rides.cycleCamera();
    if (input.tap('KeyF') && !driving && rides.canBoard(player.group.position)) {
      rides.board();
      player.group.visible = false;
    } else if (input.tap('KeyF') && !rides.riding) {
      if (driving) exitVehicle();
      else {
        let best: Vehicle | null = null;
        let bestD = Infinity;
        for (const v of vehicles) {
          if (v.ai) continue;
          const d = v.pos.distanceTo(player.group.position) - v.spec.radius;
          if (d < 2.2 && d < bestD) {
            best = v;
            bestD = d;
          }
        }
        if (best) {
          driving = best;
          best.driven = true;
          player.group.visible = false;
          hud.toast(`${best.label}. W/S to drive, A/D to steer, Space for handbrake, F to get out.`);
        }
      }
    }

    // movement
    const p = player.group.position;
    const drop = rides.update(dt);
    if (drop) {
      p.copy(drop);
      resolveCircle(p, 0.35, colliders);
      player.group.visible = true;
      playerYaw = camYaw = rides.vehicle ? rides.vehicle.yaw : camYaw;
    }
    if (rides.riding && rides.vehicle) {
      p.copy(rides.vehicle.pos);
      playerSpeed = 0;
    } else if (driving) {
      const throttle = (input.down('KeyW', 'ArrowUp') ? 1 : 0) - (input.down('KeyS', 'ArrowDown') ? 1 : 0);
      const steer = (input.down('KeyA', 'ArrowLeft') ? 1 : 0) - (input.down('KeyD', 'ArrowRight') ? 1 : 0);
      const before = driving.speed;
      driving.drive({ throttle, steer, handbrake: input.down('Space') }, dt, colliders, vehicles);
      const lost = Math.abs(before) - Math.abs(driving.speed);
      if (lost > 3) sound.crash(lost);
      if (input.tap('KeyQ')) sound.horn(driving.kind);
      sound.skid(input.down('Space') && Math.abs(driving.speed) > 7, Math.abs(driving.speed) / 20);
      engineInput = { kind: driving.kind, speed: driving.speed, maxSpeed: driving.spec.maxSpeed, throttle };
      p.copy(driving.pos);
      if (Math.abs(driving.speed) > 2 && performance.now() - input.lastLookAt > 1200) {
        const target = driving.yaw + (driving.speed < 0 ? Math.PI : 0);
        camYaw += angleDiff(camYaw, target) * (1 - Math.exp(-2.4 * dt));
      }
    } else {
      const fwd = (input.down('KeyW', 'ArrowUp') ? 1 : 0) - (input.down('KeyS', 'ArrowDown') ? 1 : 0);
      const str = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
      if (fwd || str) {
        const dx = -Math.sin(camYaw) * fwd + Math.cos(camYaw) * str;
        const dz = -Math.cos(camYaw) * fwd - Math.sin(camYaw) * str;
        const len = Math.hypot(dx, dz);
        const run = input.down('ShiftLeft', 'ShiftRight') && state.energy > 1;
        playerSpeed = run ? 6.2 : 2.7;
        if (run) state.energy -= 3.2 * dt;
        p.x += (dx / len) * playerSpeed * dt;
        p.z += (dz / len) * playerSpeed * dt;
        stepDist += playerSpeed * dt;
        if (stepDist > (run ? 1.15 : 0.75)) {
          stepDist = 0;
          sound.footstep(run, !!indoors);
        }
        const want = Math.atan2(-dx, -dz);
        playerYaw += angleDiff(playerYaw, want) * (1 - Math.exp(-12 * dt));
        // the camera swings round behind the way you face, unless you have just looked around
        if (performance.now() - input.lastLookAt > 900) {
          const rate = fwd > 0 && !str ? 3 : fwd < 0 ? 0 : 1.4;
          camYaw += angleDiff(camYaw, playerYaw) * (1 - Math.exp(-rate * dt));
        }
      } else playerSpeed = 0;
      if (playerSpeed < 3 && state.energy < 60) state.energy += 0.8 * dt;
      resolveCircle(p, 0.35, colliders);
      for (const v of vehicles) separate(p, 0.35, v.pos, v.spec.radius * 0.85);
      player.group.rotation.y = playerYaw;
      player.animate(playerSpeed, dt);
    }

    // traffic and crowd
    const obstacles = driving ? [] : [p];
    for (const v of vehicles) {
      if (!v.ai) continue;
      if (retreatActive && onCampus(v.pos)) {
        v.speed = Math.max(0, v.speed - v.spec.brake * dt);
        v.pos.addScaledVector(v.forward(tmp), v.speed * dt);
        v.syncTransform(dt);
      } else v.think(dt, vehicles, obstacles);
    }
    interiors.update(dt, indoors);
    // ---------- sound ----------
    if (!driving) sound.skid(false);
    if (rides.riding && rides.vehicle) {
      const rv = rides.vehicle;
      engineInput = { kind: rv.kind, speed: rv.speed, maxSpeed: rv.spec.maxSpeed, throttle: 0.5 };
    }
    sound.engineUpdate(engineInput, rides.riding);
    engineInput = null;
    sound.ambience(dt, dayLight, indoors ? { fans: indoors.fans.length > 0 } : null);
    honkCooldown -= dt;
    if (honkCooldown <= 0 && !indoors) {
      for (const v of vehicles) {
        if (!v.ai || !v.heldUp) continue;
        const d = v.pos.distanceTo(camera.position);
        if (d > 60) continue;
        tmp.subVectors(v.pos, camera.position);
        const right = tmp.x * Math.cos(camYaw) - tmp.z * Math.sin(camYaw);
        sound.horn(v.kind, Math.max(0.15, 1 - d / 60), right / Math.max(1, d));
        honkCooldown = 3 + Math.random() * 4;
        break;
      }
    }
    crowd.update(dt, camera.position, driving);

    // interactions and prompts
    let prompt = '';
    if (input.tap('KeyE') && !driving) interact();
    if (rides.canBoard(p)) prompt = 'Press F to get in your Waka ride';
    else if (rides.riding) prompt = '';
    else if (!driving) {
      if (pois.atm && p.distanceTo(pois.atm) < 3.2) prompt = `Press E to withdraw ${naira(10000)}`;
      else if (indoors?.building === 'cafeteria' && p.distanceTo(pois['caf-counter']) < 2.2) prompt = `Press E to buy jollof rice (${naira(1500)})`;
      else if (indoors && p.distanceTo(indoors.exit) < 1.6) prompt = 'Press E to go outside';
      else if (doorHere()) prompt = `Press E to enter ${doorHere()!.name}`;
      else {
        for (const v of vehicles) {
          if (!v.ai && v.pos.distanceTo(p) - v.spec.radius < 2.2) {
            prompt = `Press F to get in the ${v.label.toLowerCase()}`;
            break;
          }
        }
      }
    } else if (Math.abs(driving.speed) < 1) prompt = 'Press F to get out';

    // missions
    const m = missions.current;
    const blips: Blip[] = [
      toBlip(pois.atm, '#22c55e', '₦'),
      toBlip(pois.cafeteria, '#fb923c', 'C'),
      toBlip(pois.parade, '#93c5fd', 'P'),
      toBlip(hallPoi(), '#60a5fa', 'H'),
    ];
    if (rides.vehicle && !rides.riding && rides.phase !== 'leaving') blips.push(toBlip(rides.vehicle.pos, '#a855f7', 'W'));
    markers.forEach((mk) => (mk.visible = false));
    if (m) {
      // Interior targets: lead the player to the building door until they are inside.
      const guide = m.targets.map((id) => {
        const b = INTERIOR_POI_BUILDING[id];
        if (b && indoors?.building !== b) return pois[b];
        return pois[id];
      });
      const targets = m.targets.map((id) => pois[id]).filter(Boolean);
      guide.forEach((t, i) => {
        if (!markers[i] || !t) return;
        markers[i].visible = showMarkers;
        markers[i].position.set(t.x, 0, t.z);
        markers[i].scale.setScalar(indoors ? 0.45 : 1);
        markers[i].children[1].scale.setScalar(1 + Math.sin(elapsed * 3) * 0.12);
        if (!indoors) blips.push(toBlip(t, '#ffd23f'));
      });
      let nearest = Math.min(...targets.map((t) => t.distanceTo(p)));
      // Being inside the target building's interior also counts (e.g. curfew in your room).
      if (indoors && m.targets.includes(indoors.building)) nearest = 0;
      const radius = m.targets.some((id) => INTERIOR_POI_BUILDING[id]) ? 1.4 : 4.5;
      if (m.deadline !== undefined && !missions.late && absMinutes() > m.deadline) {
        missions.late = true;
        if (m.lateText) hud.toast(m.lateText, 4500);
      }
      if (m.waitFor === 'retreat') {
        const here = nearest < 45;
        const before = state.day === 0 && state.minutes < 18 * 60;
        if (here && before && state.minutes < 17 * 60 + 55) {
          state.minutes = 17 * 60 + 58;
          hud.toast('You take your place by the parade ground. The bugler is getting ready…');
        }
        if (here && retreatActive) prompt = 'RETREAT: stand still until the flag is down';
        else if (here && before) prompt = 'Wait here. Retreat starts at 6:00 PM.';
      } else if (!m.interaction && nearest < radius) {
        if (driving) prompt = prompt || 'Get out of the vehicle (F) to continue';
        else completeStep();
      }
      const cur = missions.current;
      hud.setMission(cur ? cur.title : null, cur ? cur.text : '');
    } else hud.setMission(null, '');

    // campus marshals
    const kmh = driving ? Math.abs(driving.speed) * 3.6 : 0;
    if (driving && onCampus(p) && kmh > SPEED_LIMIT_KMH + 5) state.speeding += dt;
    else state.speeding = Math.max(0, state.speeding - dt);
    if (state.speeding > 2.5) {
      state.speeding = -4;
      offence(`Base Provost: the speed limit on base is ${SPEED_LIMIT_KMH} km/h. ${naira(2000)} fine.`, 2000);
    }
    const hour = state.minutes / 60;
    if ((hour >= 22 || hour < 5) && !indoors && onCampus(p) && p.distanceTo(hallPoi()) > 30) {
      state.curfew += dt;
      if (state.curfew > 15) {
        state.curfew = 0;
        offence('Out after curfew! The Provost is on patrol. Get back to Hostel B.', 0);
      }
    } else state.curfew = 0;
    // Retreat: 6:00 to 6:15 PM, everyone outdoors stands still while the flag comes down.
    const nowRetreat = state.minutes >= 18 * 60 && state.minutes < 18 * 60 + 15;
    if (nowRetreat && !retreatActive) {
      retreatActive = true;
      retreatOffended = false;
      crowd.halted = true;
      hud.showBanner('RETREAT', 'The bugle sounds. Stand still while the flag is lowered.', 5000);
      sound.bugle();
    } else if (!nowRetreat && retreatActive) {
      retreatActive = false;
      crowd.halted = false;
      const cur = missions.current;
      if (cur?.waitFor === 'retreat') {
        const there = p.distanceTo(pois.parade) < 45;
        if (!there) missions.late = true;
        completeStep();
      }
    }
    if (retreatActive && !indoors && onCampus(p) && !retreatOffended) {
      const moving = driving ? Math.abs(driving.speed) > 1 : playerSpeed > 0.5;
      if (moving) {
        retreatOffended = true;
        offence(`Base Provost: you kept moving during Retreat. ${naira(1000)} fine.`, 1000);
      }
    }
    const lowered = state.minutes >= 18 * 60 + 15 || state.minutes < 6 * 60;
    for (const f of flags) {
      const r = f.userData.retreat as { top: number; bottom: number } | undefined;
      if (!r) continue;
      const t = retreatActive ? (state.minutes - 18 * 60) / 15 : lowered ? 1 : 0;
      f.position.y = r.top + (r.bottom - r.top) * t;
    }
    state.alertCooldown -= dt;
    if (state.alertCooldown <= 0 && state.alert > 0) {
      state.alert--;
      state.alertCooldown = 25;
    }

    updateLighting();
    updateCamera(dt);
    for (const f of flags) f.rotation.y = Math.sin(elapsed * 2 + f.position.x) * 0.25;

    // HUD
    hud.status(state.minutes, state.day, state.money, state.alert, state.energy);
    hud.setLocation(locate(p.x, p.z));
    hud.setPrompt(prompt);
    hud.setSpeed(driving ? kmh : rides.riding && rides.vehicle ? Math.abs(rides.vehicle.speed) * 3.6 : null);
    phone.tick();
    const heading = driving ? driving.yaw : playerYaw;
    const mp = indoors ? pois[indoors.building] : p;
    hud.drawMap(mp.x, mp.z, camYaw, heading, blips);
  }

  const sunDir = new THREE.Vector3();
  const fogDay = new THREE.Color('#d9d2bf');
  const fogDusk = new THREE.Color('#e2a46f');
  const fogNight = new THREE.Color('#0a1220');
  const sunDay = new THREE.Color('#fff3df');
  const sunLow = new THREE.Color('#ffae6b');
  const moon = new THREE.Color('#9fb4ff');
  function updateLighting() {
    // Sunrise about 6:30 AM, sunset about 7:00 PM, as in southern Nigeria.
    const a = ((state.minutes / 60 - 6.5) / 12.5) * Math.PI;
    sunDir.set(Math.cos(a), Math.sin(a), -0.35).normalize();
    const elev = sunDir.y;
    const day = smoothstep(-0.1, 0.22, elev);
    const night = 1 - day;
    dayLight = day;
    const low = 1 - smoothstep(0.05, 0.45, Math.abs(elev));
    su.sunPosition.value.copy(sunDir);
    const lightDir = elev > -0.05 ? sunDir : tmp.set(-sunDir.x, -sunDir.y, sunDir.z).normalize();
    sun.position.copy(focus).addScaledVector(lightDir, 160);
    sun.target.position.copy(focus);
    sun.intensity = day * 2.8 + night * 0.35;
    sun.color.copy(elev > -0.05 ? sunDay.clone().lerp(sunLow, low) : moon);
    hemi.intensity = 0.12 + 0.55 * day;
    scene.environmentIntensity = 0.12 + 0.55 * day;
    const fog = scene.fog as THREE.Fog;
    fog.color.copy(fogNight).lerp(fogDay, day).lerp(fogDusk, low * day * 0.6);
    renderer.toneMappingExposure = 0.55 + night * 0.3;
    (wb.stars.material as THREE.PointsMaterial).opacity = night;
    const lightsOn = smoothstep(0.15, -0.02, elev);
    for (const n of wb.night) n.mat.emissiveIntensity = n.max * lightsOn;
    for (const v of vehicles) v.setNight(lightsOn);
    interiors.setDaylight(day);
  }

  const camTarget = new THREE.Vector3();
  function updateCamera(dt: number) {
    if (cineCam) {
      // debug filming: a scripted camera position and target
      camera.position.copy(cineCam.p);
      camera.lookAt(cineCam.t);
      focus.copy(cineCam.t);
      return;
    }
    if (rides.riding && rides.vehicle) {
      focus.copy(rides.vehicle.pos);
      rides.updateCamera(camera, dt);
      return;
    }
    const p = player.group.position;
    if (driving) focus.copy(driving.pos).setY(driving.spec.camHeight);
    else focus.copy(p).setY(1.6);
    let dist = driving ? driving.spec.camDist : indoors ? 3.2 : 4.6;
    const off = tmp.set(Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), Math.cos(camYaw) * Math.cos(camPitch));
    for (let t = 0.15; t <= 1.0001; t += 0.085) {
      const x = focus.x + off.x * dist * t;
      const y = focus.y + off.y * dist * t;
      const z = focus.z + off.z * dist * t;
      if (pointInBoxes(x, y, z, colliders)) {
        dist = Math.max(1.2, dist * t - 0.6);
        break;
      }
    }
    camTarget.copy(focus).addScaledVector(off, dist);
    camTarget.y = Math.max(0.6, camTarget.y);
    if (indoors) {
      // keep the camera inside the room's walls
      const r = indoors;
      camTarget.y = Math.min(camTarget.y, r.h - 0.35);
      camTarget.x = clamp(camTarget.x, r.centre.x - r.w / 2 + 0.35, r.centre.x + r.w / 2 - 0.35);
      camTarget.z = clamp(camTarget.z, r.centre.z - r.d / 2 + 0.35, r.centre.z + r.d / 2 - 0.35);
    }
    camera.position.lerp(camTarget, 1 - Math.exp(-14 * dt));
    camera.lookAt(focus);
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // first frame placement
  focus.copy(player.group.position).setY(1.6);
  updateCamera(1);
  camera.position.copy(camTarget);

  progress.value = 100;
  await nextFrame();
  $('loading-screen').classList.add('is-done');
  setTimeout(() => $('loading-screen').remove(), 800);
  // ---------- settings ----------
  function applySettings(st: Settings) {
    const dpr = Math.min(devicePixelRatio, 2);
    renderer.setPixelRatio(st.quality === 'low' ? Math.min(dpr, 1) * 0.8 : st.quality === 'medium' ? Math.min(dpr, 1.25) : Math.min(dpr, 1.75));
    renderer.setSize(innerWidth, innerHeight);
    sun.castShadow = st.quality !== 'low';
    const size = st.quality === 'high' ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    (scene.fog as THREE.Fog).far = st.quality === 'low' ? 420 : st.quality === 'medium' ? 560 : 700;
    rides.radio.setVolume(st.radioVolume);
    sound.setVolumes(st.sfxVolume, st.ambience);
    showFps = st.showFps || import.meta.env.DEV || new URLSearchParams(location.search).has('fps');
    $('fps').hidden = !showFps;
  }
  menu.onSettings = applySettings;
  applySettings(menu.settings);

  // ---------- saving progress to the player's account ----------
  const snapshot = (): SaveData => ({
    v: 1,
    money: Math.round(state.money),
    tokens: state.tokens,
    energy: Math.round(state.energy),
    minutes: state.minutes,
    day: state.day,
    mission: missions.idx,
    atmDay: state.atmDay,
    x: indoors ? pois[indoors.building].x : rides.riding && rides.vehicle ? rides.vehicle.pos.x : player.group.position.x,
    z: indoors ? pois[indoors.building].z : rides.riding && rides.vehicle ? rides.vehicle.pos.z : player.group.position.z,
    savedAt: Date.now(),
  });
  let lastSave = 0;
  // Never save until this player's progress has been loaded, or a fresh state would overwrite it.
  let saveReady = false;
  // Saves go out one at a time; if more happen meanwhile, one fresh save follows, so the newest state always wins.
  let saving = false;
  let saveAgain = false;
  function saveNow() {
    if (!backend.me || !saveReady) return;
    lastSave = performance.now();
    if (saving) {
      saveAgain = true;
      return;
    }
    saving = true;
    backend
      .writeSave(snapshot())
      .catch(() => hud.toast('Could not save your progress. Check your connection.'))
      .finally(() => {
        saving = false;
        if (saveAgain) {
          saveAgain = false;
          saveNow();
        }
      });
  }
  function applySave(d: SaveData) {
    if (driving) exitVehicle(true);
    if (indoors) leaveInterior();
    Object.assign(state, { money: d.money, tokens: d.tokens, energy: d.energy, minutes: d.minutes, day: d.day, atmDay: d.atmDay });
    missions.idx = Math.min(d.mission, missions.steps.length);
    missions.late = false;
    player.group.position.set(d.x, 0, d.z);
    resolveCircle(player.group.position, 0.35, colliders);
  }
  let loadedFor = '';
  backend.onAuth(async (p) => {
    if (!p) {
      loadedFor = '';
      saveReady = false;
      return;
    }
    if (loadedFor === p.uid) return;
    loadedFor = p.uid;
    saveReady = false;
    try {
      const d = await backend.loadSave();
      saveReady = true;
      if (d) {
        applySave(d);
        hud.toast(`Welcome back, ${p.displayName}. Progress loaded.`);
      } else {
        saveNow(); // new account keeps what was done before signing in
        hud.toast(`Welcome, ${p.displayName}. Your progress now saves to your account.`);
      }
    } catch {
      hud.toast('Could not load your saved progress. Check your connection.');
    }
  });
  addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveNow());
  addEventListener('pagehide', () => saveNow());

  if (!backend.me) setTimeout(() => phone.toggle(true), 600);
  hud.showBanner('FORCE LIFE', `Resumption day at ${UNI.short}, ${UNI.town}. Follow the yellow marker to the checkpoint.`, 5000);

  // Testing and filming tools: only in development builds or builds made with VITE_DEBUG_TOOLS=1, never on the live site.
  if ((import.meta.env.DEV || import.meta.env.VITE_DEBUG_TOOLS === '1') && new URLSearchParams(location.search).has('debug')) {
    Object.assign(window, {
      uni: {
        state,
        vehicles,
        teleport: (x: number, z: number, yaw = 0) => {
          exitVehicle(true);
          player.group.position.set(x, 0, z);
          camYaw = playerYaw = yaw;
        },
        drive: (i: number) => {
          driving = vehicles[i];
          driving.driven = true;
          player.group.visible = false;
        },
        enter: (b: string) => enterInterior(interiors.byBuilding(b)!),
        pois,
        warp: (n: number) => (warp = Math.max(1, Math.floor(n))),
        // ---- filming mode: the game advances only when step() is called, one frame at a time ----
        film: (on: boolean) => {
          renderer.setAnimationLoop(on ? null : loop);
          clock.getDelta();
        },
        step: (n = 1, dt = 1 / 24) => {
          for (let i = 0; i < n; i++) {
            update(dt);
            input.endFrame();
          }
          renderer.render(scene, camera);
        },
        hold: (code: string, on: boolean) => input.hold(code, on),
        cam: (p: number[] | null, t?: number[]) => {
          cineCam = p && t ? { p: new THREE.Vector3(p[0], p[1], p[2]), t: new THREE.Vector3(t[0], t[1], t[2]) } : null;
        },
        timeScale: (n: number) => (timeScaleOverride = n),
        markers: (on: boolean) => (showMarkers = on),
        hudMode: (mode: 'full' | 'play' | 'clean') => {
          document.body.dataset.film = mode;
        },
        player: () => {
          const p = player.group.position;
          return { x: p.x, z: p.z, yaw: playerYaw, driving: !!driving, speed: driving ? driving.speed : 0 };
        },
        phone: (open: boolean) => phone.toggle(open),
        book: (tier: 'keke' | 'car' | 'luxury', dest: string) => {
          const place = places.find((x) => x.id === dest)!;
          rides.book(tier, place, player.group.position, 0);
        },
        board: () => {
          rides.board();
          player.group.visible = false;
        },
        rideCam: (m: 'chase' | 'side' | 'overhead' | 'cinematic') => {
          rides.camMode = m;
          rides.renderPanel();
        },
        ridePhase: () => rides.phase,
        ride: () => {
          const v = rides.vehicle;
          return v ? { phase: rides.phase, x: +v.pos.x.toFixed(1), z: +v.pos.z.toFixed(1), speed: +v.speed.toFixed(1), idx: v.ai?.idx, n: v.ai?.pts.length, arrived: v.ai?.arrived, pts: v.ai?.pts.map((q) => [Math.round(q.x), Math.round(q.y)]) } : null;
        },
        mission: () => missions.current?.id ?? 'done',
        press: (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code })),
        leave: () => leaveInterior(),
        look: (yaw: number, pitch: number) => {
          camYaw = yaw;
          camPitch = pitch;
        },
      },
    });
  }

  let lastReal = performance.now();
  let warp = 1; // debug fast-forward: game updates per drawn frame
  function loop() {
    const now = performance.now();
    const realDt = (now - lastReal) / 1000;
    lastReal = now;
    const dt = Math.min(clock.getDelta(), 0.05);
    if (backend.me && saveReady && now - lastSave > 30_000) saveNow();
    sound.setPaused(menu.open);
    for (let i = 0; i < (menu.open ? 0 : warp); i++) {
      update(dt);
      input.endFrame();
    }
    renderer.render(scene, camera);
    if (captureResolve) {
      // grab the frame straight after rendering, downscaled for sending
      const src = renderer.domElement;
      const c = document.createElement('canvas');
      c.width = 480;
      c.height = Math.round((480 * src.height) / src.width);
      c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
      captureResolve(c.toDataURL('image/jpeg', 0.72));
      captureResolve = null;
    }
    input.endFrame();
    fpsFrames++;
    fpsTime += realDt;
    if (fpsTime > 0.5 && showFps) {
      hud.setFps(Math.round(fpsFrames / fpsTime));
      fpsFrames = 0;
      fpsTime = 0;
    }
  }
  renderer.setAnimationLoop(loop);
}

boot();
