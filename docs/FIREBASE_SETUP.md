# Putting Force Life online with Firebase

Force Life works in two modes:

| Mode | When | What players get |
|---|---|---|
| **Online** | The game is built with your Firebase settings and hosted on a normal website (for example Firebase Hosting) | Real accounts, live chat between players, shared Yarn and Frame feeds, Flash snaps |
| **On-device** | No Firebase settings, or the game runs somewhere that blocks outside connections (such as a claude.ai artifact link) | Accounts and chats stay in that one browser; three bot classmates reply |

The free Firebase plan (Spark) is enough for a class or a campus.

## 1. Create the project (about 10 minutes, in the browser)

1. Go to https://console.firebase.google.com and click **Create a project**. Name it, for example `force-life`. Google Analytics is optional.
2. **Authentication** → **Get started** → **Sign-in method** → enable **Email/Password**.
3. **Firestore Database** → **Create database** → choose a location close to Nigeria (for example `europe-west1`) → start in **production mode**.
4. **Project settings** (gear icon) → **Your apps** → click the **Web** icon `</>` → register an app named `force-life-web`. Copy the `firebaseConfig` values shown.

## 2. Add the settings to the code

In the project folder, copy `.env.example` to `.env.local` and fill it in from the config you copied:

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=force-life.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=force-life
VITE_FIREBASE_APP_ID=1:1234567890:web:abc123
```

These values identify your project and end up in the website's code; they are not secret. What protects players' data is `firestore.rules`.

## 3. Install, deploy rules, build and host

You need Node.js 18 or newer.

```bash
npm install
```

```bash
npx firebase login
```

```bash
npx firebase use --add
```

(pick your project and give it the alias `default`)

```bash
npx firebase deploy --only firestore
```

This uploads the security rules and the two indexes the chat and feed queries need. Indexes can take a few minutes to finish building.

```bash
npm run build
```

```bash
npx firebase deploy --only hosting
```

Firebase prints your game's address, for example `https://force-life.web.app`. Share that link with players.

## 3b. Or: deploy automatically from GitHub (no command line)

The repository includes `.github/workflows/deploy.yml`. Every push to `main` builds the game and deploys the website, security rules and indexes.

1. Firebase console → **Project settings** → **Service accounts** → **Generate new private key**. A JSON file downloads. Treat it like a password.
2. GitHub → your repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Add:
   - `FIREBASE_SERVICE_ACCOUNT`: paste the whole JSON file
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`: from step 1.4
   - `VITE_FIREBASE_APPCHECK_KEY` (optional, see below)
3. GitHub → **Actions** → **Deploy to Firebase** → **Run workflow** (or just push a change). After about two minutes the game is live at `https://<project-id>.web.app`.

## App Check (recommended before inviting the public)

App Check makes Firebase reject requests that do not come from your real website.

1. Create a reCAPTCHA v3 site key at https://www.google.com/recaptcha/admin for your domain (`<project-id>.web.app` and any custom domain).
2. Firebase console → **App Check** → register the web app with reCAPTCHA v3 and its secret key.
3. Add the site key as `VITE_FIREBASE_APPCHECK_KEY` (in `.env.local` or the GitHub secret) and redeploy.
4. Watch the App Check metrics for a day, then click **Enforce** for Firestore and Authentication.

## Moderation

Player reports arrive in the `reports` collection (Firebase console → Firestore). Each has the reporter, the reported player's uid, the reason and an excerpt. To remove a player, delete their user in **Authentication** and their documents in `users`, `usernames` and `posts`.

## 4. Test locally without touching the real project (optional)

The Firebase emulators run Auth and Firestore on your own computer (Java 11+ required):

```bash
VITE_FIREBASE_API_KEY=demo VITE_FIREBASE_AUTH_DOMAIN=demo-forcelife.firebaseapp.com VITE_FIREBASE_PROJECT_ID=demo-forcelife VITE_FIREBASE_APP_ID=demo VITE_FIREBASE_EMULATOR=1 npm run build
```

```bash
npx firebase emulators:exec --project demo-forcelife --only auth,firestore "npx vite preview --port 4173"
```

Open http://localhost:4173 in two different browsers (or one normal and one private window) to play as two people.

## What is stored

| Collection | Contents | Who can read / write |
|---|---|---|
| `users/{uid}` | Username, display name, department, level, skin tone, last seen | Any signed-in player reads; only the owner writes |
| `usernames/{name}` | Maps a username to its owner, to keep names unique | Anyone can check; only the owner creates |
| `chats/{a_b}` and `messages` | One-to-one chats | Only the two members |
| `posts` | Yarn text posts and Frame photos (photos are small JPEGs stored inside the post) | Signed-in players read; authors create and delete; anyone can add or remove only their own like |
| `snaps` | Flash photos | Only the recipient can open one; opening deletes it |

## Before inviting lots of people

- Add a **Delete account** option and a **Report** button (planned for 0.5).
- Consider Firebase **App Check** to stop scripts from abusing the database.
- Free-plan limits: 50,000 document reads and 20,000 writes per day. A busy class will fit; a whole campus may need the pay-as-you-go plan.
