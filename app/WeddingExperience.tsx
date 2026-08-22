"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";

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

  if (!response.ok) throw new Error("invitation unavailable");

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

function setCredentialInAddressBar(credential?: string) {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.hash = credential ? `invite=${encodeURIComponent(credential)}` : "";
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

function HeartVine() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let startedAt = 0;
    let currentProgress = reducedMotion ? 1 : 0;

    const pointAt = (angle: number, width: number, height: number) => {
      const horizontalScale = width / 36.5;
      const verticalScale = height / 34;
      const x = 16 * Math.sin(angle) ** 3;
      const y = 13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle);
      return { x: width / 2 + x * horizontalScale, y: height * 0.37 - y * verticalScale };
    };

    const drawLeaf = (x: number, y: number, rotation: number, size: number, tone: number) => {
      context.save();
      context.translate(x, y);
      context.rotate(rotation);
      context.beginPath();
      context.ellipse(0, 0, size * 0.42, size, 0, 0, Math.PI * 2);
      context.fillStyle = tone % 2 ? "rgba(111, 139, 98, 0.94)" : "rgba(80, 111, 73, 0.94)";
      context.fill();
      context.beginPath();
      context.moveTo(0, -size * 0.7);
      context.lineTo(0, size * 0.72);
      context.strokeStyle = "rgba(235, 239, 222, 0.52)";
      context.lineWidth = 0.8;
      context.stroke();
      context.restore();
    };

    const drawFlower = (x: number, y: number, size: number, color: string, bloom: number, turn: number) => {
      context.save();
      context.translate(x, y);
      context.rotate(turn);
      context.scale(bloom, bloom);
      for (let petal = 0; petal < 5; petal += 1) {
        context.save();
        context.rotate((petal / 5) * Math.PI * 2 + (petal % 2 ? 0.06 : -0.04));
        context.beginPath();
        context.moveTo(0, 0);
        context.bezierCurveTo(-size * 0.24, -size * 0.28, -size * 0.34, -size * 0.92, 0, -size * (1 + petal * 0.015));
        context.bezierCurveTo(size * 0.38, -size * 0.88, size * 0.29, -size * 0.27, 0, 0);
        context.fillStyle = color;
        context.globalAlpha = 0.84 + petal * 0.025;
        context.fill();
        context.restore();
      }
      context.globalAlpha = 1;
      context.beginPath();
      context.arc(0, 0, size * 0.19, 0, Math.PI * 2);
      context.fillStyle = "rgba(205, 165, 108, 0.96)";
      context.fill();
      context.restore();
    };

    const draw = (progress: number) => {
      currentProgress = progress;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(rect.width, 1);
      const height = Math.max(rect.height, 1);
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.lineCap = "round";
      context.lineJoin = "round";

      const stemEnd = pointAt(Math.PI, width, height);
      const stemProgress = Math.min(1, progress / 0.2);
      context.beginPath();
      context.moveTo(width / 2, height - 2);
      context.bezierCurveTo(
        width / 2 - width * 0.015,
        height - (height - stemEnd.y) * 0.46 * stemProgress,
        width / 2 + width * 0.018,
        height - (height - stemEnd.y) * 0.76 * stemProgress,
        stemEnd.x,
        height - (height - stemEnd.y) * stemProgress,
      );
      context.strokeStyle = "rgba(79, 106, 70, 0.95)";
      context.lineWidth = Math.max(2, width / 310);
      context.stroke();

      const heartProgress = Math.max(0, Math.min(1, (progress - 0.12) / 0.88));
      context.beginPath();
      const pointsToDraw = Math.floor(300 * heartProgress);
      for (let index = 0; index <= pointsToDraw; index += 1) {
        const angle = Math.PI + (index / 300) * Math.PI * 2;
        const point = pointAt(angle, width, height);
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.strokeStyle = "rgba(78, 107, 70, 0.96)";
      context.lineWidth = Math.max(2.2, width / 285);
      context.shadowColor = "rgba(49, 69, 42, 0.12)";
      context.shadowBlur = 4;
      context.stroke();
      context.shadowBlur = 0;

      const leaves = [0.07, 0.14, 0.25, 0.34, 0.43, 0.57, 0.65, 0.74, 0.84, 0.93];
      leaves.forEach((fraction, index) => {
        if (fraction > heartProgress) return;
        const angle = Math.PI + fraction * Math.PI * 2;
        const point = pointAt(angle, width, height);
        const next = pointAt(angle + 0.02, width, height);
        const rotation = Math.atan2(next.y - point.y, next.x - point.x) + (index % 2 ? -0.92 : 0.92);
        drawLeaf(point.x, point.y, rotation, Math.max(8, width / 82), index);
      });

      const flowers = [
        { fraction: 0.03, color: "rgba(231, 197, 205, 0.98)", size: 13 },
        { fraction: 0.22, color: "rgba(189, 174, 205, 0.96)", size: 11 },
        { fraction: 0.48, color: "rgba(239, 217, 219, 0.98)", size: 14 },
        { fraction: 0.7, color: "rgba(196, 181, 211, 0.96)", size: 11 },
        { fraction: 0.89, color: "rgba(232, 198, 207, 0.98)", size: 12 },
      ];
      flowers.forEach((flower, index) => {
        if (flower.fraction > heartProgress) return;
        const angle = Math.PI + flower.fraction * Math.PI * 2;
        const point = pointAt(angle, width, height);
        const localProgress = Math.min(1, Math.max(0.12, (heartProgress - flower.fraction) * 8));
        drawFlower(point.x, point.y, Math.max(flower.size, width / 74), flower.color, localProgress, index * 0.43);
      });
    };

    const animate = (time: number) => {
      if (!startedAt) startedAt = time;
      const elapsed = (time - startedAt) / 1800;
      const progress = reducedMotion ? 1 : 1 - Math.pow(1 - Math.min(elapsed, 1), 4);
      draw(progress);
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    };
    const observer = new ResizeObserver(() => draw(currentProgress));
    observer.observe(canvas);
    frame = window.requestAnimationFrame(animate);
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame); };
  }, []);

  return <canvas ref={canvasRef} className="heart-vine-canvas" aria-hidden="true" />;
}

