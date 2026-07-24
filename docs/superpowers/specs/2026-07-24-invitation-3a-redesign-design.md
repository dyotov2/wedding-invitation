# Design: Guest invitation "3A" redesign

## Goal
Recreate the "3A" guest-invitation design (from the `Design review: invitation variants` handoff — `Wedding Invitation.dc.html`) in the production Next.js app, wiring the new presentation to the **existing** data and logic layer. Do not ship the static prototype; treat its HTML as the source of truth for layout, colour, type, spacing, copy, and motion.

## Scope
Presentation only: `app/WeddingExperience.tsx` (guest experience) and the guest-facing rules in `app/globals.css`. Untouched: admin (`AdminExperience.tsx`), all APIs (`lib/server/wedding-api.ts`), the D1 schema, backup/restore, and the repository/CI guards. `MealSelection` keeps its working flow; only its entry point (the teaser) is restyled.

## Locked decisions
- **Ceremony time: 15:30** everywhere — the countdown target (`2027-06-20T15:30:00+03:00`), the program timeline, and the FAQ.
- **Meal section wired to real state**: the "menu is still blooming / opens in October" notice shows while `mealPhaseOpen` is false; the working "choose meals" path shows once admin opens it.
- **Faithful recreation, then suggest**: recreate pixel-closely; known issues the design reintroduces (rose/lavender eyebrow contrast, some sub-14px text, "We will attend" per-guest pronoun, placeholder booking URL) are recorded as post-build suggestions, not silently changed.

## Section map (prototype → production)
1. **Entry (View A)** — unchanged in spirit; heart-vine canvas (existing `HeartVine`), names, code input, privacy note. Keep SSR/no-JS entry.
2. **Nav** — 64px `1fr auto auto`: RSVP pill + "Change invitation". Wordmark button removed (also retires the earlier tap-to-lose-your-link trap).
3. **Hero** — eyebrow, script line, vertically stacked names with large italic ampersand, date·venue row, countdown, scroll cue, cream fade.
4. **RSVP** — progress bar ("N of M answered" + who's outstanding), guest cards with avatar initial + check badge, per-guest status, sticky save bar naming the unanswered guest. Wired to existing `updateGuest`, `save` (409 conflict + `loadLatest`), drafts, receipt, contacts.
5. **Meal notice** — coming-soon notice when closed; existing meal flow when open.
6. **Program** — vine timeline, 15:30 / 18:00 / 20:30.
7. **Venue** — animated day→sunset→night→festoon-lights→fireflies scene (16s loop), map card, dress code.
8. **Stay among the vines** — new: on-site + nearby accommodation cards; "Reserve a room" placeholder link.
9. **FAQ** — 6-item bordered list (arrival, children, parking, lodging, weather, dietary).
10. **Footer** — "Thank you for being part of our story."

## Non-negotiables (production correctness the prototype omits)
- Every new animation (16s scene, petals, botanical loops) respects `prefers-reduced-motion` via the existing motion system.
- Keep the `@supports not (color: oklch())` hex fallbacks and `vh` fallbacks before `svh` (design is OKLCH-only; older in-app WebViews need them). Any new raw OKLCH colour that is load-bearing gets a fallback too.
- Entry content stays server-rendered / readable without JS.
- No new hardcoded server-owned values: RSVP deadline and meal phase come from the invitation payload; only the ceremony time (15:30) and the "October" menu plan are copy.

## Verification
`npm run check` (lint, typecheck, repo guards, build, app tests) stays green. The two rendered-HTML SSR assertions must still pass (entry title, code label/button, no starter escape hatch). Drive the app to confirm the redesign renders (guest flow).

## Out of scope / follow-ups
Bulgarian/bilingual support; real "Reserve a room" URL; the accessibility suggestions produced in the reinspection.
