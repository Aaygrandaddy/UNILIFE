/**
 * Light profanity filter for chat and posts. Masks whole words (first letter kept), including
 * simple look-alike spellings such as "sh1t". This is a first line of defence, not moderation:
 * reports and blocking are what protect players.
 */
const WORDS = [
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'dick', 'pussy', 'cunt',
  'whore', 'slut', 'nigga', 'nigger', 'faggot', 'retard', 'wanker', 'twat',
  // common Nigerian insults
  'mumu', 'olodo', 'ashawo', 'werey', 'oloshi', 'ashewo',
];

const LOOKALIKE: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' };

const normal = (w: string) =>
  w
    .toLowerCase()
    .split('')
    .map((c) => LOOKALIKE[c] ?? c)
    .join('')
    .replace(/(.)\1{2,}/g, '$1$1');

const SET = new Set(WORDS);

export function clean(text: string): string {
  // words start and end with a letter or digit; symbols in the middle count as look-alikes (sh!t, f@ck)
  return text.replace(/[\p{L}\p{N}](?:[\p{L}\p{N}@$!]*[\p{L}\p{N}])?/gu, (w) => {
    const n = normal(w);
    const hit = SET.has(n) || SET.has(n.replace(/(.)\1+/g, '$1')) || WORDS.some((b) => b.length >= 5 && n.includes(b));
    return hit ? w[0] + '*'.repeat(Math.max(2, w.length - 1)) : w;
  });
}
