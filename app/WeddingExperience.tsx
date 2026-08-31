"use client";

import { createContext, ReactNode, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";

import { COPY, type Copy, type Lang, type StatusKey } from "./copy";

const LANG_STORAGE_KEY = "wedding-lang";
const LangContext = createContext<Lang>("en");
const useCopy = () => COPY[useContext(LangContext)];

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (lang: Lang) => void }) {
  const c = useCopy();
  return (
    <div className="lang-toggle" role="group" aria-label={c.toggle.aria}>
      <button type="button" aria-pressed={lang === "en"} onClick={() => onChange("en")}>EN</button>
      <button type="button" aria-pressed={lang === "bg"} onClick={() => onChange("bg")}>БГ</button>
    </div>
  );
}

type Attendance = "pending" | "attending" | "declined";
type ReplySource = "website" | "phone" | "whatsapp" | "viber" | "paper";

type Guest = {
  id: number;
  name: string;
  guestType: "adult" | "child" | "infant";
  attendance: Attendance;
  dietaryNotes: string;
  mealChoice: string;
  responseSource: ReplySource;
};

type Household = {
  id: number;
  credential: string;
  responseVersion: number;
  householdName: string;
  greeting?: string;
  guests: Guest[];
};

type InvitationResponse = {
  household: Household;
  mealPhaseOpen: boolean;
  mealOptions: MealOption[];
  contacts: ContactAction[];
  deletionDate: string;
};

type ContactAction = {
  key: "whatsapp" | "viber" | "phone";
  href: string;
};

type MealOption = {
  optionKey: string;
  name: string;
  description: string;
  guestType: "all" | Guest["guestType"];
  displayOrder: number;
};

type SaveState = "idle" | "saving" | "success" | "error" | "conflict";
type InvitationGateState = "checking" | "missing" | "invalid" | "unavailable";
type InvitationGateFailure = {
  credential: string;
  retryAttempt: number;
  state: Extract<InvitationGateState, "invalid" | "unavailable">;
};

type StoredGuestDraft = Pick<Guest, "id" | "attendance" | "dietaryNotes" | "mealChoice">;

type StoredRsvpDraft = {
  householdId: number;
  responseVersion: number;
  savedAt: number;
  guests: StoredGuestDraft[];
};

const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DATA_DELETION_TIME = new Date("2027-06-27T00:00:00Z").getTime();
const CEREMONY_TIME = new Date("2027-06-20T15:30:00+03:00").getTime();
const SERVER_CREDENTIAL_SNAPSHOT = "__invitation_location_pending__";

class InvitationRequestError extends Error {
  constructor(readonly status: number) {
    super("invitation unavailable");
  }
}

function preserveCredential(invitation: InvitationResponse, credential: string): InvitationResponse {
  return {
    ...invitation,
    household: { ...invitation.household, credential },
  };
}

async function fetchInvitation(credential: string): Promise<InvitationResponse> {
  const response = await fetch("/api/invitation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credential }),
  });

  if (!response.ok) throw new InvitationRequestError(response.status);

  return preserveCredential((await response.json()) as InvitationResponse, credential);
}

function credentialFromLocation(): string {
  const hashMatch = window.location.hash.match(/^#invite(?:=|\/)(.+)$/);
  if (hashMatch?.[1]) {
    try {
      return decodeURIComponent(hashMatch[1]).trim();
    } catch {
      return "";
    }
  }

  const legacyCode = new URLSearchParams(window.location.search).get("code")?.trim();
  return legacyCode ?? "";
}

function subscribeToCredentialChange(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

function serverCredentialSnapshot() {
  return SERVER_CREDENTIAL_SNAPSHOT;
}

function setCredentialInAddressBar(credential: string) {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.hash = `invite=${encodeURIComponent(credential)}`;
  const search = url.searchParams.toString();
  window.history.replaceState(window.history.state, "", `${url.pathname}${search ? `?${search}` : ""}${url.hash}`);
}

function safeRemoveStoredDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage can be blocked entirely; the invitation must keep working without drafts.
  }
}

function removeLegacyCredentialDrafts() {
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith("wedding-rsvp-draft:")) continue;
      const suffix = key.slice("wedding-rsvp-draft:".length);
      const value = window.localStorage.getItem(key);
      const parsed = value ? JSON.parse(value) as Record<string, unknown> : null;
      const savedAt = typeof parsed?.savedAt === "number" ? parsed.savedAt : 0;
      const expired = Date.now() >= DATA_DELETION_TIME || savedAt <= 0 || Date.now() - savedAt > DRAFT_MAX_AGE_MS;
      if (!/^\d+$/.test(suffix) || parsed?.credential || parsed?.code || expired) window.localStorage.removeItem(key);
    }
  } catch {
    // Draft recovery is optional; privacy-safe failure is to leave it unused.
  }
}

type BotanicalVariant = "cluster" | "sprig" | "corner";

const botanicalSources: Record<BotanicalVariant, string> = {
  cluster: "/botanical-cluster-v1.webp",
  sprig: "/botanical-sprig-v1.webp",
  corner: "/botanical-corner-v1.webp",
};

const botanicalDimensions: Record<BotanicalVariant, { width: number; height: number }> = {
  cluster: { width: 1149, height: 1369 },
  sprig: { width: 864, height: 1821 },
  corner: { width: 1536, height: 1024 },
};

function BotanicalPhoto({ variant = "cluster", className = "", priority = false }: { variant?: BotanicalVariant; className?: string; priority?: boolean }) {
  const dimensions = botanicalDimensions[variant];
  return (
    <Image
      className={`botanical-photo botanical-photo--${variant} ${className}`}
      src={botanicalSources[variant]}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={dimensions.width}
      height={dimensions.height}
      unoptimized
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      onError={(event) => { event.currentTarget.hidden = true; }}
    />
  );
}

const contactMarks = { whatsapp: "W", viber: "V", phone: "☎" } as const;

function ContactActions({ contacts }: { contacts: ContactAction[] }) {
  const c = useCopy();
  if (contacts.length === 0) return null;

  return (
    <div className="contact-area">
      <p className="eyebrow">{c.contacts.prompt}</p>
      <div className="contact-actions" aria-label={c.contacts.aria}>
        {contacts.map((contact) => (
          <a key={contact.key} className={`contact-button ${contact.key}`} href={contact.href} rel="noreferrer">
            <span aria-hidden="true">{contactMarks[contact.key]}</span> {contact.key === "phone" ? c.contacts.phone : contact.key === "whatsapp" ? "WhatsApp" : "Viber"}
          </a>
        ))}
      </div>
    </div>
  );
}

function InvitationGate({ state, onRetry }: { state: InvitationGateState; onRetry: () => void }) {
  const c = useCopy();
  const checking = state === "checking";
  return (
    <main className={`invitation-gate gate-${state}`} aria-busy={checking}>
      <BotanicalPhoto className="gate-botanical gate-botanical-one" priority />
      <BotanicalPhoto variant="sprig" className="gate-botanical gate-botanical-two" />
      <section className="gate-card" aria-labelledby="gate-title">
        <p className="eyebrow">{c.gate.eyebrow}</p>
        <p className="gate-names" aria-label={c.names.coupleAria}>
          <span>{c.names.her}</span><small>&amp;</small><span>{c.names.him}</span>
        </p>
        <p className="gate-date">20 · 06 · 2027</p>
        <div className="gate-divider" aria-hidden="true"><span /></div>
        <div className="gate-message" role={checking ? "status" : "alert"} aria-live="polite">
          {checking && <span className="gate-loader" aria-hidden="true" />}
          <h1 id="gate-title">{c.gate.titles[state]}</h1>
          <p>{c.gate.messages[state]}</p>
        </div>
        {(state === "invalid" || state === "unavailable") && (
          <button className="gate-retry" type="button" onClick={onRetry}>{c.gate.retry}</button>
        )}
        <p className="privacy-note">{c.gate.privacy}</p>
      </section>
      <p className="gate-footer">{c.gate.footer}</p>
    </main>
  );
}

function statusLabel(c: Copy, attendance: Attendance): string {
  if (attendance === "attending") return c.guest.statusAttending;
  if (attendance === "declined") return c.guest.statusDeclined;
  return c.guest.statusPending;
}

function GuestRsvp({ guest, onChange }: { guest: Guest; onChange: (guest: Guest) => void }) {
  const c = useCopy();
  const select = (attendance: Attendance) => onChange({ ...guest, attendance });
  const answered = guest.attendance !== "pending";

  return (
    <article className={`guest-card ${guest.attendance}`}>
      <div className="guest-card-head">
        <span className="guest-avatar" aria-hidden="true">
          {guest.name.slice(0, 1)}
          {guest.attendance === "attending" && <span className="guest-avatar-badge">✓</span>}
        </span>
        <div className="guest-card-name">
          <h3>{guest.name}</h3>
          <p className={answered ? `is-${guest.attendance}` : "is-pending"}>{statusLabel(c, guest.attendance)}</p>
        </div>
      </div>
      <div className="attendance-buttons" role="group" aria-label={c.guest.attendanceAria(guest.name)}>
        <button type="button" aria-pressed={guest.attendance === "attending"} className={guest.attendance === "attending" ? "selected yes" : ""} onClick={() => select("attending")}>
          <span aria-hidden="true">✓</span> {c.guest.yes}
        </button>
        <button type="button" aria-pressed={guest.attendance === "declined"} className={guest.attendance === "declined" ? "selected no" : ""} onClick={() => select("declined")}>
          <span aria-hidden="true">×</span> {c.guest.no}
        </button>
      </div>
      {guest.attendance === "attending" && (
        <div className="notes-field">
          <label htmlFor={`notes-${guest.id}`}>{c.guest.notesLabel}</label>
          <textarea
            id={`notes-${guest.id}`}
            value={guest.dietaryNotes}
            onChange={(event) => onChange({ ...guest, dietaryNotes: event.target.value })}
            placeholder={c.guest.notesPlaceholder}
            maxLength={500}
            rows={2}
          />
        </div>
      )}
    </article>
  );
}

