"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { translator as trApi, type TranslatorTicket, type TranslatorFile } from "@/lib/api";
import { formatDateUTC5 } from "@/lib/dateUtils";

const SOURCE_LANGUAGES = [
  { value: "UZ", label: "UZ" },
  { value: "RU", label: "RU" },
  { value: "ENG", label: "ENG" },
  { value: "CHN", label: "CHN" },
];

const TARGET_LANGUAGES = [
  { value: "UZ", label: "UZ" },
  { value: "RU", label: "RU" },
  { value: "ENG", label: "ENG" },
  { value: "CHN", label: "CHN" },
];

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  assigned: "Assigned",
  in_translation: "In translation",
  in_checkin: "In check-in",
  closed: "Closed",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-slate-200 text-slate-800",
  assigned: "bg-emerald-100 text-emerald-800",
  in_translation: "bg-blue-100 text-blue-800",
  in_checkin: "bg-amber-100 text-amber-800",
  closed: "bg-emerald-100 text-emerald-800",
};

const inputClass =
  "w-full rounded-input border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20";
const labelClass = "mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500";
const btnPrimary =
  "inline-flex items-center justify-center rounded-input bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2";
const btnSecondary =
  "inline-flex items-center justify-center rounded-input border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function TranslatorPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TranslatorTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TranslatorTicket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
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
    if (detailId == null) {
      setDetail(null);
      setFiles([]);
      return;
    }
    setDetailLoading(true);
    trApi
      .getTicket(detailId)
      .then(setDetail)
      .catch(() => setDetail(null))
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

  async function loadEngineers() {
    const list = await trApi.engineers();
    setEngineers(list);
  }

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    setFileUploading(true);
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
    await trApi.assign(assignTicketId, selectedTranslatorId, selectedCheckinId);
    setModal(null);
    setAssignTicketId(null);
    load();
    if (detailId === assignTicketId) {
      trApi.getTicket(assignTicketId).then(setDetail);
    }
  }

  async function handleUploadOriginal(file: File) {
    if (!detailId) return;
    setFileUploading(true);
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
    try {
      const added = await trApi.addComment(detailId, newCommentBody.trim());
      setComments((prev) => [...prev, added]);
      setNewCommentBody("");
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function startTranslation() {
    if (!detailId) return;
    await trApi.startTranslation(detailId);
    load();
    trApi.getTicket(detailId).then(setDetail);
  }

  async function submitToCheckin() {
    if (!detailId) return;
    await trApi.submitToCheckin(detailId);
    load();
    trApi.getTicket(detailId).then(setDetail);
  }

  async function checkinApprove() {
    if (!detailId) return;
    await trApi.checkinApprove(detailId);
    load();
    setDetailId(null);
  }

  async function checkinReject() {
    if (!detailId) return;
    await trApi.checkinReject(detailId);
    load();
    trApi.getTicket(detailId).then(setDetail);
  }

  async function confirmByUser() {
    if (!detailId) return;
    await trApi.confirmByUser(detailId);
    load();
    trApi.getTicket(detailId).then(setDetail);
  }

  function downloadFile(file: TranslatorFile) {
    if (!detailId) return;
    trApi.downloadFile(detailId, file.id, file.file_name);
  }

  const originalFiles = files.filter((f) => f.file_category === "original");
  const translatedFiles = files.filter((f) => f.file_category === "translated");

  return (
    <div className="page-container">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="page-title">{t("nav.translator")}</h1>
        <button
          type="button"
          onClick={() => {
            setNewFiles([]);
            setModal("new");
          }}
          className={btnPrimary}
        >
          New request
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      {loading ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="min-w-[88px] px-3 py-3 sm:px-4">Key</th>
                <th className="px-3 py-3 sm:px-4">Summary</th>
                <th className="px-3 py-3 sm:px-4">Source → Target</th>
                <th className="px-3 py-3 sm:px-4">Requester</th>
                <th className="px-3 py-3 sm:px-4 whitespace-nowrap">Opened</th>
                <th className="px-3 py-3 sm:px-4">Translator</th>
                <th className="px-3 py-3 sm:px-4 whitespace-nowrap">Closed</th>
                <th className="px-3 py-3 sm:px-4">Check-in</th>
                <th className="px-3 py-3 sm:px-4 whitespace-nowrap">Closed</th>
                <th className="px-3 py-3 sm:px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr
                  key={ticket.id}
                  onClick={() => setDetailId(ticket.id)}
                  className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 last:border-0"
                >
                  <td className="min-w-[88px] px-3 py-3 sm:px-4 font-medium text-slate-500 whitespace-nowrap">
                    TR-{ticket.id}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-3 sm:px-4 font-medium text-slate-900" title={ticket.title}>
                    {ticket.title}
                  </td>
                  <td className="px-3 py-3 sm:px-4 text-slate-600">
                    {ticket.source_language} → {ticket.target_language}
                  </td>
                  <td className="truncate px-3 py-3 sm:px-4 text-slate-600 max-w-[120px]" title={ticket.created_by_name}>
                    {ticket.created_by_name ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 sm:px-4 text-slate-500 text-xs">
                    {formatDateUTC5(ticket.created_at)}
                  </td>
                  <td className="truncate px-3 py-3 sm:px-4 text-slate-500 max-w-[120px]">
                    {ticket.assigned_translator_name ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 sm:px-4 text-slate-500 text-xs">
                    {ticket.translator_submitted_at ? formatDateUTC5(ticket.translator_submitted_at) : "—"}
                  </td>
                  <td className="truncate px-3 py-3 sm:px-4 text-slate-500 max-w-[120px]">
                    {ticket.assigned_checkin_name ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 sm:px-4 text-slate-500 text-xs">
                    {ticket.closed_at ? formatDateUTC5(ticket.closed_at) : "—"}
                  </td>
                  <td className="px-3 py-3 sm:px-4">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[ticket.status] ?? "bg-slate-100 text-slate-700"}`}>
                      {STATUS_LABELS[ticket.status] ?? ticket.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                  {detailLoading ? "..." : detail ? `TR-${detail.id} — ${detail.title}` : "—"}
                </h2>
                {detail && (
                  <p className="mt-1 text-xs text-slate-500">
                    {detail.source_language} → {detail.target_language} · Created by {detail.created_by_name} ·{" "}
                    {formatDateUTC5(detail.created_at)}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => setDetailId(null)} className={btnSecondary}>
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {detailLoading && <p className="text-slate-500">{t("common.loading")}</p>}
              {detail && !detailLoading && (
                <div className="space-y-6">
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[detail.status] ?? "bg-slate-100 text-slate-700"}`}>
                      {STATUS_LABELS[detail.status] ?? detail.status}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {detail.source_language} → {detail.target_language}
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Requester / Opened</h3>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Requester</span>
                      <span className="font-medium text-slate-800">{detail.created_by_name ?? "—"}</span>
                    </div>
                    <div className="mt-2 flex justify-between text-sm">
                      <span className="text-slate-500">Opened</span>
                      <span className="font-medium text-slate-800">{formatDateUTC5(detail.created_at)}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-blue-800">Translator / Closed</h3>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Translator</span>
                      <span className="font-medium text-slate-800">{detail.assigned_translator_name ?? "—"}</span>
                    </div>
                    <div className="mt-2 flex justify-between text-sm">
                      <span className="text-slate-600">Closed</span>
                      <span className="font-medium text-slate-800">{detail.translator_submitted_at ? formatDateUTC5(detail.translator_submitted_at) : "—"}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-800">Check-in / Closed</h3>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Check-in</span>
                      <span className="font-medium text-slate-800">{detail.assigned_checkin_name ?? "—"}</span>
                    </div>
                    <div className="mt-2 flex justify-between text-sm">
                      <span className="text-slate-600">Closed</span>
                      <span className="font-medium text-slate-800">{detail.closed_at ? formatDateUTC5(detail.closed_at) : "—"}</span>
                    </div>
                  </div>

                  {detail.description && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Description</h3>
                      <p className="text-sm text-slate-700">{detail.description}</p>
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
                            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 min-h-[80px] resize-y"
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
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Files</h3>
                    {filesLoading ? (
                      <p className="text-slate-500">{t("common.loading")}</p>
                    ) : (
                      <div className="space-y-4">
                        {detail.status === "open" && detail.created_by_id === user?.id && (
                          <div>
                            <p className="mb-1 text-sm font-medium text-slate-600">Original files</p>
                            <input
                              type="file"
                              multiple
                              onChange={(e) => {
                                const f = e.target.files;
                                if (f) for (let i = 0; i < f.length; i++) handleUploadOriginal(f[i]);
                                e.target.value = "";
                              }}
                              disabled={fileUploading}
                              className="text-sm"
                            />
                          </div>
                        )}
                        {originalFiles.length > 0 && (
                          <div className="mb-4">
                            <p className="mb-2 text-xs font-medium text-slate-500">Original</p>
                            <ul className="space-y-2">
                              {originalFiles.map((f) => (
                                <li key={f.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-4 py-3 transition hover:bg-slate-50">
                                  <button type="button" onClick={() => downloadFile(f)} className="font-medium text-primary-600 hover:underline">
                                    {f.file_name}
                                  </button>
                                  <span className="text-xs text-slate-500">{formatFileSize(f.file_size)} · {f.uploaded_by_name}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {(detail.status === "assigned" || detail.status === "in_translation") &&
                          detail.assigned_translator_id === user?.id && (
                          <div>
                            <p className="mb-1 text-sm font-medium text-slate-600">Translated files</p>
                            <input
                              type="file"
                              multiple
                              onChange={(e) => {
                                const f = e.target.files;
                                if (f) for (let i = 0; i < f.length; i++) handleUploadTranslated(f[i]);
                                e.target.value = "";
                              }}
                              disabled={fileUploading}
                              className="text-sm"
                            />
                          </div>
                        )}
                        {translatedFiles.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-slate-500">Translated</p>
                            <ul className="space-y-2">
                              {translatedFiles.map((f) => (
                                <li key={f.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-4 py-3 transition hover:bg-slate-50">
                                  <button type="button" onClick={() => downloadFile(f)} className="font-medium text-primary-600 hover:underline">
                                    {f.file_name}
                                  </button>
                                  <span className="text-xs text-slate-500">{formatFileSize(f.file_size)} · {f.uploaded_by_name}</span>
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
                        Assign Translator + Check-in
                      </button>
                    )}
                    {isTranslator && detail.assigned_translator_id === user?.id && detail.status === "assigned" && (
                      <button type="button" onClick={startTranslation} className={btnPrimary}>
                        Start translation
                      </button>
                    )}
                    {isTranslator &&
                      detail.assigned_translator_id === user?.id &&
                      detail.status === "in_translation" &&
                      translatedFiles.length > 0 && (
                        <button type="button" onClick={submitToCheckin} className={btnPrimary}>
                          Submit to Check-in
                        </button>
                      )}
                    {isCheckin && detail.assigned_checkin_id === user?.id && detail.status === "in_checkin" && (
                      <>
                        <button type="button" onClick={checkinApprove} className={btnPrimary}>
                          Approve
                        </button>
                        <button type="button" onClick={checkinReject} className={btnSecondary}>
                          Reject
                        </button>
                      </>
                    )}
                    {detail.status === "closed" &&
                      detail.created_by_id === user?.id &&
                      !detail.confirmed_by_user_at && (
                        <button type="button" onClick={confirmByUser} className={btnPrimary}>
                          Confirm receipt
                        </button>
                      )}
                    {detail.status === "closed" && detail.confirmed_by_user_at && (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                        Confirmed {formatDateUTC5(detail.confirmed_by_user_at)}
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
            <h2 className="mb-4 text-lg font-semibold">New translation request</h2>
            <form onSubmit={createTicket} className="space-y-4">
              <div>
                <label className={labelClass}>Title</label>
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className={inputClass} required />
              </div>
              <div>
                <label className={labelClass}>Source language</label>
                <select value={newSource} onChange={(e) => setNewSource(e.target.value)} className={inputClass}>
                  {SOURCE_LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Target language</label>
                <select value={newTarget} onChange={(e) => setNewTarget(e.target.value)} className={inputClass}>
                  {TARGET_LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className={`${inputClass} min-h-[80px] resize-y`}
                  rows={3}
                />
              </div>
              <div>
                <label className={labelClass}>Original files</label>
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    const f = e.target.files;
                    if (f) setNewFiles(Array.from(f));
                  }}
                  className="text-sm"
                />
                {newFiles.length > 0 && (
                  <p className="mt-1 text-xs text-slate-600">{newFiles.length} file(s) selected</p>
                )}
              </div>
              <div className="flex gap-2">
                <button type="submit" className={btnPrimary} disabled={fileUploading}>
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
            onClick={() => { setModal(null); setAssignTicketId(null); }}
            aria-hidden
          />
          <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">Assign Translator + Check-in</h2>
            <div className="mb-4">
              <label className={labelClass}>Translator Engineer</label>
              <select
                value={selectedTranslatorId ?? ""}
                onChange={(e) => setSelectedTranslatorId(Number(e.target.value) || null)}
                className={inputClass}
              >
                <option value="">—</option>
                {engineers.filter((e) => e.role_type === "translator_engineer").map((eng) => (
                  <option key={eng.id} value={eng.id}>{eng.display_name}</option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className={labelClass}>Check-in Engineer</label>
              <select
                value={selectedCheckinId ?? ""}
                onChange={(e) => setSelectedCheckinId(Number(e.target.value) || null)}
                className={inputClass}
              >
                <option value="">—</option>
                {engineers.filter((e) => e.role_type === "checkin_engineer").map((eng) => (
                  <option key={eng.id} value={eng.id}>{eng.display_name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={doAssign}
                disabled={!selectedTranslatorId || !selectedCheckinId}
                className={btnPrimary}
              >
                {t("common.save")}
              </button>
              <button type="button" onClick={() => { setModal(null); setAssignTicketId(null); }} className={btnSecondary}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
