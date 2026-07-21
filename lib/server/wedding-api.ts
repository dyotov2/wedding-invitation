import { generateLinkToken, generateShortCode, normalizeCredential, sha256 } from "./wedding-credentials";

export interface WeddingApiEnv {
  DB?: D1Database;
  ADMIN_EMAILS?: string;
  PUBLIC_SITE_URL?: string;
  WEDDING_WHATSAPP_URL?: string;
  WEDDING_VIBER_URL?: string;
  WEDDING_PHONE_URL?: string;
}

type Attendance = "pending" | "attending" | "declined";
type ResponseSource = "website" | "phone" | "whatsapp" | "viber" | "paper";
type GuestType = "adult" | "child" | "infant";

type HouseholdRow = {
  id: number;
  externalId: string;
  linkToken: string;
  shortCode: string;
  householdName: string;
  greeting: string;
  active: number;
  responseVersion: number;
  createdAt: string;
  updatedAt: string;
};

type GuestRow = {
  id: number;
  externalId: string;
  householdId: number;
  name: string;
  displayOrder: number;
  guestType: GuestType;
  active: number;
  attendance: Attendance;
  dietaryNotes: string;
  mealChoice: string;
  responseSource: ResponseSource;
  responseVersion: number;
  updatedAt: string;
};

type SettingsRow = {
  mealPhaseOpen: number;
  rsvpDeadline: string;
  weddingDate: string;
  deletionDate: string;
};

type MealOptionRow = {
  optionKey: string;
  name: string;
  description: string;
  guestType: "all" | GuestType;
  displayOrder: number;
};

type ImportError = { row: number; field: string; message: string };

type NormalizedImportRow = {
  sourceRow: number;
  householdExternalId: string;
  householdName: string;
  householdGreeting: string;
  guestExternalId: string;
  guestName: string;
  displayOrder: number;
  guestType: GuestType;
};

const DEFAULT_SETTINGS: SettingsRow = {
  mealPhaseOpen: 0,
  rsvpDeadline: "2027-01-01",
  weddingDate: "2027-06-20",
  deletionDate: "2027-06-27",
};

const JSON_LIMIT_BYTES = 512_000;
const MAX_IMPORT_ROWS = 400;
const LOOKUP_WINDOW_SECONDS = 10 * 60;
const LOOKUP_ATTEMPT_LIMIT = 24;
const WRITE_WINDOW_SECONDS = 10 * 60;
const WRITE_ATTEMPT_LIMIT = 30;
const IMPORT_PREVIEW_TTL_SECONDS = 15 * 60;
const API_SECURITY_HEADERS: Record<string, string> = {
  "cache-control": "no-store, max-age=0",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

function responseHeaders(contentType: string, extra?: HeadersInit): Headers {
  const headers = new Headers(API_SECURITY_HEADERS);
  headers.set("content-type", contentType);
  if (extra) new Headers(extra).forEach((value, key) => headers.set(key, value));
  return headers;
}

function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders("application/json; charset=utf-8", extra),
  });
}

function methodNotAllowed(allowed: string): Response {
  return json({ error: "Method not allowed" }, 405, { allow: allowed });
}

function invitationUnavailable(status = 404): Response {
  return json({
    error: "We could not open that invitation. Please check the invitation code and try again.",
    code: "INVITATION_UNAVAILABLE",
  }, status);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return null;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > JSON_LIMIT_BYTES) return null;

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > JSON_LIMIT_BYTES) return null;
    const value: unknown = JSON.parse(text);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function adminEmail(request: Request, env: WeddingApiEnv): { email?: string; response?: Response } {
  const allowed = new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  if (allowed.size === 0) {
    return { response: json({ error: "Administration is not configured" }, 503) };
  }

  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!email) return { response: json({ error: "Sign in required" }, 401) };
  if (!allowed.has(email)) return { response: json({ error: "You are not allowed to administer this invitation" }, 403) };
  return { email };
}

async function findHouseholdByCredential(db: D1Database, credential: string): Promise<HouseholdRow | null> {
  return db.prepare(`SELECT id, external_id AS externalId, link_token AS linkToken,
    short_code AS shortCode, household_name AS householdName, greeting, active,
    response_version AS responseVersion, created_at AS createdAt, updated_at AS updatedAt
    FROM households
    WHERE active = 1 AND (link_token = ? OR short_code = ?)
    LIMIT 1`).bind(credential, credential.toUpperCase()).first<HouseholdRow>();
}

async function getSettings(db: D1Database): Promise<SettingsRow> {
  return (await db.prepare(`SELECT meal_phase_open AS mealPhaseOpen,
    rsvp_deadline AS rsvpDeadline, wedding_date AS weddingDate,
    deletion_date AS deletionDate FROM wedding_settings WHERE id = 1`).first<SettingsRow>()) ?? DEFAULT_SETTINGS;
}

async function getMealOptions(db: D1Database): Promise<MealOptionRow[]> {
  const result = await db.prepare(`SELECT option_key AS optionKey, name, description,
    guest_type AS guestType, display_order AS displayOrder
    FROM meal_options WHERE active = 1 ORDER BY display_order, id`).all<MealOptionRow>();
  return result.results;
}

async function getActiveGuests(db: D1Database, householdId: number): Promise<GuestRow[]> {
  const result = await db.prepare(`SELECT id, external_id AS externalId, household_id AS householdId,
    name, display_order AS displayOrder, guest_type AS guestType, active, attendance,
    dietary_notes AS dietaryNotes, meal_choice AS mealChoice,
    response_source AS responseSource, response_version AS responseVersion,
    updated_at AS updatedAt
    FROM guests WHERE household_id = ? AND active = 1
    ORDER BY display_order, id`).bind(householdId).all<GuestRow>();
  return result.results;
}

function contactActions(env: WeddingApiEnv) {
  const candidates = [
    { key: "whatsapp", href: env.WEDDING_WHATSAPP_URL, protocols: ["https:"] },
    { key: "viber", href: env.WEDDING_VIBER_URL, protocols: ["viber:"] },
    { key: "phone", href: env.WEDDING_PHONE_URL, protocols: ["tel:"] },
  ];
  return candidates.flatMap((candidate) => {
    const href = candidate.href?.trim();
    if (!href || href.length > 300 || /[\u0000-\u001F\u007F\s]/u.test(href)) return [];
    try {
      const url = new URL(href);
      return candidate.protocols.includes(url.protocol) ? [{ key: candidate.key, href }] : [];
    } catch {
      return [];
    }
  });
}

