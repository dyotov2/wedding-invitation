import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

class PreparedStatement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new PreparedStatement(this.database, this.sql, values);
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.values) ?? null;
  }

  async all() {
    const results = this.database.prepare(this.sql).all(...this.values);
    return { success: true, results, meta: { changes: 0 } };
  }

  async run() {
    return this.runSync();
  }

  runSync() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return {
      success: true,
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }
}

class TestD1 {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new PreparedStatement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => {
        // Classify by write keyword so read queries (SELECT, or a WITH ... SELECT CTE)
        // return rows like real D1 does, rather than only detecting a leading SELECT.
        const isWrite = /^\s*(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/iu.test(statement.sql);
        if (!isWrite) {
          const rows = this.database.prepare(statement.sql).all(...statement.values);
          return { success: true, results: rows, meta: { changes: 0 } };
        }
        return statement.runSync();
      });
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const migrationNames = (await readdir(new URL("../drizzle/", import.meta.url)))
    .filter((name) => /^\d+_.+\.sql$/u.test(name))
    .sort();
  for (const name of migrationNames) {
    database.exec(await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8"));
  }
  database.exec("PRAGMA foreign_keys = ON");
  return { database, d1: new TestD1(database) };
}

async function migrationNames() {
  return (await readdir(new URL("../drizzle/", import.meta.url)))
    .filter((name) => /^\d+_.+\.sql$/u.test(name))
    .sort();
}

async function applyMigration(database, name) {
  database.exec(await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8"));
  database.exec("PRAGMA foreign_keys = ON");
}

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("api-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

function apiRequest(worker, d1, pathname, { method = "GET", body, email, origin = "http://localhost", ip = "203.0.113.10" } = {}) {
  const headers = new Headers({ accept: "application/json", "cf-connecting-ip": ip });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (email) headers.set("oai-authenticated-user-email", email);
  if (origin) headers.set("origin", origin);
  return worker.fetch(new Request(`http://localhost${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }), {
    DB: d1,
    ADMIN_EMAILS: "dyotov2@gmail.com",
    PUBLIC_SITE_URL: "https://ekaterina-dimitar.example",
    WEDDING_WHATSAPP_URL: "https://wa.me/359000000000",
  }, { waitUntil() {}, passThroughOnException() {} });
}

const rows = [
  {
    householdExternalId: "HOUSEHOLD-001",
    householdName: "The Sample Family",
    householdGreeting: "Dear Elena and Nikolay",
    guestExternalId: "GUEST-001",
    guestName: "Elena Sample",
    displayOrder: 1,
    guestType: "adult",
  },
  {
    householdExternalId: "HOUSEHOLD-001",
    householdName: "The Sample Family",
    householdGreeting: "Dear Elena and Nikolay",
    guestExternalId: "GUEST-002",
    guestName: "Nikolay Sample",
    displayOrder: 2,
    guestType: "adult",
  },
  {
    householdExternalId: "HOUSEHOLD-002",
    householdName: "Ms Example",
    householdGreeting: "Dear Maria",
    guestExternalId: "GUEST-003",
    guestName: "Maria Example",
    displayOrder: 1,
    guestType: "adult",
  },
];

test("legacy households and replies survive the production schema upgrade", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const names = await migrationNames();
  await applyMigration(database, names[0]);
  await applyMigration(database, names[1]);
  database.prepare("INSERT INTO households (id, code, household_name) VALUES (?, ?, ?)").run(10, "REAL42", "Legacy Household");
  database.prepare(`INSERT INTO guests
    (id, household_id, name, attendance, dietary_notes, meal_choice, response_source)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(20, 10, "Legacy Guest", "attending", "Gluten free", "garden", "phone");
  database.prepare("INSERT INTO households (id, code, household_name) VALUES (?, ?, ?)").run(11, "ROSE27", "The Petrov Family");
  database.prepare("INSERT INTO guests (id, household_id, name) VALUES (?, ?, ?)").run(21, 11, "Demo Guest");
  for (const name of names.slice(2)) await applyMigration(database, name);

  const preserved = database.prepare(`SELECT h.short_code AS code, h.household_name AS householdName,
    g.name, g.attendance, g.dietary_notes AS dietaryNotes, g.meal_choice AS mealChoice, g.response_source AS responseSource
    FROM guests g JOIN households h ON h.id = g.household_id`).all();
  assert.equal(preserved.length, 1);
  assert.match(preserved[0].code, /^[A-HJ-NP-Z2-9]{10}$/u);
  assert.deepEqual({ ...preserved[0], code: "<rotated>" }, {
    code: "<rotated>",
    householdName: "Legacy Household",
    name: "Legacy Guest",
    attendance: "attending",
    dietaryNotes: "Gluten free",
    mealChoice: "garden",
    responseSource: "phone",
  });
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("guest-list import, household RSVP, meal phase and exports persist safely", async () => {
  const worker = await loadWorker();
  const { database, d1 } = await migratedDatabase();
  const admin = { email: "dyotov2@gmail.com", method: "POST" };

  const denied = await apiRequest(worker, d1, "/api/admin", { email: "someone@example.com", origin: undefined });
  assert.equal(denied.status, 403);

  const unpreviewed = await apiRequest(worker, d1, "/api/admin/import", {
    ...admin,
    body: { mode: "commit", rows, sourceName: "guests.csv" },
  });
  assert.equal(unpreviewed.status, 409);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM households").get().count, 0);

  const previewResponse = await apiRequest(worker, d1, "/api/admin/import", {
    ...admin,
    body: { mode: "preview", rows, sourceName: "guests.csv" },
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.summary.householdCount, 2);
  assert.equal(preview.summary.guestCount, 3);
  assert.match(preview.previewToken, /^[A-Za-z0-9_-]{32,128}$/u);

  const hashWithoutPreviewToken = await apiRequest(worker, d1, "/api/admin/import", {
    ...admin,
    body: { mode: "commit", rows, sourceName: "guests.csv", sourceHash: preview.sourceHash },
  });
  assert.equal(hashWithoutPreviewToken.status, 409);

  const importResponse = await apiRequest(worker, d1, "/api/admin/import", {
    ...admin,
    body: { mode: "commit", rows, sourceName: "guests.csv", sourceHash: preview.sourceHash, previewToken: preview.previewToken },
  });
  assert.equal(importResponse.status, 200);
  await importResponse.json();
  const firstCredential = database.prepare(`SELECT link_token AS linkToken, short_code AS shortCode
    FROM households WHERE external_id = 'HOUSEHOLD-001'`).get();
  assert.match(firstCredential.shortCode, /^[A-HJ-NP-Z2-9]{10}$/u);

  const rowsWithIgnoredActiveFlags = rows.map((row) => ({ ...row, householdActive: false, guestActive: false }));
  const repeatedPreviewResponse = await apiRequest(worker, d1, "/api/admin/import", {
    ...admin,
    body: { mode: "preview", rows: rowsWithIgnoredActiveFlags, sourceName: "guests.csv" },
  });
  const repeatedPreview = await repeatedPreviewResponse.json();
  const repeatedResponse = await apiRequest(worker, d1, "/api/admin/import", {
    ...admin,
    body: { mode: "commit", rows: rowsWithIgnoredActiveFlags, sourceName: "guests.csv", sourceHash: repeatedPreview.sourceHash, previewToken: repeatedPreview.previewToken },
  });
  assert.equal(repeatedResponse.status, 200);
  const repeated = await repeatedResponse.json();
  assert.equal(repeated.summary.idempotent, true);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM households").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM guests").get().count, 3);
  assert.equal(database.prepare("SELECT MIN(active) AS allActive FROM guests").get().allActive, 1);

  const changedRows = rows.map((row) => row.guestExternalId === "GUEST-001" ? { ...row, guestName: "Elena Changed" } : row);
  const changedPreviewResponse = await apiRequest(worker, d1, "/api/admin/import", {
    ...admin,
    body: { mode: "preview", rows: changedRows, sourceName: "changed.csv" },
  });
  const changedPreview = await changedPreviewResponse.json();
  const changedImport = await apiRequest(worker, d1, "/api/admin/import", {
    ...admin,
    body: { mode: "commit", rows: changedRows, sourceName: "changed.csv", sourceHash: changedPreview.sourceHash, previewToken: changedPreview.previewToken },
  });
  assert.equal(changedImport.status, 200);
  assert.equal(database.prepare("SELECT name FROM guests WHERE external_id = 'GUEST-001'").get().name, "Elena Changed");

  const restorePreviewResponse = await apiRequest(worker, d1, "/api/admin/import", {
    ...admin,
    body: { mode: "preview", rows, sourceName: "guests.csv" },
  });
  const restorePreview = await restorePreviewResponse.json();
  assert.equal(restorePreview.sourceHash, preview.sourceHash);
  const restoreImport = await apiRequest(worker, d1, "/api/admin/import", {
    ...admin,
    body: { mode: "commit", rows, sourceName: "guests.csv", sourceHash: restorePreview.sourceHash, previewToken: restorePreview.previewToken },
  });
  assert.equal(restoreImport.status, 200);
  assert.equal((await restoreImport.json()).summary.idempotent, false);
  assert.equal(database.prepare("SELECT name FROM guests WHERE external_id = 'GUEST-001'").get().name, "Elena Sample");

  const casePreviewResponse = await apiRequest(worker, d1, "/api/admin/import", {
    ...admin,
    body: { mode: "preview", rows: rows.map((row) => ({
      ...row,
      householdExternalId: row.householdExternalId.toLowerCase(),
      guestExternalId: row.guestExternalId.toLowerCase(),
    })), sourceName: "case-only.csv" },
  });
  assert.equal(casePreviewResponse.status, 200);
  assert.equal((await casePreviewResponse.json()).summary.householdsToCreate, 0);
  assert.throws(() => database.prepare(`INSERT INTO households
    (external_id, link_token, short_code, household_name) VALUES (?, ?, ?, ?)`)
    .run("household-001", "another-valid-lowercase-token-1234567890", "ABCDEFGH23", "Duplicate Case"));

  const movedGuestPreview = await apiRequest(worker, d1, "/api/admin/import", {
    ...admin,
    body: { mode: "preview", rows: rows.map((row) => row.guestExternalId === "GUEST-001"
      ? { ...row, householdExternalId: "HOUSEHOLD-002", householdName: "Ms Example", householdGreeting: "Dear Maria" }
      : row), sourceName: "unsafe-move.csv" },
  });
  assert.equal(movedGuestPreview.status, 400);
  assert.match(JSON.stringify(await movedGuestPreview.json()), /already belongs to another household/iu);

  const token = firstCredential.linkToken;
  const invitationResponse = await apiRequest(worker, d1, "/api/invitation", {
    method: "POST",
    body: { credential: token },
    origin: undefined,
  });
  assert.equal(invitationResponse.status, 200);
  const invitation = await invitationResponse.json();
  assert.equal(invitation.household.credential, undefined);
  assert.equal(invitation.household.greeting, "Dear Elena and Nikolay");
  assert.deepEqual(invitation.mealOptions.map((option) => option.optionKey), ["garden", "estate", "little"]);
  assert.deepEqual(invitation.contacts, [{ key: "whatsapp", href: "https://wa.me/359000000000" }]);
  assert.deepEqual(invitation.household.guests.map((guest) => guest.name), ["Elena Sample", "Nikolay Sample"]);

  const [elena, nikolay] = invitation.household.guests;
  const rsvpResponse = await apiRequest(worker, d1, "/api/rsvp", {
    method: "POST",
    origin: undefined,
    body: {
      credential: token,
      responseVersion: invitation.household.responseVersion,
      guests: [
        { id: elena.id, attendance: "attending", dietaryNotes: "No nuts" },
        { id: nikolay.id, attendance: "declined", dietaryNotes: "" },
      ],
    },
  });
  assert.equal(rsvpResponse.status, 200);
  const savedRsvp = await rsvpResponse.json();
  assert.equal(savedRsvp.household.responseVersion, invitation.household.responseVersion + 1);
  assert.equal(savedRsvp.household.guests[0].dietaryNotes, "No nuts");

  const staleResponse = await apiRequest(worker, d1, "/api/rsvp", {
    method: "POST",
    origin: undefined,
    body: {
      credential: token,
      responseVersion: 0,
      guests: [
        { id: elena.id, attendance: "declined", dietaryNotes: "" },
        { id: nikolay.id, attendance: "declined", dietaryNotes: "" },
      ],
    },
  });
  assert.equal(staleResponse.status, 409);

  const closedMealResponse = await apiRequest(worker, d1, "/api/meals", {
    method: "POST",
    origin: undefined,
    body: {
      credential: token,
      responseVersion: savedRsvp.household.responseVersion,
      guests: [{ id: elena.id, mealChoice: "garden" }],
    },
  });
  assert.equal(closedMealResponse.status, 403);

  const openMeals = await apiRequest(worker, d1, "/api/admin/settings", {
    ...admin,
    body: { mealPhaseOpen: true },
  });
  assert.equal(openMeals.status, 200);
  const mealResponse = await apiRequest(worker, d1, "/api/meals", {
    method: "POST",
    origin: undefined,
    body: {
      credential: token,
      responseVersion: savedRsvp.household.responseVersion,
      guests: [{ id: elena.id, mealChoice: "garden" }],
    },
  });
  assert.equal(mealResponse.status, 200);

  const closeMeals = await apiRequest(worker, d1, "/api/admin/settings", {
    ...admin,
    body: { mealPhaseOpen: false },
  });
  assert.equal(closeMeals.status, 200);
  const manualNoteWithClosedMeals = await apiRequest(worker, d1, "/api/admin/reply", {
    ...admin,
    body: { guestId: elena.id, attendance: "attending", responseSource: "whatsapp", dietaryNotes: "No nuts · aisle seat", mealChoice: "garden" },
  });
  assert.equal(manualNoteWithClosedMeals.status, 200);
  assert.deepEqual({ ...database.prepare(`SELECT response_source AS responseSource,
    dietary_notes AS dietaryNotes, meal_choice AS mealChoice FROM guests WHERE id = ?`).get(elena.id) }, {
    responseSource: "whatsapp", dietaryNotes: "No nuts · aisle seat", mealChoice: "garden",
  });

  const planningExport = await apiRequest(worker, d1, "/api/admin/export", { ...admin });
  const planningCsv = await planningExport.text();
  assert.equal(planningExport.status, 200);
  assert.match(planningCsv, /No nuts/u);
  assert.doesNotMatch(planningCsv, new RegExp(firstCredential.shortCode, "u"));

  const deliveryExport = await apiRequest(worker, d1, "/api/admin/delivery-export", { ...admin });
  const deliveryCsv = await deliveryExport.text();
  assert.equal(deliveryExport.status, 200);
  assert.match(deliveryCsv, new RegExp(firstCredential.shortCode, "u"));
  assert.match(deliveryCsv, /^.*https:\/\/ekaterina-dimitar\.example\/#invite=/mu);

  const reloaded = await apiRequest(worker, d1, "/api/invitation", {
    method: "POST",
    body: { credential: token },
    origin: undefined,
  });
  const reloadedInvitation = await reloaded.json();
  assert.equal(reloadedInvitation.household.guests[0].mealChoice, "garden");
  assert.equal(reloadedInvitation.household.guests[1].attendance, "declined");

  const reopenMeals = await apiRequest(worker, d1, "/api/admin/settings", {
    ...admin,
    body: { mealPhaseOpen: true },
  });
  assert.equal(reopenMeals.status, 200);

  const maria = database.prepare("SELECT id FROM guests WHERE external_id = 'GUEST-003'").get();
  const manualReply = await apiRequest(worker, d1, "/api/admin/reply", {
    ...admin,
    body: { guestId: maria.id, attendance: "attending", responseSource: "phone", dietaryNotes: "Step-free access", mealChoice: "estate" },
  });
  assert.equal(manualReply.status, 200);
  assert.deepEqual({ ...database.prepare(`SELECT attendance, response_source AS responseSource,
    dietary_notes AS dietaryNotes, meal_choice AS mealChoice FROM guests WHERE id = ?`).get(maria.id) }, {
    attendance: "attending", responseSource: "phone", dietaryNotes: "Step-free access", mealChoice: "estate",
  });

  const auditActions = database.prepare("SELECT action FROM audit_events").all().map((row) => row.action);
  assert.ok(auditActions.includes("wedding_planning.exported"));
  assert.ok(auditActions.includes("invitation_delivery.exported"));

  database.prepare("UPDATE wedding_settings SET deletion_date = '2020-01-01' WHERE id = 1").run();
  const expiredMealConflict = await apiRequest(worker, d1, "/api/meals", {
    method: "POST",
    origin: undefined,
    ip: "203.0.113.77",
    body: { credential: token, responseVersion: 0, guests: [{ id: elena.id, mealChoice: "garden" }] },
  });
  assert.equal(expiredMealConflict.status, 410);
  const expiredAdminResponse = await apiRequest(worker, d1, "/api/admin", { email: admin.email, origin: undefined });
  assert.equal(expiredAdminResponse.status, 200);
  const expiredAdmin = await expiredAdminResponse.json();
  assert.equal(expiredAdmin.retentionClosed, true);
  assert.equal(expiredAdmin.retentionReceipt, null);
  assert.deepEqual(expiredAdmin.households, []);
  assert.doesNotMatch(JSON.stringify(expiredAdmin), /Elena|No nuts|Step-free access/u);
  const purge = await apiRequest(worker, d1, "/api/admin/retention/purge", {
    ...admin,
    body: { confirmation: "DELETE WEDDING GUEST DATA", deletionDate: "2020-01-01" },
  });
  assert.equal(purge.status, 200);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM households").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM guests").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM retention_receipts").get().count, 1);
  const closedAdminResponse = await apiRequest(worker, d1, "/api/admin", { email: admin.email, origin: undefined });
  assert.equal(closedAdminResponse.status, 200);
  const closedAdmin = await closedAdminResponse.json();
  assert.equal(closedAdmin.retentionClosed, true);
  assert.ok(closedAdmin.retentionReceipt?.receiptId);
  assert.deepEqual(closedAdmin.households, []);
  const postPurgeImport = await apiRequest(worker, d1, "/api/admin/import", {
    ...admin,
    body: { mode: "preview", rows, sourceName: "must-not-return.csv" },
  });
  assert.equal(postPurgeImport.status, 410);
  const postPurgeExport = await apiRequest(worker, d1, "/api/admin/export", { ...admin });
  assert.equal(postPurgeExport.status, 410);
  const postPurgeReply = await apiRequest(worker, d1, "/api/admin/reply", {
    ...admin,
    body: { guestId: maria.id, attendance: "attending", responseSource: "phone", dietaryNotes: "", mealChoice: "" },
  });
  assert.equal(postPurgeReply.status, 410);
  const postPurgeBackup = await apiRequest(worker, d1, "/api/admin/backup", { ...admin });
  assert.equal(postPurgeBackup.status, 410);
  const postPurgeRestore = await apiRequest(worker, d1, "/api/admin/restore", {
    ...admin,
    body: { confirmation: "RESTORE WEDDING GUEST DATA", backup: { format: "wedding-backup", version: 1, tables: {} } },
  });
  assert.equal(postPurgeRestore.status, 410, "restore must not resurrect purged guest data");

  database.close();
});

test("invitation lookup throttling blocks even a later valid credential", async () => {
  const worker = await loadWorker();
  const { database, d1 } = await migratedDatabase();
  database.prepare(`INSERT INTO households
    (external_id, link_token, short_code, household_name) VALUES (?, ?, ?, ?)`)
    .run("RATE-HOUSEHOLD", "valid-rate-token", "VALIDRATE2", "Rate Test");
  const householdId = database.prepare("SELECT id FROM households WHERE external_id = 'RATE-HOUSEHOLD'").get().id;
  database.prepare(`INSERT INTO guests (external_id, household_id, name) VALUES (?, ?, ?)`)
    .run("RATE-GUEST", householdId, "Rate Guest");

  let response;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    response = await apiRequest(worker, d1, "/api/invitation", {
      method: "POST",
      body: { credential: "ABCDEFGH23" },
      origin: undefined,
      ip: "203.0.113.55",
    });
  }
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "600");
  const validAfterLimit = await apiRequest(worker, d1, "/api/invitation", {
    method: "POST",
    body: { credential: "valid-rate-token" },
    origin: undefined,
    ip: "203.0.113.55",
  });
  assert.equal(validAfterLimit.status, 429);
  database.close();
});

test("successful invitation opens never count toward the shared throttle", async () => {
  const worker = await loadWorker();
  const { database, d1 } = await migratedDatabase();
  database.prepare(`INSERT INTO households
    (external_id, link_token, short_code, household_name) VALUES (?, ?, ?, ?)`)
    .run("GATHERING-HOUSEHOLD", "valid-gathering-token-abcdefgh1234567890", "VALIDGATH2", "Gathering Test");
  const householdId = database.prepare("SELECT id FROM households WHERE external_id = 'GATHERING-HOUSEHOLD'").get().id;
  database.prepare("INSERT INTO guests (external_id, household_id, name) VALUES (?, ?, ?)")
    .run("GATHERING-GUEST", householdId, "Gathering Guest");

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await apiRequest(worker, d1, "/api/invitation", {
      method: "POST",
      body: { credential: "valid-gathering-token-abcdefgh1234567890" },
      origin: undefined,
      ip: "203.0.113.99",
    });
    assert.equal(response.status, 200, `valid open ${attempt + 1} must not be throttled`);
  }
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM invitation_lookup_limits").get().count, 0);

  const invalidAfterSuccesses = await apiRequest(worker, d1, "/api/invitation", {
    method: "POST",
    body: { credential: "ABCDEFGH23" },
    origin: undefined,
    ip: "203.0.113.99",
  });
  assert.equal(invalidAfterSuccesses.status, 404);
  database.close();
});

test("a few mistyped codes never block a valid open from the same venue IP", async () => {
  const worker = await loadWorker();
  const { database, d1 } = await migratedDatabase();
  database.prepare(`INSERT INTO households
    (external_id, link_token, short_code, household_name) VALUES (?, ?, ?, ?)`)
    .run("VENUE-HOUSEHOLD", "valid-venue-token-abcdefgh1234567890", "VALIDVEN23", "Venue Test");
  const householdId = database.prepare("SELECT id FROM households WHERE external_id = 'VENUE-HOUSEHOLD'").get().id;
  database.prepare("INSERT INTO guests (external_id, household_id, name) VALUES (?, ?, ?)")
    .run("VENUE-GUEST", householdId, "Venue Guest");

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const mistyped = await apiRequest(worker, d1, "/api/invitation", {
      method: "POST", body: { credential: "WRNGCDEF23" }, origin: undefined, ip: "203.0.113.44",
    });
    assert.equal(mistyped.status, 404);
  }
  const validOpen = await apiRequest(worker, d1, "/api/invitation", {
    method: "POST", body: { credential: "valid-venue-token-abcdefgh1234567890" }, origin: undefined, ip: "203.0.113.44",
  });
  assert.equal(validOpen.status, 200, "10 failures (under the 24 cap) must not block a valid open");
  database.close();
});

test("encrypted-backup snapshot restores households, guests and replies exactly", async () => {
  const worker = await loadWorker();
  const { database, d1 } = await migratedDatabase();
  const admin = { email: "dyotov2@gmail.com", method: "POST" };

  const preview = await (await apiRequest(worker, d1, "/api/admin/import", {
    ...admin,
    body: { mode: "preview", rows, sourceName: "guests.csv" },
  })).json();
  const importResponse = await apiRequest(worker, d1, "/api/admin/import", {
    ...admin,
    body: { mode: "commit", rows, sourceName: "guests.csv", sourceHash: preview.sourceHash, previewToken: preview.previewToken },
  });
  assert.equal(importResponse.status, 200);

  const credential = database.prepare(`SELECT link_token AS linkToken
    FROM households WHERE external_id = 'HOUSEHOLD-001'`).get();
  const invitation = await (await apiRequest(worker, d1, "/api/invitation", {
    method: "POST", body: { credential: credential.linkToken }, origin: undefined,
  })).json();
  const rsvp = await apiRequest(worker, d1, "/api/rsvp", {
    method: "POST",
    origin: undefined,
    body: {
      credential: credential.linkToken,
      responseVersion: invitation.household.responseVersion,
      guests: invitation.household.guests.map((guest, index) => ({
        id: guest.id, attendance: index === 0 ? "attending" : "declined", dietaryNotes: index === 0 ? "No nuts" : "",
      })),
    },
  });
  assert.equal(rsvp.status, 200);

  const deniedBackup = await apiRequest(worker, d1, "/api/admin/backup", { method: "POST", email: "someone@example.com" });
  assert.equal(deniedBackup.status, 403);

  const backupResponse = await apiRequest(worker, d1, "/api/admin/backup", { ...admin });
  assert.equal(backupResponse.status, 200);
  assert.match(backupResponse.headers.get("content-disposition") ?? "", /attachment/u);
  const backup = await backupResponse.json();
  assert.equal(backup.format, "wedding-backup");
  assert.equal(backup.version, 1);
  assert.equal(backup.tables.households.length, 2);
  assert.equal(backup.tables.guests.length, 3);
  assert.equal(backup.tables.households[0].link_token.length > 0, true);
  // The snapshot is read through db.batch; assert it actually carries audit rows so a
  // batched-SELECT regression (empty results) cannot ship green.
  assert.ok(backup.tables.audit_events.length > 0, "backup must capture audit history");
  assert.ok(backup.tables.audit_events.some((event) => event.action === "guest_list.imported"), "backup audit rows must carry real content");
  assert.ok(database.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'backup.exported'").get().count >= 1);

  database.prepare("UPDATE guests SET name = 'Corrupted Guest', attendance = 'pending', dietary_notes = ''").run();
  database.prepare("UPDATE households SET household_name = 'Corrupted Household'").run();

  const wrongConfirmation = await apiRequest(worker, d1, "/api/admin/restore", {
    ...admin,
    body: { confirmation: "restore", backup },
  });
  assert.equal(wrongConfirmation.status, 400);
  assert.equal(database.prepare("SELECT household_name AS name FROM households LIMIT 1").get().name, "Corrupted Household");

  const restoreResponse = await apiRequest(worker, d1, "/api/admin/restore", {
    ...admin,
    body: { confirmation: "RESTORE WEDDING GUEST DATA", backup },
  });
  assert.equal(restoreResponse.status, 200);
  const restored = await restoreResponse.json();
  assert.equal(restored.households, 2);
  assert.equal(restored.guests, 3);

  const elenaAfterRestore = database.prepare(`SELECT name, attendance, dietary_notes AS dietaryNotes
    FROM guests WHERE external_id = 'GUEST-001'`).get();
  assert.deepEqual({ ...elenaAfterRestore }, { name: "Elena Sample", attendance: "attending", dietaryNotes: "No nuts" });
  assert.equal(database.prepare("SELECT household_name AS name FROM households WHERE external_id = 'HOUSEHOLD-001'").get().name, "The Sample Family");
  assert.ok(database.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'backup.restored'").get().count >= 1);

  const reopened = await apiRequest(worker, d1, "/api/invitation", {
    method: "POST", body: { credential: credential.linkToken }, origin: undefined,
  });
  assert.equal(reopened.status, 200);
  const reopenedInvitation = await reopened.json();
  assert.equal(reopenedInvitation.household.guests[0].attendance, "attending");

  const malformed = await apiRequest(worker, d1, "/api/admin/restore", {
    ...admin,
    body: { confirmation: "RESTORE WEDDING GUEST DATA", backup: { format: "wedding-backup", version: 99, tables: {} } },
  });
  assert.equal(malformed.status, 400);

  // A backup missing a whole table section must be rejected, never treated as an empty
  // (data-wiping) restore.
  const truncated = structuredClone(backup);
  delete truncated.tables.guests;
  const truncatedRestore = await apiRequest(worker, d1, "/api/admin/restore", {
    ...admin,
    body: { confirmation: "RESTORE WEDDING GUEST DATA", backup: truncated },
  });
  assert.equal(truncatedRestore.status, 400);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM guests").get().count, 3, "a truncated backup must not wipe guests");

  // wedding_settings round-trips: open the meal phase after the backup, restore, and the
  // backup's closed phase must come back.
  const openedAfterBackup = await apiRequest(worker, d1, "/api/admin/settings", { ...admin, body: { mealPhaseOpen: true } });
  assert.equal(openedAfterBackup.status, 200);
  assert.equal(database.prepare("SELECT meal_phase_open AS open FROM wedding_settings WHERE id = 1").get().open, 1);
  const settingsRestore = await apiRequest(worker, d1, "/api/admin/restore", {
    ...admin,
    body: { confirmation: "RESTORE WEDDING GUEST DATA", backup },
  });
  assert.equal(settingsRestore.status, 200);
  assert.equal(database.prepare("SELECT meal_phase_open AS open FROM wedding_settings WHERE id = 1").get().open, 0, "restore must revert wedding_settings");
  assert.ok(database.prepare("SELECT COUNT(*) AS count FROM meal_options").get().count >= 3, "restore must repopulate meal_options");

  // A tampered backup with a duplicate primary key must fail atomically: the batch rolls
  // back and the live guest list is untouched, not half-wiped.
  const duplicateIds = structuredClone(backup);
  duplicateIds.tables.households.push({ ...duplicateIds.tables.households[0] });
  const duplicateRestore = await apiRequest(worker, d1, "/api/admin/restore", {
    ...admin,
    body: { confirmation: "RESTORE WEDDING GUEST DATA", backup: duplicateIds },
  });
  assert.equal(duplicateRestore.status, 409);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM households").get().count, 2, "a failed restore must not wipe households");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM guests").get().count, 3, "a failed restore must not wipe guests");
  database.close();
});

test("RSVP endpoint cannot be used as an unthrottled credential oracle", async () => {
  const worker = await loadWorker();
  const { database, d1 } = await migratedDatabase();
  let response;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    response = await apiRequest(worker, d1, "/api/rsvp", {
      method: "POST",
      origin: undefined,
      ip: "203.0.113.88",
      body: { credential: "ABCDEFGH23", responseVersion: 0, guests: [{ id: 1, attendance: "attending", dietaryNotes: "" }] },
    });
  }
  assert.equal(response.status, 429);
  database.close();
});

