# Architecture

The UI is static HTML/CSS/ES modules served through the privileged `jobfit://app` scheme. It communicates with one local main-process route. No web server or localhost port is required.

- `src/main/index.cjs`: app lifecycle, custom protocol, notifications and restricted IPC.
- `routing.cjs`: static-path boundary checks and trusted-frame validation.
- `local-store.cjs`: revisioned JSON storage, atomic replacement and local snapshots.
- `jobfit-service.cjs`: serialized mutations, resume workflow and queue state transitions. Browser I/O runs outside the mutation lock so pause remains responsive.
- `jobfit-platforms.cjs`: allowlisted HTTPS windows with per-platform persistent sessions, no Node integration or preload, and isolated-world DOM adapters.
- `jobfit-digest.cjs`: daily scheduler, generic public collection, local matching, report history and CSV generation.
- `src/ui/lib`: explainable matching, fact catalogs, resume rendering and model-output validation.

Account windows use separate partitions from the local workbench. They cannot invoke the workbench preload. External links are restricted to HTTPS, IPC validates the actual main frame, and static files stay inside the UI folder.

Queue states include reviewed, sending, verified, simulated, uncertain and needs-review. An unknown result pauses execution. Resume/profile changes revoke pending approvals; startup does not resume sending.

Tests use fictional data, mocked platform senders and DOM fixtures. They do not establish real platform compatibility. Changes to site structure require new fixtures and an explicit, human-reviewed live validation.
