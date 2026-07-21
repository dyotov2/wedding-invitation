# Architecture and security

## System boundary

The wedding invitation is a public guest experience with a private management
surface. Guests do not create accounts. A household-specific random code or URL
is the access credential for that household.

```text
Printed card / QR / personal link
              |
              v
       Sites guest pages
              |
              v
       Cloudflare Worker API
              |
              v
      Environment-specific D1

ChatGPT sign-in + email allowlist
              |
              v
       /admin and /api/admin/*
```

GitHub stores application source, Drizzle schema and migrations, automated
tests, and operational documentation. GitHub is not the application host and is
never a guest-data store.

## Persistence

Cloudflare D1 is the authoritative database for:

- households and their stable import identifiers;
- invited guests;
- attendance responses;
- dietary or accessibility notes;
- response sources;
- meal choices; and
- operational wedding settings such as whether meal selection is open.

The logical D1 binding is `DB` in `.openai/hosting.json`. Sites owns the actual
Cloudflare resource and binds the correct database during deployment. Sites does
not expose D1 export, Time Travel or restore controls, so complete backups are
taken through the admin dashboard's Encrypted backups workflow
(`/api/admin/backup` and `/api/admin/restore`, passphrase-encrypted in the
browser); see the backup runbook. Drizzle
schema changes must produce reviewed SQL files in `drizzle/`. Production
requests must not create tables, alter schema, or seed demonstration records.

Browser storage is allowed only for an unfinished local draft. Drafts contain no
invitation credential, expire after 30 days, and are removed no later than the
data-deletion date. A guest is told that a reply is saved only after the Worker
confirms the D1 write.

Airtable is not required and must not become a second source of truth. A CSV or
spreadsheet export may be used for human review, but changes return through a
controlled import or admin workflow.

## Request and data flow

1. A guest scans a QR code, opens a personal link, or enters a printed code.
2. The Worker normalizes the credential, applies abuse controls, and returns
   only the matching household and invited people.
3. The guest submits one response for every invited person.
4. The Worker validates every guest against the household and saves the reply
   as one database operation.
5. The response is read back from D1 and returned as the save confirmation.
6. The same credential is reused when meal selection opens.

The API must return the same public-facing error for an unknown, expired, or
malformed code. Logs must not contain the submitted credential.

## Authentication and authorization

Guest pages and guest RSVP APIs are anonymous. Their protection is an
unguessable household credential, household-scoped database queries, generic
errors, and request throttling.

The admin surface uses dispatch-owned Sign in with ChatGPT. Sign-in identifies
the user but does not authorize them. Every admin page and every
`/api/admin/*` request must also compare the normalized email to the explicit
server-side allowlist:

```text
dyotov2@gmail.com
```

Do not trust a client-side check, display name, query parameter, cookie created
by this application, or a forwarded header supplied outside the Sites trust
boundary.

## Environment isolation

Staging and production use separate Sites projects and separate D1 databases.

| Environment | Access | Data | Purpose |
| --- | --- | --- | --- |
| Local | Developer machine | Synthetic only | Implementation and automated tests |
| Staging | Private | Synthetic only | Migration, browser and release validation |
| Production | Public guest pages; allowlisted admin | Real invited households | Live RSVP and meal workflow |

Never copy the real production database into local development or staging. A
test household created in production for a launch pilot must be clearly marked
and removed before full distribution.

## Configuration

Local key names live in `.env.example`; values used by hosted deployments are
managed through Sites. Required policy values are:

- `ADMIN_EMAILS=dyotov2@gmail.com`
- `PUBLIC_SITE_URL=https://your-final-valid-domain.example`
- `WEDDING_WHATSAPP_URL`, `WEDDING_VIBER_URL`, and `WEDDING_PHONE_URL` once confirmed

The requested reply, wedding and deletion dates are seeded into D1 wedding
settings by reviewed migrations rather than duplicated as unused environment
variables. The application permits toggling only the meal phase; lifecycle
dates change only through a reviewed migration.

Public WhatsApp, Viber and phone actions are returned through the runtime
invitation payload and rendered only when valid contact URLs are configured.

## Domain and personal links

The couple's names may be displayed as “Ekaterina & Dimitar,” but `&` is not a
valid DNS hostname character. Use a valid hostname such as
`ekaterina-and-dimitar.example` or `ekaterinadimitar.example`.

Select and test the final canonical HTTPS domain before generating the delivery
pack or printing QR codes. The QR payload is the complete final personal URL,
not a staging address, temporary Sites URL, or URL shortener controlled by an
unrelated party.

## Privacy lifecycle

Private data includes the guest list, personal invitation credentials, RSVP
answers, notes, meal choices, response sources, exports, QR packs and backups.
These artifacts never enter Git.

The requested RSVP date is 1 January 2027. Late guest replies intentionally
remain possible so the couple can accommodate phone-first and older guests.
The scheduled deletion date for guest data
and every derived artifact is 27 June 2027. On that date the guest API stops
serving or changing invitation data. The allowlisted administrator then uses a
typed-confirmation purge to remove the D1 guest records and records only an
anonymous aggregate receipt. The deletion owner must also remove:

1. production household and guest records;
2. local and cloud exports;
3. generated QR and personal-link delivery packs;
4. database backups and restored copies; and
5. operational logs containing any accidental private payload.

After deletion, record only the date, person performing the deletion, systems
checked, and result. Do not preserve guest-level evidence in the deletion log.

## Release invariants

- The source contains no demonstration household or published example code.
- The database schema is changed only through committed migrations.
- Every write validates household ownership on the server.
- Admin authentication and email authorization are both enforced server-side.
- Staging and production data never share a D1 database.
- Deployments are tied to a reviewed Git commit and can be rolled back without
  discarding newer RSVP data.
