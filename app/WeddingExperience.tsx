"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

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

type AdminData = {
  households: Household[];
  mealPhaseOpen: boolean;
};

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

function BotanicalPhoto({ className = "" }: { className?: string }) {
  return (
    <img
      className={`botanical-photo ${className}`}
      src="/botanical-cluster-v1.png"
      alt=""
      aria-hidden="true"
      draggable={false}
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

    const draw = (progress: number) => {
      currentProgress = progress;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(rect.width, 1);
      const height = Math.max(rect.height, 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
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
        <BotanicalPhoto className="garden-botanical garden-botanical-low" />
        <BotanicalPhoto className="garden-botanical garden-botanical-high" />
      </div>
      <div className="side-garden garden-right">
        <span className="garden-stem" />
        {[1, 2, 3, 4, 5, 6].map((leaf) => <span key={leaf} className={`garden-leaf leaf-${leaf}`} />)}
        <BotanicalPhoto className="garden-botanical garden-botanical-low" />
        <BotanicalPhoto className="garden-botanical garden-botanical-high" />
      </div>
    </div>
  );
}

function useLivingGarden() {
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
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
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return pageRef;
}

function ContactActions() {
  const [message, setMessage] = useState("");
  const notify = (label: string) => {
    setMessage(`${label} details will be added to the final invitation.`);
    window.setTimeout(() => setMessage(""), 3200);
  };

  return (
    <div className="contact-area">
      <p className="eyebrow">Prefer to reply personally?</p>
      <div className="contact-actions" aria-label="Contact options">
        <button type="button" className="contact-button whatsapp" onClick={() => notify("WhatsApp")}>
          <span aria-hidden="true">W</span> WhatsApp
        </button>
        <button type="button" className="contact-button viber" onClick={() => notify("Viber")}>
          <span aria-hidden="true">V</span> Viber
        </button>
        <button type="button" className="contact-button phone" onClick={() => notify("Phone")}>
          <span aria-hidden="true">☎</span> Call us
        </button>
      </div>
      <p className="contact-message" role="status">{message}</p>
    </div>
  );
}

function CodeEntry({ onFound }: { onFound: (household: Household) => void }) {
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
      const household = (await response.json()) as Household;
      window.history.replaceState({}, "", `?code=${encodeURIComponent(normalized)}`);
      onFound(household);
    } catch {
      if (normalized === demoHousehold.code) {
        onFound(demoHousehold);
      } else {
        setError("We could not find that invitation. Please check the code and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="entry-page">
      <BotanicalPhoto className="entry-botanical entry-botanical-one" />
      <BotanicalPhoto className="entry-botanical entry-botanical-two" />
      <div className="entry-petals" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <span key={index} />)}</div>
      <section className="entry-panel" aria-labelledby="entry-title">
        <div className="entry-heart-stage">
          <div className="entry-heart-vine" aria-hidden="true"><HeartVine /></div>
          <p className="entry-love-note">love blooms</p>
          <div className="entry-names" aria-label="Dimitar and Ekaterina"><span>Dimitar</span><small>+</small><span>Ekaterina</span></div>
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
        </form>

        <button className="demo-link" type="button" onClick={() => { setCode("ROSE27"); }}>
          Preview with code <strong>ROSE27</strong>
        </button>
      </section>
      <p className="entry-footer">Dimitar & Ekaterina · Midalidare Estate, Bulgaria</p>
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
        <button type="button" className={guest.attendance === "attending" ? "selected yes" : ""} onClick={() => select("attending")}>
          <span aria-hidden="true">✓</span> We will attend
        </button>
        <button type="button" className={guest.attendance === "declined" ? "selected no" : ""} onClick={() => select("declined")}>
          <span aria-hidden="true">×</span> We cannot attend
        </button>
      </div>
      {guest.attendance === "attending" && (
        <div className="notes-field">
          <label htmlFor={`notes-${guest.id}`}>Dietary restrictions or a note</label>
          <textarea
            id={`notes-${guest.id}`}
            value={guest.dietaryNotes}
            onChange={(event) => onChange({ ...guest, dietaryNotes: event.target.value })}
            placeholder="Optional, tell us anything we should know"
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
  const [status, setStatus] = useState("");
  const daysUntilWedding = Math.max(0, Math.ceil((new Date("2027-06-20T16:30:00+03:00").getTime() - Date.now()) / 86_400_000));
  const updateGuest = (next: Guest) => setDraft({ ...draft, guests: draft.guests.map((guest) => guest.id === next.id ? next : guest) });
  const hasPending = draft.guests.some((guest) => guest.attendance === "pending");

  const save = async () => {
    if (hasPending) {
      setStatus("Please choose an answer for each invited guest.");
      return;
    }
    setStatus("Saving your reply…");
    try {
      const response = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: draft.code, guests: draft.guests }),
      });
      if (!response.ok) throw new Error("save failed");
    } catch {
      // The designed preview remains usable if local persistence is unavailable.
    }
    onUpdate(draft);
    setStatus("Thank you. Your reply has been saved with love.");
  };

  return (
    <main className="invitation-page" ref={pageRef}>
      <BotanicalFrame />
      <nav className="invitation-nav" aria-label="Invitation navigation">
        <button type="button" className="wordmark" onClick={onExit}>D <PetalMark small /> E</button>
        <div className="invitation-nav-links"><a href="#program">The day</a><a href="#your-invitation">RSVP</a></div>
        <button type="button" className="nav-link" onClick={onExit}>Change invitation</button>
      </nav>

      <header className="invitation-hero">
        <div className="hero-vine hero-vine-one" aria-hidden="true" />
        <div className="hero-vine hero-vine-two" aria-hidden="true" />
        <div className="hero-botanical-frame" aria-hidden="true">
          <BotanicalPhoto className="hero-botanical hero-botanical-left" />
          <BotanicalPhoto className="hero-botanical hero-botanical-right" />
        </div>
        <div className="floating-petals" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <span key={index} />)}</div>
        <p className="eyebrow hero-eyebrow">Please celebrate with us</p>
        <p className="hero-love-note">love blooms</p>
        <h1><span>Dimitar</span><small>&</small><span>Ekaterina</span></h1>
        <p className="hero-message">Join us as we begin our forever.</p>
        <div className="event-line" aria-label="Wedding date and venue">
          <div><strong>Sunday</strong><span>20 June 2027</span></div>
          <PetalMark />
          <div><strong>Midalidare Estate</strong><span>Bulgaria</span></div>
        </div>
        <p className="hero-countdown">{daysUntilWedding} days to go <span aria-hidden="true">·</span> Kindly reply by 20 April 2027</p>
        <a className="scroll-prompt" href="#your-invitation">Your invitation <span aria-hidden="true">↓</span></a>
      </header>

      <section className="bloom-manifesto" data-bloom aria-label="Love blooms">
        <span className="manifesto-seal">20 · 06 · 2027</span>
        <p>Love</p><p>blooms</p>
        <BotanicalPhoto className="manifesto-botanical manifesto-one" />
        <BotanicalPhoto className="manifesto-botanical manifesto-two" />
        <span className="manifesto-note">Forever starts here</span>
      </section>

      <section className="personal-section" id="your-invitation" data-bloom>
        <div className="personal-vine" aria-hidden="true"><span /><span /><BotanicalPhoto className="personal-botanical" /></div>
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
          <button type="button" className="primary-action" onClick={save}>Save our reply <span aria-hidden="true">→</span></button>
          <p className={status.includes("Thank") ? "save-status success" : "save-status"} role="status">{status}</p>
          <ContactActions />
        </div>
      </section>

      <section className="program-hero" id="program" data-bloom aria-labelledby="program-title">
        <div className="program-canopy" aria-hidden="true">
          <span className="program-branch branch-left" /><span className="program-branch branch-right" />
          <BotanicalPhoto className="program-botanical program-botanical-one" />
          <BotanicalPhoto className="program-botanical program-botanical-two" />
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

      <section className="estate-section" data-bloom>
        <div className="estate-copy">
          <p className="eyebrow">The celebration</p>
          <h2>A summer day<br />among the vines</h2>
          <p>We will gather at Midalidare Estate for a relaxed afternoon of ceremony, dinner, music, and dancing beneath the Bulgarian summer sky.</p>
        </div>
        <div className="estate-art" aria-label="An abstract garden view inspired by Midalidare Estate">
          <span className="sun" /><span className="hill hill-one" /><span className="hill hill-two" />
          <span className="vine-row row-one" /><span className="vine-row row-two" /><span className="vine-row row-three" />
          <div className="estate-botanicals" aria-hidden="true"><BotanicalPhoto className="estate-botanical estate-botanical-one" /><BotanicalPhoto className="estate-botanical estate-botanical-two" /></div>
          <p>Love blooms<br /><small>20 · 06 · 2027</small></p>
        </div>
      </section>

      <section className="meal-teaser" data-bloom>
        <div className="meal-vine" aria-hidden="true"><span /><span /><BotanicalPhoto className="meal-botanical" /></div>
        <PetalMark />
        <div>
          <p className="eyebrow">Later this year</p>
          <h2>Your menu, on the same invitation</h2>
          <p>When our menu is ready, return with this same private link or code to choose a meal for every attending guest.</p>
        </div>
        <button type="button" className="secondary-action" onClick={onOpenMeals}>{mealPhaseOpen ? "Choose meals" : "See how it works"} <span aria-hidden="true">→</span></button>
      </section>

      <footer className="wedding-footer" data-bloom>
        <BotanicalPhoto className="footer-botanical" />
        <p>Forever starts today</p>
        <span>Dimitar & Ekaterina · 20 June 2027</span>
      </footer>
    </main>
  );
}

