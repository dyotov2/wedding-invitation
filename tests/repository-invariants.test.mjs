import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".vinext",
  ".wrangler",
  "backups",
  "dist",
  "exports",
  "guest-lists",
  "imports",
  "node_modules",
  "outputs",
  "private",
  "qr-packs",
  "work",
]);

async function text(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function collectFiles(directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    if (entry.name.startsWith(".env") && entry.name !== ".env.example") continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

test("package and repository describe the wedding product, not the starter", async () => {
  const [packageJson, packageLock, readme] = await Promise.all([
    text("package.json"),
    text("package-lock.json"),
    text("README.md"),
  ]);
  const packageData = JSON.parse(packageJson);
  const lockData = JSON.parse(packageLock);

  assert.equal(packageData.name, "ekaterina-dimitar-wedding-invitation");
  assert.equal(lockData.name, packageData.name);
  assert.equal(lockData.packages[""].name, packageData.name);
  assert.equal(packageData.scripts.typecheck, "tsc --noEmit");
  assert.ok(packageData.scripts.check);
  assert.ok(packageData.scripts["test:repo"]);
  assert.ok(packageData.scripts["test:app"]);
  assert.match(readme, /^# Ekaterina & Dimitar wedding invitation/m);
  assert.doesNotMatch(`${packageJson}\n${readme}`, /site-creator-vinext-starter|# vinext-starter/i);
});

test("D1 binding and committed migrations are present", async () => {
  const hosting = JSON.parse(await text(".openai/hosting.json"));
  assert.equal(hosting.d1, "DB");

  const migrationFiles = (await readdir(path.join(root, "drizzle")))
    .filter((name) => /^\d+_.+\.sql$/.test(name));
  assert.ok(migrationFiles.length > 0, "at least one numbered D1 migration is required");

  for (const migration of migrationFiles) {
    const sql = await text(path.join("drizzle", migration));
    assert.match(sql, /\b(?:CREATE|ALTER|INSERT|DROP|PRAGMA)\b/i, `${migration} must contain SQL`);
  }
});

test("production policy is documented consistently", async () => {
  const [environment, readme, product, design, architecture, importGuide, runbook] = await Promise.all([
    text(".env.example"),
    text("README.md"),
    text("PRODUCT.md"),
    text("DESIGN.md"),
    text("docs/architecture.md"),
    text("docs/guest-list-import.md"),
    text("docs/backup-and-rollback.md"),
  ]);
  const policy = [environment, readme, product, architecture, runbook].join("\n");

  assert.match(environment, /^ADMIN_EMAILS=dyotov2@gmail\.com$/m);
  assert.match(policy, /dyotov2@gmail\.com/);
  assert.match(policy, /2027-01-01/);
  assert.match(policy, /2027-06-27/);
  assert.doesNotMatch(environment, /^WEDDING_(?:RSVP_DEADLINE|DATA_DELETE_AFTER)=/m);
  assert.match(design, /reply by 1 January 2027/i);
  assert.match(importGuide, /household_external_id,household_name,household_greeting,guest_external_id,guest_name,display_order,guest_type/);
  assert.match(`${readme}\n${architecture}\n${importGuide}`, /ampersand .*not valid|&.*not valid.*hostname/is);
  assert.match(`${readme}\n${architecture}\n${importGuide}`, /final canonical.*before.*QR/is);
});

test("ignore rules protect private wedding artifacts", async () => {
  const gitignore = await text(".gitignore");
  const requiredRules = [
    "!.env.example",
    "/imports/",
    "/exports/",
    "/guest-lists/",
    "/qr-packs/",
    "/backups/",
    "/private/",
    "*.csv",
    "*.xlsx",
    "*.sqlite",
    "*.db",
  ];
  for (const rule of requiredRules) {
    assert.ok(gitignore.split(/\r?\n/).includes(rule), `missing private-data ignore rule: ${rule}`);
  }

  const files = await collectFiles();
  const privateArtifact = /(?:^|\/)(?:imports|exports|guest-lists|qr-packs|backups|private)\/|\.(?:csv|tsv|xls|xlsx|numbers|sqlite3?|db|backup)$/i;
  const violations = files
    .map((file) => path.relative(root, file).replaceAll(path.sep, "/"))
    .filter((file) => privateArtifact.test(file));
  assert.deepEqual(violations, [], `private artifacts found in repository surface: ${violations.join(", ")}`);
});

test("repository contains no obvious committed credentials", async () => {
  const files = await collectFiles();
  const textExtensions = new Set([".css", ".example", ".html", ".js", ".json", ".md", ".mjs", ".sql", ".ts", ".tsx", ".yaml", ".yml"]);
  const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\bCLOUDFLARE_API_TOKEN\s*[:=]\s*["']?[^\s"']{8,}/,
  ];
  const violations = [];

  for (const file of files) {
    if (path.basename(file) === "package-lock.json") continue;
    if (!textExtensions.has(path.extname(file))) continue;
    const contents = await readFile(file, "utf8");
    if (secretPatterns.some((pattern) => pattern.test(contents))) {
      violations.push(path.relative(root, file));
    }
  }

  assert.deepEqual(violations, [], `possible credentials found in: ${violations.join(", ")}`);
});

test("production source contains no demo household, runtime DDL, or stale deadline", async () => {
  const [guestExperience, worker, weddingApi] = await Promise.all([
    text("app/WeddingExperience.tsx"),
    text("worker/index.ts"),
    text("lib/server/wedding-api.ts"),
  ]);
  const productionSource = `${guestExperience}\n${worker}`;
  const serverSource = `${worker}\n${weddingApi}`;

  assert.equal(
    /ROSE27|Petrov Family|demoHousehold|Preview with code/i.test(productionSource),
    false,
    "remove every demonstration household and published example credential",
  );
  assert.equal(
    /CREATE TABLE IF NOT EXISTS/i.test(serverSource),
    false,
    "production requests must not perform runtime schema creation",
  );
  assert.equal(/ADMIN_EMAILS/.test(serverSource), true, "admin APIs must use the hosted email allowlist");
  assert.equal(/20 April 2027/i.test(guestExperience), false, "remove the superseded RSVP deadline");
  assert.equal(/1 January 2027/i.test(guestExperience), true, "show the approved RSVP deadline");
});

test("admin Save guest list validates and commits without a separate preview click", async () => {
  const adminSource = await text("app/AdminExperience.tsx");
  const previewStart = adminSource.indexOf("const requestEditorPreview");
  const saveStart = adminSource.indexOf("const saveEditor");
  const saveEnd = adminSource.indexOf("const previewImport", saveStart);

  assert.ok(previewStart >= 0 && saveStart > previewStart && saveEnd > saveStart);
  const previewBlock = adminSource.slice(previewStart, saveStart);
  const saveBlock = adminSource.slice(saveStart, saveEnd);
  assert.match(previewBlock, /mode:\s*"preview"/);
  assert.match(saveBlock, /requestEditorPreview\(rows\)/);
  assert.match(saveBlock, /mode:\s*"commit"/);
  assert.match(adminSource, /onClick=\{\(\) => void saveEditor\(\)\} disabled=\{!editorHasChanges \|\| editorBusy\}/);
});
