"use client";

import { useState, useEffect } from "react";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { it as itApi, type ITTicket } from "@/lib/api";
import { administration as admApi, type AdmTicket } from "@/lib/api";
import { transport as transportApi, type TransportTicket } from "@/lib/api";
import { formatDateUTC5 } from "@/lib/dateUtils";
import PriorityBadge from "@/components/jira/PriorityBadge";
import StatusBadge from "@/components/jira/StatusBadge";
import Link from "next/link";

const quickAccessLinks = [
  { href: "/it", key: "nav.it", icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  { href: "/administration", key: "nav.administration", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
  { href: "/transport", key: "nav.transport", icon: "M8 7h8m-8 4h8m-2 4l2 2 4-4" },
  { href: "/phone-directory", key: "nav.phoneDirectory", icon: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" },
];

type TicketSection = "active" | "approvals" | "assigned" | "archive";

export default function DashboardPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<TicketSection>("active");
  const [loading, setLoading] = useState(true);
  
  // IT Tickets
  const [itActive, setItActive] = useState<ITTicket[]>([]);
  const [itAssigned, setItAssigned] = useState<ITTicket[]>([]);
  const [itArchive, setItArchive] = useState<ITTicket[]>([]);
  
  // Admin Tickets
  const [admActive, setAdmActive] = useState<AdmTicket[]>([]);
  const [admAssigned, setAdmAssigned] = useState<AdmTicket[]>([]);
  const [admArchive, setAdmArchive] = useState<AdmTicket[]>([]);
  
  // Transport Tickets
  const [transportActive, setTransportActive] = useState<TransportTicket[]>([]);
  const [transportApprovals, setTransportApprovals] = useState<TransportTicket[]>([]);
  const [transportArchive, setTransportArchive] = useState<TransportTicket[]>([]);

  const isItAdmin = user?.roles?.some((r) => r.role_type === "it_admin") ?? false;
  const isItEngineer = user?.roles?.some((r) => r.role_type === "it_engineer") ?? false;
  const isAdmEngineer = user?.roles?.some((r) => ["adm_engineer", "adm_ticket_engineer"].includes(r.role_type)) ?? false;
  const isAdmManager = user?.roles?.some((r) => r.role_type === "adm_manager") ?? false;
  const isTransportEngineer = user?.roles?.some((r) => r.role_type === "transport_engineer") ?? false;
  const isHrManager = user?.roles?.some((r) => r.role_type === "hr_manager") ?? false;
  
  // Check if user is a department manager
  const isDeptManager = user?.department_id ? true : false; // We'll check this via API if needed

  async function loadData() {
    setLoading(true);
    try {
      // Regular users: their own active tickets + approvals
      if (!isItAdmin && !isItEngineer && !isAdmEngineer && !isAdmManager && !isTransportEngineer && !isHrManager) {
        // User's own IT tickets (active)
        const itTickets = await itApi.tickets();
        setItActive(itTickets.filter(t => t.status !== "closed" && t.created_by_id === user?.id));
        setItArchive(itTickets.filter(t => t.status === "closed" && t.created_by_id === user?.id));
        
        // User's own Admin tickets (active)
        const admTickets = await admApi.tickets();
        setAdmActive(admTickets.filter(t => t.status !== "closed" && t.created_by_id === user?.id));
        setAdmArchive(admTickets.filter(t => t.status === "closed" && t.created_by_id === user?.id));
        
        // User's own Transport tickets (active) + Approvals
        const transportTickets = await transportApi.tickets();
        const transportPending = await transportApi.tickets({ pending_my_approval: true });
        setTransportActive(transportTickets.filter(t => t.status !== "closed" && t.created_by_id === user?.id));
        setTransportApprovals(transportPending);
        setTransportArchive(transportTickets.filter(t => t.status === "closed" && t.created_by_id === user?.id));
        return;
      }
      
      // IT Engineers: Assigned + Active + Archive
      if (isItEngineer && !isItAdmin) {
        const itTickets = await itApi.tickets();
        setItAssigned(itTickets.filter(t => t.assigned_engineer_id === user?.id && t.status !== "closed"));
        setItActive(itTickets.filter(t => (t.status === "open" || t.status === "assigned" || t.status === "in_progress") && t.assigned_engineer_id !== user?.id));
        setItArchive(itTickets.filter(t => t.status === "closed"));
        return;
      }
      
      // IT Admin: New IT tickets + Approvals + Archive
      if (isItAdmin) {
        const itTickets = await itApi.tickets();
        setItActive(itTickets.filter(t => t.status === "open"));
        const transportPending = await transportApi.tickets({ pending_my_approval: true });
        setTransportApprovals(transportPending);
        setItArchive(itTickets.filter(t => t.status === "closed"));
        return;
      }
      
      // Admin Engineers: Assigned + Active + Archive
      if (isAdmEngineer && !isAdmManager) {
        const admTickets = await admApi.tickets();
        setAdmAssigned(admTickets.filter(t => t.assigned_engineer_id === user?.id && t.status !== "closed"));
        setAdmActive(admTickets.filter(t => t.status === "open" && t.assigned_engineer_id !== user?.id));
        setAdmArchive(admTickets.filter(t => t.status === "closed"));
        return;
      }
      
      // Admin Manager: New Admin tickets + Approvals + Archive
      if (isAdmManager) {
        const admTickets = await admApi.tickets();
        setAdmActive(admTickets.filter(t => t.status === "open"));
        const transportPending = await transportApi.tickets({ pending_my_approval: true });
        setTransportApprovals(transportPending);
        setAdmArchive(admTickets.filter(t => t.status === "closed"));
        return;
      }
      
      // Transport Engineer: New transport requests + Approvals + Archive
      if (isTransportEngineer) {
        const transportTickets = await transportApi.tickets();
        setTransportActive(transportTickets.filter(t => t.status === "open" || t.status === "manager_approved" || t.status === "hr_approved"));
        const transportPending = await transportApi.tickets({ pending_my_approval: true });
        setTransportApprovals(transportPending);
        setTransportArchive(transportTickets.filter(t => t.status === "closed"));
        return;
      }
      
      // Managers (Department Manager or HR Manager): Approvals + Department active tickets + Archive
      if (isHrManager || isDeptManager) {
        // Approvals
        const transportPending = await transportApi.tickets({ pending_my_approval: true });
        setTransportApprovals(transportPending);
        
        // Department active tickets (all tickets from users in the same department)
        if (user?.department_id) {
          const itTickets = await itApi.tickets();
          const admTickets = await admApi.tickets();
          const transportTickets = await transportApi.tickets();
          
          // Get all users in the same department (would need backend API, for now using created_by_id filter)
          // Note: This is a simplified version - ideally backend should provide department tickets endpoint
          setItActive(itTickets.filter(t => t.status !== "closed"));
          setAdmActive(admTickets.filter(t => t.status !== "closed"));
          setTransportActive(transportTickets.filter(t => t.status !== "closed"));
          
          setItArchive(itTickets.filter(t => t.status === "closed"));
          setAdmArchive(admTickets.filter(t => t.status === "closed"));
          setTransportArchive(transportTickets.filter(t => t.status === "closed"));
        }
        return;
      }
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const renderTicketCard = (ticket: ITTicket | AdmTicket | TransportTicket, type: "it" | "admin" | "transport") => {
    const statusLabels: Record<string, string> = {
      open: t("it.open", "Open"),
      assigned: t("it.assigned", "Assigned"),
      in_progress: t("it.inProgress", "In Progress"),
      closed: t("it.closed", "Closed"),
      manager_approved: "Manager Approved",
      hr_approved: "HR Approved",
      closed_by_engineer: "Closed by Engineer",
    };

    const getTicketLink = () => {
      if (type === "it") return `/it#ticket-${ticket.id}`;
      if (type === "admin") return `/administration#ticket-${ticket.id}`;
      if (type === "transport") return `/transport#ticket-${ticket.id}`;
      return "#";
    };

    const getTicketTitle = () => {
      if (type === "it") return (ticket as ITTicket).title;
      if (type === "admin") return (ticket as AdmTicket).title;
      if (type === "transport") return (ticket as TransportTicket).destination;
      return "";
    };

    const transportTicket = type === "transport" ? ticket as TransportTicket : null;
    const itTicket = type === "it" ? ticket as ITTicket : null;
    const admTicket = type === "admin" ? ticket as AdmTicket : null;

    const itSt = type === "it" ? (ticket as ITTicket).status : null;
    const itCardClass =
      itSt === "assigned"
        ? "border-red-300 bg-red-50/90 hover:border-red-400"
        : itSt === "in_progress"
          ? "border-pink-300 bg-pink-50/90 hover:border-pink-400"
          : itSt === "closed_by_engineer"
            ? "border-amber-300 bg-amber-50/90 hover:border-amber-400"
            : "border-slate-200 bg-white hover:border-primary-300";

    return (
      <Link
        key={`${type}-${ticket.id}`}
        href={getTicketLink()}
        className={
          "group flex flex-col gap-3 rounded-lg border p-4 shadow-sm transition-all hover:shadow-md " +
          (type === "it" ? itCardClass : "border-slate-200 bg-white hover:border-primary-300")
        }
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <PriorityBadge priority={ticket.priority || "medium"} />
              <StatusBadge status={ticket.status} label={statusLabels[ticket.status] || ticket.status} />
              <span className="text-xs font-medium text-slate-500">
                {type === "it" ? "IT" : type === "admin" ? "ADM" : "TRN"}-{ticket.id}
              </span>
              {transportTicket && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  {transportTicket.ticket_type === "daily" ? t("transport.daily", "Daily") : 
                   transportTicket.ticket_type === "overtime" ? t("transport.overtime", "Overtime") : 
                   t("transport.maxsus", "Special")}
                </span>
              )}
            </div>
            <h3 className="mb-1 font-semibold text-slate-900 group-hover:text-primary-600">
              {getTicketTitle()}
            </h3>
          </div>
        </div>

        {/* Transport ticket details */}
        {transportTicket && (
          <div className="space-y-1.5 border-t border-slate-100 pt-2 text-sm">
            {transportTicket.from_location && (
              <div className="flex items-start gap-2">
                <span className="font-medium text-slate-600">{t("transport.from", "From")}:</span>
                <span className="text-slate-700">{transportTicket.from_location}</span>
              </div>
            )}
            <div className="flex items-start gap-2">
              <span className="font-medium text-slate-600">{t("transport.destination", "Destination")}:</span>
              <span className="text-slate-700">{transportTicket.destination}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium text-slate-600">{t("transport.passengers", "Passengers")}:</span>
              <span className="text-slate-700">{transportTicket.passenger_count}</span>
            </div>
            {transportTicket.start_date && (
              <div className="flex items-start gap-2">
                <span className="font-medium text-slate-600">{t("transport.startDate", "Start date")}:</span>
                <span className="text-slate-700">
                  {transportTicket.start_date.slice(0, 10)} {transportTicket.start_time ? `· ${transportTicket.start_time}` : ""}
                </span>
              </div>
            )}
            {transportTicket.approximate_time && (
              <div className="flex items-start gap-2">
                <span className="font-medium text-slate-600">{t("transport.approximateTime", "Approximately using time")}:</span>
                <span className="text-slate-700">{transportTicket.approximate_time}</span>
              </div>
            )}
            {transportTicket.comment && (
              <div className="flex items-start gap-2">
                <span className="font-medium text-slate-600">{t("transport.comment", "Comment")}:</span>
                <span className="text-slate-700">{transportTicket.comment}</span>
              </div>
            )}
          </div>
        )}

        {/* IT ticket details */}
        {itTicket && (
          <div className="space-y-1.5 border-t border-slate-100 pt-2 text-sm">
            {itTicket.problem_type && (
              <div className="flex items-start gap-2">
                <span className="font-medium text-slate-600">{t("it.problemType", "Problem type")}:</span>
                <span className="text-slate-700">{itTicket.problem_type}</span>
              </div>
            )}
            {itTicket.description && (
              <div className="flex items-start gap-2">
                <span className="font-medium text-slate-600">{t("it.description", "Description")}:</span>
                <span className="text-slate-700 line-clamp-2">{itTicket.description}</span>
              </div>
            )}
          </div>
        )}

        {/* Admin ticket details */}
        {admTicket && (
          <div className="space-y-1.5 border-t border-slate-100 pt-2 text-sm">
            {admTicket.description && (
              <div className="flex items-start gap-2">
                <span className="font-medium text-slate-600">{t("it.description", "Description")}:</span>
                <span className="text-slate-700 line-clamp-2">{admTicket.description}</span>
              </div>
            )}
            {admTicket.meeting_booking && (
              <div className="flex items-start gap-2">
                <span className="font-medium text-slate-600">{t("administration.room", "Room")}:</span>
                <span className="text-slate-700">
                  {formatDateUTC5(admTicket.meeting_booking.start_at)} - {formatDateUTC5(admTicket.meeting_booking.end_at)?.slice(-5)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Footer with creator and date */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
          <span>{ticket.created_by_name}</span>
          <span>{formatDateUTC5(ticket.created_at)}</span>
        </div>
      </Link>
    );
  };

  const renderSection = (title: string, tickets: (ITTicket | AdmTicket | TransportTicket)[], type: "it" | "admin" | "transport") => {
    if (tickets.length === 0) return null;
    return (
      <div className="mb-8">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">{title}</h3>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {tickets.slice(0, 6).map((t) => renderTicketCard(t, type))}
        </div>
        {tickets.length > 6 && (
          <Link
            href={type === "it" ? "/it" : type === "admin" ? "/administration" : "/transport"}
            className="mt-3 inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            View all {tickets.length} tickets →
          </Link>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="page-container">
        <p className="text-slate-500">{t("common.loading")}</p>
      </div>
    );
  }

  const name = user?.display_name || user?.ldap_username || "";

  return (
    <div className="page-container">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="page-title">{t("nav.dashboard")}</h1>
          <p className="page-subtitle">
            {t("dashboard.welcome")}
            {name ? `, ${name}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveSection("active")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeSection === "active"
                ? "bg-primary-600 text-white"
                : "bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Active
          </button>
          {(transportApprovals.length > 0 || isItAdmin || isAdmManager || isTransportEngineer || isHrManager || isDeptManager) && (
            <button
              onClick={() => setActiveSection("approvals")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeSection === "approvals"
                  ? "bg-primary-600 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Approvals {transportApprovals.length > 0 && `(${transportApprovals.length})`}
            </button>
          )}
          {(isItEngineer || isAdmEngineer) && (
            <button
              onClick={() => setActiveSection("assigned")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeSection === "assigned"
                  ? "bg-primary-600 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Assigned
            </button>
          )}
          <button
            onClick={() => setActiveSection("archive")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeSection === "archive"
                ? "bg-primary-600 text-white"
                : "bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Archive
          </button>
        </div>
      </div>

      <div className="mb-8">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">{t("dashboard.quickAccess")}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickAccessLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-primary-300 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
              </div>
              <div>
                <span className="font-medium text-slate-900">{t(item.key)}</span>
                <span className="ml-1 text-sm text-primary-600">→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {activeSection === "active" && (
        <>
          {renderSection("IT Tickets", itActive, "it")}
          {renderSection("Administration Tickets", admActive, "admin")}
          {renderSection("Transport Tickets", transportActive, "transport")}
          {itActive.length === 0 && admActive.length === 0 && transportActive.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
              <p className="text-slate-500">No active tickets</p>
            </div>
          )}
        </>
      )}

      {activeSection === "approvals" && (
        <>
          {renderSection("Pending Approvals", transportApprovals, "transport")}
          {transportApprovals.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
              <p className="text-slate-500">No pending approvals</p>
            </div>
          )}
        </>
      )}

      {activeSection === "assigned" && (
        <>
          {renderSection("Assigned IT Tickets", itAssigned, "it")}
          {renderSection("Assigned Admin Tickets", admAssigned, "admin")}
          {itAssigned.length === 0 && admAssigned.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
              <p className="text-slate-500">No assigned tickets</p>
            </div>
          )}
        </>
      )}

      {activeSection === "archive" && (
        <>
          {renderSection("IT Tickets", itArchive, "it")}
          {renderSection("Administration Tickets", admArchive, "admin")}
          {renderSection("Transport Tickets", transportArchive, "transport")}
          {itArchive.length === 0 && admArchive.length === 0 && transportArchive.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
              <p className="text-slate-500">No archived tickets</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