function VenueScene() {
  const c = useCopy();
  return (
    <div className="venue-scene" aria-label={c.venue.sceneAria}>
      <div className="scene-fade scene-fade-top" aria-hidden="true" />
      <div className="scene-fade scene-fade-bottom" aria-hidden="true" />
      <div className="scene-sky scene-sky-day" aria-hidden="true" />
      <div className="scene-sky scene-sky-sunset" aria-hidden="true" />
      <div className="scene-sky scene-sky-night" aria-hidden="true" />
      <div className="scene-stars" aria-hidden="true">
        {[[12, 14, 3, 2.6], [26, 9, 2, 3.4], [40, 20, 3, 2.7], [58, 12, 2, 3.1], [82, 16, 3, 2.9], [70, 26, 2, 3.6], [33, 32, 2, 3.2], [90, 30, 2, 2.6]].map(([left, top, size, dur], index) => (
          <span key={index} style={{ left: `${left}%`, top: `${top}%`, width: `${size}px`, height: `${size}px`, animationDuration: `${dur}s`, animationDelay: `${-index * 0.4}s` }} />
        ))}
      </div>
      <span className="scene-sun" aria-hidden="true" />
      <span className="scene-moon" aria-hidden="true" />
      <span className="scene-hill scene-hill-one" aria-hidden="true" />
      <span className="scene-hill scene-hill-two" aria-hidden="true" />
      <div className="scene-dusk" aria-hidden="true" />
      <span className="scene-vine-row scene-row-one" aria-hidden="true" />
      <span className="scene-vine-row scene-row-two" aria-hidden="true" />
      <span className="scene-vine-row scene-row-three" aria-hidden="true" />
      <div className="scene-lights" aria-hidden="true">
        <span className="scene-lights-wire" />
        {[[8, 19], [20, 24], [33, 28], [45, 30], [58, 30], [70, 28], [82, 24], [94, 19]].map(([left, top], index) => (
          <span key={index} className="scene-bulb" style={{ left: `${left}%`, top: `${top}px`, animationDelay: `${-index * 0.3}s` }} />
        ))}
      </div>
      <div className="scene-fireflies" aria-hidden="true">
        {[[22, 52, 6, 7], [48, 60, 5, 8.2], [66, 54, 6, 6.6], [80, 62, 5, 7.6]].map(([left, top, size, dur], index) => (
          <span key={index} style={{ left: `${left}%`, top: `${top}%`, width: `${size}px`, height: `${size}px`, animationDuration: `${dur}s`, animationDelay: `${-index * 0.7}s` }} />
        ))}
      </div>
      <div className="scene-botanicals" aria-hidden="true">
        <BotanicalPhoto className="scene-botanical scene-botanical-one" />
        <BotanicalPhoto variant="corner" className="scene-botanical scene-botanical-two" />
      </div>
      <p className="scene-label">{c.venue.sceneName}<br /><small>{c.venue.sceneTag}</small></p>
    </div>
  );
}

// --- Our love story ("4A") ---------------------------------------------------
// A scroll-grown vine of milestones ending in an engagement photo framed by a
// procedurally drawn floral arch. Flower/vine/arch geometry is generated in an
// effect (ported from the design prototype), scoped to this section, no-JS-safe
// (copy + photo stay visible without JS), reduced-motion aware, and the loop
// only runs while the section is near the viewport.
const SVG_NS = "http://www.w3.org/2000/svg";

function lsPetalPath(type: "rose" | "tulip", h: number): string {
  const w = h / 2;
  if (type === "rose") return `M 0,0 C ${-w / 1.5},${-h / 3} ${-w},${-h} 0,${-h} C ${w},${-h} ${w / 1.5},${-h / 3} 0,0`;
  if (type === "tulip") return `M 0,0 C ${-w / 2},${-h / 2} ${-w / 3},${-h} 0,${-h * 1.2} C ${w / 3},${-h} ${w / 2},${-h / 2} 0,0`;
  return `M 0,0 C ${-w / 2},${-h / 2} ${-w / 2},${-h} 0,${-h} C ${w},${-h} ${w / 2},${-h / 2} 0,0`;
}

// [left, top, size, hue] per flower in a milestone's cluster; the label and
// text for each entry live in copy.ts (story.milestones, same order).
const LS_MILESTONES: Array<{ year: string; cluster: [number, number, number, number][] }> = [
  { year: "2015", cluster: [[0, 0, 58, 22], [26, 60, 34, 22], [2, 92, 26, 82]] },
  { year: "2018", cluster: [[0, 0, 58, 309], [24, 58, 34, 309], [0, 90, 26, 22]] },
  { year: "2023", cluster: [[0, 0, 58, 82], [26, 60, 34, 82], [2, 92, 26, 309]] },
  { year: "2025", cluster: [[0, 0, 62, 18], [26, 62, 34, 22], [2, 94, 26, 18]] },
];

// [hue, size, at, side, off] for each bloom seated on the photo arch.
const LS_ARCH_FLOWERS: [number, number, number, number, number][] = [
  [18, 64, 0.985, 0, 0], [22, 34, 0.94, 1, 9], [309, 26, 0.9, -1, -8], [22, 46, 0.16, -1, -7],
  [82, 30, 0.23, -1, 8], [309, 24, 0.1, -1, 7], [309, 40, 0.66, 1, 10], [22, 28, 0.72, 1, -6], [82, 22, 0.6, 1, 9],
];

