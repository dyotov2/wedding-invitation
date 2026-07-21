# Guest-list import

This workflow turns a private spreadsheet into one household record, one
personal link, and one invitation code per household. The guest list and every
generated delivery file remain outside Git.

## File format

Use UTF-8 CSV with one row per invited person. These columns form the import
contract:

| Column | Required | Meaning |
| --- | --- | --- |
| `household_external_id` | Yes | Stable private identifier shared by everyone receiving one invitation |
| `household_name` | Yes | Household label used in the admin view |
| `household_greeting` | No | Personal opening, such as `Dear Elena and Nikolay` |
| `guest_external_id` | Yes | Stable private identifier for one invited person |
| `guest_name` | Yes | Full display name of one invited person |
| `display_order` | No | Whole number controlling the order of people on the invitation |
| `guest_type` | No | `adult`, `child`, or `infant`; defaults to `adult` |

Template:

```csv
household_external_id,household_name,household_greeting,guest_external_id,guest_name,display_order,guest_type
HOUSEHOLD-001,The Sample Family,Dear Elena and Nikolay,GUEST-001,Elena Sample,1,adult
HOUSEHOLD-001,The Sample Family,Dear Elena and Nikolay,GUEST-002,Nikolay Sample,2,adult
HOUSEHOLD-002,Ms Example,Dear Maria,GUEST-003,Maria Example,1,adult
```

The values above are synthetic examples. Do not save a filled template inside
the repository.

## Grouping rules

- `household_external_id` is the household idempotency key and must remain stable across imports.
- `guest_external_id` is the guest idempotency key and must remain stable across imports.
- External IDs are canonicalized to uppercase and enforced case-insensitively in D1.
- Every row sharing a `household_external_id` must have the same household name and greeting.
- One person appears once in a household.
- A household may contain at most 30 invited people.
- A household receives one credential and one personal URL, regardless of the
  number of invited people.
- Changing display text must not rotate an already distributed credential.
- Removing a guest after invitations are distributed requires an explicit
  review because it changes what that household sees.

## Validation before import

The importer performs a dry run and writes no household or guest records until
the operator approves the summary. It stores only a short-lived, admin-bound
preview token and source checksum so a commit cannot bypass review. It rejects:

- missing required columns or values;
- duplicate header names;
- duplicate `guest_external_id` values;
- conflicting household names within one household;
- spreadsheet formulas in imported cells;
- more guests in a household than the application's supported limit;
- control characters or text that cannot be normalized safely; and
- an import that would unexpectedly remove or rotate existing invitations.

Trim surrounding whitespace, normalize line endings, preserve human names and
diacritics, compare channels case-insensitively, and report source row numbers
for every error. Never silently merge ambiguous households.

## Credential and URL generation

Generate credentials with a cryptographically secure random source. Codes must
be case-insensitive, avoid visually ambiguous characters, and contain enough
entropy to resist guessing. Check uniqueness in D1 before accepting a code.

The canonical personal URL has this shape:

```text
https://FINAL-DOMAIN.example/#invite=RANDOM-PERSONAL-TOKEN
```

An ampersand is invalid in a DNS hostname. Decide and test the final production
domain before generating URLs or QR codes. Never encode a staging URL in a
printed card.

## Import procedure

1. Copy the original spreadsheet into an encrypted working location outside
   the repository.
2. Export UTF-8 CSV and verify the header contract.
3. Create and checksum a production D1 backup.
4. Run the importer in dry-run mode.
5. Resolve every reported error and review counts by household and guest.
6. Approve the import against the expected totals.
7. Apply the idempotent import as a database batch.
8. Export the delivery pack to an encrypted location outside Git.
9. Open a sample of one-person, multi-person, long-name and diacritic links.
10. Reconcile database and delivery-pack counts before sending anything.

## Delivery export

The private delivery export contains:

- `household_external_id`;
- `household_name`;
- invited names;
- invitation code;
- complete canonical personal URL;
- active status.

The complete personal URL is also the QR payload. Delivery channel, sent/not
sent status and private delivery notes belong in the couple's separate private
planning sheet; this application does not import or store them in its first
release.

Do not include dietary notes, RSVP answers or meal choices in the delivery
pack. If rendered QR images are generated, store them in an encrypted
`qr-packs` location outside the repository and delete them on 27 June 2027.

## Idempotent updates

A repeat import of the unchanged file must produce zero duplicate households,
zero duplicate guests, and zero rotated credentials. The dry run reports
creates, safe updates, unchanged rows, omissions and conflicts separately.
Imports are safe merges: existing records omitted from a file remain active and
are reported, never silently deleted. A case-only external-ID change resolves to
the same record.

Any operation that deletes a guest, merges households, splits a household, or
rotates a live credential requires explicit confirmation and a fresh backup.
Moving an existing guest ID to another household is rejected by the normal
importer because it could disclose a previous RSVP or dietary note.

## Reconciliation record

Record only operational totals and checksums in the release record:

```text
Import time:
Input checksum:
Households expected / imported:
Guests expected / imported:
Creates / updates / unchanged / conflicts:
Delivery rows generated:
Operator:
```

The record must not contain names, phone numbers, invitation codes or URLs.
