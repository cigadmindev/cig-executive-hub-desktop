// Opening a file sent in a chat (8 Oct 2026).
//
// Messages used to carry a download link for their file. A Firebase download
// link works for anyone who has it, whatever the rules say - so a forwarded
// or copied link opened the file for someone outside the conversation. Now a
// message carries only where the file is, and this hands out a ten-minute
// link after checking, against the conversation itself, that the person
// asking is in it.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { requireLive } = require('./caller');

exports.getChatAttachmentUrl = onCall(async (request) => {
  const me = await requireLive(request);
  const messageId = String(request.data?.messageId ?? '');
  if (!messageId) throw new HttpsError('invalid-argument', 'Which file?');

  const db = admin.firestore();
  const msg = await db.collection('messages').doc(messageId).get();
  if (!msg.exists) throw new HttpsError('not-found', 'That message no longer exists.');
  const m = msg.data();
  const path = String(m.attachment?.path ?? '');
  if (!path || m.attachment?.removed) throw new HttpsError('not-found', 'That file is no longer available.');

  const convo = await db.collection('conversations').doc(String(m.conversationId ?? '')).get();
  if (!convo.exists || !(convo.data().memberUids ?? []).includes(me.uid)) {
    throw new HttpsError('permission-denied', 'This file is only for the people in that conversation.');
  }
  if (!path.startsWith(`chatAttachments/${m.conversationId}/`) || path.includes('..')) {
    throw new HttpsError('permission-denied', 'That file does not belong to this conversation.');
  }

  const [url] = await admin.storage().bucket().file(path).getSignedUrl({
    action: 'read',
    expires: Date.now() + 10 * 60 * 1000,
    responseDisposition: 'attachment; filename="' + String(m.attachment.name ?? 'file').replace(/["\\\r\n]/g, '') + '"',
  });
  return { url };
});
