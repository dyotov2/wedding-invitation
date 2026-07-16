"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";

type Attendance = "pending" | "attending" | "declined";
type ReplySource = "website" | "phone" | "whatsapp" | "viber" | "paper";

type Guest = {
  id: number;
  name: string;
  attendance: Attendance;
  dietaryNotes: string;
  mealChoice: string;
  responseSource: ReplySource;
};

type Household = {
  id: number;
  code: string;
  householdName: string;
  guests: Guest[];
};

type InvitationResponse = {
  household: Household;
  mealPhaseOpen: boolean;
};

type SaveState = "idle" | "saving" | "success" | "error";

const demoHousehold: Household = {
  id: 1,
  code: "ROSE27",
  householdName: "The Petrov Family",
  guests: [
    {
      id: 1,
      name: "Elena Petrova",
      attendance: "pending",
      dietaryNotes: "",
      mealChoice: "",
      responseSource: "website",
    },
    {
      id: 2,
      name: "Nikolay Petrov",
      attendance: "pending",
      dietaryNotes: "",
      mealChoice: "",
      responseSource: "website",
    },
  ],
};

const meals = [
  { value: "garden", title: "Garden table", detail: "Seasonal vegetables, herbs and grains" },
  { value: "estate", title: "Estate table", detail: "A celebratory meat main with summer sides" },
  { value: "little", title: "Little guest", detail: "A simple child-friendly plate" },
];

