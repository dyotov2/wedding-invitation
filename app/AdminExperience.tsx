"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BACKUP_PASSPHRASE_MIN_LENGTH, decryptBackup, encryptBackup } from "../lib/backup-crypto.mjs";

type Attendance = "pending" | "attending" | "declined";
type ReplySource = "website" | "phone" | "whatsapp" | "viber" | "paper";

type Guest = {
  id: number;
  externalId?: string;
  active?: boolean;
  name: string;
  guestType: "adult" | "child" | "infant";
  attendance: Attendance;
  dietaryNotes: string;
  mealChoice: string;
  responseSource: ReplySource;
};

type Household = {
  id: number;
  externalId?: string;
  active?: boolean;
  householdName: string;
  guests: Guest[];
};

type AdminData = {
  households: Household[];
  mealPhaseOpen: boolean;
  mealOptions: Array<{
    optionKey: string;
    name: string;
    description: string;
    guestType: "all" | Guest["guestType"];
  }>;
  rsvpDeadline?: string;
  deletionDate?: string;
  retentionClosed?: boolean;
  retentionReceipt?: {
    receiptId: string;
    completedAt: string;
  } | null;
};

type ImportRow = {
  householdExternalId: string;
  householdName: string;
  householdGreeting?: string;
  guestExternalId: string;
  guestName: string;
  displayOrder?: number;
  guestType?: string;
};

type ImportSummary = {
  rowCount: number;
  householdCount: number;
  guestCount: number;
  householdsToCreate?: number;
  householdsToUpdate?: number;
  guestsToCreate?: number;
  guestsToUpdate?: number;
  householdsUnchanged?: number;
  guestsUnchanged?: number;
  activeHouseholdsNotInFile?: number;
  activeGuestsNotInFile?: number;
};

type ImportError = { row?: number; message: string } | string;

type ImportResult = {
  summary: ImportSummary;
  errors: ImportError[];
  households?: Array<{
    externalId: string;
    householdName: string;
    guestNames: string[];
    change: "create" | "update" | "unchanged";
  }>;
  sourceHash?: string;
  previewToken?: string;
};

const requiredHeaders = [
  "household_external_id",
  "household_name",
  "guest_external_id",
  "guest_name",
] as const;

function Mark() {
  return <span className="petal-mark small" aria-hidden="true" />;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  if (quoted) throw new Error("The CSV contains an unfinished quoted value.");
  return rows;
}

