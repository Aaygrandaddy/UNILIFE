import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { USERNAME_RE, type Backend, type ChatSummary, type Message, type Post, type PostKind, type Profile, type ReportInput, type SaveData, type SignUpInput, type Snap, type Unsub } from './backend';

/** A message to show the player that is good news, not an error (e.g. "check your email"). */
export class Notice extends Error {
  notice = true;
}

const ms = (v: string | null | undefined) => (v ? Date.parse(v) : Date.now());
const PUBLIC_PROFILE = 'id, username, display_name, dept, level, skin, last_seen';

type ProfileRow = { id: string; username: string; display_name: string; dept: string; level: string; skin: number; last_seen: string };
const toProfile = (r: ProfileRow): Profile => ({ uid: r.id, username: r.username, displayName: r.display_name, dept: r.dept, level: r.level, skin: r.skin, lastSeen: ms(r.last_seen) });

function friendly(e: { message?: string; code?: string } | null | undefined): string {
  const m = e?.message ?? '';
  if (/already registered|already been registered/i.test(m)) return 'An account with this email already exists.';
  if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first: open the link we sent you (check spam), then sign in.';
  if (/database error saving new user/i.test(m)) return 'That username is taken. Pick another.';
  if (/password should be at least/i.test(m)) return 'Password must be at least 6 characters.';
  if (/unable to validate email|invalid email/i.test(m)) return 'Enter a valid email address.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Wait a few minutes and try again.';
  if (/failed to fetch|network/i.test(m)) return 'No connection. Check your internet and try again.';
  if (e?.code === '42501') return 'You can’t do that.';
  return m || 'Something went wrong. Try again.';
}

/** Online accounts, presence, chat, posts and snaps on Supabase (Postgres + Auth + Realtime). */
export class SupabaseBackend implements Backend {
  mode = 'online' as const;
  me: Profile | null = null;
  private sb: SupabaseClient;
  private authCbs = new Set<(p: Profile | null) => void>();
  private loadedFor = '';

  constructor(url: string, key: string) {
    this.sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
    this.sb.auth.onAuthStateChange((_event, session) => {
      // Supabase advises not awaiting other calls inside this callback.
      setTimeout(() => this.syncSession(session?.user.id ?? null), 0);
    });
  }

  private async syncSession(uid: string | null) {
    if (!uid) {
      this.loadedFor = '';
      this.me = null;
      for (const cb of this.authCbs) cb(null);
      return;
    }
    if (this.loadedFor === uid && this.me) return;
    const [{ data: row }, { data: blocks }] = await Promise.all([
      this.sb.from('profiles').select(PUBLIC_PROFILE).eq('id', uid).maybeSingle(),
      this.sb.from('blocks').select('blocked').eq('blocker', uid),
    ]);
    if (!row) return; // profile not created yet (should not happen: a database trigger creates it at sign-up)
    this.loadedFor = uid;
    this.me = { ...toProfile(row as ProfileRow), blocked: (blocks ?? []).map((b) => b.blocked as string) };
    for (const cb of this.authCbs) cb(this.me);
    this.heartbeat();
  }

  onAuth(cb: (p: Profile | null) => void): Unsub {
    this.authCbs.add(cb);
    if (this.me) cb(this.me);
    return () => this.authCbs.delete(cb);
  }

  async signUp(i: SignUpInput) {
    if (!USERNAME_RE.test(i.username)) throw new Error('Username: 3–20 lowercase letters, numbers or _.');
    if (i.password.length < 6) throw new Error('Password must be at least 6 characters.');
    const { data: free, error: e1 } = await this.sb.rpc('username_available', { name: i.username });
    if (e1) throw new Error(friendly(e1));
    if (!free) throw new Error('That username is taken. Pick another.');
    const { data, error } = await this.sb.auth.signUp({
      email: i.email.trim(),
      password: i.password,
      options: {
        emailRedirectTo: location.origin + location.pathname,
        data: { username: i.username, display_name: i.displayName || i.username, dept: i.dept, level: i.level, skin: i.skin, consent_version: i.consentVersion },
      },
    });
    if (error) throw new Error(friendly(error));
    if (!data.session) throw new Notice('Account created. Open the confirmation link we emailed you (check spam too), then sign in here.');
  }

  async signIn(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(friendly(error));
  }

  async signOut() {
    await this.sb.auth.signOut();
  }

  heartbeat() {
    if (!this.me) return;
    this.sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', this.me.uid).then(() => {});
  }

