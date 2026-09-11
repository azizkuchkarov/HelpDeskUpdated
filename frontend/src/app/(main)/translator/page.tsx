"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { translator as trApi, type TranslatorTicket, type TranslatorFile } from "@/lib/api";
import {
  formatDateUTC5,
  getYearMonthKeyUTC5,
  getCurrentYearMonthKeyUTC5,
  formatMonthHeadingUTC5,
} from "@/lib/dateUtils";
import StatusBadge from "@/components/jira/StatusBadge";

type TranslatorMonthSection = {
  key: string;
  yearMonth: string;
  variant: "currentClosed" | "archive";
  tickets: TranslatorTicket[];
};

const LANG_OPTIONS = [
  { value: "UZ", labelKey: "translator.langUZ" },
  { value: "RU", labelKey: "translator.langRU" },
  { value: "ENG", labelKey: "translator.langENG" },
  { value: "CHN", labelKey: "translator.langCHN" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  open: "bg-slate-200 text-slate-800",
  assigned: "bg-emerald-100 text-emerald-800",
  in_translation: "bg-blue-100 text-blue-800",
  in_checkin: "bg-amber-100 text-amber-800",
  in_admin_review: "bg-violet-100 text-violet-800",
  closed: "bg-emerald-100 text-emerald-800",
};

const STATUS_LABEL_KEY: Record<string, string> = {
  open: "translator.statusOpen",
  assigned: "translator.statusAssigned",
  in_translation: "translator.statusInTranslation",
  in_checkin: "translator.statusInCheckin",
  in_admin_review: "translator.statusInAdminReview",
  closed: "translator.statusClosed",
};

function statusBadgeLabel(t: (k: string) => string, status: string): string {
  const key = STATUS_LABEL_KEY[status];
  return key ? t(key) : status;
}

function workflowStepIndex(status: string): number {
  switch (status) {
    case "open":
      return 0;
    case "assigned":
      return 1;
    case "in_translation":
      return 2;
    case "in_checkin":
      return 3;
    case "in_admin_review":
      return 4;
    case "closed":
      return 5;
    default:
      return 0;
  }
}

function trTicketCardAccent(status: string): string {
  if (status === "assigned") return "border-emerald-300 bg-emerald-50/90 ring-1 ring-emerald-200";
  if (status === "in_translation") return "border-blue-300 bg-blue-50/90 ring-1 ring-blue-200";
  if (status === "in_checkin") return "border-amber-300 bg-amber-50/90 ring-1 ring-amber-200";
  if (status === "in_admin_review") return "border-violet-300 bg-violet-50/90 ring-1 ring-violet-200";
  return "";
}

function trTicketRowClass(status: string): string {
  if (status === "assigned") return "bg-emerald-50/90 hover:bg-emerald-100/90";
  if (status === "in_translation") return "bg-blue-50/90 hover:bg-blue-100/90";
  if (status === "in_checkin") return "bg-amber-50/90 hover:bg-amber-100/90";
  if (status === "in_admin_review") return "bg-violet-50/90 hover:bg-violet-100/90";
  return "hover:bg-slate-50";
}

const inputClass =
  "w-full rounded-input border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20";
const labelClass = "mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500";
const btnPrimary =
  "inline-flex items-center justify-center rounded-input bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center justify-center rounded-input border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:pointer-events-none disabled:opacity-50";
const chipBase =
  "inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-primary-500/30";
const chipInactive = "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50";
const chipActive = "border-primary-500 bg-primary-50 text-primary-800 ring-1 ring-primary-500/20";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function langLabel(t: (k: string) => string, code: string): string {
  const row = LANG_OPTIONS.find((l) => l.value === code);
  return row ? t(row.labelKey) : code;
}

export default function TranslatorPage() {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TranslatorTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TranslatorTicket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailLoadError, setDetailLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState<"new" | "assign" | null>(null);
  const [assignTicketId, setAssignTicketId] = useState<number | null>(null);
  const [engineers, setEngineers] = useState<{ id: number; display_name: string; role_type: string }[]>([]);
  const [selectedTranslatorId, setSelectedTranslatorId] = useState<number | null>(null);
  const [selectedCheckinId, setSelectedCheckinId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newSource, setNewSource] = useState("UZ");
  const [newTarget, setNewTarget] = useState("RU");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [comments, setComments] = useState<{ id: number; author_id: number; author_name: string; body: string; created_at: string | null }[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newCommentBody, setNewCommentBody] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [files, setFiles] = useState<TranslatorFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({});

  const isAdmin = user?.roles?.some((r) => r.role_type === "translator_admin") ?? false;
  const isTranslator = user?.roles?.some((r) => r.role_type === "translator_engineer") ?? false;
  const isCheckin = user?.roles?.some((r) => r.role_type === "checkin_engineer") ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await trApi.tickets();
      setTickets(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (loading || tickets.length === 0) return;
    const ck = getCurrentYearMonthKeyUTC5();
    if (!ck) return;
    const closedKey = `${ck}-closed`;
    setOpenAccordions((p) => (p[closedKey] ? p : { ...p, [closedKey]: true }));
  }, [loading, tickets.length]);

  useEffect(() => {
    if (newSource === newTarget) {
      const alt = LANG_OPTIONS.find((l) => l.value !== newSource)?.value;
      if (alt) setNewTarget(alt);
    }
  }, [newSource, newTarget]);

  useEffect(() => {
    if (detailId == null) {
      setDetail(null);
      setDetailLoadError(null);
      setFiles([]);
      return;
    }
    setDetailLoading(true);
    setDetailLoadError(null);
    trApi
      .getTicket(detailId)
      .then((d) => {
        setDetail(d);
      })
      .catch((e) => {
        setDetail(null);
        setDetailLoadError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setDetailLoading(false));
  }, [detailId]);

  useEffect(() => {
    if (detailId == null) {
      setFiles([]);
      setComments([]);
      return;
    }
    setFilesLoading(true);
    setCommentsLoading(true);
    Promise.all([
      trApi.listFiles(detailId).catch(() => []),
      trApi.getComments(detailId).catch(() => []),
    ])
      .then(([filesData, commentsData]) => {
        setFiles(filesData);
        setComments(commentsData);
      })
      .finally(() => {
        setFilesLoading(false);
        setCommentsLoading(false);
      });
  }, [detailId]);

  useEffect(() => {
    if (detailId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailId]);

  const ticketsMatchingSearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((x) => x.title.toLowerCase().includes(q));
  }, [tickets, searchQuery]);

  const ticketsFiltered = useMemo(() => {
    if (!statusFilter) return ticketsMatchingSearch;
    return ticketsMatchingSearch.filter((x) => x.status === statusFilter);
  }, [ticketsMatchingSearch, statusFilter]);

  const { currentMonthKey, currentMonthActive, monthSections } = useMemo(() => {
    const byMonth = new Map<string, TranslatorTicket[]>();
    for (const tk of ticketsFiltered) {
      const k = getYearMonthKeyUTC5(tk.created_at);
      if (!k) continue;
      if (!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k)!.push(tk);
    }
    const sortDesc = (a: TranslatorTicket, b: TranslatorTicket) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    const currentKey = getCurrentYearMonthKeyUTC5();
    let active = (byMonth.get(currentKey) ?? []).filter((x) => x.status !== "closed").sort(sortDesc);
    // Tickets are grouped by created_at month. A ticket created last month but now in_checkin would only
    // appear under an archive accordion — engineers miss it. Surface assigned non-closed work here too.
    if (user && (isTranslator || isCheckin)) {
      const seen = new Set(active.map((t) => t.id));
      for (const t of ticketsFiltered) {
        if (t.status === "closed") continue;
        const mine =
          t.assigned_translator_id === user.id || t.assigned_checkin_id === user.id;
        if (!mine || seen.has(t.id)) continue;
        active.push(t);
        seen.add(t.id);
      }
      active.sort(sortDesc);
    }
    const promotedIds = new Set(active.map((t) => t.id));
    const sortedKeys = Array.from(byMonth.keys()).sort((a, b) => b.localeCompare(a));
    const sections: TranslatorMonthSection[] = [];
    for (const mk of sortedKeys) {
      const raw = byMonth.get(mk) ?? [];
      const sorted = [...raw].sort(sortDesc);
      if (mk === currentKey) {
        const closedOnly = sorted.filter((x) => x.status === "closed");
        if (closedOnly.length) {
          sections.push({
            key: `${mk}-closed`,
            yearMonth: mk,
            variant: "currentClosed",
            tickets: closedOnly,
          });
        }
      } else if (sorted.length) {
        const archiveTickets =
          promotedIds.size > 0 ? sorted.filter((t) => !promotedIds.has(t.id)) : sorted;
        if (!archiveTickets.length) continue;
        sections.push({
          key: `m-${mk}`,
          yearMonth: mk,
          variant: "archive",
          tickets: archiveTickets,
        });
      }
    }
    return {
      currentMonthKey: currentKey,
      currentMonthActive: active,
      monthSections: sections,
    };
  }, [ticketsFiltered, user?.id, isTranslator, isCheckin]);

  const toggleAccordion = useCallback((key: string) => {
    setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  async function loadEngineers() {
    try {
      const list = await trApi.engineers();
      setEngineers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    if (newSource === newTarget) {
      setError(t("translator.errorSameLanguage"));
      return;
    }
    setFileUploading(true);
    setError(null);
    try {
      const res = await trApi.createTicket({
        title: newTitle,
        description: newDesc || undefined,
        source_language: newSource,
        target_language: newTarget,
      });
      for (const file of newFiles) {
        await trApi.uploadOriginal(res.id, file);
      }
      setNewTitle("");
      setNewDesc("");
      setNewSource("UZ");
      setNewTarget("RU");
      setNewFiles([]);
      setModal(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFileUploading(false);
    }
  }

  function openAssignModal(ticketId: number) {
    setAssignTicketId(ticketId);
    setSelectedTranslatorId(null);
    setSelectedCheckinId(null);
    loadEngineers();
    setModal("assign");
  }

  async function doAssign() {
    if (!assignTicketId || !selectedTranslatorId || !selectedCheckinId) return;
    setPendingAction("assign");
    setError(null);
    try {
      await trApi.assign(assignTicketId, selectedTranslatorId, selectedCheckinId);
      setModal(null);
      setAssignTicketId(null);
      load();
      if (detailId === assignTicketId) {
        trApi.getTicket(assignTicketId).then(setDetail);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleUploadOriginal(file: File) {
    if (!detailId) return;
    setFileUploading(true);
    setError(null);
    try {
      await trApi.uploadOriginal(detailId, file);
      const list = await trApi.listFiles(detailId);
      setFiles(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFileUploading(false);
    }
  }

  async function handleUploadTranslated(file: File) {
    if (!detailId) return;
    setFileUploading(true);
    setError(null);
    try {
      await trApi.uploadTranslated(detailId, file);
      const list = await trApi.listFiles(detailId);
      setFiles(list);
      trApi.getTicket(detailId).then(setDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFileUploading(false);
    }
  }

  async function submitComment() {
    if (!detailId || !newCommentBody.trim()) return;
    setCommentSubmitting(true);
    setError(null);
    try {
      const added = await trApi.addComment(detailId, newCommentBody.trim());
      setComments((prev) => [...prev, added]);
      setNewCommentBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function startTranslation() {
    if (!detailId) return;
    setPendingAction("start");
    setError(null);
    try {
      await trApi.startTranslation(detailId);
      load();
      trApi.getTicket(detailId).then(setDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingAction(null);
    }
  }

  async function submitToCheckin() {
    if (!detailId) return;
    setPendingAction("submit");
    setError(null);
    try {
      await trApi.submitToCheckin(detailId);
      load();
      trApi.getTicket(detailId).then(setDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingAction(null);
    }
  }

  async function checkinApprove() {
    if (!detailId) return;
    setPendingAction("approve");
    setError(null);
    try {
      await trApi.checkinApprove(detailId);
      load();
      trApi.getTicket(detailId).then(setDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingAction(null);
    }
  }

  async function checkinReject() {
    if (!detailId) return;
    if (typeof window !== "undefined" && !window.confirm(t("translator.confirmReject"))) return;
    setPendingAction("reject");
    setError(null);
    try {
      await trApi.checkinReject(detailId);
      load();
      trApi.getTicket(detailId).then(setDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingAction(null);
    }
  }

  async function confirmByUser() {
    if (!detailId) return;
    setPendingAction("confirm");
    setError(null);
    try {
      await trApi.confirmByUser(detailId);
      load();
      trApi.getTicket(detailId).then(setDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingAction(null);
    }
  }

  async function adminApprove() {
    if (!detailId) return;
    setPendingAction("admin-approve");
    setError(null);
    try {
      await trApi.adminApprove(detailId);
      load();
      trApi.getTicket(detailId).then(setDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingAction(null);
    }
  }

  function downloadFile(file: TranslatorFile) {
    if (!detailId) return;
    trApi.downloadFile(detailId, file.id, file.file_name);
  }

  const originalFiles = files.filter((f) => f.file_category === "original");
  const translatorFiles = files.filter((f) => f.file_category === "translator" || f.file_category === "translated");
  const checkinFiles = files.filter((f) => f.file_category === "checkin");
  const adminFiles = files.filter((f) => f.file_category === "admin");

  const filterChips: { key: string | undefined; label: string }[] = [
    { key: undefined, label: t("translator.filterAll") },
    { key: "open", label: t("translator.filterOpen") },
    { key: "assigned", label: t("translator.filterAssigned") },
    { key: "in_translation", label: t("translator.filterInTranslation") },
    { key: "in_checkin", label: t("translator.filterInCheckin") },
    { key: "in_admin_review", label: t("translator.filterInAdminReview") },
    { key: "closed", label: t("translator.filterClosed") },
  ];

  const workflowSteps = [
    t("translator.workflowStepRequest"),
    t("translator.workflowStepAssigned"),
    t("translator.workflowStepTranslating"),
    t("translator.workflowStepCheckin"),
    t("translator.workflowStepAdminReview"),
    t("translator.workflowStepDone"),
  ];

  /** Check-in actions: use assignment match, not only JWT role (roles can be missing from /me). Backend still enforces on approve/reject. */
  const canCheckinAct =
    !!detail &&
    detail.status === "in_checkin" &&
    detail.assigned_checkin_id != null &&
    user != null &&
    Number(detail.assigned_checkin_id) === Number(user.id);

  const canAdminAct =
    !!detail &&
    detail.status === "in_admin_review" &&
    isAdmin;

  const canUploadTranslated =
    !!detail &&
    !!user &&
    (
      (
        (detail.status === "assigned" || detail.status === "in_translation") &&
        detail.assigned_translator_id === user.id
      ) ||
      (detail.status === "in_checkin" && detail.assigned_checkin_id === user.id) ||
      (detail.status === "in_admin_review" && isAdmin)
    );

  const renderTranslatorList = (list: TranslatorTicket[]) => (
    <>
      <div className="ticket-cards">
        {list.map((ticket) => (
          <button
            key={ticket.id}
            type="button"
            onClick={() => setDetailId(ticket.id)}
            className={
              "ticket-card w-full text-left shadow-sm transition-shadow hover:shadow-md " +
              (trTicketCardAccent(ticket.status) || "border-slate-200/90")
            }
          >
            <div className="ticket-card-header">
              <span className="font-mono text-xs font-semibold text-primary-700">TR-{ticket.id}</span>
              <span className="text-xs text-slate-500">{formatDateUTC5(ticket.created_at)}</span>
            </div>
            <p className="ticket-card-title" title={ticket.title}>
              {ticket.title}
            </p>
            <div className="ticket-card-meta">
              <span>{ticket.created_by_name ?? "—"}</span>
              <span>
                {langLabel(t, ticket.source_language)} → {langLabel(t, ticket.target_language)}
              </span>
              {ticket.closed_at ? <span>{formatDateUTC5(ticket.closed_at)}</span> : null}
            </div>
            <div className="ticket-card-badges">
              <StatusBadge status={ticket.status} label={statusBadgeLabel(t, ticket.status)} />
            </div>
          </button>
        ))}
      </div>
      <div className="ticket-table-wrap rounded-2xl shadow-[0_8px_30px_-12px_rgb(15_23_42_/_.12)] ring-1 ring-slate-900/[0.06]">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200/90 bg-gradient-to-b from-slate-50 to-slate-50/70 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <th className="min-w-[88px] px-4 py-3.5 sm:px-5">{t("translator.colKey")}</th>
              <th className="px-4 py-3.5 sm:px-5">{t("translator.colSummary")}</th>
              <th className="px-4 py-3.5 sm:px-5">{t("translator.colLanguages")}</th>
              <th className="px-4 py-3.5 sm:px-5">{t("translator.colRequester")}</th>
              <th className="whitespace-nowrap px-4 py-3.5 sm:px-5">{t("translator.colOpened")}</th>
              <th className="px-4 py-3.5 sm:px-5">{t("translator.colTranslator")}</th>
              <th className="whitespace-nowrap px-4 py-3.5 sm:px-5">{t("translator.colSubmitted")}</th>
              <th className="px-4 py-3.5 sm:px-5">{t("translator.colCheckin")}</th>
              <th className="whitespace-nowrap px-4 py-3.5 sm:px-5">{t("translator.colFinished")}</th>
              <th className="px-4 py-3.5 sm:px-5">{t("translator.colStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((ticket) => (
              <tr
                key={ticket.id}
                onClick={() => setDetailId(ticket.id)}
                className={
                  "cursor-pointer border-b border-slate-100/90 transition-colors duration-150 last:border-0 " +
                  trTicketRowClass(ticket.status)
                }
              >
                <td className="min-w-[88px] whitespace-nowrap px-4 py-3.5 font-mono text-xs font-semibold text-primary-700 sm:px-5">
                  TR-{ticket.id}
                </td>
                <td className="max-w-[200px] truncate px-4 py-3.5 font-medium text-slate-900 sm:px-5" title={ticket.title}>
                  {ticket.title}
                </td>
                <td className="px-4 py-3.5 text-slate-600 sm:px-5">
                  {langLabel(t, ticket.source_language)} → {langLabel(t, ticket.target_language)}
                </td>
                <td className="max-w-[120px] truncate px-4 py-3.5 text-slate-600 sm:px-5" title={ticket.created_by_name}>
                  {ticket.created_by_name ?? "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-500 sm:px-5">{formatDateUTC5(ticket.created_at)}</td>
                <td className="max-w-[120px] truncate px-4 py-3.5 text-slate-500 sm:px-5">{ticket.assigned_translator_name ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-500 sm:px-5">
                  {ticket.translator_submitted_at ? formatDateUTC5(ticket.translator_submitted_at) : "—"}
                </td>
                <td className="max-w-[120px] truncate px-4 py-3.5 text-slate-500 sm:px-5">{ticket.assigned_checkin_name ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-500 sm:px-5">
                  {ticket.closed_at ? formatDateUTC5(ticket.closed_at) : "—"}
                </td>
                <td className="px-4 py-3.5 sm:px-5">
                  <StatusBadge status={ticket.status} label={statusBadgeLabel(t, ticket.status)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  return (
    <div className="page-container it-workspace">
      <header className="it-hero">
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t("nav.translator")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-[15px]">{t("translator.pageSubtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => load()} className={`${btnSecondary} shrink-0 rounded-xl px-5 py-2.5 shadow-sm`} disabled={loading}>
              {loading ? t("common.loading") : t("translator.refresh")}
            </button>
            <button
              type="button"
              onClick={() => {
                setNewFiles([]);
                setError(null);
                setModal("new");
              }}
              className={`${btnPrimary} shrink-0 rounded-xl px-5 py-2.5 shadow-md shadow-primary-600/20 transition hover:shadow-lg hover:shadow-primary-600/25`}
            >
              {t("translator.newRequest")}
            </button>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap items-center gap-x-5 gap-y-2.5 border-t border-slate-200/80 pt-5" aria-hidden>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{t("translator.statusLegend")}</span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <span className="it-legend-dot bg-slate-400" /> {t("translator.legendOpen")}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <span className="it-legend-dot bg-emerald-500" /> {t("translator.legendAssigned")}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <span className="it-legend-dot bg-blue-500" /> {t("translator.legendInTranslation")}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <span className="it-legend-dot bg-amber-500" /> {t("translator.legendInCheckin")}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <span className="it-legend-dot bg-violet-500" /> {t("translator.legendInAdminReview")}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <span className="it-legend-dot bg-emerald-600" /> {t("translator.legendClosed")}
          </span>
        </div>
      </header>

      <div className="it-list-shell mb-6 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("translator.searchPlaceholder")}
            className={`${inputClass} lg:max-w-md lg:flex-1`}
            aria-label={t("translator.searchPlaceholder")}
          />
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("translator.colStatus")}>
            {filterChips.map(({ key, label }) => (
              <button
                key={key ?? "all"}
                type="button"
                role="tab"
                aria-selected={statusFilter === key}
                onClick={() => setStatusFilter(key)}
                className={`${chipBase} ${statusFilter === key ? chipActive : chipInactive}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" className="shrink-0 text-xs font-medium text-red-700 underline hover:text-red-900" onClick={() => setError(null)}>
            {t("translator.dismissError")}
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="space-y-3 md:hidden">
            {[1, 2, 3].map((i) => (
              <div key={i} className="it-list-shell p-4">
                <div className="it-skeleton mb-3 h-3 w-24" />
                <div className="it-skeleton mb-2 h-5 w-3/4 max-w-md" />
                <div className="it-skeleton h-3 w-40" />
              </div>
            ))}
          </div>
          <div className="hidden md:block it-list-shell overflow-hidden p-4">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex gap-4">
                  <div className="it-skeleton h-4 w-16 shrink-0" />
                  <div className="it-skeleton h-4 flex-1" />
                  <div className="it-skeleton hidden h-4 w-28 lg:block" />
                  <div className="it-skeleton hidden h-4 w-24 xl:block" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : tickets.length === 0 ? (
        <div className="it-list-shell flex flex-col items-center justify-center px-6 py-16 text-center sm:py-20">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-100 to-primary-50 text-primary-600 shadow-inner ring-1 ring-primary-200/60">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">{t("translator.emptyTitle")}</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">{t("translator.emptyBody")}</p>
          <button
            type="button"
            onClick={() => {
              setNewFiles([]);
              setError(null);
              setModal("new");
            }}
            className={`${btnPrimary} mt-8 rounded-xl px-6 py-2.5 shadow-md shadow-primary-600/20`}
          >
            {t("translator.newRequest")}
          </button>
        </div>
      ) : ticketsFiltered.length === 0 ? (
        <div className="it-list-shell px-6 py-14 text-center text-sm leading-relaxed text-slate-600">{t("translator.emptyFiltered")}</div>
      ) : (
        <div className="space-y-4">
          {(statusFilter === undefined || statusFilter !== "closed") && (
            <section className="it-list-shell overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgb(0_0_0_/_.05),0_8px_24px_-6px_rgb(15_23_42_/_.1)]">
              <div className="border-b border-slate-200/80 bg-gradient-to-r from-slate-50/90 to-white px-4 py-3 sm:px-5">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t("translator.activeThisMonth")}</h2>
                <p className="mt-1 text-xs text-slate-600 sm:text-sm">
                  {currentMonthKey ? formatMonthHeadingUTC5(currentMonthKey, locale) : ""}
                </p>
              </div>
              <div className="p-3 sm:p-4">
                {currentMonthActive.length === 0 ? (
                  <p className="py-6 text-center text-sm leading-relaxed text-slate-500">{t("translator.noActiveThisMonth")}</p>
                ) : (
                  renderTranslatorList(currentMonthActive)
                )}
              </div>
            </section>
          )}

          {monthSections.map((section) => {
            const isOpen = !!openAccordions[section.key];
            const heading =
              section.variant === "currentClosed"
                ? `${formatMonthHeadingUTC5(section.yearMonth, locale)} — ${t("translator.legendClosed")}`
                : `${formatMonthHeadingUTC5(section.yearMonth, locale)} — ${t("translator.archiveMonth")}`;
            return (
              <div key={section.key} className="it-list-shell overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleAccordion(section.key)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 sm:px-5"
                  aria-expanded={isOpen}
                  aria-label={isOpen ? t("it.hideMonthSection") : t("it.expandMonthSection")}
                >
                  <span className="min-w-0 text-sm font-semibold text-slate-900 sm:text-base">{heading}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium tabular-nums">{section.tickets.length}</span>
                    <svg
                      className={`size-5 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </button>
                {isOpen ? (
                  <div className="border-t border-slate-100 px-2 pb-4 pt-1 sm:px-4">
                    {section.variant === "currentClosed" ? (
                      <p className="mb-3 px-2 text-xs text-slate-500 sm:px-2">{t("translator.closedAccordionHint")}</p>
                    ) : null}
                    {renderTranslatorList(section.tickets)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {detailId != null && (
        <>
          <div
            className="fixed inset-0 z-[99] bg-slate-900/50 backdrop-blur-sm drawer-backdrop"
            onClick={() => setDetailId(null)}
            aria-hidden
          />
          <div
            className="drawer-panel flex !max-h-dvh flex-col !overflow-hidden !border-l-slate-200/80 !shadow-2xl ring-1 ring-slate-900/[0.04] sm:!max-w-none md:!w-[min(36rem,100%)] lg:!w-[min(42rem,94vw)]"
            role="dialog"
            aria-modal
            aria-labelledby="translator-drawer-title"
          >
            <div className="it-drawer-header flex flex-shrink-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1 pr-2">
                <p className="font-mono text-xs font-semibold uppercase tracking-wide text-primary-600">
                  {detailLoading ? "…" : detail ? `TR-${detail.id}` : "—"}
                </p>
                <h2 id="translator-drawer-title" className="mt-1 text-lg font-bold leading-snug tracking-tight text-slate-900 sm:text-xl">
                  {detailLoading ? "…" : detail?.title ?? "—"}
                </h2>
                {detail && (
                  <p className="mt-1 text-xs text-slate-500">
                    {langLabel(t, detail.source_language)} → {langLabel(t, detail.target_language)} · {t("translator.createdBy")}{" "}
                    {detail.created_by_name} · {formatDateUTC5(detail.created_at)}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => setDetailId(null)} className={btnSecondary} aria-label={t("common.close")}>
                ×
              </button>
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
              {detailLoading && <p className="text-slate-500">{t("common.loading")}</p>}
              {!detailLoading && detailLoadError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{detailLoadError}</div>
              )}
              {detail && !detailLoading && (
                <div className="space-y-6">
                  <div
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                    role="region"
                    aria-label={t("workflow.translator.title")}
                  >
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("workflow.title")}</p>
                    <ol className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                      {workflowSteps.map((label, i) => {
                        const stepIdx = workflowStepIndex(detail.status);
                        const done = i < stepIdx;
                        const current = i === stepIdx;
                        return (
                          <li key={i} className="flex flex-col items-center text-center">
                            <span
                              className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${
                                done
                                  ? "bg-emerald-500 text-white"
                                  : current
                                    ? "bg-primary-600 text-white shadow-md ring-2 ring-primary-500/25"
                                    : "bg-slate-200 text-slate-500"
                              }`}
                            >
                              {done ? "✓" : i + 1}
                            </span>
                            <span className={`mt-2 text-[11px] font-medium leading-snug sm:text-xs ${current ? "text-slate-900" : "text-slate-500"}`}>
                              {label}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                    {detail.status === "closed" && detail.created_by_id === user?.id && !detail.confirmed_by_user_at && (
                      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("translator.workflowAwaitingYourConfirm")}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[detail.status] ?? "bg-slate-100 text-slate-700"}`}>
                      {statusBadgeLabel(t, detail.status)}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {langLabel(t, detail.source_language)} → {langLabel(t, detail.target_language)}
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("translator.sectionRequesterOpened")}</h3>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">{t("translator.labelRequester")}</span>
                      <span className="font-medium text-slate-800">{detail.created_by_name ?? "—"}</span>
                    </div>
                    <div className="mt-2 flex justify-between text-sm">
                      <span className="text-slate-500">{t("translator.labelOpened")}</span>
                      <span className="font-medium text-slate-800">{formatDateUTC5(detail.created_at)}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-blue-800">{t("translator.sectionTranslator")}</h3>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">{t("translator.labelTranslator")}</span>
                      <span className="font-medium text-slate-800">{detail.assigned_translator_name ?? "—"}</span>
                    </div>
                    <div className="mt-2 flex justify-between text-sm">
                      <span className="text-slate-600">{t("translator.labelSubmittedToCheckin")}</span>
                      <span className="font-medium text-slate-800">
                        {detail.translator_submitted_at ? formatDateUTC5(detail.translator_submitted_at) : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-800">{t("translator.sectionCheckin")}</h3>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">{t("translator.labelCheckinEngineer")}</span>
                      <span className="font-medium text-slate-800">{detail.assigned_checkin_name ?? "—"}</span>
                    </div>
                    <div className="mt-2 flex justify-between text-sm">
                      <span className="text-slate-600">{t("translator.labelFinished")}</span>
                      <span className="font-medium text-slate-800">
                        {detail.checkin_completed_at ? formatDateUTC5(detail.checkin_completed_at) : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-violet-800">{t("translator.sectionAdminReview")}</h3>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">{t("translator.labelAdmin")}</span>
                      <span className="font-medium text-slate-800">{detail.status === "in_admin_review" || detail.status === "closed" ? t("translator.adminRoleLabel") : "—"}</span>
                    </div>
                    <div className="mt-2 flex justify-between text-sm">
                      <span className="text-slate-600">{t("translator.labelFinished")}</span>
                      <span className="font-medium text-slate-800">
                        {detail.admin_approved_at ? formatDateUTC5(detail.admin_approved_at) : "—"}
                      </span>
                    </div>
                  </div>

                  {detail.description && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("translator.description")}</h3>
                      <p className="whitespace-pre-wrap text-sm text-slate-700">{detail.description}</p>
                    </div>
                  )}

                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("it.comments")}</h3>
                    {commentsLoading ? (
                      <p className="text-sm text-slate-500">{t("common.loading")}</p>
                    ) : (
                      <>
                        <ul className="mb-4 space-y-3">
                          {comments.length === 0 ? (
                            <li className="text-sm text-slate-500">{t("it.noComments")}</li>
                          ) : (
                            comments.map((c) => (
                              <li key={c.id} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                  <span className="font-medium">{c.author_name}</span>
                                  <span>{c.created_at ? formatDateUTC5(c.created_at) : ""}</span>
                                </div>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{c.body}</p>
                              </li>
                            ))
                          )}
                        </ul>
                        <div className="space-y-2">
                          <textarea
                            value={newCommentBody}
                            onChange={(e) => setNewCommentBody(e.target.value)}
                            placeholder={t("it.addCommentPlaceholder")}
                            className="min-h-[80px] w-full resize-y rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                            rows={3}
                          />
                          <button
                            type="button"
                            onClick={submitComment}
                            disabled={!newCommentBody.trim() || commentSubmitting}
                            className={btnPrimary}
                          >
                            {commentSubmitting ? t("common.loading") : t("it.addComment")}
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("translator.files")}</h3>
                    {filesLoading ? (
                      <p className="text-slate-500">{t("common.loading")}</p>
                    ) : (
                      <div className="space-y-4">
                        {detail.status === "open" && detail.created_by_id === user?.id && (
                          <div>
                            <p className="mb-1 text-sm font-medium text-slate-600">{t("translator.originalFiles")}</p>
                            <input
                              type="file"
                              multiple
                              onChange={(e) => {
                                const f = e.target.files;
                                if (f) for (let i = 0; i < f.length; i++) handleUploadOriginal(f[i]);
                                e.target.value = "";
                              }}
                              disabled={fileUploading}
                              className="text-sm file:mr-2 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
                              aria-label={t("translator.uploadOriginal")}
                            />
                            {fileUploading && <p className="mt-1 text-xs text-slate-500">{t("it.uploading")}</p>}
                          </div>
                        )}
                        {originalFiles.length > 0 && (
                          <div className="mb-4">
                            <p className="mb-2 text-xs font-medium text-slate-500">{t("translator.originalFiles")}</p>
                            <ul className="space-y-2">
                              {originalFiles.map((f) => (
                                <li
                                  key={f.id}
                                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-4 py-3 transition hover:bg-slate-50"
                                >
                                  <button type="button" onClick={() => downloadFile(f)} className="font-medium text-primary-600 hover:underline">
                                    {f.file_name}
                                  </button>
                                  <span className="text-xs text-slate-500">
                                    {formatFileSize(f.file_size)} · {f.uploaded_by_name}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {canUploadTranslated && (
                            <div>
                              <p className="mb-1 text-sm font-medium text-slate-600">{t("translator.translatedFiles")}</p>
                              <input
                                type="file"
                                multiple
                                onChange={(e) => {
                                  const f = e.target.files;
                                  if (f) for (let i = 0; i < f.length; i++) handleUploadTranslated(f[i]);
                                  e.target.value = "";
                                }}
                                disabled={fileUploading}
                                className="text-sm file:mr-2 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
                                aria-label={t("translator.uploadTranslated")}
                              />
                            </div>
                          )}
                        {translatorFiles.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-slate-500">{t("translator.translatorFiles")}</p>
                            <ul className="space-y-2">
                              {translatorFiles.map((f) => (
                                <li
                                  key={f.id}
                                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-4 py-3 transition hover:bg-slate-50"
                                >
                                  <button type="button" onClick={() => downloadFile(f)} className="font-medium text-primary-600 hover:underline">
                                    {f.file_name}
                                  </button>
                                  <span className="text-xs text-slate-500">
                                    {formatFileSize(f.file_size)} · {f.uploaded_by_name}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {checkinFiles.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-slate-500">{t("translator.checkinFiles")}</p>
                            <ul className="space-y-2">
                              {checkinFiles.map((f) => (
                                <li
                                  key={f.id}
                                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-4 py-3 transition hover:bg-slate-50"
                                >
                                  <button type="button" onClick={() => downloadFile(f)} className="font-medium text-primary-600 hover:underline">
                                    {f.file_name}
                                  </button>
                                  <span className="text-xs text-slate-500">
                                    {formatFileSize(f.file_size)} · {f.uploaded_by_name}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {adminFiles.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-slate-500">{t("translator.adminFiles")}</p>
                            <ul className="space-y-2">
                              {adminFiles.map((f) => (
                                <li
                                  key={f.id}
                                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-4 py-3 transition hover:bg-slate-50"
                                >
                                  <button type="button" onClick={() => downloadFile(f)} className="font-medium text-primary-600 hover:underline">
                                    {f.file_name}
                                  </button>
                                  <span className="text-xs text-slate-500">
                                    {formatFileSize(f.file_size)} · {f.uploaded_by_name}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                    {isAdmin && detail.status === "open" && (
                      <button type="button" onClick={() => openAssignModal(detail.id)} className={btnPrimary}>
                        {t("translator.assignTitle")}
                      </button>
                    )}
                    {isTranslator && detail.assigned_translator_id === user?.id && detail.status === "assigned" && (
                      <button type="button" onClick={startTranslation} disabled={pendingAction === "start"} className={btnPrimary}>
                        {pendingAction === "start" ? t("common.loading") : t("translator.startTranslation")}
                      </button>
                    )}
                    {isTranslator &&
                      detail.assigned_translator_id === user?.id &&
                      detail.status === "in_translation" &&
                      translatorFiles.length > 0 && (
                        <button type="button" onClick={submitToCheckin} disabled={pendingAction === "submit"} className={btnPrimary}>
                          {pendingAction === "submit" ? t("common.loading") : t("translator.submitToCheckin")}
                        </button>
                      )}
                    {isTranslator &&
                      detail.assigned_translator_id === user?.id &&
                      detail.status === "in_translation" &&
                      translatorFiles.length === 0 && (
                        <p className="w-full text-xs text-slate-500">{t("translator.uploadTranslated")}</p>
                      )}
                    {canCheckinAct && (
                      <>
                        <button type="button" onClick={checkinApprove} disabled={pendingAction === "approve"} className={btnPrimary}>
                          {pendingAction === "approve" ? t("common.loading") : t("translator.submitToAdminReview")}
                        </button>
                        <button type="button" onClick={checkinReject} disabled={pendingAction === "reject"} className={btnSecondary}>
                          {pendingAction === "reject" ? t("common.loading") : t("translator.reject")}
                        </button>
                      </>
                    )}
                    {canAdminAct && (
                      <button type="button" onClick={adminApprove} disabled={pendingAction === "admin-approve"} className={btnPrimary}>
                        {pendingAction === "admin-approve" ? t("common.loading") : t("translator.adminApprove")}
                      </button>
                    )}
                    {detail.status === "closed" && detail.created_by_id === user?.id && !detail.confirmed_by_user_at && (
                      <button type="button" onClick={confirmByUser} disabled={pendingAction === "confirm"} className={btnPrimary}>
                        {pendingAction === "confirm" ? t("common.loading") : t("translator.confirmReceipt")}
                      </button>
                    )}
                    {detail.status === "closed" && detail.confirmed_by_user_at && (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                        {t("translator.confirmedPrefix")} {formatDateUTC5(detail.confirmed_by_user_at)}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {modal === "new" && (
        <>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">{t("translator.modalNewTitle")}</h2>
            <form onSubmit={createTicket} className="space-y-4">
              <div>
                <label className={labelClass}>{t("translator.titleField")}</label>
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className={inputClass} required />
              </div>
              <div>
                <label className={labelClass}>{t("translator.sourceLanguage")}</label>
                <select value={newSource} onChange={(e) => setNewSource(e.target.value)} className={inputClass}>
                  {LANG_OPTIONS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {t(l.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>{t("translator.targetLanguage")}</label>
                <select value={newTarget} onChange={(e) => setNewTarget(e.target.value)} className={inputClass}>
                  {LANG_OPTIONS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {t(l.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>{t("it.description")}</label>
                <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className={`${inputClass} min-h-[80px] resize-y`} rows={3} />
              </div>
              <div>
                <label className={labelClass}>{t("translator.originalFiles")}</label>
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    const f = e.target.files;
                    if (f) setNewFiles(Array.from(f));
                  }}
                  className="text-sm file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700"
                />
                {newFiles.length > 0 && (
                  <p className="mt-1 text-xs text-slate-600">
                    {newFiles.length} {t("translator.filesSelected")}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button type="submit" className={btnPrimary} disabled={fileUploading || newSource === newTarget}>
                  {fileUploading ? t("common.loading") : t("common.save")}
                </button>
                <button type="button" onClick={() => setModal(null)} className={btnSecondary} disabled={fileUploading}>
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {modal === "assign" && assignTicketId && (
        <>
          <div
            className="fixed inset-0 z-[110] bg-slate-900/50 backdrop-blur-sm"
            onClick={() => {
              setModal(null);
              setAssignTicketId(null);
            }}
            aria-hidden
          />
          <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">{t("translator.assignTitle")}</h2>
            <div className="mb-4">
              <label className={labelClass}>{t("translator.engineerTranslator")}</label>
              <select
                value={selectedTranslatorId ?? ""}
                onChange={(e) => setSelectedTranslatorId(Number(e.target.value) || null)}
                className={inputClass}
              >
                <option value="">{t("translator.selectPerson")}</option>
                {engineers
                  .filter((e) => e.role_type === "translator_engineer")
                  .map((eng) => (
                    <option key={eng.id} value={eng.id}>
                      {eng.display_name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="mb-4">
              <label className={labelClass}>{t("translator.engineerCheckin")}</label>
              <select
                value={selectedCheckinId ?? ""}
                onChange={(e) => setSelectedCheckinId(Number(e.target.value) || null)}
                className={inputClass}
              >
                <option value="">{t("translator.selectPerson")}</option>
                {engineers
                  .filter((e) => e.role_type === "checkin_engineer")
                  .map((eng) => (
                    <option key={eng.id} value={eng.id}>
                      {eng.display_name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={doAssign}
                disabled={!selectedTranslatorId || !selectedCheckinId || pendingAction === "assign"}
                className={btnPrimary}
              >
                {pendingAction === "assign" ? t("common.loading") : t("common.save")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setModal(null);
                  setAssignTicketId(null);
                }}
                className={btnSecondary}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
