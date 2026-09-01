"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BACKUP_PASSPHRASE_MIN_LENGTH, decryptBackup, encryptBackup } from "../lib/backup-crypto.mjs";

type Attendance = "pending" | "attending" | "declined";
type ReplySource = "website" | "phone" | "whatsapp" | "viber" | "paper";

type Guest = {
  id: number;
  externalId?: string;
  active?: boolean;
  name: string;
  displayOrder: number;
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
  greeting: string;
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

type EditableGuest = {
  externalId: string;
  name: string;
  displayOrder: number;
  guestType: Guest["guestType"];
  persisted: boolean;
};

type EditableHousehold = {
  externalId: string;
  householdName: string;
  greeting: string;
  persisted: boolean;
  guests: EditableGuest[];
};

type EditorIssue = {
  id: string;
  message: string;
};

type ManualReplyDraft = Pick<Guest, "attendance" | "responseSource" | "dietaryNotes" | "mealChoice">;
type ManualReplySaveState = "draft" | "saving" | "saved" | "error";

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

function newExternalId(prefix: "HOUSEHOLD" | "GUEST"): string {
  return `${prefix}-${window.crypto.randomUUID().toUpperCase()}`;
}

function editableHouseholds(data: AdminData): EditableHousehold[] {
  return data.households
    .filter((household) => household.active !== false && household.externalId)
    .map((household) => ({
      externalId: household.externalId!,
      householdName: household.householdName,
      greeting: household.greeting ?? "",
      persisted: true,
      guests: household.guests
        .filter((guest) => guest.active !== false && guest.externalId)
        .sort((left, right) => left.displayOrder - right.displayOrder || left.id - right.id)
        .map((guest) => ({
          externalId: guest.externalId!,
          name: guest.name,
          displayOrder: guest.displayOrder,
          guestType: guest.guestType,
          persisted: true,
        })),
    }));
}

function manualReplyDraftFromGuest(guest: Guest): ManualReplyDraft {
  return {
    attendance: guest.attendance,
    responseSource: guest.responseSource,
    dietaryNotes: guest.dietaryNotes,
    mealChoice: guest.mealChoice,
  };
}

function rowsFromEditor(households: EditableHousehold[]): ImportRow[] {
  return households.flatMap((household) => household.guests.map((guest) => ({
    householdExternalId: household.externalId,
    householdName: household.householdName,
    householdGreeting: household.greeting,
    guestExternalId: guest.externalId,
    guestName: guest.name,
    displayOrder: guest.displayOrder,
    guestType: guest.guestType,
  })));
}

function editorIssues(households: EditableHousehold[]): EditorIssue[] {
  const issues: EditorIssue[] = [];
  const importedTextIsUnsafe = (value: string) => /^[=+@-]/u.test(value.trim()) ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value);

  if (households.length === 0) {
    return [{ id: "household-editor-list", message: "Add at least one household." }];
  }

  let guestCount = 0;
  households.forEach((household, householdIndex) => {
    const householdNameId = `household-name-${household.externalId}`;
    const greetingId = `household-greeting-${household.externalId}`;
    if (!household.householdName.trim()) {
      issues.push({ id: householdNameId, message: `Household ${householdIndex + 1} needs a name.` });
    } else if (household.householdName.trim().length > 160 || importedTextIsUnsafe(household.householdName)) {
      issues.push({ id: householdNameId, message: `Household ${householdIndex + 1} has an invalid name.` });
    }
    if (household.greeting.length > 240 || importedTextIsUnsafe(household.greeting)) {
      issues.push({ id: greetingId, message: `Household ${householdIndex + 1} has an invalid greeting.` });
    }
    if (household.guests.length === 0) {
      issues.push({ id: `household-${household.externalId}`, message: `Household ${householdIndex + 1} needs at least one person.` });
    }
    if (household.guests.length > 30) {
      issues.push({ id: `household-${household.externalId}`, message: `Household ${householdIndex + 1} can contain at most 30 people.` });
    }
    household.guests.forEach((guest, guestIndex) => {
      guestCount += 1;
      const guestNameId = `guest-name-${guest.externalId}`;
      if (!guest.name.trim()) {
        issues.push({ id: guestNameId, message: `Person ${guestIndex + 1} in household ${householdIndex + 1} needs a name.` });
      } else if (guest.name.trim().length > 160 || importedTextIsUnsafe(guest.name)) {
        issues.push({ id: guestNameId, message: `Person ${guestIndex + 1} in household ${householdIndex + 1} has an invalid name.` });
      }
    });
  });
  if (guestCount > 400) issues.push({ id: "household-editor-list", message: "Save no more than 400 people at once." });
  return issues;
}

