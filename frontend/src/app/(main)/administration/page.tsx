"use client";

import { useState, useEffect } from "react";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { administration as admApi, type AdmTicketBody, type FileAttachment } from "@/lib/api";
import { formatDateUTC5 } from "@/lib/dateUtils";
import PriorityBadge from "@/components/jira/PriorityBadge";
import StatusBadge from "@/components/jira/StatusBadge";

type Ticket = {
  id: number;
  ticket_type: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  created_by_id: number;
  created_by_name: string;
  assigned_engineer_id: number | null;
  requires_it: boolean;
  it_ticket_id: number | null;
  created_at: string;
  closed_at: string | null;
  meeting_booking: { room_id: number; subject: string; start_at: string; end_at: string } | null;
};

const TYPES = [
  { value: "service", key: "administration.service" },
  { value: "supply", key: "administration.supply" },
  { value: "meeting_room", key: "administration.meetingRoom" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export default function AdministrationPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [rooms, setRooms] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"new" | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string>("");
  const [comments, setComments] = useState<{ id: number; author_id: number; author_name: string; body: string; created_at: string | null }[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newCommentBody, setNewCommentBody] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [form, setForm] = useState({
    ticket_type: "service",
    title: "",
    description: "",
    priority: "medium",
    requires_it: false,
    room_id: 0,
    start_at: "",
    end_at: "",
  });

  const isEngineer = user?.roles?.some((r) => ["adm_engineer", "adm_ticket_engineer"].includes(r.role_type)) ?? false;

  async function load() {
    setLoading(true);
    try {
      const [tData, rData] = await Promise.all([admApi.tickets(), admApi.meetingRooms()]);
      setTickets(tData);
      setRooms(rData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (detailId == null) {
      setFiles([]);
      setComments([]);
      return;
    }
    setFilesLoading(true);
    setCommentsLoading(true);
    Promise.all([
      admApi.listFiles(detailId).catch(() => []),
      admApi.getComments(detailId).catch(() => []),
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

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    const body: AdmTicketBody = {
      ticket_type: form.ticket_type,
      title: form.title,
      description: form.description || undefined,
      priority: form.priority || "medium",
      requires_it: form.ticket_type === "meeting_room" ? form.requires_it : false,
    };
    if (form.ticket_type === "meeting_room") {
      if (!form.room_id || !form.start_at || !form.end_at) return;
      body.room_id = form.room_id;
      body.start_at = new Date(form.start_at).toISOString().slice(0, 19);
      body.end_at = new Date(form.end_at).toISOString().slice(0, 19);
    }
    await admApi.createTicket(body);
    setModal(null);
    setForm({ ticket_type: "service", title: "", description: "", priority: "medium", requires_it: false, room_id: 0, start_at: "", end_at: "" });
    load();
  }

  async function closeByEngineer(id: number) {
    await admApi.closeByEngineer(id);
    load();
  }

  async function rejectTicket(id: number) {
    if (!confirm("Are you sure you want to reject this ticket?")) return;
    await admApi.reject(id);
    load();
    if (detailId === id) {
      setDetailId(null);
    }
  }

  async function confirmByUser(id: number) {
    await admApi.confirmByUser(id);
    load();
  }

  async function submitComment() {
    if (!detailId || !newCommentBody.trim()) return;
    setCommentSubmitting(true);
    try {
      const added = await admApi.addComment(detailId, newCommentBody.trim());
      setComments((prev) => [...prev, added]);
      setNewCommentBody("");
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, ticketId: number) {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setFileUploading(true);
    try {
      const attachment = await admApi.uploadFile(ticketId, file);
      setFiles((prev) => [attachment, ...prev]);
      e.target.value = "";
    } catch (err) {
      alert(`Failed to upload file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setFileUploading(false);
    }
  }

  async function handleFileDownload(fileId: number, fileName: string) {
    if (!detailId) return;
    try {
      await admApi.downloadFile(detailId, fileId, fileName);
    } catch (err) {
      alert(`Failed to download file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  const filtered = filterType ? tickets.filter((x) => x.ticket_type === filterType) : tickets;
  const statusLabels: Record<string, string> = {
    open: t("it.open"),
    in_progress: "In progress",
    closed_by_engineer: t("it.closedByEngineer"),
    rejected: "Rejected",
    closed: t("it.closed"),
  };

  const detailTicket = detailId != null ? filtered.find((x) => x.id === detailId) : null;

  return (
    <div className="jira-page">
      <div className="jira-header">
        <h1 className="jira-title">{t("administration.title")}</h1>
        <button type="button" onClick={() => setModal("new")} className="btn-jira-primary">
          {t("administration.newTicket")}
        </button>
      </div>

      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setFilterType("")} className={!filterType ? "btn-jira-primary" : "btn-jira-secondary"}>
          All
        </button>
        {TYPES.map(({ value, key }) => (
          <button key={value} type="button" onClick={() => setFilterType(value)} className={filterType === value ? "btn-jira-primary" : "btn-jira-secondary"}>
            {t(key)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="ticket-cards">
            {filtered.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => setDetailId(ticket.id)}
                className="ticket-card w-full text-left"
              >
                <div className="ticket-card-header">
                  <span className="ticket-card-key">ADM-{ticket.id}</span>
                  <span className="text-xs text-slate-500">
                    {formatDateUTC5(ticket.created_at)}
                  </span>
                </div>
                <p className="ticket-card-title" title={ticket.title}>{ticket.title}</p>
                <div className="ticket-card-meta">
                  <span>{ticket.created_by_name ?? "—"}</span>
                  <span>{TYPES.find((x) => x.value === ticket.ticket_type) ? t(TYPES.find((x) => x.value === ticket.ticket_type)!.key) : ticket.ticket_type}</span>
                  {ticket.closed_at && (
                    <span>Closed {formatDateUTC5(ticket.closed_at)}</span>
                  )}
                </div>
                <div className="ticket-card-badges">
                  <PriorityBadge priority={ticket.priority || "medium"} />
                  <StatusBadge status={ticket.status} label={statusLabels[ticket.status]} />
                </div>
              </button>
            ))}
          </div>
          {/* Desktop: grid table */}
          <div className="jira-issue-list jira-issue-list--9col ticket-table-wrap">
            <div className="jira-issue-row jira-issue-row-header">
              <div>Key</div>
              <div>Summary</div>
              <div>Requester</div>
              <div>Time</div>
              <div>Type</div>
              <div>Priority</div>
              <div>Status</div>
              <div>Closed</div>
              <div />
            </div>
            {filtered.map((ticket) => (
              <div key={ticket.id} className="jira-issue-row" onClick={() => setDetailId(ticket.id)}>
                <div className="jira-issue-key">ADM-{ticket.id}</div>
                <div className="jira-issue-summary" title={ticket.title}>{ticket.title}</div>
                <div className="jira-issue-meta" title={ticket.created_by_name}>{ticket.created_by_name ?? "—"}</div>
                <div className="jira-issue-meta whitespace-nowrap text-[11px]">{formatDateUTC5(ticket.created_at)}</div>
                <div className="jira-issue-meta">{TYPES.find((x) => x.value === ticket.ticket_type) ? t(TYPES.find((x) => x.value === ticket.ticket_type)!.key) : ticket.ticket_type}</div>
                <div><PriorityBadge priority={ticket.priority || "medium"} /></div>
                <div><StatusBadge status={ticket.status} label={statusLabels[ticket.status]} /></div>
                <div className="jira-issue-meta whitespace-nowrap text-[11px]">{formatDateUTC5(ticket.closed_at)}</div>
                <div />
              </div>
            ))}
          </div>
        </>
      )}

      {detailId != null && detailTicket && (
        <>
          <div className="jira-drawer-backdrop" onClick={() => setDetailId(null)} />
          <div className="jira-drawer">
            <div className="jira-drawer-header">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div className="jira-drawer-title">ADM-{detailTicket.id} — {detailTicket.title}</div>
                  <div className="jira-drawer-meta">Created by {detailTicket.created_by_name} · {formatDateUTC5(detailTicket.created_at)}</div>
                </div>
                <button type="button" onClick={() => setDetailId(null)} className="btn-jira-secondary">×</button>
              </div>
            </div>
            <div className="jira-drawer-body space-y-6">
              <div className="flex flex-wrap gap-2">
                <PriorityBadge priority={detailTicket.priority || "medium"} />
                <StatusBadge status={detailTicket.status} label={statusLabels[detailTicket.status]} />
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {TYPES.find((x) => x.value === detailTicket.ticket_type) ? t(TYPES.find((x) => x.value === detailTicket.ticket_type)!.key) : detailTicket.ticket_type}
                </span>
                {detailTicket.requires_it && <span className="inline-flex items-center rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">+ IT</span>}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Description</h3>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{detailTicket.description || "No description."}</p>
              </div>
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
                        className="btn-jira-primary"
                      >
                        {commentSubmitting ? t("common.loading") : t("it.addComment")}
                      </button>
                    </div>
                  </>
                )}
              </div>
              {detailTicket.meeting_booking && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-800">{t("administration.meetingRoom")}</h3>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Time</span>
                    <span className="font-medium text-slate-800">
                      {formatDateUTC5(detailTicket.meeting_booking.start_at)} – {formatDateUTC5(detailTicket.meeting_booking.end_at)?.slice(11, 16)}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {isEngineer && detailTicket.status === "open" && (
                  <>
                    <button type="button" onClick={() => rejectTicket(detailTicket.id)} className="btn-jira-secondary" style={{ backgroundColor: "#de350b", color: "white", borderColor: "#de350b" }}>Reject</button>
                    <button type="button" onClick={() => closeByEngineer(detailTicket.id)} className="btn-jira-primary">{t("it.close")}</button>
                  </>
                )}
                {detailTicket.created_by_id === user?.id && detailTicket.status === "closed_by_engineer" && <button type="button" onClick={() => confirmByUser(detailTicket.id)} className="btn-jira-primary">{t("it.confirmClose")}</button>}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Attachments</h3>
                {filesLoading ? (
                  <p className="text-sm text-slate-500">Loading...</p>
                ) : (
                  <>
                    {files.length === 0 ? (
                      <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">No attachments</p>
                    ) : (
                      <ul className="mb-4 space-y-2">
                        {files.map((f) => (
                          <li key={f.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-4 py-3 transition hover:bg-slate-50">
                            <button type="button" onClick={() => handleFileDownload(f.id, f.file_name)} className="text-left font-medium text-primary-600 hover:underline">
                              {f.file_name}
                            </button>
                            <span className="text-xs text-slate-500">{formatFileSize(f.file_size)} · {f.uploaded_by_name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(isEngineer || detailTicket.created_by_id === user?.id) && (
                      <div className="mt-3">
                        <input
                          type="file"
                          id="adm-file-upload"
                          onChange={(e) => handleFileUpload(e, detailTicket.id)}
                          disabled={fileUploading}
                          style={{ display: "none" }}
                        />
                        <label
                          htmlFor="adm-file-upload"
                          className={`btn-jira-secondary inline-block ${fileUploading ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                        >
                          {fileUploading ? "Uploading..." : "Upload File"}
                        </label>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {modal === "new" && (
        <>
          <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-md" onClick={() => setModal(null)} />
          <div className="fixed left-1/2 top-1/2 z-[111] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 transform rounded-2xl bg-white shadow-2xl" style={{ maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-200 bg-gradient-to-r from-primary-50 to-primary-100 px-8 py-6">
              <h2 className="text-2xl font-bold text-slate-900">{t("administration.newTicket")}</h2>
              <p className="mt-1 text-sm text-slate-600">Create a new administration request</p>
            </div>
            <form onSubmit={createTicket} className="p-8 space-y-6">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Type</label>
                <select
                  value={form.ticket_type}
                  onChange={(e) => setForm((f) => ({ ...f, ticket_type: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                >
                  {TYPES.map(({ value, key }) => (
                    <option key={value} value={value}>{t(key)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("administration.subject")}</label>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20" required />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Priority</label>
                <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20">
                  {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("it.description")}</label>
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20" rows={3} />
              </div>
              {form.ticket_type === "meeting_room" && (
                <>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("administration.room")}</label>
                    <select
                      value={form.room_id}
                      onChange={(e) => setForm((f) => ({ ...f, room_id: Number(e.target.value) }))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      required
                    >
                      <option value={0}>—</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("administration.startTime")}</label>
                      <input
                        type="datetime-local"
                        value={form.start_at}
                        onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        required={form.ticket_type === "meeting_room"}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("administration.endTime")}</label>
                      <input
                        type="datetime-local"
                        value={form.end_at}
                        onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        required={form.ticket_type === "meeting_room"}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="requires_it"
                      checked={form.requires_it}
                      onChange={(e) => setForm((f) => ({ ...f, requires_it: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <label htmlFor="requires_it" className="text-sm font-medium text-slate-700">{t("administration.requiresIt")}</label>
                  </div>
                </>
              )}
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-6">
                <button type="button" onClick={() => setModal(null)} className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
                  {t("common.cancel")}
                </button>
                <button type="submit" className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
                  {t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
