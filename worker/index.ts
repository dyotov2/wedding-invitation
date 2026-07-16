/** Cloudflare Worker entry point for the wedding invitation. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type GuestPayload = {
  id: number;
  attendance?: string;
  dietaryNotes?: string;
  mealChoice?: string;
  responseSource?: string;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

async function prepareDatabase(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS households (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      household_name TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      household_id INTEGER NOT NULL REFERENCES households(id),
      name TEXT NOT NULL,
      attendance TEXT NOT NULL DEFAULT 'pending',
      dietary_notes TEXT NOT NULL DEFAULT '',
      meal_choice TEXT NOT NULL DEFAULT '',
      response_source TEXT NOT NULL DEFAULT 'website',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS wedding_settings (
      id INTEGER PRIMARY KEY,
      meal_phase_open INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS guests_household_idx ON guests(household_id)"),
  ]);
  await db.prepare("INSERT OR IGNORE INTO households (id, code, household_name) VALUES (1, 'ROSE27', 'The Petrov Family')").run();
  await db.prepare("INSERT OR IGNORE INTO guests (id, household_id, name) VALUES (1, 1, 'Elena Petrova')").run();
  await db.prepare("INSERT OR IGNORE INTO guests (id, household_id, name) VALUES (2, 1, 'Nikolay Petrov')").run();
  await db.prepare("INSERT OR IGNORE INTO wedding_settings (id, meal_phase_open) VALUES (1, 0)").run();
}

async function getHousehold(db: D1Database, code: string) {
  const household = await db.prepare("SELECT id, code, household_name AS householdName FROM households WHERE UPPER(code) = UPPER(?)").bind(code).first<{ id: number; code: string; householdName: string }>();
  if (!household) return null;
  const guestRows = await db.prepare(`SELECT id, name, attendance, dietary_notes AS dietaryNotes,
    meal_choice AS mealChoice, response_source AS responseSource FROM guests WHERE household_id = ? ORDER BY id`).bind(household.id).all();
  return { ...household, guests: guestRows.results };
}

async function listHouseholds(db: D1Database) {
  const rows = await db.prepare("SELECT id, code, household_name AS householdName FROM households ORDER BY household_name").all<{ id: number; code: string; householdName: string }>();
  const result = [];
  for (const household of rows.results) {
    const guests = await db.prepare(`SELECT id, name, attendance, dietary_notes AS dietaryNotes,
      meal_choice AS mealChoice, response_source AS responseSource FROM guests WHERE household_id = ? ORDER BY id`).bind(household.id).all();
    result.push({ ...household, guests: guests.results });
  }
  return result;
}

async function parseBody(request: Request) {
  try { return await request.json() as Record<string, unknown>; }
  catch { return null; }
}

async function handleApi(request: Request, env: Env) {
  if (!env.DB) return json({ error: "Database unavailable" }, 503);
  await prepareDatabase(env.DB);
  const url = new URL(request.url);
  const isAdminRoute = url.pathname.startsWith("/api/admin");
  const authenticatedEmail = request.headers.get("oai-authenticated-user-email");
  if (isAdminRoute && !authenticatedEmail) return json({ error: "Sign in required" }, 401);

  if (request.method === "GET" && url.pathname === "/api/invitation") {
    const code = url.searchParams.get("code")?.trim() ?? "";
    if (!code) return json({ error: "Invitation code required" }, 400);
    const household = await getHousehold(env.DB, code);
    const setting = await env.DB.prepare("SELECT meal_phase_open AS mealPhaseOpen FROM wedding_settings WHERE id = 1").first<{ mealPhaseOpen: number }>();
    return household ? json({ household, mealPhaseOpen: Boolean(setting?.mealPhaseOpen) }) : json({ error: "Invitation not found" }, 404);
  }

  if (request.method === "POST" && (url.pathname === "/api/rsvp" || url.pathname === "/api/meals")) {
    const body = await parseBody(request);
    const code = typeof body?.code === "string" ? body.code : "";
    const guests = Array.isArray(body?.guests) ? body.guests as GuestPayload[] : [];
    if (!code || guests.length === 0 || guests.length > 30) return json({ error: "Invalid invitation reply" }, 400);
    const household = await getHousehold(env.DB, code);
    if (!household) return json({ error: "Invitation not found" }, 404);
    if (url.pathname === "/api/meals") {
      const setting = await env.DB.prepare("SELECT meal_phase_open AS mealPhaseOpen FROM wedding_settings WHERE id = 1").first<{ mealPhaseOpen: number }>();
      if (!setting?.mealPhaseOpen) return json({ error: "Meal choices are not open" }, 403);
    }
    for (const guest of guests) {
      if (!Number.isInteger(guest.id)) continue;
      if (url.pathname === "/api/rsvp") {
        const attendance = ["pending", "attending", "declined"].includes(guest.attendance ?? "") ? guest.attendance : "pending";
        const dietaryNotes = typeof guest.dietaryNotes === "string" ? guest.dietaryNotes.trim().slice(0, 500) : "";
        await env.DB.prepare(`UPDATE guests SET attendance = ?, dietary_notes = ?, response_source = 'website', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND household_id = ?`).bind(attendance, dietaryNotes, guest.id, household.id).run();
      } else {
        const mealChoice = ["garden", "estate", "little"].includes(guest.mealChoice ?? "") ? guest.mealChoice : "";
        await env.DB.prepare(`UPDATE guests SET meal_choice = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND household_id = ? AND attendance = 'attending'`).bind(mealChoice, guest.id, household.id).run();
      }
    }
    return json(await getHousehold(env.DB, code));
  }

  if (request.method === "GET" && url.pathname === "/api/admin") {
    const setting = await env.DB.prepare("SELECT meal_phase_open AS mealPhaseOpen FROM wedding_settings WHERE id = 1").first<{ mealPhaseOpen: number }>();
    return json({ households: await listHouseholds(env.DB), mealPhaseOpen: Boolean(setting?.mealPhaseOpen) });
  }

  if (request.method === "POST" && url.pathname === "/api/admin/settings") {
    const body = await parseBody(request);
    await env.DB.prepare("UPDATE wedding_settings SET meal_phase_open = ? WHERE id = 1").bind(body?.mealPhaseOpen ? 1 : 0).run();
    return json({ ok: true });
  }

  if (request.method === "POST" && url.pathname === "/api/admin/reply") {
    const body = await parseBody(request);
    const guestId = Number(body?.guestId);
    const attendance = typeof body?.attendance === "string" && ["pending", "attending", "declined"].includes(body.attendance) ? body.attendance : "pending";
    const responseSource = typeof body?.responseSource === "string" && ["website", "phone", "whatsapp", "viber", "paper"].includes(body.responseSource) ? body.responseSource : "phone";
    if (!Number.isInteger(guestId)) return json({ error: "Guest required" }, 400);
    await env.DB.prepare("UPDATE guests SET attendance = ?, response_source = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(attendance, responseSource, guestId).run();
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