export default function AdminExperience({ displayName, signOutPath }: { displayName: string; signOutPath: string }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [filter, setFilter] = useState<Attendance | "all">("all");
  const [status, setStatus] = useState("Loading guest replies…");
  const [editorHouseholds, setEditorHouseholds] = useState<EditableHousehold[]>([]);
  const [editorHasChanges, setEditorHasChanges] = useState(false);
  const [editorStatus, setEditorStatus] = useState("Edit the list, then select Save guest list.");
  const [editorResult, setEditorResult] = useState<ImportResult | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorAction, setEditorAction] = useState<"review" | "save" | null>(null);
  const [editorValidationIssues, setEditorValidationIssues] = useState<EditorIssue[]>([]);
  const editorReadyRef = useRef(false);
  const editorDirtyRef = useRef(false);
  const editorRevisionRef = useRef(0);
  const [replyRefreshBusy, setReplyRefreshBusy] = useState(false);
  const [manualReplyDrafts, setManualReplyDrafts] = useState<Record<number, ManualReplyDraft>>({});
  const manualReplyDraftsRef = useRef<Record<number, ManualReplyDraft>>({});
  const [manualReplySaveStates, setManualReplySaveStates] = useState<Record<number, ManualReplySaveState>>({});
  const manualReplyQueuesRef = useRef(new Map<number, Promise<void>>());
  const manualNoteDirtyRef = useRef(new Set<number>());
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

  const refresh = useCallback(async (syncEditor = false) => {
    setStatus("Refreshing guest replies…");
    try {
      const response = await fetch("/api/admin", { cache: "no-store" });
      if (!response.ok) throw new Error("unauthorized");
      const payload = (await response.json()) as AdminData;
      setData(payload);
      if (syncEditor || !editorReadyRef.current || !editorDirtyRef.current) {
        setEditorHouseholds(editableHouseholds(payload));
        setEditorHasChanges(false);
        setEditorResult(null);
        setEditorValidationIssues([]);
        setEditorStatus("Edit the list, then select Save guest list.");
        editorReadyRef.current = true;
        editorDirtyRef.current = false;
        editorRevisionRef.current += 1;
      }
      setStatus("");
      return true;
    } catch {
      setStatus("Planning data could not be opened. Please sign in with an approved wedding planning account and try again.");
      return false;
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [refresh]);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!editorDirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, []);

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

  const refreshReplies = async () => {
    if (replyRefreshBusy) return;
    const preservingGuestListChanges = editorDirtyRef.current;
    setReplyRefreshBusy(true);
    try {
      const refreshed = await refresh(false);
      if (refreshed) {
        setStatus(preservingGuestListChanges
          ? "Replies refreshed. Your unsaved guest-list changes are still here."
          : "Replies refreshed.");
      }
    } finally {
      setReplyRefreshBusy(false);
    }
  };

  const updateManualReplyDraft = (
    guest: Guest,
    changes: Partial<ManualReplyDraft>,
    noteIsDirty = false,
  ): ManualReplyDraft => {
    const nextDraft = {
      ...(manualReplyDraftsRef.current[guest.id] ?? manualReplyDraftFromGuest(guest)),
      ...changes,
    };
    const nextDrafts = { ...manualReplyDraftsRef.current, [guest.id]: nextDraft };
    manualReplyDraftsRef.current = nextDrafts;
    setManualReplyDrafts(nextDrafts);
    if (noteIsDirty) {
      manualNoteDirtyRef.current.add(guest.id);
      setManualReplySaveStates((current) => ({ ...current, [guest.id]: "draft" }));
    }
    return nextDraft;
  };

  const queueManualReply = (guest: Guest, draft: ManualReplyDraft) => {
    manualNoteDirtyRef.current.delete(guest.id);
    setStatus(`Saving reply for ${guest.name}…`);
    setManualReplySaveStates((current) => ({ ...current, [guest.id]: "saving" }));

    const previous = manualReplyQueuesRef.current.get(guest.id) ?? Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch("/api/admin/reply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ guestId: guest.id, ...draft }),
        });
        if (!response.ok) throw new Error("manual reply save failed");
      });
    manualReplyQueuesRef.current.set(guest.id, operation);

    void operation.then(async () => {
      if (manualReplyQueuesRef.current.get(guest.id) !== operation) return;
      const refreshed = await refresh(false);
      if (manualReplyQueuesRef.current.get(guest.id) !== operation) return;
      manualReplyQueuesRef.current.delete(guest.id);

      if (refreshed) {
        const nextDrafts = { ...manualReplyDraftsRef.current };
        delete nextDrafts[guest.id];
        manualReplyDraftsRef.current = nextDrafts;
        setManualReplyDrafts(nextDrafts);
      }
      setManualReplySaveStates((current) => ({ ...current, [guest.id]: "saved" }));
      setStatus(refreshed
        ? `Reply saved for ${guest.name}.`
        : `Reply saved for ${guest.name}, but the latest replies could not be refreshed. Select Refresh replies.`);
    }).catch(() => {
      if (manualReplyQueuesRef.current.get(guest.id) !== operation) return;
      manualReplyQueuesRef.current.delete(guest.id);
      setManualReplySaveStates((current) => ({ ...current, [guest.id]: "error" }));
      setStatus(`The reply for ${guest.name} could not be saved. Your changes are still here; try again.`);
    });
  };

  const markEditorChanged = () => {
    editorDirtyRef.current = true;
    editorRevisionRef.current += 1;
    setEditorHasChanges(true);
    setEditorResult(null);
    setEditorValidationIssues([]);
    setEditorStatus("You have unsaved changes. Select Save guest list when ready.");
  };

  const updateHousehold = (
    externalId: string,
    field: "householdName" | "greeting",
    value: string,
  ) => {
    setEditorHouseholds((current) => current.map((household) => household.externalId === externalId
      ? { ...household, [field]: value }
      : household));
    markEditorChanged();
  };

  const updateGuest = (
    householdExternalId: string,
    guestExternalId: string,
    field: "name" | "guestType",
    value: string,
  ) => {
    setEditorHouseholds((current) => current.map((household) => household.externalId === householdExternalId
      ? {
        ...household,
        guests: household.guests.map((guest) => guest.externalId === guestExternalId
          ? { ...guest, [field]: value }
          : guest),
      }
      : household));
    markEditorChanged();
  };

  const addHousehold = () => {
    const householdExternalId = newExternalId("HOUSEHOLD");
    const guestExternalId = newExternalId("GUEST");
    setEditorHouseholds((current) => [...current, {
      externalId: householdExternalId,
      householdName: "",
      greeting: "",
      persisted: false,
      guests: [{
        externalId: guestExternalId,
        name: "",
        displayOrder: 1,
        guestType: "adult",
        persisted: false,
      }],
    }]);
    markEditorChanged();
    window.requestAnimationFrame(() => document.getElementById(`household-name-${householdExternalId}`)?.focus());
  };

  const removeHousehold = (externalId: string) => {
    setEditorHouseholds((current) => current.filter((household) =>
      household.externalId !== externalId || household.persisted));
    markEditorChanged();
  };

  const addGuest = (householdExternalId: string) => {
    const guestExternalId = newExternalId("GUEST");
    setEditorHouseholds((current) => current.map((household) => {
      if (household.externalId !== householdExternalId) return household;
      const displayOrder = Math.max(0, ...household.guests.map((guest) => guest.displayOrder)) + 1;
      return {
        ...household,
        guests: [...household.guests, {
          externalId: guestExternalId,
          name: "",
          displayOrder,
          guestType: "adult",
          persisted: false,
        }],
      };
    }));
    markEditorChanged();
    window.requestAnimationFrame(() => document.getElementById(`guest-name-${guestExternalId}`)?.focus());
  };

  const removeGuest = (householdExternalId: string, guestExternalId: string) => {
    setEditorHouseholds((current) => current.map((household) => household.externalId === householdExternalId
      ? { ...household, guests: household.guests.filter((guest) => guest.externalId !== guestExternalId || guest.persisted) }
      : household));
    markEditorChanged();
  };

  const moveGuest = (householdExternalId: string, guestIndex: number, direction: -1 | 1) => {
    setEditorHouseholds((current) => current.map((household) => {
      if (household.externalId !== householdExternalId) return household;
      const targetIndex = guestIndex + direction;
      if (targetIndex < 0 || targetIndex >= household.guests.length) return household;
      const guests = [...household.guests];
      [guests[guestIndex], guests[targetIndex]] = [guests[targetIndex], guests[guestIndex]];
      return {
        ...household,
        guests: guests.map((guest, index) => ({ ...guest, displayOrder: index + 1 })),
      };
    }));
    markEditorChanged();
  };

  const resetEditor = () => {
    if (!data) return;
    if (editorHasChanges && !window.confirm("Discard all unsaved guest-list changes?")) return;
    setEditorHouseholds(editableHouseholds(data));
    setEditorHasChanges(false);
    setEditorResult(null);
    setEditorValidationIssues([]);
    setEditorStatus("Unsaved changes reset.");
    editorDirtyRef.current = false;
    editorRevisionRef.current += 1;
  };

  const requestEditorPreview = async (rows: ImportRow[]) => {
    const response = await fetch("/api/admin/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "preview", rows, sourceName: "guest-list-editor.json" }),
    });
    const result = (await response.json()) as ImportResult & { error?: string };
    if (!response.ok && !result.errors?.length) {
      throw new Error(result.error || "The guest list could not be checked.");
    }
    return result;
  };

  const reviewEditor = async () => {
    if (editorBusy) return;
    const issues = editorIssues(editorHouseholds);
    setEditorValidationIssues(issues);
    if (issues.length > 0) {
      setEditorStatus("Fix the highlighted fields before saving.");
      document.getElementById(issues[0].id)?.focus();
      return;
    }
    const rows = rowsFromEditor(editorHouseholds);
    const reviewedRevision = editorRevisionRef.current;
    setEditorBusy(true);
    setEditorAction("review");
    setEditorStatus("Checking the guest list…");
    setEditorResult(null);
    try {
      const result = await requestEditorPreview(rows);
      if (reviewedRevision !== editorRevisionRef.current) return;
      setEditorResult(result);
      setEditorStatus(result.errors.length > 0
        ? "Resolve the issues below before saving."
        : "Review ready. Select Save guest list to confirm.");
    } catch (error) {
      setEditorStatus(error instanceof Error ? error.message : "The guest list could not be checked.");
    } finally {
      setEditorBusy(false);
      setEditorAction(null);
    }
  };

  const saveEditor = async () => {
    if (editorBusy || !editorDirtyRef.current) return;
    const issues = editorIssues(editorHouseholds);
    setEditorValidationIssues(issues);
    if (issues.length > 0) {
      setEditorStatus("Fix the highlighted fields before saving.");
      document.getElementById(issues[0].id)?.focus();
      return;
    }
    const rows = rowsFromEditor(editorHouseholds);
    const savedRevision = editorRevisionRef.current;
    setEditorBusy(true);
    setEditorAction("save");
    setEditorStatus("Checking and saving the guest list…");
    try {
      const preview = await requestEditorPreview(rows);
      if (savedRevision !== editorRevisionRef.current) return;
      setEditorResult(preview);
      if (preview.errors.length > 0) {
        setEditorStatus("Resolve the issues below before saving.");
        return;
      }
      if (!preview.previewToken || !preview.sourceHash) {
        throw new Error("The guest list review could not be approved.");
      }
      const response = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "commit",
          rows,
          sourceName: "guest-list-editor.json",
          sourceHash: preview.sourceHash,
          previewToken: preview.previewToken,
        }),
      });
      const result = (await response.json()) as ImportResult & { error?: string };
      if (!response.ok) {
        const firstIssue = result.errors?.[0] ? formatImportError(result.errors[0]) : "";
        throw new Error(result.error || firstIssue || "The guest list could not be saved.");
      }
      if (savedRevision !== editorRevisionRef.current) {
        setEditorResult(null);
        setEditorStatus("The reviewed version was saved. Your newer changes are still unsaved.");
        await refresh(false);
        return;
      }
      editorDirtyRef.current = false;
      setEditorHasChanges(false);
      await refresh(true);
      setEditorStatus("Guest list saved. New personal invitation links are ready in Data & exports.");
    } catch (error) {
      setEditorStatus(error instanceof Error
        ? `${error.message} Your changes are still here.`
        : "The guest list could not be saved. Your changes are still here.");
    } finally {
      setEditorBusy(false);
      setEditorAction(null);
    }
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
      await refresh(true);
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
      await refresh(true);
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
          <a href="#guest-list">Guest list</a>
          <a href="#responses">Responses</a>
          <a href="#data-care">Data & exports</a>
          <a href="#backups">Backups</a>
        </nav>
        <Link
          className="back-to-site"
          href="/"
          onClick={(event) => {
            if (editorDirtyRef.current && !window.confirm("Leave without saving your guest-list changes?")) event.preventDefault();
          }}
        >
          ← View invitation
        </Link>
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

        <section className="admin-tool-card guest-editor" id="guest-list" aria-labelledby="guest-list-title">
          <div className="admin-tool-heading">
            <div><p className="eyebrow">Invitation households</p><h2 id="guest-list-title">Guest list</h2></div>
            <span>{editorHouseholds.length} {editorHouseholds.length === 1 ? "household" : "households"}</span>
          </div>
          <p className="guest-editor-intro">Add each household, then list only the people invited in it. Everyone in one household shares one private invitation link.</p>
          <p className={editorHasChanges ? "guest-editor-status unsaved" : "guest-editor-status"} role="status" aria-live="polite">{editorStatus}</p>

          {editorValidationIssues.length > 0 && (
            <div className="editor-error-summary" role="alert" aria-labelledby="editor-error-title">
              <strong id="editor-error-title">Please check {editorValidationIssues.length === 1 ? "this field" : "these fields"}:</strong>
              <ul>{editorValidationIssues.map((issue) => <li key={`${issue.id}-${issue.message}`}><a href={`#${issue.id}`}>{issue.message}</a></li>)}</ul>
            </div>
          )}

          <div className="household-editor-list" id="household-editor-list" tabIndex={-1}>
            {editorHouseholds.map((household, householdIndex) => {
              const householdNameIssue = editorValidationIssues.find((issue) => issue.id === `household-name-${household.externalId}`);
              const greetingIssue = editorValidationIssues.find((issue) => issue.id === `household-greeting-${household.externalId}`);
              return (
                <fieldset className="household-editor" id={`household-${household.externalId}`} key={household.externalId}>
                  <legend>
                    <span>{household.householdName.trim() || `Household ${householdIndex + 1}`}</span>
                    <small>{household.persisted ? "Saved household" : "New household"}</small>
                  </legend>
                  <div className="household-editor-fields">
                    <label className={householdNameIssue ? "editor-field editor-field-error" : "editor-field"} htmlFor={`household-name-${household.externalId}`}>
                      <span>Household name</span>
                      <input
                        id={`household-name-${household.externalId}`}
                        value={household.householdName}
                        maxLength={160}
                        disabled={editorBusy}
                        aria-invalid={Boolean(householdNameIssue)}
                        aria-describedby={householdNameIssue ? `household-name-error-${household.externalId}` : undefined}
                        placeholder="e.g. The Ivanov family"
                        onChange={(event) => updateHousehold(household.externalId, "householdName", event.target.value)}
                      />
                      {householdNameIssue && <small id={`household-name-error-${household.externalId}`}>{householdNameIssue.message}</small>}
                    </label>
                    <label className={greetingIssue ? "editor-field editor-field-error" : "editor-field"} htmlFor={`household-greeting-${household.externalId}`}>
                      <span>Names to greet <em>optional</em></span>
                      <input
                        id={`household-greeting-${household.externalId}`}
                        value={household.greeting}
                        maxLength={240}
                        disabled={editorBusy}
                        aria-invalid={Boolean(greetingIssue)}
                        aria-describedby={greetingIssue ? `household-greeting-error-${household.externalId}` : `household-greeting-hint-${household.externalId}`}
                        placeholder="e.g. Elena and Nikolay"
                        onChange={(event) => updateHousehold(household.externalId, "greeting", event.target.value)}
                      />
                      {greetingIssue
                        ? <small id={`household-greeting-error-${household.externalId}`}>{greetingIssue.message}</small>
                        : <small className="editor-hint" id={`household-greeting-hint-${household.externalId}`}>Not shown on the invitation. Kept with the guest list and included in the delivery export for addressing your messages.</small>}
                    </label>
                  </div>

                  <div className="guest-editor-grid">
                    <div className="guest-editor-head" aria-hidden="true">
                      <span>Invited person</span>
                      <span>Type</span>
                      <span>Order</span>
                      <span>Action</span>
                    </div>
                    {household.guests.map((guest, guestIndex) => {
                      const guestNameIssue = editorValidationIssues.find((issue) => issue.id === `guest-name-${guest.externalId}`);
                      return (
                        <div className="guest-editor-row" key={guest.externalId}>
                          <label className={guestNameIssue ? "editor-field editor-field-error" : "editor-field"} htmlFor={`guest-name-${guest.externalId}`}>
                            <span className="editor-mobile-label">Invited person</span>
                            <input
                              id={`guest-name-${guest.externalId}`}
                              value={guest.name}
                              maxLength={160}
                              disabled={editorBusy}
                              aria-label={`Name for ${guest.name || `person ${guestIndex + 1}`} in ${household.householdName || `household ${householdIndex + 1}`}`}
                              aria-invalid={Boolean(guestNameIssue)}
                              aria-describedby={guestNameIssue ? `guest-name-error-${guest.externalId}` : undefined}
                              placeholder="Full name"
                              onChange={(event) => updateGuest(household.externalId, guest.externalId, "name", event.target.value)}
                            />
                            {guestNameIssue && <small id={`guest-name-error-${guest.externalId}`}>{guestNameIssue.message}</small>}
                          </label>
                          <label className="editor-field" htmlFor={`guest-type-${guest.externalId}`}>
                            <span className="editor-mobile-label">Type</span>
                            <select
                              id={`guest-type-${guest.externalId}`}
                              value={guest.guestType}
                              disabled={editorBusy}
                              aria-label={`Guest type for ${guest.name || `person ${guestIndex + 1}`}`}
                              onChange={(event) => updateGuest(household.externalId, guest.externalId, "guestType", event.target.value)}
                            >
                              <option value="adult">Adult</option>
                              <option value="child">Child</option>
                              <option value="infant">Infant</option>
                            </select>
                          </label>
                          <div className="editor-order" role="group" aria-label={`Invitation order for ${guest.name || `person ${guestIndex + 1}`}`}>
                            <span className="editor-mobile-label">Order</span>
                            <button type="button" aria-label={`Move ${guest.name || `person ${guestIndex + 1}`} up`} disabled={editorBusy || guestIndex === 0} onClick={() => moveGuest(household.externalId, guestIndex, -1)}>↑</button>
                            <strong aria-hidden="true">{guestIndex + 1}</strong>
                            <button type="button" aria-label={`Move ${guest.name || `person ${guestIndex + 1}`} down`} disabled={editorBusy || guestIndex === household.guests.length - 1} onClick={() => moveGuest(household.externalId, guestIndex, 1)}>↓</button>
                          </div>
                          <div className="editor-row-action">
                            <span className="editor-mobile-label">Action</span>
                            {guest.persisted
                              ? <small className="editor-saved-label">Saved</small>
                              : <button className="editor-remove-button" type="button" disabled={editorBusy} onClick={() => removeGuest(household.externalId, guest.externalId)}>Remove</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="household-editor-actions">
                    <button className="editor-add-button" type="button" disabled={editorBusy} onClick={() => addGuest(household.externalId)}>+ Add person</button>
                    {!household.persisted && <button className="editor-remove-button" type="button" disabled={editorBusy} onClick={() => removeHousehold(household.externalId)}>Remove household</button>}
                  </div>
                  <p className="household-sharing-note">One private link will open this invitation for everyone listed above.</p>
                </fieldset>
              );
            })}
            {data && editorHouseholds.length === 0 && (
              <div className="editor-empty">
                <strong>Your guest list is ready to begin.</strong>
                <p>Add your first household. Everyone in a household receives one shared personal invitation link.</p>
              </div>
            )}
          </div>

          {editorResult && (
            <>
              <div className="import-preview" aria-label="Guest-list change summary">
                <div><strong>{editorResult.summary.householdsToCreate ?? 0}</strong><span>New households</span></div>
                <div><strong>{editorResult.summary.householdsToUpdate ?? 0}</strong><span>Household updates</span></div>
                <div><strong>{editorResult.summary.guestsToCreate ?? 0}</strong><span>New guests</span></div>
                <div><strong>{editorResult.summary.guestsToUpdate ?? 0}</strong><span>Guest updates</span></div>
                <div><strong>{editorResult.errors.length}</strong><span>Issues</span></div>
              </div>
              {(editorResult.households?.length ?? 0) > 0 && (
                <div className="import-household-list" aria-label="Households in this save">
                  {editorResult.households?.map((household) => (
                    <article key={household.externalId}>
                      <span className={`import-change ${household.change}`}>{household.change}</span>
                      <div><strong>{household.householdName}</strong><small>{household.guestNames.join(" · ")}</small></div>
                    </article>
                  ))}
                </div>
              )}
              {editorResult.errors.length > 0 && <ul className="import-errors">{editorResult.errors.map((error, index) => <li key={`${formatImportError(error)}-${index}`}>{formatImportError(error)}</li>)}</ul>}
            </>
          )}

          <div className="editor-save-actions">
            <div>
              <button className="editor-add-button" type="button" onClick={addHousehold} disabled={editorBusy}>+ Add household</button>
              <button className="editor-reset-button" type="button" onClick={resetEditor} disabled={!editorHasChanges || editorBusy}>Reset unsaved changes</button>
            </div>
            <div>
              <button className="secondary" type="button" onClick={() => void reviewEditor()} disabled={!editorHasChanges || editorBusy}>{editorAction === "review" ? "Checking…" : "Review changes"}</button>
              <button type="button" onClick={() => void saveEditor()} disabled={!editorHasChanges || editorBusy}>{editorAction === "save" ? "Saving…" : "Save guest list"}</button>
            </div>
          </div>
          <p className="editor-safety-note">Review changes is optional. Save guest list always checks the whole list before saving. Saved people cannot be removed here, which protects live invitation links and replies from accidental deletion.</p>
        </section>

        <section className="guest-register" id="responses">
          <div className="register-heading">
            <div><p className="eyebrow">Live guest list</p><h2>Responses</h2></div>
            <div className="filter-buttons">
              <button className="response-refresh" type="button" disabled={!data || replyRefreshBusy} onClick={() => void refreshReplies()}>
                {replyRefreshBusy ? "Refreshing…" : "Refresh replies"}
              </button>
              {(["all", "attending", "pending", "declined"] as const).map((item) => <button type="button" key={item} aria-pressed={filter === item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All guests" : item === "declined" ? "Not attending" : item}</button>)}
            </div>
          </div>
          <div className="guest-table" role="table" aria-label="Guest responses">
            <div className="table-row table-head" role="row"><span>Guest</span><span>Household</span><span>Reply</span><span>Source</span><span>Notes</span><span>Meal</span></div>
            {visible.map((guest) => {
              const replyDraft = manualReplyDrafts[guest.id] ?? manualReplyDraftFromGuest(guest);
              const replySaveState = manualReplySaveStates[guest.id];
              const replyIsSaving = replySaveState === "saving";
              const replySaveLabel = replySaveState === "draft"
                ? "Notes not saved"
                : replySaveState === "saving"
                  ? "Saving reply…"
                  : replySaveState === "saved"
                    ? "Reply saved"
                    : replySaveState === "error"
                      ? "Save failed"
                      : "";

              return (
                <div className="table-row" role="row" key={guest.id} aria-busy={replyIsSaving}>
                  <span data-label="Guest">
                    <strong>{guest.name}</strong>
                    <small>{guest.externalId || "Invited guest"}</small>
                    {replySaveLabel && <small className={`manual-reply-status ${replySaveState}`} role="status">{replySaveLabel}</small>}
                  </span>
                  <span data-label="Household">{guest.household.householdName}</span>
                  <span data-label="Reply">
                    <select
                      aria-label={`Reply for ${guest.name}`}
                      value={replyDraft.attendance}
                      disabled={replyIsSaving}
                      onChange={(event) => {
                        const nextDraft = updateManualReplyDraft(guest, { attendance: event.target.value as Attendance });
                        queueManualReply(guest, nextDraft);
                      }}
                    >
                      <option value="pending">Pending</option>
                      <option value="attending">Attending</option>
                      <option value="declined">Cannot attend</option>
                    </select>
                  </span>
                  <span data-label="Source">
                    <select
                      aria-label={`Reply source for ${guest.name}`}
                      value={replyDraft.responseSource}
                      disabled={replyIsSaving}
                      onChange={(event) => {
                        const nextDraft = updateManualReplyDraft(guest, { responseSource: event.target.value as ReplySource });
                        queueManualReply(guest, nextDraft);
                      }}
                    >
                      <option value="website">Website</option>
                      <option value="phone">Phone</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="viber">Viber</option>
                      <option value="paper">Paper</option>
                    </select>
                  </span>
                  <span data-label="Notes" className="notes-cell">
                    <textarea
                      aria-label={`Dietary or accessibility notes for ${guest.name}`}
                      value={replyDraft.dietaryNotes}
                      disabled={replyIsSaving}
                      maxLength={500}
                      placeholder="No notes"
                      onChange={(event) => updateManualReplyDraft(guest, { dietaryNotes: event.target.value }, true)}
                      onBlur={() => {
                        if (!manualNoteDirtyRef.current.has(guest.id)) return;
                        queueManualReply(guest, manualReplyDraftsRef.current[guest.id] ?? replyDraft);
                      }}
                    />
                  </span>
                  <span data-label="Meal" className="notes-cell">
                    <select
                      aria-label={`Meal choice for ${guest.name}`}
                      value={replyDraft.mealChoice}
                      disabled={replyIsSaving || !data?.mealPhaseOpen || replyDraft.attendance !== "attending"}
                      onChange={(event) => {
                        const nextDraft = updateManualReplyDraft(guest, { mealChoice: event.target.value });
                        queueManualReply(guest, nextDraft);
                      }}
                    >
                      <option value="">Not chosen</option>
                      {data?.mealOptions.filter((option) => option.guestType === "all" || option.guestType === guest.guestType).map((option) => <option key={option.optionKey} value={option.optionKey}>{option.name}</option>)}
                    </select>
                  </span>
                </div>
              );
            })}
            {data && visible.length === 0 && <p className="admin-empty">No guests match this filter.</p>}
          </div>
        </section>

        <section className="admin-tool-card csv-import-card" id="csv-import">
          <details className="csv-fallback">
            <summary>
              <span><strong>Import a CSV instead</strong><small>Optional for very large guest lists</small></span>
              <span aria-hidden="true">Open</span>
            </summary>
            <div className="csv-fallback-body">
              <div className="admin-tool-heading"><div><p className="eyebrow">Private import</p><h2>Upload a guest list</h2></div><span>Nothing saves before approval</span></div>
              <p>Use one row per guest and group households with the same <code>household_external_id</code>. Uploads are checked in full before the import button becomes available.</p>
              {editorHasChanges && <p className="import-omission-note">Save or reset the unsaved changes in the guest-list editor before importing a CSV.</p>}
              <label className="guest-file-picker">
                <span>{sourceName || "Choose guest-list CSV"}</span>
                <input type="file" accept=".csv,text/csv" onChange={(event) => void chooseGuestList(event)} disabled={importBusy || editorHasChanges} />
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
                <button type="button" onClick={() => void commitImport()} disabled={importBusy || editorHasChanges || importRows.length === 0 || !importResult || importResult.errors.length > 0}>{importBusy ? "Working…" : "Import approved list"}</button>
              </div>
            </div>
          </details>
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