async function invitationPayload(db: D1Database, credential: string, env: WeddingApiEnv) {
  const household = await findHouseholdByCredential(db, credential);
  if (!household) return null;
  const [guests, settings, mealOptions] = await Promise.all([
    getActiveGuests(db, household.id),
    getSettings(db),
    getMealOptions(db),
  ]);

  return {
    household: {
      id: household.id,
      householdName: household.householdName,
      greeting: household.greeting,
      responseVersion: household.responseVersion,
      guests: guests.map((guest) => ({
        id: guest.id,
        name: guest.name,
        displayOrder: guest.displayOrder,
        guestType: guest.guestType,
        attendance: guest.attendance,
        dietaryNotes: guest.dietaryNotes,
        mealChoice: guest.mealChoice,
        responseSource: guest.responseSource,
        responseVersion: guest.responseVersion,
      })),
    },
    mealPhaseOpen: Boolean(settings.mealPhaseOpen),
    rsvpDeadline: settings.rsvpDeadline,
    weddingDate: settings.weddingDate,
    deletionDate: settings.deletionDate,
    mealOptions,
    contacts: contactActions(env),
  };
}

function guestDataExpired(settings: SettingsRow): boolean {
  return new Date().toISOString().slice(0, 10) >= settings.deletionDate;
}

function parseResponseVersion(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function batchChanges(result: D1Result<unknown> | undefined): number {
  const meta = result?.meta as { changes?: number } | undefined;
  return Number(meta?.changes ?? 0);
}

function uniqueIntegerIds(values: unknown[]): number[] | null {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const value of values) {
    if (!isObject(value) || !Number.isInteger(value.id) || Number(value.id) <= 0) return null;
    const id = Number(value.id);
    if (seen.has(id)) return null;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

async function versionConflict(db: D1Database, credential: string, env: WeddingApiEnv): Promise<Response> {
  if (guestDataExpired(await getSettings(db))) return invitationUnavailable(410);
  return json({
    error: "This invitation was updated elsewhere. Please refresh and try again.",
    code: "VERSION_CONFLICT",
    ...(await invitationPayload(db, credential, env)),
  }, 409);
}

async function recordRateLimitedAttempt(
  request: Request,
  db: D1Database,
  scope: string,
  windowSeconds: number,
  attemptLimit: number,
): Promise<Response | null> {
  const forwarded = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / windowSeconds);
  const bucketKey = await sha256(`${scope}:${forwarded}:${bucket}`);
  const expiresAt = (bucket + 2) * windowSeconds;
  await db.prepare("DELETE FROM invitation_lookup_limits WHERE expires_at < ?").bind(now).run();
  const result = await db.prepare(`INSERT INTO invitation_lookup_limits
    (bucket_key, attempt_count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(bucket_key) DO UPDATE SET attempt_count = attempt_count + 1,
      expires_at = excluded.expires_at
    RETURNING attempt_count AS attemptCount`)
    .bind(bucketKey, expiresAt).first<{ attemptCount: number }>();
  if (Number(result?.attemptCount ?? 1) <= attemptLimit) return null;
  return json({
    error: "Too many attempts. Please wait a few minutes or contact us directly.",
    code: "TOO_MANY_ATTEMPTS",
  }, 429, { "retry-after": String(windowSeconds) });
}

async function handleInvitation(request: Request, db: D1Database, env: WeddingApiEnv): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const limited = await recordRateLimitedAttempt(
    request, db, "credential-lookup", LOOKUP_WINDOW_SECONDS, LOOKUP_ATTEMPT_LIMIT,
  );
  if (limited) return limited;
  const body = await readJsonObject(request);
  const credential = normalizeCredential(body?.credential);
  if (!credential) return invitationUnavailable(400);
  if (guestDataExpired(await getSettings(db))) return invitationUnavailable(410);
  const payload = await invitationPayload(db, credential, env);
  if (payload) return json(payload);
  return invitationUnavailable();
}

async function handleRsvp(request: Request, db: D1Database, env: WeddingApiEnv): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const lookupLimited = await recordRateLimitedAttempt(
    request, db, "credential-lookup", LOOKUP_WINDOW_SECONDS, LOOKUP_ATTEMPT_LIMIT,
  );
  if (lookupLimited) return lookupLimited;
  const body = await readJsonObject(request);
  const credential = normalizeCredential(body?.credential);
  const responseVersion = parseResponseVersion(body?.responseVersion);
  const submittedGuests = Array.isArray(body?.guests) ? body.guests : [];
  if (!credential || responseVersion === null || submittedGuests.length === 0 || submittedGuests.length > 30) {
    return json({ error: "Please check the invitation reply and try again" }, 400);
  }

  const guestIds = uniqueIntegerIds(submittedGuests);
  if (!guestIds) return json({ error: "Please check the invitation reply and try again" }, 400);

  const normalizedGuests: Array<{ id: number; attendance: Attendance; dietaryNotes: string }> = [];
  for (const value of submittedGuests) {
    if (!isObject(value) || !["attending", "declined"].includes(String(value.attendance))) {
      return json({ error: "Please answer for every invited guest" }, 400);
    }
    if (value.dietaryNotes !== undefined && typeof value.dietaryNotes !== "string") {
      return json({ error: "Please check the dietary notes and try again" }, 400);
    }
    const dietaryNotes = String(value.dietaryNotes ?? "").trim();
    if (dietaryNotes.length > 500) return json({ error: "Dietary notes must be 500 characters or fewer" }, 400);
    normalizedGuests.push({ id: Number(value.id), attendance: String(value.attendance) as Attendance, dietaryNotes });
  }

  if (guestDataExpired(await getSettings(db))) return invitationUnavailable(410);
  const household = await findHouseholdByCredential(db, credential);
  if (!household) return invitationUnavailable();
  const limited = await recordRateLimitedAttempt(
    request, db, `rsvp-write:${household.id}`, WRITE_WINDOW_SECONDS, WRITE_ATTEMPT_LIMIT,
  );
  if (limited) return limited;
  if (household.responseVersion !== responseVersion) return versionConflict(db, credential, env);

  const activeGuests = await getActiveGuests(db, household.id);
  const allowedGuestIds = new Set(activeGuests.map((guest) => guest.id));
  if (guestIds.length !== activeGuests.length || guestIds.some((id) => !allowedGuestIds.has(id))) {
    return json({ error: "Please answer for every invited guest" }, 400);
  }

  const statements: D1PreparedStatement[] = normalizedGuests.map((guest) => db.prepare(`UPDATE guests
    SET attendance = ?, dietary_notes = ?,
      meal_choice = CASE WHEN ? = 'declined' THEN '' ELSE meal_choice END,
      response_source = 'website', response_version = response_version + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND household_id = ? AND active = 1
      AND EXISTS (SELECT 1 FROM households WHERE id = ? AND active = 1 AND response_version = ?)`)
    .bind(guest.attendance, guest.dietaryNotes, guest.attendance, guest.id,
      household.id, household.id, responseVersion));

  statements.push(db.prepare(`INSERT INTO audit_events
    (event_id, actor_type, action, entity_type, entity_id, household_id, details_json)
    SELECT ?, 'guest', 'rsvp.updated', 'household', external_id, id, ?
    FROM households WHERE id = ? AND response_version = ?`)
    .bind(crypto.randomUUID(), JSON.stringify({ guestCount: normalizedGuests.length }), household.id, responseVersion));
  statements.push(db.prepare(`UPDATE households SET response_version = response_version + 1,
    updated_at = CURRENT_TIMESTAMP WHERE id = ? AND active = 1 AND response_version = ?`)
    .bind(household.id, responseVersion));

  const results = await db.batch(statements);
  if (batchChanges(results.at(-1)) !== 1) return versionConflict(db, credential, env);
  const payload = await invitationPayload(db, credential, env);
  return payload ? json(payload) : invitationUnavailable();
}

