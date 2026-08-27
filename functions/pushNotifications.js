// Push notifications, sent server-side.
//
// These used to fire from the posting device: mobile looped over every user
// and called Expo's push API directly. That meant notifications only went out
// when the post came from a phone — posting from desktop or web notified
// nobody — and a send could be cut short if the sender backgrounded the app.
// It also required every client to read the full user roster to get tokens.
//
// Firestore triggers fix all three: they fire regardless of which surface
// wrote the document, they retry, and tokens never leave the server.
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendExpoPush(messages) {
  if (!messages.length) return;
  // Expo accepts up to 100 per request.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      const body = await res.json();
      console.log('Expo push response', JSON.stringify(body));
    } catch (err) {
      console.error('Expo push failed', err);
    }
  }
}

async function activeUsers() {
  const snap = await admin.firestore().collection('users').get();
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((u) => u.active !== false);
}

function buildMessages(recipients, title, body, data) {
  return recipients
    .filter((u) => u.pushToken)
    .map((u) => ({ to: u.pushToken, sound: 'default', title, body, data }));
}

// Category announcements. Mirrors the targeting the mobile client used:
// admins always, plus anyone whose permissions include this category.
exports.onAnnouncementCreated = onDocumentCreated('announcements/{id}', async (event) => {
  const post = event.data?.data();
  if (!post) return;

  const users = await activeUsers();
  const recipients = users.filter(
    (u) =>
      u.uid !== post.authorUid &&
      (u.role === 'admin' || (u.permissions?.categoryIds ?? []).includes(post.categoryId))
  );

  const where = post.categoryLabel ? ` in ${post.categoryLabel}` : '';
  await sendExpoPush(
    buildMessages(recipients, `${post.authorName}${where}`, post.message ?? 'Posted an announcement', {
      screen: 'CategoryDetail',
      categoryId: post.categoryId,
      locationId: post.locationId,
    })
  );
});

// Brand announcements. targetId 'all' means everyone.
exports.onBrandPostCreated = onDocumentCreated('brandPosts/{id}', async (event) => {
  const post = event.data?.data();
  if (!post) return;

  const users = await activeUsers();
  const recipients = users.filter(
    (u) =>
      u.uid !== post.authorUid &&
      (u.role === 'admin' ||
        post.targetId === 'all' ||
        (u.permissions?.brandIds ?? []).includes(post.targetId))
  );

  const where = post.targetName ? ` for ${post.targetName}` : '';
  await sendExpoPush(
    buildMessages(recipients, `${post.authorName}${where}`, post.message ?? 'Posted an announcement', {
      screen: 'Brand',
      brandId: post.targetId,
    })
  );
});