test("import preview rejects households larger than the RSVP contract", async () => {
  const worker = await loadWorker();
  const { database, d1 } = await migratedDatabase();
  const oversized = Array.from({ length: 31 }, (_, index) => ({
    householdExternalId: "BIG-HOUSEHOLD",
    householdName: "Large Sample Household",
    guestExternalId: `BIG-GUEST-${index + 1}`,
    guestName: `Guest ${index + 1}`,
    displayOrder: index + 1,
    guestType: "adult",
  }));
  const response = await apiRequest(worker, d1, "/api/admin/import", {
    method: "POST",
    email: "dyotov2@gmail.com",
    body: { mode: "preview", rows: oversized, sourceName: "oversized.csv" },
  });
  assert.equal(response.status, 400);
  assert.match(JSON.stringify(await response.json()), /at most 30/iu);
  database.close();
});

test("safe-merge preview rejects a projected household above 30 active guests", async () => {
  const worker = await loadWorker();
  const { database, d1 } = await migratedDatabase();
  const admin = { method: "POST", email: "dyotov2@gmail.com" };
  const existingRows = Array.from({ length: 25 }, (_, index) => ({
    householdExternalId: "MERGE-HOUSEHOLD",
    householdName: "Merge Sample Household",
    guestExternalId: `MERGE-EXISTING-${index + 1}`,
    guestName: `Existing Guest ${index + 1}`,
    displayOrder: index + 1,
    guestType: "adult",
  }));
  const firstPreviewResponse = await apiRequest(worker, d1, "/api/admin/import", {
    ...admin,
    body: { mode: "preview", rows: existingRows, sourceName: "existing.csv" },
  });
  const firstPreview = await firstPreviewResponse.json();
  const firstImport = await apiRequest(worker, d1, "/api/admin/import", {
    ...admin,
    body: {
      mode: "commit",
      rows: existingRows,
      sourceName: "existing.csv",
      sourceHash: firstPreview.sourceHash,
      previewToken: firstPreview.previewToken,
    },
  });
  assert.equal(firstImport.status, 200);

  const additions = Array.from({ length: 10 }, (_, index) => ({
    householdExternalId: "MERGE-HOUSEHOLD",
    householdName: "Merge Sample Household",
    guestExternalId: `MERGE-ADDITION-${index + 1}`,
    guestName: `Additional Guest ${index + 1}`,
    displayOrder: 26 + index,
    guestType: "adult",
  }));
  const mergePreview = await apiRequest(worker, d1, "/api/admin/import", {
    ...admin,
    body: { mode: "preview", rows: additions, sourceName: "additions.csv" },
  });
  assert.equal(mergePreview.status, 400);
  assert.match(JSON.stringify(await mergePreview.json()), /35 active guests/iu);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM guests").get().count, 25);
  database.close();
});
