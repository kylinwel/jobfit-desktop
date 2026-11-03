# Security

Please do not attach real resumes, API keys, browser cookies or account backups to public issues.

If private vulnerability reporting is available in this repository, use **Security → Report a vulnerability**. Otherwise, open a minimal issue requesting a private contact channel without including exploit details or personal data.

The main process, protocol and IPC boundaries are security-sensitive. Platform pages run without Node.js or the local preload. Keep that boundary intact and validate navigation targets and IPC senders.

Current limitations: model API keys are stored unencrypted in the local data directory; platform DOM adapters remain experimental; unsigned local builds do not provide publisher identity verification. Exported backups omit model keys and account sessions.
