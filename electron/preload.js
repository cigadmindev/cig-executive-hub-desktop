// Intentionally empty.
//
// This file used to expose window.driveAPI so the renderer could ask the main
// process to fetch Executive Notes from Drive — that indirection existed only
// because the service account key lived in the main process. The key now sits
// in Secret Manager and the renderer calls a Cloud Function directly, so no
// bridge is needed.
//
// Don't delete this file: main.js still points webPreferences.preload here,
// and removing it breaks window creation. Leave it until that reference goes
// too. New bridges, if any are ever needed, belong here via contextBridge —
// never expose raw Node or Electron APIs to the renderer.