function LoveStory() {
  const c = useCopy();
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // The garden is painted with raw oklch() presentation attributes, which
    // engines without oklch support render as BLACK fills. On those (old
    // Viber/WhatsApp WebViews) skip the drawing entirely: the copy and the
    // photo are the no-JS-safe core and stay fully readable.
    const oklchOk = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("color", "oklch(50% 0 0)");
    if (!oklchOk) {
      root.querySelectorAll<HTMLElement>("[data-copy],[data-locket]").forEach((el) => el.classList.add("is-in"));
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
    let running = false;
    let raf = 0;
    let timer = 0;
    let dirty = true;
    let lastKey = "";
    let frames = 0;
    let forceOpen = reduce;
    let archProgress = 0;

    if (!reduce) root.classList.add("ls-animate");

    const buildFlowers = () => {
      root.querySelectorAll<HTMLElement>("[data-flower]").forEach((host) => {
        if (host.dataset.built) return;
        host.dataset.built = "1";
        const size = Number(host.getAttribute("data-size")) || 48;
        const hue = host.getAttribute("data-hue") || "22";
        const outerH = size * 0.42, innerH = size * 0.27, pad = size * 0.1;
        const half = outerH + pad;
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", `${-half} ${-half} ${half * 2} ${half * 2}`);
        svg.setAttribute("width", String(size));
        svg.setAttribute("height", String(size));
        svg.style.display = "block";
        svg.style.overflow = "visible";
        const outerCount = size > 44 ? 8 : 6;
        for (let i = 0; i < outerCount; i += 1) {
          const p = document.createElementNS(SVG_NS, "path");
          p.setAttribute("d", lsPetalPath("rose", outerH));
          p.setAttribute("data-petal", "outer");
          p.setAttribute("data-a", String((360 / outerCount) * i));
          p.setAttribute("data-i", String(i));
          p.setAttribute("transform", `rotate(${(360 / outerCount) * i}) scale(0)`);
          p.setAttribute("fill", `oklch(95% 0.012 ${hue})`);
          svg.appendChild(p);
        }
        for (let i = 0; i < 5; i += 1) {
          const a = (360 / 5) * i + 18;
          const p = document.createElementNS(SVG_NS, "path");
          p.setAttribute("d", lsPetalPath("tulip", innerH));
          p.setAttribute("data-petal", "inner");
          p.setAttribute("data-a", String(a));
          p.setAttribute("data-i", String(i));
          p.setAttribute("transform", `rotate(${a}) scale(0)`);
          p.setAttribute("fill", `oklch(96% 0.015 ${hue})`);
          svg.appendChild(p);
        }
        const ring = document.createElementNS(SVG_NS, "circle");
        ring.setAttribute("data-pistil", "");
        ring.setAttribute("r", String(size * 0.1));
        ring.setAttribute("fill", "oklch(78% 0.085 86)");
        ring.setAttribute("transform", "scale(0)");
        svg.appendChild(ring);
        const eye = document.createElementNS(SVG_NS, "circle");
        eye.setAttribute("data-pistil", "");
        eye.setAttribute("r", String(size * 0.05));
        eye.setAttribute("fill", "oklch(90% 0.05 92)");
        eye.setAttribute("transform", "scale(0)");
        svg.appendChild(eye);
        host.appendChild(svg);
        host.style.transformOrigin = "50% 80%";
      });
    };

    // The timeline vine is regenerated at the holder's native pixel size (the
    // old fixed 64x800 viewBox was stretched to fit, elongating every leaf on
    // tall screens). Three strands — a soft halo, the main stem, and a thin
    // companion that weaves across it — plus leaves with a midrib highlight
    // that rustle via CSS, tendrils, and blossom buds echoing the milestone
    // flowers. The static path in the JSX stays as the no-JS fallback and is
    // only removed once a build succeeds.
    const buildVines = () => {
      root.querySelectorAll<SVGSVGElement>("[data-vine]").forEach((svg) => {
        const box = svg.getBoundingClientRect();
        const w = Math.round(box.width) || 64;
        const h = Math.round(box.height);
        if (svg.dataset.built) {
          if (Math.abs(h - Number(svg.dataset.builtH || 0)) < 64) return;
          delete svg.dataset.built;
          svg.innerHTML = "";
        }
        if (h < 300) return;
        const gen = document.createElementNS(SVG_NS, "g");
        svg.appendChild(gen);
        let seed = 11;
        const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
        const TONES = ["oklch(41% 0.05 133)", "oklch(47% 0.058 132)", "oklch(53% 0.062 134)", "oklch(59% 0.055 131)", "oklch(64% 0.038 146)"];
        const BUDS = ["oklch(72% 0.105 22)", "oklch(68% 0.1 309)", "oklch(78% 0.08 18)"];
        type Pt = { x: number; y: number };
        const spline = (pts: Pt[]) => {
          let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
          for (let i = 0; i < pts.length - 1; i += 1) {
            const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
            d += ` C ${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)}`
              + ` ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)}`
              + ` ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
          }
          return d;
        };
        const wander = (phase: number, amp: number, top: number, bottom: number): Pt[] => {
          const pts: Pt[] = [];
          const steps = Math.max(6, Math.round((bottom - top) / 105));
          for (let i = 0; i <= steps; i += 1) {
            const t = i / steps;
            pts.push({
              x: w / 2 + Math.sin(i * 1.05 + phase) * amp * (0.75 + rnd() * 0.5),
              y: top + (bottom - top) * t + (i > 0 && i < steps ? (rnd() - 0.5) * 26 : 0),
            });
          }
          return pts;
        };
        const strand = (d: string, stroke: string, width: number) => {
          const p = document.createElementNS(SVG_NS, "path");
          p.setAttribute("d", d);
          p.setAttribute("fill", "none");
          p.setAttribute("stroke", stroke);
          p.setAttribute("stroke-width", String(width));
          p.setAttribute("stroke-linecap", "round");
          p.setAttribute("data-stem", "");
          gen.appendChild(p);
          return p;
        };
        const el = (name: string, attrs: Record<string, string>, parent: Element) => {
          const node = document.createElementNS(SVG_NS, name);
          for (const k in attrs) node.setAttribute(k, attrs[k]);
          parent.appendChild(node);
          return node;
        };
        // Smooth grapevine curl: a slim lead-in arc, then a spiral that
        // tightens into its own centre (the old coarse polyline read as a
        // scribbled knot at display size).
        const tendrilPath = (dir: number, size: number) => {
          const pts: Pt[] = [];
          for (let s = 0; s <= 10; s += 1) { const t = s / 10; pts.push({ x: dir * 3.6 * Math.sin(t * 1.5) * size, y: -9 * t * size }); }
          const e = pts[pts.length - 1];
          const r0 = 3.9 * size;
          for (let s = 1; s <= 44; s += 1) {
            const t = s / 44, th = Math.PI / 2 + dir * t * 1.55 * 2 * Math.PI, r = r0 * (1 - 0.86 * t);
            pts.push({ x: e.x + r * Math.cos(th), y: e.y - r0 + r * Math.sin(th) });
          }
          return "M " + pts.map((pp) => `${pp.x.toFixed(2)},${pp.y.toFixed(2)}`).join(" L ");
        };
        const tendril = (px: number, py: number, rot: number, dir: number, size: number, growAt: number) => {
          el("path", {
            d: tendrilPath(dir, size), fill: "none", stroke: "oklch(52% 0.055 133)",
            "stroke-width": "1.2", "stroke-linecap": "round", "stroke-linejoin": "round",
            "data-grow": String(growAt), "data-base": `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${rot.toFixed(1)})`,
          }, gen).setAttribute("transform", `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(0)`);
        };
        // Pointed almond leaf on a short stalk, optional smaller companion
        // leaflet, curved midrib on the larger leaves.
        const leafPath = (l: number, wHalf: number) =>
          `M 0,0 C ${(-wHalf * 0.95).toFixed(2)},${(-l * 0.22).toFixed(2)} ${(-wHalf).toFixed(2)},${(-l * 0.62).toFixed(2)} 0,${(-l).toFixed(2)} C ${wHalf.toFixed(2)},${(-l * 0.62).toFixed(2)} ${(wHalf * 0.95).toFixed(2)},${(-l * 0.22).toFixed(2)} 0,0`;
        const addLeaf = (parent: Element, l: number, wHalf: number, tone: string, pairTone: string | null) => {
          const stalk = Math.max(2.4, l * 0.17);
          el("path", { d: `M 0,0 Q 0.5,${(-stalk * 0.6).toFixed(1)} 0,${(-stalk).toFixed(1)}`, fill: "none", stroke: tone, "stroke-width": "1.05", "stroke-linecap": "round" }, parent);
          const g = el("g", { transform: `translate(0 ${(-stalk).toFixed(1)})` }, parent);
          el("path", { d: leafPath(l, wHalf), fill: tone }, g);
          if (l > 12) el("path", { d: `M 0,${(-l * 0.12).toFixed(1)} Q ${(wHalf * 0.22).toFixed(1)},${(-l * 0.5).toFixed(1)} 0,${(-l * 0.85).toFixed(1)}`, fill: "none", stroke: "oklch(88% 0.03 130 / 0.45)", "stroke-width": "0.7", "stroke-linecap": "round" }, g);
          if (pairTone) {
            const pg = el("g", { transform: "rotate(54)" }, parent);
            el("path", { d: "M 0,0 Q 0.3,-1.2 0,-2.2", fill: "none", stroke: pairTone, "stroke-width": "0.9", "stroke-linecap": "round" }, pg);
            el("path", { d: leafPath(l * 0.52, wHalf * 0.55), fill: pairTone }, el("g", { transform: "translate(0 -2.2)" }, pg));
          }
        };
        // Blossom bud: stalk, three petals, green calyx seating it on the stem.
        const addBud = (parent: Element, budScale: number) => {
          const g = el("g", { transform: `scale(${budScale.toFixed(2)})` }, parent);
          el("path", { d: "M 0,0 Q 0.3,-1.4 0,-2.6", fill: "none", stroke: "oklch(50% 0.06 133)", "stroke-width": "1", "stroke-linecap": "round" }, g);
          el("circle", { cx: "-1.1", cy: "-4.4", r: "1.9", fill: BUDS[0] }, g);
          el("circle", { cx: "1.3", cy: "-4.7", r: "1.6", fill: BUDS[1] }, g);
          el("circle", { cx: "0.1", cy: "-6.3", r: "1.4", fill: BUDS[2] }, g);
          el("path", { d: "M -1.7,-2.2 Q 0,-4.4 1.7,-2.2 Q 0,-1.2 -1.7,-2.2", fill: "oklch(50% 0.06 133)" }, g);
        };
        const mainD = spline(wander(0.6, w * 0.3, 0, h));
        const halo = strand(mainD, "oklch(64% 0.038 146 / 0.22)", 6.5);
        const main = strand(mainD, "oklch(46% 0.058 133)", 2.6);
        const companion = strand(spline(wander(3.4, w * 0.24, h * 0.04, h * 0.985)), "oklch(54% 0.055 132)", 1.5);
        if (!main.getTotalLength || main.getTotalLength() < 10 || companion.getTotalLength() < 10) { svg.removeChild(gen); return; }
        svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
        Array.from(svg.children).forEach((child) => { if (child !== gen) child.remove(); });
        const haloLen = halo.getTotalLength();
        halo.style.strokeDasharray = String(haloLen);
        halo.style.strokeDashoffset = String(haloLen);
        halo.style.transition = "stroke-dashoffset 120ms linear";
        halo.dataset.len = String(haloLen);
        [{ stem: main, gap: 84, scale: 1 }, { stem: companion, gap: 132, scale: 0.72 }].forEach(({ stem, gap, scale }) => {
          const total = stem.getTotalLength();
          stem.style.strokeDasharray = String(total);
          stem.style.strokeDashoffset = String(total);
          stem.style.transition = "stroke-dashoffset 120ms linear";
          stem.dataset.len = String(total);
          const count = Math.max(5, Math.round(total / gap));
          for (let i = 0; i < count; i += 1) {
            const t = (i + 0.6) / (count + 0.4);
            const at = total * t;
            const p = stem.getPointAtLength(at);
            const q = stem.getPointAtLength(Math.min(total, at + 1.5));
            const tangent = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
            const side = i % 2 ? 1 : -1;
            const len = (13 + rnd() * 9) * scale;
            const wHalf = len * (0.28 + rnd() * 0.1);
            const holder = el("g", {
              "data-grow": String(t),
              "data-base": `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${(tangent + 90 + side * (30 + rnd() * 34)).toFixed(1)})`,
            }, gen);
            holder.setAttribute("transform", `${holder.getAttribute("data-base")} scale(0)`);
            const rustle = el("g", { class: "ls-rustle" }, holder) as SVGGElement;
            rustle.style.animationDelay = `-${(rnd() * 7).toFixed(2)}s`;
            const tone = TONES[Math.min(TONES.length - 1, Math.floor(rnd() * TONES.length))];
            const pairTone = stem === main && rnd() > 0.68 ? TONES[Math.min(TONES.length - 1, Math.floor(rnd() * TONES.length))] : null;
            addLeaf(rustle, len, wHalf, tone, pairTone);
            // Tendrils and buds alternate sides per occurrence (their node
            // indices are all odd, so `side` alone would stamp them all the
            // same way) and sit between leaf nodes on clean stem runs.
            if (stem === main && i % 4 === 1) {
              const tSide = Math.floor(i / 4) % 2 ? 1 : -1;
              const ta = Math.min(total - 2, Math.max(2, at + (rnd() - 0.5) * gap * 0.6));
              const tp = stem.getPointAtLength(ta);
              const tq = stem.getPointAtLength(Math.min(total, ta + 1.5));
              const ttan = (Math.atan2(tq.y - tp.y, tq.x - tp.x) * 180) / Math.PI;
              tendril(tp.x, tp.y, ttan + 90 + tSide * 38, tSide, 1 + rnd() * 0.3, t);
            }
            if (stem === main && i % 4 === 3) {
              const bSide = Math.floor(i / 4) % 2 ? 1 : -1;
              const ba = Math.min(total - 2, at + gap * 0.5);
              const bp = stem.getPointAtLength(ba);
              const bq = stem.getPointAtLength(Math.min(total, ba + 1.5));
              const btan = (Math.atan2(bq.y - bp.y, bq.x - bp.x) * 180) / Math.PI;
              const bud = el("g", {
                "data-grow": String(Math.min(0.96, t + 0.04)),
                "data-base": `translate(${bp.x.toFixed(1)} ${bp.y.toFixed(1)}) rotate(${(btan + 90 + bSide * 30).toFixed(1)})`,
              }, gen);
              bud.setAttribute("transform", `${bud.getAttribute("data-base")} scale(0)`);
              addBud(bud, 1.5 + rnd() * 0.3);
            }
          }
        });
        const mainTotal = main.getTotalLength();
        const tip = main.getPointAtLength(mainTotal);
        const pre = main.getPointAtLength(mainTotal - 2);
        const tipBud = document.createElementNS(SVG_NS, "g");
        tipBud.setAttribute("data-grow", "0.93");
        tipBud.setAttribute("data-base", `translate(${tip.x.toFixed(1)} ${tip.y.toFixed(1)}) rotate(${((Math.atan2(tip.y - pre.y, tip.x - pre.x) * 180) / Math.PI + 90).toFixed(1)})`);
        tipBud.setAttribute("transform", `${tipBud.getAttribute("data-base")} scale(0)`);
        addBud(tipBud, 1.8);
        gen.appendChild(tipBud);
        svg.dataset.built = "1";
        svg.dataset.builtH = String(h);
        dirty = true;
      });
    };

    const buildArch = () => {
      const host = root.querySelector<HTMLElement>("[data-arch-host]");
      if (!host || host.dataset.built) return;
      const frame = host.parentElement && host.parentElement.parentElement;
      const card = frame && frame.querySelector<HTMLElement>("[data-locket]");
      if (!card) return;
      const hb = host.getBoundingClientRect(), cb = card.getBoundingClientRect();
      if (hb.width < 40 || cb.width < 40) return;
      host.dataset.built = "1";
      const w = hb.width, h = hb.height;
      const x0 = cb.left - hb.left, y0 = cb.top - hb.top, cw = cb.width, ch = cb.height;
      const cx = x0 + cw / 2, y1 = y0 + ch, r = Math.min(cw / 2, 150), m = 13;

      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
      svg.style.cssText = "display:block;width:100%;height:100%;overflow:visible";
      const gUnder = document.createElementNS(SVG_NS, "g");
      const gStem = document.createElementNS(SVG_NS, "g");
      const gOver = document.createElementNS(SVG_NS, "g");
      svg.appendChild(gUnder); svg.appendChild(gStem); svg.appendChild(gOver);
      host.appendChild(svg);

      let seed = 7;
      const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      const GREENS = ["oklch(41% 0.05 133)", "oklch(47% 0.058 132)", "oklch(53% 0.062 134)", "oklch(59% 0.055 131)", "oklch(64% 0.038 146)"];
      type Pt = { x: number; y: number };
      const spline = (pts: Pt[]) => {
        let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
        for (let i = 0; i < pts.length - 1; i += 1) {
          const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
          d += ` C ${(p1.x + (p2.x - p0.x) / 6).toFixed(2)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(2)}`
            + ` ${(p2.x - (p3.x - p1.x) / 6).toFixed(2)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(2)}`
            + ` ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
        }
        return d;
      };
      const centreline = (dir: number, lift: number): Pt[] => {
        const pts: Pt[] = [];
        pts.push({ x: cx - dir * cw * 0.05, y: y1 + m * 1.05 });
        pts.push({ x: x0 + (dir < 0 ? -m * 0.3 : cw + m * 0.3), y: y1 + m * 0.5 });
        for (let i = 0; i <= 5; i += 1) {
          const t = i / 5;
          pts.push({ x: x0 + (dir < 0 ? -m : cw + m) + dir * lift * t, y: y1 - (ch - r) * t * 0.98 });
        }
        const from = dir < 0 ? 180 : 0;
        for (let i = 1; i <= 12; i += 1) {
          const ang = ((from + (90 - from) * (i / 12)) * Math.PI) / 180;
          const rr = r + m + lift * 0.6;
          pts.push({ x: cx + Math.cos(ang) * rr, y: y0 + r - Math.sin(ang) * rr });
        }
        return pts.map((p, i, arr) => {
          if (i === 0 || i === arr.length - 1) return p;
          const prev = arr[i - 1], next = arr[i + 1];
          const nx = -(next.y - prev.y), ny = next.x - prev.x;
          const len = Math.hypot(nx, ny) || 1;
          const wob = Math.sin(i * 1.05 + (dir < 0 ? 0 : 2.1)) * 3.4 + (rnd() - 0.5) * 1.6;
          return { x: p.x + (nx / len) * wob, y: p.y + (ny / len) * wob };
        });
      };
      const ghost = (d: string) => { const p = document.createElementNS(SVG_NS, "path"); p.setAttribute("d", d); p.setAttribute("fill", "none"); p.setAttribute("stroke", "none"); svg.appendChild(p); return p; };
      const leafAt = (p: Pt, tan: number, angle: number, len: number, tone: string, grow: number, layer: Element, round: boolean) => {
        const el = document.createElementNS(SVG_NS, "path");
        const wdt = len * (round ? 0.72 : 0.4);
        el.setAttribute("d", `M 0,0 C ${-wdt},${-len * 0.28} ${-wdt * (round ? 0.8 : 0.58)},${-len} 0,${-len} C ${wdt * (round ? 0.8 : 0.58)},${-len} ${wdt},${-len * 0.28} 0,0`);
        el.setAttribute("fill", tone);
        el.setAttribute("data-grow", String(grow));
        el.setAttribute("data-base", `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${(tan + 90 + angle).toFixed(1)})`);
        el.setAttribute("transform", `${el.getAttribute("data-base")} scale(0)`);
        layer.appendChild(el);
      };

      const archPaths: Array<{ path: SVGPathElement; dir: number }> = [];
      [-1, 1].forEach((dir) => {
        const heavyLow = dir < 0;
        [0, 5.5].forEach((lift, strand) => {
          const line = ghost(spline(centreline(dir, lift)));
          const total = line.getTotalLength();
          if (strand === 0) archPaths.push({ path: line, dir });
          const segs = 8;
          for (let s = 0; s < segs; s += 1) {
            const a = (s / segs) * total, b = ((s + 1) / segs) * total;
            const sub: Pt[] = [];
            for (let i = 0; i <= 14; i += 1) sub.push(line.getPointAtLength(a + ((b - a) * i) / 14));
            const seg = document.createElementNS(SVG_NS, "path");
            seg.setAttribute("d", spline(sub));
            seg.setAttribute("fill", "none");
            seg.setAttribute("stroke", strand ? "oklch(45% 0.05 133)" : "oklch(39% 0.05 133)");
            seg.setAttribute("stroke-width", ((strand ? 2.1 : 3.1) - (s / (segs - 1)) * (strand ? 1.1 : 1.8)).toFixed(2));
            seg.setAttribute("stroke-linecap", "round");
            const len = seg.getTotalLength();
            seg.dataset.len = String(len);
            seg.dataset.segStart = String(s / segs);
            seg.dataset.segEnd = String((s + 1) / segs);
            seg.style.strokeDasharray = String(len);
            seg.style.strokeDashoffset = String(len);
            seg.style.transition = "stroke-dashoffset 110ms linear";
            seg.setAttribute("data-arch-seg", "");
            gStem.appendChild(seg);
          }
          const nodes = 13;
          for (let i = 0; i < nodes; i += 1) {
            const t = 0.05 + (i / nodes) * 0.93 + (rnd() - 0.5) * 0.035;
            const at = total * Math.min(0.995, Math.max(0.02, t));
            const p = line.getPointAtLength(at);
            const q = line.getPointAtLength(Math.min(total, at + 1.5));
            const tan = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
            const weight = heavyLow ? 1.25 - t * 0.5 : 0.78 + t * 0.55;
            const count = Math.max(2, Math.round((2 + rnd() * 2.4) * weight));
            for (let k = 0; k < count; k += 1) {
              const out = k % 2 ? 1 : -1;
              const fan = out * (26 + k * 15 + rnd() * 22);
              const len = (9 + rnd() * 11) * (0.85 + weight * 0.3) * (strand ? 0.82 : 1);
              const round = rnd() > 0.62;
              const toneIdx = Math.min(GREENS.length - 1, Math.floor(rnd() * GREENS.length));
              const under = k < 2;
              leafAt(p, tan, fan, len, GREENS[under ? Math.max(0, toneIdx - 1) : toneIdx], t, under ? gUnder : gOver, round);
            }
            if (i % 4 === 2 && strand === 0) {
              const dirOut = i % 8 === 2 ? 1 : -1;
              const blen = 16 + rnd() * 16;
              const br = document.createElementNS(SVG_NS, "path");
              br.setAttribute("d", `M 0,0 Q ${dirOut * blen * 0.35},${-blen * 0.55} ${dirOut * blen * 0.75},${-blen}`);
              br.setAttribute("fill", "none");
              br.setAttribute("stroke", "oklch(46% 0.05 133)");
              br.setAttribute("stroke-width", "1.5");
              br.setAttribute("stroke-linecap", "round");
              br.setAttribute("data-grow", String(t));
              br.setAttribute("data-base", `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${(tan + 90 + dirOut * 40).toFixed(1)})`);
              br.setAttribute("transform", `${br.getAttribute("data-base")} scale(0)`);
              gOver.appendChild(br);
              for (let b = 1; b <= 3; b += 1) {
                const bp = { x: p.x + Math.cos(((tan + 90 + dirOut * 40 - 90) * Math.PI) / 180) * blen * 0.28 * b, y: p.y + Math.sin(((tan + 90 + dirOut * 40 - 90) * Math.PI) / 180) * blen * 0.28 * b };
                leafAt(bp, tan, dirOut * (40 + b * 12), 8 + rnd() * 5, GREENS[3], t, gOver, rnd() > 0.5);
              }
            }
            if (i % 5 === 3 && t < 0.78 && strand === 0) {
              const out = dir;
              const c = document.createElementNS(SVG_NS, "path");
              const cpts: Pt[] = [];
              for (let s2 = 0; s2 <= 10; s2 += 1) { const tt = s2 / 10; cpts.push({ x: out * 2.9 * Math.sin(tt * 1.5), y: -7.2 * tt }); }
              const ce = cpts[cpts.length - 1];
              for (let s2 = 1; s2 <= 40; s2 += 1) {
                const tt = s2 / 40, th = Math.PI / 2 + out * tt * 1.55 * 2 * Math.PI, r2 = 3.1 * (1 - 0.86 * tt);
                cpts.push({ x: ce.x + r2 * Math.cos(th), y: ce.y - 3.1 + r2 * Math.sin(th) });
              }
              c.setAttribute("d", "M " + cpts.map((cp) => `${cp.x.toFixed(2)},${cp.y.toFixed(2)}`).join(" L "));
              c.setAttribute("stroke-linejoin", "round");
              c.setAttribute("fill", "none");
              c.setAttribute("stroke", "oklch(55% 0.05 133)");
              c.setAttribute("stroke-width", "1.3");
              c.setAttribute("stroke-linecap", "round");
              c.setAttribute("data-grow", String(t));
              c.setAttribute("data-base", `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${(tan + 90 + out * 20).toFixed(1)})`);
              c.setAttribute("transform", `${c.getAttribute("data-base")} scale(0)`);
              gOver.appendChild(c);
            }
          }
        });
      });

      host.parentElement?.querySelectorAll<HTMLElement>("[data-flower][data-at]").forEach((f) => {
        const fdir = Number(f.getAttribute("data-side"));
        const entry = archPaths.find((p) => (fdir === 0 ? p.dir === -1 : p.dir === fdir)) || archPaths[0];
        const total = entry.path.getTotalLength();
        const at = Number(f.getAttribute("data-at"));
        const off = Number(f.getAttribute("data-off") || 0);
        const p = entry.path.getPointAtLength(total * Math.min(at, 0.999));
        const q = entry.path.getPointAtLength(Math.min(total, total * Math.min(at, 0.999) + 2));
        const nx = -(q.y - p.y), ny = q.x - p.x;
        const nl = Math.hypot(nx, ny) || 1;
        const size = Number(f.getAttribute("data-size")) || 40;
        f.style.left = `${(p.x + (nx / nl) * off - size / 2).toFixed(1)}px`;
        f.style.top = `${(p.y + (ny / nl) * off - size / 2).toFixed(1)}px`;
        f.dataset.archAt = String(at);
      });
    };

    const paintFlower = (host: HTMLElement, progress: number) => {
      const hue = host.getAttribute("data-hue") || "22";
      const back = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 + 1.9 * Math.pow(t - 1, 3) + 1.05 * Math.pow(t - 1, 2));
      host.querySelectorAll<SVGPathElement>("[data-petal]").forEach((petal) => {
        const inner = petal.getAttribute("data-petal") === "inner";
        const i = Number(petal.getAttribute("data-i")) || 0;
        const a = Number(petal.getAttribute("data-a")) || 0;
        const cfg = inner
          ? { p0: 0.24, span: 0.3, step: 0.035, l0: 96, l1: 72, c0: 0.015, c1: 0.135 }
          : { p0: 0.42, span: 0.32, step: 0.028, l0: 95, l1: 83, c0: 0.012, c1: 0.088 };
        const local = clamp((progress - (cfg.p0 + i * cfg.step)) / cfg.span);
        petal.setAttribute("transform", `rotate(${a}) scale(${back(local).toFixed(3)})`);
        petal.setAttribute("fill", `oklch(${(cfg.l0 + (cfg.l1 - cfg.l0) * local).toFixed(1)}% ${(cfg.c0 + (cfg.c1 - cfg.c0) * local).toFixed(3)} ${hue})`);
      });
      const pistilScale = back(clamp((progress - 0.32) / 0.36));
      host.querySelectorAll<SVGCircleElement>("[data-pistil]").forEach((p) => p.setAttribute("transform", `scale(${pistilScale.toFixed(3)})`));
      if (progress > 0.99 && !host.dataset.swaying && !reduce) {
        host.dataset.swaying = "1";
        host.style.animation = "ls-sway 8s ease-in-out infinite";
        host.style.animationDelay = (Math.random() * 2.5).toFixed(2) + "s";
      }
    };

    // Growth is one-way: once an element reaches full bloom it is marked done and
    // skipped on every later frame, so the garden grows and stays (never un-blooms
    // on scroll-up) and per-frame work collapses to only what is still opening.
    const grow = (part: SVGElement, local: number) => {
      const eased = local <= 0 ? 0 : local >= 1 ? 1 : 1 + 1.7 * Math.pow(local - 1, 3) + 0.9 * Math.pow(local - 1, 2);
      part.setAttribute("transform", `${part.getAttribute("data-base")} scale(${eased.toFixed(3)})`);
      if (local >= 1) part.dataset.done = "1";
    };
    const scrub = () => {
      const vh = window.innerHeight || 800;
      const open = forceOpen;
      root.querySelectorAll<SVGSVGElement>("[data-vine]").forEach((svg) => {
        const rect = svg.getBoundingClientRect();
        const denom = rect.height * 0.7 + vh * 0.28;
        const progress = open ? 1 : clamp((vh * 0.86 - rect.top) / denom);
        svg.querySelectorAll<SVGPathElement>("[data-stem]").forEach((stem) => {
          if (stem.dataset.done) return;
          const len = Number(stem.dataset.len) || 0;
          if (len) stem.style.strokeDashoffset = String((len * (1 - progress)).toFixed(1));
          if (progress >= 1) stem.dataset.done = "1";
        });
        svg.querySelectorAll<SVGPathElement>("[data-grow]:not([data-done])").forEach((part) => {
          grow(part, clamp((progress - (Number(part.getAttribute("data-grow")) || 0)) / 0.16));
        });
      });
      const archHost = root.querySelector<HTMLElement>("[data-arch-host]");
      if (archHost && archHost.dataset.built) {
        const rect = archHost.getBoundingClientRect();
        archProgress = open ? 1 : clamp((vh * 0.84 - rect.top) / (rect.height * 0.52 + vh * 0.26));
        archHost.querySelectorAll<SVGPathElement>("[data-arch-seg]:not([data-done])").forEach((seg) => {
          const a = Number(seg.dataset.segStart), b = Number(seg.dataset.segEnd);
          const len = Number(seg.dataset.len) || 0;
          const local = clamp((archProgress - a) / (b - a));
          seg.style.strokeDashoffset = String((len * (1 - local)).toFixed(1));
          if (local >= 1) seg.dataset.done = "1";
        });
        archHost.querySelectorAll<SVGPathElement>("[data-grow]:not([data-done])").forEach((part) => {
          grow(part, clamp((archProgress - (Number(part.getAttribute("data-grow")) || 0)) / 0.14));
        });
      }
      root.querySelectorAll<HTMLElement>("[data-flower]:not([data-done])").forEach((host) => {
        const rect = host.getBoundingClientRect();
        const onArch = host.dataset.archAt !== undefined;
        const progress = open ? 1 : onArch
          ? clamp((archProgress - Number(host.dataset.archAt) * 0.85) / 0.15)
          : clamp((vh * 0.9 - rect.top) / (vh * 0.4));
        paintFlower(host, progress);
        if (progress >= 0.999) host.dataset.done = "1";
      });
      root.querySelectorAll<HTMLElement>("[data-milestone]:not([data-revealed])").forEach((el) => {
        if (open || el.getBoundingClientRect().top < vh * 0.88) {
          el.querySelectorAll<HTMLElement>("[data-copy],[data-locket]").forEach((c) => c.classList.add("is-in"));
          el.dataset.revealed = "1";
        }
      });
      root.querySelectorAll<HTMLElement>("[data-copy]:not(.is-in)").forEach((c) => {
        if (open || c.getBoundingClientRect().top < vh * 0.9) c.classList.add("is-in");
      });
    };

    const failOpen = () => {
      forceOpen = true;
      root.querySelectorAll<HTMLElement>("[data-copy],[data-locket]").forEach((el) => el.classList.add("is-in"));
      root.querySelectorAll<SVGElement>("[data-arch-seg],[data-stem]").forEach((s) => { (s as SVGPathElement).style.strokeDashoffset = "0"; s.setAttribute("data-done", "1"); });
      root.querySelectorAll<SVGElement>("[data-grow]").forEach((p) => {
        const base = p.getAttribute("data-base");
        if (base) p.setAttribute("transform", `${base} scale(1)`);
        p.setAttribute("data-done", "1");
      });
      root.querySelectorAll<SVGElement>("[data-petal]").forEach((p) => p.setAttribute("transform", `rotate(${p.getAttribute("data-a")}) scale(1)`));
      root.querySelectorAll<SVGElement>("[data-pistil]").forEach((p) => p.setAttribute("transform", "scale(1)"));
      root.querySelectorAll<HTMLElement>("[data-flower]").forEach((f) => { f.dataset.done = "1"; });
    };

    const pulse = () => {
      if (!running) return;
      try {
        buildFlowers();
        buildVines();
        buildArch();
        const key = `${Math.round(window.scrollY)}|${window.innerHeight}|${document.documentElement.clientWidth}`;
        if (dirty || key !== lastKey || frames < 40) {
          dirty = false;
          lastKey = key;
          frames += 1;
          scrub();
        }
      } catch {
        failOpen();
      }
    };

    const start = () => {
      if (running) return;
      running = true;
      if (!reduce) {
        const loop = () => { if (!running) return; pulse(); raf = window.requestAnimationFrame(loop); };
        loop();
      }
      timer = window.setInterval(pulse, 200);
    };
    const stop = () => {
      running = false;
      if (raf) window.cancelAnimationFrame(raf);
      if (timer) window.clearInterval(timer);
      raf = 0;
      timer = 0;
    };

    const onScroll = () => { dirty = true; if (running) pulse(); };
    const onResize = () => {
      const host = root.querySelector<HTMLElement>("[data-arch-host]");
      if (host) { delete host.dataset.built; host.innerHTML = ""; }
      dirty = true;
      if (running) pulse();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onScroll);

    // Only animate while the section is near the viewport (older-phone battery).
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) start(); else stop(); });
    }, { rootMargin: "100% 0px 100% 0px" });
    io.observe(root);

    return () => {
      stop();
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onScroll);
    };
  }, []);

  return (
    <section className="love-story-section" ref={rootRef} aria-labelledby="ls-title">
      <BotanicalPhoto variant="sprig" className="ls-sprig" />
      <div className="ls-head">
        <p className="eyebrow ls-eyebrow">{c.story.eyebrow}</p>
        <h2 id="ls-title">{c.story.titleLines[0]}<br />{c.story.titleLines[1]}</h2>
      </div>
      <div className="ls-timeline">
        <div className="ls-vine-holder" aria-hidden="true">
          <svg data-vine viewBox="0 0 64 800" preserveAspectRatio="none" className="ls-vine-svg">
            <path data-stem d="M32 0 C10 96 52 178 32 272 C12 366 54 448 32 542 C14 622 40 700 32 800" fill="none" stroke="oklch(46% 0.058 133)" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        </div>
        {LS_MILESTONES.map((milestone, index) => (
          <article data-milestone className="ls-milestone" key={milestone.year}>
            <span data-cluster aria-hidden="true" className="ls-cluster">
              {milestone.cluster.map(([left, top, size, hue], index) => (
                <span data-flower data-hue={hue} data-size={size} key={index} style={{ position: "absolute", left: `${left}px`, top: `${top}px`, display: "block" }} />
              ))}
            </span>
            <div data-copy className="ls-copy">
              <p className="ls-year">{milestone.year}</p>
              <p className="ls-label">{c.story.milestones[index]?.label}</p>
              <p className="ls-text">{c.story.milestones[index]?.text}</p>
            </div>
          </article>
        ))}
        <div data-milestone className="ls-finale">
          <div className="ls-locket-wrap">
            <div aria-hidden="true" className="ls-arch-layer">
              <div data-arch-host className="ls-arch-host" />
              {LS_ARCH_FLOWERS.map(([hue, size, at, side, off], index) => (
                <span data-flower data-hue={hue} data-size={size} data-at={at} data-side={side} data-off={off} key={index} style={{ position: "absolute", left: 0, top: 0, display: "block" }} />
              ))}
            </div>
            <div data-locket className="ls-locket">
              <div className="ls-locket-inner">
                <Image className="ls-locket-photo" src="/love-story-photo-v1.jpg" alt={c.story.photoAlt} width={1200} height={1600} unoptimized loading="lazy" decoding="async" />
              </div>
            </div>
          </div>
          <p data-copy className="ls-finale-line">{c.story.finale}</p>
        </div>
      </div>
    </section>
  );
}