function PetalMark({ small = false }: { small?: boolean }) {
  return <span className={small ? "petal-mark small" : "petal-mark"} aria-hidden="true" />;
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
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
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

function BotanicalFrame() {
  return (
    <div className="garden-frame" aria-hidden="true">
      <div className="side-garden garden-left">
        <span className="garden-stem" />
        {[1, 2, 3, 4, 5, 6].map((leaf) => <span key={leaf} className={`garden-leaf leaf-${leaf}`} />)}
        <BotanicalPhoto variant="sprig" className="garden-botanical garden-botanical-low" />
      </div>
      <div className="side-garden garden-right">
        <span className="garden-stem" />
        {[1, 2, 3, 4, 5, 6].map((leaf) => <span key={leaf} className={`garden-leaf leaf-${leaf}`} />)}
        <BotanicalPhoto variant="sprig" className="garden-botanical garden-botanical-low" />
      </div>
    </div>
  );
}

function useLivingGarden() {
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    page.classList.add("motion-ready");
    const blooms = Array.from(page.querySelectorAll<HTMLElement>("[data-bloom]"));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-blooming");
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -8%" });
    blooms.forEach((element) => observer.observe(element));

    let scheduled = false;
    const updateGarden = () => {
      const rect = page.getBoundingClientRect();
      const travel = Math.max(page.offsetHeight - window.innerHeight, 1);
      const progress = Math.min(1, Math.max(0, -rect.top / travel));
      page.style.setProperty("--garden-progress", progress.toFixed(4));
      page.classList.toggle("garden-awake", progress > 0.025);
      scheduled = false;
    };
    const onScroll = () => {
      if (!scheduled) {
        scheduled = true;
        window.requestAnimationFrame(updateGarden);
      }
    };
    updateGarden();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      observer.disconnect();
      page.classList.remove("motion-ready");
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return pageRef;
}

const contactLinks = [
  { key: "whatsapp", label: "WhatsApp", mark: "W", href: process.env.NEXT_PUBLIC_WEDDING_WHATSAPP_URL ?? "" },
  { key: "viber", label: "Viber", mark: "V", href: process.env.NEXT_PUBLIC_WEDDING_VIBER_URL ?? "" },
  { key: "phone", label: "Call us", mark: "☎", href: process.env.NEXT_PUBLIC_WEDDING_PHONE_URL ?? "" },
].filter((contact) => /^(https?:|viber:|tel:)/.test(contact.href));

function ContactActions() {
  if (contactLinks.length === 0) return null;

  return (
    <div className="contact-area">
      <p className="eyebrow">Prefer to reply personally?</p>
      <div className="contact-actions" aria-label="Contact options">
        {contactLinks.map((contact) => (
          <a key={contact.key} className={`contact-button ${contact.key}`} href={contact.href}>
            <span aria-hidden="true">{contact.mark}</span> {contact.label}
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
      const response = await fetch(`/api/invitation?code=${encodeURIComponent(normalized)}`);
      if (!response.ok) throw new Error("not found");
      const invitation = (await response.json()) as InvitationResponse;
      window.history.replaceState({}, "", `?code=${encodeURIComponent(normalized)}`);
      onFound(invitation);
    } catch {
      if (normalized === demoHousehold.code) {
        onFound({ household: demoHousehold, mealPhaseOpen: false });
      } else {
        setError("We could not find that invitation. Please check the code and try again.");
      }
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

        <form className="code-form" onSubmit={submit} noValidate>
          <label htmlFor="invitation-code">Invitation code</label>
          <div className="code-row">
            <input
              id="invitation-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="e.g. ROSE27"
              autoCapitalize="characters"
              autoComplete="off"
              aria-describedby="code-hint code-error"
            />
            <button type="submit" disabled={loading}>{loading ? "Opening…" : "Open invitation"}</button>
          </div>
          <p id="code-hint" className="form-hint">You will find this short code on your printed card.</p>
          <p id="code-error" className="form-error" role="alert">{error}</p>
          {linkStatus === "loading" && <p className="link-status" role="status">Opening your personal invitation…</p>}
          {linkError && <p className="form-error" role="alert">{linkError}</p>}
        </form>

        <button className="demo-link" type="button" onClick={() => { setCode("ROSE27"); }}>
          Preview with code <strong>ROSE27</strong>
        </button>
      </section>
      <p className="entry-footer">Ekaterina & Dimitar · Midalidare Estate, Bulgaria</p>
    </main>
  );
}

function GuestRsvp({ guest, onChange }: { guest: Guest; onChange: (guest: Guest) => void }) {
  const select = (attendance: Attendance) => onChange({ ...guest, attendance });

  return (
    <article className={`guest-rsvp ${guest.attendance}`}>
      <div className="guest-heading">
        <span className="guest-number" aria-hidden="true">{guest.name.slice(0, 1)}</span>
        <div>
          <h3>{guest.name}</h3>
          <p>{guest.attendance === "pending" ? "Awaiting a reply" : guest.attendance === "attending" ? "Joyfully attending" : "Unable to attend"}</p>
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
            rows={3}
          />
        </div>
      )}
    </article>
  );
}

function Invitation({ household, onUpdate, onOpenMeals, mealPhaseOpen, onExit }: {
  household: Household;
  onUpdate: (household: Household) => void;
  onOpenMeals: () => void;
  mealPhaseOpen: boolean;
  onExit: () => void;
}) {
  const pageRef = useLivingGarden();
  const [draft, setDraft] = useState(household);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [status, setStatus] = useState("");
  const [daysUntilWedding] = useState(() => Math.max(0, Math.ceil((new Date("2027-06-20T16:30:00+03:00").getTime() - Date.now()) / 86_400_000)));
  const draftKey = `wedding-rsvp-draft:${household.code}`;
  const updateGuest = (next: Guest) => {
    setSaveState("idle");
    setStatus("");
    setDraft((current) => ({ ...current, guests: current.guests.map((guest) => guest.id === next.id ? next : guest) }));
  };
  const hasPending = draft.guests.some((guest) => guest.attendance === "pending");
  const isDirty = JSON.stringify(draft.guests) !== JSON.stringify(household.guests);
  const attendingNames = draft.guests.filter((guest) => guest.attendance === "attending").map((guest) => guest.name);

  useEffect(() => {
    const restoreDraft = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(draftKey);
        if (!stored) return;
        const restored = JSON.parse(stored) as Household;
        const sameGuests = restored.guests.map((guest) => guest.id).join(",") === household.guests.map((guest) => guest.id).join(",");
        if (sameGuests) setDraft(restored);
      } catch {
        window.localStorage.removeItem(draftKey);
      }
    }, 0);
    return () => window.clearTimeout(restoreDraft);
  }, [draftKey, household]);

  useEffect(() => {
    if (!isDirty || saveState === "success") return;
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
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
        body: JSON.stringify({ code: draft.code, guests: draft.guests }),
      });
      if (!response.ok) throw new Error("save failed");
      const saved = (await response.json()) as Household;
      setDraft(saved);
      onUpdate(saved);
      window.localStorage.removeItem(draftKey);
      setSaveState("success");
      setStatus("Your reply is confirmed. You can return with the same code if anything changes.");
    } catch {
      setSaveState("error");
      setStatus("We could not save your reply. Your choices are safe on this phone. Please try again.");
    }
  };

  return (
    <main className="invitation-page" ref={pageRef}>
      <BotanicalFrame />
      <nav className="invitation-nav" aria-label="Invitation navigation">
        <button type="button" className="wordmark" onClick={onExit}>E <PetalMark small /> D</button>
        <div className="invitation-nav-links"><a href="#program">The day</a><a href="#your-invitation">RSVP</a></div>
        <a className="mobile-rsvp-link" href="#your-invitation">RSVP</a>
        <button type="button" className="nav-link" onClick={onExit}>Change invitation</button>
      </nav>

      <header className="invitation-hero">
        <div className="hero-vine hero-vine-one" aria-hidden="true" />
        <div className="hero-vine hero-vine-two" aria-hidden="true" />
        <div className="hero-botanical-frame" aria-hidden="true">
          <BotanicalPhoto className="hero-botanical hero-botanical-left" />
        </div>
        <div className="floating-petals" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <span key={index} />)}</div>
        <p className="eyebrow hero-eyebrow">Please celebrate with us</p>
          <p className="hero-love-note">Forever starts today</p>
        <h1><span>Ekaterina</span><small>&</small><span>Dimitar</span></h1>
        <p className="hero-message">Join us as we begin our forever.</p>
        <div className="event-line" aria-label="Wedding date and venue">
          <div><strong>Sunday</strong><span>20 June 2027</span></div>
          <PetalMark />
          <div><strong>Midalidare Estate</strong><span>Bulgaria</span></div>
        </div>
        <p className="hero-countdown">{daysUntilWedding} days to go <span aria-hidden="true">·</span> Kindly reply by 20 April 2027</p>
        <a className="scroll-prompt" href="#your-invitation">Your invitation <span aria-hidden="true">↓</span></a>
      </header>

      <section className="personal-section" id="your-invitation" data-bloom>
        <div className="personal-intro">
          <p className="eyebrow">Dear {household.householdName}</p>
          <h2>We would love to<br />celebrate with you.</h2>
          <p>This invitation is especially for the people named below. Please let us know whether each guest can join us.</p>
        </div>
        <div className="rsvp-column">
          <div className="rsvp-heading">
            <div><p className="eyebrow">Kindly reply</p><h2>Will you be there?</h2></div>
            <span className="reply-date">By 20 April 2027</span>
          </div>
          <div className="guest-list">
            {draft.guests.map((guest) => <GuestRsvp key={guest.id} guest={guest} onChange={updateGuest} />)}
          </div>
          <button type="button" className="primary-action" onClick={save} disabled={saveState === "saving"}>
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "Try saving again" : "Save our reply"} <span aria-hidden="true">→</span>
          </button>
          <p className={`save-status ${saveState}`} role={saveState === "error" ? "alert" : "status"}>{status}</p>
          {saveState === "success" && (
            <div className="rsvp-receipt" aria-label="RSVP confirmation">
              <span className="receipt-mark" aria-hidden="true">✓</span>
              <div>
                <strong>Reply confirmed for {household.householdName}</strong>
                <p>{attendingNames.length > 0 ? `${attendingNames.join(" and ")} will join us on 20 June 2027.` : "We will miss you, and we are grateful you let us know."}</p>
              </div>
            </div>
          )}
          <ContactActions />
        </div>
      </section>

      <section className="program-hero" id="program" data-bloom aria-labelledby="program-title">
        <div className="program-canopy" aria-hidden="true">
          <span className="program-branch branch-left" /><span className="program-branch branch-right" />
          <BotanicalPhoto variant="corner" className="program-botanical program-botanical-one" />
          <BotanicalPhoto variant="sprig" className="program-botanical program-botanical-two" />
        </div>
        <div className="program-heading">
          <p className="eyebrow">The day in bloom</p>
          <h2 id="program-title">Our wedding day</h2>
          <p>A gentle rhythm for a long summer celebration.</p>
        </div>
        <div className="program-path">
          <span className="program-vine" aria-hidden="true" />
          <article className="program-stop stop-one">
            <time>16:30</time><span className="program-bud" aria-hidden="true" />
            <div><small>Gather</small><h3>Ceremony</h3><p>Our promises among the vines.</p></div>
          </article>
          <article className="program-stop stop-two">
            <time>18:00</time><span className="program-bud" aria-hidden="true" />
            <div><small>Celebrate</small><h3>Dinner</h3><p>A long table, local wine, and summer light.</p></div>
          </article>
          <article className="program-stop stop-three">
            <time>20:30</time><span className="program-bud" aria-hidden="true" />
            <div><small>Stay awhile</small><h3>Dancing</h3><p>Music beneath the evening sky.</p></div>
          </article>
        </div>
      </section>

      <section className="bloom-manifesto" data-bloom aria-label="Love blooms">
        <span className="manifesto-seal">20 · 06 · 2027</span>
        <p>Love</p><p>blooms</p>
        <BotanicalPhoto variant="corner" className="manifesto-botanical manifesto-one" />
        <span className="manifesto-note">Forever starts here</span>
      </section>

      <section className="estate-section" data-bloom>
        <div className="estate-copy">
          <p className="eyebrow">The celebration</p>
          <h2>A summer day<br />among the vines</h2>
          <p>We will gather at Midalidare Estate for a relaxed afternoon of ceremony, dinner, music, and dancing beneath the Bulgarian summer sky.</p>
          <div className="dress-code-note">
            <span>Dress code</span>
            <strong>Pastels & Wildflowers</strong>
            <small>Soft, sun-washed colours and romantic floral details.</small>
          </div>
        </div>
        <div className="estate-art" aria-label="An abstract garden view inspired by Midalidare Estate">
          <span className="sun" /><span className="hill hill-one" /><span className="hill hill-two" />
          <span className="vine-row row-one" /><span className="vine-row row-two" /><span className="vine-row row-three" />
          <div className="estate-botanicals" aria-hidden="true"><BotanicalPhoto className="estate-botanical estate-botanical-one" /><BotanicalPhoto variant="corner" className="estate-botanical estate-botanical-two" /></div>
          <p>Midalidare<br /><small>Among the Bulgarian vines</small></p>
        </div>
        <div className="estate-map-shell">
          <iframe
            title="Google Map showing Midalidare Estate in Mogilovo, Bulgaria"
            src="https://www.google.com/maps?q=42.3417472%2C25.4058997&z=15&output=embed"
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="estate-map-caption">
            <div><span>Our venue</span><strong>Midalidare Estate</strong><small>Mogilovo, Bulgaria</small></div>
            <a href="https://www.google.com/maps/search/?api=1&query=42.3417472%2C25.4058997" target="_blank" rel="noreferrer">Open in Google Maps <span aria-hidden="true">↗</span></a>
          </div>
        </div>
      </section>

      {mealPhaseOpen && (
        <section className="meal-teaser" data-bloom>
          <PetalMark />
          <div>
            <p className="eyebrow">The wedding table</p>
            <h2>Meal choices are now open</h2>
            <p>Choose a meal for each attending guest using this same private invitation.</p>
          </div>
          <button type="button" className="secondary-action" onClick={onOpenMeals}>Choose meals <span aria-hidden="true">→</span></button>
        </section>
      )}

      <footer className="wedding-footer" data-bloom>
        <BotanicalPhoto variant="corner" className="footer-botanical" />
        <div className="footer-copy">
          <p>Thank you for being part of our story.</p>
          <span>We cannot wait to celebrate among the vines with you.</span>
        </div>
        <span>Ekaterina & Dimitar · 20 June 2027</span>
      </footer>
    </main>
  );
}

