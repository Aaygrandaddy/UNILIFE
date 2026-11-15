// World layout for Force Life Institute of Technology, a fictional air-force-run campus in Kaduna.
// The layout is designed for gameplay.
// Coordinates are metres. -Z is north, +X is east. The main gate is on the south side.

export const UNI = {
  name: 'Force Life Institute of Technology',
  short: 'Force Life',
  town: 'Kaduna',
  motto: 'Kaduna',
  playerHall: 'hostelB',
  disclaimer: 'A fictional campus. Not affiliated with any real institution or the Nigerian Air Force.',
};

export const FENCE = 250;

export type Facing = 'n' | 's' | 'e' | 'w';
export type Kind =
  | 'block'
  | 'senate'
  | 'arena'
  | 'library'
  | 'theatre'
  | 'hospital'
  | 'chapel'
  | 'mosque'
  | 'admin'
  | 'cafeteria'
  | 'shops'
  | 'hostel';

export interface BuildingDef {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number; // size along X
  d: number; // size along Z
  h: number;
  kind: Kind;
  wall: string;
  facing: Facing;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'senate', name: 'Senate Building', x: 0, z: -50, w: 56, d: 26, h: 20, kind: 'senate', wall: '#ece6d8', facing: 's' },
  { id: 'hall', name: 'Multipurpose Hall', x: 0, z: -102, w: 54, d: 30, h: 13, kind: 'arena', wall: '#d9d6cc', facing: 's' },
  { id: 'library', name: 'Force Life Library', x: -58, z: -48, w: 32, d: 24, h: 16, kind: 'library', wall: '#e4ddcc', facing: 's' },
  { id: 'theatre', name: 'Lecture Theatre (LT1)', x: -105, z: -46, w: 28, d: 30, h: 12, kind: 'theatre', wall: '#e0d8c4', facing: 'e' },
  { id: 'airEng', name: 'Faculty of Air Engineering', x: -90, z: -102, w: 44, d: 26, h: 14, kind: 'block', wall: '#dcd6c6', facing: 's' },
  { id: 'groundEng', name: 'Faculty of Ground Engineering', x: 56, z: -48, w: 34, d: 22, h: 14, kind: 'block', wall: '#e8e1cf', facing: 's' },
  { id: 'sciences', name: 'Faculty of Sciences', x: 103, z: -48, w: 30, d: 24, h: 16, kind: 'block', wall: '#e3dfd4', facing: 's' },
  { id: 'medical', name: 'Base Medical Centre', x: 92, z: -102, w: 52, d: 28, h: 18, kind: 'hospital', wall: '#f0efe9', facing: 's' },
  { id: 'chapel', name: 'Base Chapel', x: -55, z: 52, w: 22, d: 38, h: 10, kind: 'chapel', wall: '#f2eee6', facing: 's' },
  { id: 'mosque', name: 'Base Central Mosque', x: -102, z: 52, w: 24, d: 24, h: 9, kind: 'mosque', wall: '#efe9dc', facing: 'e' },
  { id: 'admin', name: 'Registry & Bursary', x: 48, z: 44, w: 32, d: 20, h: 12, kind: 'admin', wall: '#e6dfcd', facing: 'w' },
  { id: 'cafeteria', name: 'Cafeteria', x: 100, z: 42, w: 28, d: 22, h: 8, kind: 'cafeteria', wall: '#eee3c8', facing: 'w' },
  { id: 'market', name: 'Mammy Market', x: 70, z: 86, w: 56, d: 10, h: 5, kind: 'shops', wall: '#f1eee6', facing: 'n' },
  { id: 'hostelA', name: 'Hostel A (Male)', x: -192, z: -62, w: 26, d: 50, h: 16, kind: 'hostel', wall: '#e4dfd2', facing: 'e' },
  { id: 'hostelB', name: 'Hostel B (Male)', x: -192, z: 22, w: 26, d: 50, h: 16, kind: 'hostel', wall: '#e1dbcc', facing: 'e' },
  { id: 'hostelC', name: 'Hostel C (Female)', x: 192, z: -62, w: 26, d: 50, h: 16, kind: 'hostel', wall: '#ece4dc', facing: 'w' },
  { id: 'hostelD', name: 'Hostel D (Female)', x: 192, z: 22, w: 26, d: 50, h: 16, kind: 'hostel', wall: '#ede6df', facing: 'w' },
];

export const SHOP_SIGNS = [
  { name: 'MAMA BLESSING CANTEEN', color: '#c0392b' },
  { name: 'BUSINESS CENTRE · PRINTING', color: '#1f6fb2' },
  { name: 'POS · AIRTIME · DATA', color: '#f2b705' },
  { name: 'SUYA & KILISHI', color: '#8e3b13' },
  { name: 'PROVISIONS STORE', color: '#2e7d32' },
  { name: 'BARBING & TAILORING', color: '#6a1b9a' },
  { name: 'ATM GALLERY', color: '#0b5d8a' },
];

export interface RoadDef {
  name: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  w: number;
  sidewalk: boolean;
}

