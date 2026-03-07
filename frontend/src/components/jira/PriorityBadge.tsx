"use client";

type Priority = "low" | "medium" | "high" | "urgent";

const PRIORITY_STYLES: Record<
  Priority,
  string
> = {
  urgent: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-primary-600 text-white",
  low: "bg-slate-500 text-white",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export default function PriorityBadge({ priority }: { priority: string }) {
  const p = (priority?.toLowerCase() || "medium") as Priority;
  const style = PRIORITY_STYLES[p] ?? PRIORITY_STYLES.medium;
  const label = PRIORITY_LABEL[p] ?? "Medium";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${style}`}
    >
      {label}
    </span>
  );
}
