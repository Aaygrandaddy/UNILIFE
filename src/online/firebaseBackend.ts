import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, deleteUser, EmailAuthProvider, getAuth, reauthenticateWithCredential, onAuthStateChanged, signInWithEmailAndPassword, signOut, type Auth } from 'firebase/auth';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { chatIdOf, USERNAME_RE, type Backend, type ChatSummary, type Message, type Post, type PostKind, type Profile, type ReportInput, type SaveData, type SignUpInput, type Snap, type Unsub } from './backend';

const ms = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : Date.now());

/** Online accounts, presence, chat, posts and snaps on Firebase Auth + Firestore. */
export class FirebaseBackend implements Backend {
  mode = 'online' as const;
  me: Profile | null = null;
  private auth: Auth;
  private db: Firestore;
  private authCbs = new Set<(p: Profile | null) => void>();
  private signingUp = false;

  constructor(config: { apiKey: string; authDomain: string; projectId: string; appId: string }) {
    const app = initializeApp(config);
    // App Check: proves requests come from your real site, so scripts cannot spam the database.
    const siteKey = import.meta.env.VITE_FIREBASE_APPCHECK_KEY;
    if (siteKey && import.meta.env.VITE_FIREBASE_EMULATOR !== '1') {
      initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true });
    }
    this.auth = getAuth(app);
    this.db = getFirestore(app);
    if (import.meta.env.VITE_FIREBASE_EMULATOR === '1') {
      connectAuthEmulator(this.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(this.db, '127.0.0.1', 8080);
    }
  }

  onAuth(cb: (p: Profile | null) => void): Unsub {
    this.authCbs.add(cb);
    const off = onAuthStateChanged(this.auth, async (u) => {
      // during sign-up the profile is written after the account exists; signUp() reports it
      if (u && this.signingUp) return;
      if (!u) {
        this.me = null;
        return cb(null);
      }
      const snap = await getDoc(doc(this.db, 'users', u.uid));
      this.me = snap.exists() ? ({ uid: u.uid, ...snap.data(), lastSeen: ms(snap.data().lastSeen) } as Profile) : null;
      cb(this.me);
      this.heartbeat();
    });
    return () => {
      off();
      this.authCbs.delete(cb);
    };
  }

  async signUp(i: SignUpInput) {
    if (!USERNAME_RE.test(i.username)) throw new Error('Username: 3–20 lowercase letters, numbers or _.');
    const taken = await getDoc(doc(this.db, 'usernames', i.username));
    if (taken.exists()) throw new Error('That username is taken.');
    this.signingUp = true;
    const cred = await createUserWithEmailAndPassword(this.auth, i.email.trim(), i.password).catch((e) => {
      this.signingUp = false;
      throw new Error(friendly(e));
    });
    const uid = cred.user.uid;
    const profile = { username: i.username, displayName: i.displayName || i.username, dept: i.dept, level: i.level, skin: i.skin };
    try {
      await runTransaction(this.db, async (t) => {
        const ref = doc(this.db, 'usernames', i.username);
        if ((await t.get(ref)).exists()) throw new Error('That username is taken.');
        t.set(ref, { uid });
        t.set(doc(this.db, 'users', uid), { ...profile, lastSeen: serverTimestamp() });
      });
    } catch (e) {
      // someone took the username at the same moment: remove the half-made account
      await cred.user.delete().catch(() => {});
      this.signingUp = false;
      throw e;
    }
    this.signingUp = false;
    this.me = { uid, ...profile, lastSeen: Date.now() };
    for (const cb of this.authCbs) cb(this.me);
  }

  async signIn(email: string, password: string) {
    await signInWithEmailAndPassword(this.auth, email.trim(), password).catch((e) => {
      throw new Error(friendly(e));
    });
  }

  async signOut() {
    await signOut(this.auth);
  }

  heartbeat() {
    if (!this.me) return;
    updateDoc(doc(this.db, 'users', this.me.uid), { lastSeen: serverTimestamp() }).catch(() => {});
  }

  users(cb: (list: Profile[]) => void): Unsub {
    return onSnapshot(query(collection(this.db, 'users'), orderBy('lastSeen', 'desc'), limit(100)), (qs) =>
      cb(qs.docs.filter((d) => d.id !== this.me?.uid).map((d) => ({ uid: d.id, ...d.data(), lastSeen: ms(d.data().lastSeen) }) as Profile)),
    );
  }

  chats(cb: (list: ChatSummary[]) => void): Unsub {
    const me = this.me!.uid;
    return onSnapshot(query(collection(this.db, 'chats'), where('members', 'array-contains', me), orderBy('updatedAt', 'desc'), limit(50)), (qs) =>
      cb(qs.docs.map((d) => ({ id: d.id, otherUid: (d.data().members as string[]).find((m) => m !== me) ?? me, lastText: d.data().lastText ?? '', updatedAt: ms(d.data().updatedAt) }))),
    );
  }

  messages(chatId: string, cb: (list: Message[]) => void): Unsub {
    return onSnapshot(query(collection(this.db, 'chats', chatId, 'messages'), orderBy('at', 'asc'), limit(200)), (qs) =>
      cb(qs.docs.map((d) => ({ id: d.id, from: d.data().from, text: d.data().text, at: ms(d.data().at) }))),
    );
  }

  async send(otherUid: string, text: string) {
    const me = this.me!.uid;
    const body = text.trim().slice(0, 1000);
    if (!body) return;
    const id = chatIdOf(me, otherUid);
    const batch = writeBatch(this.db);
    batch.set(doc(this.db, 'chats', id), { members: [me, otherUid].sort(), lastText: body, updatedAt: serverTimestamp() }, { merge: true });
    batch.set(doc(collection(this.db, 'chats', id, 'messages')), { from: me, text: body, at: serverTimestamp() });
    await batch.commit().catch((e) => {
      throw new Error(e?.code === 'permission-denied' ? 'You can’t message this player.' : 'Message not sent. Check your connection.');
    });
  }

  posts(kind: PostKind, cb: (list: Post[]) => void): Unsub {
    return onSnapshot(query(collection(this.db, 'posts'), where('kind', '==', kind), orderBy('at', 'desc'), limit(50)), (qs) =>
      cb(qs.docs.map((d) => ({ id: d.id, ...d.data(), at: ms(d.data().at), likes: d.data().likes ?? [] }) as Post)),
    );
  }

  async post(kind: PostKind, text: string, image?: string) {
    const me = this.me!;
    await addDoc(collection(this.db, 'posts'), { uid: me.uid, name: me.displayName, username: me.username, kind, text: text.slice(0, 280), ...(image ? { image } : {}), at: serverTimestamp(), likes: [] });
  }

  async like(postId: string) {
    const me = this.me!.uid;
    const ref = doc(this.db, 'posts', postId);
    const snap = await getDoc(ref);
    const liked = ((snap.data()?.likes as string[]) ?? []).includes(me);
    await updateDoc(ref, { likes: liked ? arrayRemove(me) : arrayUnion(me) });
  }

  snaps(cb: (list: Snap[]) => void): Unsub {
    return onSnapshot(query(collection(this.db, 'snaps'), where('to', '==', this.me!.uid), limit(30)), (qs) =>
      cb(qs.docs.map((d) => ({ id: d.id, ...d.data(), at: ms(d.data().at) }) as Snap)),
    );
  }

  async sendSnap(toUid: string, image: string) {
    const me = this.me!;
    await setDoc(doc(collection(this.db, 'snaps')), { from: me.uid, fromName: me.displayName, to: toUid, image, at: serverTimestamp() }).catch((e) => {
      throw new Error(e?.code === 'permission-denied' ? 'You can’t send snaps to this player.' : 'Snap not sent. Check your connection.');
    });
  }

  async openSnap(id: string) {
    await deleteDoc(doc(this.db, 'snaps', id));
  }

  async loadSave() {
    if (!this.me) return null;
    const snap = await getDoc(doc(this.db, 'saves', this.me.uid));
    return snap.exists() ? (snap.data() as SaveData) : null;
  }

  async writeSave(d: SaveData) {
    if (!this.me) return;
    await setDoc(doc(this.db, 'saves', this.me.uid), d);
  }

  async block(uid: string) {
    const me = this.me!;
    await updateDoc(doc(this.db, 'users', me.uid), { blocked: arrayUnion(uid) });
    me.blocked = Array.from(new Set([...(me.blocked ?? []), uid]));
  }

  async unblock(uid: string) {
    const me = this.me!;
    await updateDoc(doc(this.db, 'users', me.uid), { blocked: arrayRemove(uid) });
    me.blocked = (me.blocked ?? []).filter((u) => u !== uid);
  }

  async report(r: ReportInput) {
    await addDoc(collection(this.db, 'reports'), {
      reporter: this.me!.uid,
      targetUid: r.targetUid,
      kind: r.kind,
      refId: r.refId ?? '',
      reason: r.reason,
      excerpt: (r.excerpt ?? '').slice(0, 500),
      at: serverTimestamp(),
    });
  }

  async deleteAccount(password: string) {
    const user = this.auth.currentUser;
    const me = this.me;
    if (!user || !me || !user.email) return;
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password)).catch((e) => {
      throw new Error(friendly(e));
    });
    const posts = await getDocs(query(collection(this.db, 'posts'), where('uid', '==', me.uid)));
    const batch = writeBatch(this.db);
    posts.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(this.db, 'saves', me.uid));
    batch.delete(doc(this.db, 'usernames', me.username));
    batch.delete(doc(this.db, 'users', me.uid));
    await batch.commit();
    await deleteUser(user);
    this.me = null;
  }
}

function friendly(e: { code?: string; message?: string }) {
  switch (e.code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Wrong email or password.';
    case 'auth/network-request-failed':
      return 'No connection. Check your internet and try again.';
    default:
      return e.message ?? 'Something went wrong. Try again.';
  }
}
