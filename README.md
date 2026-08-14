# CIG Executive Hub — Desktop (Mac)

A separate, from-scratch Mac app built with Electron + React, sharing the
exact same Firebase project as the mobile app. Anything that happens on
the phone (a new post, an approved event, a chat message) appears here
automatically, in real time — no syncing code needed, since both apps
just read from the same live database.

This is the **foundation** — login, the main window shell, and a home
dashboard. Everything else (Messages, Availability, Calendars, Permits,
etc.) gets built out from here over the next several sessions, the same
incremental way the mobile app was built.

## Running it locally (for development/testing)

You'll need [Node.js](https://nodejs.org) installed (same as for the
mobile app).

```bash
cd ExecutiveHubDesktop
npm install
npm run dev
```

This starts both the web dev server and the Electron window together —
a real native Mac window should pop up showing the login screen.

## What's built so far
- Real login, reading the exact same `users` collection as mobile
  (same accounts, same permissions, same admin/manager roles)
- Native Mac window chrome (traffic-light buttons, draggable title bar)
- Sidebar navigation shell
- Home dashboard showing every restaurant brand as a card, matching
  mobile's brand colors and permission-gating

## Not built yet
Everything past Home — Messages, Availability, Calendars, Permits,
Renewals, Event Requests, Announcements, Admin tools. These come next.

## Publishing to the Mac App Store (once ready)
This uses `electron-builder`, which supports building a `.pkg` for Mac
App Store submission (`mas` target, already configured in
`package.json`). We'll walk through code signing, provisioning, and
submission together once there's enough built to actually ship — no
need to figure that out yet.
