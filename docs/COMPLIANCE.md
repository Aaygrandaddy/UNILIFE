# Force Life: Nigerian legal compliance record

Prepared 2026-11-15 for game version 0.5. **This is an engineering review, not legal advice.** It records what the product does to meet Nigerian law and what the owner still has to do. Have it checked by a Nigerian lawyer and, for data protection, an NDPC-licensed Data Protection Compliance Organisation (DPCO) before public launch.

Status key: ✅ done in the product · 🟡 owner action needed · ❓ ask your lawyer

## 1. Data protection: Nigeria Data Protection Act 2023 (NDPA), NDPC directives and the NDPR 2019

| Requirement | What Force Life does | Status |
|---|---|---|
| Lawful basis for each use of data (s.25) | Listed per data type in the Privacy Policy: contract, legal obligation, legitimate interest | ✅ |
| Data minimisation (s.24) | No location, contacts, device camera or microphone. Date of birth is checked on the device and never stored | ✅ |
| Privacy notice with controller identity, purposes, recipients, retention, transfers and rights (s.27) | `public/legal/privacy.html`, shown in the menu and linked at sign-up | 🟡 Fill in operator name, address, CAC number, contact email, DPO, Firestore region and effective date |
| Consent that is informed, specific and provable (s.26) | Separate, unticked checkbox at sign-up. The accepted policy version and time are stored on the player's profile, and the database refuses a profile without them | ✅ |
| Children's data (s.31) | Accounts are 18+ only. Date of birth is checked at sign-up and under-18s are refused. Accounts later found to belong to minors are deleted | ✅ |
| Right of access and data portability (s.34, s.38) | Phone → Profile → **Download my data** gives a machine-readable JSON copy | ✅ |
| Right to erasure (s.34) | Phone → Profile → **Delete my account** removes profile, username, posts and save immediately | ✅ |
| Rectification, restriction, objection, withdrawing consent (s.34–36) | By email, as stated in the policy. Profile fields can be changed by the player | 🟡 Make sure the contact email is monitored; reply within one month |
| Security of processing (s.39) | Encrypted connections. Firestore rules: players read and write only what they should; blocking is enforced on the server; reports are write-only. App Check support | 🟡 Turn on App Check enforcement (`docs/FIREBASE_SETUP.md`) |
| Breach notification within 72 hours (s.40) | Commitment stated in the policy | 🟡 Write a one-page breach plan: who decides, how to contact the NDPC, how to message affected players |
| Retention limits (s.24) | Reports carry `expireAt` (12 months), unopened snaps `expireAt` (30 days) | 🟡 In the Firestore console create **TTL policies** on `reports.expireAt` and `snaps.expireAt` so they are deleted automatically |
| Cross-border transfer (s.41–43) | Disclosed. Firebase processes data under Google's data processing terms | 🟡 Accept Google's **Data Processing and Security Terms** in the Firebase / Google Cloud console; record the Firestore region in the policy |
| Processors (s.29) | Google is the only processor | 🟡 Same acceptance as above; keep a copy |
| Registration as a data controller of major importance; Data Protection Officer; compliance audit (s.44, s.32, NDPC directives) | Policy has a DPO contact slot | ❓ Whether you must register, and which fee band applies, depends on how many players' data you process. Check the current NDPC thresholds before launch and as the game grows; appoint a DPO if required |
| Data Protection Impact Assessment (s.28) | Not yet done | 🟡 Recommended before launch because the game hosts private messaging between strangers. A DPCO can help |
| Record of processing activities | Section 4 below | ✅ (keep it updated) |
| Device storage disclosure | Policy section 3 explains the browser storage used; all of it is strictly necessary | ✅ |
| No third-party tracking | No analytics, ad or social SDKs. Fonts are bundled with the game, so players' IP addresses are not sent to Google Fonts | ✅ |

## 2. Intellectual property

