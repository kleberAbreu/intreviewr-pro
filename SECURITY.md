# Security Policy

## Reporting a vulnerability

Please do not open a public issue with secrets, API keys, private logs,
interview transcripts, resumes, job descriptions, or provider responses that
may contain personal information.

If you find a vulnerability, report it privately through GitHub's private
vulnerability reporting flow when available, or contact the maintainer directly
through the GitHub profile for this repository.

## Handling sensitive data

This project is source code for personal/local use. It lets users provide their
own API keys and sends interview data directly from the browser to the selected
AI providers. Before sharing logs or reproduction steps, remove:

- API keys, tokens, cookies, and authorization headers.
- Job descriptions, resumes, interview transcripts, and generated reports.
- Provider request or response bodies that contain personal data.

For a hosted production deployment, move provider calls behind a backend/proxy,
use ephemeral credentials where supported, add rate limits and quotas, and keep
standard provider API keys server-side only.