async function handleMeals(request: Request, db: D1Database, env: WeddingApiEnv): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const lookupLimited = await recordRateLimitedAttempt(
    request, db, "credential-lookup", LOOKUP_WINDOW_SECONDS, LOOKUP_ATTEMPT_LIMIT,
  );
  if (lookupLimited) return lookupLimited;
  const body = await readJsonObject(request);
  const credential = normalizeCredential(body?.credential);
  const responseVersion = parseResponseVersion(body?.responseVersion);
  const submittedGuests = Array.isArray(body?.guests) ? body.guests : [];
  if (!credential || responseVersion === null || submittedGuests.length === 0 || submittedGuests.length > 30) {
    return json({ error: "Please check the meal choices and try again" }, 400);
  }

  const guestIds = uniqueIntegerIds(submittedGuests);
  if (!guestIds) return json({ error: "Please check the meal choices and try again" }, 400);
  const normalizedGuests: Array<{ id: number; mealChoice: string }> = [];
  for (const value of submittedGuests) {
    if (!isObject(value) || typeof value.mealChoice !== "string") {
      return json({ error: "Please choose a meal for each attending guest" }, 400);
    }
    const mealChoice = value.mealChoice.trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(mealChoice)) {
      return json({ error: "Please choose a valid meal" }, 400);
    }
    normalizedGuests.push({ id: Number(value.id), mealChoice });
  }

  const settings = await getSettings(db);
  if (guestDataExpired(settings)) return invitationUnavailable(410);
  const household = await findHouseholdByCredential(db, credential);
  if (!household) return invitationUnavailable();
  if (household.responseVersion !== responseVersion) return versionConflict(db, credential, env);
  const limited = await recordRateLimitedAttempt(
    request, db, `meal-write:${household.id}`, WRITE_WINDOW_SECONDS, WRITE_ATTEMPT_LIMIT,
  );
  if (limited) return limited;
  if (!settings.mealPhaseOpen) return json({ error: "Meal choices are not open yet" }, 403);

  const [activeGuests, mealOptions] = await Promise.all([
    getActiveGuests(db, household.id),
    getMealOptions(db),
  ]);
  const guestById = new Map(activeGuests.map((guest) => [guest.id, guest]));
  const optionByKey = new Map(mealOptions.map((option) => [option.optionKey, option]));
  const attendingGuestIds = activeGuests.filter((guest) => guest.attendance === "attending").map((guest) => guest.id);
  if (guestIds.length !== attendingGuestIds.length || attendingGuestIds.some((id) => !guestIds.includes(id))) {
    return json({ error: "Please choose a meal for every attending guest" }, 400);
  }
  for (const guest of normalizedGuests) {
    const storedGuest = guestById.get(guest.id);
    const option = optionByKey.get(guest.mealChoice);
    if (!storedGuest || storedGuest.attendance !== "attending" || !option ||
      (option.guestType !== "all" && option.guestType !== storedGuest.guestType)) {
      return json({ error: "Please choose an available meal for each attending guest" }, 400);
    }
  }

  const statements: D1PreparedStatement[] = normalizedGuests.map((guest) => db.prepare(`UPDATE guests
    SET meal_choice = ?, response_version = response_version + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND household_id = ? AND active = 1 AND attendance = 'attending'
      AND EXISTS (SELECT 1 FROM households WHERE id = ? AND active = 1 AND response_version = ?)`)
    .bind(guest.mealChoice, guest.id, household.id, household.id, responseVersion));
  statements.push(db.prepare(`INSERT INTO audit_events
    (event_id, actor_type, action, entity_type, entity_id, household_id, details_json)
    SELECT ?, 'guest', 'meals.updated', 'household', external_id, id, ?
    FROM households WHERE id = ? AND response_version = ?`)
    .bind(crypto.randomUUID(), JSON.stringify({ guestCount: normalizedGuests.length }), household.id, responseVersion));
  statements.push(db.prepare(`UPDATE households SET response_version = response_version + 1,
    updated_at = CURRENT_TIMESTAMP WHERE id = ? AND active = 1 AND response_version = ?`)
    .bind(household.id, responseVersion));

  const results = await db.batch(statements);
  if (batchChanges(results.at(-1)) !== 1) return versionConflict(db, credential, env);
  const payload = await invitationPayload(db, credential, env);
  return payload ? json(payload) : invitationUnavailable();
}

async function listAdminHouseholds(db: D1Database) {
  const [householdResult, guestResult] = await Promise.all([
    db.prepare(`SELECT id, external_id AS externalId, link_token AS linkToken,
      short_code AS shortCode, household_name AS householdName, greeting, active,
      response_version AS responseVersion, created_at AS createdAt, updated_at AS updatedAt
      FROM households ORDER BY active DESC, household_name, id`).all<HouseholdRow>(),
    db.prepare(`SELECT id, external_id AS externalId, household_id AS householdId, name,
      display_order AS displayOrder, guest_type AS guestType, active, attendance,
      dietary_notes AS dietaryNotes, meal_choice AS mealChoice,
      response_source AS responseSource, response_version AS responseVersion,
      updated_at AS updatedAt FROM guests ORDER BY household_id, display_order, id`).all<GuestRow>(),
  ]);
  const guestsByHousehold = new Map<number, GuestRow[]>();
  for (const guest of guestResult.results) {
    const guests = guestsByHousehold.get(guest.householdId) ?? [];
    guests.push({ ...guest, active: Number(guest.active) });
    guestsByHousehold.set(guest.householdId, guests);
  }
  return householdResult.results.map((household) => ({
    id: household.id,
    externalId: household.externalId,
    householdName: household.householdName,
    greeting: household.greeting,
    active: Boolean(household.active),
    responseVersion: household.responseVersion,
    createdAt: household.createdAt,
    updatedAt: household.updatedAt,
    guests: (guestsByHousehold.get(household.id) ?? []).map((guest) => ({ ...guest, active: Boolean(guest.active) })),
  }));
}

