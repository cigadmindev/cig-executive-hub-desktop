// Notifications for posts, signatures, time off, access requests, renewals and
// Systems Help. Who hears about what is decided in routing.js - see the table
// at the top of that file.
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { notifyPeople, resolveRef, ACTION, AMBIENT } = require('./notify');
const R = require('./routing');

const ZONE = 'America/Chicago';
const DAY = 24 * 60 * 60 * 1000;
const fmtDate = (ms) =>
  ms ? new Date(ms).toLocaleDateString('en-US', { timeZone: ZONE, weekday: 'short', month: 'short', day: 'numeric' }) : '';
const clip = (s, n) => {
  const t = String(s ?? '').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

// ---------------------------------------------------------------------------
// Posts - the morning summary, not straight away
// ---------------------------------------------------------------------------
exports.onBrandPostCreated = onDocumentCreated(
  { document: 'brandPosts/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
    const post = event.data?.data();
    if (!post) return;
    const brandId = await R.brandForTarget(post.targetId);
    const people = await R.postAudience(await R.activeUsers(), post);
    await notifyPeople(
      people,
      post.targetName ? 'New post · ' + post.targetName : 'New company post',
      (post.authorName ?? 'Someone') + ': ' + clip(post.message, 120),
      { speed: AMBIENT, topic: 'post', path: brandId ? '/brand/' + brandId : '/', brandId }
    );
  }
);

// One notification per folder post. (A second trigger on the same collection,
// onAnnouncementCreated, used to send everyone a duplicate - it is removed.)
exports.onCategoryPostCreated = onDocumentCreated(
  { document: 'categoryPosts/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
    const post = event.data?.data();
    if (!post) return;
    const brandId = await R.brandForLocation(post.locationId);
    const people = await R.folderPostAudience(await R.activeUsers(), post);
    await notifyPeople(
      people,
      'New in ' + (post.categoryLabel ?? 'a folder') + (post.locationName ? ' · ' + post.locationName : ''),
      (post.authorName ?? 'Someone') + ': ' + clip(post.message, 120),
      {
        speed: AMBIENT,
        topic: 'folderPost',
        path: '/brand/' + brandId + '/location/' + post.locationId + '/category/' + post.categoryId,
        locationId: post.locationId,
        categoryId: post.categoryId,
      }
    );
  }
);

// ---------------------------------------------------------------------------
// Signature Directory
// ---------------------------------------------------------------------------
exports.onWorkOrderCreated = onDocumentCreated(
  { document: 'workOrders/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
    const order = event.data?.data();
    if (!order) return;
    const signers = (order.assignedUids ?? []).filter((uid) => uid !== order.uploadedByUid);
    if (!signers.length) return;
    const people = (await R.activeUsers()).filter((u) => signers.includes(u.uid));
    // Each signer's own ref, so one person signing does not clear it for the others.
    for (const p of people) {
      await notifyPeople([p], 'Signature needed: ' + order.title, (order.uploadedByName ?? 'Someone') + ' sent this for your signature.', {
        speed: ACTION, topic: 'signature', path: '/work-orders', ref: 'signature/' + event.params.id + '/' + p.uid,
        button: 'Review and sign', why: 'You got this because you were asked to sign.',
      });
    }
  }
);

exports.onWorkOrderCompleted = onDocumentUpdated(
  { document: 'workOrders/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    // Anyone who has signed since the last change stops being asked.
    // signatures is a list of { uid, name, signedAt, ... }.
    const signedBefore = new Set((before.signatures ?? []).map((s) => s.uid));
    for (const uid of (after.signatures ?? []).map((s) => s.uid)) {
      if (!signedBefore.has(uid)) await resolveRef('signature/' + event.params.id + '/' + uid);
    }

    // The status flips before the PDF is assembled, so this waits for the file.
    if (!after.signedFileUrl || before.signedFileUrl) return;
    const people = (await R.activeUsers()).filter((u) => u.uid === after.uploadedByUid);
    await notifyPeople(people, 'Everyone has signed: ' + after.title, 'The signed document is ready to download.', {
      speed: ACTION, topic: 'signature', path: '/work-orders', button: 'Download it',
      why: 'You got this because you sent the document.',
    });
  }
);

// ---------------------------------------------------------------------------
// Time off - the COO and admins decide
// ---------------------------------------------------------------------------
exports.onTimeOffCreated = onDocumentCreated(
  { document: 'timeOffRequests/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
    const req = event.data?.data();
    if (!req) return;
    const users = await R.activeUsers();
    const asker = users.find((u) => u.uid === req.uid);
    const people = R.without(R.approvers(users), req.uid);
    const dates = req.startDate ? fmtDate(req.startDate) + (req.endDate && req.endDate !== req.startDate ? ' – ' + fmtDate(req.endDate) : '') : '';
    await notifyPeople(people, (req.name ?? 'Someone') + ' asked for time off', [asker?.job, dates].filter(Boolean).join(' · ') || 'Time off request', {
      speed: ACTION, topic: 'timeOff', path: '/availability', ref: 'timeOff/' + event.params.id,
      details: [['Dates', dates], ['Reason', clip(req.reason, 200)]].filter(([, v]) => v),
      button: 'Approve or deny', why: 'You got this because you approve time off.',
    });
  }
);

exports.onTimeOffResolved = onDocumentUpdated(
  { document: 'timeOffRequests/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (before.status !== 'pending' || after.status === 'pending') return;
    const users = await R.activeUsers();
    await resolveRef('timeOff/' + event.params.id, users.find((u) => u.uid === after.resolvedByUid)?.name ?? null);
    const people = users.filter((u) => u.uid === after.uid);
    const approved = after.status === 'approved';
    await notifyPeople(
      people,
      approved ? 'Your time off was approved' : 'Your time off was denied',
      approved ? 'It is on the team calendar.' : after.denialReason ? 'Reason: ' + after.denialReason : 'No reason was given.',
      { speed: ACTION, topic: 'timeOff', path: '/availability', button: 'See your time off', why: 'You got this because you asked for time off.' }
    );
  }
);

// ---------------------------------------------------------------------------
// Access requests - admins only
// ---------------------------------------------------------------------------
exports.onAccessRequestCreated = onDocumentCreated(
  { document: 'accessRequests/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
    const req = event.data?.data();
    if (!req) return;
    const people = R.admins(await R.activeUsers()).filter((u) => u.email !== req.userEmail);
    await notifyPeople(people, (req.userName ?? 'Someone') + ' asked for access', 'To ' + (req.targetLabel ?? 'something'), {
      speed: ACTION, topic: 'accessRequest', path: '/access-requests', ref: 'accessRequest/' + event.params.id,
      button: 'Review the request', why: 'You got this because you are an admin.',
    });
  }
);

exports.onAccessRequestResolved = onDocumentUpdated(
  { document: 'accessRequests/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (before.status === after.status) return;
    if (before.status === 'pending') await resolveRef('accessRequest/' + event.params.id, after.resolvedByName ?? null);
    // Found by email, with the uid kept - the old version dropped it, and
    // then dropped anyone without the iPhone app, so nobody was ever told.
    const people = (await R.activeUsers()).filter((u) => u.email && u.email === after.userEmail);
    const what = after.targetLabel ?? 'that area';
    const word = { pending: 'Waiting', approved: 'Approved', denied: 'Declined' };
    const opts = { speed: ACTION, topic: 'accessRequest', path: '/directory', button: 'Open the Directory', why: 'You got this because you asked for access.' };

    // An admin moved it by hand - say what changed and why.
    if (after.statusChangedAt && after.statusChangedAt !== before.statusChangedAt) {
      const title = after.status === 'approved' ? 'You now have access to ' + what
        : before.status === 'approved' ? 'Your access to ' + what + ' was removed'
        : 'Your access request changed';
      await notifyPeople(people, title,
        (after.statusChangedByName || 'An admin') + ' changed it from ' + (word[before.status] ?? before.status) + ' to ' + (word[after.status] ?? after.status) + '. ' + (after.statusChangeReason || ''),
        opts);
      return;
    }
    if (before.status !== 'pending') return;
    const approved = after.status === 'approved';
    await notifyPeople(
      people,
      approved ? 'You now have access to ' + what : 'Your access request was declined',
      approved ? 'It is in your Directory now.' : 'For ' + what + '. ' + (after.declineReason ? 'Reason: ' + after.declineReason : 'No reason was given.'),
      opts
    );
  }
);

// ---------------------------------------------------------------------------
// Renewals - checked every morning, warned once at each step
// ---------------------------------------------------------------------------
// The old trigger only fired when someone edited a permit, so a permit nobody
// touched expired without a word. This looks at every permit each morning.
const STEPS = [60, 30, 7, 0];

exports.renewalWarnings = onSchedule(
  { schedule: '30 7 * * *', timeZone: ZONE, secrets: ['RESEND_API_KEY'] },
  async () => {
    const db = admin.firestore();
    const users = await R.activeUsers();
    const snap = await db.collection('licenseRenewals').get();
    let sent = 0;
    for (const d of snap.docs) {
      const r = d.data();
      if (r.hidden === true || !r.expirationDate) continue;
      const daysOut = Math.ceil((r.expirationDate - Date.now()) / DAY);
      // The tightest step this permit has reached, e.g. 55 days out -> the 60 warning.
      const step = STEPS.filter((s) => daysOut <= s).pop();
      if (step === undefined) continue;
      // Keyed to the date, so a renewed permit with a new date starts again.
      const key = r.expirationDate + ':' + step;
      if ((r.warningsSent ?? []).includes(key)) continue;

      const brandId = await R.brandForLocation(r.locationId);
      const locationName = r.locationName ?? (await R.locationName(r.locationId));
      const people = await R.renewalTeam(users, r.locationId);
      await notifyPeople(
        people,
        daysOut <= 0 ? r.type + ' has expired · ' + locationName : r.type + ' expires in ' + daysOut + ' days · ' + locationName,
        'Expires ' + fmtDate(r.expirationDate) + '.',
        {
          speed: ACTION, topic: 'renewal', ref: 'renewal/' + d.id,
          path: '/brand/' + brandId + '/location/' + r.locationId + '/renewals',
          details: [['Location', locationName], ['Expires', fmtDate(r.expirationDate)]],
          button: 'Open renewals', why: 'You got this because you look after renewals for this location.',
          locationId: r.locationId,
        }
      );
      await d.ref.update({ warningsSent: admin.firestore.FieldValue.arrayUnion(key) });
      sent++;
    }
    console.log('Renewal warnings sent: ' + sent);
  }
);

// Renewed - the date moved out of the warning window - clears the warning.
exports.onRenewalUpdated = onDocumentUpdated(
  { document: 'licenseRenewals/{id}' },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after || before.expirationDate === after.expirationDate) return;
    if ((after.expirationDate ?? 0) - Date.now() > 60 * DAY) await resolveRef('renewal/' + event.params.id);
  }
);