function Invitation({ household, onUpdate, onOpenMeals, mealPhaseOpen, contacts }: {
  household: Household;
  onUpdate: (invitation: InvitationResponse) => void;
  onOpenMeals: () => void;
  mealPhaseOpen: boolean;
  contacts: ContactAction[];
}) {
  const c = useCopy();
  const [draft, setDraft] = useState(household);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [status, setStatus] = useState<StatusKey | "">("");
  const receiptRef = useRef<HTMLDivElement>(null);
  const [daysUntilWedding] = useState(() => Math.max(0, Math.ceil((CEREMONY_TIME - Date.now()) / 86_400_000)));
  const draftKey = `wedding-rsvp-draft:${household.id}`;
  const updateGuest = (next: Guest) => {
    if (saveState !== "conflict") {
      setSaveState("idle");
      setStatus("");
    }
    setDraft((current) => ({ ...current, guests: current.guests.map((guest) => guest.id === next.id ? next : guest) }));
  };
  const pendingGuests = draft.guests.filter((guest) => guest.attendance === "pending");
  const hasPending = pendingGuests.length > 0;
  const answeredCount = draft.guests.length - pendingGuests.length;
  const isDirty = JSON.stringify(draft.guests) !== JSON.stringify(household.guests);
  const attendingNames = draft.guests.filter((guest) => guest.attendance === "attending").map((guest) => guest.name);
  const outstanding = pendingGuests.map((guest) => guest.name.split(" ")[0]);

  useEffect(() => {
    const restoreDraft = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(draftKey);
        if (!stored) return;
        const restored = JSON.parse(stored) as StoredRsvpDraft;
        const sameHousehold = restored.householdId === household.id;
        const sameVersion = restored.responseVersion === household.responseVersion;
        const fresh = Number.isFinite(restored.savedAt) && restored.savedAt > 0 &&
          Date.now() < DATA_DELETION_TIME && Date.now() - restored.savedAt <= DRAFT_MAX_AGE_MS;
        const sameGuests = Array.isArray(restored.guests)
          && restored.guests.map((guest) => guest.id).join(",") === household.guests.map((guest) => guest.id).join(",");
        if (!sameHousehold || !sameVersion || !sameGuests || !fresh) {
          safeRemoveStoredDraft(draftKey);
          return;
        }
        setDraft({
          ...household,
          guests: household.guests.map((guest) => {
            const savedGuest = restored.guests.find((candidate) => candidate.id === guest.id);
            return savedGuest ? { ...guest, ...savedGuest } : guest;
          }),
        });
      } catch {
        safeRemoveStoredDraft(draftKey);
      }
    }, 0);
    return () => window.clearTimeout(restoreDraft);
  }, [draftKey, household]);

  useEffect(() => {
    if (!isDirty || saveState === "success") return;
    const storedDraft: StoredRsvpDraft = {
      householdId: draft.id,
      responseVersion: draft.responseVersion,
      savedAt: Date.now(),
      guests: draft.guests.map(({ id, attendance, dietaryNotes, mealChoice }) => ({ id, attendance, dietaryNotes, mealChoice })),
    };
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(storedDraft));
    } catch {
      // Storage can be blocked or full; the reply still works without a local draft.
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft, draftKey, isDirty, saveState]);

  const save = async () => {
    if (hasPending) {
      setStatus("needAnswers");
      setSaveState("error");
      return;
    }
    if (saveState === "saving") return;
    setSaveState("saving");
    setStatus("savingReply");
    try {
      const response = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential: draft.credential, responseVersion: draft.responseVersion, guests: draft.guests }),
      });
      if (response.status === 409) {
        setSaveState("conflict");
        setStatus("replyConflict");
        return;
      }
      if (!response.ok) throw new Error("save failed");
      const saved = preserveCredential((await response.json()) as InvitationResponse, draft.credential);
      setDraft(saved.household);
      onUpdate(saved);
      safeRemoveStoredDraft(draftKey);
      setSaveState("success");
      setStatus("replySaved");
    } catch {
      setSaveState("error");
      setStatus("replySaveFailed");
    }
  };

  const loadLatest = async () => {
    setSaveState("saving");
    setStatus("loadingLatestReply");
    try {
      const latest = await fetchInvitation(household.credential);
      setDraft(latest.household);
      onUpdate(latest);
      safeRemoveStoredDraft(draftKey);
      setSaveState("idle");
      setStatus("latestReplyLoaded");
    } catch {
      setSaveState("conflict");
      setStatus("latestReplyFailed");
    }
  };

  // The save bar is sticky, so its confirmation renders below the fold; bring the
  // receipt into view once the server confirms. scrollIntoView with default behavior
  // follows the page's scroll-behavior, which reduced-motion already sets to auto.
  useEffect(() => {
    if (saveState === "success") receiptRef.current?.scrollIntoView({ block: "nearest" });
  }, [saveState]);

  const saveLabel = saveState === "saving" ? c.rsvp.saveLabels.saving
    : saveState === "error" ? c.rsvp.saveLabels.error
    : saveState === "conflict" ? c.rsvp.saveLabels.conflict
    : c.rsvp.saveLabels.idle;

  return (
    <main className="invitation-page">
      <nav className="invitation-nav" aria-label={c.nav.aria}>
        <a className="nav-rsvp" href="#rsvp">{c.nav.rsvp}</a>
      </nav>

      <header className="invitation-hero">
        <div className="hero-vine hero-vine-one" aria-hidden="true" />
        <div className="hero-vine hero-vine-two" aria-hidden="true" />
        <div className="hero-botanical-frame" aria-hidden="true">
          <BotanicalPhoto className="hero-botanical hero-botanical-left" />
        </div>
        <div className="floating-petals" aria-hidden="true">{Array.from({ length: 11 }, (_, index) => <span key={index} />)}</div>
        <p className="eyebrow hero-eyebrow">{c.hero.eyebrow}</p>
        <h1><span>{c.names.her}</span><small>&amp;</small><span>{c.names.him}</span></h1>
        <p className="hero-subtitle">{c.hero.subtitle}</p>
        <div className="event-line" aria-label={c.hero.dateAria}>
          <div><strong>{c.hero.day}</strong><span>{c.hero.dateLong}</span></div>
          <span className="event-divider" aria-hidden="true" />
          <div><strong>{c.hero.venueName}</strong><span>{c.hero.venueCountry}</span></div>
        </div>
        <p className="hero-countdown">{c.hero.daysToGo(daysUntilWedding)} <span aria-hidden="true">·</span> {c.hero.replyBy}</p>
        <a className="scroll-prompt" href="#rsvp">{c.hero.scrollPrompt} <span aria-hidden="true">↓</span></a>
        <div className="hero-fade" aria-hidden="true" />
      </header>

      <section className="rsvp-section" id="rsvp">
        <div className="rsvp-intro">
          <h2>{c.rsvp.introTitleLines[0]}<br />{c.rsvp.introTitleLines[1]}</h2>
          <p>{c.rsvp.introBody}</p>
        </div>
        <div className="rsvp-column">
          <div className="rsvp-heading">
            <span className="reply-date">{c.rsvp.replyDate}</span>
          </div>

          <div className="rsvp-progress" aria-hidden="true">
            <div className="rsvp-progress-labels">
              <span>{c.rsvp.progressAnswered(answeredCount, draft.guests.length)}</span>
              {outstanding.length > 0 && <span className="rsvp-progress-outstanding">{c.rsvp.progressOutstanding(outstanding)}</span>}
            </div>
            <div className="rsvp-progress-track">
              <div className="rsvp-progress-fill" style={{ width: `${draft.guests.length ? (answeredCount / draft.guests.length) * 100 : 0}%` }} />
            </div>
          </div>

          <div className="guest-list">
            {draft.guests.map((guest) => <GuestRsvp key={guest.id} guest={guest} onChange={updateGuest} />)}
          </div>

          <div className="rsvp-save">
            {hasPending && <p className="rsvp-save-note">{c.rsvp.saveNote(outstanding)}</p>}
            <button type="button" className="primary-action" onClick={save} disabled={saveState === "saving" || saveState === "conflict"}>
              {saveLabel} <span aria-hidden="true">→</span>
            </button>
            <p className={`save-status ${saveState}`} role={saveState === "error" || saveState === "conflict" ? "alert" : "status"}>{status ? c.status[status] : ""}</p>
            {saveState === "conflict" && <button type="button" className="conflict-action" onClick={loadLatest}>{c.rsvp.loadLatest}</button>}
          </div>
          {saveState === "success" && (
            <div className="rsvp-receipt" aria-label={c.rsvp.receiptAria} ref={receiptRef}>
              <span className="receipt-mark" aria-hidden="true">✓</span>
              <div>
                <strong>{c.rsvp.receiptTitle(household.householdName)}</strong>
                <p>{attendingNames.length > 0 ? c.rsvp.receiptAttending(attendingNames) : c.rsvp.receiptDeclined}</p>
                {attendingNames.length > 0 && (mealPhaseOpen
                  ? <p>{c.rsvp.receiptMealsOpen.pre} <button type="button" className="receipt-link" onClick={onOpenMeals}>{c.rsvp.receiptMealsOpen.link}</button> {c.rsvp.receiptMealsOpen.post}</p>
                  : <p>{c.rsvp.receiptMealsLater}</p>)}
              </div>
            </div>
          )}
          <ContactActions contacts={contacts} />
        </div>
      </section>

      {mealPhaseOpen ? (
        <section className="meal-teaser">
          <div>
            <p className="eyebrow">{c.mealTeaser.eyebrow}</p>
            <h2>{c.mealTeaser.title}</h2>
            <p>{c.mealTeaser.body}</p>
          </div>
          <button type="button" className="secondary-action" onClick={onOpenMeals}>{c.mealTeaser.btn} <span aria-hidden="true">→</span></button>
        </section>
      ) : (
        <section className="meal-notice" aria-label={c.mealNotice.aria}>
          <BotanicalPhoto variant="sprig" className="meal-notice-botanical" />
          <div className="meal-notice-body">
            <p className="eyebrow">{c.mealNotice.eyebrow}</p>
            <h2>{c.mealNotice.titleLines[0]}<br />{c.mealNotice.titleLines[1]}</h2>
            <p>{c.mealNotice.bodyPre}<strong>{c.mealNotice.bodyMonth}</strong>{c.mealNotice.bodyPost}</p>
          </div>
        </section>
      )}

      <section className="program-section" id="program" aria-labelledby="program-title">
        <div className="program-canopy" aria-hidden="true">
          <span className="program-branch branch-left" /><span className="program-branch branch-right" />
          <BotanicalPhoto variant="corner" className="program-botanical program-botanical-one" />
          <BotanicalPhoto variant="sprig" className="program-botanical program-botanical-two" />
        </div>
        <div className="program-heading">
          <h2 id="program-title">{c.program.title}</h2>
        </div>
        <div className="program-path">
          <span className="program-vine" aria-hidden="true" />
          {c.program.stops.map((stop) => (
            <article className="program-stop" key={stop.time}>
              <span className="program-bud" aria-hidden="true" />
              <div><time>{stop.time}</time><h3>{stop.name}</h3><p>{stop.desc}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="venue-section" id="venue">
        <p className="eyebrow venue-eyebrow">{c.venue.eyebrow}</p>
        <VenueScene />
        <div className="estate-map-shell">
          <iframe
            title={c.venue.mapTitle}
            src="https://www.google.com/maps?q=42.3417472%2C25.4058997&z=15&output=embed"
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer"
          />
          <div className="estate-map-caption">
            <div><span>{c.venue.captionLabel}</span><strong>{c.venue.captionName}</strong><small>{c.venue.captionPlace}</small></div>
            <a href="https://www.google.com/maps/search/?api=1&query=42.3417472%2C25.4058997" target="_blank" rel="noreferrer">{c.venue.mapsLink} <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <div className="dress-code-note">
          <span>{c.venue.dressLabel}</span>
          <small>{c.venue.dressBody}</small>
        </div>
      </section>

      <section className="stay-section" id="stay" aria-label={c.stay.aria}>
        <BotanicalPhoto variant="sprig" className="stay-botanical" />
        <div className="stay-body">
          <h2>{c.stay.titleLines[0]}<br />{c.stay.titleLines[1]}</h2>
          {c.stay.body.map((para, index) => (
            <p key={index}>{para}</p>
          ))}
          <p className="stay-foot">{c.stay.foot}</p>
        </div>
        <div className="stay-fade" aria-hidden="true" />
      </section>

      <LoveStory />

      <footer className="wedding-footer">
        <BotanicalPhoto variant="corner" className="footer-botanical" />
        <div className="footer-copy">
          <p>{c.footer.thanks}</p>
          <span>{c.footer.tagline}</span>
        </div>
        <span className="footer-sign">{c.footer.sign}</span>
      </footer>
    </main>
  );
}

function MealSelection({ household, open, mealOptions, onBack, onUpdate }: {
  household: Household;
  open: boolean;
  mealOptions: MealOption[];
  onBack: () => void;
  onUpdate: (invitation: InvitationResponse) => void;
}) {
  const c = useCopy();
  const attending = household.guests.filter((guest) => guest.attendance === "attending");
  const [draft, setDraft] = useState(household);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [status, setStatus] = useState<StatusKey | "">("");
  const missingChoice = attending.some((guest) => !draft.guests.find((item) => item.id === guest.id)?.mealChoice);
  const chooseMeal = (guestId: number, mealChoice: string) => {
    if (saveState !== "conflict") {
      setSaveState("idle");
      setStatus("");
    }
    setDraft((current) => ({ ...current, guests: current.guests.map((item) => item.id === guestId ? { ...item, mealChoice } : item) }));
  };
  const save = async () => {
    if (missingChoice) {
      setSaveState("error");
      setStatus("needMeals");
      return;
    }
    if (saveState === "saving") return;
    setSaveState("saving");
    setStatus("savingMeals");
    try {
      const response = await fetch("/api/meals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          credential: draft.credential,
          responseVersion: draft.responseVersion,
          guests: draft.guests.filter((guest) => guest.attendance === "attending"),
        }),
      });
      if (response.status === 409) {
        setSaveState("conflict");
        setStatus("mealsConflict");
        return;
      }
      if (!response.ok) throw new Error("save failed");
      const saved = preserveCredential((await response.json()) as InvitationResponse, draft.credential);
      setDraft(saved.household);
      onUpdate(saved);
      setSaveState("success");
      setStatus("mealsSaved");
    } catch {
      setSaveState("error");
      setStatus("mealsSaveFailed");
    }
  };

  const loadLatest = async () => {
    setSaveState("saving");
    setStatus("loadingLatestMeals");
    try {
      const latest = await fetchInvitation(household.credential);
      setDraft(latest.household);
      onUpdate(latest);
      setSaveState("idle");
      setStatus("latestMealsLoaded");
    } catch {
      setSaveState("conflict");
      setStatus("latestMealsFailed");
    }
  };

  return (
    <main className="meal-page">
      <button className="back-button" type="button" onClick={onBack}>{c.meals.back}</button>
      <section className="meal-intro">
        <p className="eyebrow">{c.meals.eyebrow}</p>
        <h1>{c.meals.introTitleLines[0]}<br />{c.meals.introTitleLines[1]}</h1>
        <p>{c.meals.introBody}</p>
      </section>
      {!open ? (
        <section className="phase-closed">
          <span className="season-mark" aria-hidden="true">✽</span>
          <p className="eyebrow">{c.meals.closed.eyebrow}</p>
          <h2>{c.meals.closed.title}</h2>
          <p>{c.meals.closed.body}</p>
          <button type="button" className="primary-action" onClick={onBack}>{c.meals.closed.btn}</button>
        </section>
      ) : attending.length === 0 ? (
        <section className="phase-closed"><h2>{c.meals.rsvpFirst.title}</h2><p>{c.meals.rsvpFirst.body}</p><button type="button" className="primary-action" onClick={onBack}>{c.meals.rsvpFirst.btn}</button></section>
      ) : (
        <section className="meal-choices">
          {attending.map((guest) => {
            const current = draft.guests.find((item) => item.id === guest.id) ?? guest;
            const availableMeals = mealOptions.filter((meal) => meal.guestType === "all" || meal.guestType === guest.guestType);
            return (
              <article className="meal-guest" key={guest.id}>
                <h2>{guest.name}</h2>
                <div className="meal-options">
                  {availableMeals.map((meal) => (
                    <button key={meal.optionKey} type="button" aria-pressed={current.mealChoice === meal.optionKey} className={current.mealChoice === meal.optionKey ? "selected" : ""} onClick={() => chooseMeal(guest.id, meal.optionKey)}>
                      <span className="meal-radio" aria-hidden="true" />
                      <strong>{meal.name}</strong><small>{meal.description}</small>
                    </button>
                  ))}
                  {availableMeals.length === 0 && <p>{c.meals.emptyMenu}</p>}
                </div>
              </article>
            );
          })}
          <button type="button" className="primary-action" disabled={saveState === "saving" || saveState === "conflict"} onClick={save}>{saveState === "saving" ? c.meals.saveLabels.saving : saveState === "error" ? c.meals.saveLabels.error : saveState === "conflict" ? c.meals.saveLabels.conflict : c.meals.saveLabels.idle} <span aria-hidden="true">→</span></button>
          <p className={`save-status ${saveState}`} role={saveState === "error" || saveState === "conflict" ? "alert" : "status"}>{status ? c.status[status] : ""}</p>
          {saveState === "conflict" && <button type="button" className="conflict-action" onClick={loadLatest}>{c.meals.loadLatest}</button>}
        </section>
      )}
    </main>
  );
}