async function handleAdminIndex(request: Request, db: D1Database): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed("GET");
  const [settings, retentionReceipt] = await Promise.all([
    getSettings(db),
    latestRetentionReceipt(db),
  ]);
  if (guestDataExpired(settings) || retentionReceipt) {
    return json({
      households: [],
      mealPhaseOpen: false,
      rsvpDeadline: settings.rsvpDeadline,
      weddingDate: settings.weddingDate,
      deletionDate: settings.deletionDate,
      mealOptions: [],
      retentionClosed: true,
      retentionReceipt: retentionReceipt ? {
        receiptId: retentionReceipt.id,
        completedAt: retentionReceipt.completedAt,
      } : null,
    });
  }
  const [mealOptions, households] = await Promise.all([
    getMealOptions(db),
    listAdminHouseholds(db),
  ]);
  return json({
    households,
    mealPhaseOpen: Boolean(settings.mealPhaseOpen),
    rsvpDeadline: settings.rsvpDeadline,
    weddingDate: settings.weddingDate,
    deletionDate: settings.deletionDate,
    mealOptions,
    retentionClosed: false,
    retentionReceipt: null,
  });
}

async function handleAdminSettings(request: Request, db: D1Database, email: string): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const body = await readJsonObject(request);
  if (!body || typeof body.mealPhaseOpen !== "boolean" || Object.keys(body).some((key) => key !== "mealPhaseOpen")) {
    return json({ error: "Only the meal phase can be changed here" }, 400);
  }

  await db.batch([
    db.prepare(`UPDATE wedding_settings SET meal_phase_open = ?,
      updated_at = CURRENT_TIMESTAMP WHERE id = 1`)
      .bind(body.mealPhaseOpen ? 1 : 0),
    db.prepare(`INSERT INTO audit_events
      (event_id, actor_type, actor_email, action, entity_type, entity_id, details_json)
      VALUES (?, 'admin', ?, 'settings.updated', 'wedding_settings', '1', ?)`)
      .bind(crypto.randomUUID(), email, JSON.stringify({
        mealPhaseOpen: body.mealPhaseOpen,
      })),
  ]);
  const settings = await getSettings(db);
  return json({ ok: true, ...settings, mealPhaseOpen: Boolean(settings.mealPhaseOpen) });
}

async function handleAdminReply(request: Request, db: D1Database, email: string): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const body = await readJsonObject(request);
  const guestId = Number(body?.guestId);
  const attendance = body?.attendance;
  const responseSource = body?.responseSource;
  const dietaryNotes = typeof body?.dietaryNotes === "string" ? body.dietaryNotes.trim() : null;
  const mealChoice = typeof body?.mealChoice === "string" ? body.mealChoice.trim() : null;
  if (!Number.isInteger(guestId) || guestId <= 0 ||
    !["pending", "attending", "declined"].includes(String(attendance)) ||
    !["website", "phone", "whatsapp", "viber", "paper"].includes(String(responseSource)) ||
    (dietaryNotes !== null && dietaryNotes.length > 500) ||
    (mealChoice !== null && mealChoice !== "" && !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(mealChoice))) {
    return json({ error: "Invalid manual reply" }, 400);
  }
  const guest = await db.prepare(`SELECT g.id, g.household_id AS householdId,
    g.external_id AS externalId, g.guest_type AS guestType, g.meal_choice AS mealChoice
    FROM guests g JOIN households h ON h.id = g.household_id
    WHERE g.id = ? AND g.active = 1 AND h.active = 1`)
    .bind(guestId).first<{ id: number; householdId: number; externalId: string; guestType: GuestType; mealChoice: string }>();
  if (!guest) return json({ error: "Guest not found" }, 404);
  const mealChanged = mealChoice !== null && mealChoice !== guest.mealChoice;
  if (mealChanged && attendance === "attending") {
    if (!(await getSettings(db)).mealPhaseOpen) return json({ error: "Meal choices are not open yet" }, 409);
    if (mealChoice) {
      const option = await db.prepare(`SELECT option_key AS optionKey FROM meal_options
        WHERE option_key = ? AND active = 1 AND (guest_type = 'all' OR guest_type = ?)`)
        .bind(mealChoice, guest.guestType).first<{ optionKey: string }>();
      if (!option) return json({ error: "That meal is not available for this guest" }, 400);
    }
  }

  await db.batch([
    db.prepare(`UPDATE guests SET attendance = ?, response_source = ?, dietary_notes = COALESCE(?, dietary_notes),
      meal_choice = CASE WHEN ? != 'attending' THEN '' ELSE COALESCE(?, meal_choice) END,
      response_version = response_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(attendance, responseSource, dietaryNotes, attendance, mealChoice, guestId),
    db.prepare(`UPDATE households SET response_version = response_version + 1,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(guest.householdId),
    db.prepare(`INSERT INTO audit_events
      (event_id, actor_type, actor_email, action, entity_type, entity_id, household_id, details_json)
      VALUES (?, 'admin', ?, 'rsvp.manual', 'guest', ?, ?, ?)`)
      .bind(crypto.randomUUID(), email, guest.externalId, guest.householdId,
        JSON.stringify({ attendance, responseSource, notesUpdated: dietaryNotes !== null, mealUpdated: mealChanged })),
  ]);
  return json({ ok: true });
}

async function tableCount(db: D1Database, table: "households" | "guests" | "import_batches"): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

type RetentionReceipt = {
  id: string;
  deletionDate: string;
  householdsDeleted: number;
  guestsDeleted: number;
  importsDeleted: number;
  completedAt: string;
};

async function latestRetentionReceipt(db: D1Database): Promise<RetentionReceipt | null> {
  return db.prepare(`SELECT id, deletion_date AS deletionDate,
    households_deleted AS householdsDeleted, guests_deleted AS guestsDeleted,
    imports_deleted AS importsDeleted, completed_at AS completedAt
    FROM retention_receipts ORDER BY completed_at DESC LIMIT 1`).first<RetentionReceipt>();
}

async function retentionClosed(db: D1Database): Promise<boolean> {
  const [settings, receipt] = await Promise.all([getSettings(db), latestRetentionReceipt(db)]);
  return guestDataExpired(settings) || Boolean(receipt);
}

