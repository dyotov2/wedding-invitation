const SHORT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateLinkToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function generateShortCode(length = 10): string {
  const output: string[] = [];
  const maxAcceptedByte = Math.floor(256 / SHORT_CODE_ALPHABET.length) * SHORT_CODE_ALPHABET.length;

  while (output.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const byte of bytes) {
      if (byte >= maxAcceptedByte) continue;
      output.push(SHORT_CODE_ALPHABET[byte % SHORT_CODE_ALPHABET.length]);
      if (output.length === length) break;
    }
  }

  return output.join("");
}

export function normalizeCredential(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 128) return null;

  const possibleShortCode = trimmed.replace(/[\s-]/gu, "").toUpperCase();
  if (/^[A-HJ-NP-Z2-9]{10}$/u.test(possibleShortCode)) return possibleShortCode;
  if (/^[A-Za-z0-9_-]{32,128}$/u.test(trimmed)) return trimmed;
  return null;
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
