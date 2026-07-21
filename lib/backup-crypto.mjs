// Client-side backup encryption. Runs in the admin's browser so a downloaded backup
// is ciphertext at rest; the Worker never sees the passphrase or the encrypted file.
// Uses only Web Crypto + btoa/atob, which exist in browsers and in Node 22, so the
// round trip is unit-testable outside a browser.

export const BACKUP_KDF_ITERATIONS = 310_000;
export const BACKUP_KDF_ITERATIONS_MAX = 2_000_000;
export const BACKUP_PASSPHRASE_MIN_LENGTH = 12;
const ENCRYPTED_FORMAT = "wedding-backup-encrypted";
const ENCRYPTED_VERSION = 1;

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function deriveBackupKey(passphrase, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBackup(plaintext, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(passphrase, salt, BACKUP_KDF_ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext),
  );
  return JSON.stringify({
    format: ENCRYPTED_FORMAT,
    version: ENCRYPTED_VERSION,
    kdf: { algorithm: "PBKDF2-SHA-256", iterations: BACKUP_KDF_ITERATIONS, salt: bytesToBase64(salt) },
    cipher: "AES-256-GCM",
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(ciphertext)),
  });
}

export async function decryptBackup(fileText, passphrase) {
  let envelope;
  try {
    envelope = JSON.parse(fileText);
  } catch {
    throw new Error("That file is not an encrypted wedding backup.");
  }
  const kdf = envelope?.kdf;
  if (envelope?.format !== ENCRYPTED_FORMAT || envelope?.version !== ENCRYPTED_VERSION ||
    kdf?.algorithm !== "PBKDF2-SHA-256" || typeof kdf.iterations !== "number" ||
    kdf.iterations < 1 || kdf.iterations > BACKUP_KDF_ITERATIONS_MAX ||
    typeof kdf.salt !== "string" || typeof envelope.iv !== "string" || typeof envelope.data !== "string") {
    throw new Error("That file is not an encrypted wedding backup.");
  }
  const key = await deriveBackupKey(passphrase, base64ToBytes(kdf.salt), kdf.iterations);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(envelope.iv) }, key, base64ToBytes(envelope.data),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("The backup could not be decrypted. Check the passphrase and try again.");
  }
}
