// What people see when something fails (V4, 8 Oct 2026). Never the raw
// technical error ("FirebaseError: Missing or insufficient permissions"):
//   - messages the Hub's own server writes for people are shown as they are;
//   - known kinds of failure get a plain sentence;
//   - anything else gets the screen's own "nothing was changed" line.
// The full error still goes to the browser console for Brenner.
const TECHNICAL = /firebase|firestore|undefined|null|cannot read|is not a function|internal|exception|\{|\}|https?:\/\/|\bat\s+\w+\s*\(/i;

export function plainError(err, fallback = 'Nothing was changed. Try again.') {
  const code = String(err?.code ?? '');
  const msg = String(err?.message ?? '').trim();
  if (err) console.error(err);
  // The Hub's own server explains itself in plain words - use them.
  if (code.startsWith('functions/') && msg && msg.length < 200 && !TECHNICAL.test(msg)) return msg;
  if (code.endsWith('permission-denied') || /insufficient permissions/i.test(msg)) {
    return "You don't have permission to do that. Nothing was changed.";
  }
  if (code.endsWith('unavailable') || code.endsWith('network-request-failed') || code.endsWith('deadline-exceeded') || /network|offline|failed to fetch/i.test(msg)) {
    return "Couldn't reach the Hub. Check your connection and try again.";
  }
  if (code === 'storage/unauthorized') return "That file couldn't be uploaded. Use a photo or a PDF under 20 MB.";
  if (code === 'storage/canceled') return 'The upload was cancelled.';
  if (code.endsWith('unauthenticated')) return 'Your sign-in has expired. Sign in again and try once more.';
  // Our own words: a server message meant for people, or a sentence a
  // screen wrote itself.
  if (msg && msg.length < 200 && !TECHNICAL.test(msg) && (code.startsWith('functions/') || !code)) return msg;
  return fallback;
}
