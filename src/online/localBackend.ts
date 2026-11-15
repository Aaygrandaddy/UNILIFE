import { chatIdOf, type Backend, type ChatSummary, type Message, type Post, type PostKind, type Profile, type ReportInput, type SaveData, type SignUpInput, type Snap, type Unsub, USERNAME_RE } from './backend';

/**
 * On-device stand-in for Firebase. Accounts and data live in this browser's storage,
 * and three classmates (bots) reply so the apps can be tried without a server.
 */

const KEY = 'unilife.local.v1';

interface Store {
  accounts: Record<string, { hash: string; uid: string }>;
  profiles: Record<string, Profile>;
  messages: Record<string, Message[]>;
  chats: Record<string, { members: string[]; lastText: string; updatedAt: number }>;
  posts: Post[];
  snaps: Snap[];
  session: string | null;
  saves: Record<string, SaveData>;
  reports: (ReportInput & { reporter: string; at: number })[];
}

const BOTS: Profile[] = [
  { uid: 'bot-tunde', username: 'tunde_b14', displayName: 'Tunde (roommate)', dept: 'Air Engineering', level: '100', skin: 2, bot: true },
  { uid: 'bot-aisha', username: 'aisha.courserep', displayName: 'Aisha · Course Rep', dept: 'Computer Science', level: '100', skin: 4, bot: true },
  { uid: 'bot-emeka', username: 'emeka_cruise', displayName: 'Emeka', dept: 'Mechanical Engineering', level: '200', skin: 1, bot: true },
];

const REPLIES: Record<string, string[]> = {
  'bot-tunde': ['Guy, where you dey? Lights out by 11 o.', 'I dey room. Bring suya if you dey pass Mammy Market 😂', 'Did you see the GST 111 assignment?', 'Make we go caf later.'],
  'bot-aisha': ['Reminder: GST 111 assignment is due Friday.', 'Please check the class group for the timetable.', 'Lecture moved to LT1, 10am.', 'Noted, thanks!'],
  'bot-emeka': ['Retreat almost caught me yesterday 😭', 'You don try Waka rides? The luxury one sweet die.', 'Who get notes for MTH 101?', 'Abeg send the snap again'],
};

const uid = () => Math.random().toString(36).slice(2, 12);

async function hash(text: string) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'plain:' + text;
  }
}

export class LocalBackend implements Backend {
  mode = 'offline' as const;
  me: Profile | null = null;
  private s: Store;
  private listeners = new Set<() => void>();
  private authCbs = new Set<(p: Profile | null) => void>();

  constructor() {
    this.s = this.load();
    for (const b of BOTS) this.s.profiles[b.uid] = b;
    if (!this.s.posts.length) this.seed();
    this.me = this.s.session ? this.s.profiles[this.s.session] ?? null : null;
  }

