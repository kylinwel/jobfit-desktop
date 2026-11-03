# JobFit Desktop

[中文说明](README.md)

A local-first job-search workbench for BOSS Zhipin and Nowcoder. It combines eligibility checks, factual resume tailoring, local accounts, daily job digests and a reviewed application queue.

**Early prototype, v0.1.0.** Core logic is covered by offline tests. Live application adapters have not completed authenticated end-to-end validation. Rehearse first and verify the first real submission yourself.

## Run

Requires Node.js 24+ and npm. Windows is the primary validation environment.

```bash
git clone https://github.com/kylinwel/jobfit-desktop.git
cd jobfit-desktop
npm ci
npm start
```

## Features

- Explainable checks for location, graduation year, degree, availability and skills.
- Resume selection from confirmed project facts, with Markdown, HTML and print/PDF export.
- Optional compatible LLM endpoint that selects fact IDs without rewriting project facts.
- Separate persistent platform sessions; users complete sign-in and verification themselves.
- Current-page collection and Nowcoder public internship/campus job feeds.
- Local daily matching, CSV export and desktop notifications, with a default score threshold of 60.
- Reviewed queue, dry runs, pause, deduplication and conservative interruption recovery.

The app must stay open for scheduled runs; missed runs catch up on next launch. Defaults contain no personal profile and scheduling starts disabled. A score is a ranking heuristic, not a hiring probability.

BOSS sending currently requires an existing chat. Nowcoder automation targets identifiable on-platform applications and a specified existing platform resume. External ATS forms, first BOSS contact, verification and uploading tailored attachments require manual handling. Unknown results stop the queue and are not retried automatically.

## Privacy

User data lives outside the repository, under the system application-data directory (`JobFitDesktop`). Public digest requests contain generic pagination and job categories, without resume or location preferences. Optional model calls send the job and confirmed project text to the endpoint configured by the user; personal information inside that text is still transmitted. Model API keys are currently stored unencrypted locally and are removed from exported backups.

```bash
npm run check
npm test
npm run pack
npm run dist # Windows NSIS and portable packages
```

GPL-3.0-only. BOSS selectors include adapted upstream code; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). All shipped example profiles and jobs are fictional.
