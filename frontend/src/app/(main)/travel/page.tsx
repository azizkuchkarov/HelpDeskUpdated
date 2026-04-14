"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { travel as travelApi, type FileAttachment, type TravelPlace, type TravelStatCurrency } from "@/lib/api";
import {
  formatDateUTC5,
  getYearMonthKeyUTC5,
  getCurrentYearMonthKeyUTC5,
  formatMonthHeadingUTC5,
} from "@/lib/dateUtils";
import PriorityBadge from "@/components/jira/PriorityBadge";
import StatusBadge from "@/components/jira/StatusBadge";

type Segment = { source: string; destination: string; date?: string; time?: string };
type Ticket = {
  id: number;
  source_destination_json: string;
  comment: string | null;
  priority: string;
  status: string;
  book_hotel?: boolean;
  created_by_id: number;
  created_by_name: string;
  created_at: string;
  closed_at: string | null;
};
type Stat = {
  id: number;
  travel_ticket_id: number;
  username: string | null;
  source_destination: string;
  date_time: string;
  company: string;
  price: number | null;
  currency: TravelStatCurrency;
  created_at: string;
};

type TravelMonthSection = {
  key: string;
  yearMonth: string;
  variant: "currentClosed" | "archive";
  tickets: Ticket[];
};

type TravelStatsMonthSection = {
  key: string;
  yearMonth: string;
  items: Stat[];
};

