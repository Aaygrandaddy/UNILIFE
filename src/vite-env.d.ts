/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_EMULATOR?: string;
  readonly VITE_FIREBASE_APPCHECK_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_KEY?: string;
  readonly VITE_DEBUG_TOOLS?: string;
}
