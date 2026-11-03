# Contributing

1. Install Node.js 24+ and run `npm ci`.
2. Run `npm run check` and `npm test`.
3. Start with `npm start` and use fictional examples while developing.
4. Describe the behavior, validation and remaining limitations in your pull request.

Keep platform adapters separate from queue and scoring logic. Add meaningful tests for identity checks, submission evidence, pause behavior and failure recovery. Do not claim live compatibility based only on DOM tests.

Use anonymized DOM fixtures. Remove names, contact details, account IDs, cookies, resume contents and platform-specific tracking URLs before sharing a sample. Never paste a production browser profile or workspace backup into an issue.

Preserve GPL headers, upstream attribution and fact-selection constraints. Contributions that bypass verification, silently retry uncertain submissions, fabricate resume facts or upload personal data by default will not be accepted.