export default function TravelPage() {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"tickets" | "stats">("tickets");
  const [modal, setModal] = useState<"new" | "stat" | "edit-stat" | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [comments, setComments] = useState<{ id: number; author_id: number; author_name: string; body: string; created_at: string | null }[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newCommentBody, setNewCommentBody] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([{ source: "", destination: "", date: "", time: "" }]);
  const [comment, setComment] = useState("");
  const [priority, setPriority] = useState("medium");
  const [bookHotel, setBookHotel] = useState(false);
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [statForm, setStatForm] = useState<{
    travel_ticket_id: number;
    username: string;
    mode: "total" | "segment";
    total: { company: string; price: number; currency: TravelStatCurrency };
    segments: Array<{
      source: string;
      destination: string;
      date: string;
      time: string;
      company: string;
      price: number;
      currency: TravelStatCurrency;
    }>;
  }>({
    travel_ticket_id: 0,
    username: "",
    mode: "total",
    total: { company: "", price: 0, currency: "UZS" },
    segments: [],
  });
  const [editingStat, setEditingStat] = useState<Stat | null>(null);
  const [editStatForm, setEditStatForm] = useState<{ company: string; price: number; currency: TravelStatCurrency }>({
    company: "",
    price: 0,
    currency: "UZS",
  });
  const [placeSuggestions, setPlaceSuggestions] = useState<TravelPlace[]>([]);
  const [placeSuggestOpen, setPlaceSuggestOpen] = useState<{ segmentIndex: number; field: "source" | "destination" } | null>(null);
  const placeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({});
  const [openStatsAccordions, setOpenStatsAccordions] = useState<Record<string, boolean>>({});

  const isTicketEngineer = user?.roles?.some((r) => r.role_type === "adm_ticket_engineer") ?? false;
  const isHotelEngineer = user?.roles?.some((r) => r.role_type === "hotel_engineer") ?? false;
  const canSeeStats = isTicketEngineer || (user?.roles?.some((r) => ["adm_manager", "adm_monitoring_manager"].includes(r.role_type)) ?? false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tData, sData] = await Promise.all([
        travelApi.tickets(),
        canSeeStats ? travelApi.stats().catch(() => []) : Promise.resolve([]),
      ]);
      setTickets(tData);
      setStats(sData);
    } finally {
      setLoading(false);
    }
  }, [canSeeStats]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (detailId == null) {
      setFiles([]);
      setComments([]);
      return;
    }
    setFilesLoading(true);
    setCommentsLoading(true);
    Promise.all([
      travelApi.listFiles(detailId).catch(() => []),
      travelApi.getComments(detailId).catch(() => []),
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

  // Debounced GeoNames place search for source/destination
  useEffect(() => {
    if (placeSuggestOpen == null) {
      setPlaceSuggestions([]);
      return;
    }
    const seg = segments[placeSuggestOpen.segmentIndex];
    const value = placeSuggestOpen.field === "source" ? seg?.source : seg?.destination;
    if (!value || value.trim().length < 2) {
      setPlaceSuggestions([]);
      return;
    }
    if (placeDebounceRef.current) clearTimeout(placeDebounceRef.current);
    placeDebounceRef.current = setTimeout(() => {
      placeDebounceRef.current = null;
      travelApi.places(value.trim()).then(setPlaceSuggestions).catch(() => setPlaceSuggestions([]));
    }, 300);
    return () => {
      if (placeDebounceRef.current) clearTimeout(placeDebounceRef.current);
    };
  }, [placeSuggestOpen, segments]);

  function addSegment() {
    setSegments((s) => [...s, { source: "", destination: "", date: "", time: "" }]);
  }

  function removeSegment(i: number) {
    setSegments((s) => s.filter((_, idx) => idx !== i));
  }

  function updateSegment(i: number, field: keyof Segment, value: string) {
    setSegments((s) => s.map((seg, idx) => (idx === i ? { ...seg, [field]: value } : seg)));
  }

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    const segs = segments.filter((s) => s.source.trim() || s.destination.trim()).map((s) => ({
      source: s.source.trim(),
      destination: s.destination.trim(),
      date: s.date || undefined,
      time: s.time || undefined,
    }));
    if (!segs.length) return;
    
    // Create ticket first
    const result = await travelApi.createTicket(segs, comment || undefined, priority, bookHotel);
    const ticketId = result.id;
    
    // Upload files if any
    if (filesToUpload.length > 0) {
      setFileUploading(true);
      try {
        await Promise.all(filesToUpload.map((file) => travelApi.uploadFile(ticketId, file)));
      } catch (err) {
        console.error("Failed to upload some files:", err);
        alert(`Ticket created but some files failed to upload: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setFileUploading(false);
      }
    }
    
    setModal(null);
    setSegments([{ source: "", destination: "", date: "", time: "" }]);
    setComment("");
    setPriority("medium");
    setBookHotel(false);
    setFilesToUpload([]);
    load();
  }

  async function closeTicket(id: number, asHotelEngineer?: boolean) {
    if (!asHotelEngineer) {
      const ticketStats = stats.filter(s => s.travel_ticket_id === id);
      if (ticketStats.length === 0) {
        alert("Cannot close ticket without adding at least one ticket stat. Please add ticket stat first.");
        return;
      }
    }
    try {
      await travelApi.close(id);
      load();
    } catch (err) {
      alert(`Failed to close ticket: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function rejectTicket(id: number) {
    if (!confirm("Are you sure you want to reject this ticket?")) return;
    await travelApi.reject(id);
    load();
    if (detailId === id) {
      setDetailId(null);
    }
  }

  async function createStat(e: React.FormEvent) {
    e.preventDefault();
    let createdCount = 0;
    if (statForm.mode === "total") {
      if (!statForm.total.company || !statForm.total.price) {
        alert("Company va price kiriting.");
        return;
      }
      const route = statForm.segments.map((s) => `${s.source} → ${s.destination}`).join(" | ");
      const dateTime = statForm.segments
        .map((s) => `${s.date}${s.time ? " " + s.time : ""}`.trim())
        .filter(Boolean)
        .join(" | ");
      await travelApi.createStat({
        travel_ticket_id: statForm.travel_ticket_id,
        username: statForm.username,
        source_destination: route || "—",
        date_time: dateTime || "—",
        company: statForm.total.company,
        price: statForm.total.price,
        currency: statForm.total.currency,
      });
      createdCount = 1;
    } else {
      for (const segment of statForm.segments) {
        if (!segment.company || !segment.price) continue;
        await travelApi.createStat({
          travel_ticket_id: statForm.travel_ticket_id,
          username: statForm.username,
          source_destination: `${segment.source} → ${segment.destination}`,
          date_time: `${segment.date}${segment.time ? " " + segment.time : ""}`,
          company: segment.company,
          price: segment.price,
          currency: segment.currency,
        });
        createdCount += 1;
      }
      if (createdCount === 0) {
        alert("Segmentlar uchun kamida bitta company va price kiriting.");
        return;
      }
    }
    setModal(null);
    setStatForm({ travel_ticket_id: 0, username: "", mode: "total", total: { company: "", price: 0, currency: "UZS" }, segments: [] });
    // Reload both tickets and stats
    await load();
  }

  function openEditStatModal(stat: Stat) {
    setEditingStat(stat);
    setEditStatForm({
      company: stat.company,
      price: stat.price || 0,
      currency: stat.currency || "UZS",
    });
    setModal("edit-stat");
  }

  async function updateStat(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStat) return;
    await travelApi.updateStat(editingStat.id, {
      company: editStatForm.company,
      price: editStatForm.price,
      currency: editStatForm.currency,
    });
    setModal(null);
    setEditingStat(null);
    setEditStatForm({ company: "", price: 0, currency: "UZS" });
    // Reload both tickets and stats
    await load();
  }

  const parseSegments = (json: string): Segment[] => {
    try {
      const arr = JSON.parse(json);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };

  function ticketSummary(ticket: Ticket): string {
    const segs = parseSegments(ticket.source_destination_json);
    return segs.map((s) => `${s.source} → ${s.destination}`).join(" · ") || "—";
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, ticketId: number) {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setFileUploading(true);
    try {
      const attachment = await travelApi.uploadFile(ticketId, file);
      setFiles((prev) => [attachment, ...prev]);
      e.target.value = "";
    } catch (err) {
      alert(`Failed to upload file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setFileUploading(false);
    }
  }

  async function submitComment() {
    if (!detailId || !newCommentBody.trim()) return;
    setCommentSubmitting(true);
    try {
      const added = await travelApi.addComment(detailId, newCommentBody.trim());
      setComments((prev) => [...prev, added]);
      setNewCommentBody("");
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function handleFileDownload(fileId: number, fileName: string) {
    if (!detailId) return;
    try {
      await travelApi.downloadFile(detailId, fileId, fileName);
    } catch (err) {
      alert(`Failed to download file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  const detailTicket = detailId != null ? tickets.find((t) => t.id === detailId) : null;
  const statusLabels: Record<string, string> = { open: "Open", closed: "Closed", rejected: "Rejected" };

  const { currentMonthKey, currentMonthOpen, monthSections } = useMemo(() => {
    const byMonth = new Map<string, Ticket[]>();
    for (const ticket of tickets) {
      const key = getYearMonthKeyUTC5(ticket.created_at);
      if (!key) continue;
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(ticket);
    }
    const sortDesc = (a: Ticket, b: Ticket) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    const currentKey = getCurrentYearMonthKeyUTC5();
    const currentOpen = (byMonth.get(currentKey) ?? [])
      .filter((x) => x.status !== "closed")
      .sort(sortDesc);
    const sortedKeys = Array.from(byMonth.keys()).sort((a, b) => b.localeCompare(a));
    const sections: TravelMonthSection[] = [];
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

  const { currentStatsMonthKey, statsMonthSections } = useMemo(() => {
    const byMonth = new Map<string, Stat[]>();
    for (const stat of stats) {
      const key = getYearMonthKeyUTC5(stat.created_at);
      if (!key) continue;
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(stat);
    }
    const sortDesc = (a: Stat, b: Stat) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    const currentKey = getCurrentYearMonthKeyUTC5();
    const sortedKeys = Array.from(byMonth.keys()).sort((a, b) => b.localeCompare(a));
    const sections: TravelStatsMonthSection[] = sortedKeys.map((mk) => ({
      key: `s-${mk}`,
      yearMonth: mk,
      items: [...(byMonth.get(mk) ?? [])].sort(sortDesc),
    }));
    return {
      currentStatsMonthKey: currentKey,
      statsMonthSections: sections,
    };
  }, [stats]);

  const toggleAccordion = useCallback((key: string) => {
    setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleStatsAccordion = useCallback((key: string) => {
    setOpenStatsAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  function renderTicketsList(list: Ticket[]) {
    return (
      <>
        <div className="ticket-cards">
          {list.map((ticket) => {
            const segs = parseSegments(ticket.source_destination_json);
            const summary = segs.length ? `${segs[0].source} → ${segs[0].destination}${segs.length > 1 ? " …" : ""}` : "—";
            return (
              <button
                key={ticket.id}
                type="button"
                onClick={() => setDetailId(ticket.id)}
                className="ticket-card w-full text-left"
              >
                <div className="ticket-card-header">
                  <span className="ticket-card-key">TRV-{ticket.id}</span>
                  <span className="text-xs text-slate-500">
                    {formatDateUTC5(ticket.created_at)}
                  </span>
                </div>
                <p className="ticket-card-title">{summary}</p>
                <div className="ticket-card-meta">
                  <span>{ticket.created_by_name ?? "—"}</span>
                  {ticket.closed_at && (
                    <span>Closed {formatDateUTC5(ticket.closed_at)}</span>
                  )}
                </div>
                <div className="ticket-card-badges">
                  <PriorityBadge priority={ticket.priority || "medium"} />
                  <StatusBadge status={ticket.status} label={statusLabels[ticket.status] || ticket.status} />
                  {ticket.book_hotel && <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">Hotel</span>}
                </div>
              </button>
            );
          })}
        </div>
        <div className="jira-issue-list jira-issue-list--7col ticket-table-wrap">
          <div className="jira-issue-row jira-issue-row-header">
            <span>Key</span>
            <span>Summary</span>
            <span>Requester</span>
            <span>Time</span>
            <span>Priority</span>
            <span>Status</span>
            <span>Closed</span>
          </div>
          {list.map((ticket) => {
            const segs = parseSegments(ticket.source_destination_json);
            return (
              <div
                key={ticket.id}
                className="jira-issue-row"
                onClick={() => setDetailId(ticket.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setDetailId(ticket.id)}
              >
                <span className="jira-issue-key">TRV-{ticket.id}</span>
                <span className="jira-issue-summary">{segs.length ? `${segs[0].source} → ${segs[0].destination}${segs.length > 1 ? " …" : ""}` : "—"}</span>
                <span className="jira-issue-meta" title={ticket.created_by_name}>{ticket.created_by_name ?? "—"}</span>
                <span className="jira-issue-meta whitespace-nowrap text-[11px]">{formatDateUTC5(ticket.created_at)}</span>
                <span className="flex items-center gap-1 flex-wrap"><PriorityBadge priority={ticket.priority || "medium"} />{ticket.book_hotel && <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">Hotel</span>}</span>
                <span><StatusBadge status={ticket.status} label={statusLabels[ticket.status] || ticket.status} /></span>
                <span className="jira-issue-meta whitespace-nowrap text-[11px]">{formatDateUTC5(ticket.closed_at)}</span>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <div className="jira-page">
      <div className="jira-page-header">
        <h1 className="jira-page-title">{t("travel.title")}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setTab("tickets")} className={tab === "tickets" ? "btn-jira-primary" : "btn-jira-secondary"}>Tickets</button>
          {canSeeStats && <button type="button" onClick={() => setTab("stats")} className={tab === "stats" ? "btn-jira-primary" : "btn-jira-secondary"}>{t("travel.stats")}</button>}
          <button type="button" onClick={() => setModal("new")} className="btn-jira-primary">New request</button>
        </div>
      </div>

      {loading ? (
        <p className="jira-muted">{t("common.loading")}</p>
      ) : tab === "tickets" ? (
        <>
          <div className="space-y-4">
            <section className="it-list-shell overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              <div className="border-b border-slate-200/80 bg-gradient-to-r from-slate-50/90 to-white px-4 py-3 sm:px-5">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                  {t("travel.activeThisMonth")}
                </h2>
                <p className="mt-1 text-xs text-slate-600 sm:text-sm">
                  {currentMonthKey ? formatMonthHeadingUTC5(currentMonthKey, locale) : ""}
                </p>
              </div>
              <div className="p-3 sm:p-4">
                {currentMonthOpen.length === 0 ? (
                  <p className="py-6 text-center text-sm leading-relaxed text-slate-500">
                    {t("travel.noActiveThisMonth")}
                  </p>
                ) : (
                  renderTicketsList(currentMonthOpen)
                )}
              </div>
            </section>

            {monthSections.map((section) => {
              const isOpen = !!openAccordions[section.key];
              const heading =
                section.variant === "currentClosed"
                  ? `${formatMonthHeadingUTC5(section.yearMonth, locale)} — ${t("travel.closedLabel")}`
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
                    aria-label={isOpen ? t("travel.hideMonthSection") : t("travel.expandMonthSection")}
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
                      {renderTicketsList(section.tickets)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {statsMonthSections.map((section) => {
            const isOpen =
              openStatsAccordions[section.key] ?? (section.yearMonth === currentStatsMonthKey);
            return (
              <div key={section.key} className="it-list-shell overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleStatsAccordion(section.key)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 sm:px-5"
                  aria-expanded={isOpen}
                  aria-label={isOpen ? t("travel.hideMonthSection") : t("travel.expandMonthSection")}
                >
                  <span className="min-w-0 text-sm font-semibold text-slate-900 sm:text-base">
                    {formatMonthHeadingUTC5(section.yearMonth, locale)}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium tabular-nums">
                      {section.items.length}
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
                  <div className="border-t border-slate-100 p-3 sm:p-4">
                    <div className="jira-issue-list" style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--jira-border)" }}>
                            <th style={{ padding: "10px 12px", textAlign: "left" }}>Ticket</th>
                            <th style={{ padding: "10px 12px", textAlign: "left" }}>User (Requester)</th>
                            <th style={{ padding: "10px 12px", textAlign: "left" }}>{t("travel.source")} / {t("travel.destination")}</th>
                            <th style={{ padding: "10px 12px", textAlign: "left" }}>Date/Time</th>
                            <th style={{ padding: "10px 12px", textAlign: "left" }}>{t("travel.company")}</th>
                            <th style={{ padding: "10px 12px", textAlign: "left" }}>{t("travel.price")}</th>
                            <th style={{ padding: "10px 12px", textAlign: "left" }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.items.map((s) => (
                            <tr key={s.id} style={{ borderBottom: "1px solid var(--jira-border)" }}>
                              <td style={{ padding: "10px 12px" }}>TRV-{s.travel_ticket_id}</td>
                              <td style={{ padding: "10px 12px" }}>{s.username || "—"}</td>
                              <td style={{ padding: "10px 12px" }}>{s.source_destination}</td>
                              <td style={{ padding: "10px 12px" }}>{s.date_time}</td>
                              <td style={{ padding: "10px 12px" }}>{s.company}</td>
                              <td style={{ padding: "10px 12px" }}>{s.price != null ? `${s.price} ${s.currency || "UZS"}` : "—"}</td>
                              <td style={{ padding: "10px 12px" }}>
                                {isTicketEngineer && (
                                  <button
                                    type="button"
                                    onClick={() => openEditStatModal(s)}
                                    className="btn-jira-secondary"
                                    style={{ padding: "4px 12px", fontSize: 12 }}
                                  >
                                    Edit
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {detailId != null && detailTicket && (
        <>
          <div className="jira-drawer-backdrop" onClick={() => setDetailId(null)} />
          <div className="jira-drawer">
            <div className="jira-drawer-header">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div className="jira-drawer-title">TRV-{detailTicket.id} — {ticketSummary(detailTicket)}</div>
                  <div className="jira-drawer-meta">{t("it.createdBy")} {detailTicket.created_by_name} · {formatDateUTC5(detailTicket.created_at)}</div>
                </div>
                <button type="button" onClick={() => setDetailId(null)} className="btn-jira-secondary">×</button>
              </div>
            </div>
            <div className="jira-drawer-body space-y-6">
              <div className="flex flex-wrap gap-2">
                <PriorityBadge priority={detailTicket.priority || "medium"} />
                <StatusBadge status={detailTicket.status} label={statusLabels[detailTicket.status] || detailTicket.status} />
                {detailTicket.book_hotel && <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">Hotel booking requested</span>}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <span className="text-base">📍</span> {t("travel.segments")}
                </h3>
                <div className="space-y-2">
                  {parseSegments(detailTicket.source_destination_json).map((s, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-4 py-3 text-sm">
                      <span className="font-medium text-slate-800">{s.source}</span>
                      <span className="text-slate-400">→</span>
                      <span className="font-medium text-slate-800">{s.destination}</span>
                      {s.date && <span className="ml-auto text-xs text-slate-500">{s.date}{s.time ? " " + s.time : ""}</span>}
                    </div>
                  ))}
                </div>
              </div>
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
                    {isTicketEngineer && detailTicket.status === "open" && (
                      <div className="mt-3">
                        <input
                          type="file"
                          id="travel-detail-file-upload"
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0 && detailId) {
                              handleFileUpload(e, detailId);
                            }
                          }}
                          disabled={fileUploading}
                          className="jira-input"
                          style={{ padding: "8px", fontSize: 14 }}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {isTicketEngineer && detailTicket.status === "open" && (
                  <>
                    <button 
                      type="button" 
                      onClick={() => {
                        const segs = parseSegments(detailTicket.source_destination_json);
                        setStatForm({ 
                          travel_ticket_id: detailTicket.id, 
                          username: detailTicket.created_by_name, 
                          mode: "total",
                          total: { company: "", price: 0, currency: "UZS" as TravelStatCurrency },
                          segments: segs.map(s => ({
                            source: s.source || "",
                            destination: s.destination || "",
                            date: s.date || "",
                            time: s.time || "",
                            company: "",
                            price: 0,
                            currency: "UZS" as TravelStatCurrency,
                          }))
                        }); 
                        setModal("stat");
                      }} 
                      className="btn-jira-secondary"
                    >
                      Add stat
                    </button>
                    <button type="button" onClick={() => rejectTicket(detailTicket.id)} className="btn-jira-secondary" style={{ backgroundColor: "#de350b", color: "white", borderColor: "#de350b" }}>Reject</button>
                    {(() => {
                      const ticketStats = stats.filter(s => s.travel_ticket_id === detailTicket.id);
                      const hasStats = ticketStats.length > 0;
                      const canCloseAsTicketEngineer = hasStats;
                      const canCloseAsHotelEngineer = isHotelEngineer && detailTicket.book_hotel;
                      const canClose = canCloseAsTicketEngineer || canCloseAsHotelEngineer;
                      return (
                        <button 
                          type="button" 
                          onClick={() => closeTicket(detailTicket.id, canCloseAsHotelEngineer && !canCloseAsTicketEngineer)} 
                          className="btn-jira-primary"
                          disabled={!canClose}
                          style={{ opacity: canClose ? 1 : 0.5, cursor: canClose ? "pointer" : "not-allowed" }}
                          title={!canCloseAsTicketEngineer && !canCloseAsHotelEngineer ? "Add at least one ticket stat to close as Ticket Engineer, or be Hotel Engineer for hotel bookings" : canCloseAsHotelEngineer && !canCloseAsTicketEngineer ? "Close as Hotel Engineer (hotel part)" : !hasStats ? "Please add at least one ticket stat before closing" : ""}
                        >
                          Close
                        </button>
                      );
                    })()}
                  </>
                )}
                {isHotelEngineer && !isTicketEngineer && detailTicket.status === "open" && detailTicket.book_hotel && (
                  <button 
                    type="button" 
                    onClick={() => closeTicket(detailTicket.id, true)} 
                    className="btn-jira-primary"
                    title="Close ticket (hotel part)"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {modal === "new" && (
        <>
          <div className="jira-drawer-backdrop" onClick={() => setModal(null)} style={{ zIndex: 110 }} />
          <div style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", background: "var(--jira-bg-elevated)", borderRadius: "var(--jira-radius-lg)", boxShadow: "var(--jira-shadow-lg)", padding: 24, zIndex: 111 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>New travel ticket request</h2>
            <form onSubmit={createTicket}>
              <div style={{ marginBottom: 12 }}>
                <label className="jira-field-label">Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value)} className="jira-select">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              {segments.map((seg, i) => (
                <div key={i} style={{ marginBottom: 12, padding: 12, border: "1px solid var(--jira-border)", borderRadius: "var(--jira-radius)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span className="jira-field-label">Segment {i + 1}</span>
                    {segments.length > 1 && <button type="button" onClick={() => removeSegment(i)} style={{ fontSize: 12, color: "var(--jira-danger)" }}>Remove</button>}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div style={{ position: "relative" }}>
                      <input
                        placeholder={t("travel.source")}
                        value={seg.source}
                        onChange={(e) => updateSegment(i, "source", e.target.value)}
                        onFocus={() => setPlaceSuggestOpen({ segmentIndex: i, field: "source" })}
                        onBlur={() => setTimeout(() => setPlaceSuggestOpen(null), 200)}
                        className="jira-input"
                      />
                      {placeSuggestOpen?.segmentIndex === i && placeSuggestOpen?.field === "source" && placeSuggestions.length > 0 && (
                        <ul className="absolute z-20 mt-1 w-full rounded border border-slate-200 bg-white shadow-lg" style={{ maxHeight: 200, overflowY: "auto" }}>
                          {placeSuggestions.map((p, idx) => (
                            <li key={idx}>
                              <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100" onClick={() => { updateSegment(i, "source", p.display); setPlaceSuggestions([]); setPlaceSuggestOpen(null); }}>
                                {p.display}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div style={{ position: "relative" }}>
                      <input
                        placeholder={t("travel.destination")}
                        value={seg.destination}
                        onChange={(e) => updateSegment(i, "destination", e.target.value)}
                        onFocus={() => setPlaceSuggestOpen({ segmentIndex: i, field: "destination" })}
                        onBlur={() => setTimeout(() => setPlaceSuggestOpen(null), 200)}
                        className="jira-input"
                      />
                      {placeSuggestOpen?.segmentIndex === i && placeSuggestOpen?.field === "destination" && placeSuggestions.length > 0 && (
                        <ul className="absolute z-20 mt-1 w-full rounded border border-slate-200 bg-white shadow-lg" style={{ maxHeight: 200, overflowY: "auto" }}>
                          {placeSuggestions.map((p, idx) => (
                            <li key={idx}>
                              <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100" onClick={() => { updateSegment(i, "destination", p.display); setPlaceSuggestions([]); setPlaceSuggestOpen(null); }}>
                                {p.display}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <input type="date" value={seg.date} onChange={(e) => updateSegment(i, "date", e.target.value)} className="jira-input" />
                    <input type="time" value={seg.time} onChange={(e) => updateSegment(i, "time", e.target.value)} className="jira-input" />
                  </div>
                </div>
              ))}
              <button type="button" onClick={addSegment} style={{ marginBottom: 12, fontSize: 14, color: "var(--jira-accent)" }}>+ {t("travel.addSegment")}</button>
              <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" id="travel-book-hotel" checked={bookHotel} onChange={(e) => setBookHotel(e.target.checked)} />
                <label htmlFor="travel-book-hotel" className="jira-field-label" style={{ marginBottom: 0 }}>Book Hotel (ticket will also go to Hotel Engineer)</label>
              </div>
              <div style={{ marginBottom: 16 }}><label className="jira-field-label">{t("transport.comment")}</label><textarea value={comment} onChange={(e) => setComment(e.target.value)} className="jira-input" rows={2} /></div>
              <div style={{ marginBottom: 16 }}>
                <label className="jira-field-label">Attachments</label>
                <input
                  type="file"
                  id="travel-file-upload"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) {
                      setFilesToUpload(Array.from(e.target.files));
                    }
                  }}
                  disabled={fileUploading}
                  className="jira-input"
                  style={{ padding: "8px" }}
                />
                {filesToUpload.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--jira-text-secondary)" }}>
                    {filesToUpload.length} file(s) selected: {filesToUpload.map((f) => f.name).join(", ")}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="btn-jira-primary" disabled={fileUploading}>
                  {fileUploading ? "Creating..." : t("common.save")}
                </button>
                <button type="button" onClick={() => { setModal(null); setFilesToUpload([]); }} className="btn-jira-secondary">{t("common.cancel")}</button>
              </div>
            </form>
          </div>
        </>
      )}

      {modal === "stat" && (
        <>
          <div className="jira-drawer-backdrop" onClick={() => setModal(null)} style={{ zIndex: 110 }} />
          <div style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: "100%", maxWidth: 800, maxHeight: "90vh", overflowY: "auto", background: "var(--jira-bg-elevated)", borderRadius: "var(--jira-radius-lg)", boxShadow: "var(--jira-shadow-lg)", padding: 24, zIndex: 111 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Add ticket stat</h2>
            <form onSubmit={createStat}>
              <div style={{ marginBottom: 16 }}>
                <label className="jira-field-label">Username (Requester)</label>
                <input 
                  value={statForm.username} 
                  className="jira-input" 
                  readOnly
                  style={{ backgroundColor: "#f4f5f7", cursor: "not-allowed" }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label className="jira-field-label">Pricing mode</label>
                <select
                  value={statForm.mode}
                  onChange={(e) => setStatForm((f) => ({ ...f, mode: e.target.value as "total" | "segment" }))}
                  className="jira-select"
                >
                  <option value="total">One total price (recommended)</option>
                  <option value="segment">Separate price per segment</option>
                </select>
              </div>

              {statForm.mode === "total" ? (
                <div style={{ marginBottom: 20, padding: 16, border: "1px solid var(--jira-border)", borderRadius: "var(--jira-radius)", backgroundColor: "#fafbfc" }}>
                  <div style={{ marginBottom: 10 }}>
                    <label className="jira-field-label" style={{ fontSize: 11 }}>Route summary</label>
                    <input
                      value={statForm.segments.map((s) => `${s.source} → ${s.destination}`).join(" | ")}
                      className="jira-input"
                      readOnly
                      style={{ backgroundColor: "#f4f5f7", cursor: "not-allowed", fontSize: 13 }}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr", gap: 12 }}>
                    <div>
                      <label className="jira-field-label" style={{ fontSize: 11 }}>{t("travel.company")}</label>
                      <input
                        value={statForm.total.company}
                        onChange={(e) => setStatForm((f) => ({ ...f, total: { ...f.total, company: e.target.value } }))}
                        className="jira-input"
                        style={{ fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label className="jira-field-label" style={{ fontSize: 11 }}>{t("travel.price")}</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={statForm.total.price || ""}
                        onChange={(e) => setStatForm((f) => ({ ...f, total: { ...f.total, price: Number(e.target.value) || 0 } }))}
                        className="jira-input"
                        style={{ fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label className="jira-field-label" style={{ fontSize: 11 }}>Currency</label>
                      <select
                        value={statForm.total.currency}
                        onChange={(e) => setStatForm((f) => ({ ...f, total: { ...f.total, currency: e.target.value as TravelStatCurrency } }))}
                        className="jira-select"
                        style={{ fontSize: 13 }}
                      >
                        <option value="UZS">UZS</option>
                        <option value="USD">USD</option>
                        <option value="CNY">CNY</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {statForm.segments.map((segment, index) => (
                    <div key={index} style={{ marginBottom: 20, padding: 16, border: "1px solid var(--jira-border)", borderRadius: "var(--jira-radius)", backgroundColor: "#fafbfc" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end", marginBottom: 10 }}>
                        <div>
                          <label className="jira-field-label" style={{ fontSize: 11 }}>Source → Destination</label>
                          <input
                            value={`${segment.source} → ${segment.destination}`}
                            className="jira-input"
                            readOnly
                            style={{ backgroundColor: "#f4f5f7", cursor: "not-allowed", fontSize: 13 }}
                          />
                        </div>
                        <div>
                          <label className="jira-field-label" style={{ fontSize: 11 }}>Date & Time</label>
                          <input
                            value={`${segment.date}${segment.time ? " " + segment.time : ""}`}
                            className="jira-input"
                            readOnly
                            style={{ backgroundColor: "#f4f5f7", cursor: "not-allowed", fontSize: 13 }}
                          />
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr", gap: 12, alignItems: "end" }}>
                        <div>
                          <label className="jira-field-label" style={{ fontSize: 11 }}>{t("travel.company")}</label>
                          <input
                            value={segment.company}
                            onChange={(e) => {
                              const newSegments = [...statForm.segments];
                              newSegments[index].company = e.target.value;
                              setStatForm((f) => ({ ...f, segments: newSegments }));
                            }}
                            className="jira-input"
                            style={{ fontSize: 13 }}
                          />
                        </div>
                        <div>
                          <label className="jira-field-label" style={{ fontSize: 11 }}>{t("travel.price")}</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={segment.price || ""}
                            onChange={(e) => {
                              const newSegments = [...statForm.segments];
                              newSegments[index].price = Number(e.target.value) || 0;
                              setStatForm((f) => ({ ...f, segments: newSegments }));
                            }}
                            className="jira-input"
                            style={{ fontSize: 13 }}
                          />
                        </div>
                        <div>
                          <label className="jira-field-label" style={{ fontSize: 11 }}>Currency</label>
                          <select
                            value={segment.currency}
                            onChange={(e) => {
                              const newSegments = [...statForm.segments];
                              newSegments[index].currency = e.target.value as TravelStatCurrency;
                              setStatForm((f) => ({ ...f, segments: newSegments }));
                            }}
                            className="jira-select"
                            style={{ fontSize: 13 }}
                          >
                            <option value="UZS">UZS</option>
                            <option value="USD">USD</option>
                            <option value="CNY">CNY</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
              
              <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                <button type="submit" className="btn-jira-primary">{t("common.save")}</button>
                <button type="button" onClick={() => setModal(null)} className="btn-jira-secondary">{t("common.cancel")}</button>
              </div>
            </form>
          </div>
        </>
      )}

      {modal === "edit-stat" && editingStat && (
        <>
          <div className="jira-drawer-backdrop" onClick={() => { setModal(null); setEditingStat(null); }} style={{ zIndex: 110 }} />
          <div style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: "100%", maxWidth: 500, background: "var(--jira-bg-elevated)", borderRadius: "var(--jira-radius-lg)", boxShadow: "var(--jira-shadow-lg)", padding: 24, zIndex: 111 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Edit ticket stat</h2>
            <form onSubmit={updateStat}>
              <div style={{ marginBottom: 12 }}>
                <label className="jira-field-label">Ticket</label>
                <input 
                  value={`TRV-${editingStat.travel_ticket_id}`}
                  className="jira-input" 
                  readOnly
                  style={{ backgroundColor: "#f4f5f7", cursor: "not-allowed" }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="jira-field-label">User (Requester)</label>
                <input 
                  value={editingStat.username || ""}
                  className="jira-input" 
                  readOnly
                  style={{ backgroundColor: "#f4f5f7", cursor: "not-allowed" }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="jira-field-label">{t("travel.source")} / {t("travel.destination")}</label>
                <input 
                  value={editingStat.source_destination}
                  className="jira-input" 
                  readOnly
                  style={{ backgroundColor: "#f4f5f7", cursor: "not-allowed" }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="jira-field-label">Date & time</label>
                <input 
                  value={editingStat.date_time}
                  className="jira-input" 
                  readOnly
                  style={{ backgroundColor: "#f4f5f7", cursor: "not-allowed" }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="jira-field-label">{t("travel.company")}</label>
                <input 
                  value={editStatForm.company} 
                  onChange={(e) => setEditStatForm((f) => ({ ...f, company: e.target.value }))} 
                  className="jira-input" 
                  required
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label className="jira-field-label">{t("travel.price")}</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={editStatForm.price || ""} 
                  onChange={(e) => setEditStatForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))} 
                  className="jira-input" 
                  required
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label className="jira-field-label">Currency</label>
                <select
                  value={editStatForm.currency}
                  onChange={(e) => setEditStatForm((f) => ({ ...f, currency: e.target.value as TravelStatCurrency }))}
                  className="jira-select"
                >
                  <option value="UZS">UZS</option>
                  <option value="USD">USD</option>
                  <option value="CNY">CNY</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="btn-jira-primary">{t("common.save")}</button>
                <button type="button" onClick={() => { setModal(null); setEditingStat(null); }} className="btn-jira-secondary">{t("common.cancel")}</button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