export default function WeddingExperience() {
  const [lang, setLang] = useState<Lang>("en");
  const credentialSnapshot = useSyncExternalStore(
    subscribeToCredentialChange,
    credentialFromLocation,
    serverCredentialSnapshot,
  );
  const credential = credentialSnapshot === SERVER_CREDENTIAL_SNAPSHOT ? "" : credentialSnapshot;
  const [household, setHousehold] = useState<Household | null>(null);
  const [view, setView] = useState<"invitation" | "meals">("invitation");
  const [mealPhaseOpen, setMealPhaseOpen] = useState(false);
  const [mealOptions, setMealOptions] = useState<MealOption[]>([]);
  const [contacts, setContacts] = useState<ContactAction[]>([]);
  const [gateFailure, setGateFailure] = useState<InvitationGateFailure | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    removeLegacyCredentialDrafts();
  }, []);

  useEffect(() => {
    if (!credential || credentialSnapshot === SERVER_CREDENTIAL_SNAPSHOT) return;
    setCredentialInAddressBar(credential);

    let cancelled = false;
    fetchInvitation(credential)
      .then((invitation) => {
        if (cancelled) return;
        setHousehold(invitation.household);
        setMealPhaseOpen(invitation.mealPhaseOpen);
        setMealOptions(invitation.mealOptions);
        setContacts(invitation.contacts);
        setView("invitation");
        setCredentialInAddressBar(invitation.household.credential);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const invalid = error instanceof InvitationRequestError && [400, 404, 410].includes(error.status);
          setGateFailure({ credential, retryAttempt, state: invalid ? "invalid" : "unavailable" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [credential, credentialSnapshot, retryAttempt]);

  const updateInvitation = (invitation: InvitationResponse) => {
    setHousehold(invitation.household);
    setMealPhaseOpen(invitation.mealPhaseOpen);
    setMealOptions(invitation.mealOptions);
    setContacts(invitation.contacts);
  };

  // Language: restored after mount (SSR always renders English), persisted,
  // and mirrored onto <html lang> so the Bulgarian font swap in globals.css
  // and assistive tech both follow.
  useEffect(() => {
    const restoreLang = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
        if (stored === "bg" || stored === "en") setLang(stored);
      } catch {
        // Storage can be blocked; the default language still works.
      }
    }, 0);
    return () => window.clearTimeout(restoreLang);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = COPY[lang].meta.title;
  }, [lang]);

  const changeLang = (next: Lang) => {
    setLang(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // Persisting the choice is optional.
    }
  };

  const failureMatchesCurrentAttempt = gateFailure?.credential === credential && gateFailure.retryAttempt === retryAttempt;
  const gateState: InvitationGateState = credentialSnapshot === SERVER_CREDENTIAL_SNAPSHOT
    ? "checking"
    : !credential
      ? "missing"
      : failureMatchesCurrentAttempt
        ? gateFailure.state
        : "checking";
  const invitationMatchesCredential = Boolean(household && household.credential === credential);

  let body: ReactNode;
  if (!invitationMatchesCredential || !household) {
    body = <InvitationGate state={gateState} onRetry={() => setRetryAttempt((attempt) => attempt + 1)} />;
  } else if (view === "meals") {
    body = <MealSelection household={household} open={mealPhaseOpen} mealOptions={mealOptions} onBack={() => setView("invitation")} onUpdate={updateInvitation} />;
  } else {
    body = <Invitation household={household} onUpdate={updateInvitation} onOpenMeals={() => setView("meals")} mealPhaseOpen={mealPhaseOpen} contacts={contacts} />;
  }

  return (
    <LangContext.Provider value={lang}>
      <LangToggle lang={lang} onChange={changeLang} />
      {body}
    </LangContext.Provider>
  );
}