| Area | What Force Life does | Status |
|---|---|---|
| **Copyright Act 2022**: your own work | Code, design, generated textures, the radio music and the bugle call are original. `LICENSE` states ownership and all rights reserved | 🟡 Put your legal name in `LICENSE` and the About page. Optionally notify the work to the Nigerian Copyright Commission's voluntary scheme for extra evidence of ownership |
| AI-assisted work | Much of the code was written with an AI assistant | ❓ Ask your lawyer how this affects copyright ownership and whether you should document your own creative input |
| Third-party software and fonts | three.js (MIT), Firebase SDK (Apache 2.0), Oswald and Inter (SIL OFL 1.1) and 84 other dependencies. Their licence texts ship with the game in `licenses.txt`, regenerated on every build. Credits are on the About page | ✅ |
| Music and sound | All synthesised in code; no samples, recordings or licensed tracks | ✅ |
| Real institutions | The AFIT name and all references were removed; the campus is fictional with a disclaimer on the loading screen, footer, About page and Terms | ✅ |
| Military insignia | The Nigerian Air Force roundel was removed from the aircraft and replaced with a fictional "FL" emblem. Uniforms are generic with no rank, unit or service badges | ✅ |
| National symbols | Nigerian flags appear only as scenery on flagpoles; the coat of arms is not used anywhere | ❓ Do not use the flag or coat of arms in the game's logo, store listing or marketing without checking the Flags and Coat of Arms Act |
| **Trademarks Act**: the game name | "Force Life" has not been searched | 🟡 Search the Trademarks Registry and app stores; consider registering the name (classes 9 and 41) before spending on branding |
| App and business names in the game | Gist, Flash, Frame, Yarn and Waka are ordinary words with their own design; nothing copies WhatsApp, Snapchat, Instagram, X or Bolt names, logos or layouts. In-game businesses (Mama Blessing Canteen, Arewa Fresh Yoghurt, etc.) are invented | ✅ ❓ Ask your lawyer to sanity-check the in-game names for clashes with registered marks |
| Player content | Terms give you only the licence needed to run the game; players keep ownership. A copyright/trademark complaint contact is in the Terms | 🟡 Fill in the contact email |

## 3. Other laws that apply now or when you monetise

| Law | Relevance | Status |
|---|---|---|
| Cybercrimes (Prohibition, Prevention, etc.) Act 2015, as amended 2024 | Online harassment, cyberstalking and fraud are offences; platforms may receive lawful requests to preserve or disclose data | ✅ Report/block tools and Terms. 🟡 Decide who handles police or court requests |
| Federal Competition and Consumer Protection Act 2018 | Applies to real-money purchases: clear prices, no misleading claims, fair refunds | ✅ Virtual currency is declared to have no cash value. 🟡 Publish a refund policy before selling anything |
| Advertising Regulatory Council of Nigeria (ARCON) Act 2022 | Real-brand sponsorships or billboards in the game are advertising aimed at Nigerians and may need ARCON vetting before they go live | 🟡 Before selling sponsorships |
| Companies and Allied Matters Act 2020 | Register a business name or company with the CAC before taking money; needed for Paystack/Flutterwave | 🟡 |
| Tax (Finance Acts, FIRS / state revenue) | Income from ads, sponsorships or purchases is taxable | 🟡 |
| Classification of games | Whether any film or video classification rules apply to online games | ❓ |

## 4. Record of processing activities

| Processing | Data subjects | Data | Purpose | Basis | Recipients | Location | Retention |
|---|---|---|---|---|---|---|---|
| Accounts | Players | Email, password hash, profile, consent record | Provide accounts | Contract; legal obligation | Google (processor) | Firestore region chosen at setup | Until account deletion |
| Messaging and snaps | Players | Message text, snap images | Deliver communications | Contract | The recipient; Google | Same | Messages: until either account is deleted. Snaps: deleted when opened, or after 30 days |
| Posts | Players | Text, images, likes | Social feed | Contract | Other players; Google | Same | Until deleted by the author or account deletion |
| Progress | Players | Game state | Save progress | Contract | Google | Same | Until account deletion |
| Safety | Players | Reports, blocks | Moderation | Legitimate interest | Moderators; Google | Same | Reports 12 months; blocks until removed |

## 5. Before launch: owner checklist

1. Fill every `[BRACKETED]` placeholder in `public/legal/privacy.html`, `public/legal/terms.html`, `LICENSE` and the About page (`src/menu.ts`).
2. Accept Google's data processing terms; note the Firestore region in the policy.
3. Create TTL policies for `reports.expireAt` and `snaps.expireAt`.
4. Turn on App Check and enforce it.
5. Write the breach plan and decide who answers privacy and police requests.
6. Check NDPC registration thresholds; appoint a DPO if required; consider a DPIA.
7. Trademark search for "Force Life".
8. Have a Nigerian lawyer review this document, the Terms and the Privacy Policy.
