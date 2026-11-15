import { chatIdOf, isBlocked, isOnline, REPORT_REASONS, type Backend, type Post, type PostKind, type Profile, type ReportInput, type Snap, type Unsub } from './online/backend';
import { clean } from './online/filter';
import { TIERS, TOKEN_PRICE_NAIRA, type Place, type Rides, type Tier } from './rides';
import { naira } from './hud';
import { SKIN_TONES } from './human';
import type * as THREE from 'three';

/** What the phone needs from the game. */
export interface PhoneGame {
  money(): number;
  tokens(): number;
  buyTokens(n: number): boolean;
  spendTokens(n: number): boolean;
  refundTokens(n: number): void;
  clock(): string;
  places(): Place[];
  playerPos(): THREE.Vector3;
  capture(): Promise<string>;
  toast(text: string): void;
  openLegal(page: 'terms' | 'privacy'): void;
  sound(name: 'ping' | 'send' | 'shutter' | 'cash' | 'click'): void;
}

type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;
/** Tiny DOM builder. Text always goes through textContent, never innerHTML. */
function h(tag: string, attrs: Attrs = {}, ...kids: (Node | string | null | false | undefined)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of kids) if (c !== null && c !== false && c !== undefined) el.append(c instanceof Node ? c : document.createTextNode(c));
  return el;
}

const DEPTS = ['Aerospace Engineering', 'Mechanical Engineering', 'Electrical/Electronic Engineering', 'Computer Science', 'Physics', 'Mathematics', 'Cyber Security', 'Logistics'];
const LEVELS = ['100', '200', '300', '400', '500'];
const ago = (t: number) => {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
};

const APPS = [
  { id: 'gist', name: 'Gist', blurb: 'Chats', color: '#1f8a5b', glyph: '💬' },
  { id: 'flash', name: 'Flash', blurb: 'Snaps', color: '#f2b705', glyph: '⚡' },
  { id: 'frame', name: 'Frame', blurb: 'Photos', color: '#c2417a', glyph: '▣' },
  { id: 'yarn', name: 'Yarn', blurb: 'Posts', color: '#1b1d22', glyph: '✎' },
  { id: 'waka', name: 'Waka', blurb: 'Rides', color: '#2e7d32', glyph: '➜' },
  { id: 'me', name: 'Profile', blurb: 'Account', color: '#3b82c4', glyph: '☺' },
] as const;
type AppId = (typeof APPS)[number]['id'] | 'home' | 'login' | 'chat';

export class Phone {
  open = false;
  private root = document.getElementById('phone')!;
  private screen = document.getElementById('phone-screen')!;
  private statusTime = document.getElementById('phone-time')!;
  private app: AppId = 'login';
  private subs: Unsub[] = [];
  private people = new Map<string, Profile>();
  private unread = 0;
  private chatWith: Profile | null = null;
  private snapsInbox: Snap[] = [];
  private bgSubs: Unsub[] = [];

