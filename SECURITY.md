# Security

Agent Reach is local-first. v0.1 stores offer cards, pitches, and conversion receipts in a local SQLite file. It does not phone home.

## Integrity

Conversion receipts and export bundles include a SHA-256 `integrityHash` over canonical JSON. Treat a failed verification as tamper/corruption — do not trust the payload.

## Reporting

Please open a private security advisory on the GitHub repository or contact the maintainer (JarvisOsorio). Do not file public issues for undisclosed vulnerabilities while the repo is private.