const contactPresentation = {
  whatsapp: { label: "WhatsApp", mark: "W" },
  viber: { label: "Viber", mark: "V" },
  phone: { label: "Call us", mark: "☎" },
} as const;

function ContactActions({ contacts }: { contacts: ContactAction[] }) {
  if (contacts.length === 0) return null;

  return (
    <div className="contact-area">
      <p className="eyebrow">Prefer to reply personally?</p>
      <div className="contact-actions" aria-label="Contact options">
        {contacts.map((contact) => (
          <a key={contact.key} className={`contact-button ${contact.key}`} href={contact.href} rel="noreferrer">
            <span aria-hidden="true">{contactPresentation[contact.key].mark}</span> {contactPresentation[contact.key].label}
          </a>
        ))}
      </div>
    </div>
  );
}

function CodeEntry({ onFound, linkStatus = "idle", linkError = "" }: {
  onFound: (response: InvitationResponse) => void;
  linkStatus?: "idle" | "loading";
  linkError?: string;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setError("Please enter the code printed on your invitation.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const invitation = await fetchInvitation(normalized);
      onFound(invitation);
    } catch {
      setError("We could not find that invitation. Please check the code and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="entry-page">
      <BotanicalPhoto className="entry-botanical entry-botanical-one" priority />
      <BotanicalPhoto variant="sprig" className="entry-botanical entry-botanical-two" />
      <div className="entry-petals" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <span key={index} />)}</div>
      <section className="entry-panel" aria-labelledby="entry-title">
        <div className="entry-heart-stage">
          <div className="entry-heart-vine" aria-hidden="true"><HeartVine /></div>
          <p className="entry-love-note">our forever begins</p>
          <div className="entry-names" aria-label="Ekaterina and Dimitar"><span>Ekaterina</span><small>+</small><span>Dimitar</span></div>
        </div>
        <p className="date-line">20 · 06 · 2027</p>
        <h1 id="entry-title">Forever<br />starts today</h1>
        <p className="entry-copy">Your personal invitation is waiting.</p>

        <form className="code-form" onSubmit={submit} noValidate aria-busy={loading || linkStatus === "loading"}>
          <label htmlFor="invitation-code">Invitation code</label>
          <div className="code-row">
            <input
              id="invitation-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="e.g. K7MP9Q2XWD"
              autoCapitalize="characters"
              autoComplete="off"
              aria-describedby="code-hint code-error"
            />
            <button type="submit" disabled={loading || linkStatus === "loading"}>{loading || linkStatus === "loading" ? "Opening…" : "Open invitation"}</button>
          </div>
          <p id="code-hint" className="form-hint">You will find this short code on your printed card.</p>
          <p id="code-error" className="form-error" role="alert">{error}</p>
          {linkStatus === "loading" && <p className="link-status" role="status">Opening your personal invitation…</p>}
          {linkError && <p className="form-error" role="alert">{linkError}</p>}
        </form>
        <p className="privacy-note">We use your invitation details and reply only to plan our wedding. Guest data will be deleted by 27 June 2027.</p>
      </section>
      <p className="entry-footer">Ekaterina &amp; Dimitar · Midalidare Estate, Bulgaria</p>
    </main>
  );
}

