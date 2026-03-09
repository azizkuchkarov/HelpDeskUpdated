"use client";

import { useState, useEffect } from "react";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { it as itApi, type ITTicketComment, type FileAttachment } from "@/lib/api";
import { formatDateUTC5 } from "@/lib/dateUtils";
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
  assigned_engineer_id: number | null;
  assigned_engineer_name: string | null;
  created_at: string;
  closed_at: string | null;
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
  const { t } = useLocale();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Ticket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modal, setModal] = useState<"new" | "assign" | null>(null);
  const [assignTicketId, setAssignTicketId] = useState<number | null>(null);
  const [engineers, setEngineers] = useState<
    { id: number; display_name: string }[]
  >([]);
  const [newProblemType, setNewProblemType] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
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

  const isAdmin =
    user?.roles?.some((r) => r.role_type === "it_admin") ?? false;
  const isEngineer =
    user?.roles?.some((r) => r.role_type === "it_engineer") ?? false;

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
    await itApi.createTicket(newProblemType || null, newTitle, newDesc, newPriority);
    setNewProblemType("");
    setNewTitle("");
    setNewDesc("");
    setNewPriority("medium");
    setModal(null);
    load();
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

  const statusLabel: Record<string, string> = {
    open: t("it.open"),
    assigned: t("it.assigned"),
    in_progress: t("it.inProgress"),
    closed_by_engineer: t("it.closedByEngineer"),
    closed: t("it.closed"),
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">{t("it.title")}</h1>
        <button
          type="button"
          onClick={() => setModal("new")}
          className={btnPrimary}
        >
          {t("it.newTicket")}
        </button>
      </div>

      {loading ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="ticket-cards">
            {tickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => setDetailId(ticket.id)}
                className="ticket-card w-full text-left"
              >
                <div className="ticket-card-header">
                  <span className="ticket-card-key">IT-{ticket.id}</span>
                  <span className="text-xs text-slate-500">
                    {formatDateUTC5(ticket.created_at)}
                  </span>
                </div>
                <p className="ticket-card-title" title={ticket.title}>{ticket.title}</p>
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
          {/* Desktop: table with horizontal scroll */}
          <div className="ticket-table-wrap">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="min-w-[88px] px-3 py-3 sm:px-4">Key</th>
                  <th className="px-3 py-3 sm:px-4">Summary</th>
                  <th className="px-3 py-3 sm:px-4">Requester</th>
                  <th className="px-3 py-3 sm:px-4 whitespace-nowrap">Time</th>
                  <th className="px-3 py-3 sm:px-4">Priority</th>
                  <th className="px-3 py-3 sm:px-4">Status</th>
                  <th className="px-3 py-3 sm:px-4 whitespace-nowrap">Closed</th>
                  <th className="min-w-[180px] px-3 py-3 sm:px-4">Assignee</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => setDetailId(ticket.id)}
                    className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 last:border-0"
                  >
                    <td className="min-w-[88px] px-3 py-3 sm:px-4 font-medium text-slate-500 whitespace-nowrap">IT-{ticket.id}</td>
                    <td className="max-w-[200px] truncate px-3 py-3 sm:px-4 font-medium text-slate-900" title={ticket.title}>
                      {ticket.title}
                    </td>
                    <td className="truncate px-3 py-3 sm:px-4 text-slate-600 max-w-[120px]" title={ticket.created_by_name}>
                      {ticket.created_by_name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 sm:px-4 text-slate-500 text-xs">
                      {formatDateUTC5(ticket.created_at)}
                    </td>
                    <td className="px-3 py-3 sm:px-4">
                      <PriorityBadge priority={ticket.priority || "medium"} />
                    </td>
                    <td className="px-3 py-3 sm:px-4">
                      <StatusBadge status={ticket.status} label={statusLabel[ticket.status]} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 sm:px-4 text-slate-500 text-xs">
                      {formatDateUTC5(ticket.closed_at)}
                    </td>
                    <td className="min-w-[180px] px-3 py-3 sm:px-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-slate-500 min-w-0 truncate">
                          {ticket.assigned_engineer_name ?? "—"}
                        </span>
                        {isAdmin && ticket.status === "open" && (
                          <button
                            type="button"
                            onClick={(e) => openAssignModal(ticket.id, e)}
                            className={`${btnSecondary} shrink-0 px-3 py-1.5 text-xs min-h-touch`}
                          >
                            {t("it.assign")}
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
      )}

      {detailId != null && (
        <>
          <div
            className="fixed inset-0 z-[99] bg-slate-900/50 backdrop-blur-sm drawer-backdrop"
            onClick={() => setDetailId(null)}
            aria-hidden
          />
          <div className="drawer-panel">
            <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-6 py-5 pt-[calc(1rem+var(--safe-top))]">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
                  {detailLoading
                    ? "..."
                    : detail
                      ? `IT-${detail.id} — ${detail.title}`
                      : "—"}
                </h2>
                {detail && (
                  <p className="mt-1 text-xs text-slate-500">
                    Created by {detail.created_by_name} ·{" "}
                    {formatDateUTC5(detail.created_at)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailId(null)}
                className={btnSecondary}
              >
                ×
              </button>
            </div>
            <div className="flex-1 px-6 py-5">
              {detailLoading && (
                <p className="text-slate-500">{t("common.loading")}</p>
              )}
              {detail && !detailLoading && (
                <div className="space-y-6">
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
                        Assignee: {detail.assigned_engineer_name}
                      </span>
                    )}
                  </div>

                  {detail.problem_type && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("it.problemType", "Problem type")}</h3>
                      <p className="font-medium text-slate-800">{detail.problem_type}</p>
                    </div>
                  )}

                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Description</h3>
                    <p className="whitespace-pre-wrap text-sm text-slate-700">{detail.description || "No description."}</p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Details</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Created</span>
                        <span className="font-medium text-slate-800">{formatDateUTC5(detail.created_at)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Closed</span>
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
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("it.comments")}</h3>
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
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Attachments</h3>
                    {filesLoading ? (
                      <p className="text-sm text-slate-500">{t("common.loading")}</p>
                    ) : (
                      <>
                        {files.length === 0 ? (
                          <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">No attachments</p>
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
                            {fileUploading ? "Uploading..." : "Upload File"}
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
            onClick={() => setModal(null)}
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
                  onClick={() => setModal(null)}
                  className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
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
    </div>
  );
}