async function handleAdminRetentionPurge(request: Request, db: D1Database): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const body = await readJsonObject(request);
  const settings = await getSettings(db);
  const existingReceipt = await latestRetentionReceipt(db);
  if (existingReceipt) return json({ ok: true, ...existingReceipt, receiptId: existingReceipt.id, idempotent: true });
  if (!guestDataExpired(settings)) {
    return json({ error: `Guest data cannot be purged before ${settings.deletionDate}` }, 409);
  }
  if (body?.confirmation !== "DELETE WEDDING GUEST DATA" || body?.deletionDate !== settings.deletionDate) {
    return json({ error: "The deletion confirmation did not match" }, 400);
  }

  const [householdsDeleted, guestsDeleted, importsDeleted] = await Promise.all([
    tableCount(db, "households"),
    tableCount(db, "guests"),
    tableCount(db, "import_batches"),
  ]);
  const receiptId = crypto.randomUUID();
  await db.batch([
    db.prepare("DELETE FROM audit_events"),
    db.prepare("DELETE FROM guests"),
    db.prepare("DELETE FROM households"),
    db.prepare("DELETE FROM import_batches"),
    db.prepare("DELETE FROM import_previews"),
    db.prepare("DELETE FROM invitation_lookup_limits"),
    db.prepare(`INSERT INTO retention_receipts
      (id, deletion_date, households_deleted, guests_deleted, imports_deleted)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(receiptId, settings.deletionDate, householdsDeleted, guestsDeleted, importsDeleted),
  ]);
  return json({
    ok: true,
    receiptId,
    deletionDate: settings.deletionDate,
    householdsDeleted,
    guestsDeleted,
    importsDeleted,
  });
}

function importField(row: Record<string, unknown>, camel: string, snake: string): unknown {
  return Object.hasOwn(row, camel) ? row[camel] : row[snake];
}

function importText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  if (/^[=+@-]/u.test(value.trim()) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) return null;
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function importExternalId(value: unknown): string | null {
  const normalized = importText(value, 80);
  return normalized && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(normalized) ? normalized.toUpperCase() : null;
}

function validateImportRows(value: unknown): { rows: NormalizedImportRow[]; errors: ImportError[] } {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_IMPORT_ROWS) {
    return { rows: [], errors: [{ row: 0, field: "rows", message: `Provide between 1 and ${MAX_IMPORT_ROWS} guest rows` }] };
  }
  const rows: NormalizedImportRow[] = [];
  const errors: ImportError[] = [];
  const guestIds = new Set<string>();
  const householdValues = new Map<string, string>();

  value.forEach((raw, index) => {
    const rowNumber = index + 1;
    if (!isObject(raw)) {
      errors.push({ row: rowNumber, field: "row", message: "Row must be an object" });
      return;
    }
    const householdExternalId = importExternalId(importField(raw, "householdExternalId", "household_external_id"));
    const householdName = importText(importField(raw, "householdName", "household_name"), 160);
    const greetingValue = importField(raw, "householdGreeting", "household_greeting");
    const householdGreeting = greetingValue === undefined || greetingValue === null || greetingValue === ""
      ? "" : importText(greetingValue, 240);
    const guestExternalId = importExternalId(importField(raw, "guestExternalId", "guest_external_id"));
    const guestName = importText(importField(raw, "guestName", "guest_name"), 160);
    const guestTypeValue = String(importField(raw, "guestType", "guest_type") ?? "adult").toLowerCase();
    const displayOrderValue = importField(raw, "displayOrder", "display_order");
    const displayOrder = displayOrderValue === undefined || displayOrderValue === "" ? index : Number(displayOrderValue);

    if (!householdExternalId) errors.push({ row: rowNumber, field: "householdExternalId", message: "Use 1–80 letters, numbers, dots, underscores or hyphens" });
    if (!householdName) errors.push({ row: rowNumber, field: "householdName", message: "Household name is required (maximum 160 characters)" });
    if (householdGreeting === null) errors.push({ row: rowNumber, field: "householdGreeting", message: "Greeting must be 240 characters or fewer" });
    if (!guestExternalId) errors.push({ row: rowNumber, field: "guestExternalId", message: "Use 1–80 letters, numbers, dots, underscores or hyphens" });
    if (!guestName) errors.push({ row: rowNumber, field: "guestName", message: "Guest name is required (maximum 160 characters)" });
    if (!["adult", "child", "infant"].includes(guestTypeValue)) errors.push({ row: rowNumber, field: "guestType", message: "Use adult, child or infant" });
    if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 10_000) errors.push({ row: rowNumber, field: "displayOrder", message: "Use a whole number from 0 to 10000" });
    if (!householdExternalId || !householdName || householdGreeting === null || !guestExternalId || !guestName ||
      !["adult", "child", "infant"].includes(guestTypeValue) || !Number.isInteger(displayOrder) ||
      displayOrder < 0 || displayOrder > 10_000) return;

    if (guestIds.has(guestExternalId)) {
      errors.push({ row: rowNumber, field: "guestExternalId", message: "Guest external ID is duplicated in this import" });
      return;
    }
    guestIds.add(guestExternalId);
    const householdSignature = JSON.stringify([householdName, householdGreeting]);
    const earlierSignature = householdValues.get(householdExternalId);
    if (earlierSignature && earlierSignature !== householdSignature) {
      errors.push({ row: rowNumber, field: "householdExternalId", message: "Rows in one household must use the same name and greeting" });
      return;
    }
    householdValues.set(householdExternalId, householdSignature);
    rows.push({
      sourceRow: rowNumber, householdExternalId, householdName, householdGreeting,
      guestExternalId, guestName, displayOrder, guestType: guestTypeValue as GuestType,
    });
  });
  const householdCounts = new Map<string, number>();
  for (const row of rows) householdCounts.set(row.householdExternalId, (householdCounts.get(row.householdExternalId) ?? 0) + 1);
  for (const [householdExternalId, count] of householdCounts) {
    if (count > 30) errors.push({
      row: 0,
      field: "householdExternalId",
      message: `${householdExternalId} has ${count} guests; one household may contain at most 30`,
    });
  }
  rows.sort((a, b) => a.householdExternalId.localeCompare(b.householdExternalId) ||
    a.displayOrder - b.displayOrder || a.guestExternalId.localeCompare(b.guestExternalId));
  return { rows, errors };
}

type ImportHousehold = {
  id: number;
  externalId: string;
  linkToken: string;
  shortCode: string;
  householdName: string;
  greeting: string;
  active: number;
};

type ImportGuest = {
  externalId: string;
  householdId: number;
  name: string;
  displayOrder: number;
  guestType: GuestType;
  active: number;
};

async function existingImportRecords(db: D1Database) {
  const [households, guests] = await Promise.all([
    db.prepare(`SELECT id, external_id AS externalId, link_token AS linkToken,
      short_code AS shortCode, household_name AS householdName, greeting, active
      FROM households`).all<ImportHousehold>(),
    db.prepare(`SELECT external_id AS externalId, household_id AS householdId,
      name, display_order AS displayOrder, guest_type AS guestType, active
      FROM guests`).all<ImportGuest>(),
  ]);
  return {
    households: new Map(households.results.map((row) => [row.externalId.toUpperCase(), row])),
    guests: new Map(guests.results.map((row) => [row.externalId.toUpperCase(), row])),
  };
}

function householdImportMatches(row: NormalizedImportRow, existing: ImportHousehold | undefined): boolean {
  return Boolean(existing && existing.householdName === row.householdName &&
    existing.greeting === row.householdGreeting);
}

function guestImportMatches(
  row: NormalizedImportRow,
  existingGuest: ImportGuest | undefined,
  targetHousehold: ImportHousehold | undefined,
): boolean {
  return Boolean(existingGuest && targetHousehold && existingGuest.householdId === targetHousehold.id &&
    existingGuest.name === row.guestName && existingGuest.displayOrder === row.displayOrder &&
    existingGuest.guestType === row.guestType);
}

function currentImportMatches(rows: NormalizedImportRow[], existing: Awaited<ReturnType<typeof existingImportRecords>>): boolean {
  return rows.every((row) => householdImportMatches(row, existing.households.get(row.householdExternalId)) &&
    guestImportMatches(row, existing.guests.get(row.guestExternalId), existing.households.get(row.householdExternalId)));
}

function importSummary(rows: NormalizedImportRow[], existing: Awaited<ReturnType<typeof existingImportRecords>>, idempotent = false) {
  const householdIds = [...new Set(rows.map((row) => row.householdExternalId))];
  const guestIds = new Set(rows.map((row) => row.guestExternalId));
  return {
    rowCount: rows.length,
    householdCount: householdIds.length,
    guestCount: rows.length,
    householdsToCreate: householdIds.filter((id) => !existing.households.has(id)).length,
    householdsToUpdate: householdIds.filter((id) => {
      const row = rows.find((candidate) => candidate.householdExternalId === id)!;
      return existing.households.has(id) && !householdImportMatches(row, existing.households.get(id));
    }).length,
    householdsUnchanged: householdIds.filter((id) => {
      const row = rows.find((candidate) => candidate.householdExternalId === id)!;
      return householdImportMatches(row, existing.households.get(id));
    }).length,
    guestsToCreate: rows.filter((row) => !existing.guests.has(row.guestExternalId)).length,
    guestsToUpdate: rows.filter((row) => existing.guests.has(row.guestExternalId) &&
      !guestImportMatches(row, existing.guests.get(row.guestExternalId), existing.households.get(row.householdExternalId))).length,
    guestsUnchanged: rows.filter((row) => guestImportMatches(
      row, existing.guests.get(row.guestExternalId), existing.households.get(row.householdExternalId),
    )).length,
    activeHouseholdsNotInFile: [...existing.households.entries()]
      .filter(([id, household]) => household.active && !householdIds.includes(id)).length,
    activeGuestsNotInFile: [...existing.guests.entries()]
      .filter(([id, guest]) => guest.active && !guestIds.has(id)).length,
    idempotent,
  };
}

function importedHouseholdPreview(rows: NormalizedImportRow[], existing: Awaited<ReturnType<typeof existingImportRecords>>) {
  const grouped = new Map<string, NormalizedImportRow[]>();
  for (const row of rows) grouped.set(row.householdExternalId, [...(grouped.get(row.householdExternalId) ?? []), row]);
  return [...grouped.entries()].map(([externalId, householdRows]) => ({
    externalId,
    householdName: householdRows[0].householdName,
    greeting: householdRows[0].householdGreeting,
    active: Boolean(existing.households.get(externalId)?.active ?? 1),
    guestCount: householdRows.length,
    guestNames: householdRows.map((row) => row.guestName),
    change: !existing.households.has(externalId)
      ? "create"
      : householdImportMatches(householdRows[0], existing.households.get(externalId))
        ? "unchanged"
        : "update",
  }));
}

function publicBaseUrl(request: Request, env: WeddingApiEnv): string {
  const configured = env.PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      const candidate = new URL(configured);
      const localHttp = candidate.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(candidate.hostname);
      if ((candidate.protocol === "https:" || localHttp) && /^[a-z0-9.:-]+$/iu.test(candidate.hostname)) return candidate.origin;
    } catch {
      // Invalid configured values are rejected below.
    }
    throw new Error("PUBLIC_SITE_URL must be a valid HTTPS origin");
  }
  const requestUrl = new URL(request.url);
  if (["localhost", "127.0.0.1", "::1"].includes(requestUrl.hostname)) return requestUrl.origin;
  throw new Error("PUBLIC_SITE_URL must be configured before invitation links are generated");
}

async function deliveryRows(db: D1Database, request: Request, env: WeddingApiEnv) {
  const [households, guests] = await Promise.all([
    db.prepare(`SELECT id, external_id AS externalId, link_token AS linkToken,
      short_code AS shortCode, household_name AS householdName, greeting, active
      FROM households ORDER BY household_name, id`).all<ImportHousehold>(),
    db.prepare(`SELECT household_id AS householdId, name, display_order AS displayOrder, active
      FROM guests ORDER BY household_id, display_order, id`)
      .all<{ householdId: number; name: string; displayOrder: number; active: number }>(),
  ]);
  const names = new Map<number, string[]>();
  for (const guest of guests.results) {
    if (!guest.active) continue;
    names.set(guest.householdId, [...(names.get(guest.householdId) ?? []), guest.name]);
  }
  const baseUrl = publicBaseUrl(request, env);
  return households.results
    .filter((household) => household.active)
    .map((household) => ({
      householdExternalId: household.externalId,
      householdName: household.householdName,
      householdGreeting: household.greeting,
      invitedPeople: names.get(household.id) ?? [],
      shortCode: household.shortCode,
      personalUrl: `${baseUrl}/#invite=${encodeURIComponent(household.linkToken)}`,
      active: Boolean(household.active),
    }));
}