  constructor(private be: Backend, private game: PhoneGame, private rides: Rides) {
    document.getElementById('phone-close')!.addEventListener('click', () => this.toggle(false));
    document.getElementById('phone-home')!.addEventListener('click', () => this.go(this.be.me ? 'home' : 'login'));
    rides.onChange = () => this.app === 'waka' && this.render();
    be.onAuth((p) => {
      this.bgSubs.forEach((u) => u());
      this.bgSubs = [];
      if (p) {
        this.bgSubs.push(be.users((list) => list.forEach((u) => this.people.set(u.uid, u))));
        this.bgSubs.push(
          be.snaps((all) => {
            const s = all.filter((x) => !isBlocked(be.me, x.from));
            if (s.length > this.snapsInbox.length) {
              game.toast(`📸 New snap from ${s[s.length - 1].fromName} (Flash)`);
              game.sound('ping');
            }
            this.snapsInbox = s;
            if (this.app === 'flash') this.render();
          }),
        );
        let first = true;
        this.bgSubs.push(
          be.chats((cs) => {
            const newest = cs[0];
            if (!first && newest && newest.otherUid !== this.chatWith?.uid && !isBlocked(be.me, newest.otherUid) && this.lastSeenChat.get(newest.id) !== newest.updatedAt) {
              this.unread++;
              game.toast(`💬 ${this.nameOf(newest.otherUid)}: ${clean(newest.lastText).slice(0, 60)}`);
              game.sound('ping');
              this.updateBadge();
            }
            cs.forEach((c) => this.lastSeenChat.set(c.id, c.updatedAt));
            first = false;
          }),
        );
        this.go(this.app === 'login' ? 'home' : this.app);
      } else this.go('login');
    });
    setInterval(() => be.heartbeat(), 30_000);
  }
  private lastSeenChat = new Map<string, number>();

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.root.classList.toggle('is-open', this.open);
    this.root.setAttribute('aria-hidden', String(!this.open));
    if (this.open) {
      if (document.pointerLockElement) document.exitPointerLock();
      this.render();
    }
  }

  tick() {
    this.statusTime.textContent = this.game.clock();
  }

  private updateBadge() {
    const b = document.getElementById('phone-badge')!;
    b.hidden = this.unread === 0;
    b.textContent = String(this.unread);
  }

  private nameOf(uid: string) {
    return this.people.get(uid)?.displayName ?? 'Someone';
  }

  private go(app: AppId) {
    if (this.open && app !== this.app) this.game.sound('click');
    this.app = app;
    if (app === 'gist') {
      this.unread = 0;
      this.updateBadge();
    }
    this.render();
  }

  private render() {
    this.subs.forEach((u) => u());
    this.subs = [];
    this.screen.replaceChildren();
    if (!this.open) return;
    const view = (() => {
      if (!this.be.me) return this.login();
      switch (this.app) {
        case 'home':
        case 'login':
          return this.home();
        case 'gist':
          return this.gist();
        case 'chat':
          return this.chat();
        case 'flash':
          return this.flash();
        case 'frame':
          return this.feed('frame');
        case 'yarn':
          return this.feed('yarn');
        case 'waka':
          return this.waka();
        case 'me':
          return this.profile();
      }
    })();
    this.screen.append(view);
  }

  private header(title: string, color: string, extra?: Node) {
    return h('div', { class: 'app-head', style: `--app:${color}` }, h('button', { type: 'button', class: 'app-back', 'aria-label': 'Back', onclick: () => this.go(this.app === 'chat' ? 'gist' : 'home') }, '‹'), h('strong', {}, title), extra ?? h('span'));
  }

  private avatar(p: Pick<Profile, 'displayName' | 'skin'> | undefined, online = false) {
    const name = p?.displayName ?? '?';
    const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    return h('span', { class: 'avatar', style: `background:${SKIN_TONES[(p?.skin ?? 0) % SKIN_TONES.length]}` }, initials, online ? h('i', { class: 'dot', 'aria-label': 'online' }) : null);
  }

  private errorLine() {
    return h('p', { class: 'form-error', role: 'alert' });
  }

  // ---------- login / sign-up ----------
  private login() {
    let mode: 'in' | 'up' = 'in';
    const err = this.errorLine();
    const wrap = h('div', { class: 'login' });
    const draw = () => {
      wrap.replaceChildren();
      const email = h('input', { id: 'ph-email', type: 'email', autocomplete: 'email', required: true, placeholder: 'you@example.com' }) as HTMLInputElement;
      const pass = h('input', { id: 'ph-pass', type: 'password', autocomplete: mode === 'in' ? 'current-password' : 'new-password', required: true, minlength: 6, placeholder: 'At least 6 characters' }) as HTMLInputElement;
      const user = h('input', { id: 'ph-user', autocomplete: 'username', placeholder: 'e.g. tobi_aero', maxlength: 20 }) as HTMLInputElement;
      const disp = h('input', { id: 'ph-name', placeholder: 'Tobi A.', maxlength: 30 }) as HTMLInputElement;
      const dept = h('select', { id: 'ph-dept' }, ...DEPTS.map((d) => h('option', {}, d))) as HTMLSelectElement;
      const level = h('select', { id: 'ph-level' }, ...LEVELS.map((l) => h('option', {}, `${l} level`))) as HTMLSelectElement;
      let skin = 1;
      const skins = h('div', { class: 'skins', role: 'radiogroup', 'aria-label': 'Skin tone' }, ...SKIN_TONES.map((c, i) => {
        const b = h('button', { type: 'button', class: 'skin' + (i === skin ? ' is-on' : ''), style: `background:${c}`, role: 'radio', 'aria-checked': String(i === skin), 'aria-label': `Skin tone ${i + 1}`, onclick: () => {
          skin = i;
          skins.querySelectorAll('.skin').forEach((el, k) => {
            el.classList.toggle('is-on', k === i);
            el.setAttribute('aria-checked', String(k === i));
          });
        } });
        return b;
      }));
      const btn = h('button', { type: 'submit', class: 'btn-primary' }, mode === 'in' ? 'Sign in' : 'Create account') as HTMLButtonElement;
      const agree = h('input', { id: 'ph-agree', type: 'checkbox' }) as HTMLInputElement;
      const agreeRow = h('div', { class: 'agree' }, agree, h('label', { for: 'ph-agree' }, 'I am 18 or older (or have my parent or guardian’s permission) and I agree to the '),
        h('button', { type: 'button', class: 'btn-inline', onclick: () => this.game.openLegal('terms') }, 'Terms'), ' and ',
        h('button', { type: 'button', class: 'btn-inline', onclick: () => this.game.openLegal('privacy') }, 'Privacy Policy'), '.');
      const form = h('form', { class: 'form', novalidate: true, onsubmit: async (e: Event) => {
        e.preventDefault();
        err.textContent = '';
        btn.disabled = true;
        if (mode === 'up' && !agree.checked) {
          err.textContent = 'Please confirm your age (or guardian permission) and accept the Terms and Privacy Policy.';
          btn.disabled = false;
          return;
        }
        try {
          if (mode === 'in') await this.be.signIn(email.value, pass.value);
          else await this.be.signUp({ email: email.value, password: pass.value, username: user.value.trim().toLowerCase(), displayName: disp.value.trim(), dept: dept.value, level: level.value.split(' ')[0], skin });
        } catch (x) {
          err.textContent = (x as Error).message;
        } finally {
          btn.disabled = false;
        }
      } },
        h('label', { for: 'ph-email' }, 'Email'), email,
        h('label', { for: 'ph-pass' }, 'Password'), pass,
        ...(mode === 'up' ? [h('label', { for: 'ph-user' }, 'Username'), user, h('label', { for: 'ph-name' }, 'Display name'), disp, h('label', { for: 'ph-dept' }, 'Department'), dept, h('label', { for: 'ph-level' }, 'Level'), level, h('span', { class: 'label' }, 'Skin tone'), skins, agreeRow] : []),
        err, btn,
      );
      wrap.append(
        h('div', { class: 'login-brand' }, h('span', { class: 'brand-mark' }, 'F'), h('strong', {}, 'Force Life ID'), h('small', {}, mode === 'in' ? 'Sign in to use your phone' : 'Create your student account')),
        form,
        h('button', { type: 'button', class: 'btn-link', onclick: () => { mode = mode === 'in' ? 'up' : 'in'; err.textContent = ''; draw(); } }, mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'),
        h('p', { class: 'mode-note' }, this.be.mode === 'online' ? 'Online: your account and chats sync across devices.' : 'On-device mode: accounts and chats are saved in this browser only. Classmates Tunde, Aisha and Emeka are bots.'),
      );
    };
    draw();
    return wrap;
  }

  // ---------- home ----------
  private home() {
    const me = this.be.me!;
    return h('div', { class: 'home' },
      h('div', { class: 'home-hello' }, this.avatar(me), h('div', {}, h('strong', {}, me.displayName), h('small', {}, `@${me.username} · ${me.level} level`))),
      h('div', { class: 'wallet' }, h('div', {}, h('small', {}, 'Wallet'), h('strong', {}, naira(this.game.money()))), h('div', {}, h('small', {}, 'Ride tokens'), h('strong', {}, String(this.game.tokens())))),
      h('div', { class: 'app-grid' }, ...APPS.map((a) => h('button', { type: 'button', class: 'app-icon', onclick: () => this.go(a.id) }, h('span', { class: 'icon', style: `background:${a.color}` }, a.glyph), h('span', {}, a.name), a.id === 'flash' && this.snapsInbox.length ? h('i', { class: 'badge' }, String(this.snapsInbox.length)) : null))),
    );
  }

  // ---------- Gist (chat) ----------
  private gist() {
    let tab: 'chats' | 'people' = 'chats';
    const list = h('div', { class: 'list' });
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    const draw = (chats = this.lastChats) => {
      tabs.replaceChildren(
        h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === 'chats'), onclick: () => { tab = 'chats'; draw(); } }, 'Chats'),
        h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === 'people'), onclick: () => { tab = 'people'; draw(); } }, 'People'),
      );
      list.replaceChildren();
      if (tab === 'chats') {
        if (!chats.length) list.append(h('p', { class: 'empty' }, 'No chats yet. Open People to start one.'));
        for (const c of chats.filter((x) => !isBlocked(this.be.me, x.otherUid))) {
          const p = this.people.get(c.otherUid);
          list.append(h('button', { type: 'button', class: 'row', onclick: () => p && this.openChat(p) }, this.avatar(p, !!p && isOnline(p)), h('div', {}, h('strong', {}, p?.displayName ?? 'Unknown'), h('small', {}, clean(c.lastText))), h('time', {}, ago(c.updatedAt))));
        }
      } else {
        const ppl = [...this.people.values()].filter((p) => !isBlocked(this.be.me, p.uid)).sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)));
        if (!ppl.length) list.append(h('p', { class: 'empty' }, 'Nobody else has signed up yet.'));
        for (const p of ppl) list.append(h('button', { type: 'button', class: 'row', onclick: () => this.openChat(p) }, this.avatar(p, isOnline(p)), h('div', {}, h('strong', {}, p.displayName), h('small', {}, `@${p.username} · ${p.dept}`)), h('small', {}, isOnline(p) ? 'online' : p.lastSeen ? ago(p.lastSeen) : '')));
      }
    };
    this.subs.push(this.be.chats((c) => { this.lastChats = c; draw(c); }));
    this.subs.push(this.be.users(() => draw()));
    return h('div', { class: 'app' }, this.header('Gist', '#1f8a5b'), tabs, list);
  }
  private lastChats: Parameters<Parameters<Backend['chats']>[0]>[0] = [];

  private lastMsgs = '';

  /** Confirm, then block. Blocked players disappear from your lists and cannot message or snap you. */
  private blockFlow(p: Pick<Profile, 'uid' | 'displayName'>) {
    this.screen.replaceChildren(h('div', { class: 'app' }, this.header('Block', '#b91c1c'),
      h('div', { class: 'profile' }, h('strong', {}, `Block ${p.displayName}?`),
        h('p', {}, 'They will not be able to message you or send you snaps, and you will not see their posts. You can unblock them from your Profile.'),
        h('button', { type: 'button', class: 'btn-primary danger-bg', onclick: async () => {
          await this.be.block(p.uid).catch((x) => this.game.toast((x as Error).message));
          this.game.toast(`${p.displayName} blocked.`);
          this.go('gist');
        } }, 'Block'),
        h('button', { type: 'button', class: 'btn-ghost', onclick: () => this.render() }, 'Cancel'))));
  }

  /** Pick a reason, then file the report for moderators. */
  private reportFlow(r: Omit<ReportInput, 'reason'>, name: string) {
    const back = this.app;
    this.screen.replaceChildren(h('div', { class: 'app' }, this.header('Report', '#b91c1c'),
      h('p', { class: 'mode-note' }, `Why are you reporting ${name}? Reports are private; they are not told who reported them.`),
      h('div', { class: 'list' }, ...REPORT_REASONS.map((reason) => h('button', { type: 'button', class: 'row', onclick: async () => {
        await this.be.report({ ...r, reason }).catch((x) => this.game.toast((x as Error).message));
        this.game.toast('Thanks. Your report was sent to the moderators.');
        this.go(back);
      } }, h('div', {}, h('strong', {}, reason)))))));
  }

  private openChat(p: Profile) {
    this.chatWith = p;
    this.go('chat');
  }

  private chat() {
    const p = this.chatWith!;
    const me = this.be.me!.uid;
    const log = h('div', { class: 'messages', 'aria-live': 'polite' });
    this.subs.push(
      this.be.messages(chatIdOf(me, p.uid), (msgs) => {
        log.replaceChildren(...msgs.map((m) => h('div', { class: 'bubble ' + (m.from === me ? 'mine' : 'theirs') }, clean(m.text), h('time', {}, ago(m.at)))));
        this.lastMsgs = msgs.filter((m) => m.from !== me).slice(-5).map((m) => m.text).join(' | ');
        log.scrollTop = log.scrollHeight;
      }),
    );
    const input = h('input', { id: 'ph-msg', placeholder: 'Message', autocomplete: 'off', maxlength: 1000, 'aria-label': `Message ${p.displayName}` }) as HTMLInputElement;
    const form = h('form', { class: 'composer', onsubmit: (e: Event) => {
      e.preventDefault();
      const t = input.value;
      input.value = '';
      if (t.trim()) this.game.sound('send');
      this.be.send(p.uid, clean(t)).catch((x) => this.game.toast((x as Error).message));
    } }, input, h('button', { type: 'submit', class: 'btn-primary' }, 'Send'));
    setTimeout(() => input.focus(), 50);
    const actions = h('div', { class: 'chat-actions' },
      h('button', { type: 'button', class: 'btn-inline', onclick: () => this.reportFlow({ targetUid: p.uid, kind: 'user', excerpt: this.lastMsgs }, p.displayName) }, 'Report'),
      h('button', { type: 'button', class: 'btn-inline danger', onclick: () => this.blockFlow(p) }, 'Block'));
    return h('div', { class: 'app chat' }, this.header(p.displayName, '#1f8a5b', h('small', {}, isOnline(p) ? 'online' : '')), actions, log, form);
  }

  // ---------- Flash (disappearing snaps) ----------
  private flash() {
    const body = h('div', { class: 'list' });
    const draw = () => {
      body.replaceChildren(h('button', { type: 'button', class: 'btn-primary wide', onclick: () => this.takeSnap() }, '📸 Take a snap'));
      if (!this.snapsInbox.length) body.append(h('p', { class: 'empty' }, 'No new snaps. Snaps disappear after you open them.'));
      for (const s of this.snapsInbox) body.append(h('button', { type: 'button', class: 'row', onclick: () => this.viewSnap(s) }, h('span', { class: 'snap-dot' }), h('div', {}, h('strong', {}, s.fromName), h('small', {}, `New snap · ${ago(s.at)} · tap to open`))));
    };
    draw();
    return h('div', { class: 'app' }, this.header('Flash', '#f2b705'), body);
  }

  private async takeSnap() {
    this.game.sound('shutter');
    const img = await this.game.capture();
    const friends = [...this.people.values()];
    this.screen.replaceChildren(
      h('div', { class: 'app' }, this.header('Send snap', '#f2b705'),
        h('img', { class: 'shot', src: img, alt: 'Your snap' }),
        h('div', { class: 'list' }, ...friends.map((p) => h('button', { type: 'button', class: 'row', onclick: async () => {
          await this.be.sendSnap(p.uid, img).catch((x) => this.game.toast((x as Error).message));
          this.game.toast(`Snap sent to ${p.displayName}`);
          this.go('flash');
        } }, this.avatar(p, isOnline(p)), h('div', {}, h('strong', {}, p.displayName)))))),
    );
  }

  private viewSnap(s: Snap) {
    let left = 6;
    const counter = h('span', { class: 'snap-timer' }, String(left));
    this.screen.replaceChildren(h('div', { class: 'snap-view' }, h('img', { src: s.image, alt: `Snap from ${s.fromName}` }), h('div', { class: 'snap-from' }, s.fromName), counter,
      h('button', { type: 'button', class: 'snap-report', onclick: () => { clearInterval(t); this.be.openSnap(s.id).catch(() => {}); this.reportFlow({ targetUid: s.from, kind: 'snap', refId: s.id }, s.fromName); } }, 'Report')));
    const t = setInterval(() => {
      left--;
      counter.textContent = String(left);
      if (left <= 0) {
        clearInterval(t);
        this.be.openSnap(s.id).catch(() => {});
        this.snapsInbox = this.snapsInbox.filter((x) => x.id !== s.id);
        this.go('flash');
      }
    }, 1000);
  }

  // ---------- Frame (photos) and Yarn (posts) ----------
  private feed(kind: PostKind) {
    const isFrame = kind === 'frame';
    const color = isFrame ? '#c2417a' : '#1b1d22';
    const list = h('div', { class: 'list feed' });
    const me = this.be.me!.uid;
    let pending: string | undefined;
    const preview = h('img', { class: 'shot', alt: 'Photo to post', hidden: true }) as HTMLImageElement;
    const text = h('textarea', { id: `ph-${kind}`, maxlength: 280, rows: 2, placeholder: isFrame ? 'Write a caption…' : "What's happening on campus?" }) as HTMLTextAreaElement;
    const post = h('button', { type: 'submit', class: 'btn-primary' }, isFrame ? 'Post photo' : 'Post') as HTMLButtonElement;
    const form = h('form', { class: 'compose', onsubmit: async (e: Event) => {
      e.preventDefault();
      if (isFrame && !pending) return this.game.toast('Take a photo first.');
      if (!isFrame && !text.value.trim()) return;
      post.disabled = true;
      await this.be.post(kind, clean(text.value.trim()), pending).catch((x) => this.game.toast((x as Error).message));
      post.disabled = false;
      text.value = '';
      pending = undefined;
      preview.hidden = true;
    } },
      isFrame ? h('button', { type: 'button', class: 'btn-ghost', onclick: async () => { this.game.sound('shutter'); pending = await this.game.capture(); preview.src = pending; preview.hidden = false; } }, '📷 Take photo') : null,
      preview, h('label', { for: `ph-${kind}`, class: 'sr-only' }, isFrame ? 'Caption' : 'Post'), text, post,
    );
    this.subs.push(
      this.be.posts(kind, (all: Post[]) => {
        const posts = all.filter((p) => !isBlocked(this.be.me, p.uid));
        list.replaceChildren(
          ...posts.map((p) => {
            const liked = p.likes.includes(me);
            return h('article', { class: 'post' },
              h('header', {}, this.avatar(this.people.get(p.uid) ?? (p.uid === me ? this.be.me! : { displayName: p.name, skin: 0 })), h('div', {}, h('strong', {}, p.name), h('small', {}, `@${p.username} · ${ago(p.at)}`))),
              p.image ? h('img', { src: p.image, alt: p.text || `Photo by ${p.name}` }) : null,
              p.text ? h('p', {}, clean(p.text)) : null,
              h('div', { class: 'post-actions' },
                h('button', { type: 'button', class: 'like' + (liked ? ' is-on' : ''), 'aria-pressed': String(liked), onclick: () => this.be.like(p.id) }, `${liked ? '♥' : '♡'} ${p.likes.length}`),
                p.uid !== me ? h('button', { type: 'button', class: 'btn-inline', onclick: () => this.reportFlow({ targetUid: p.uid, kind: 'post', refId: p.id, excerpt: p.text }, p.name) }, 'Report') : null),
            );
          }),
        );
        if (!posts.length) list.append(h('p', { class: 'empty' }, isFrame ? 'No photos yet. Be the first to post one.' : 'No posts yet.'));
      }),
    );
    return h('div', { class: 'app' }, this.header(isFrame ? 'Frame' : 'Yarn', color), form, list);
  }

  // ---------- Waka (rides) ----------
  private waka() {
    const r = this.rides;
    const head = this.header('Waka', '#2e7d32', h('small', {}, `${this.game.tokens()} tokens`));
    if (r.active) {
      const v = r.vehicle;
      const dist = v ? Math.round(v.pos.distanceTo(this.game.playerPos())) : 0;
      const status = r.phase === 'coming' ? `${r.driver} is ${dist} m away` : r.phase === 'waiting' ? `${r.driver} has arrived. Press F or tap CAR to get in.` : r.phase === 'riding' ? `On the way to ${r.dest?.name}` : 'Ride complete';
      const box = h('div', { class: 'ride-status' }, h('span', { class: 'icon big', style: 'background:#2e7d32' }, '➜'), h('strong', {}, TIERS[r.tier].label + ' · ' + r.fare + ' tokens'), h('p', {}, status), r.dest ? h('small', {}, `Destination: ${r.dest.name}`) : null);
      if (r.phase === 'coming' || r.phase === 'waiting') box.append(h('button', { type: 'button', class: 'btn-ghost', onclick: () => { this.game.refundTokens(r.cancel()); this.render(); } }, 'Cancel ride'));
      const timer = setInterval(() => this.app === 'waka' && this.open && this.render(), 1500);
      this.subs.push(() => clearInterval(timer));
      return h('div', { class: 'app' }, head, box);
    }
    const places = this.game.places();
    const sel = h('select', { id: 'ph-dest' }, ...places.map((p) => h('option', { value: p.id }, p.name))) as HTMLSelectElement;
    let tier: Tier = 'car';
    const cards = h('div', { class: 'tiers', role: 'radiogroup', 'aria-label': 'Ride type' });
    const err = this.errorLine();
    const drawCards = () => {
      const dest = places.find((p) => p.id === sel.value)!;
      cards.replaceChildren(
        ...(Object.keys(TIERS) as Tier[]).map((t) => {
          const q = r.quote(this.game.playerPos(), dest.pos, t);
          return h('button', { type: 'button', class: 'tier' + (t === tier ? ' is-on' : ''), role: 'radio', 'aria-checked': String(t === tier), onclick: () => { tier = t; drawCards(); } },
            h('strong', {}, TIERS[t].label), h('small', {}, `${TIERS[t].blurb} ${TIERS[t].seats}`), h('span', { class: 'price' }, `${q.tokens} tokens`), h('small', {}, `about ${q.minutes} min`));
        }),
      );
    };
    sel.addEventListener('change', drawCards);
    drawCards();
    const book = h('button', { type: 'button', class: 'btn-primary wide', onclick: () => {
      const dest = places.find((p) => p.id === sel.value)!;
      const q = r.quote(this.game.playerPos(), dest.pos, tier);
      if (!this.game.spendTokens(q.tokens)) {
        err.textContent = `You need ${q.tokens} tokens. Buy more below.`;
        return;
      }
      r.book(tier, dest, this.game.playerPos(), q.tokens);
      this.render();
    } }, 'Book ride');
    const buy = (n: number) => h('button', { type: 'button', class: 'btn-ghost', onclick: () => {
      if (this.game.buyTokens(n)) {
        this.game.sound('cash');
        this.render();
      }
      else err.textContent = `Not enough money. ${n} tokens cost ${naira(n * TOKEN_PRICE_NAIRA)}.`;
    } }, `+${n} (${naira(n * TOKEN_PRICE_NAIRA)})`);
    return h('div', { class: 'app' }, head,
      h('div', { class: 'form' }, h('label', { for: 'ph-dest' }, 'Where to?'), sel, h('span', { class: 'label' }, 'Choose a ride'), cards, err, book,
        h('span', { class: 'label' }, `Buy tokens · 1 token = ${naira(TOKEN_PRICE_NAIRA)}`), h('div', { class: 'buy-row' }, buy(10), buy(30), buy(60))));
  }

  // ---------- profile ----------
  private profile() {
    const me = this.be.me!;
    const blocked = me.blocked ?? [];
    return h('div', { class: 'app' }, this.header('Profile', '#3b82c4'),
      h('div', { class: 'profile' }, this.avatar(me), h('strong', {}, me.displayName), h('small', {}, `@${me.username}`), h('p', {}, `${me.dept} · ${me.level} level`),
        h('p', { class: 'mode-note' }, this.be.mode === 'online' ? 'Online account. Your progress saves to your account.' : 'On-device account. Chats and progress stay in this browser.'),
        h('button', { type: 'button', class: 'btn-ghost', onclick: () => this.be.signOut() }, 'Sign out')),
      h('span', { class: 'label' }, `Blocked players (${blocked.length})`),
      h('div', { class: 'list' }, ...(blocked.length ? blocked.map((uid) => h('div', { class: 'row' }, h('div', {}, h('strong', {}, this.nameOf(uid))),
        h('button', { type: 'button', class: 'btn-inline', onclick: async () => { await this.be.unblock(uid); this.render(); } }, 'Unblock'))) : [h('p', { class: 'empty' }, 'Nobody blocked.')])),
      h('div', { class: 'legal-links' },
        h('button', { type: 'button', class: 'btn-inline', onclick: () => this.game.openLegal('terms') }, 'Terms'),
        h('button', { type: 'button', class: 'btn-inline', onclick: () => this.game.openLegal('privacy') }, 'Privacy Policy')),
      h('button', { type: 'button', class: 'btn-inline danger', onclick: () => this.deleteFlow() }, 'Delete my account'));
  }

  private deleteFlow() {
    const pass = h('input', { id: 'ph-del-pass', type: 'password', autocomplete: 'current-password', placeholder: 'Your password' }) as HTMLInputElement;
    const err = this.errorLine();
    const btn = h('button', { type: 'submit', class: 'btn-primary danger-bg' }, 'Delete account forever') as HTMLButtonElement;
    this.screen.replaceChildren(h('div', { class: 'app' }, this.header('Delete account', '#b91c1c'),
      h('form', { class: 'form', onsubmit: async (e: Event) => {
        e.preventDefault();
        btn.disabled = true;
        err.textContent = '';
        try {
          await this.be.deleteAccount(pass.value);
          this.game.toast('Your account and data were deleted.');
        } catch (x) {
          err.textContent = (x as Error).message;
          btn.disabled = false;
        }
      } },
        h('p', { class: 'mode-note' }, 'This permanently deletes your profile, username, posts and saved progress, and signs you out. Messages you already sent stay with the people who received them. This cannot be undone.'),
        h('label', { for: 'ph-del-pass' }, 'Enter your password to confirm'), pass, err, btn)));
  }
}