function statusLabel(attendance: Attendance): string {
  if (attendance === "attending") return "Joyfully attending";
  if (attendance === "declined") return "Unable to attend";
  return "Choose an answer below";
}

function GuestRsvp({ guest, onChange }: { guest: Guest; onChange: (guest: Guest) => void }) {
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
          <p className={answered ? `is-${guest.attendance}` : "is-pending"}>{statusLabel(guest.attendance)}</p>
        </div>
      </div>
      <div className="attendance-buttons" role="group" aria-label={`Attendance for ${guest.name}`}>
        <button type="button" aria-pressed={guest.attendance === "attending"} className={guest.attendance === "attending" ? "selected yes" : ""} onClick={() => select("attending")}>
          <span aria-hidden="true">✓</span> We will attend
        </button>
        <button type="button" aria-pressed={guest.attendance === "declined"} className={guest.attendance === "declined" ? "selected no" : ""} onClick={() => select("declined")}>
          <span aria-hidden="true">×</span> We cannot attend
        </button>
      </div>
      {guest.attendance === "attending" && (
        <div className="notes-field">
          <label htmlFor={`notes-${guest.id}`}>Dietary or accessibility needs</label>
          <textarea
            id={`notes-${guest.id}`}
            value={guest.dietaryNotes}
            onChange={(event) => onChange({ ...guest, dietaryNotes: event.target.value })}
            placeholder="Optional, tell us what would help you feel comfortable"
            maxLength={500}
            rows={2}
          />
        </div>
      )}
    </article>
  );
}

