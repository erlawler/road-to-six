# Security Policy

## Supported version

The latest commit on the default branch is the supported portfolio version.

## Reporting a vulnerability

Do not open a public issue for a suspected credential exposure or security vulnerability. Use GitHub private vulnerability reporting when it is enabled for the repository.

Include the affected route, reproduction steps, expected impact, and any safe evidence. Do not include real credentials, personal information, or destructive proof of concept data.

## Security boundaries

- All vendor keys are server-side environment variables and are excluded from source control.
- No user account, profile, wagering history, or personal data is collected.
- Runtime AI receives only a bounded football scenario and stores no application state through the request.
- D1 stores only an aggregate monthly AI usage ledger.
- Security headers block framing, unnecessary browser permissions, and cross-origin embedding.
- The probability calculation and deterministic explanation remain available without external credentials.
