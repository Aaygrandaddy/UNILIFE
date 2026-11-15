export interface Step {
  id: string;
  title: string;
  text: string;
  /** POI ids. Any one of them completes the step. */
  targets: string[];
  /** Completed by an E-interaction instead of by arriving. */
  interaction?: 'atm' | 'food';
  /** Game minutes since midnight on Day 1. */
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

export class Missions {
  idx = 0;
  late = false;
  constructor(public steps: Step[] = DAY_ONE) {}

  get current(): Step | null {
    return this.steps[this.idx] ?? null;
  }

  advance() {
    this.idx++;
    this.late = false;
  }
}