  /** Re-runs `load` now and whenever the table changes (debounced). */
  private live(table: string, load: () => void, filter?: string): Unsub {
    let t = 0;
    const kick = () => {
      clearTimeout(t);
      t = window.setTimeout(load, 150);
    };
    load();
    const ch: RealtimeChannel = this.sb
      .channel(`${table}-${filter ?? 'all'}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, kick)
      .subscribe();
    return () => {
      clearTimeout(t);
      this.sb.removeChannel(ch);
    };
  }

  users(cb: (list: Profile[]) => void): Unsub {
    const load = async () => {
      const { data } = await this.sb.from('profiles').select(PUBLIC_PROFILE).order('last_seen', { ascending: false }).limit(100);
      cb((data ?? []).filter((r) => r.id !== this.me?.uid).map((r) => toProfile(r as ProfileRow)));
    };
    load();
    const iv = setInterval(load, 15_000); // online dots refresh
    return () => clearInterval(iv);
  }

  chats(cb: (list: ChatSummary[]) => void): Unsub {
    const me = this.me!.uid;
    return this.live('chats', async () => {
      const { data } = await this.sb.from('chats').select('id, members, last_text, updated_at').order('updated_at', { ascending: false }).limit(50);
      cb((data ?? []).map((c) => ({ id: c.id, otherUid: (c.members as string[]).find((m) => m !== me) ?? me, lastText: c.last_text, updatedAt: ms(c.updated_at) })));
    });
  }

  messages(chatId: string, cb: (list: Message[]) => void): Unsub {
    return this.live(
      'messages',
      async () => {
        const { data } = await this.sb.from('messages').select('id, sender, body, at').eq('chat_id', chatId).order('at', { ascending: true }).limit(200);
        cb((data ?? []).map((m) => ({ id: String(m.id), from: m.sender ?? '', text: m.body, at: ms(m.at) })));
      },
      `chat_id=eq.${chatId}`,
    );
  }

  async send(otherUid: string, text: string) {
    const { error } = await this.sb.rpc('send_message', { other: otherUid, body: text });
    if (error) throw new Error(error.message.includes('can’t message') || error.message.includes('too fast') ? error.message : friendly(error));
  }

  posts(kind: PostKind, cb: (list: Post[]) => void): Unsub {
    return this.live('posts', async () => {
      const { data } = await this.sb.from('posts').select('id, user_id, name, username, kind, body, image, at, likes').eq('kind', kind).order('at', { ascending: false }).limit(50);
      cb((data ?? []).map((p) => ({ id: p.id, uid: p.user_id, name: p.name, username: p.username, kind: p.kind, text: p.body, image: p.image ?? undefined, at: ms(p.at), likes: p.likes ?? [] })));
    });
  }

  async post(kind: PostKind, text: string, image?: string) {
    const me = this.me!;
    const { error } = await this.sb.from('posts').insert({ name: me.displayName, username: me.username, kind, body: text.slice(0, 280), image: image ?? null });
    if (error) throw new Error(friendly(error));
  }

  async like(postId: string) {
    const { error } = await this.sb.rpc('toggle_like', { post: postId });
    if (error) throw new Error(friendly(error));
  }

  snaps(cb: (list: Snap[]) => void): Unsub {
    const me = this.me!.uid;
    return this.live(
      'snaps',
      async () => {
        const { data } = await this.sb.from('snaps').select('id, sender, sender_name, recipient, image, at').eq('recipient', me).order('at', { ascending: true }).limit(30);
        cb((data ?? []).map((s) => ({ id: s.id, from: s.sender, fromName: s.sender_name, to: s.recipient, image: s.image, at: ms(s.at) })));
      },
      `recipient=eq.${me}`,
    );
  }

  async sendSnap(toUid: string, image: string) {
    const { error } = await this.sb.from('snaps').insert({ sender_name: this.me!.displayName, recipient: toUid, image });
    if (error) throw new Error(error.code === '42501' ? 'You can’t send snaps to this player.' : friendly(error));
  }

  async openSnap(id: string) {
    await this.sb.from('snaps').delete().eq('id', id);
  }

  async loadSave() {
    if (!this.me) return null;
    const { data } = await this.sb.from('saves').select('data').eq('user_id', this.me.uid).maybeSingle();
    return (data?.data as SaveData) ?? null;
  }

  async writeSave(d: SaveData) {
    if (!this.me) return;
    const { error } = await this.sb.from('saves').upsert({ user_id: this.me.uid, data: d, updated_at: new Date().toISOString() });
    if (error) throw new Error(friendly(error));
  }

  async block(uid: string) {
    const me = this.me!;
    const { error } = await this.sb.from('blocks').insert({ blocker: me.uid, blocked: uid });
    if (error && error.code !== '23505') throw new Error(friendly(error)); // 23505: already blocked
    me.blocked = Array.from(new Set([...(me.blocked ?? []), uid]));
  }

  async unblock(uid: string) {
    const me = this.me!;
    await this.sb.from('blocks').delete().eq('blocker', me.uid).eq('blocked', uid);
    me.blocked = (me.blocked ?? []).filter((u) => u !== uid);
  }

  async report(r: ReportInput) {
    const { error } = await this.sb.from('reports').insert({ target: r.targetUid, kind: r.kind, ref_id: r.refId ?? '', reason: r.reason, excerpt: (r.excerpt ?? '').slice(0, 500) });
    if (error) throw new Error(friendly(error));
  }

  async deleteAccount(password: string) {
    const { data } = await this.sb.auth.getUser();
    const email = data.user?.email;
    if (!email) return;
    // confirm it is really the owner before deleting
    const { error: e1 } = await this.sb.auth.signInWithPassword({ email, password });
    if (e1) throw new Error(/invalid login/i.test(e1.message) ? 'Wrong password.' : friendly(e1));
    const { error } = await this.sb.rpc('delete_my_account');
    if (error) throw new Error(friendly(error));
    await this.sb.auth.signOut({ scope: 'local' });
  }

  async exportData() {
    const { data, error } = await this.sb.rpc('export_my_data');
    if (error) throw new Error(friendly(error));
    return data as Record<string, unknown>;
  }
}
