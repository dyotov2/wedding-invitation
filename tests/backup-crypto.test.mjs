import assert from "node:assert/strict";
import test from "node:test";
import { BACKUP_PASSPHRASE_MIN_LENGTH, decryptBackup, encryptBackup } from "../lib/backup-crypto.mjs";

const passphrase = "correct horse battery staple";

test("encrypt then decrypt returns the original backup, including payloads over one base64 chunk", async () => {
  // A realistic backup easily exceeds the 0x8000-byte chunk boundary in bytesToBase64.
  const backup = JSON.stringify({
    format: "wedding-backup",
    version: 1,
    tables: {
      guests: Array.from({ length: 4000 }, (_, index) => ({
        id: index + 1,
        name: `Guest Number ${index + 1} with a reasonably long name`,
        dietary_notes: "No nuts, no shellfish, step-free access please",
      })),
    },
  });
  assert.ok(new TextEncoder().encode(backup).byteLength > 0x8000, "fixture must exceed one base64 chunk");

  const encrypted = await encryptBackup(backup, passphrase);
  const envelope = JSON.parse(encrypted);
  assert.equal(envelope.format, "wedding-backup-encrypted");
  assert.equal(envelope.cipher, "AES-256-GCM");
  assert.notEqual(encrypted, backup);
  assert.doesNotMatch(encrypted, /Guest Number/u);

  const decrypted = await decryptBackup(encrypted, passphrase);
  assert.equal(decrypted, backup);
  assert.deepEqual(JSON.parse(decrypted).tables.guests.length, 4000);
});

test("each encryption uses a fresh salt and IV", async () => {
  const first = JSON.parse(await encryptBackup("same plaintext", passphrase));
  const second = JSON.parse(await encryptBackup("same plaintext", passphrase));
  assert.notEqual(first.salt ?? first.kdf.salt, second.kdf.salt);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.data, second.data);
});

test("a wrong passphrase fails to decrypt rather than returning garbage", async () => {
  const encrypted = await encryptBackup(JSON.stringify({ format: "wedding-backup", version: 1, tables: {} }), passphrase);
  await assert.rejects(() => decryptBackup(encrypted, "wrong passphrase entirely"), /could not be decrypted/u);
});

test("a non-envelope or tampered file is rejected before any key work", async () => {
  await assert.rejects(() => decryptBackup("not json at all", passphrase), /not an encrypted wedding backup/u);
  await assert.rejects(() => decryptBackup(JSON.stringify({ format: "something-else" }), passphrase), /not an encrypted wedding backup/u);
  const encrypted = JSON.parse(await encryptBackup("payload", passphrase));
  encrypted.kdf.iterations = 5_000_000; // above the accepted maximum
  await assert.rejects(() => decryptBackup(JSON.stringify(encrypted), passphrase), /not an encrypted wedding backup/u);
});

test("passphrase minimum length is a shared constant", () => {
  assert.equal(BACKUP_PASSPHRASE_MIN_LENGTH, 12);
});
