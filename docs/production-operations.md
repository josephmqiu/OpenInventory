# OpenInventory Production Operations

## Release Rule

No production release ships unless all of the following are true:

- Local smoke E2E is green.
- CI release gate is green.
- Golden upgrade-path tests pass against prior-version database shapes.
- A verified local pre-update backup can be created before install.
- Post-update validation can load the core inventory snapshot.
- The release has a rollback path through a verified backup.

## Windows Signing Risk Acceptance

- Date accepted: 2026-05-20
- Decision: Windows signing is accepted as a temporary production risk.
- Rationale: Current customer footprint is controlled, and hardening effort is
  focused first on preventing data corruption and release regressions.
- Consequences:
  - Windows SmartScreen may show "Unknown Publisher" warnings.
  - Some enterprise environments may block installation.
  - Update artifacts do not provide the same publisher trust signal as signed
    releases.
- Revisit trigger:
  - First external/enterprise customer.
  - First SmartScreen or installer-trust support issue.
  - Any broader distribution beyond the controlled customer set.

## Restore Drills

Backups are considered production-ready only if restore is periodically tested.
At minimum, run a restore drill before major releases and after backup/restore
code changes:

1. Create a backup from a realistic database.
2. Restore it on a clean Windows machine or clean Windows user-data directory.
3. Confirm inventory rows, movement history, personnel, settings, and audit
   views match expectations.
4. Confirm `PRAGMA integrity_check(1)` is `ok`.
5. Confirm `PRAGMA foreign_key_check` returns no rows.

## Deferred Operational Work

Release channels, staged rollout percentages, structured local logs, support
bundle export, backup-failure alerts, and opt-in crash reporting remain planned
operational maturity work. These should be added when the support burden or
customer count justifies the extra process and privacy review.
