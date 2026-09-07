import type { Lang } from "./copy";

const CYRILLIC = /[\u0400-\u04FF]/u;
const LETTERS = /\p{L}+/gu;

// Guest names are personal data, so they stay in the database exactly as the
// couple entered them. When a Bulgarian guest view is selected, this small
// deterministic fallback renders Latin names in Cyrillic without changing the
// RSVP identity or writing a second copy of every guest list into the repo.
const MULTI_LETTER_REPLACEMENTS: Array<[string, string]> = [
  ["sht", "щ"], ["sch", "щ"], ["zh", "ж"], ["sh", "ш"], ["ch", "ч"],
  ["ts", "ц"], ["tz", "ц"], ["yu", "ю"], ["ya", "я"], ["yo", "йо"],
  ["ye", "йе"], ["ju", "ю"], ["ja", "я"], ["je", "йе"], ["jo", "йо"],
  ["kh", "х"], ["ph", "ф"], ["th", "т"], ["qu", "кв"], ["ks", "кс"],
  ["oya", "оя"], ["ai", "ай"], ["ay", "ай"], ["ey", "ей"], ["oy", "ой"],
  ["au", "ау"], ["ou", "у"], ["x", "кс"],
];

const SINGLE_LETTER_REPLACEMENTS: Record<string, string> = {
  a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "г", h: "х",
  i: "и", j: "дж", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п",
  q: "к", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", y: "й", z: "з",
};

function transliterateWord(word: string): string {
  const lower = word.toLocaleLowerCase("en-US");
  let output = "";
  let index = 0;
  while (index < lower.length) {
    const replacement = MULTI_LETTER_REPLACEMENTS.find(([source]) => lower.startsWith(source, index));
    if (replacement) {
      output += replacement[1];
      index += replacement[0].length;
      continue;
    }
    output += SINGLE_LETTER_REPLACEMENTS[lower[index]] ?? lower[index];
    index += 1;
  }

  if (/^[A-Z]/u.test(word)) {
    return output.slice(0, 1).toLocaleUpperCase("bg-BG") + output.slice(1);
  }
  return output;
}

function transliteratePhrase(value: string): string {
  return value.replace(/[A-Za-z]+/gu, (word) => transliterateWord(word));
}

function folded(value: string): string {
  return value.toLocaleLowerCase("bg-BG").normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function householdNameMatch(transliterated: string, householdName: string): string | null {
  const words = householdName.match(LETTERS) ?? [];
  const target = folded(transliterated);
  if (!target || words.length === 0 || !words.some((word) => CYRILLIC.test(word))) return null;

  for (let size = words.length; size >= 1; size -= 1) {
    for (let start = 0; start + size <= words.length; start += 1) {
      const candidate = words.slice(start, start + size).join(" ");
      if (CYRILLIC.test(candidate) && folded(candidate) === target) return candidate;
    }
  }
  return null;
}

export function displayGuestName(name: string, lang: Lang, householdName = ""): string {
  if (lang !== "bg" || !name.trim() || CYRILLIC.test(name)) return name;
  const transliterated = transliteratePhrase(name);
  return householdNameMatch(transliterated, householdName) ?? transliterated;
}
