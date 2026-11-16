/** Accounts, presence, chat and social posts. Firebase when configured, otherwise on-device. */

export interface Profile {
  uid: string;
  username: string;
  displayName: string;
  dept: string;
  level: string;
  skin: number;
  lastSeen?: number;
  bot?: boolean;
  /** uids this player has blocked */
  blocked?: string[];
}

/** Player progress saved to their account. */
export interface SaveData {
  v: 1;
  money: number;
  tokens: number;
  energy: number;
  minutes: number;
  day: number;
  mission: number;
  atmDay: number;
  x: number;
  z: number;
  savedAt: number;
}

export interface ReportInput {
  targetUid: string;
  kind: 'user' | 'message' | 'post' | 'snap';
  refId?: string;
  reason: string;
  excerpt?: string;
}

export interface Message {
  id: string;
  from: string;
  text: string;
  at: number;
}

export interface ChatSummary {
  id: string;
  otherUid: string;
  lastText: string;
  updatedAt: number;
}

export type PostKind = 'yarn' | 'frame';

export interface Post {
  id: string;
  uid: string;
  name: string;
  username: string;
  kind: PostKind;
  text: string;
  image?: string;
  at: number;
  likes: string[];
}

export interface Snap {
  id: string;
  from: string;
  fromName: string;
  to: string;
  image: string;
  at: number;
}

/** Bump when the Terms or Privacy Policy change; stored with each player's consent. */
export const POLICY_VERSION = '2026-11-15';
/** Accounts are for adults only (no children's data under the NDPA). */
export const MIN_AGE = 18;

export interface SignUpInput {
  email: string;
  password: string;
  username: string;
  displayName: string;
  dept: string;
  level: string;
  skin: number;
  /** POLICY_VERSION the player accepted, after passing the age check */
  consentVersion: string;
}

export type Unsub = () => void;

export interface Backend {
  mode: 'online' | 'offline';
  me: Profile | null;
  onAuth(cb: (p: Profile | null) => void): Unsub;
  signUp(input: SignUpInput): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  heartbeat(): void;
  users(cb: (list: Profile[]) => void): Unsub;
  chats(cb: (list: ChatSummary[]) => void): Unsub;
  messages(chatId: string, cb: (list: Message[]) => void): Unsub;
  send(otherUid: string, text: string): Promise<void>;
  posts(kind: PostKind, cb: (list: Post[]) => void): Unsub;
  post(kind: PostKind, text: string, image?: string): Promise<void>;
  like(postId: string): Promise<void>;
  snaps(cb: (list: Snap[]) => void): Unsub;
  sendSnap(toUid: string, image: string): Promise<void>;
  openSnap(id: string): Promise<void>;
  loadSave(): Promise<SaveData | null>;
  writeSave(d: SaveData): Promise<void>;
  block(uid: string): Promise<void>;
  unblock(uid: string): Promise<void>;
  report(r: ReportInput): Promise<void>;
  /** Permanently deletes the account, profile, username, posts and save. */
  deleteAccount(password: string): Promise<void>;
  /** Everything stored about the signed-in player, for access and portability requests. */
  exportData(): Promise<Record<string, unknown>>;
}

export const isBlocked = (me: Profile | null, uid: string) => !!me?.blocked?.includes(uid);
export const REPORT_REASONS = ['Harassment or bullying', 'Hate speech', 'Sexual content', 'Spam or scam', 'Threats or violence', 'Pretending to be someone else', 'Something else'];

export const chatIdOf = (a: string, b: string) => [a, b].sort().join('_');
export const ONLINE_WINDOW_MS = 75_000;
export const isOnline = (p: Profile) => !!p.bot || (p.lastSeen ?? 0) > Date.now() - ONLINE_WINDOW_MS;
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** Supabase or Firebase if their settings were present at build time, otherwise on-device. */
export async function createBackend(): Promise<Backend> {
  const env = import.meta.env;
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_KEY && !env.VITE_FIREBASE_EMULATOR) {
    try {
      const { SupabaseBackend } = await import('./supabaseBackend');
      return new SupabaseBackend(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_KEY);
    } catch (e) {
      console.warn('Supabase could not start; using on-device mode.', e);
    }
  }
  if (env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID) {
    try {
      const { FirebaseBackend } = await import('./firebaseBackend');
      return new FirebaseBackend({
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        appId: env.VITE_FIREBASE_APP_ID,
      });
    } catch (e) {
      console.warn('Firebase could not start; using on-device mode.', e);
    }
  }
  const { LocalBackend } = await import('./localBackend');
  return new LocalBackend();
}
