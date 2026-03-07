"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useLocale } from "@/lib/i18n";
import Sidebar from "@/components/Sidebar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token, user, logout } = useAuth();
  const { t, locale, setLocale } = useLocale();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (typeof token === "undefined") return;
    if (!token || !user) {
      router.replace("/");
    }
  }, [token, user, router]);

  if (typeof token === "undefined" || !token || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-slate-50">
        <header className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="-ml-2 flex size-10 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 md:hidden"
              aria-label="Open menu"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              {/* ATG logo and Help Desk system title */}
              <img src="/atg-logo.png" alt="ATG" className="hidden h-7 w-auto sm:block" />
              <span className="truncate text-base font-semibold text-primary-600">
                Help Desk
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1 py-0.5 text-xs font-medium text-slate-600 sm:flex">
              {(["en", "ru"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLocale(l)}
                  className={`rounded-full px-2 py-0.5 transition ${
                    locale === l ? "bg-primary-600 text-white" : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-600 text-sm font-semibold text-white">
                  {(user?.display_name || user?.ldap_username || "?")
                    .split(" ")
                    .map((p) => p[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="hidden flex-col text-sm leading-tight sm:flex">
                  <span className="font-medium text-slate-900">
                    {user?.display_name || user?.ldap_username}
                  </span>
                  {user?.ldap_username && (
                    <span className="text-xs text-slate-500">{user.ldap_username}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => logout()}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                {t("app.logout")}
              </button>
            </div>
          </div>
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </main>
    </div>
  );
}
