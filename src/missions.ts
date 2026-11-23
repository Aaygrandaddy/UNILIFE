export interface Step {
  id: string;
  title: string;
  text: string;
  /** POI ids. Any one of them completes the step. */
  targets: string[];
  /** Completed by an E-interaction instead of by arriving. 'shop' pays `cost` at the target. */
  interaction?: 'atm' | 'food' | 'shop';
  /** Naira paid when a 'shop' step is completed. */
  cost?: number;
  /** Game day (0 = Day 1) on which this story step becomes available. */
  day?: number;
  /** Absolute game minutes since midnight on Day 1. */
  deadline?: number;
  lateText?: string;
  lateFine?: number;
  doneText: string;
  reward?: number;
  /** After completion, move the clock forward to at least this time. */
  advanceTo?: number;
  /** Completion waits for this event to finish (the Retreat ceremony). */
  waitFor?: 'retreat';
}

const h = (hour: number, min = 0) => hour * 60 + min;
/** Absolute game minutes for a time on a given day (0 = Day 1). */
const d = (day: number, hour: number, min = 0) => day * 1440 + h(hour, min);

export const DAY_ONE: Step[] = [
  {
    id: 'clearance',
    title: 'Gate Clearance',
    text: 'Walk through the checkpoint and show your admission letter at the Guard Room, just inside the main gate.',
    targets: ['guard'],
    doneText: 'Cleared by the guard. Welcome to Force Life. Keep your ID on you at all times on base.',
  },
  {
    id: 'registration',
    title: 'Registration',
    text: 'Complete registration and collect your student ID card at the Registry & Bursary.',
    targets: ['admin'],
    doneText: 'Registered. You have been allocated Hostel B, Room B14.',
  },
  {
    id: 'move-in',
    title: 'Move In',
    text: 'Go into Hostel B (west side of campus) and drop your bags on your bunk in Room B14. Press E at the door to go in. Tip: take a car or keke from the gate car park with F.',
    targets: ['room-bed'],
    doneText: 'Bunk claimed. Your roommate already took the bottom bed.',
    reward: 2000,
  },
  {
    id: 'lecture',
    title: 'GST 111',
    text: 'Find a seat in Lecture Theatre (LT1) before 10:00 AM. Go inside and take the empty seat on the left.',
    targets: ['lt-seat'],
    deadline: h(10),
    lateText: 'You walked in late. The lecturer marked you absent.',
    doneText: 'GST 111 attended. Lecture is over.',
    advanceTo: h(12),
  },
  {
    id: 'atm',
    title: 'Cash Run',
    text: 'Withdraw cash at the ATM Gallery in Mammy Market. Press E at the machine.',
    targets: ['atm'],
    interaction: 'atm',
    doneText: 'Cash withdrawn.',
  },
  {
    id: 'lunch',
    title: 'Lunch at the Cafeteria',
    text: 'Go into the Cafeteria and buy a plate of jollof rice at the counter (E).',
    targets: ['caf-counter'],
    interaction: 'food',
    doneText: 'Jollof rice and chicken. Energy restored.',
    advanceTo: h(17),
  },
  {
    id: 'retreat',
    title: 'Retreat',
    text: 'Be at the Parade Ground by 6:00 PM to watch the Retreat ceremony. When the bugle sounds, stand still until the flag is down.',
    targets: ['parade'],
    deadline: h(18),
    lateText: 'You missed the start of Retreat.',
    doneText: 'Flag lowered. Retreat is over; the base comes back to life.',
    waitFor: 'retreat',
  },
  {
    id: 'curfew',
    title: 'Curfew',
    text: 'Get back to Hostel B before the 10:00 PM curfew.',
    targets: ['hostelB'],
    deadline: h(22),
    lateText: 'You broke curfew. The hall porter reported you to the Provost: ₦5,000 fine.',
    lateFine: 5000,
    doneText: 'Day One complete. Free roam unlocked; more missions arrive in the next build.',
    reward: 5000,
  },
];

