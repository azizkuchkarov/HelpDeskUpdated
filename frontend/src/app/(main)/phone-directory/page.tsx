"use client";

import { useState, useEffect, useRef } from "react";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { phoneDirectory as pdApi } from "@/lib/api";
import { formatDateUTC5 } from "@/lib/dateUtils";

const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2";
const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300";

export default function PhoneDirectoryPage() {
  const { t } = useLocale();
  const { isAdmin } = useAuth();
  const [info, setInfo] = useState<{ file_name: string | null; uploaded_at: string | null; uploaded_by_name: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadInfo() {
    setLoading(true);
    try {
      const data = await pdApi.info();
      setInfo(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInfo();
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx") && !file.name.toLowerCase().endsWith(".xls")) {
      setError(t("phoneDirectory.onlyExcel"));
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await pdApi.upload(file);
      await loadInfo();
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload() {
    if (!info?.file_name) return;
    setDownloading(true);
    setError(null);
    try {
      await pdApi.download(info.file_name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="page-title">{t("phoneDirectory.title")}</h1>
        <p className="page-subtitle">{t("phoneDirectory.subtitle")}</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 underline">
            {t("common.close")}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {loading ? (
          <p className="text-slate-500">{t("common.loading")}</p>
        ) : (
          <div className="space-y-6">
            {info?.file_name ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">{t("phoneDirectory.currentFile")}</p>
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="font-medium text-slate-900">{info.file_name}</p>
                  {info.uploaded_at && (
                    <p className="mt-1 text-sm text-slate-600">
                      {t("phoneDirectory.uploadedAt")}: {formatDateUTC5(info.uploaded_at)}
                    </p>
                  )}
                  {info.uploaded_by_name && (
                    <p className="text-sm text-slate-600">
                      {t("phoneDirectory.uploadedBy")}: {info.uploaded_by_name}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className={btnPrimary}
                >
                  {downloading ? t("common.loading") : t("phoneDirectory.download")}
                </button>
              </div>
            ) : (
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-amber-800">
                {t("phoneDirectory.noFile")}
              </p>
            )}

            {isAdmin && (
              <div className="border-t border-slate-200 pt-6">
                <p className="mb-2 text-sm font-medium text-slate-700">{t("phoneDirectory.uploadSection")}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className={btnSecondary}
                >
                  {uploading ? t("common.loading") : t("phoneDirectory.upload")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
