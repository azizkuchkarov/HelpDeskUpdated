"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

type NavItem = {
  href: string;
  key: string;
  adminOnly?: boolean;
  external?: boolean; // open in new tab
};

const nav: NavItem[] = [
  { href: "/dashboard", key: "nav.dashboard" },
  { href: "/it", key: "nav.it" },
  { href: "/administration", key: "nav.administration" },
  { href: "/transport", key: "nav.transport" },
  { href: "/travel", key: "nav.travel" },
  { href: "/top-managers", key: "nav.topManagers" },
  { href: "/workflow", key: "nav.workflow" },
  { href: "http://portal.atg.uz/", key: "nav.documentControl", external: true },
  { href: "http://budget.atg.uz/login", key: "nav.budgetManagement", external: true },
  { href: "/admin", key: "nav.admin", adminOnly: true },
];

type SidebarProps = {
  open?: boolean;
  onClose?: () => void;
};

export default function Sidebar({ open = true, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useLocale();
  const { isAdmin } = useAuth();

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm md:hidden drawer-backdrop"
          aria-hidden="true"
          onClick={onClose}
        />
      )}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex h-full w-[var(--sidebar-width)] max-w-[85vw] flex-col
          border-r border-slate-200 bg-white shadow-sm
          pt-[var(--safe-top)] pb-[var(--safe-bottom)]
          transition-transform duration-200 ease-out
          md:relative md:translate-x-0
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-4 py-4">
          <Link
            href="/dashboard"
            onClick={() => onClose?.()}
            className="text-lg font-semibold text-primary-600"
          >
            {t("nav.mainMenu")}
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 flex size-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 md:hidden"
            aria-label="Close menu"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {nav.map((item) => {
            if (item.adminOnly && !isAdmin) return null;
            const isActive = !item.external &&
              (pathname === item.href || pathname.startsWith(item.href + "/"));
            const baseClass =
              "flex min-h-touch items-center rounded-lg px-3 py-2.5 text-sm font-medium transition md:min-h-0 md:py-2 " +
              (isActive
                ? "bg-primary-50 text-primary-600"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900");
            if (item.external) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onClose?.()}
                  className={baseClass}
                >
                  {t(item.key)}
                </a>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onClose?.()}
                className={baseClass}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-shrink-0 flex-col border-t border-slate-200 p-3 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">Help Desk</span>
          <span className="mt-1">Ver. 1.1</span>
        </div>
      </aside>
    </>
  );
}
