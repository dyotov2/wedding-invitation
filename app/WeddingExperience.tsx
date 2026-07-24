"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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

function InvitationGate({ state, onRetry }: { state: InvitationGateState; onRetry: () => void }) {
  const checking = state === "checking";
  const title = state === "missing"
    ? "This invitation has a personal address."
    : state === "invalid"
      ? "We could not open this invitation."
      : state === "unavailable"
        ? "The invitation garden is resting."
        : "Opening your private invitation…";
  const message = state === "missing"
    ? "Please use the personal link sent to your household. It opens your invitation directly, with only the people invited with you."
    : state === "invalid"
      ? "The link may be incomplete or out of date. Please ask Ekaterina or Dimitar to resend your personal invitation."
      : state === "unavailable"
        ? "Please check your connection and try again in a moment. Your invitation and any saved reply are safe."
        : "A little patience while your household invitation blooms.";

  return (
    <main className={`invitation-gate gate-${state}`} aria-busy={checking}>
      <BotanicalPhoto className="gate-botanical gate-botanical-one" priority />
      <BotanicalPhoto variant="sprig" className="gate-botanical gate-botanical-two" />
      <section className="gate-card" aria-labelledby="gate-title">
        <p className="eyebrow">Private invitation</p>
        <p className="gate-names" aria-label="Ekaterina and Dimitar">
          <span>Ekaterina</span><small>&amp;</small><span>Dimitar</span>
        </p>
        <p className="gate-date">20 · 06 · 2027</p>
        <div className="gate-divider" aria-hidden="true"><span /></div>
        <div className="gate-message" role={checking ? "status" : "alert"} aria-live="polite">
          {checking && <span className="gate-loader" aria-hidden="true" />}
          <h1 id="gate-title">{title}</h1>
          <p>{message}</p>
        </div>
        {(state === "invalid" || state === "unavailable") && (
          <button className="gate-retry" type="button" onClick={onRetry}>Try the link again</button>
        )}
        <p className="privacy-note">We use your invitation details and reply only to plan our wedding. Guest data will be deleted by 27 June 2027.</p>
      </section>
      <p className="gate-footer">Midalidare Estate · Bulgaria</p>
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

const faqItems = [
  { q: "When should I arrive?", a: "The ceremony begins at 15:30. Please arrive 20 to 30 minutes early so we can start among the vines together." },
  { q: "Can we bring our children?", a: "Yes, little ones are warmly welcome. If they are not already named on your invitation, mention them in the notes when you reply or message us, and we will add them so the kitchen can plan a meal for them too." },
  { q: "Can we change our answer?", a: "Of course. Open the same personal link at any time, change your reply, and save it again. The latest reply you save is the one that counts." },
  { q: "Lost your invitation link?", a: "Get in touch with us and we will happily resend your household's personal invitation." },
  { q: "Is there parking at the estate?", a: "There is free guest parking at Midalidare Estate. Just follow the signs on arrival." },
  { q: "Where can we stay?", a: "The estate has rooms on site, with more nearby in Chirpan and Stara Zagora. The Stay among the vines section above has the details." },
  { q: "What will the weather be like?", a: "A warm Bulgarian summer evening, mostly outdoors. Bring a light layer for after sunset, and remember heels and lawns do not always agree." },
  { q: "I have a dietary need.", a: "Tell us in your RSVP above. There is a note for each guest, and the kitchen will take care of the rest." },
] as const;

function Invitation({ household, onUpdate, onOpenMeals, mealPhaseOpen, contacts }: {
  household: Household;
  onUpdate: (invitation: InvitationResponse) => void;
  onOpenMeals: () => void;
  mealPhaseOpen: boolean;
  contacts: ContactAction[];
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
      setStatus("Your reply is confirmed. You can return with the same personal link if anything changes.");
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
        <a className="nav-rsvp" href="#rsvp">RSVP</a>
      </nav>

      <header className="invitation-hero">
        <div className="hero-vine hero-vine-one" aria-hidden="true" />
        <div className="hero-vine hero-vine-two" aria-hidden="true" />
        <div className="hero-botanical-frame" aria-hidden="true">
          <BotanicalPhoto className="hero-botanical hero-botanical-left" />
        </div>
        <div className="floating-petals" aria-hidden="true">{Array.from({ length: 11 }, (_, index) => <span key={index} />)}</div>
        <p className="eyebrow hero-eyebrow">Celebrate with us</p>
        <p className="hero-love-note">Forever starts today</p>
        <h1><span>Ekaterina</span><small>&amp;</small><span>Dimitar</span></h1>
        <div className="event-line" aria-label="Wedding date and venue">
          <div><strong>Sunday</strong><span>20 June 2027</span></div>
          <span className="event-divider" aria-hidden="true" />
          <div><strong>Midalidare Estate</strong><span>Bulgaria</span></div>
        </div>
        <p className="hero-countdown">{daysUntilWedding} days to go <span aria-hidden="true">·</span> Kindly reply by 1 January 2027</p>
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
            <span className="reply-date">By 1 January 2027</span>
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
                  : <p>Closer to the day we will open the menu. Come back with this same personal link to choose a meal for each guest.</p>)}
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
          <p className="eyebrow">The day in bloom</p>
          <h2 id="program-title">Our wedding day</h2>
          <p>A gentle rhythm for a long summer celebration.</p>
        </div>
        <div className="program-path">
          <span className="program-vine" aria-hidden="true" />
          <article className="program-stop">
            <span className="program-bud" aria-hidden="true" />
            <div><small>Gather</small><time>15:30</time><h3>Ceremony</h3><p>Our promises among the vines.</p></div>
          </article>
          <article className="program-stop">
            <span className="program-bud" aria-hidden="true" />
            <div><small>Celebrate</small><time>18:00</time><h3>Dinner</h3><p>A long table, local wine, and summer light.</p></div>
          </article>
          <article className="program-stop">
            <span className="program-bud" aria-hidden="true" />
            <div><small>Stay awhile</small><time>20:30</time><h3>Dancing</h3><p>Music beneath the evening sky.</p></div>
          </article>
        </div>
      </section>

      <section className="venue-section" id="venue">
        <p className="eyebrow venue-eyebrow">The celebration</p>
        <VenueScene />
        <p className="venue-copy">We will gather at Midalidare Estate for an afternoon of ceremony, dinner, and dancing beneath the Bulgarian summer sky.</p>
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
          <small>Soft, sun-washed colours and romantic floral details.</small>
        </div>
      </section>

      <section className="stay-section" id="stay" aria-label="Where to stay">
        <BotanicalPhoto variant="sprig" className="stay-botanical" />
        <div className="stay-body">
          <p className="eyebrow">Rest your head</p>
          <h2>Stay among<br />the vines</h2>
          <p>Midalidare sits a little way from the nearest town, so most guests make a night of it among the vineyards. Rooms on the estate are limited, so we would book early.</p>
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
          <p className="stay-foot">Heading home the same night? There is free parking on the estate, with details in the questions below.</p>
        </div>
        <div className="stay-fade" aria-hidden="true" />
      </section>

      <section className="faq-section" id="questions" aria-labelledby="faq-title">
        <div className="faq-heading">
          <p className="eyebrow">Good to know</p>
          <h2 id="faq-title">Questions<br />&amp; answers</h2>
        </div>
        <dl className="faq-list">
          {faqItems.map((item) => (
            <div key={item.q}>
              <dt>{item.q}</dt>
              <dd>{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

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

  const failureMatchesCurrentAttempt = gateFailure?.credential === credential && gateFailure.retryAttempt === retryAttempt;
  const gateState: InvitationGateState = credentialSnapshot === SERVER_CREDENTIAL_SNAPSHOT
    ? "checking"
    : !credential
      ? "missing"
      : failureMatchesCurrentAttempt
        ? gateFailure.state
        : "checking";
  const invitationMatchesCredential = Boolean(household && household.credential === credential);

  if (!invitationMatchesCredential || !household) {
    return <InvitationGate state={gateState} onRetry={() => setRetryAttempt((attempt) => attempt + 1)} />;
  }
  if (view === "meals") return <MealSelection household={household} open={mealPhaseOpen} mealOptions={mealOptions} onBack={() => setView("invitation")} onUpdate={updateInvitation} />;
  return <Invitation household={household} onUpdate={updateInvitation} onOpenMeals={() => setView("meals")} mealPhaseOpen={mealPhaseOpen} contacts={contacts} />;
}
