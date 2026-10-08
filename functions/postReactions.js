// Likes and comments on posts, done by the server (S5, 8 Oct 2026).
//
// They were written straight to the post by whoever reacted, and the rules
// had to allow anyone to rewrite the whole likes list and the whole comments
// list - so anyone could delete or reword someone else's comment, or remove
// someone's like. Done here instead, each change touches only what it should:
// your own like, your own new comment (stamped with who you are), and a
// comment deleted only by the person who wrote it, the post's author, or an
// admin. The rules now refuse those writes from the browser.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { requireLive } = require('./caller');
const M = require('./accessMatrix.gen');

const COLLECTIONS = ['brandPosts', 'categoryPosts', 'supportAnnouncements'];

async function liveMatrix() {
  const snap = await admin.firestore().collection('accessMatrix').get();
  const overrides = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
  return Object.fromEntries(M.ROWS.map((row) => [row.id, { ...row.d, ...(overrides[row.id] ?? {}) }]));
}

// Can this person see this post at all? The same answer the rules give.
async function canSee(me, collection, post) {
  if (me.role === 'admin' || collection === 'supportAnnouncements') return true;
  if (collection === 'brandPosts') {
    if (me.role === 'executive' || post.targetId === 'all') return true;
    const mine = me.permissions?.brandIds ?? [];
    return mine.includes(post.targetId) || mine.includes(post.brandId);
  }
  // A folder post: the folder must be one of theirs.
  const f = M.accessLevel(me, 'folders', await liveMatrix());
  const folders = f === 'all' ? M.ALL_FOLDERS : Array.isArray(f) ? f : [];
  return folders.includes(post.categoryId) || (me.permissions?.extraFolders ?? []).includes(post.categoryId);
}

exports.reactToPost = onCall(async (request) => {
  const me = await requireLive(request);
  const { collection, postId, action, text, commentId } = request.data || {};
  if (!COLLECTIONS.includes(collection)) throw new HttpsError('invalid-argument', 'Not a post.');
  if (!postId) throw new HttpsError('invalid-argument', 'Which post?');

  const db = admin.firestore();
  const ref = db.collection(collection).doc(String(postId));
  const uid = me.uid;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'That post no longer exists.');
    const post = snap.data();
    if (!(await canSee(me, collection, post))) throw new HttpsError('permission-denied', 'You cannot see this post.');
    const comments = post.comments ?? [];

    if (action === 'like') {
      const likedBy = post.likedBy ?? [];
      tx.update(ref, { likedBy: likedBy.includes(uid) ? likedBy.filter((x) => x !== uid) : [...likedBy, uid] });
      return;
    }
    if (action === 'comment') {
      const body = String(text ?? '').trim();
      if (!body) throw new HttpsError('invalid-argument', 'Write something first.');
      if (body.length > 2000) throw new HttpsError('invalid-argument', 'That comment is too long.');
      const comment = { id: Date.now().toString() + '-' + uid.slice(0, 6), uid, authorName: me.name ?? 'Unknown', text: body, timestamp: Date.now() };
      if (collection !== 'supportAnnouncements') comment.likedBy = [];
      // A new comment brings the post back up, as it always has - except on
      // Support, where replies are private to the person and admins.
      tx.update(ref, { comments: [...comments, comment], ...(collection === 'supportAnnouncements' ? {} : { timestamp: Date.now() }) });
      return;
    }
    if (action === 'commentLike') {
      if (!comments.some((c) => c.id === commentId)) throw new HttpsError('not-found', 'That comment is gone.');
      tx.update(ref, {
        comments: comments.map((c) => {
          if (c.id !== commentId) return c;
          const likedBy = c.likedBy ?? [];
          return { ...c, likedBy: likedBy.includes(uid) ? likedBy.filter((x) => x !== uid) : [...likedBy, uid] };
        }),
      });
      return;
    }
    if (action === 'deleteComment') {
      const c = comments.find((x) => x.id === commentId);
      if (!c) return;
      // Older comments carry no uid: only the post's author or an admin.
      const allowed = me.role === 'admin' || post.authorUid === uid || (c.uid && c.uid === uid);
      if (!allowed) throw new HttpsError('permission-denied', 'Only the person who wrote it, the post\'s author or an admin can delete a comment.');
      tx.update(ref, { comments: comments.filter((x) => x.id !== commentId) });
      return;
    }
    throw new HttpsError('invalid-argument', 'Unknown action.');
  });
  return { ok: true };
});
