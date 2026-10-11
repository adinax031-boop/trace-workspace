# Security policy

Trace 1.x receives fixes while this repository is actively maintained.

Please do not publish passwords, live databases, backups, or exploit details in a public issue. Use the repository's private vulnerability reporting feature if the maintainer has enabled it. If unavailable, open an issue asking for a private reporting channel without including vulnerability details.

Trace protects a shared workspace with a password, same-origin checks, server-side sessions, and strict browser headers. It has no per-user authorization or encryption at rest. Use HTTPS for remote access. Rotate the password after a suspected leak, restart to revoke sessions, and examine the host and backups.

No external security audit has been performed. See VALIDATION.md for the checks actually run.
