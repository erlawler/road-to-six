# Security Policy

## Supported version

The latest commit on the default branch is the supported showcase version.

## Reporting a vulnerability

Do not open a public issue for a suspected credential exposure or security vulnerability. Use GitHub private vulnerability reporting when it is enabled for the repository.

Include the affected route, reproduction steps, expected impact, and any safe evidence. Do not include real credentials, personal information, or destructive proof of concept data.

## Security boundaries

- All vendor keys are server-side environment variables and are excluded from source control.
- No user account, profile, wagering history, or personal data is collected.
- Runtime AI receives only a bounded football scenario and stores no application state through the request.
- D1 stores aggregate monthly AI cost, shared request-window counts, cached normalized odds, and bounded AI-run metadata. It does not store prompts, user identity, wagering history, or raw vendor payloads.
- Security headers block framing, forms, unnecessary browser permissions, cross-origin embedding, unspecified resource sources, inline event-handler scripts, and inline style elements.
- The current vinext runtime requires inline bootstrap scripts, and the probability ring requires one dynamic style attribute. The CSP retains only those allowances while blocking all other inline script attributes and style elements.
- The probability calculation and deterministic explanation remain available without external credentials.
