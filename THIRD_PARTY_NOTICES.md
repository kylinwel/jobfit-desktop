# Third-party notices

## aliu-ronin/boss-jobseeker

- Source: https://github.com/aliu-ronin/boss-jobseeker
- Revision: fd9081a26f84d35c2a6ec3a54f31d569db91c4ed
- Original file: content.js
- License: GPL-3.0; distributed here as GPL-3.0-only, without assuming a later-version option.
- Copyright (C) 2026 刘戈 <aliu.ronin@gmail.com>
- Adapted file: src/ui/adapters/boss-dom.js

Reused: detecting page anomalies, extracting chat identity/messages, reading position metadata and existing resume cards.

Modifications: namespaced selected read-only functions; removed upstream initialization, debug entry points, scanning/auto-reply behavior and notifications. src/ui/adapters/boss.js (adapted from the original extension content.js) reuses resume-panel selectors in a rewritten sender with identity checks, scoped confirmation and verification; global fallback clicks were removed.

Full GPL version 3 is included in LICENSE. Modified GPL-covered distributions must preserve applicable license and source obligations.

## linkedom

- Source: https://github.com/WebReflection/linkedom
- License: ISC
- npm development dependency for DOM fixtures, not bundled into the desktop app.
- Exact versions and transitive packages: package-lock.json; installed packages carry their own license notices.

## Electron and electron-builder

Development and packaging dependencies; their licenses are included in installed packages and generated distributions. Electron: MIT; electron-builder: MIT. Exact versions are pinned in package-lock.json.