function VenueScene() {
  return (
    <div className="venue-scene" aria-label="An abstract garden view of Midalidare Estate, from a warm afternoon into a starlit celebration">
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
      <p className="scene-label">Midalidare<br /><small>Among the Bulgarian vines</small></p>
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

// [left, top, size, hue] per flower in a milestone's cluster.
const LS_MILESTONES: Array<{ year: string; label: string; text: string; cluster: [number, number, number, number][] }> = [
  { year: "2015", label: "We met", text: "We met in the summer of 2015 and instantly fell in love.", cluster: [[0, 0, 58, 22], [26, 60, 34, 22], [2, 92, 26, 82]] },
  { year: "2018", label: "Vienna", text: "We moved to Vienna together.", cluster: [[0, 0, 58, 309], [24, 58, 34, 309], [0, 90, 26, 22]] },
  { year: "2023", label: "London", text: "We set London as our next adventure.", cluster: [[0, 0, 58, 82], [26, 60, 34, 82], [2, 92, 26, 309]] },
  { year: "2025", label: "The big question", text: "She said yes.", cluster: [[0, 0, 62, 18], [26, 62, 34, 22], [2, 94, 26, 18]] },
];

// [hue, size, at, side, off] for each bloom seated on the photo arch.
const LS_ARCH_FLOWERS: [number, number, number, number, number][] = [
  [18, 64, 0.985, 0, 0], [22, 34, 0.94, 1, 9], [309, 26, 0.9, -1, -8], [22, 46, 0.16, -1, -7],
  [82, 30, 0.23, -1, 8], [309, 24, 0.1, -1, 7], [309, 40, 0.66, 1, 10], [22, 28, 0.72, 1, -6], [82, 22, 0.6, 1, 9],
];

function LoveStory() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
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

    const buildVines = () => {
      root.querySelectorAll<SVGSVGElement>("[data-vine]").forEach((svg) => {
        if (svg.dataset.built) return;
        const stems = svg.querySelectorAll<SVGPathElement>("[data-stem]");
        if (!stems.length) return;
        let ok = true;
        stems.forEach((stem) => { if (!stem.getTotalLength || stem.getTotalLength() < 10) ok = false; });
        if (!ok) return;
        svg.dataset.built = "1";
        stems.forEach((stem) => {
          const total = stem.getTotalLength();
          stem.style.strokeDasharray = String(total);
          stem.style.strokeDashoffset = String(total);
          stem.style.transition = "stroke-dashoffset 120ms linear";
          stem.dataset.len = String(total);
          const count = Math.max(5, Math.round(total / 78));
          for (let i = 0; i < count; i += 1) {
            const t = (i + 0.6) / (count + 0.4);
            const at = total * t;
            const p = stem.getPointAtLength(at);
            const q = stem.getPointAtLength(Math.min(total, at + 1.5));
            const tangent = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
            const side = i % 2 ? 1 : -1;
            const len = 15 + (i % 3) * 3.5;
            const leaf = document.createElementNS(SVG_NS, "path");
            leaf.setAttribute("d", `M 0,0 C ${-len * 0.42},${-len * 0.3} ${-len * 0.252},${-len} 0,${-len} C ${len * 0.252},${-len} ${len * 0.42},${-len * 0.3} 0,0`);
            leaf.setAttribute("fill", i % 2 ? "oklch(56% 0.062 134)" : "oklch(49% 0.058 132)");
            leaf.setAttribute("data-grow", String(t));
            leaf.setAttribute("data-base", `translate(${p.x} ${p.y}) rotate(${tangent + 90 + side * 52})`);
            leaf.setAttribute("transform", `translate(${p.x} ${p.y}) rotate(${tangent + 90 + side * 52}) scale(0)`);
            svg.appendChild(leaf);
            if (i % 3 === 1) {
              const c = document.createElementNS(SVG_NS, "path");
              let d = "M 0,0";
              for (let s = 1; s <= 22; s += 1) {
                const ang = s * 0.62, rad = 1.6 + s * 0.52;
                d += ` L ${(Math.cos(ang) * rad * side).toFixed(2)},${(-Math.sin(ang) * rad * 0.62 - s * 0.22).toFixed(2)}`;
              }
              c.setAttribute("d", d);
              c.setAttribute("fill", "none");
              c.setAttribute("stroke", "oklch(52% 0.055 133)");
              c.setAttribute("stroke-width", "1.5");
              c.setAttribute("stroke-linecap", "round");
              c.setAttribute("data-grow", String(t));
              c.setAttribute("data-base", `translate(${p.x} ${p.y}) rotate(${tangent + 90 + side * 24})`);
              c.setAttribute("transform", `translate(${p.x} ${p.y}) rotate(${tangent + 90 + side * 24}) scale(0)`);
              svg.appendChild(c);
            }
          }
        });
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
              let d = "M 0,0";
              for (let s2 = 1; s2 <= 16; s2 += 1) {
                const ang = s2 * 0.52, rad = 1.3 + s2 * 0.42;
                d += ` L ${(Math.cos(ang) * rad * out).toFixed(2)},${(-Math.sin(ang) * rad * 0.58 - s2 * 0.2).toFixed(2)}`;
              }
              c.setAttribute("d", d);
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
        <p className="eyebrow ls-eyebrow">Our love story</p>
        <h2 id="ls-title">A story<br />in bloom</h2>
      </div>
      <div className="ls-timeline">
        <div className="ls-vine-holder" aria-hidden="true">
          <svg data-vine viewBox="0 0 64 800" preserveAspectRatio="none" className="ls-vine-svg">
            <path data-stem d="M32 0 C10 96 52 178 32 272 C12 366 54 448 32 542 C14 622 40 700 32 800" fill="none" stroke="oklch(46% 0.058 133)" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        </div>
        {LS_MILESTONES.map((milestone) => (
          <article data-milestone className="ls-milestone" key={milestone.year}>
            <span data-cluster aria-hidden="true" className="ls-cluster">
              {milestone.cluster.map(([left, top, size, hue], index) => (
                <span data-flower data-hue={hue} data-size={size} key={index} style={{ position: "absolute", left: `${left}px`, top: `${top}px`, display: "block" }} />
              ))}
            </span>
            <div data-copy className="ls-copy">
              <p className="ls-year">{milestone.year}</p>
              <p className="ls-label">{milestone.label}</p>
              <p className="ls-text">{milestone.text}</p>
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
              <div className="ls-locket-inner" role="img" aria-label="A photo of Ekaterina and Dimitar">
                <span className="petal-mark ls-locket-mark" aria-hidden="true" />
                <span className="ls-locket-hint">Your engagement photo</span>
              </div>
            </div>
          </div>
          <p data-copy className="ls-finale-line">and 2027, the part with all of you in it</p>
        </div>
      </div>
    </section>
  );
}

const programStops: Array<{ time: string; name: string; desc: string }> = [
  { time: "15:00", name: "Arrival", desc: "The stealing of the bride, a Bulgarian tradition you won't want to miss. Be on time; it starts at 15:30, and there's something cold to drink while you wait." },
  { time: "16:30", name: "Ceremony", desc: "Our vows among the vines." },
  { time: "17:30", name: "Drinks", desc: "A glass of the estate's own wine, something to eat, and the best view on the property." },
  { time: "19:30", name: "Dinner", desc: "Your chosen dish, a few Bulgarian traditions, and no shortage of wine. Menu choices open in October." },
  { time: "21:00", name: "Dancing", desc: "Our favourite songs and at least one hora. No experience needed, hold hands and follow whoever's on your right." },
];

function Invitation({ household, onUpdate, onOpenMeals, mealPhaseOpen, contacts, onExit }: {
  household: Household;
  onUpdate: (invitation: InvitationResponse) => void;
  onOpenMeals: () => void;
  mealPhaseOpen: boolean;
  contacts: ContactAction[];
  onExit: () => void;
}) {
  const [draft, setDraft] = useState(household);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [status, setStatus] = useState("");
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
      setStatus("Please choose an answer for each invited guest.");
      setSaveState("error");
      return;
    }
    if (saveState === "saving") return;
    setSaveState("saving");
    setStatus("Saving your reply…");
    try {
      const response = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential: draft.credential, responseVersion: draft.responseVersion, guests: draft.guests }),
      });
      if (response.status === 409) {
        setSaveState("conflict");
        setStatus("This invitation was updated on another phone. Load the latest saved reply, then review it before saving again.");
        return;
      }
      if (!response.ok) throw new Error("save failed");
      const saved = preserveCredential((await response.json()) as InvitationResponse, draft.credential);
      setDraft(saved.household);
      onUpdate(saved);
      safeRemoveStoredDraft(draftKey);
      setSaveState("success");
      setStatus("Your reply is confirmed. You can return with the same code if anything changes.");
    } catch {
      setSaveState("error");
      setStatus("We could not save your reply. Your choices are safe on this phone. Please try again.");
    }
  };

  const loadLatest = async () => {
    setSaveState("saving");
    setStatus("Loading the latest saved reply…");
    try {
      const latest = await fetchInvitation(household.credential);
      setDraft(latest.household);
      onUpdate(latest);
      safeRemoveStoredDraft(draftKey);
      setSaveState("idle");
      setStatus("The latest saved reply is now shown. Please review it before making any changes.");
    } catch {
      setSaveState("conflict");
      setStatus("We could not load the latest reply. Please check your connection and try again.");
    }
  };

  // The save bar is sticky, so its confirmation renders below the fold; bring the
  // receipt into view once the server confirms. scrollIntoView with default behavior
  // follows the page's scroll-behavior, which reduced-motion already sets to auto.
  useEffect(() => {
    if (saveState === "success") receiptRef.current?.scrollIntoView({ block: "nearest" });
  }, [saveState]);

  const saveLabel = saveState === "saving" ? "Saving…"
    : saveState === "error" ? "Try saving again"
    : saveState === "conflict" ? "Latest reply needed"
    : "Save our reply";

  return (
    <main className="invitation-page">
      <nav className="invitation-nav" aria-label="Invitation navigation">
        <span aria-hidden="true" />
        <a className="nav-rsvp" href="#rsvp">RSVP</a>
        <button type="button" className="nav-link" onClick={onExit}>Change invitation</button>
      </nav>

      <header className="invitation-hero">
        <div className="hero-vine hero-vine-one" aria-hidden="true" />
        <div className="hero-vine hero-vine-two" aria-hidden="true" />
        <div className="hero-botanical-frame" aria-hidden="true">
          <BotanicalPhoto className="hero-botanical hero-botanical-left" />
        </div>
        <div className="floating-petals" aria-hidden="true">{Array.from({ length: 11 }, (_, index) => <span key={index} />)}</div>
        <p className="eyebrow hero-eyebrow">Celebrate with us</p>
        <h1><span>Ekaterina</span><small>&amp;</small><span>Dimitar</span></h1>
        <p className="hero-subtitle">as we marry among the vines</p>
        <div className="event-line" aria-label="Wedding date and venue">
          <div><strong>Sunday</strong><span>20 June 2027</span></div>
          <span className="event-divider" aria-hidden="true" />
          <div><strong>Midalidare Estate</strong><span>Bulgaria</span></div>
        </div>
        <p className="hero-countdown">{daysUntilWedding} days to go <span aria-hidden="true">·</span> Kindly reply by 1 December 2026</p>
        <a className="scroll-prompt" href="#rsvp">Your invitation <span aria-hidden="true">↓</span></a>
        <div className="hero-fade" aria-hidden="true" />
      </header>

      <section className="rsvp-section" id="rsvp">
        <div className="rsvp-intro">
          <p className="eyebrow">{household.greeting || `Dear ${household.householdName}`}</p>
          <h2>We would love to<br />celebrate with you.</h2>
          <p>Please let us know whether you can join us.</p>
        </div>
        <div className="rsvp-column">
          <div className="rsvp-heading">
            <div><p className="eyebrow">Kindly reply</p><h2>Will you be there?</h2></div>
            <span className="reply-date">By 1 December 2026</span>
          </div>

          <div className="rsvp-progress" aria-hidden="true">
            <div className="rsvp-progress-labels">
              <span>{answeredCount} of {draft.guests.length} answered</span>
              {outstanding.length > 0 && <span className="rsvp-progress-outstanding">{outstanding.join(", ")} still to answer</span>}
            </div>
            <div className="rsvp-progress-track">
              <div className="rsvp-progress-fill" style={{ width: `${draft.guests.length ? (answeredCount / draft.guests.length) * 100 : 0}%` }} />
            </div>
          </div>

          <div className="guest-list">
            {draft.guests.map((guest) => <GuestRsvp key={guest.id} guest={guest} onChange={updateGuest} />)}
          </div>

          <div className="rsvp-save">
            {hasPending && <p className="rsvp-save-note">{outstanding.length} answer{outstanding.length > 1 ? "s" : ""} still needed for {outstanding.join(", ")}</p>}
            <button type="button" className="primary-action" onClick={save} disabled={saveState === "saving" || saveState === "conflict"}>
              {saveLabel} <span aria-hidden="true">→</span>
            </button>
            <p className={`save-status ${saveState}`} role={saveState === "error" || saveState === "conflict" ? "alert" : "status"}>{status}</p>
            {saveState === "conflict" && <button type="button" className="conflict-action" onClick={loadLatest}>Load latest saved reply</button>}
          </div>
          {saveState === "success" && (
            <div className="rsvp-receipt" aria-label="RSVP confirmation" ref={receiptRef}>
              <span className="receipt-mark" aria-hidden="true">✓</span>
              <div>
                <strong>Reply confirmed for {household.householdName}</strong>
                <p>{attendingNames.length > 0 ? `${attendingNames.join(" and ")} will join us on 20 June 2027.` : "We will miss you, and we are grateful you let us know."}</p>
                {attendingNames.length > 0 && (mealPhaseOpen
                  ? <p>The menu is open. <button type="button" className="receipt-link" onClick={onOpenMeals}>Choose a meal for each guest</button> with this same invitation.</p>
                  : <p>Closer to the day we will open the menu. Come back with this same link or printed code to choose a meal for each guest.</p>)}
              </div>
            </div>
          )}
          <ContactActions contacts={contacts} />
        </div>
      </section>

      {mealPhaseOpen ? (
        <section className="meal-teaser">
          <div>
            <p className="eyebrow">The wedding table</p>
            <h2>Meal choices are now open</h2>
            <p>Choose a meal for each attending guest using this same private invitation.</p>
          </div>
          <button type="button" className="secondary-action" onClick={onOpenMeals}>Choose meals <span aria-hidden="true">→</span></button>
        </section>
      ) : (
        <section className="meal-notice" aria-label="Meal choices">
          <BotanicalPhoto variant="sprig" className="meal-notice-botanical" />
          <div className="meal-notice-body">
            <p className="eyebrow">The wedding table</p>
            <h2>The menu is<br />still blooming</h2>
            <p>There is nothing to do here just yet. Dinner choices open in <strong>October</strong>, and you will return to this same invitation to choose a meal for each guest.</p>
            <span className="meal-notice-pill"><span className="meal-notice-dot" aria-hidden="true" />Menu opens later this year</span>
            <p className="meal-notice-foot">For now, please just let us know who is coming.</p>
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
          <h2 id="program-title">How the day unfolds</h2>
          <p>The day begins with a Bulgarian ritual you wouldn&apos;t want to miss.</p>
        </div>
        <div className="program-path">
          <span className="program-vine" aria-hidden="true" />
          {programStops.map((stop) => (
            <article className="program-stop" key={stop.time}>
              <span className="program-bud" aria-hidden="true" />
              <div><time>{stop.time}</time><h3>{stop.name}</h3><p>{stop.desc}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="venue-section" id="venue">
        <p className="eyebrow venue-eyebrow">The celebration</p>
        <VenueScene />
        <div className="estate-map-shell">
          <iframe
            title="Google Map showing Midalidare Estate in Mogilovo, Bulgaria"
            src="https://www.google.com/maps?q=42.3417472%2C25.4058997&z=15&output=embed"
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer"
          />
          <div className="estate-map-caption">
            <div><span>Our venue</span><strong>Midalidare Estate</strong><small>Mogilovo, Bulgaria</small></div>
            <a href="https://www.google.com/maps/search/?api=1&query=42.3417472%2C25.4058997" target="_blank" rel="noreferrer">Open in Google Maps <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <div className="dress-code-note">
          <span>Dress code</span>
          <strong>Pastels &amp; Wildflowers</strong>
          <div className="dress-code-swatches" aria-hidden="true">
            <span className="swatch-sage" /><span className="swatch-lilac" /><span className="swatch-blush" /><span className="swatch-champagne" />
          </div>
          <small>Elegant attire for an evening among the vines. Come in whatever makes you feel your best, and do bring a light jacket or a scarf, it turns cool once the sun goes down.</small>
        </div>
      </section>

      <section className="stay-section" id="stay" aria-label="Where to stay">
        <BotanicalPhoto variant="sprig" className="stay-botanical" />
        <div className="stay-body">
          <h2>Stay among<br />the vines</h2>
          <p>Midalidare is a wine estate in the countryside, about half an hour from Stara Zagora, and most guests will stay the night. Rooms on the estate are few, so once you&apos;ve replied we&apos;ll make sure you have somewhere to stay, on the estate or close by.</p>
          <div className="stay-cards">
            <div className="stay-card stay-card-onsite">
              <span className="stay-card-eyebrow">On site</span>
              <strong>Midalidare Estate</strong>
              <small>Vineyard rooms and suites, a short stroll from the celebration. Wake up where the party was.</small>
              <a className="stay-reserve" href="#stay" aria-disabled="true">Reserve a room <span aria-hidden="true">↗</span></a>
              <small className="stay-card-foot">Booking details to follow with your invitation.</small>
            </div>
            <div className="stay-card">
              <span className="stay-card-eyebrow stay-card-eyebrow-muted">15 to 40 minutes away</span>
              <strong>Nearby: Chirpan &amp; Stara Zagora</strong>
              <small>A handful of guesthouses and small hotels, for those who would like their own base.</small>
            </div>
          </div>
          <p className="stay-foot">Heading home the same night? There is free parking on the estate.</p>
        </div>
        <div className="stay-fade" aria-hidden="true" />
      </section>

      <LoveStory />

      <footer className="wedding-footer">
        <BotanicalPhoto variant="corner" className="footer-botanical" />
        <div className="footer-copy">
          <p>Thank you for being part of our story.</p>
          <span>We cannot wait to celebrate among the vines with you.</span>
        </div>
        <span className="footer-sign">Ekaterina &amp; Dimitar · 20 June 2027</span>
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
  const attending = household.guests.filter((guest) => guest.attendance === "attending");
  const [draft, setDraft] = useState(household);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [status, setStatus] = useState("");
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
      setStatus("Please choose a meal for each attending guest.");
      return;
    }
    if (saveState === "saving") return;
    setSaveState("saving");
    setStatus("Saving meal choices…");
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
        setStatus("This invitation was updated on another phone. Load the latest choices before saving again.");
        return;
      }
      if (!response.ok) throw new Error("save failed");
      const saved = preserveCredential((await response.json()) as InvitationResponse, draft.credential);
      setDraft(saved.household);
      onUpdate(saved);
      setSaveState("success");
      setStatus("Meal choices confirmed. Thank you.");
    } catch {
      setSaveState("error");
      setStatus("We could not save your meal choices. Please try again.");
    }
  };

  const loadLatest = async () => {
    setSaveState("saving");
    setStatus("Loading the latest saved choices…");
    try {
      const latest = await fetchInvitation(household.credential);
      setDraft(latest.household);
      onUpdate(latest);
      setSaveState("idle");
      setStatus("The latest saved choices are now shown. Please review them before making changes.");
    } catch {
      setSaveState("conflict");
      setStatus("We could not load the latest choices. Please check your connection and try again.");
    }
  };

  return (
    <main className="meal-page">
      <button className="back-button" type="button" onClick={onBack}>← Back to invitation</button>
      <section className="meal-intro">
        <p className="eyebrow">The wedding table</p>
        <h1>A meal chosen<br />just for you</h1>
        <p>Use the same private invitation to choose for each attending guest.</p>
      </section>
      {!open ? (
        <section className="phase-closed">
          <span className="season-mark" aria-hidden="true">✽</span>
          <p className="eyebrow">Coming later</p>
          <h2>The menu is still blooming.</h2>
          <p>There is nothing you need to do yet. We will let you know when meal choices open, and this same private invitation will still work.</p>
          <button type="button" className="primary-action" onClick={onBack}>Return to the invitation</button>
        </section>
      ) : attending.length === 0 ? (
        <section className="phase-closed"><h2>RSVP first</h2><p>Please confirm who is attending before choosing meals.</p><button type="button" className="primary-action" onClick={onBack}>Complete RSVP</button></section>
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
                  {availableMeals.length === 0 && <p>The menu for this guest is still being prepared.</p>}
                </div>
              </article>
            );
          })}
          <button type="button" className="primary-action" disabled={saveState === "saving" || saveState === "conflict"} onClick={save}>{saveState === "saving" ? "Saving…" : saveState === "error" ? "Try saving again" : saveState === "conflict" ? "Latest choices needed" : "Save meal choices"} <span aria-hidden="true">→</span></button>
          <p className={`save-status ${saveState}`} role={saveState === "error" || saveState === "conflict" ? "alert" : "status"}>{status}</p>
          {saveState === "conflict" && <button type="button" className="conflict-action" onClick={loadLatest}>Load latest saved choices</button>}
        </section>
      )}
    </main>
  );
}

