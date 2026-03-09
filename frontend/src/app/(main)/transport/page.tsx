"use client";

import { useState, useEffect } from "react";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { transport as transportApi, type TransportApprover, type FileAttachment } from "@/lib/api";
import { formatDateUTC5 } from "@/lib/dateUtils";
import PriorityBadge from "@/components/jira/PriorityBadge";
import StatusBadge from "@/components/jira/StatusBadge";

type Ticket = {
  id: number;
  ticket_type: string;
  priority: string;
  from_location: string | null;
  destination: string;
  start_date: string | null;
  start_time: string | null;
  passenger_count: number;
  approximate_time: string | null;
  comment: string | null;
  status: string;
  created_by_id: number;
  created_by_name: string;
  requester_phone: string | null;
  approver_id: number | null;
  approver_name: string | null;
  manager_approved_at: string | null;
  hr_approved_at: string | null;
  car_id: number | null;
  driver_id: number | null;
  car_name: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  ready_at: string | null;
  closed_at: string | null;
  created_at: string;
};

const TYPES = [
  { value: "daily", key: "transport.daily" },
  { value: "overtime", key: "transport.overtime" },
  { value: "maxsus", key: "transport.maxsus" },
];

export default function TransportPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [pendingApproval, setPendingApproval] = useState<Ticket[]>([]);
  const [cars, setCars] = useState<{ id: number; name: string }[]>([]);
  const [drivers, setDrivers] = useState<{ id: number; name: string }[]>([]);
  const [approvers, setApprovers] = useState<TransportApprover[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"new" | "assign" | null>(null);
  const [assignTicketId, setAssignTicketId] = useState<number | null>(null);
  const [assignCarId, setAssignCarId] = useState<number | null>(null);
  const [assignDriverId, setAssignDriverId] = useState<number | null>(null);
  const [form, setForm] = useState({
    ticket_type: "daily",
    priority: "medium",
    from_location: "",
    destination: "",
    start_date: "",
    start_time: "",
    passenger_count: 1,
    approximate_time: "",
    comment: "",
    requester_phone: "",
  });
  const [selectedApproverId, setSelectedApproverId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [comments, setComments] = useState<{ id: number; author_id: number; author_name: string; body: string; created_at: string | null }[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newCommentBody, setNewCommentBody] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);

  const isTransportEngineer = user?.roles?.some((r) => r.role_type === "transport_engineer") ?? false;
  const isHrManager = user?.roles?.some((r) => r.role_type === "hr_manager") ?? false;

  async function load() {
    setLoading(true);
    try {
      const [myTickets, pending, carsData, driversData, approversData] = await Promise.all([
        transportApi.tickets(),
        transportApi.tickets({ pending_my_approval: true }),
        transportApi.cars(),
        transportApi.drivers(),
        transportApi.approvers(),
      ]);
      setTickets(myTickets);
      setPendingApproval(pending);
      setCars(carsData);
      setDrivers(driversData);
      setApprovers(approversData);
      console.log("Approvers loaded:", approversData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (modal === "new" && user?.phone_number && !form.requester_phone) {
      setForm((f) => ({ ...f, requester_phone: user.phone_number || "" }));
    }
  }, [modal, user?.phone_number]);

  useEffect(() => {
    if (detailId == null) {
      setFiles([]);
      setComments([]);
      return;
    }
    setFilesLoading(true);
    setCommentsLoading(true);
    Promise.all([
      transportApi.listFiles(detailId).catch(() => []),
      transportApi.getComments(detailId).catch(() => []),
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
    if (!selectedApproverId) {
      alert("Please select approver.");
      return;
    }
    await transportApi.createTicket({
      ticket_type: form.ticket_type,
      priority: form.priority || "medium",
      from_location: form.from_location || undefined,
      destination: form.destination,
      start_date: form.start_date || undefined,
      start_time: form.start_time || undefined,
      passenger_count: form.passenger_count,
      approximate_time: form.approximate_time || undefined,
      comment: form.comment || undefined,
      approver_id: selectedApproverId,
      requester_phone: form.requester_phone || undefined,
    });
    setModal(null);
    setForm({ ticket_type: "daily", priority: "medium", from_location: "", destination: "", start_date: "", start_time: "", passenger_count: 1, approximate_time: "", comment: "", requester_phone: "" });
    setSelectedApproverId(null);
    load();
  }

  async function managerApprove(id: number) {
    await transportApi.managerApprove(id);
    load();
  }

  async function hrApprove(id: number) {
    await transportApi.hrApprove(id);
    load();
  }

  function openAssignModal(id: number) {
    setAssignTicketId(id);
    setAssignCarId(null);
    setAssignDriverId(null);
    setModal("assign");
  }

  async function doAssign() {
    if (!assignTicketId || !assignCarId || !assignDriverId) return;
    await transportApi.assign(assignTicketId, assignCarId, assignDriverId);
    setModal(null);
    setAssignTicketId(null);
    load();
  }

  async function closeByEngineer(id: number) {
    await transportApi.closeByEngineer(id);
    load();
  }

  async function confirmByUser(id: number) {
    await transportApi.confirmByUser(id);
    load();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, ticketId: number) {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setFileUploading(true);
    try {
      const attachment = await transportApi.uploadFile(ticketId, file);
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
      await transportApi.downloadFile(detailId, fileId, fileName);
    } catch (err) {
      alert(`Failed to download file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function submitComment() {
    if (!detailId || !newCommentBody.trim()) return;
    setCommentSubmitting(true);
    try {
      const added = await transportApi.addComment(detailId, newCommentBody.trim());
      setComments((prev) => [...prev, added]);
      setNewCommentBody("");
    } finally {
      setCommentSubmitting(false);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  const canAssign = (t: Ticket) => {
    if (t.ticket_type === "daily") return t.status === "open" || t.status === "manager_approved" || t.status === "approved";
    return t.status === "hr_approved";
  };

  const statusLabels: Record<string, string> = {
    open: t("it.open"),
    manager_approved: t("transport.managerApprove") + " ✓",
    hr_approved: t("transport.hrApprove") + " ✓",
    approved: "Approved",
    assigned: "Assigned",
    closed: t("it.closed"),
  };

  const detailTicket = detailId != null ? (tickets.find((x) => x.id === detailId) ?? pendingApproval.find((x) => x.id === detailId) ?? null) : null;

  return (
    <div className="jira-page">
      <div className="jira-header">
        <h1 className="jira-title">{t("transport.title")}</h1>
        <button type="button" onClick={() => setModal("new")} className="btn-jira-primary">New request</button>
      </div>

      {pendingApproval.length > 0 && (
        <div className="jira-issue-list" style={{ marginBottom: 24 }}>
          <div className="jira-drawer-meta" style={{ padding: "12px 16px", fontWeight: 600 }}>{t("transport.pendingApproval")}</div>
          {pendingApproval.map((ticket) => (
            <div key={ticket.id} className="jira-issue-row" style={{ justifyContent: "space-between" }}>
              <span>TRN-{ticket.id} {ticket.destination} — {ticket.created_by_name}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); managerApprove(ticket.id); }} className="btn-jira-primary" style={{ padding: "4px 12px" }}>Approve</button>
            </div>
          ))}
        </div>
      )}

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
                  <span className="ticket-card-key">TRN-{ticket.id}</span>
                  <span className="text-xs text-slate-500">
                    {formatDateUTC5(ticket.created_at)}
                  </span>
                </div>
                <p className="ticket-card-title" title={ticket.destination}>{ticket.destination}</p>
                <div className="ticket-card-meta">
                  <span>{ticket.created_by_name ?? "—"}</span>
                  <span>{TYPES.find((x) => x.value === ticket.ticket_type) ? t(TYPES.find((x) => x.value === ticket.ticket_type)!.key) : ticket.ticket_type}</span>
                  {ticket.closed_at && (
                    <span>Closed {formatDateUTC5(ticket.closed_at)}</span>
                  )}
                  {ticket.car_name && <span>{ticket.car_name} / {ticket.driver_name}</span>}
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
              <div>Car/Driver</div>
            </div>
            {tickets.map((ticket) => (
              <div key={ticket.id} className="jira-issue-row" onClick={() => setDetailId(ticket.id)}>
                <div className="jira-issue-key">TRN-{ticket.id}</div>
                <div className="jira-issue-summary" title={ticket.destination}>{ticket.destination}</div>
                <div className="jira-issue-meta" title={ticket.created_by_name}>{ticket.created_by_name ?? "—"}</div>
                <div className="jira-issue-meta whitespace-nowrap text-[11px]">{formatDateUTC5(ticket.created_at)}</div>
                <div className="jira-issue-meta">{TYPES.find((x) => x.value === ticket.ticket_type) ? t(TYPES.find((x) => x.value === ticket.ticket_type)!.key) : ticket.ticket_type}</div>
                <div><PriorityBadge priority={ticket.priority || "medium"} /></div>
                <div><StatusBadge status={ticket.status} label={statusLabels[ticket.status]} /></div>
                <div className="jira-issue-meta whitespace-nowrap text-[11px]">{formatDateUTC5(ticket.closed_at)}</div>
                <div className="jira-issue-meta">{ticket.car_name ? `${ticket.car_name} / ${ticket.driver_name}` : "—"}</div>
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
                  <div className="jira-drawer-title">TRN-{detailTicket.id} — {detailTicket.destination}</div>
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
              </div>

              {/* Route */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <span className="text-base">📍</span> {t("transport.destination")}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {detailTicket.from_location && (
                    <div>
                      <p className="text-xs text-slate-500">{t("transport.from", "From")}</p>
                      <p className="font-medium text-slate-800">{detailTicket.from_location}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-slate-500">{t("transport.destination")}</p>
                    <p className="font-medium text-slate-800">{detailTicket.destination}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{t("transport.passengers")}</p>
                    <p className="font-medium text-slate-800">{detailTicket.passenger_count}</p>
                  </div>
                  {detailTicket.start_date && (
                    <div>
                      <p className="text-xs text-slate-500">{t("transport.startDate")}</p>
                      <p className="font-medium text-slate-800">
                        {detailTicket.start_date?.slice(0, 10) || "—"}
                        {detailTicket.start_time ? ` · ${detailTicket.start_time}` : ""}
                      </p>
                    </div>
                  )}
                  {detailTicket.approximate_time && (
                    <div>
                      <p className="text-xs text-slate-500">{t("transport.approximateTime", "Approximately using time")}</p>
                      <p className="font-medium text-slate-800">{detailTicket.approximate_time}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Contact — User & Driver phones */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
                  <span className="text-base">📞</span> {t("transport.contacts", "Contacts")}
                </h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-600">Requester</p>
                    <p className="font-medium text-slate-800">{detailTicket.created_by_name}</p>
                    {detailTicket.requester_phone ? (
                      <a href={`tel:${detailTicket.requester_phone}`} className="mt-1 block text-base font-semibold text-emerald-700 hover:text-emerald-800">
                        {detailTicket.requester_phone}
                      </a>
                    ) : (
                      <p className="mt-1 text-base font-medium text-slate-500">—</p>
                    )}
                  </div>
                  {detailTicket.driver_name && (
                    <div className="border-t border-emerald-200/60 pt-3">
                      <p className="text-xs text-slate-600">{t("transport.driver")}</p>
                      <p className="font-medium text-slate-800">{detailTicket.driver_name}</p>
                      {detailTicket.driver_phone ? (
                        <a href={`tel:${detailTicket.driver_phone}`} className="mt-1 block text-base font-semibold text-emerald-700 hover:text-emerald-800">
                          {detailTicket.driver_phone}
                        </a>
                      ) : (
                        <p className="mt-1 text-base font-medium text-slate-500">—</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Approvals */}
              {(detailTicket.approver_name || detailTicket.manager_approved_at || detailTicket.hr_approved_at) && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <span className="text-base">✓</span> Approvals
                  </h3>
                  <div className="space-y-2">
                    {detailTicket.approver_name && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Approver</span>
                        <span className="font-medium text-slate-800">{detailTicket.approver_name}</span>
                      </div>
                    )}
                    {detailTicket.manager_approved_at && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Manager</span>
                        <span className="font-medium text-slate-800">{formatDateUTC5(detailTicket.manager_approved_at)}</span>
                      </div>
                    )}
                    {detailTicket.hr_approved_at && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">HR</span>
                        <span className="font-medium text-slate-800">{formatDateUTC5(detailTicket.hr_approved_at)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Vehicle */}
              {detailTicket.car_name && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-800">
                    <span className="text-base">🚗</span> {t("transport.car")}
                  </h3>
                  <div className="flex flex-wrap gap-4">
                    <div>
                      <p className="text-xs text-slate-600">{t("transport.car")}</p>
                      <p className="font-semibold text-slate-800">{detailTicket.car_name}</p>
                    </div>
                    {detailTicket.driver_name && (
                      <div>
                        <p className="text-xs text-slate-600">{t("transport.driver")}</p>
                        <p className="font-semibold text-slate-800">{detailTicket.driver_name}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Status timeline */}
              {detailTicket.closed_at && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Closed</span>
                    <span className="font-medium text-slate-800">{formatDateUTC5(detailTicket.closed_at)}</span>
                  </div>
                </div>
              )}

              {/* Comments */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("it.comments")}</h3>
                {detailTicket.comment && (
                  <p className="mb-3 whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-sm text-slate-700 border border-slate-100">
                    <span className="text-xs text-slate-500">{detailTicket.created_by_name} (initial):</span><br />
                    {detailTicket.comment}
                  </p>
                )}
                {commentsLoading ? (
                  <p className="text-sm text-slate-500">{t("common.loading")}</p>
                ) : (
                  <>
                    <ul className="mb-4 space-y-3">
                      {comments.length === 0 && !detailTicket.comment ? (
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
              <div className="mt-6 flex flex-wrap gap-2">
                {detailTicket.status === "open" && detailTicket.created_by_id !== user?.id && <button type="button" onClick={() => managerApprove(detailTicket.id)} className="btn-jira-primary">Manager approve</button>}
                {isHrManager && detailTicket.status === "manager_approved" && ["overtime", "maxsus"].includes(detailTicket.ticket_type) && <button type="button" onClick={() => hrApprove(detailTicket.id)} className="btn-jira-primary">HR approve</button>}
                {isTransportEngineer && canAssign(detailTicket) && <button type="button" onClick={() => openAssignModal(detailTicket.id)} className="btn-jira-secondary">Assign car/driver</button>}
                {isTransportEngineer && detailTicket.status === "assigned" && <button type="button" onClick={() => closeByEngineer(detailTicket.id)} className="btn-jira-primary">Close</button>}
                {detailTicket.created_by_id === user?.id && detailTicket.status === "assigned" && <button type="button" onClick={() => confirmByUser(detailTicket.id)} className="btn-jira-primary">Confirm</button>}
              </div>
              <div className="mt-6 border-t border-slate-200 pt-6">
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
                          <li key={f.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 transition hover:bg-slate-100">
                            <button
                              type="button"
                              onClick={() => handleFileDownload(f.id, f.file_name)}
                              className="text-left font-medium text-primary-600 hover:underline"
                            >
                              {f.file_name}
                            </button>
                            <span className="text-xs text-slate-500">
                              {formatFileSize(f.file_size)} · {f.uploaded_by_name}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <input
                      type="file"
                      id="transport-file-upload"
                      onChange={(e) => handleFileUpload(e, detailTicket.id)}
                      disabled={fileUploading}
                      style={{ display: "none" }}
                    />
                    <label
                      htmlFor="transport-file-upload"
                      className={`btn-jira-secondary inline-block cursor-pointer ${fileUploading ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      {fileUploading ? "Uploading..." : "Upload File"}
                    </label>
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
              <h2 className="text-2xl font-bold text-slate-900">New transport request</h2>
              <p className="mt-1 text-sm text-slate-600">Request a vehicle for your trip</p>
            </div>
            <form onSubmit={createTicket} className="p-8 space-y-6">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Type</label>
                <select value={form.ticket_type} onChange={(e) => setForm((f) => ({ ...f, ticket_type: e.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20">
                  {TYPES.map(({ value, key }) => <option key={value} value={value}>{t(key)}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Approver (your department)</label>
                <select
                  value={selectedApproverId ?? ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setSelectedApproverId(Number.isNaN(v) || v === 0 ? null : v);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  required
                >
                  <option value="">— Select approver —</option>
                  {approvers.length === 0 ? (
                    <option value="" disabled>No approvers available (check department assignment)</option>
                  ) : (
                    approvers.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.display_name}{a.is_manager ? " (Manager)" : ""}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("common.requesterPhone")}</label>
                <input type="tel" value={form.requester_phone} onChange={(e) => setForm((f) => ({ ...f, requester_phone: e.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20" placeholder={t("common.requesterPhonePlaceholder")} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("transport.from", "From")}</label>
                <input value={form.from_location} onChange={(e) => setForm((f) => ({ ...f, from_location: e.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20" placeholder={t("transport.fromPlaceholder", "Where are you leaving from?")} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("transport.destination")}</label>
                <input value={form.destination} onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20" required />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("transport.passengers")}</label>
                <input type="number" min={1} value={form.passenger_count} onChange={(e) => setForm((f) => ({ ...f, passenger_count: Number(e.target.value) || 1 }))} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("transport.startDate", "Start date")}</label>
                  <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("transport.startTime", "Start time")} (24H)</label>
                  <input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("transport.approximateTime", "Approximately using time")}</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  {[
                    { value: "30m", label: "30m" },
                    { value: "1h", label: "1h" },
                    { value: "1h 30m", label: "1h 30m" },
                    { value: "2h", label: "2h" },
                    { value: "and more", label: t("transport.andMore", "and more") },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, approximate_time: f.approximate_time === opt.value ? "" : opt.value }))}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "4px",
                        border: `1px solid ${form.approximate_time === opt.value ? "#0052CC" : "#dfe1e6"}`,
                        background: form.approximate_time === opt.value ? "#0052CC" : "white",
                        color: form.approximate_time === opt.value ? "white" : "#172b4d",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: form.approximate_time === opt.value ? 500 : 400,
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        if (form.approximate_time !== opt.value) {
                          e.currentTarget.style.borderColor = "#0052CC";
                          e.currentTarget.style.background = "#f4f5f7";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (form.approximate_time !== opt.value) {
                          e.currentTarget.style.borderColor = "#dfe1e6";
                          e.currentTarget.style.background = "white";
                        }
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("transport.comment")}</label>
                <textarea value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20" rows={3} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Priority</label>
                <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
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

      {modal === "assign" && assignTicketId && (
        <>
          <div className="jira-drawer-backdrop" onClick={() => { setModal(null); setAssignTicketId(null); }} style={{ zIndex: 110 }} />
          <div style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: "100%", maxWidth: 400, background: "var(--jira-bg-elevated)", borderRadius: "var(--jira-radius-lg)", boxShadow: "var(--jira-shadow-lg)", padding: 24, zIndex: 111 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Assign car & driver</h2>
            <div style={{ marginBottom: 12 }}><label className="jira-field-label">{t("transport.car")}</label><select value={assignCarId ?? ""} onChange={(e) => setAssignCarId(Number(e.target.value) || null)} className="jira-select"><option value="">—</option>{cars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div style={{ marginBottom: 16 }}><label className="jira-field-label">{t("transport.driver")}</label><select value={assignDriverId ?? ""} onChange={(e) => setAssignDriverId(Number(e.target.value) || null)} className="jira-select"><option value="">—</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div style={{ display: "flex", gap: 8 }}><button type="button" onClick={async () => { await doAssign(); setDetailId(null); }} disabled={!assignCarId || !assignDriverId} className="btn-jira-primary">{t("common.save")}</button><button type="button" onClick={() => { setModal(null); setAssignTicketId(null); }} className="btn-jira-secondary">{t("common.cancel")}</button></div>
          </div>
        </>
      )}
    </div>
  );
}
