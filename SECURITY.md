# Security Policy

## Reporting a vulnerability

Please report security issues **privately**. Do not open a public issue for a
vulnerability.

Use GitHub's private vulnerability reporting: go to the repository's **Security** tab →
**Report a vulnerability** (GitHub Security Advisories). This opens a private channel
with the maintainers.

Please include:

- A description of the issue and its impact.
- Steps to reproduce (a proof of concept if you have one).
- Affected version(s) and platform.

We aim to acknowledge a report within a few days and will keep you updated as we
investigate and ship a fix.

## What's in scope

OpenInventory is a **local-first desktop app**. Its most sensitive surface is the
optional **LAN HTTP server**, which exposes a read-only item-lookup page and
authenticated read APIs to other devices on the local network:

- **LAN server auth / access keys** — the access key is generated at runtime
  (`crypto.randomBytes`) and stored only in the local SQLite database, never committed.
- **LAN routing, rate limiting, and static file serving** — path traversal, DoS via
  unauthenticated requests, or auth bypass on the LAN endpoints are in scope.
- **Update integrity** — issues in how updates are fetched, verified, or applied
  (electron-updater via GitHub Releases).
- **Database safety** — the migration/backup/rollback path that guards the local SQLite
  database across updates.

## What's out of scope

- The app is designed for a **trusted local network**; it is not hardened against an
  attacker who already controls the LAN at the network layer.
- Social-engineering, physical access to the host machine, and issues requiring a
  malicious OS account are out of scope.
- Unsigned binaries trigger OS warnings (SmartScreen / Gatekeeper) — this is a known
  limitation tracked separately, not a vulnerability.

## Supported versions

Security fixes target the latest released version. Please upgrade to the newest release
before reporting.