// ---------------------------------------------------------------------------
// Systems Help - IT & Training and admins
// ---------------------------------------------------------------------------
exports.onIntegrationRequestCreated = onDocumentCreated(
  { document: 'integrationRequests/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
    const req = event.data?.data();
    if (!req) return;
    const people = (await R.activeUsers()).filter((u) => (R.isAdmin(u) || u.job === 'IT & Training') && u.uid !== req.createdByUid);
    await notifyPeople(
      people,
      (req.kind === 'help' ? 'Help needed: ' : 'Change requested: ') + (req.system ?? 'a system'),
      'From ' + (req.createdByName ?? 'someone') + (req.description ? ' · ' + clip(req.description, 120) : ''),
      {
        speed: ACTION, topic: 'systemsHelp', path: '/integration-requests', ref: 'systemsHelp/' + event.params.id,
        button: 'Open the request', why: 'You got this because you handle Systems Help.',
      }
    );
  }
);

exports.onIntegrationRequestResolved = onDocumentUpdated(
  { document: 'integrationRequests/{id}', secrets: ['RESEND_API_KEY'] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    const newlyAnswered = !before.respondedAt && after.respondedAt;
    const newlyDone = before.status !== 'done' && after.status === 'done';
    if (!newlyAnswered && !newlyDone) return;
    // Someone has picked it up - it is no longer waiting on the others.
    await resolveRef('systemsHelp/' + event.params.id, after.respondedByName || null);
    const people = (await R.activeUsers()).filter((u) => u.uid === after.createdByUid);
    await notifyPeople(
      people,
      after.status === 'done' ? 'Sorted: ' + (after.system ?? 'your request') : 'Update on ' + (after.system ?? 'your request'),
      after.response ? clip(after.response, 160) : after.status === 'done' ? 'Marked done.' : 'It is being worked on.',
      { speed: ACTION, topic: 'systemsHelp', path: '/integration-requests', button: 'See the reply', why: 'You got this because you raised the request.' }
    );
  }
);
