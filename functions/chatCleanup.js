// Deletes chat attachments once everyone in the conversation has seen them.
//
// Photos and documents in a busy thread accumulate faster than anyone notices,
// and Storage bills arrive quietly. Attachments here are meant to be transient:
// you send a permit photo, people look at it, and anyone who needs to keep it
// downloads it to their own device.
//
// This runs on a schedule rather than deleting inline. An inline delete fails
// silently whenever someone closes the app mid-operation, and the orphaned file
// then costs money forever with nothing pointing at it. A sweep is idempotent
// and catches whatever the last run missed.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

exports.sweepViewedAttachments = onSchedule('every 24 hours', async () => {
  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  // Only messages that still have a file. Once swept, attachment.path is
  // cleared, so processed messages drop out of this query.
  const snap = await db.collection('messages').where('attachment.path', '!=', null).get();

  let deleted = 0;
  for (const docSnap of snap.docs) {
    const msg = docSnap.data();
    const members = msg.memberUids ?? [];
    const viewed = msg.attachment?.viewedBy ?? [];

    // The sender doesn't need to view their own file for it to count.
    const needToView = members.filter((uid) => uid !== msg.senderUid);
    const everyoneSeen = needToView.length > 0 && needToView.every((uid) => viewed.includes(uid));
    if (!everyoneSeen) continue;

    try {
      await bucket.file(msg.attachment.path).delete();
    } catch (err) {
      // Already gone — still worth clearing the reference below so the message
      // stops advertising a file that isn't there.
      console.log('storage delete skipped', msg.attachment.path, err.message);
    }

    await docSnap.ref.update({
      attachment: {
        ...msg.attachment,
        path: null,
        url: null,
        removed: true,
        removedAt: Date.now(),
      },
    });
    deleted += 1;
  }

  console.log(`swept ${deleted} attachment(s)`);
});
