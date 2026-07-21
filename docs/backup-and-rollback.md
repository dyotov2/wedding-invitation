# Backup, release and rollback runbook

This runbook separates application rollback from guest-data recovery. Rolling
back code must not erase valid RSVPs received after a deployment.

## Roles and dates

- Production administrator: `dyotov2@gmail.com`.
- RSVP deadline: 1 January 2027.
- Wedding: 20 June 2027.
- Guest-data and derived-artifact deletion: 27 June 2027.

Assign a release operator and a second person to verify production totals before
the first guest links are distributed.

## Backup requirements

Back up production D1 immediately before:

- applying a database migration;
- importing or materially correcting the guest list;
- rotating invitation credentials;
- deploying a release that changes write behavior; or
- opening the meal-selection phase.

Store backups in an encrypted location outside Git and outside the project
working directory. Restrict access to the administrator, record a checksum,
and test that the backup can be read. A backup is not complete until a restore
has been rehearsed into an isolated database.

The release record contains only:

```text
UTC time:
Git commit:
Sites version:
Migration identifiers:
Backup location reference:
Backup checksum:
Household / guest / response totals:
Operator and verifier:
```

Do not copy names, codes, notes or personal URLs into tickets, CI output, commit
messages or chat transcripts.

## Pre-release checklist

1. Confirm CI passed for the exact Git commit.
2. Confirm `.openai/hosting.json` declares the `DB` binding.
3. Confirm every new schema change has a reviewed migration.
4. Confirm staging uses synthetic data and a different D1 database.
5. Apply migrations to staging and run invitation, RSVP, reload, admin, and
   meal-gate smoke tests.
6. Verify admin access succeeds for `dyotov2@gmail.com` and fails for a different
   signed-in email.
7. Verify logs and errors expose no private payloads.
8. Create, checksum and restore-test the production backup.
9. Record production totals without guest-level data.
10. Deploy the exact commit tested in staging.

## Post-release checks

Within the first release window:

1. Open an approved pilot household through its complete production URL.
2. Submit and change a reply for each invited person.
3. Reload on a different device and verify D1 returns the saved result.
4. Verify the admin view shows the correct status and response source.
5. Confirm unknown codes return a generic error and do not appear in logs.
6. Confirm error rate and latency remain normal.
7. Record only pass/fail results and aggregate counts.

Do not distribute all printed cards until the pilot passes.

## Application rollback

Use application rollback when the current code is broken but D1 data remains
valid.

1. Stop further deployment activity and identify the last known-good Sites
   version and Git commit.
2. Check whether the failing release included a database migration.
3. If the schema is backward compatible, redeploy the last known-good
   application version.
4. Run read-only invitation and admin checks, then one approved RSVP update.
5. Monitor errors and reconcile aggregate response totals.
6. Document the incident without guest-level data.

Prefer expand-and-contract migrations so both the old and new application can
run during rollback. Never reverse a migration automatically merely because
the application was rolled back.

## Data recovery

Use data recovery only for confirmed corruption, accidental deletion, or an
incorrect import.

1. Disable the affected write path while leaving safe read access available if
   possible.
2. Record the incident time and current aggregate totals.
3. Preserve a backup of the current state, even if it is damaged.
4. Restore the pre-incident backup into an isolated D1 database.
5. Compare aggregate counts and identify valid replies received after the
   backup.
6. Reapply those later valid replies through a reviewed reconciliation process.
7. Validate the recovered database in staging or an isolated recovery project.
8. Switch production only after the administrator and verifier approve totals.

Never overwrite production blindly with an older backup. That would discard
legitimate responses received after the backup.

## Credential incident

If a personal link is exposed to the wrong recipient:

1. Rotate only the affected household credential.
2. Preserve its existing guests and responses.
3. Invalidate the old credential immediately.
4. Generate and test a replacement URL and QR payload.
5. Contact the household through its intended delivery channel.
6. Check access logs using privacy-safe request identifiers, not by publishing
   credentials in the incident record.

## Scheduled deletion on 27 June 2027

1. Stop guest and admin writes.
2. Verify whether any narrow legal retention requirement exists and document it.
3. In the admin dashboard, type the required deletion phrase and run the
   retention purge. This deletes production households, guests, responses,
   notes, meal choices, invitation credentials, import history and audit events.
4. Delete imports, exports, delivery sheets, generated QR packs, backups,
   restored copies and local working files.
5. Remove private payloads from operational logs if any were captured.
6. Verify all configured storage locations and devices.
7. Record the anonymous purge receipt, completion date, operator, systems
   checked and result using no guest-level data.

Source code, schema and anonymized operational documentation may remain after
the deletion date.