async function handleAdminImport(request: Request, db: D1Database, email: string): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const body = await readJsonObject(request);
  const mode = body?.mode;
  if (!body || (mode !== "preview" && mode !== "commit")) return json({ error: "Import mode must be preview or commit" }, 400);
  const validation = validateImportRows(body.rows);
  const hashableRows = validation.rows.map((row) => ({
    householdExternalId: row.householdExternalId,
    householdName: row.householdName,
    householdGreeting: row.householdGreeting,
    guestExternalId: row.guestExternalId,
    guestName: row.guestName,
    displayOrder: row.displayOrder,
    guestType: row.guestType,
  }));
  const sourceHash = validation.rows.length > 0 ? await sha256(JSON.stringify(hashableRows)) : "";
  const existing = await existingImportRecords(db);
  const summary = importSummary(validation.rows, existing);
  const importErrors = [...validation.errors];
  for (const row of validation.rows) {
    const currentGuest = existing.guests.get(row.guestExternalId);
    const targetHousehold = existing.households.get(row.householdExternalId);
    if (currentGuest && currentGuest.householdId !== targetHousehold?.id) {
      importErrors.push({
        row: row.sourceRow,
        field: "guestExternalId",
        message: "This guest already belongs to another household. Moving a guest requires a manual review and backup.",
      });
    }
  }
  const importedHouseholdIds = [...new Set(validation.rows.map((row) => row.householdExternalId))];
  for (const externalId of importedHouseholdIds) {
    const targetHousehold = existing.households.get(externalId);
    const currentActiveCount = targetHousehold
      ? [...existing.guests.values()].filter((guest) => guest.active && guest.householdId === targetHousehold.id).length
      : 0;
    const additions = validation.rows.filter((row) => row.householdExternalId === externalId &&
      !existing.guests.has(row.guestExternalId)).length;
    const projectedCount = currentActiveCount + additions;
    if (projectedCount > 30) {
      const firstRow = validation.rows.find((row) => row.householdExternalId === externalId)!;
      importErrors.push({
        row: firstRow.sourceRow,
        field: "householdExternalId",
        message: `${externalId} would contain ${projectedCount} active guests after this safe merge; one household may contain at most 30`,
      });
    }
  }
  if (importErrors.length > 0) {
    return json({ summary, errors: importErrors, sourceHash }, 400);
  }
  const households = importedHouseholdPreview(validation.rows, existing);
  if (mode === "preview") {
    const now = Math.floor(Date.now() / 1000);
    const previewToken = generateLinkToken();
    await db.batch([
      db.prepare("DELETE FROM import_previews WHERE expires_at < ? OR used_at IS NOT NULL").bind(now),
      db.prepare(`INSERT INTO import_previews
        (id, source_hash, previewed_by, expires_at) VALUES (?, ?, ?, ?)`)
        .bind(previewToken, sourceHash, email, now + IMPORT_PREVIEW_TTL_SECONDS),
    ]);
    return json({ summary, errors: [], households, sourceHash, previewToken });
  }
  if (typeof body.sourceHash !== "string" || body.sourceHash !== sourceHash) {
    return json({ summary, errors: [{ row: 0, field: "sourceHash", message: "The guest list changed after preview; preview it again" }], sourceHash }, 409);
  }
  const now = Math.floor(Date.now() / 1000);
  const previewToken = typeof body.previewToken === "string" ? body.previewToken : "";
  const approvedPreview = await db.prepare(`SELECT id FROM import_previews
    WHERE id = ? AND source_hash = ? AND previewed_by = ? AND expires_at >= ? AND used_at IS NULL`)
    .bind(previewToken, sourceHash, email, now).first<{ id: string }>();
  if (!approvedPreview) {
    return json({ summary, errors: [{ row: 0, field: "previewToken", message: "This preview is missing, expired or already used; preview the file again" }], sourceHash }, 409);
  }

  const previouslyImported = await db.prepare(`SELECT id FROM import_batches WHERE source_hash = ?`)
    .bind(sourceHash).first<{ id: string }>();
  if (currentImportMatches(validation.rows, existing)) {
    await db.prepare("UPDATE import_previews SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL")
      .bind(previewToken).run();
    return json({
      summary: importSummary(validation.rows, existing, true), errors: [], households,
      sourceHash,
    });
  }

  const batchId = previouslyImported?.id ?? crypto.randomUUID();
  const sourceName = importText(body.sourceName, 160) ?? "guest-list.json";
  const grouped = new Map<string, NormalizedImportRow>();
  for (const row of validation.rows) if (!grouped.has(row.householdExternalId)) grouped.set(row.householdExternalId, row);
  const usedTokens = new Set([...existing.households.values()].map((row) => row.linkToken));
  const usedCodes = new Set([...existing.households.values()].map((row) => row.shortCode));
  const credentials = new Map<string, { linkToken: string; shortCode: string }>();
  for (const externalId of grouped.keys()) {
    const current = existing.households.get(externalId);
    if (current) {
      credentials.set(externalId, { linkToken: current.linkToken, shortCode: current.shortCode });
      continue;
    }
    let linkToken = generateLinkToken();
    while (usedTokens.has(linkToken)) linkToken = generateLinkToken();
    let shortCode = generateShortCode();
    while (usedCodes.has(shortCode)) shortCode = generateShortCode();
    usedTokens.add(linkToken);
    usedCodes.add(shortCode);
    credentials.set(externalId, { linkToken, shortCode });
  }

  const statements: D1PreparedStatement[] = [];
  if (!previouslyImported) statements.push(db.prepare(`INSERT INTO import_batches
    (id, source_name, source_hash, status, row_count, household_count, guest_count, imported_by)
    VALUES (?, ?, ?, 'completed', ?, ?, ?, ?)`)
    .bind(batchId, sourceName, sourceHash, validation.rows.length, grouped.size, validation.rows.length, email));
  for (const [externalId, row] of grouped) {
    const credential = credentials.get(externalId)!;
    const persistedExternalId = existing.households.get(externalId)?.externalId ?? externalId;
    statements.push(db.prepare(`INSERT INTO households
      (external_id, link_token, short_code, household_name, greeting, active, import_batch_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(external_id) DO UPDATE SET household_name = excluded.household_name,
        greeting = excluded.greeting,
        import_batch_id = excluded.import_batch_id,
        response_version = households.response_version + 1, updated_at = CURRENT_TIMESTAMP`)
      .bind(persistedExternalId, credential.linkToken, credential.shortCode, row.householdName,
        row.householdGreeting, 1, batchId));
  }
  for (const row of validation.rows) {
    const persistedGuestExternalId = existing.guests.get(row.guestExternalId)?.externalId ?? row.guestExternalId;
    const persistedHouseholdExternalId = existing.households.get(row.householdExternalId)?.externalId ?? row.householdExternalId;
    statements.push(db.prepare(`INSERT INTO guests
      (external_id, household_id, name, display_order, guest_type, active, import_batch_id)
      VALUES (?, (SELECT id FROM households WHERE external_id = ?), ?, ?, ?, ?, ?)
      ON CONFLICT(external_id) DO UPDATE SET household_id = excluded.household_id,
        name = excluded.name, display_order = excluded.display_order, guest_type = excluded.guest_type,
        import_batch_id = excluded.import_batch_id, updated_at = CURRENT_TIMESTAMP`)
      .bind(persistedGuestExternalId, persistedHouseholdExternalId, row.guestName, row.displayOrder,
        row.guestType, 1, batchId));
  }
  statements.push(db.prepare(`INSERT INTO audit_events
    (event_id, actor_type, actor_email, action, entity_type, entity_id, details_json)
    VALUES (?, 'admin', ?, 'guest_list.imported', 'import_batch', ?, ?)`)
    .bind(crypto.randomUUID(), email, batchId, JSON.stringify({
      rowCount: validation.rows.length, householdCount: grouped.size, sourceHash,
    })));
  statements.push(db.prepare("UPDATE import_previews SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL")
    .bind(previewToken));

  try {
    await db.batch(statements);
  } catch {
    const current = await existingImportRecords(db);
    if (!currentImportMatches(validation.rows, current)) {
      return json({ error: "The guest list could not be imported. No changes were saved." }, 409);
    }
    await db.prepare("UPDATE import_previews SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL")
      .bind(previewToken).run();
  }
  return json({
    summary, errors: [], households, sourceHash,
  });
}

