"use client";

const STATUS_CONFIG: Record<
  string,
  { className: string; label?: string }
> = {
  open: {
    className: "bg-slate-200 text-slate-800",
    label: "Open",
  },
  assigned: {
    className: "bg-red-100 text-red-950 ring-1 ring-red-300/70",
    label: "Assigned",
  },
  in_progress: {
    className: "bg-pink-100 text-pink-950 ring-1 ring-pink-300/70",
    label: "In progress",
  },
  closed_by_engineer: {
    className: "bg-amber-200 text-amber-950 ring-1 ring-amber-400/60",
    label: "Closed by engineer",
  },
  closed: {
    className: "bg-emerald-100 text-emerald-800",
    label: "Closed",
  },
  manager_approved: {
    className: "bg-emerald-100 text-emerald-800",
    label: "Manager approved",
  },
  hr_approved: {
    className: "bg-emerald-100 text-emerald-800",
    label: "HR approved",
  },
  approved: {
    className: "bg-emerald-100 text-emerald-800",
    label: "Approved",
  },
};

export default function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const config =
    STATUS_CONFIG[status] || {
      className: "bg-slate-200 text-slate-800",
      label: status?.replace(/_/g, " ") ?? status,
    };
  const text = label ?? config.label ?? status;
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${config.className}`}
    >
      {text}
    </span>
  );
}
