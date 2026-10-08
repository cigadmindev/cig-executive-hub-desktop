// When someone leaves, everything goes at once (decision 5 Oct, S1 8 Oct).
//
// Deactivating in Manage Logins only sets users.active = false. This trigger
// does the rest, the same minute:
//   - their sign-in is disabled and every session cancelled, so the app,
//     the database and the functions all refuse them;
//   - any welcome link they never used stops working;
//   - they are removed from the shared Drive (recorded, so it can be put
//     back if they return).
// Reactivating turns the sign-in back on. Drive is restored from the
// Offboarding page, deliberately, so nobody gets access back by accident.
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { removeAccess } = require('./driveAccess');

exports.onUserActiveChanged = onDocumentUpdated(
  { document: 'users/{uid}', timeoutSeconds: 540, memory: '512MiB' },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    const uid = event.params.uid;
    const was = before.active !== false;
    const is = after.active !== false;
    if (was === is) return;

    if (!is) {
      try {
        await admin.auth().updateUser(uid, { disabled: true });
        await admin.auth().revokeRefreshTokens(uid);
      } catch (err) {
        console.error('Could not disable sign-in for ' + uid + ': ' + err.message);
      }
      const tokens = await admin.firestore().collection('accountSetupTokens').where('uid', '==', uid).get();
      await Promise.all(tokens.docs.map((d) => d.ref.delete()));
      if (after.email) {
        try {
          await removeAccess(uid, after.email);
        } catch (err) {
          // Recorded on the offboarding record by removeAccess where it can be;
          // the button on the Offboarding page runs it again.
          console.error('Drive removal for ' + uid + ' failed: ' + err.message);
          await admin.firestore().collection('offboarding').doc(uid)
            .set({ driveRemoved: { finished: false, failures: [{ error: err.message }] } }, { merge: true });
        }
      }
      console.log('Deactivated ' + uid + ': sign-in off, sessions cancelled, setup links voided, Drive removed.');
    } else {
      try {
        await admin.auth().updateUser(uid, { disabled: false });
      } catch (err) {
        console.error('Could not re-enable sign-in for ' + uid + ': ' + err.message);
      }
      console.log('Reactivated ' + uid + ': sign-in on. Drive is restored from the Offboarding page.');
    }
  }
);