function csvCell(value: unknown): string {
  let text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  if (/^[=+\-@\t\r]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

async function handleAdminDeliveryExport(request: Request, db: D1Database, env: WeddingApiEnv, email: string): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");
  let rows: Awaited<ReturnType<typeof deliveryRows>>;
  try {
    rows = await deliveryRows(db, request, env);
  } catch {
    return json({ error: "Configure the final HTTPS public site URL before exporting invitation links" }, 503);
  }
  await db.prepare(`INSERT INTO audit_events
    (event_id, actor_type, actor_email, action, entity_type, details_json)
    VALUES (?, 'admin', ?, 'invitation_delivery.exported', 'households', ?)`)
    .bind(crypto.randomUUID(), email, JSON.stringify({ rowCount: rows.length })).run();
  const columns = ["household_external_id", "household_name", "household_greeting", "invited_people", "short_code", "personal_url", "active"];
  const csvRows = rows.map((row) => [
    row.householdExternalId, row.householdName, row.householdGreeting,
    row.invitedPeople, row.shortCode, row.personalUrl, row.active,
  ].map(csvCell).join(","));
  const csv = `\uFEFF${columns.map(csvCell).join(",")}\r\n${csvRows.join("\r\n")}\r\n`;
  return new Response(csv, {
    status: 200,
    headers: responseHeaders("text/csv; charset=utf-8", {
      "content-disposition": "attachment; filename=invitation-delivery.csv",
    }),
  });
}

async function handleAdminPlanningExport(request: Request, db: D1Database, email: string): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const result = await db.prepare(`SELECT
    h.external_id AS householdExternalId,
    h.household_name AS householdName,
    g.external_id AS guestExternalId,
    g.name AS guestName,
    g.guest_type AS guestType,
    g.attendance,
    g.dietary_notes AS dietaryNotes,
    g.meal_choice AS mealChoice,
    g.response_source AS responseSource,
    g.updated_at AS updatedAt
    FROM guests g
    JOIN households h ON h.id = g.household_id
    WHERE h.active = 1 AND g.active = 1
    ORDER BY h.household_name, g.display_order, g.id`).all<{
      householdExternalId: string;
      householdName: string;
      guestExternalId: string;
      guestName: string;
      guestType: string;
      attendance: string;
      dietaryNotes: string;
      mealChoice: string;
      responseSource: string;
      updatedAt: string;
    }>();
  const columns = [
    "household_external_id", "household_name", "guest_external_id", "guest_name",
    "guest_type", "attendance", "dietary_or_accessibility_notes", "meal_choice",
    "response_source", "updated_at",
  ];
  const csvRows = result.results.map((row) => [
    row.householdExternalId, row.householdName, row.guestExternalId, row.guestName,
    row.guestType, row.attendance, row.dietaryNotes, row.mealChoice,
    row.responseSource, row.updatedAt,
  ].map(csvCell).join(","));
  await db.prepare(`INSERT INTO audit_events
    (event_id, actor_type, actor_email, action, entity_type, details_json)
    VALUES (?, 'admin', ?, 'wedding_planning.exported', 'guests', ?)`)
    .bind(crypto.randomUUID(), email, JSON.stringify({ rowCount: result.results.length })).run();
  const csv = `\uFEFF${columns.map(csvCell).join(",")}\r\n${csvRows.join("\r\n")}\r\n`;
  return new Response(csv, {
    status: 200,
    headers: responseHeaders("text/csv; charset=utf-8", {
      "content-disposition": "attachment; filename=wedding-planning.csv",
    }),
  });
}

