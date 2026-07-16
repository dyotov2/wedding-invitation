"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

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

type AdminData = { households: Household[]; mealPhaseOpen: boolean };

function Mark() {
  return <span className="petal-mark small" aria-hidden="true" />;
}

export default function AdminExperience({ displayName, signOutPath }: { displayName: string; signOutPath: string }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [filter, setFilter] = useState<Attendance | "all">("all");
  const [status, setStatus] = useState("Loading guest replies…");

  const refresh = useCallback(async () => {
    setStatus("Refreshing guest replies…");
    try {
      const response = await fetch("/api/admin", { cache: "no-store" });
      if (!response.ok) throw new Error("unauthorized");
      setData((await response.json()) as AdminData);
      setStatus("");
    } catch {
      setStatus("Planning data could not be opened. Please sign in with the wedding planning account and try again.");
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [refresh]);

  const updateSetting = async () => {
    if (!data) return;
    setStatus("Updating meal phase…");
    const response = await fetch("/api/admin/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mealPhaseOpen: !data.mealPhaseOpen }) });
    if (!response.ok) { setStatus("The meal phase could not be updated. Please try again."); return; }
    await refresh();
  };

  const manualReply = async (guestId: number, attendance: Attendance, responseSource: ReplySource) => {
    setStatus("Saving manual reply…");
    const response = await fetch("/api/admin/reply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ guestId, attendance, responseSource }) });
    if (!response.ok) { setStatus("That reply could not be saved. Please try again."); return; }
    await refresh();
  };

  const guests = data?.households.flatMap((household) => household.guests.map((guest) => ({ ...guest, household }))) ?? [];
  const attending = guests.filter((guest) => guest.attendance === "attending").length;
  const declined = guests.filter((guest) => guest.attendance === "declined").length;
  const pending = guests.filter((guest) => guest.attendance === "pending").length;
  const visible = filter === "all" ? guests : guests.filter((guest) => guest.attendance === filter);

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/">E <Mark /> D</Link>
        <div><p className="eyebrow">Wedding desk</p><h1>Guest replies</h1></div>
        <nav aria-label="Admin sections"><a className="active" href="#responses">Overview</a><a href="#responses">Households</a><a href="#responses">Dietary notes</a><a href="#responses">Meal choices</a></nav>
        <Link className="back-to-site" href="/">← View invitation</Link>
      </aside>
      <section className="admin-content">
        <header className="admin-header">
          <div><p className="eyebrow">20 June 2027</p><h2>Welcome, {displayName}</h2><p>Ekaterina and Dimitar’s private wedding planning view.</p></div>
          <div className="admin-account"><a href={signOutPath}>Sign out</a><button type="button" className={data?.mealPhaseOpen ? "phase-toggle open" : "phase-toggle"} disabled={!data} onClick={updateSetting}><span /> Meal choices {data?.mealPhaseOpen ? "open" : "closed"}</button></div>
        </header>
        <p className="admin-status" role="status">{status}</p>
        <div className="metric-strip">
          <div><strong>{guests.length}</strong><span>Invited guests</span></div>
          <div className="metric-attending"><strong>{attending}</strong><span>Attending</span></div>
          <div><strong>{pending}</strong><span>Awaiting reply</span></div>
          <div><strong>{declined}</strong><span>Cannot attend</span></div>
        </div>
        <section className="guest-register" id="responses">
          <div className="register-heading"><div><p className="eyebrow">Live guest list</p><h2>Responses</h2></div><div className="filter-buttons">{(["all", "attending", "pending", "declined"] as const).map((item) => <button type="button" key={item} aria-pressed={filter === item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All guests" : item === "declined" ? "Not attending" : item}</button>)}</div></div>
          <div className="guest-table" role="table" aria-label="Guest responses">
            <div className="table-row table-head" role="row"><span>Guest</span><span>Household</span><span>Reply</span><span>Source</span><span>Notes</span></div>
            {visible.map((guest) => (
              <div className="table-row" role="row" key={guest.id}>
                <span data-label="Guest"><strong>{guest.name}</strong><small>{guest.household.code}</small></span>
                <span data-label="Household">{guest.household.householdName}</span>
                <span data-label="Reply"><select aria-label={`Reply for ${guest.name}`} value={guest.attendance} onChange={(event) => void manualReply(guest.id, event.target.value as Attendance, guest.responseSource)}><option value="pending">Pending</option><option value="attending">Attending</option><option value="declined">Cannot attend</option></select></span>
                <span data-label="Source"><select aria-label={`Reply source for ${guest.name}`} value={guest.responseSource} onChange={(event) => void manualReply(guest.id, guest.attendance, event.target.value as ReplySource)}><option value="website">Website</option><option value="phone">Phone</option><option value="whatsapp">WhatsApp</option><option value="viber">Viber</option><option value="paper">Paper</option></select></span>
                <span data-label="Notes" className="notes-cell">{guest.dietaryNotes || "No notes"}</span>
              </div>
            ))}
            {data && visible.length === 0 && <p className="admin-empty">No guests match this filter.</p>}
          </div>
        </section>
      </section>
    </main>
  );
}