  private load(): Store {
    const empty: Store = { accounts: {}, profiles: {}, messages: {}, chats: {}, posts: [], snaps: [], session: null, saves: {}, reports: [] };
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...empty, ...JSON.parse(raw) } : empty;
    } catch {
      return empty;
    }
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.s));
    } catch {
      // storage full or blocked: keep working in memory
    }
    for (const l of this.listeners) l();
  }

  private watch(fn: () => void): Unsub {
    this.listeners.add(fn);
    fn();
    return () => this.listeners.delete(fn);
  }

  private seed() {
    const now = Date.now();
    const p = (b: Profile, text: string, ago: number, kind: PostKind = 'yarn'): Post => ({ id: uid(), uid: b.uid, name: b.displayName, username: b.username, kind, text, at: now - ago, likes: [] });
    this.s.posts.push(
      p(BOTS[1], 'Freshers, registration closes Friday. Go to the Registry with your admission letter and passport photos.', 3_600_000),
      p(BOTS[2], 'Retreat at 6pm no be joke o. Stand still or the Provost will collect your money 😂', 7_200_000),
      p(BOTS[0], 'Hostel B light don come back 🙌', 10_800_000),
    );
  }

  onAuth(cb: (p: Profile | null) => void): Unsub {
    this.authCbs.add(cb);
    cb(this.me);
    return () => this.authCbs.delete(cb);
  }

  private setMe(p: Profile | null) {
    this.me = p;
    this.s.session = p?.uid ?? null;
    this.save();
    for (const cb of this.authCbs) cb(p);
  }

  async signUp(i: SignUpInput) {
    const email = i.email.trim().toLowerCase();
    if (!email.includes('@')) throw new Error('Enter a valid email address.');
    if (i.password.length < 6) throw new Error('Password must be at least 6 characters.');
    if (!USERNAME_RE.test(i.username)) throw new Error('Username: 3–20 lowercase letters, numbers or _.');
    if (this.s.accounts[email]) throw new Error('An account with this email already exists on this device.');
    if (Object.values(this.s.profiles).some((p) => p.username === i.username)) throw new Error('That username is taken.');
    const id = uid();
    this.s.accounts[email] = { hash: await hash(i.password), uid: id };
    const profile: Profile & { consent?: { version: string; at: number } } = { uid: id, username: i.username, displayName: i.displayName || i.username, dept: i.dept, level: i.level, skin: i.skin, lastSeen: Date.now(), consent: { version: i.consentVersion, at: Date.now() } };
    this.s.profiles[id] = profile;
    this.setMe(profile);
  }

  async signIn(email: string, password: string) {
    const acc = this.s.accounts[email.trim().toLowerCase()];
    if (!acc || acc.hash !== (await hash(password))) throw new Error('Wrong email or password.');
    this.setMe(this.s.profiles[acc.uid]);
  }

  async signOut() {
    this.setMe(null);
  }

  heartbeat() {
    if (!this.me) return;
    this.s.profiles[this.me.uid].lastSeen = Date.now();
  }

  users(cb: (list: Profile[]) => void) {
    return this.watch(() => cb(Object.values(this.s.profiles).filter((p) => p.uid !== this.me?.uid)));
  }

  chats(cb: (list: ChatSummary[]) => void) {
    return this.watch(() => {
      const me = this.me?.uid;
      if (!me) return cb([]);
      cb(
        Object.entries(this.s.chats)
          .filter(([, c]) => c.members.includes(me))
          .map(([id, c]) => ({ id, otherUid: c.members.find((m) => m !== me)!, lastText: c.lastText, updatedAt: c.updatedAt }))
          .sort((a, b) => b.updatedAt - a.updatedAt),
      );
    });
  }

  messages(chatId: string, cb: (list: Message[]) => void) {
    return this.watch(() => cb([...(this.s.messages[chatId] ?? [])]));
  }

  private push(from: string, to: string, text: string) {
    const id = chatIdOf(from, to);
    const at = Date.now();
    (this.s.messages[id] ??= []).push({ id: uid(), from, text, at });
    this.s.chats[id] = { members: [from, to], lastText: text, updatedAt: at };
    this.save();
  }

  async send(otherUid: string, text: string) {
    if (!this.me || !text.trim()) return;
    this.push(this.me.uid, otherUid, text.trim().slice(0, 1000));
    const replies = REPLIES[otherUid];
    if (replies) {
      const me = this.me.uid;
      setTimeout(() => this.push(otherUid, me, replies[Math.floor(Math.random() * replies.length)]), 1500 + Math.random() * 2500);
    }
  }

  posts(kind: PostKind, cb: (list: Post[]) => void) {
    return this.watch(() => cb(this.s.posts.filter((p) => p.kind === kind).sort((a, b) => b.at - a.at)));
  }

  async post(kind: PostKind, text: string, image?: string) {
    if (!this.me) return;
    this.s.posts.push({ id: uid(), uid: this.me.uid, name: this.me.displayName, username: this.me.username, kind, text: text.slice(0, 280), image, at: Date.now(), likes: [] });
    // keep on-device storage small
    const frames = this.s.posts.filter((p) => p.image);
    if (frames.length > 12) this.s.posts = this.s.posts.filter((p) => !p.image || frames.slice(-12).includes(p));
    this.save();
  }

  async like(postId: string) {
    const p = this.s.posts.find((x) => x.id === postId);
    if (!p || !this.me) return;
    p.likes = p.likes.includes(this.me.uid) ? p.likes.filter((u) => u !== this.me!.uid) : [...p.likes, this.me.uid];
    this.save();
  }

  snaps(cb: (list: Snap[]) => void) {
    return this.watch(() => cb(this.s.snaps.filter((s) => s.to === this.me?.uid)));
  }

  async sendSnap(toUid: string, image: string) {
    if (!this.me) return;
    if (BOTS.some((b) => b.uid === toUid)) {
      const me = this.me.uid;
      setTimeout(() => this.push(toUid, me, 'Opened your snap 👀🔥'), 2500);
      return;
    }
    this.s.snaps.push({ id: uid(), from: this.me.uid, fromName: this.me.displayName, to: toUid, image, at: Date.now() });
    this.save();
  }

  async openSnap(id: string) {
    this.s.snaps = this.s.snaps.filter((s) => s.id !== id);
    this.save();
  }

  async loadSave() {
    return this.me ? this.s.saves[this.me.uid] ?? null : null;
  }

  async writeSave(d: SaveData) {
    if (!this.me) return;
    this.s.saves[this.me.uid] = d;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.s));
    } catch {
      // storage blocked: progress lasts for this session only
    }
  }

  async block(uid: string) {
    if (!this.me) return;
    const p = this.s.profiles[this.me.uid];
    p.blocked = Array.from(new Set([...(p.blocked ?? []), uid]));
    this.me = p;
    this.save();
  }

  async unblock(uid: string) {
    if (!this.me) return;
    const p = this.s.profiles[this.me.uid];
    p.blocked = (p.blocked ?? []).filter((u) => u !== uid);
    this.me = p;
    this.save();
  }

  async report(r: ReportInput) {
    if (!this.me) return;
    this.s.reports.push({ ...r, reporter: this.me.uid, at: Date.now() });
    this.save();
  }

  async exportData() {
    const me = this.me;
    if (!me) return {};
    const email = Object.keys(this.s.accounts).find((e) => this.s.accounts[e].uid === me.uid);
    const myChats = Object.entries(this.s.chats).filter(([, c]) => c.members.includes(me.uid));
    return {
      exportedAt: new Date().toISOString(),
      account: { email },
      profile: this.s.profiles[me.uid],
      savedProgress: this.s.saves[me.uid] ?? null,
      posts: this.s.posts.filter((p) => p.uid === me.uid),
      messagesYouSent: myChats.flatMap(([id]) => (this.s.messages[id] ?? []).filter((m) => m.from === me.uid).map((m) => ({ chat: id, text: m.text, at: new Date(m.at).toISOString() }))),
      reportsYouFiled: this.s.reports.filter((r) => r.reporter === me.uid),
    };
  }

  async deleteAccount(password: string) {
    const me = this.me;
    if (!me) return;
    const email = Object.keys(this.s.accounts).find((e) => this.s.accounts[e].uid === me.uid);
    if (!email || this.s.accounts[email].hash !== (await hash(password))) throw new Error('Wrong password.');
    delete this.s.accounts[email];
    delete this.s.profiles[me.uid];
    delete this.s.saves[me.uid];
    this.s.posts = this.s.posts.filter((p) => p.uid !== me.uid);
    this.s.snaps = this.s.snaps.filter((x) => x.from !== me.uid && x.to !== me.uid);
    for (const [id, c] of Object.entries(this.s.chats)) {
      if (c.members.includes(me.uid)) {
        delete this.s.chats[id];
        delete this.s.messages[id];
      }
    }
    this.setMe(null);
  }
}