// All roads are axis-aligned, which keeps rendering and collision simple.
export const ROADS: RoadDef[] = [
  { name: "Founders' Ring Road", x1: -146, z1: -140, x2: 146, z2: -140, w: 12, sidewalk: true },
  { name: "Founders' Ring Road", x1: -146, z1: 110, x2: 146, z2: 110, w: 12, sidewalk: true },
  { name: "Founders' Ring Road", x1: -140, z1: -146, x2: -140, z2: 116, w: 12, sidewalk: true },
  { name: "Founders' Ring Road", x1: 140, z1: -146, x2: 140, z2: 116, w: 12, sidewalk: true },
  { name: 'Senate Avenue', x1: -134, z1: 0, x2: 134, z2: 0, w: 12, sidewalk: true },
  { name: "Chancellor's Boulevard", x1: 0, z1: 0, x2: 0, z2: 308, w: 14, sidewalk: true },
  { name: 'Stadium Road', x1: 0, z1: -146, x2: 0, z2: -168, w: 10, sidewalk: false },
  { name: 'Hall Road', x1: -146, z1: -62, x2: -178, z2: -62, w: 8, sidewalk: false },
  { name: 'Hall Road', x1: -146, z1: 22, x2: -178, z2: 22, w: 8, sidewalk: false },
  { name: 'Hall Road', x1: 146, z1: -62, x2: 178, z2: -62, w: 8, sidewalk: false },
  { name: 'Hall Road', x1: 146, z1: 22, x2: 178, z2: 22, w: 8, sidewalk: false },
  { name: 'Base Access Road', x1: -380, z1: 300, x2: 380, z2: 300, w: 16, sidewalk: false },
];

export const ROUNDABOUT = { x: 0, z: 0, r: 18, island: 8 };
export const GATE = { z: 245, half: 10 };
export const PARADE = { x: -190, z: 160, w: 74, d: 54 };
export const HANGAR = { x: 185, z: 165, w: 72, d: 62 };
export const STADIUM = { x: 0, z: -207, w: 110, d: 64 };
export const PARKING = [
  { x: -30, z: 226, w: 28, d: 18 },
  { x: 30, z: 226, w: 28, d: 18 },
];

// Start outside the main gate, facing the guard room.
export const SPAWN = { x: -9, z: 266, yaw: 0 };

export type VKind = 'car' | 'suv' | 'keke' | 'bus' | 'pickup';
export const PARKED: { kind: VKind; x: number; z: number; yaw: number; color: string; label: string }[] = [
  { kind: 'car', x: -22, z: 226, yaw: 0, color: '#b9bec4', label: 'Saloon car' },
  { kind: 'suv', x: -34, z: 226, yaw: 0, color: '#1b1d22', label: 'SUV' },
  { kind: 'keke', x: 20, z: 228, yaw: 0, color: '#f2c200', label: 'Keke' },
  { kind: 'keke', x: 25, z: 228, yaw: 0, color: '#f2c200', label: 'Keke' },
  { kind: 'bus', x: 38, z: 226, yaw: 0, color: '#f4f4f2', label: 'Campus shuttle' },
  { kind: 'pickup', x: -40, z: 268, yaw: Math.PI / 2, color: '#e9e9e4', label: 'Pickup truck' },
  { kind: 'car', x: -165, z: 32, yaw: Math.PI / 2, color: '#8b1e1e', label: 'Saloon car' },
  { kind: 'car', x: 165, z: -50, yaw: -Math.PI / 2, color: '#24467a', label: 'Saloon car' },
];

// Traffic routes. Cars keep right (Nigeria drives on the right).
type P = [number, number];
export const ROUTES: { pts: P[]; loop: boolean; cars: { kind: VKind; color: string }[] }[] = [
  {
    pts: [[-140, -140], [140, -140], [140, 110], [-140, 110]],
    loop: true,
    cars: [
      { kind: 'car', color: '#d8d8d4' },
      { kind: 'pickup', color: '#2a4a7f' },
      { kind: 'car', color: '#7a1d1d' },
    ],
  },
  {
    pts: [[-140, 110], [140, 110], [140, -140], [-140, -140]],
    loop: true,
    cars: [
      { kind: 'car', color: '#c9b48a' },
      { kind: 'keke', color: '#f2c200' },
      { kind: 'car', color: '#1d3f73' },
    ],
  },
  {
    pts: [[-140, 0], [-24, 0], [0, 10], [24, 0], [140, 0], [140, 110], [-140, 110]],
    loop: true,
    cars: [
      { kind: 'car', color: '#efefef' },
      { kind: 'suv', color: '#5b5f63' },
    ],
  },
  {
    pts: [[-380, 300], [0, 300], [0, 22], [14, 0], [0, -14], [-14, 0], [0, 22], [0, 300], [380, 300]],
    loop: false,
    cars: [
      { kind: 'bus', color: '#f4f4f2' },
      { kind: 'keke', color: '#f2c200' },
    ],
  },
  { pts: [[380, 300], [-380, 300]], loop: false, cars: [{ kind: 'car', color: '#3a3a3a' }, { kind: 'keke', color: '#f2c200' }, { kind: 'suv', color: '#e8e4da' }] },
  { pts: [[-380, 300], [380, 300]], loop: false, cars: [{ kind: 'car', color: '#a33' }, { kind: 'car', color: '#ddd' }] },
];