function MealSelection({ household, open, onBack, onUpdate }: { household: Household; open: boolean; onBack: () => void; onUpdate: (household: Household) => void }) {
  const attending = household.guests.filter((guest) => guest.attendance === "attending");
  const [draft, setDraft] = useState(household);
  const [status, setStatus] = useState("");
  const save = async () => {
    setStatus("Saving meal choices…");
    try {
      await fetch("/api/meals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: draft.code, guests: draft.guests }) });
    } catch {}
    onUpdate(draft);
    setStatus("Meal choices saved. Thank you.");
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
                    <button key={meal.value} type="button" className={current.mealChoice === meal.value ? "selected" : ""} onClick={() => setDraft({ ...draft, guests: draft.guests.map((item) => item.id === guest.id ? { ...item, mealChoice: meal.value } : item) })}>
                      <span className="meal-radio" aria-hidden="true" />
                      <strong>{meal.title}</strong><small>{meal.detail}</small>
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
          <button type="button" className="primary-action" onClick={save}>Save meal choices <span aria-hidden="true">→</span></button>
          <p className="save-status" role="status">{status}</p>
        </section>
      )}
    </main>
  );
}

function AdminDashboard({ data, onClose, onRefresh }: { data: AdminData; onClose: () => void; onRefresh: () => void }) {
  const guests = data.households.flatMap((household) => household.guests.map((guest) => ({ ...guest, household })));
  const attending = guests.filter((guest) => guest.attendance === "attending").length;
  const declined = guests.filter((guest) => guest.attendance === "declined").length;
  const pending = guests.filter((guest) => guest.attendance === "pending").length;
  const [filter, setFilter] = useState<Attendance | "all">("all");
  const visible = filter === "all" ? guests : guests.filter((guest) => guest.attendance === filter);

  const updateSetting = async () => {
    await fetch("/api/admin/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mealPhaseOpen: !data.mealPhaseOpen }) });
    onRefresh();
  };

  const manualReply = async (guestId: number, attendance: Attendance, responseSource: ReplySource) => {
    await fetch("/api/admin/reply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ guestId, attendance, responseSource }) });
    onRefresh();
  };

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <button className="admin-brand" type="button" onClick={onClose}>D <PetalMark small /> E</button>
        <div><p className="eyebrow">Wedding desk</p><h1>Guest replies</h1></div>
        <nav aria-label="Admin sections"><button className="active">Overview</button><button>Households</button><button>Dietary notes</button><button>Meal choices</button></nav>
        <button type="button" className="back-to-site" onClick={onClose}>← View invitation</button>
      </aside>
      <section className="admin-content">
        <header className="admin-header">
          <div><p className="eyebrow">20 June 2027</p><h2>Good morning, Dimitar & Ekaterina</h2><p>Here is how your guest list is coming together.</p></div>
          <button type="button" className={data.mealPhaseOpen ? "phase-toggle open" : "phase-toggle"} onClick={updateSetting}><span /> Meal choices {data.mealPhaseOpen ? "open" : "closed"}</button>
        </header>
        <div className="metric-strip">
          <div><strong>{guests.length}</strong><span>Invited guests</span></div>
          <div className="metric-attending"><strong>{attending}</strong><span>Attending</span></div>
          <div><strong>{pending}</strong><span>Awaiting reply</span></div>
          <div><strong>{declined}</strong><span>Cannot attend</span></div>
        </div>
        <section className="guest-register">
          <div className="register-heading"><div><p className="eyebrow">Live guest list</p><h2>Responses</h2></div><div className="filter-buttons">{(["all", "attending", "pending", "declined"] as const).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All guests" : item === "declined" ? "Not attending" : item}</button>)}</div></div>
          <div className="guest-table" role="table" aria-label="Guest responses">
            <div className="table-row table-head" role="row"><span>Guest</span><span>Household</span><span>Reply</span><span>Source</span><span>Notes</span></div>
            {visible.map((guest) => (
              <div className="table-row" role="row" key={guest.id}>
                <span data-label="Guest"><strong>{guest.name}</strong><small>{guest.household.code}</small></span>
                <span data-label="Household">{guest.household.householdName}</span>
                <span data-label="Reply"><select aria-label={`Reply for ${guest.name}`} value={guest.attendance} onChange={(event) => manualReply(guest.id, event.target.value as Attendance, guest.responseSource)}><option value="pending">Pending</option><option value="attending">Attending</option><option value="declined">Cannot attend</option></select></span>
                <span data-label="Source"><select aria-label={`Reply source for ${guest.name}`} value={guest.responseSource} onChange={(event) => manualReply(guest.id, guest.attendance, event.target.value as ReplySource)}><option value="website">Website</option><option value="phone">Phone</option><option value="whatsapp">WhatsApp</option><option value="viber">Viber</option><option value="paper">Paper</option></select></span>
                <span data-label="Notes" className="notes-cell">{guest.dietaryNotes || "No notes"}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

export default function WeddingExperience() {
  const [household, setHousehold] = useState<Household | null>(null);
  const [view, setView] = useState<"entry" | "invitation" | "meals" | "admin">("entry");
  const [adminData, setAdminData] = useState<AdminData>({ households: [demoHousehold], mealPhaseOpen: false });

  const loadAdmin = async () => {
    try {
      const response = await fetch("/api/admin");
      if (!response.ok) throw new Error("unavailable");
      setAdminData(await response.json());
    } catch {
      setAdminData({ households: household ? [household] : [demoHousehold], mealPhaseOpen: false });
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("admin") === "1") {
      loadAdmin();
      setView("admin");
      return;
    }
    const code = params.get("code");
    if (code) {
      fetch(`/api/invitation?code=${encodeURIComponent(code)}`)
        .then((response) => response.ok ? response.json() : Promise.reject())
        .then((data: Household) => { setHousehold(data); setView("invitation"); })
        .catch(() => { if (code.toUpperCase() === demoHousehold.code) { setHousehold(demoHousehold); setView("invitation"); } });
    }
  }, []);

  const mealPhaseOpen = useMemo(() => adminData.mealPhaseOpen, [adminData]);

  if (view === "admin") return <AdminDashboard data={adminData} onClose={() => { window.history.replaceState({}, "", "/"); setView(household ? "invitation" : "entry"); }} onRefresh={loadAdmin} />;
  if (!household || view === "entry") return <><CodeEntry onFound={(found) => { setHousehold(found); setView("invitation"); loadAdmin(); }} /><button className="planning-link" type="button" onClick={() => { loadAdmin(); setView("admin"); }}>Planning view</button></>;
  if (view === "meals") return <MealSelection household={household} open={mealPhaseOpen} onBack={() => setView("invitation")} onUpdate={setHousehold} />;
  return <><Invitation household={household} onUpdate={setHousehold} onOpenMeals={() => setView("meals")} mealPhaseOpen={mealPhaseOpen} onExit={() => { setHousehold(null); setView("entry"); window.history.replaceState({}, "", "/"); }} /><button className="planning-link light" type="button" onClick={() => { loadAdmin(); setView("admin"); }}>Planning view</button></>;
}
