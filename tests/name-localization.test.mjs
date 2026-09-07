import assert from "node:assert/strict";
import test from "node:test";

import { displayGuestName } from "../app/name-localization.ts";

test("Bulgarian display names prefer the household's Cyrillic spelling", () => {
  assert.equal(displayGuestName("Zhana", "bg", "Жана и Борис"), "Жана");
  assert.equal(displayGuestName("Boris", "bg", "Жана и Борис"), "Борис");
});

test("Bulgarian display names transliterate Latin fallback text", () => {
  assert.equal(displayGuestName("Nikol", "bg"), "Никол");
  assert.equal(displayGuestName("Nikol", "en"), "Nikol");
  assert.equal(displayGuestName("Никол", "bg"), "Никол");
});
