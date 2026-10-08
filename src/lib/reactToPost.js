import { getFunctions, httpsCallable } from 'firebase/functions';

// Likes and comments are done by the server, so nobody can change someone
// else's (S5, 8 Oct 2026). The rules refuse these writes from the browser.
export function reactToPost(collection, postId, action, extra = {}) {
  const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'reactToPost');
  return fn({ collection, postId, action, ...extra });
}
