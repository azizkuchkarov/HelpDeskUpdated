"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

export default function LoginForm() {
  const { t, locale, setLocale } = useLocale();
  const { login: doLogin } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await doLogin(username, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-card-lg border border-slate-200/80 bg-white p-6 shadow-card-hover sm:p-8">
      <div className="mb-6 text-center sm:mb-8">
        <div className="mb-3 flex items-center justify-center gap-3">
          {/* Logo file should be placed at frontend/public/atg-logo.png */}
          <img src="/atg-logo.png" alt="ATG" className="h-10 w-auto" />
          <h1 className="text-2xl font-semibold tracking-tight text-primary-600 sm:text-3xl">
            {t("app.title")}
          </h1>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Sign in with your credentials
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="username"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500"
          >
            {t("app.username")}
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="example@atg.uz"
            className="w-full rounded-input border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            required
            autoComplete="username"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500"
          >
            {t("app.password")}
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-input border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            required
            autoComplete="current-password"
          />
        </div>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="flex min-h-touch w-full items-center justify-center rounded-input bg-primary-600 px-4 py-3 font-medium text-white shadow-sm transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-70 sm:min-h-0 sm:py-2.5"
        >
          {loading ? t("common.loading") : t("app.login")}
        </button>
      </form>
      <div className="mt-6 flex justify-center gap-2 border-t border-slate-100 pt-6">
        {(["en", "ru"] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              locale === l
                ? "bg-primary-600 text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            }`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
