// Builds a location's Drive folder tree and connects it to the Hub.
//
// Adding Chelsea meant pasting about 105 folder links by hand - one per item
// in the File Directory - and Nashville and Birmingham together would be 210
// more. Every one is a chance to paste the wrong folder.
//
// This creates whatever is missing in Drive and records the link for each, in
// one pass. It never deletes or modifies anything: the only Drive calls here
// are list and create.
//
// The Hub's folder list is fixed in code. Drive tells the Hub where each
// folder is, not which folders exist - a folder invented in Drive that is not
// in the Hub's list is ignored.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { google } = require('googleapis');

const FOLDER = 'application/vnd.google-apps.folder';

// The shared drive everything lives in.
const DRIVE_ID = '0ANOluAAxZB7lUk9PVA';

const esc = (s) => String(s).replace(/'/g, "\\'");

async function driveClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth: await auth.getClient() });
}

// Shared-drive searches need these three, or they only look at My Drive.
const SHARED = {
  corpora: 'drive',
  driveId: DRIVE_ID,
  includeItemsFromAllDrives: true,
  supportsAllDrives: true,
};

async function findChild(drive, parentId, name) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${esc(name)}' and mimeType = '${FOLDER}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 2,
    ...SHARED,
  });
  return res.data.files?.[0] ?? null;
}

/**
 * The folder, creating it only if it is not there. Never touches one that
 * already exists, so a folder people have been filing into is left alone.
 */
async function ensureChild(drive, parentId, name, created) {
  const existing = await findChild(drive, parentId, name);
  if (existing) return existing.id;

  const res = await drive.files.create({
    requestBody: { name, mimeType: FOLDER, parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  });
  created.push(name);
  return res.data.id;
}

exports.setUpLocationDrive = onCall({ timeoutSeconds: 540, memory: '512MiB' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const db = admin.firestore();
  const profile = await db.collection('users').doc(request.auth.uid).get();
  if (!profile.exists || profile.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can set up a location.');
  }

  // brandName and locationName are the Drive folder names; categories is the
  // Hub's own list, passed in so this function never has to duplicate it.
  const { locationId, brandId, brandName, locationName, categories, overwrite } = request.data || {};
  if (!locationId || !brandName || !locationName || !Array.isArray(categories)) {
    throw new HttpsError('invalid-argument', 'Missing details for this location.');
  }

  let drive;
  try {
    drive = await driveClient();
  } catch (err) {
    throw new HttpsError('failed-precondition', 'Could not reach Drive: ' + err.message);
  }

  const created = [];

  // Brand, then location, then each category, then each item under it.
  let brandFolderId;
  let locationFolderId;
  try {
    brandFolderId = await ensureChild(drive, DRIVE_ID, brandName, created);
    locationFolderId = await ensureChild(drive, brandFolderId, locationName, created);
  } catch (err) {
    throw new HttpsError(
      'failed-precondition',
      'Could not open the shared drive. The service account may not be a member yet: ' + err.message
    );
  }

  // What is already connected, so an existing link is left alone unless this
  // was asked to rebuild.
  const existingSnap = await db.collection('categoryDriveLinks').where('locationId', '==', locationId).get();
  const already = new Map();
  existingSnap.forEach((d) => {
    const x = d.data();
    if (x.driveUrl) already.set(x.categoryId + '|' + x.itemName, true);
  });

  let linked = 0;
  let skipped = 0;
  const batchSize = 300;
  let batch = db.batch();
  let pending = 0;

  for (const category of categories) {
    const categoryFolderId = await ensureChild(drive, locationFolderId, category.label, created);

    // A few at a time. Drive is happy with this and it turns a minute of
    // waiting into a few seconds.
    const CONCURRENCY = 8;
    const wanted = (category.items ?? []).filter(
      (itemName) => overwrite || !already.has(category.id + '|' + itemName)
    );
    skipped += (category.items ?? []).length - wanted.length;

    for (let i = 0; i < wanted.length; i += CONCURRENCY) {
      const slice = wanted.slice(i, i + CONCURRENCY);
      const ids = await Promise.all(
        slice.map((itemName) => ensureChild(drive, categoryFolderId, itemName, created))
      );

      slice.forEach((itemName, n) => {
        const docId = `${locationId}_${category.id}_${encodeURIComponent(itemName)}`;
        batch.set(
          db.collection('categoryDriveLinks').doc(docId),
          {
            locationId,
            brandId: brandId ?? null,
            categoryId: category.id,
            itemName,
            driveUrl: 'https://drive.google.com/drive/folders/' + ids[n],
            updatedAt: Date.now(),
            updatedBy: 'Set up automatically',
          },
          { merge: true }
        );
        linked++;
        pending++;
      });

      if (pending >= batchSize) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
  }

  if (pending > 0) await batch.commit();

  console.log(
    `Drive set up for ${brandName} · ${locationName}: ${linked} linked, ${skipped} left alone, ${created.length} folders created.`
  );

  return { linked, skipped, created: created.length, createdNames: created.slice(0, 20) };
});