export default function WeddingExperience() {
  const [household, setHousehold] = useState<Household | null>(null);
  const [view, setView] = useState<"entry" | "invitation" | "meals">("entry");
  const [mealPhaseOpen, setMealPhaseOpen] = useState(false);
  const [mealOptions, setMealOptions] = useState<MealOption[]>([]);
  const [contacts, setContacts] = useState<ContactAction[]>([]);
  const [linkStatus, setLinkStatus] = useState<"idle" | "loading">("idle");
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    removeLegacyCredentialDrafts();
    const credential = credentialFromLocation();
    if (!credential) return;
    setCredentialInAddressBar(credential);

    let cancelled = false;
    const loadingTimer = window.setTimeout(() => {
      if (!cancelled) {
        setLinkStatus("loading");
        setLinkError("");
      }
    }, 0);
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
      .catch(() => {
        if (!cancelled) {
          setCredentialInAddressBar();
          setLinkError("This personal link could not be opened. Enter the code from your printed invitation below.");
        }
      })
      .finally(() => {
        window.clearTimeout(loadingTimer);
        if (!cancelled) setLinkStatus("idle");
      });

    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimer);
    };
  }, []);

  const updateInvitation = (invitation: InvitationResponse) => {
    setHousehold(invitation.household);
    setMealPhaseOpen(invitation.mealPhaseOpen);
    setMealOptions(invitation.mealOptions);
    setContacts(invitation.contacts);
  };

  if (!household || view === "entry") {
    return <CodeEntry linkStatus={linkStatus} linkError={linkError} onFound={(found) => { updateInvitation(found); setView("invitation"); setCredentialInAddressBar(found.household.credential); }} />;
  }
  if (view === "meals") return <MealSelection household={household} open={mealPhaseOpen} mealOptions={mealOptions} onBack={() => setView("invitation")} onUpdate={updateInvitation} />;
  return <Invitation household={household} onUpdate={updateInvitation} onOpenMeals={() => setView("meals")} mealPhaseOpen={mealPhaseOpen} contacts={contacts} onExit={() => { setHousehold(null); setView("entry"); setCredentialInAddressBar(); }} />;
}