/** The rest of the first week: one or two story goals a day, unlocked each morning. */
export const WEEK_ONE: Step[] = [
  { id: 'matric-photo', day: 1, title: 'Matric Photo', text: 'Take your matriculation photo at the Registry & Bursary.', targets: ['admin'], doneText: 'Photo taken. You blinked, but it will do.' },
  { id: 'textbook', day: 1, title: 'Textbooks', text: 'Buy your GST 111 textbook at Mammy Market (₦3,500). Press E at the shops.', targets: ['market'], interaction: 'shop', cost: 3500, doneText: 'Textbook bought. The cover says "Use of English".' },
  { id: 'workshop', day: 2, title: 'Workshop Practical', text: 'Be at the Faculty of Air Engineering for your workshop practical before 11:00 AM.', targets: ['airEng'], deadline: d(2, 11), lateText: 'You missed the safety briefing. The technician was not impressed.', doneText: 'Practical done. You can now name every part of a jet engine. Almost.' },
  { id: 'hangar-tour', day: 2, title: 'Hangar Tour', text: 'Your class is touring Hangar 1. Meet them on the apron.', targets: ['hangar'], doneText: 'You sat in a real training jet cockpit.', reward: 1500 },
  { id: 'trials', day: 3, title: 'Football Trials', text: 'Hostel football trials at the Sports Complex. Get there before 4:30 PM.', targets: ['stadium'], deadline: d(3, 16, 30), lateText: 'Trials were over by the time you arrived.', doneText: 'You made the Hostel B team!', reward: 3000 },
  { id: 'dept-meeting', day: 4, title: 'Freshers’ Meeting', text: 'Departmental freshers’ meeting in the Multipurpose Hall before 2:00 PM.', targets: ['hall'], deadline: d(4, 14), lateText: 'You walked in during the closing prayer.', doneText: 'You met your course adviser and the class rep.' },
  { id: 'dues', day: 4, title: 'Departmental Dues', text: 'Pay your ₦2,000 departmental dues at the Registry & Bursary. Press E there.', targets: ['admin'], interaction: 'shop', cost: 2000, doneText: 'Dues paid. Keep the receipt.' },
  { id: 'market-day', day: 5, title: 'Market Day', text: 'Saturday! Buy suya at Mammy Market for Tunde (₦1,500). Press E at the shops.', targets: ['market'], interaction: 'shop', cost: 1500, doneText: 'Tunde says you are now his favourite roommate.' },
  { id: 'worship', day: 5, title: 'Worship', text: 'Attend service at the Base Chapel or prayers at the Base Central Mosque.', targets: ['chapel', 'mosque'], doneText: 'A quiet moment before a new week.' },
  { id: 'week-done', day: 6, title: 'Week One Complete', text: 'Go back to Hostel B and rest. Your first week is done!', targets: ['hostelB'], doneText: 'Week One complete! Keep doing daily tasks to earn money.', reward: 10000 },
];

export const STORY: Step[] = [...DAY_ONE, ...WEEK_ONE];

// ---------- daily tasks: three a day from Day 2, a reason to come back ----------
export type DailyKind = 'visit' | 'atm' | 'food' | 'retreat' | 'yarn' | 'waka';
export interface DailyTask {
  key: string;
  kind: DailyKind;
  text: string;
  targets?: string[];
  reward: number;
}
const DAILY_POOL: DailyTask[] = [
  { key: 'library', kind: 'visit', text: 'Read at the Force Life Library', targets: ['library'], reward: 600 },
  { key: 'lecture', kind: 'visit', text: 'Attend a lecture at LT1', targets: ['theatre'], reward: 800 },
  { key: 'stadium', kind: 'visit', text: 'Run laps at the Sports Complex', targets: ['stadium'], reward: 500 },
  { key: 'hangar', kind: 'visit', text: 'Help out at Hangar 1', targets: ['hangar'], reward: 700 },
  { key: 'worship', kind: 'visit', text: 'Visit the Chapel or the Mosque', targets: ['chapel', 'mosque'], reward: 400 },
  { key: 'clinic', kind: 'visit', text: 'Collect a form at the Medical Centre', targets: ['medical'], reward: 500 },
  { key: 'eat', kind: 'food', text: 'Eat at the Cafeteria', reward: 400 },
  { key: 'atm', kind: 'atm', text: 'Withdraw cash at the ATM Gallery', reward: 200 },
  { key: 'retreat', kind: 'retreat', text: 'Stand for Retreat at the Parade Ground', reward: 1000 },
  { key: 'yarn', kind: 'yarn', text: 'Post on Yarn', reward: 300 },
  { key: 'waka', kind: 'waka', text: 'Take a Waka ride', reward: 600 },
];

/** The same three tasks for everyone on a given day. */
export function dailyTasks(day: number): DailyTask[] {
  if (day < 1) return [];
  let seed = day * 9301 + 49297;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pool = [...DAILY_POOL];
  const out: DailyTask[] = [];
  while (out.length < 3) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}

export class Missions {
  idx = 0;
  late = false;
  constructor(public steps: Step[] = STORY) {}

  get current(): Step | null {
    return this.steps[this.idx] ?? null;
  }

  /** The current story step, or null if it unlocks on a later day. */
  available(day: number): Step | null {
    const s = this.current;
    return s && (s.day ?? 0) <= day ? s : null;
  }

  advance() {
    this.idx++;
    this.late = false;
  }
}
