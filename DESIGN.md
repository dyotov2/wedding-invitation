# Wedding Invitation Design System

## Direction

The site should feel like opening a lavish, hand-finished invitation in a vineyard garden. It is romantic and alive, but never busy around a task. The emotional sections may bloom; the RSVP and meal forms stay calm, direct, and generous.

## Colour

- Paper: `oklch(97.5% 0.012 84)`
- Deep paper: `oklch(93% 0.026 86)`
- Garden ink: `oklch(29% 0.035 121)`
- Mulberry: `oklch(38% 0.055 326)`
- Sage: `oklch(58% 0.05 132)`
- Dark sage: `oklch(37% 0.052 130)`
- Rose: `oklch(63% 0.065 18)`
- Pastel fields: sage, lilac, blush, and champagne tints at 92–94% lightness

Use the full pastel palette in large atmospheric fields. Use dark sage or mulberry for text and actions. Never place pale grey text on a pastel background.

## Typography

- Display: Italiana, regular. Use for names, emotional headlines, times, and closing statements.
- Body and controls: Figtree. Use 16–18px for body copy and at least 14px for supporting text on phones.
- Eyebrows: short only, bold, tracked, and never below 13px.
- Body lines should remain below 65 characters where possible.

## Layout and Rhythm

- One dominant emotional idea per major section.
- Alternate dense botanical moments with quiet task areas.
- Use fluid spacing with `clamp()`, with 7–12rem between desktop chapters and 4–7rem on phones.
- Forms are single-column on phones. Every primary action spans the available width.
- Touch targets are at least 44px high.

## Botanicals

- Preserve the animated heart, the single invitation-hero bouquet, the program canopy, the venue garden, and the closing garden.
- Side vines may grow as the guest scrolls, but use only one botanical cluster per side.
- Do not decorate every section. RSVP is intentionally quiet.
- Use varied cluster, sprig, and corner assets. Avoid repeating the same crop in adjacent chapters.

## Motion

- Motion represents growth: stems draw, petals drift, and sections bloom into view.
- Use exponential ease-out and animate only transforms and opacity.
- Content must be visible without JavaScript and with reduced motion enabled.
- Keep ambient loops slow and subtle. Task controls do not float or pulse.

## Components

- Primary action: dark sage pill, white-tinted text, 60px minimum height.
- Secondary action: mulberry outline, 54px minimum height.
- RSVP choice: paired high-contrast buttons with icons, text, and `aria-pressed` state.
- Confirmation: quiet sage panel with a check mark, household name, and attending names.
- Contact action: real deep links only. Hide any channel until its real link is configured.
- Map: embedded in the venue chapter with a separate 44px-plus Google Maps link.

## Copy Rules

- Primary phrase: “Forever starts today.”
- Use “Love blooms” once as the central scroll interlude.
- Prefer warm, plain English. Avoid technical words and email-first instructions.
- Never claim a reply is saved until the server confirms it.
