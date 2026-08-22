# Ekaterina & Dimitar wedding invitation

The private, phone-first wedding invitation and RSVP system for Ekaterina and
Dimitar's celebration at Midalidare Estate on 20 June 2027.

Guests open a household-specific link or enter the code printed on their card.
They can reply for every invited person, leave dietary or accessibility notes,
and reuse the same link when meal selection opens. The admin view combines
website replies with replies received by phone, WhatsApp, Viber, or paper.

## Important dates and ownership

- RSVP deadline: **1 December 2026** (`2026-12-01`).
- Wedding: **20 June 2027**.
- Guest-data deletion date: **27 June 2027** (`2027-06-27`).
- Production administrator: **dyotov2@gmail.com**. Authentication alone is not
  authorization; every admin page and API must also enforce this allowlist on
  the server.

The public invitation is anonymous by design. Possession of a sufficiently
random household code or personal URL grants access only to that household.

## Architecture

- **React/vinext** renders the invitation, RSVP, meal and admin experiences.
- **Cloudflare Worker** handles invitation, RSVP, meal and admin APIs.
- **Cloudflare D1** is the authoritative store for households, guests and
  responses. Browser storage may hold an unfinished draft only.
- **Sites** builds, versions and deploys the Worker and binds the logical `DB`
  name to the environment's D1 database.
- **GitHub** stores source, migrations and documentation. It must never contain
  a real guest list, an RSVP export, a database backup, generated personal
  links, or QR-code packs.

Airtable is not required and must not be the RSVP system of record. See
[Architecture and security](docs/architecture.md) for data flow, trust
boundaries, staging and production isolation.

## Local development

Requirements: Node.js `>=22.13.0` and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Useful checks:

```bash
npm run lint
npm run typecheck
npm test
npm run check
```

`npm test` builds the production Worker, verifies the rendered invitation, and
runs repository privacy, migration and production-safety guards.

## Runtime configuration

Copy `.env.example` to `.env.local` for local development. Hosted values are
managed through Sites, not committed to Git. Public contact URLs are omitted
from the interface until configured.

The required production policy values are:

```text
ADMIN_EMAILS=dyotov2@gmail.com
PUBLIC_SITE_URL=https://your-final-valid-domain.example
WEDDING_WHATSAPP_URL=https://wa.me/...
WEDDING_VIBER_URL=viber://chat?number=...
WEDDING_PHONE_URL=tel:+...
```

These values are runtime configuration, so contact actions can be added later
without rebuilding the client bundle. The approved
lifecycle dates are stored in D1 wedding settings by the reviewed migrations.
On the deletion date,
guest reads and writes close; the admin dashboard exposes a typed-confirmation
purge and the runbook covers removal of every external copy.

## Guest-list workflow

Use one CSV row per invited person and group people with a stable
`household_external_id`. Every person also needs a stable `guest_external_id`.
The importer validates the file, shows a dry-run summary,
then upserts households and guests idempotently. Imports are safe merges: an
omitted existing record remains active and is clearly reported. It exports one personal
URL and code per household plus the value used to generate its QR code.

The complete column contract, example template, validation rules, reconciliation
steps and private-file handling are in [Guest-list import](docs/guest-list-import.md).

## Domain and QR warning

Sites supports connecting a custom domain the couple already owns: it provides
the DNS records, validates them, and issues SSL. It does not purchase the
domain, so buy one first (for example `ekaterinaanddimitar.com`).

An ampersand (`&`) is **not valid in a DNS hostname**. It may appear in page
copy as “Ekaterina & Dimitar,” but never create a domain such as
`ekaterina&dimitar.example`. Use a valid form such as
`ekaterina-and-dimitar.example` or `ekaterinadimitar.example`.

Choose, configure and test the final canonical production domain **before any
QR code is printed**. A QR code must point directly to the final HTTPS personal
URL. Redirects are a recovery mechanism, not the launch plan.

## Data safety

Guest names, attendance, dietary/accessibility notes, meal choices, contact
details and response sources are private data.

- Keep imports, exports, QR packs and backups outside this repository.
- Use synthetic households in local development and staging.
- Never log household codes, guest names, notes or meal choices.
- Back up production before every migration, import or release that can affect
  data. Sites does not expose D1 export or restore controls, so use the admin
  dashboard's Encrypted backups section: it snapshots every guest-data table,
  encrypts the file in the browser with a passphrase before download, and can
  restore a snapshot after a typed confirmation.
- Do not import the real guest list until one encrypted backup has been taken
  and a restore has been rehearsed, or production D1 moves into a Cloudflare
  account the couple controls.
- Delete guest records and every derived export/backup on 27 June 2027, unless
  a documented legal obligation requires a narrowly scoped exception.

See [Backup and rollback](docs/backup-and-rollback.md) for the release, recovery
and deletion runbook.

## Deployment

Staging and production must use separate Sites projects and separate D1
databases. Staging stays private and contains synthetic data. Production exposes
the anonymous guest experience while `/admin` and `/api/admin/*` require both
ChatGPT sign-in and the server-side email allowlist.

Deploy only a commit that passes CI. Apply and verify migrations in staging,
test the full RSVP flow, then deploy the exact same commit to production. Pilot
with a few trusted households before distributing all cards.

## Release gates

- CI passes lint, type checking, repository guards, application tests and build.
- No demo household, starter screen or real guest artifact is present.
- Production admin authorization is allowlisted to `dyotov2@gmail.com`.
- The final HTTPS domain is stable and tested on real phones.
- A production backup and restore rehearsal has succeeded.
- RSVP persistence is verified from guest link to admin view.
- A previous application version can be redeployed without reversing new RSVP
  data.