function csvToImportRows(text: string): ImportRow[] {
  const parsed = parseCsv(text.replace(/^\uFEFF/, ""));
  const headers = parsed[0]?.map((header) => header.trim().toLowerCase()) ?? [];
  const duplicateHeaders = headers.filter((header, index) => header && headers.indexOf(header) !== index);
  if (duplicateHeaders.length > 0) throw new Error(`Duplicate columns: ${[...new Set(duplicateHeaders)].join(", ")}`);
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length > 0) throw new Error(`Missing columns: ${missing.join(", ")}`);

  for (const [rowIndex, cells] of parsed.slice(1).entries()) {
    const formulaIndex = cells.findIndex((cell) => /^[=+@-]/u.test(cell.trim()));
    if (formulaIndex >= 0) throw new Error(`Row ${rowIndex + 2}, column ${headers[formulaIndex] || formulaIndex + 1} looks like a spreadsheet formula.`);
  }

  const at = (cells: string[], name: string) => cells[headers.indexOf(name)]?.trim() ?? "";
  return parsed.slice(1).map((cells, index) => {
    const displayOrder = Number(at(cells, "display_order"));
    const row: ImportRow = {
      householdExternalId: at(cells, "household_external_id"),
      householdName: at(cells, "household_name"),
      householdGreeting: at(cells, "household_greeting") || undefined,
      guestExternalId: at(cells, "guest_external_id"),
      guestName: at(cells, "guest_name"),
      displayOrder: Number.isInteger(displayOrder) && displayOrder >= 0 ? displayOrder : index + 1,
      guestType: at(cells, "guest_type") || undefined,
    };
    if (!row.householdExternalId || !row.householdName || !row.guestExternalId || !row.guestName) {
      throw new Error(`Row ${index + 2} is missing a required value.`);
    }
    return row;
  });
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function downloadText(filename: string, contents: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatImportError(error: ImportError): string {
  if (typeof error === "string") return error;
  return error.row ? `Row ${error.row}: ${error.message}` : error.message;
}

function formatPolicyDate(value: string | undefined, fallback: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return fallback;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

export default function AdminExperience({ displayName, signOutPath }: { displayName: string; signOutPath: string }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [filter, setFilter] = useState<Attendance | "all">("all");
  const [status, setStatus] = useState("Loading guest replies…");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [sourceName, setSourceName] = useState("");
  const [sourceHash, setSourceHash] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importStatus, setImportStatus] = useState("Choose a CSV file to validate it before anything is saved.");
  const [importBusy, setImportBusy] = useState(false);
  const [purgeConfirmation, setPurgeConfirmation] = useState("");
  const [purgeStatus, setPurgeStatus] = useState("");
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupStatus, setBackupStatus] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupPassphraseConfirm, setBackupPassphraseConfirm] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");

  const refresh = useCallback(async () => {
    setStatus("Refreshing guest replies…");
    try {
      const response = await fetch("/api/admin", { cache: "no-store" });
      if (!response.ok) throw new Error("unauthorized");
      setData((await response.json()) as AdminData);
      setStatus("");
    } catch {
      setStatus("Planning data could not be opened. Please sign in with an approved wedding planning account and try again.");
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [refresh]);

  const updateSetting = async () => {
    if (!data) return;
    setStatus("Updating meal phase…");
    const response = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mealPhaseOpen: !data.mealPhaseOpen }),
    });
    if (!response.ok) {
      setStatus("The meal phase could not be updated. Please try again.");
      return;
    }
    await refresh();
  };

  const manualReply = async (
    guestId: number,
    attendance: Attendance,
    responseSource: ReplySource,
    dietaryNotes: string,
    mealChoice: string,
  ) => {
    setStatus("Saving manual reply…");
    const response = await fetch("/api/admin/reply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ guestId, attendance, responseSource, dietaryNotes, mealChoice }),
    });
    if (!response.ok) {
      setStatus("That reply could not be saved. Please try again.");
      return;
    }
    await refresh();
  };

  const previewImport = async (rows: ImportRow[], name: string, hash: string) => {
    setImportBusy(true);
    setImportStatus("Checking households and guests…");
    setImportResult(null);
    try {
      const response = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "preview", rows, sourceName: name, sourceHash: hash }),
      });
      const result = (await response.json()) as ImportResult & { error?: string };
      if (!response.ok && !result.errors?.length) throw new Error(result.error || "The guest list could not be checked.");
      setImportResult(result);
      setSourceHash(result.sourceHash || hash);
      setImportStatus(result.errors.length > 0 ? "Resolve the issues below before importing." : "Preview ready. Nothing has been saved yet.");
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : "The guest list could not be checked.");
    } finally {
      setImportBusy(false);
    }
  };

  const chooseGuestList = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 512_000) {
      setImportRows([]);
      setImportStatus("That file is too large. Use a UTF-8 CSV smaller than 500 KB.");
      event.target.value = "";
      return;
    }
    setSourceName(file.name);
    setImportResult(null);
    try {
      const text = await file.text();
      const rows = csvToImportRows(text);
      if (rows.length === 0) throw new Error("The CSV does not contain any guests.");
      const hash = await sha256(text);
      setImportRows(rows);
      setSourceHash(hash);
      await previewImport(rows, file.name, hash);
    } catch (error) {
      setImportRows([]);
      setImportStatus(error instanceof Error ? error.message : "That CSV could not be read.");
    }
  };

  const commitImport = async () => {
    if (importRows.length === 0 || importBusy || (importResult?.errors.length ?? 1) > 0) return;
    setImportBusy(true);
    setImportStatus("Importing the approved guest list…");
    try {
      const response = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "commit", rows: importRows, sourceName, sourceHash, previewToken: importResult?.previewToken }),
      });
      const result = (await response.json()) as ImportResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "The guest list was not imported.");
      setImportResult(result);
      setImportRows([]);
      setImportStatus("Guest list imported. Use “Download invitation links” in Data care when the final domain is configured.");
      await refresh();
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : "The guest list was not imported.");
    } finally {
      setImportBusy(false);
    }
  };

  const downloadPlanningExport = async () => {
    setStatus("Preparing a private planning export…");
    try {
      const response = await fetch("/api/admin/export", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error();
      downloadText(`wedding-planning-${new Date().toISOString().slice(0, 10)}.csv`, await response.text());
      setStatus("Planning export downloaded. Keep it somewhere private.");
    } catch {
      setStatus("The planning export could not be prepared. Please try again.");
    }
  };

  const downloadDeliveryExport = async () => {
    setStatus("Preparing the private invitation delivery file…");
    try {
      const response = await fetch("/api/admin/delivery-export", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error();
      downloadText(`wedding-invitations-${new Date().toISOString().slice(0, 10)}.csv`, await response.text());
      setStatus("Invitation delivery file downloaded. It contains private access links—store it securely.");
    } catch {
      setStatus("The invitation delivery file could not be prepared. Please try again.");
    }
  };

  const downloadEncryptedBackup = async () => {
    if (backupPassphrase.length < BACKUP_PASSPHRASE_MIN_LENGTH || backupBusy) return;
    if (backupPassphrase !== backupPassphraseConfirm) {
      setBackupStatus("The two passphrases do not match. A backup is unreadable without the exact passphrase, so please retype it.");
      return;
    }
    setBackupBusy(true);
    setBackupStatus("Preparing and encrypting the backup on this device…");
    try {
      const response = await fetch("/api/admin/backup", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error("The backup could not be prepared. Please try again.");
      const encrypted = await encryptBackup(await response.text(), backupPassphrase);
      downloadText(
        `wedding-backup-${new Date().toISOString().slice(0, 10)}.json.enc`,
        encrypted,
        "application/json;charset=utf-8",
      );
      setBackupPassphraseConfirm("");
      setBackupStatus("Encrypted backup downloaded. Store it and the passphrase in two separate private places, and delete both by the data-deletion date.");
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : "The backup could not be prepared. Please try again.");
    } finally {
      setBackupBusy(false);
    }
  };

  const restoreEncryptedBackup = async () => {
    if (!restoreFile || restoreConfirmation !== "RESTORE WEDDING GUEST DATA" ||
      backupPassphrase.length === 0 || backupBusy) return;
    setBackupBusy(true);
    setBackupStatus("Decrypting the backup on this device…");
    try {
      const plaintext = await decryptBackup(await restoreFile.text(), backupPassphrase);
      const backup = JSON.parse(plaintext) as Record<string, unknown>;
      setBackupStatus("Restoring guest data from the backup…");
      const response = await fetch("/api/admin/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: restoreConfirmation, backup }),
      });
      const result = (await response.json()) as { error?: string; households?: number; guests?: number };
      if (!response.ok) throw new Error(result.error || "The backup could not be restored.");
      setRestoreFile(null);
      setRestoreConfirmation("");
      setBackupStatus(`Restore complete: ${result.households ?? 0} households and ${result.guests ?? 0} guests. Review the guest list before sharing any links.`);
      await refresh();
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : "The backup could not be restored.");
    } finally {
      setBackupBusy(false);
    }
  };

  const purgeGuestData = async () => {
    if (!data?.deletionDate || purgeConfirmation !== "DELETE WEDDING GUEST DATA") return;
    setPurgeStatus("Deleting wedding guest data…");
    const response = await fetch("/api/admin/retention/purge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: purgeConfirmation, deletionDate: data.deletionDate }),
    });
    const result = await response.json() as { error?: string; receiptId?: string };
    if (!response.ok) {
      setPurgeStatus(result.error || "Guest data could not be deleted.");
      return;
    }
    setPurgeConfirmation("");
    setPurgeStatus(`Deletion complete. Anonymous receipt: ${result.receiptId}`);
    await refresh();
  };

  const guests = useMemo(
    () => data?.households
      .filter((household) => household.active !== false)
      .flatMap((household) => household.guests.filter((guest) => guest.active !== false).map((guest) => ({ ...guest, household }))) ?? [],
    [data],
  );
  const attending = guests.filter((guest) => guest.attendance === "attending").length;
  const declined = guests.filter((guest) => guest.attendance === "declined").length;
  const pending = guests.filter((guest) => guest.attendance === "pending").length;
  const visible = filter === "all" ? guests : guests.filter((guest) => guest.attendance === filter);
  if (data?.retentionClosed) {
    return (
      <main className="admin-page">
        <aside className="admin-sidebar">
          <Link className="admin-brand" href="/">E <Mark /> D</Link>
          <div><p className="eyebrow">Wedding desk</p><h1>Data retention</h1></div>
          <Link className="back-to-site" href="/">← View invitation</Link>
        </aside>

        <section className="admin-content">
          <header className="admin-header" id="overview">
            <div><p className="eyebrow">20 June 2027</p><h2>Welcome, {displayName}</h2><p>The guest-data retention period has ended.</p></div>
            <div className="admin-account"><a href={signOutPath}>Sign out</a></div>
          </header>
          <p className="admin-status" role="status">{status}</p>
          <section className="admin-tool-card retention-card" aria-labelledby="retention-title">
            {data.retentionReceipt ? (
              <div>
                <p className="eyebrow">Deletion complete</p>
                <h2 id="retention-title">Guest data has been removed</h2>
                <p>The dashboard no longer exposes households, replies, dietary notes, invitation credentials or import history. Anonymous receipt: <strong>{data.retentionReceipt.receiptId}</strong>.</p>
              </div>
            ) : (
              <>
                <div>
                  <p className="eyebrow">Retention deadline reached</p>
                  <h2 id="retention-title">Delete wedding guest data</h2>
                  <p>Personal guest details are now hidden. This action permanently removes households, guests, replies, notes, invitation credentials, import history and operational audit events. First remove every private export, QR pack and backup listed in the deletion runbook.</p>
                </div>
                <label htmlFor="purge-confirmation">Type <strong>DELETE WEDDING GUEST DATA</strong> to confirm</label>
                <input id="purge-confirmation" value={purgeConfirmation} onChange={(event) => setPurgeConfirmation(event.target.value)} autoComplete="off" />
                <button type="button" onClick={() => void purgeGuestData()} disabled={purgeConfirmation !== "DELETE WEDDING GUEST DATA"}>Permanently delete guest data</button>
                <p role="status">{purgeStatus}</p>
              </>
            )}
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/">E <Mark /> D</Link>
        <div><p className="eyebrow">Wedding desk</p><h1>Guest replies</h1></div>
        <nav aria-label="Admin sections">
          <a className="active" href="#overview">Overview</a>
          <a href="#responses">Responses</a>
          <a href="#guest-import">Import guests</a>
          <a href="#data-care">Data & exports</a>
          <a href="#backups">Backups</a>
        </nav>
        <Link className="back-to-site" href="/">← View invitation</Link>
      </aside>

      <section className="admin-content">
        <header className="admin-header" id="overview">
          <div><p className="eyebrow">20 June 2027</p><h2>Welcome, {displayName}</h2><p>Ekaterina and Dimitar’s private wedding planning view.</p></div>
          <div className="admin-account">
            <a href={signOutPath}>Sign out</a>
            <button type="button" className={data?.mealPhaseOpen ? "phase-toggle open" : "phase-toggle"} disabled={!data} onClick={updateSetting}><span /> Meal choices {data?.mealPhaseOpen ? "open" : "closed"}</button>
          </div>
        </header>

        <p className="admin-status" role="status">{status}</p>
        <div className="admin-date-notice"><strong>Initial RSVP requested by {formatPolicyDate(data?.rsvpDeadline, "1 December 2026")}</strong><span>Late replies remain possible; wedding data is scheduled for deletion on {formatPolicyDate(data?.deletionDate, "27 June 2027")}.</span></div>
        <div className="metric-strip">
          <div><strong>{guests.length}</strong><span>Invited guests</span></div>
          <div className="metric-attending"><strong>{attending}</strong><span>Attending</span></div>
          <div><strong>{pending}</strong><span>Awaiting reply</span></div>
          <div><strong>{declined}</strong><span>Cannot attend</span></div>
        </div>

        <section className="guest-register" id="responses">
          <div className="register-heading">
            <div><p className="eyebrow">Live guest list</p><h2>Responses</h2></div>
            <div className="filter-buttons">{(["all", "attending", "pending", "declined"] as const).map((item) => <button type="button" key={item} aria-pressed={filter === item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All guests" : item === "declined" ? "Not attending" : item}</button>)}</div>
          </div>
          <div className="guest-table" role="table" aria-label="Guest responses">
            <div className="table-row table-head" role="row"><span>Guest</span><span>Household</span><span>Reply</span><span>Source</span><span>Notes</span><span>Meal</span></div>
            {visible.map((guest) => (
              <div className="table-row" role="row" key={guest.id}>
                <span data-label="Guest"><strong>{guest.name}</strong><small>{guest.externalId || "Invited guest"}</small></span>
                <span data-label="Household">{guest.household.householdName}</span>
                <span data-label="Reply"><select aria-label={`Reply for ${guest.name}`} value={guest.attendance} onChange={(event) => void manualReply(guest.id, event.target.value as Attendance, guest.responseSource, guest.dietaryNotes, guest.mealChoice)}><option value="pending">Pending</option><option value="attending">Attending</option><option value="declined">Cannot attend</option></select></span>
                <span data-label="Source"><select aria-label={`Reply source for ${guest.name}`} value={guest.responseSource} onChange={(event) => void manualReply(guest.id, guest.attendance, event.target.value as ReplySource, guest.dietaryNotes, guest.mealChoice)}><option value="website">Website</option><option value="phone">Phone</option><option value="whatsapp">WhatsApp</option><option value="viber">Viber</option><option value="paper">Paper</option></select></span>
                <span data-label="Notes" className="notes-cell"><textarea aria-label={`Dietary or accessibility notes for ${guest.name}`} defaultValue={guest.dietaryNotes} maxLength={500} placeholder="No notes" onBlur={(event) => { if (event.target.value !== guest.dietaryNotes) void manualReply(guest.id, guest.attendance, guest.responseSource, event.target.value, guest.mealChoice); }} /></span>
                <span data-label="Meal" className="notes-cell"><select aria-label={`Meal choice for ${guest.name}`} value={guest.mealChoice} disabled={!data?.mealPhaseOpen || guest.attendance !== "attending"} onChange={(event) => void manualReply(guest.id, guest.attendance, guest.responseSource, guest.dietaryNotes, event.target.value)}><option value="">Not chosen</option>{data?.mealOptions.filter((option) => option.guestType === "all" || option.guestType === guest.guestType).map((option) => <option key={option.optionKey} value={option.optionKey}>{option.name}</option>)}</select></span>
              </div>
            ))}
            {data && visible.length === 0 && <p className="admin-empty">No guests match this filter.</p>}
          </div>
        </section>

        <section className="admin-tool-card" id="guest-import">
          <div className="admin-tool-heading"><div><p className="eyebrow">Private import</p><h2>Add the guest list</h2></div><span>CSV · no guest records save before approval</span></div>
          <p>Use one row per guest and group households with the same <code>household_external_id</code>. Uploads are checked in full before the import button becomes available.</p>
          <label className="guest-file-picker">
            <span>{sourceName || "Choose guest-list CSV"}</span>
            <input type="file" accept=".csv,text/csv" onChange={(event) => void chooseGuestList(event)} disabled={importBusy} />
          </label>
          <p className="import-status" role="status">{importStatus}</p>
          {importResult && (
            <div className="import-preview">
              <div><strong>{importResult.summary.householdsToCreate ?? 0}</strong><span>New households</span></div>
              <div><strong>{importResult.summary.householdsToUpdate ?? 0}</strong><span>Household updates</span></div>
              <div><strong>{importResult.summary.guestsToCreate ?? 0}</strong><span>New guests</span></div>
              <div><strong>{importResult.summary.guestsToUpdate ?? 0}</strong><span>Guest updates</span></div>
              <div><strong>{importResult.errors.length}</strong><span>Issues</span></div>
            </div>
          )}
          {importResult && ((importResult.summary.activeHouseholdsNotInFile ?? 0) > 0 || (importResult.summary.activeGuestsNotInFile ?? 0) > 0) && (
            <p className="import-omission-note"><strong>This is a safe merge.</strong> Existing records not present in this file remain active: {importResult.summary.activeHouseholdsNotInFile ?? 0} households and {importResult.summary.activeGuestsNotInFile ?? 0} guests.</p>
          )}
          {(importResult?.households?.length ?? 0) > 0 && (
            <div className="import-household-list" aria-label="Households in this import">
              {importResult?.households?.map((household) => (
                <article key={household.externalId}>
                  <span className={`import-change ${household.change}`}>{household.change}</span>
                  <div><strong>{household.householdName}</strong><small>{household.guestNames.join(" · ")}</small></div>
                </article>
              ))}
            </div>
          )}
          {(importResult?.errors.length ?? 0) > 0 && <ul className="import-errors">{importResult?.errors.map((error, index) => <li key={`${formatImportError(error)}-${index}`}>{formatImportError(error)}</li>)}</ul>}
          <div className="admin-tool-actions">
            <button type="button" onClick={() => void commitImport()} disabled={importBusy || importRows.length === 0 || !importResult || importResult.errors.length > 0}>{importBusy ? "Working…" : "Import approved list"}</button>
          </div>
        </section>

        <section className="admin-tool-card data-care-card" id="data-care">
          <div><p className="eyebrow">Data care</p><h2>Export and retention</h2><p>Download a private planning copy before an import, migration or major edit. The planning file can contain sensitive notes; the invitation file contains private access links.</p></div>
          <div className="data-care-actions">
            <button type="button" onClick={() => void downloadPlanningExport()}>Download planning export</button>
            <button type="button" className="secondary" onClick={() => void downloadDeliveryExport()}>Download invitation links</button>
          </div>
        </section>

        <section className="admin-tool-card backup-card" id="backups" aria-labelledby="backups-title">
          <div className="admin-tool-heading"><div><p className="eyebrow">Data safety</p><h2 id="backups-title">Encrypted backups</h2></div><span>Encrypted on this device before download</span></div>
          <p>Our hosting platform does not expose database backups, so this is the restorable copy of every household, guest, reply, meal option and setting, plus the most recent audit history. Take one before every import, migration or release. The file is useless without the passphrase; restoring <strong>replaces the entire database</strong> with the backup, including whether meal choices are open, the RSVP and deletion dates, and the audit history recorded since the backup was taken.</p>
          <label htmlFor="backup-passphrase">Backup passphrase ({BACKUP_PASSPHRASE_MIN_LENGTH}+ characters, stored only in your head or a password manager)</label>
          <input
            id="backup-passphrase"
            type="password"
            value={backupPassphrase}
            onChange={(event) => setBackupPassphrase(event.target.value)}
            autoComplete="off"
            disabled={backupBusy}
          />
          <label htmlFor="backup-passphrase-confirm">Confirm passphrase (a mistyped passphrase makes the backup permanently unreadable)</label>
          <input
            id="backup-passphrase-confirm"
            type="password"
            value={backupPassphraseConfirm}
            onChange={(event) => setBackupPassphraseConfirm(event.target.value)}
            autoComplete="off"
            disabled={backupBusy}
          />
          <div className="admin-tool-actions">
            <button
              type="button"
              onClick={() => void downloadEncryptedBackup()}
              disabled={backupBusy || backupPassphrase.length < BACKUP_PASSPHRASE_MIN_LENGTH || backupPassphrase !== backupPassphraseConfirm}
            >
              {backupBusy ? "Working…" : "Download encrypted backup"}
            </button>
          </div>
          <label htmlFor="restore-file">Restore from an encrypted backup (uses the passphrase above)</label>
          <label className="guest-file-picker backup-restore-picker">
            <span>{restoreFile?.name || "Choose .json.enc backup file"}</span>
            <input
              id="restore-file"
              type="file"
              accept=".enc,.json,application/json"
              onChange={(event) => setRestoreFile(event.target.files?.[0] ?? null)}
              disabled={backupBusy}
            />
          </label>
          <label htmlFor="restore-confirmation">Type <strong>RESTORE WEDDING GUEST DATA</strong> to allow the restore</label>
          <input
            id="restore-confirmation"
            value={restoreConfirmation}
            onChange={(event) => setRestoreConfirmation(event.target.value)}
            autoComplete="off"
            disabled={backupBusy}
          />
          <div className="admin-tool-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => void restoreEncryptedBackup()}
              disabled={backupBusy || !restoreFile || restoreConfirmation !== "RESTORE WEDDING GUEST DATA" || backupPassphrase.length === 0}
            >
              {backupBusy ? "Working…" : "Restore this backup"}
            </button>
          </div>
          <p className="import-status" role="status">{backupStatus}</p>
        </section>
      </section>
    </main>
  );
}