function MealSelection({ household, open, onBack, onUpdate }: { household: Household; open: boolean; onBack: () => void; onUpdate: (household: Household) => void }) {
  const attending = household.guests.filter((guest) => guest.attendance === "attending");
  const [draft, setDraft] = useState(household);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [status, setStatus] = useState("");
  const missingChoice = attending.some((guest) => !draft.guests.find((item) => item.id === guest.id)?.mealChoice);
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
      const response = await fetch("/api/meals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: draft.code, guests: draft.guests }) });
      if (!response.ok) throw new Error("save failed");
      const saved = (await response.json()) as Household;
      setDraft(saved);
      onUpdate(saved);
      setSaveState("success");
      setStatus("Meal choices confirmed. Thank you.");
    } catch {
      setSaveState("error");
      setStatus("We could not save your meal choices. Please try again.");
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
          <p>There is nothing you need to do yet. We will let you know when meal choices open, and your invitation code <strong>{household.code}</strong> will still work.</p>
          <button type="button" className="primary-action" onClick={onBack}>Return to the invitation</button>
        </section>
      ) : attending.length === 0 ? (
        <section className="phase-closed"><h2>RSVP first</h2><p>Please confirm who is attending before choosing meals.</p><button type="button" className="primary-action" onClick={onBack}>Complete RSVP</button></section>
      ) : (
        <section className="meal-choices">
          {attending.map((guest) => {
            const current = draft.guests.find((item) => item.id === guest.id) ?? guest;
            return (
              <article className="meal-guest" key={guest.id}>
                <h2>{guest.name}</h2>
                <div className="meal-options">
                  {meals.map((meal) => (
                    <button key={meal.value} type="button" aria-pressed={current.mealChoice === meal.value} className={current.mealChoice === meal.value ? "selected" : ""} onClick={() => { setSaveState("idle"); setStatus(""); setDraft({ ...draft, guests: draft.guests.map((item) => item.id === guest.id ? { ...item, mealChoice: meal.value } : item) }); }}>
                      <span className="meal-radio" aria-hidden="true" />
                      <strong>{meal.title}</strong><small>{meal.detail}</small>
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
          <button type="button" className="primary-action" disabled={saveState === "saving"} onClick={save}>{saveState === "saving" ? "Saving…" : saveState === "error" ? "Try saving again" : "Save meal choices"} <span aria-hidden="true">→</span></button>
          <p className={`save-status ${saveState}`} role={saveState === "error" ? "alert" : "status"}>{status}</p>
        </section>
      )}
    </main>
  );
}

export default function WeddingExperience() {
  const [household, setHousehold] = useState<Household | null>(null);
  const [view, setView] = useState<"entry" | "invitation" | "meals">("entry");
  const [mealPhaseOpen, setMealPhaseOpen] = useState(false);
  const [linkStatus, setLinkStatus] = useState<"idle" | "loading">("idle");
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      fetch(`/api/invitation?code=${encodeURIComponent(code)}`)
        .then((response) => response.ok ? response.json() : Promise.reject())
        .then((data: InvitationResponse) => { setHousehold(data.household); setMealPhaseOpen(data.mealPhaseOpen); setView("invitation"); })
        .catch(() => {
          if (code.toUpperCase() === demoHousehold.code) {
            setHousehold(demoHousehold);
            setView("invitation");
          } else {
            setLinkError("This personal link could not be opened. Enter the code from your printed invitation below.");
          }
        })
        .finally(() => setLinkStatus("idle"));
    }
  }, []);

  if (!household || view === "entry") return <CodeEntry linkStatus={linkStatus} linkError={linkError} onFound={(found) => { setHousehold(found.household); setMealPhaseOpen(found.mealPhaseOpen); setView("invitation"); }} />;
  if (view === "meals") return <MealSelection household={household} open={mealPhaseOpen} onBack={() => setView("invitation")} onUpdate={setHousehold} />;
  return <Invitation household={household} onUpdate={setHousehold} onOpenMeals={() => setView("meals")} mealPhaseOpen={mealPhaseOpen} onExit={() => { setHousehold(null); setView("entry"); window.history.replaceState({}, "", "/"); }} />;
}
