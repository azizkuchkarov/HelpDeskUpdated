"use client";

import { useLocale } from "@/lib/i18n";

const SECTIONS = [
  { id: "it", steps: ["step1", "step2", "step3", "step4"] },
  { id: "administration", steps: ["step1", "step2", "step3"] },
  { id: "transport", steps: ["step1", "step2", "step3", "step4"] },
  { id: "travel", steps: ["step1", "step2", "step3", "step4"] },
  { id: "topManagers", steps: ["step1", "step2"] },
] as const;

export default function WorkflowPage() {
  const { t } = useLocale();

  return (
    <div className="page-container">
      <h1 className="page-title">{t("workflow.title")}</h1>
      <p className="page-subtitle">{t("workflow.subtitle")}</p>

      <div className="mt-10 space-y-8">
        {SECTIONS.map(({ id, steps }) => (
          <section
            key={id}
            className="rounded-card border border-slate-200 bg-white p-6 shadow-card"
          >
            <h2 className="mb-5 text-lg font-semibold text-slate-900">
              {t(`workflow.${id}.title`)}
            </h2>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {steps.map((stepKey, index) => (
                <span key={stepKey} className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="inline-flex items-center rounded-lg bg-primary-100 px-3 py-2 text-sm font-medium text-primary-800">
                    {index + 1}. {t(`workflow.${id}.${stepKey}`)}
                  </span>
                  {index < steps.length - 1 && (
                    <svg
                      className="hidden size-5 shrink-0 text-slate-400 sm:block"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  )}
                </span>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
