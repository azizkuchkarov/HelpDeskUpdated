"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { topManagers as tmApi } from "@/lib/api";
import { formatDateUTC5 } from "@/lib/dateUtils";

type AvailabilityItem = {
  id: number;
  name: string;
  status: string | null;
  comment: string | null;
  updated_at: string | null;
};
type MyManager = { id: number; name: string; user_id: number | null };

export default function TopManagersPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const [availability, setAvailability] = useState<AvailabilityItem[]>([]);
  const [myManagers, setMyManagers] = useState<MyManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentModal, setCommentModal] = useState<{ managerId: number; managerName: string } | null>(null);
  const [commentValue, setCommentValue] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const isSecretary = user?.roles?.some((r) => r.role_type === "secretary") ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [avail, my] = await Promise.all([
        tmApi.availability(),
        isSecretary ? tmApi.myManagers() : Promise.resolve([]),
      ]);
      setAvailability(avail);
      setMyManagers(my);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isSecretary]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(topManagerId: number, status: string, comment?: string) {
    setError(null);
    try {
      await tmApi.setAvailability(topManagerId, status, comment);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function openNotAtWorkModal(managerId: number, managerName: string) {
    setCommentModal({ managerId, managerName });
    setCommentValue("");
  }

  async function submitNotAtWork() {
    if (!commentModal) return;
    setCommentSubmitting(true);
    try {
      await setStatus(commentModal.managerId, "not_at_work", commentValue.trim() || undefined);
      setCommentModal(null);
      setCommentValue("");
    } finally {
      setCommentSubmitting(false);
    }
  }

  const statusLabel = (s: string | null) => {
    if (!s) return t("topManagers.noStatus");
    if (s === "at_work") return t("topManagers.atWork");
    if (s === "not_at_work") return t("topManagers.notAtWork");
    return s;
  };

  return (
    <div className="jira-page">
      <h1 className="jira-title mb-6">{t("topManagers.title")}</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {loading ? (
        <p className="jira-muted">{t("common.loading")}</p>
      ) : (
        <div className="space-y-4">
          {isSecretary && myManagers.length > 0 && (
            <div className="card">
              <h2 className="mb-3 font-medium">My Top Managers — set availability</h2>
              <div className="space-y-3">
                {myManagers.map((m) => {
                  const item = availability.find((a) => a.id === m.id);
                  const status = item?.status ?? null;
                  return (
                    <div key={m.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-slate-900">{m.name}</span>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full font-medium ${
                                status === "at_work"
                                  ? "bg-emerald-100 px-3 py-1 text-sm text-emerald-800"
                                  : status === "not_at_work"
                                  ? "bg-red-100 px-2.5 py-0.5 text-xs text-red-800"
                                  : "bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600"
                              }`}
                            >
                              {statusLabel(status)}
                            </span>
                            {item?.updated_at && (
                              <span className="text-xs text-slate-500">{formatDateUTC5(item.updated_at)}</span>
                            )}
                          </div>
                          {status === "not_at_work" && item?.comment && (
                            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2.5">
                              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Comment</p>
                              <p className="mt-0.5 text-sm text-slate-700">{item.comment}</p>
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => setStatus(m.id, "at_work")}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-base font-medium text-emerald-700 transition hover:bg-emerald-100"
                          >
                            {t("topManagers.atWork")}
                          </button>
                          <button
                            type="button"
                            onClick={() => openNotAtWorkModal(m.id, m.name)}
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-100"
                          >
                            {t("topManagers.notAtWork")}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="mb-3 font-medium">All Top Managers — availability</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {availability.map((item) => {
                const isAtWork = item.status === "at_work";
                const isNotAtWork = item.status === "not_at_work";
                return (
                  <div
                    key={item.id}
                    className={`overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md ${
                      isAtWork
                        ? "border-emerald-200/80 bg-white"
                        : isNotAtWork
                        ? "border-red-200/80 bg-white"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="p-4">
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <span
                        className={`mt-1.5 inline-flex items-center rounded-full font-medium ${
                          isAtWork
                            ? "bg-emerald-100 px-3 py-1 text-sm text-emerald-800"
                            : isNotAtWork
                            ? "bg-red-100 px-2.5 py-0.5 text-xs text-red-800"
                            : "bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600"
                        }`}
                      >
                        {statusLabel(item.status)}
                      </span>
                      {item.comment && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2.5">
                          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Comment</p>
                          <p className="mt-0.5 text-sm text-slate-700">{item.comment}</p>
                        </div>
                      )}
                      {item.updated_at && (
                        <p className="mt-2 text-xs text-slate-500">{formatDateUTC5(item.updated_at)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {commentModal && (
        <>
          <div
            className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm"
            onClick={() => !commentSubmitting && setCommentModal(null)}
            aria-hidden
          />
          <div className="fixed left-1/2 top-1/2 z-[111] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-slate-200 bg-white p-6 shadow-card-hover">
            <h3 className="text-lg font-semibold text-slate-900">
              {t("topManagers.notAtWork")} — {commentModal.managerName}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {t("topManagers.commentLabel")}
            </p>
            <textarea
              value={commentValue}
              onChange={(e) => setCommentValue(e.target.value)}
              placeholder={t("topManagers.commentPlaceholder")}
              className="jira-input mt-2 min-h-[80px] w-full resize-y"
              rows={3}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !commentSubmitting && setCommentModal(null)}
                className="btn-jira-secondary"
                disabled={commentSubmitting}
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="button"
                onClick={submitNotAtWork}
                className="btn-jira-primary"
                disabled={commentSubmitting}
              >
                {commentSubmitting ? t("common.loading") : t("topManagers.setNotAtWork")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
