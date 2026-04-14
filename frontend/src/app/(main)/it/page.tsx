"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { it as itApi, type ITTicketComment, type FileAttachment } from "@/lib/api";
import {
  formatDateUTC5,
  getYearMonthKeyUTC5,
  getCurrentYearMonthKeyUTC5,
  formatMonthHeadingUTC5,
} from "@/lib/dateUtils";
import PriorityBadge from "@/components/jira/PriorityBadge";
import StatusBadge from "@/components/jira/StatusBadge";

type Ticket = {
  id: number;
  problem_type: string | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  created_by_id: number;
  created_by_name: string;
  opened_on_behalf_by_id?: number | null;
  opened_on_behalf_name?: string | null;
  assigned_engineer_id: number | null;
  assigned_engineer_name: string | null;
  created_at: string;
  closed_at: string | null;
  auto_closed_by_system?: boolean;
  confirmed_by_user_at?: string | null;
};

type ItMonthSection = {
  key: string;
  yearMonth: string;
  variant: "currentClosed" | "archive";
  tickets: Ticket[];
};

const PROBLEM_TYPES = [
  { value: "Hardware", label: "Hardware" },
  { value: "Software", label: "Software" },
  { value: "Installing programm", label: "Installing programm" },
  { value: "Printer", label: "Printer" },
  { value: "Telephone", label: "Telephone" },
  { value: "SimCard", label: "SimCard" },
  { value: "Web request", label: "Web request" },
  { value: "Other", label: "Other" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const inputClass =
  "w-full rounded-input border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20";
const labelClass =
  "mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500";
const btnPrimary =
  "inline-flex items-center justify-center rounded-input bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2";
const btnSecondary =
  "inline-flex items-center justify-center rounded-input border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300";

export default function ITTicketsPage() {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Ticket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modal, setModal] = useState<"new" | "assign" | "reassign" | null>(null);
  const [assignTicketId, setAssignTicketId] = useState<number | null>(null);
  const [engineers, setEngineers] = useState<
    { id: number; display_name: string }[]
  >([]);
  const [newProblemType, setNewProblemType] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newDeptId, setNewDeptId] = useState<number | null>(null);
  const [newRequesterId, setNewRequesterId] = useState<number | null>(null);
  const [departments, setDepartments] = useState<
    { id: number; name: string; name_ru: string | null }[]
  >([]);
  const [deptUsers, setDeptUsers] = useState<
    { id: number; display_name: string; ldap_username: string }[]
  >([]);
  const [selectedEngineerId, setSelectedEngineerId] = useState<number | null>(
    null
  );
  const [comments, setComments] = useState<ITTicketComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newCommentBody, setNewCommentBody] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [newTicketError, setNewTicketError] = useState<string | null>(null);
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({});

  const isAdmin =
    user?.roles?.some((r) => r.role_type === "it_admin") ?? false;
  const isEngineer =
    user?.roles?.some((r) => r.role_type === "it_engineer") ?? false;
  const isReassignEngineer =
    user?.roles?.some((r) => r.role_type === "it_reassign_engineer") ?? false;

  function statusAllowsReassign(status: string) {
    return (
      status === "assigned" ||
      status === "in_progress" ||
      status === "closed_by_engineer"
    );
  }

  async function load() {
    setLoading(true);
    try {
      const data = await itApi.tickets();
      setTickets(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (modal === "new" && (isAdmin || isEngineer)) {
      itApi.departments().then(setDepartments).catch(() => setDepartments([]));
    }
  }, [modal, isAdmin, isEngineer]);

  useEffect(() => {
    if (!newDeptId) {
      setDeptUsers([]);
      setNewRequesterId(null);
      return;
    }
    itApi.usersInDepartment(newDeptId).then(setDeptUsers).catch(() => setDeptUsers([]));
  }, [newDeptId]);

  useEffect(() => {
    if (detailId == null) {
      setDetail(null);
      setComments([]);
      return;
    }
    setDetailLoading(true);
    itApi
      .getTicket(detailId)
      .then((d) => setDetail(d))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [detailId]);

  useEffect(() => {
    if (detailId == null) {
      setComments([]);
      setFiles([]);
      return;
    }
    setCommentsLoading(true);
    setFilesLoading(true);
    Promise.all([
      itApi.getComments(detailId).catch(() => []),
      itApi.listFiles(detailId).catch(() => []),
    ])
      .then(([commentsData, filesData]) => {
        setComments(commentsData);
        setFiles(filesData);
      })
      .finally(() => {
        setCommentsLoading(false);
        setFilesLoading(false);
      });
  }, [detailId]);

  async function loadEngineers() {
    const list = await itApi.engineers();
    setEngineers(list);
  }

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    setNewTicketError(null);
    if (isAdmin || isEngineer) {
      if (!newDeptId || !newRequesterId) {
        setNewTicketError(t("it.selectDepartmentAndRequester"));
        return;
      }
      await itApi.createTicket({
        problem_type: newProblemType || null,
        title: newTitle,
        description: newDesc,
        priority: newPriority,
        department_id: newDeptId,
        requester_user_id: newRequesterId,
      });
    } else {
      await itApi.createTicket({
        problem_type: newProblemType || null,
        title: newTitle,
        description: newDesc,
        priority: newPriority,
      });
    }
    setNewProblemType("");
    setNewTitle("");
    setNewDesc("");
    setNewPriority("medium");
    setNewDeptId(null);
    setNewRequesterId(null);
    setNewTicketError(null);
    setModal(null);
    load();
  }

  function deptLabel(d: { name: string; name_ru: string | null }) {
    if (locale === "ru" && d.name_ru) return d.name_ru;
    return d.name;
  }

  async function assignTicket() {
    if (!assignTicketId || !selectedEngineerId) return;
    await itApi.assign(assignTicketId, selectedEngineerId);
    setAssignTicketId(null);
    setSelectedEngineerId(null);
    setModal(null);
    load();
    if (detailId === assignTicketId) setDetail(null);
    setDetailId(assignTicketId);
  }

  async function reassignTicket() {
    if (!assignTicketId || !selectedEngineerId) return;
    await itApi.reassign(assignTicketId, selectedEngineerId);
    setAssignTicketId(null);
    setSelectedEngineerId(null);
    setModal(null);
    load();
    if (detailId === assignTicketId) {
      itApi.getTicket(assignTicketId).then(setDetail);
    }
  }

  async function startTicket(id: number) {
    await itApi.start(id);
    load();
    if (detailId === id) itApi.getTicket(id).then(setDetail);
  }

  async function closeByEngineer(id: number) {
    await itApi.closeByEngineer(id);
    load();
    if (detailId === id) itApi.getTicket(id).then(setDetail);
  }

  async function confirmByUser(id: number) {
    await itApi.confirmByUser(id);
    load();
    if (detailId === id) itApi.getTicket(id).then(setDetail);
  }

  async function submitComment() {
    if (!detailId || !newCommentBody.trim()) return;
    setCommentSubmitting(true);
    try {
      const added = await itApi.addComment(detailId, newCommentBody.trim());
      setComments((prev) => [...prev, added]);
      setNewCommentBody("");
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!detailId || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setFileUploading(true);
    try {
      const attachment = await itApi.uploadFile(detailId, file);
      setFiles((prev) => [attachment, ...prev]);
      e.target.value = ""; // Reset input
    } catch (err) {
      alert(`Failed to upload file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setFileUploading(false);
    }
  }

  async function handleFileDownload(fileId: number, fileName: string) {
    if (!detailId) return;
    try {
      await itApi.downloadFile(detailId, fileId, fileName);
    } catch (err) {
      alert(`Failed to download file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function openAssignModal(ticketId: number, e: React.MouseEvent) {
    e.stopPropagation();
    setAssignTicketId(ticketId);
    setSelectedEngineerId(null);
    loadEngineers();
    setModal("assign");
  }

  function openReassignModal(ticketId: number, e: React.MouseEvent) {
    e.stopPropagation();
    setAssignTicketId(ticketId);
    setSelectedEngineerId(null);
    loadEngineers();
    setModal("reassign");
  }

  const statusLabel: Record<string, string> = {
    open: t("it.open"),
    assigned: t("it.assigned"),
    in_progress: t("it.inProgress"),
    closed_by_engineer: t("it.closedByEngineer"),
    closed: t("it.closed"),
  };

  function itTicketCardAccent(status: string) {
    if (status === "assigned") return "border-red-300 bg-red-50/90 ring-1 ring-red-200";
    if (status === "in_progress") return "border-pink-300 bg-pink-50/90 ring-1 ring-pink-200";
    if (status === "closed_by_engineer") return "border-amber-300 bg-amber-50/90 ring-1 ring-amber-200";
    return "";
  }

  function itTicketRowClass(status: string) {
    if (status === "assigned") return "bg-red-50/90 hover:bg-red-100/90";
    if (status === "in_progress") return "bg-pink-50/90 hover:bg-pink-100/90";
    if (status === "closed_by_engineer") return "bg-amber-50/90 hover:bg-amber-100/90";
    return "hover:bg-slate-50";
  }

  const { currentMonthKey, currentMonthOpen, monthSections } = useMemo(() => {
    const byMonth = new Map<string, Ticket[]>();
    for (const t of tickets) {
      const k = getYearMonthKeyUTC5(t.created_at);
      if (!k) continue;
      if (!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k)!.push(t);
    }
    const sortDesc = (a: Ticket, b: Ticket) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    const currentKey = getCurrentYearMonthKeyUTC5();
    const currentOpen = (byMonth.get(currentKey) ?? [])
      .filter((x) => x.status !== "closed")
      .sort(sortDesc);
    const sortedKeys = Array.from(byMonth.keys()).sort((a, b) => b.localeCompare(a));
    const sections: ItMonthSection[] = [];
    for (const mk of sortedKeys) {
      const raw = byMonth.get(mk) ?? [];
      const sorted = [...raw].sort(sortDesc);
      if (mk === currentKey) {
        const closedOnly = sorted.filter((t) => t.status === "closed");
        if (closedOnly.length) {
          sections.push({
            key: `${mk}-closed`,
            yearMonth: mk,
            variant: "currentClosed",
            tickets: closedOnly,
          });
        }
      } else if (sorted.length) {
        sections.push({
          key: `m-${mk}`,
          yearMonth: mk,
          variant: "archive",
          tickets: sorted,
        });
      }
    }
    return {
      currentMonthKey: currentKey,
      currentMonthOpen: currentOpen,
      monthSections: sections,
    };
  }, [tickets]);

  const toggleAccordion = useCallback((key: string) => {
    setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const renderTicketList = (list: Ticket[]) => (
    <>
      <div className="ticket-cards">
        {list.map((ticket) => (
          <button
            key={ticket.id}
            type="button"
            onClick={() => setDetailId(ticket.id)}
            className={
              "ticket-card w-full text-left shadow-sm transition-shadow hover:shadow-md " +
              (itTicketCardAccent(ticket.status) || "border-slate-200/90")
            }
          >
            <div className="ticket-card-header">
              <span className="ticket-card-key">IT-{ticket.id}</span>
              <span className="text-xs text-slate-500">
                {formatDateUTC5(ticket.created_at)}
              </span>
            </div>
            <p className="ticket-card-title" title={ticket.title}>
              {ticket.title}
            </p>
            <div className="ticket-card-meta">
              <span>{ticket.created_by_name ?? "—"}</span>
              {ticket.closed_at && (
                <span>Closed {formatDateUTC5(ticket.closed_at)}</span>
              )}
              <span>{ticket.assigned_engineer_name ?? "Unassigned"}</span>
            </div>
            <div className="ticket-card-badges">
              <PriorityBadge priority={ticket.priority || "medium"} />
              <StatusBadge status={ticket.status} label={statusLabel[ticket.status]} />
            </div>
          </button>
        ))}
      </div>
      <div className="ticket-table-wrap rounded-2xl shadow-[0_8px_30px_-12px_rgb(15_23_42_/_.12)] ring-1 ring-slate-900/[0.06]">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200/90 bg-gradient-to-b from-slate-50 to-slate-50/70 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <th className="min-w-[88px] px-4 py-3.5 sm:px-5">{t("it.colKey")}</th>
              <th className="px-4 py-3.5 sm:px-5">{t("it.colSummary")}</th>
              <th className="px-4 py-3.5 sm:px-5">{t("it.colRequester")}</th>
              <th className="whitespace-nowrap px-4 py-3.5 sm:px-5">{t("it.colTime")}</th>
              <th className="px-4 py-3.5 sm:px-5">{t("it.colPriority")}</th>
              <th className="px-4 py-3.5 sm:px-5">{t("it.colStatus")}</th>
              <th className="whitespace-nowrap px-4 py-3.5 sm:px-5">{t("it.colClosed")}</th>
              <th className="min-w-[180px] px-4 py-3.5 sm:px-5">{t("it.colAssignee")}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((ticket) => (
              <tr
                key={ticket.id}
                onClick={() => setDetailId(ticket.id)}
                className={
                  "cursor-pointer border-b border-slate-100/90 transition-colors duration-150 last:border-0 " +
                  itTicketRowClass(ticket.status)
                }
              >
                <td className="min-w-[88px] whitespace-nowrap px-4 py-3.5 font-mono text-xs font-semibold text-primary-700 sm:px-5">
                  IT-{ticket.id}
                </td>
                <td
                  className="max-w-[200px] truncate px-4 py-3.5 font-medium text-slate-900 sm:px-5"
                  title={ticket.title}
                >
                  {ticket.title}
                </td>
                <td
                  className="max-w-[120px] truncate px-4 py-3.5 text-slate-600 sm:px-5"
                  title={ticket.created_by_name}
                >
                  {ticket.created_by_name ?? "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-500 sm:px-5">
                  {formatDateUTC5(ticket.created_at)}
                </td>
                <td className="px-4 py-3.5 sm:px-5">
                  <PriorityBadge priority={ticket.priority || "medium"} />
                </td>
                <td className="px-4 py-3.5 sm:px-5">
                  <StatusBadge status={ticket.status} label={statusLabel[ticket.status]} />
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-500 sm:px-5">
                  {formatDateUTC5(ticket.closed_at)}
                </td>
                <td
                  className="min-w-[180px] px-4 py-3.5 sm:px-5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 truncate text-slate-500">
                      {ticket.assigned_engineer_name ?? "—"}
                    </span>
                    {isAdmin && ticket.status === "open" && (
                      <button
                        type="button"
                        onClick={(e) => openAssignModal(ticket.id, e)}
                        className={`${btnSecondary} min-h-touch shrink-0 px-3 py-1.5 text-xs`}
                      >
                        {t("it.assign")}
                      </button>
                    )}
                    {isReassignEngineer &&
                      statusAllowsReassign(ticket.status) &&
                      ticket.assigned_engineer_id != null && (
                        <button
                          type="button"
                          onClick={(e) => openReassignModal(ticket.id, e)}
                          className={`${btnSecondary} min-h-touch shrink-0 px-3 py-1.5 text-xs`}
                        >
                          {t("it.reassignEngineer")}
                        </button>
                      )}
                  </div>
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
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {t("it.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-[15px]">
              {t("it.pageSubtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setNewDeptId(null);
              setNewRequesterId(null);
              setNewTicketError(null);
              setModal("new");
            }}
            className={`${btnPrimary} shrink-0 rounded-xl px-5 py-2.5 shadow-md shadow-primary-600/20 transition hover:shadow-lg hover:shadow-primary-600/25`}
          >
            {t("it.newTicket")}
          </button>
        </div>
        <div
          className="relative mt-6 flex flex-wrap items-center gap-x-5 gap-y-2.5 border-t border-slate-200/80 pt-5"
          aria-hidden
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {t("it.statusLegend")}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <span className="it-legend-dot bg-slate-400" /> {t("it.legendOpen")}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <span className="it-legend-dot bg-red-500" /> {t("it.legendAssigned")}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <span className="it-legend-dot bg-pink-500" /> {t("it.legendInProgress")}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <span className="it-legend-dot bg-amber-500" /> {t("it.legendAwaiting")}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <span className="it-legend-dot bg-emerald-500" /> {t("it.legendClosed")}
          </span>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          <div className="md:hidden space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="it-list-shell p-4">
                <div className="it-skeleton mb-3 h-3 w-20" />
                <div className="it-skeleton mb-2 h-5 w-3/4 max-w-md" />
                <div className="it-skeleton h-3 w-32" />
              </div>
            ))}
          </div>
          <div className="hidden md:block it-list-shell overflow-hidden p-4">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex gap-4">
                  <div className="it-skeleton h-4 w-16 shrink-0" />
                  <div className="it-skeleton h-4 flex-1" />
                  <div className="it-skeleton hidden h-4 w-24 lg:block" />
                  <div className="it-skeleton hidden h-4 w-20 xl:block" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : tickets.length === 0 ? (
        <div className="it-list-shell flex flex-col items-center justify-center px-6 py-16 text-center sm:py-20">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-100 to-primary-50 text-primary-600 shadow-inner ring-1 ring-primary-200/60">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">{t("it.emptyTitle")}</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">{t("it.emptyBody")}</p>
          <button
            type="button"
            onClick={() => {
              setNewDeptId(null);
              setNewRequesterId(null);
              setNewTicketError(null);
              setModal("new");
            }}
            className={`${btnPrimary} mt-8 rounded-xl px-6 py-2.5 shadow-md shadow-primary-600/20`}
          >
            {t("it.newTicket")}
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            <section className="it-list-shell overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgb(0_0_0_/_.05),0_8px_24px_-6px_rgb(15_23_42_/_.1)]">
              <div className="border-b border-slate-200/80 bg-gradient-to-r from-slate-50/90 to-white px-4 py-3 sm:px-5">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                  {t("it.activeThisMonth")}
                </h2>
                <p className="mt-1 text-xs text-slate-600 sm:text-sm">
                  {currentMonthKey ? formatMonthHeadingUTC5(currentMonthKey, locale) : ""}
                </p>
              </div>
              <div className="p-3 sm:p-4">
                {currentMonthOpen.length === 0 ? (
                  <p className="py-6 text-center text-sm leading-relaxed text-slate-500">
                    {t("it.noActiveThisMonth")}
                  </p>
                ) : (
                  renderTicketList(currentMonthOpen)
                )}
              </div>
            </section>

            {monthSections.map((section) => {
              const isOpen = !!openAccordions[section.key];
              const heading =
                section.variant === "currentClosed"
                  ? `${formatMonthHeadingUTC5(section.yearMonth, locale)} — ${t("it.closed")}`
                  : formatMonthHeadingUTC5(section.yearMonth, locale);
              return (
                <div
                  key={section.key}
                  className="it-list-shell overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => toggleAccordion(section.key)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 sm:px-5"
                    aria-expanded={isOpen}
                    aria-label={isOpen ? t("it.hideMonthSection") : t("it.expandMonthSection")}
                  >
                    <span className="min-w-0 text-sm font-semibold text-slate-900 sm:text-base">
                      {heading}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium tabular-nums">
                        {section.tickets.length}
                      </span>
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
                      {renderTicketList(section.tickets)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}

      {detailId != null && (
        <>
          <div
            className="fixed inset-0 z-[99] bg-slate-900/50 backdrop-blur-sm drawer-backdrop"
            onClick={() => setDetailId(null)}
            aria-hidden
          />
          <div className="drawer-panel !border-l-slate-200/80 !shadow-2xl ring-1 ring-slate-900/[0.04] sm:!max-w-none md:!w-[min(36rem,100%)] lg:!w-[min(40rem,94vw)]">
            <div className="it-drawer-header flex flex-shrink-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1 pr-2">
                <p className="font-mono text-xs font-semibold uppercase tracking-wide text-primary-600">
                  {detailLoading ? "…" : detail ? `IT-${detail.id}` : "—"}
                </p>
                <h2 className="mt-1 text-lg font-bold leading-snug tracking-tight text-slate-900 sm:text-xl">
                  {detailLoading ? "…" : detail?.title ?? "—"}
                </h2>
                {detail && (
                  <div className="mt-2 space-y-1 text-xs leading-relaxed text-slate-500">
                    <p>
                      {t("it.requester")}: <span className="font-medium text-slate-700">{detail.created_by_name}</span>
                      <span className="text-slate-400"> · </span>
                      {formatDateUTC5(detail.created_at)}
                    </p>
                    {detail.opened_on_behalf_name && (
                      <p>
                        {t("it.openedOnBehalf")}: <span className="font-medium text-slate-700">{detail.opened_on_behalf_name}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailId(null)}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-lg leading-none text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-800"
                aria-label={t("common.close")}
              >
                ×
              </button>
            </div>
            <div className="flex-1 bg-gradient-to-b from-slate-50/80 to-slate-50/30 px-6 py-6">
              {detailLoading && (
                <div className="space-y-4" aria-busy>
                  <div className="it-skeleton h-4 w-24" />
                  <div className="it-skeleton h-8 w-full max-w-md" />
                  <div className="it-skeleton h-24 w-full" />
                  <div className="it-skeleton h-32 w-full" />
                </div>
              )}
              {detail && !detailLoading && (
                <div className="space-y-5">
                  {detail.status === "closed_by_engineer" && (
                    <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950 ring-1 ring-amber-200/90">
                      {t("it.waitingUserConfirm48h")}
                    </p>
                  )}
                  {detail.status === "closed" && detail.auto_closed_by_system && (
                    <p className="rounded-xl bg-slate-100/90 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200/80">
                      {t("it.autoClosedBySystem")}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <PriorityBadge priority={detail.priority || "medium"} />
                    <StatusBadge status={detail.status} label={statusLabel[detail.status]} />
                    {detail.problem_type && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        {detail.problem_type}
                      </span>
                    )}
                    {detail.assigned_engineer_name && (
                      <span className="inline-flex items-center rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-800">
                        {t("it.assigneeShort")}: {detail.assigned_engineer_name}
                      </span>
                    )}
                  </div>

                  <div className="it-section-card">
                    <h3 className="it-section-label">{t("it.description")}</h3>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {detail.description?.trim() ? detail.description : t("it.noDescription")}
                    </p>
                  </div>

                  <div className="it-section-card">
                    <h3 className="it-section-label">{t("it.detailsSection")}</h3>
                    <div className="divide-y divide-slate-100">
                      <div className="flex justify-between gap-4 py-2.5 text-sm first:pt-0">
                        <span className="shrink-0 text-slate-500">{t("it.requester")}</span>
                        <span className="min-w-0 text-right font-medium text-slate-800">{detail.created_by_name}</span>
                      </div>
                      {detail.opened_on_behalf_name && (
                        <div className="flex justify-between gap-4 py-2.5 text-sm">
                          <span className="shrink-0 text-slate-500">{t("it.openedOnBehalf")}</span>
                          <span className="min-w-0 text-right font-medium text-slate-800">{detail.opened_on_behalf_name}</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-4 py-2.5 text-sm">
                        <span className="shrink-0 text-slate-500">{t("it.createdLabel")}</span>
                        <span className="font-medium text-slate-800">{formatDateUTC5(detail.created_at)}</span>
                      </div>
                      <div className="flex justify-between gap-4 py-2.5 text-sm last:pb-0">
                        <span className="shrink-0 text-slate-500">{t("it.closedLabel")}</span>
                        <span className="font-medium text-slate-800">{detail.closed_at ? formatDateUTC5(detail.closed_at) : "—"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isAdmin && detail.status === "open" && (
                      <button
                        type="button"
                        onClick={() => {
                          setModal("assign");
                          setAssignTicketId(detail.id);
                          loadEngineers();
                          setSelectedEngineerId(null);
                        }}
                        className={btnPrimary}
                      >
                        {t("it.assign")}
                      </button>
                    )}
                    {isReassignEngineer &&
                      statusAllowsReassign(detail.status) &&
                      detail.assigned_engineer_id != null && (
                        <div className="w-full space-y-2">
                          <p className="text-xs text-slate-600">{t("it.reassignDescription")}</p>
                          <button
                            type="button"
                            onClick={() => {
                              setModal("reassign");
                              setAssignTicketId(detail.id);
                              loadEngineers();
                              setSelectedEngineerId(null);
                            }}
                            className={btnSecondary}
                          >
                            {t("it.reassignEngineer")}
                          </button>
                        </div>
                      )}
                    {isEngineer &&
                      detail.assigned_engineer_id === user?.id &&
                      detail.status === "assigned" && (
                        <button
                          type="button"
                          onClick={() => startTicket(detail.id)}
                          className={btnPrimary}
                        >
                          {t("it.start")}
                        </button>
                      )}
                    {isEngineer &&
                      detail.assigned_engineer_id === user?.id &&
                      detail.status === "in_progress" && (
                        <button
                          type="button"
                          onClick={() => closeByEngineer(detail.id)}
                          className={btnPrimary}
                        >
                          {t("it.close")}
                        </button>
                      )}
                    {detail.created_by_id === user?.id &&
                      detail.status === "closed_by_engineer" && (
                        <button
                          type="button"
                          onClick={() => confirmByUser(detail.id)}
                          className={btnPrimary}
                        >
                          {t("it.confirmClose")}
                        </button>
                      )}
                  </div>
                  <div className="it-section-card">
                    <h3 className="it-section-label">{t("it.comments")}</h3>
                    {commentsLoading ? (
                      <p className="text-sm text-slate-500">{t("common.loading")}</p>
                    ) : (
                      <>
                        <ul className="mb-4 space-y-3">
                          {comments.length === 0 ? (
                            <li className="text-sm text-slate-500">
                              {t("it.noComments")}
                            </li>
                          ) : (
                            comments.map((c) => (
                              <li
                                key={c.id}
                                className="rounded-lg border border-slate-100 bg-white px-4 py-3 text-sm"
                              >
                                <span className="font-medium text-slate-700">
                                  {c.author_name}
                                </span>
                                <span className="ml-2 text-xs text-slate-500">
                                  {formatDateUTC5(c.created_at)}
                                </span>
                                <p className="mt-1 whitespace-pre-wrap text-slate-700">
                                  {c.body}
                                </p>
                              </li>
                            ))
                          )}
                        </ul>
                        <div className="space-y-2">
                          <textarea
                            value={newCommentBody}
                            onChange={(e) => setNewCommentBody(e.target.value)}
                            placeholder={t("it.addCommentPlaceholder")}
                            className={`${inputClass} min-h-[80px] resize-y`}
                            rows={3}
                          />
                          <button
                            type="button"
                            onClick={submitComment}
                            disabled={!newCommentBody.trim() || commentSubmitting}
                            className={btnPrimary}
                          >
                            {commentSubmitting
                              ? t("common.loading")
                              : t("it.addComment")}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="it-section-card">
                    <h3 className="it-section-label">{t("it.attachments")}</h3>
                    {filesLoading ? (
                      <p className="text-sm text-slate-500">{t("common.loading")}</p>
                    ) : (
                      <>
                        {files.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-4 text-center text-sm text-slate-500">
                            {t("it.noAttachmentsYet")}
                          </p>
                        ) : (
                          <ul className="mb-4 space-y-2">
                            {files.map((f) => (
                              <li
                                key={f.id}
                                className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-4 py-3 transition hover:bg-slate-50"
                              >
                                <div className="flex-1 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => handleFileDownload(f.id, f.file_name)}
                                    className="text-primary-600 hover:text-primary-700 hover:underline truncate"
                                  >
                                    {f.file_name}
                                  </button>
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    {formatFileSize(f.file_size)} · Uploaded by {f.uploaded_by_name} · {formatDateUTC5(f.created_at)}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="space-y-2">
                          <input
                            type="file"
                            id="file-upload"
                            onChange={handleFileUpload}
                            disabled={fileUploading}
                            className="hidden"
                          />
                          <label
                            htmlFor="file-upload"
                            className={`${btnSecondary} inline-block cursor-pointer ${fileUploading ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {fileUploading ? t("it.uploading") : t("it.uploadFile")}
                          </label>
                        </div>
                      </>
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
          <div
            className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-md modal-backdrop"
            onClick={() => {
              setModal(null);
              setNewTicketError(null);
            }}
            aria-hidden
          />
          <div
            className="fixed left-1/2 top-1/2 z-[111] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 transform rounded-2xl bg-white shadow-2xl"
            style={{ maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 bg-gradient-to-r from-primary-50 to-primary-100 px-8 py-6">
              <h2 className="text-2xl font-bold text-slate-900">
                {t("it.newTicket")}
              </h2>
              <p className="mt-1 text-sm text-slate-600">Create a new IT support ticket</p>
            </div>
            <form onSubmit={createTicket} className="space-y-6 p-8">
              {(isAdmin || isEngineer) && (
                <>
                  <p className="text-sm text-slate-600">{t("it.requesterExplain")}</p>
                  <div>
                    <label htmlFor="new-dept" className={labelClass}>
                      {t("it.department")}
                    </label>
                    <select
                      id="new-dept"
                      value={newDeptId ?? ""}
                      onChange={(e) => {
                        const v = e.target.value ? Number(e.target.value) : null;
                        setNewDeptId(v);
                      }}
                      className={inputClass}
                      required
                    >
                      <option value="">— {t("it.selectDepartment")} —</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {deptLabel(d)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="new-requester" className={labelClass}>
                      {t("it.selectRequester")}
                    </label>
                    <select
                      id="new-requester"
                      value={newRequesterId ?? ""}
                      onChange={(e) =>
                        setNewRequesterId(e.target.value ? Number(e.target.value) : null)
                      }
                      className={inputClass}
                      required
                      disabled={!newDeptId || deptUsers.length === 0}
                    >
                      <option value="">—</option>
                      {deptUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.display_name} ({u.ldap_username})
                        </option>
                      ))}
                    </select>
                    {newDeptId && deptUsers.length === 0 && (
                      <p className="mt-1 text-sm text-amber-700">{t("it.noUsersInDepartment")}</p>
                    )}
                  </div>
                </>
              )}
              {newTicketError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{newTicketError}</p>
              )}
              <div>
                <label htmlFor="new-problem-type" className={labelClass}>
                  {t("it.problemType", "Problem type")}
                </label>
                <select
                  id="new-problem-type"
                  value={newProblemType}
                  onChange={(e) => setNewProblemType(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— {t("it.selectProblemType", "Select problem type")} —</option>
                  {PROBLEM_TYPES.map((pt) => (
                    <option key={pt.value} value={pt.value}>
                      {pt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="new-title" className={labelClass}>
                  {t("it.subject")}
                </label>
                <input
                  id="new-title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label htmlFor="new-priority" className={labelClass}>
                  Priority
                </label>
                <select
                  id="new-priority"
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className={inputClass}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="new-desc" className={labelClass}>
                  {t("it.description")}
                </label>
                <textarea
                  id="new-desc"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className={`${inputClass} min-h-[100px] resize-y`}
                  rows={4}
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-6">
                <button
                  type="button"
                  onClick={() => {
                    setModal(null);
                    setNewTicketError(null);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={
                    (isAdmin || isEngineer) &&
                    (!newDeptId || !newRequesterId || deptUsers.length === 0)
                  }
                  className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {modal === "assign" && assignTicketId && (
        <>
          <div
            className="fixed inset-0 z-[110] bg-slate-900/50 backdrop-blur-sm modal-backdrop"
            onClick={() => {
              setModal(null);
              setAssignTicketId(null);
            }}
            aria-hidden
          />
          <div
            className="modal-panel max-w-[400px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {t("it.assign")}
            </h2>
            <div className="mb-4">
              <label htmlFor="assign-engineer" className={labelClass}>
                Engineer
              </label>
              <select
                id="assign-engineer"
                value={selectedEngineerId ?? ""}
                onChange={(e) =>
                  setSelectedEngineerId(Number(e.target.value) || null)
                }
                className={inputClass}
              >
                <option value="">—</option>
                {engineers.map((eng) => (
                  <option key={eng.id} value={eng.id}>
                    {eng.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={assignTicket}
                disabled={!selectedEngineerId}
                className={btnPrimary}
              >
                {t("common.save")}
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

      {modal === "reassign" && assignTicketId && (
        <>
          <div
            className="fixed inset-0 z-[110] bg-slate-900/50 backdrop-blur-sm modal-backdrop"
            onClick={() => {
              setModal(null);
              setAssignTicketId(null);
            }}
            aria-hidden
          />
          <div
            className="modal-panel max-w-[400px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-lg font-semibold text-slate-900">
              {t("it.reassignEngineer")}
            </h2>
            <p className="mb-4 text-sm text-slate-600">{t("it.reassignDescription")}</p>
            <div className="mb-4">
              <label htmlFor="reassign-engineer" className={labelClass}>
                {t("it.assignedTo")}
              </label>
              <select
                id="reassign-engineer"
                value={selectedEngineerId ?? ""}
                onChange={(e) =>
                  setSelectedEngineerId(Number(e.target.value) || null)
                }
                className={inputClass}
              >
                <option value="">—</option>
                {engineers.map((eng) => (
                  <option key={eng.id} value={eng.id}>
                    {eng.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={reassignTicket}
                disabled={!selectedEngineerId}
                className={btnPrimary}
              >
                {t("common.save")}
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