export async function handleWeddingApi(request: Request, env: WeddingApiEnv): Promise<Response> {
  if (!env.DB) return json({ error: "The invitation service is temporarily unavailable" }, 503);
  const db = env.DB;
  const pathname = new URL(request.url).pathname;
  try {
    if (pathname === "/api/invitation") return handleInvitation(request, db, env);
    if (pathname === "/api/rsvp") return handleRsvp(request, db, env);
    if (pathname === "/api/meals") return handleMeals(request, db, env);

    if (pathname === "/api/admin" || pathname.startsWith("/api/admin/")) {
      const admin = adminEmail(request, env);
      if (admin.response) return admin.response;
      const email = admin.email!;
      if (request.method !== "GET" && request.headers.get("origin") !== new URL(request.url).origin) {
        return json({ error: "Cross-origin administrative requests are not allowed" }, 403);
      }
      if (pathname === "/api/admin") return handleAdminIndex(request, db);
      if (pathname === "/api/admin/retention/purge") return handleAdminRetentionPurge(request, db);
      if (await retentionClosed(db)) {
        return json({ error: "The wedding guest-data retention period has ended" }, 410);
      }
      if (pathname === "/api/admin/settings") return handleAdminSettings(request, db, email);
      if (pathname === "/api/admin/reply") return handleAdminReply(request, db, email);
      if (pathname === "/api/admin/import") return handleAdminImport(request, db, email);
      if (pathname === "/api/admin/export") return handleAdminPlanningExport(request, db, email);
      if (pathname === "/api/admin/delivery-export") return handleAdminDeliveryExport(request, db, env, email);
    }
    return json({ error: "Not found" }, 404);
  } catch {
    return json({ error: "The invitation service could not complete that request. Please try again." }, 500);
  }
}
