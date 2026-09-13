"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import {
  projectManagement as pmApi,
  type ITProject,
  type ProjectRequest,
  type PMMember,
  type PMMonitoring,
  type PMUserOption,
  type PMInformation,
  type TesterTask,
} from "@/lib/api";
import StatusBadge from "@/components/jira/StatusBadge";
import PriorityBadge from "@/components/jira/PriorityBadge";
import { formatDateUTC5 } from "@/lib/dateUtils";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20";
const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50";
const btnDanger =
  "inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50";

type MainTab = "information" | "projects" | "monitoring";
type DetailTab = "overview" | "requests" | "testing";
type Modal =
  | "new-project"
  | "edit-project"
  | "assign-coder"
  | "assign-tester"
  | "set-deadline"
  | "new-change"
  | "new-bug"
  | "new-tester-task"
  | "request-deadline"
  | null;

const ROLE_LABEL_KEYS: Record<string, string> = {
  pm_manager: "projectManagement.rolePmManager",
  pm_team_leader: "projectManagement.rolePmTeamLeader",
  pm_deadline_monitor: "projectManagement.rolePmDeadlineMonitor",
  pm_coder: "projectManagement.rolePmCoder",
  pm_tester: "projectManagement.rolePmTester",
};

export default function ProjectManagementPage() {
  const { t } = useLocale();
  const { user } = useAuth();

  const hasRole = useCallback(
    (role: string) => user?.roles?.some((r) => r.role_type === role) ?? false,
    [user]
  );
  const isAdmin = hasRole("global_admin");
  const isPM = hasRole("pm_manager") || isAdmin;
  const isTL = hasRole("pm_team_leader") || isAdmin;
  const isMonitor = hasRole("pm_deadline_monitor") || isAdmin;

  const [mainTab, setMainTab] = useState<MainTab>("projects");
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [info, setInfo] = useState<PMInformation | null>(null);
  const [projects, setProjects] = useState<ITProject[]>([]);
  const [activeProject, setActiveProject] = useState<ITProject | null>(null);
  const [projectRequests, setProjectRequests] = useState<ProjectRequest[]>([]);
  const [testerTasks, setTesterTasks] = useState<TesterTask[]>([]);
  const [monitoring, setMonitoring] = useState<PMMonitoring | null>(null);
  const [coders, setCoders] = useState<PMUserOption[]>([]);
  const [testers, setTesters] = useState<PMUserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [infoLoaded, setInfoLoaded] = useState(false);
  const [monitoringLoaded, setMonitoringLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedRequest, setSelectedRequest] = useState<ProjectRequest | null>(null);
  const [bugTaskId, setBugTaskId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [projectForm, setProjectForm] = useState({
    name: "",
    description: "",
    info: "",
    status: "active",
  });
  const [memberUserId, setMemberUserId] = useState<number | "">("");
  const [deadlineValue, setDeadlineValue] = useState("");
  const [requestForm, setRequestForm] = useState({
    title: "",
    description: "",
    priority: "medium",
  });
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    assigned_tester_id: 0,
  });

  const [comments, setComments] = useState<
    { id: number; author_name: string | null; body: string; created_at: string | null }[]
  >([]);
  const [files, setFiles] = useState<
    { id: number; file_name: string; file_size: number; uploaded_by_name: string | null }[]
  >([]);
  const [commentBody, setCommentBody] = useState("");
  const [uploading, setUploading] = useState(false);

  const isProjectCoder = useMemo(() => {
    if (!user || !activeProject) return false;
    return (
      activeProject.members?.some((m) => m.user_id === user.id && m.member_role === "coder") ?? false
    );
  }, [activeProject, user]);

  const isProjectTester = useMemo(() => {
    if (!user || !activeProject) return false;
    return (
      activeProject.members?.some((m) => m.user_id === user.id && m.member_role === "tester") ?? false
    );
  }, [activeProject, user]);

  const projectTesters = useMemo(
    () => activeProject?.members?.filter((m) => m.member_role === "tester") || [],
    [activeProject]
  );

  const loadProjects = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const projectsData = await pmApi.projects();
      setProjects(projectsData);
      setProjectsLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  const loadInformation = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      setInfo(await pmApi.information());
      setInfoLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  const loadMonitoring = useCallback(async (showSpinner = true) => {
    if (!isMonitor) return;
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      setMonitoring(await pmApi.monitoring());
      setMonitoringLoaded(true);
    } catch (e) {
      setMonitoring(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [isMonitor]);

  const ensureStaffLists = useCallback(async () => {
    if (coders.length && testers.length) return;
    try {
      const [c, te] = await Promise.all([pmApi.coders(), pmApi.testers()]);
      setCoders(c);
      setTesters(te);
    } catch {
      /* optional */
    }
  }, [coders.length, testers.length]);

  const loadProjectDetail = useCallback(async (projectId: number) => {
    const [p, reqs, tasks] = await Promise.all([
      pmApi.getProject(projectId),
      pmApi.requests({ project_id: projectId }),
      pmApi.testerTasks(projectId),
    ]);
    setActiveProject(p);
    setProjectRequests(reqs);
    setTesterTasks(tasks);
    setProjects((prev) => prev.map((x) => (x.id === p.id ? p : x)));
  }, []);

  useEffect(() => {
    if (mainTab === "projects" && !projectsLoaded && !activeProject) {
      loadProjects();
    } else if (mainTab === "information" && !infoLoaded) {
      loadInformation();
    } else if (mainTab === "monitoring" && !monitoringLoaded) {
      loadMonitoring();
    }
  }, [
    mainTab,
    projectsLoaded,
    infoLoaded,
    monitoringLoaded,
    activeProject,
    loadProjects,
    loadInformation,
    loadMonitoring,
  ]);

  useEffect(() => {
    if (!selectedRequest) {
      setComments([]);
      setFiles([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [c, f] = await Promise.all([
          pmApi.comments(selectedRequest.id),
          pmApi.files(selectedRequest.id),
        ]);
        if (!cancelled) {
          setComments(c);
          setFiles(f);
        }
      } catch {
        if (!cancelled) {
          setComments([]);
          setFiles([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRequest]);

  async function openProject(p: ITProject) {
    setError(null);
    setSelectedRequest(null);
    setDetailTab("overview");
    setActiveProject(p);
    try {
      await loadProjectDetail(p.id);
      ensureStaffLists();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function refreshActive() {
    if (activeProject) {
      await loadProjectDetail(activeProject.id);
      await loadProjects(false);
      return;
    }
    if (mainTab === "projects") await loadProjects(false);
    else if (mainTab === "information") await loadInformation(false);
    else if (mainTab === "monitoring") await loadMonitoring(false);
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!projectForm.name.trim()) return;
    setSubmitting(true);
    try {
      const p = await pmApi.createProject({
        name: projectForm.name.trim(),
        description: projectForm.description.trim() || undefined,
        info: projectForm.info.trim() || undefined,
      });
      setModal(null);
      setProjectForm({ name: "", description: "", info: "", status: "active" });
      setProjectsLoaded(true);
      await loadProjects(false);
      await openProject(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveProject(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProject) return;
    setSubmitting(true);
    try {
      await pmApi.updateProject(activeProject.id, {
        name: projectForm.name.trim(),
        description: projectForm.description.trim() || undefined,
        info: projectForm.info.trim() || undefined,
        status: projectForm.status,
      });
      setModal(null);
      await refreshActive();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function addMember(role: "coder" | "tester") {
    if (!activeProject || memberUserId === "") return;
    setSubmitting(true);
    try {
      await pmApi.addMember(activeProject.id, {
        user_id: Number(memberUserId),
        member_role: role,
      });
      setModal(null);
      setMemberUserId("");
      await refreshActive();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeMember(member: PMMember) {
    if (!activeProject || !confirm(t("projectManagement.removeMember") + "?")) return;
    try {
      await pmApi.removeMember(activeProject.id, member.id);
      await refreshActive();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveProjectDeadline(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProject) return;
    setSubmitting(true);
    try {
      if (!deadlineValue) {
        await pmApi.updateProject(activeProject.id, { clear_deadline: true });
      } else {
        await pmApi.updateProject(activeProject.id, { deadline: deadlineValue });
      }
      setModal(null);
      await refreshActive();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function createChangeRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProject || !requestForm.title.trim()) return;
    setSubmitting(true);
    try {
      await pmApi.createRequest({
        project_id: activeProject.id,
        title: requestForm.title.trim(),
        description: requestForm.description.trim() || undefined,
        request_type: "change_request",
        priority: requestForm.priority,
      });
      setModal(null);
      setRequestForm({ title: "", description: "", priority: "medium" });
      setDetailTab("requests");
      await refreshActive();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function createBugReport(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProject || !requestForm.title.trim()) return;
    setSubmitting(true);
    try {
      await pmApi.createRequest({
        project_id: activeProject.id,
        title: requestForm.title.trim(),
        description: requestForm.description.trim() || undefined,
        request_type: "bug_report",
        priority: requestForm.priority,
        tester_task_id: bugTaskId || undefined,
      });
      setModal(null);
      setBugTaskId(null);
      setRequestForm({ title: "", description: "", priority: "medium" });
      setDetailTab("testing");
      await refreshActive();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function createTesterTask(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProject || !taskForm.title.trim() || !taskForm.assigned_tester_id) return;
    setSubmitting(true);
    try {
      await pmApi.createTesterTask(activeProject.id, {
        title: taskForm.title.trim(),
        description: taskForm.description.trim() || undefined,
        assigned_tester_id: taskForm.assigned_tester_id,
      });
      setModal(null);
      setTaskForm({ title: "", description: "", assigned_tester_id: 0 });
      await refreshActive();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function actOnRequest(action: "take" | "close" | "confirm" | "reopen", req: ProjectRequest) {
    setSubmitting(true);
    try {
      let updated: ProjectRequest;
      if (action === "take") updated = await pmApi.takeRequest(req.id);
      else if (action === "close") updated = await pmApi.closeRequest(req.id);
      else if (action === "confirm") updated = await pmApi.confirmRequest(req.id);
      else updated = await pmApi.reopenRequest(req.id);
      setSelectedRequest(updated);
      await refreshActive();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function updateTaskStatus(task: TesterTask, status: string) {
    if (!activeProject) return;
    setSubmitting(true);
    try {
      await pmApi.updateTesterTask(activeProject.id, task.id, { status });
      await refreshActive();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const changeRequests = projectRequests.filter((r) => r.request_type === "change_request");
  const bugRequests = projectRequests.filter((r) => r.request_type === "bug_report");

  const mainTabs: { id: MainTab; label: string; show: boolean }[] = [
    { id: "projects", label: t("projectManagement.tabProjects"), show: true },
    { id: "monitoring", label: t("projectManagement.tabMonitoring"), show: isMonitor },
    { id: "information", label: t("projectManagement.tabInformation"), show: true },
  ];

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="page-title">{t("projectManagement.title")}</h1>
        <p className="page-subtitle">{t("projectManagement.subtitle")}</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
          <button type="button" className="ml-3 underline" onClick={() => setError(null)}>
            {t("common.close")}
          </button>
        </div>
      )}

      {!activeProject && (
        <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200">
          {mainTabs
            .filter((x) => x.show)
            .map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setMainTab(x.id)}
                className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  mainTab === x.id
                    ? "border-primary-600 text-primary-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {x.label}
              </button>
            ))}
        </div>
      )}

      {loading && !activeProject ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : activeProject ? (
        <ProjectDetail
          project={activeProject}
          detailTab={detailTab}
          setDetailTab={setDetailTab}
          changeRequests={changeRequests}
          bugRequests={bugRequests}
          testerTasks={testerTasks}
          selectedRequest={selectedRequest}
          setSelectedRequest={setSelectedRequest}
          t={t}
          userId={user?.id}
          isPM={isPM}
          isTL={isTL}
          isMonitor={isMonitor}
          isProjectCoder={isProjectCoder}
          isProjectTester={isProjectTester}
          projectTesters={projectTesters}
          submitting={submitting}
          comments={comments}
          files={files}
          commentBody={commentBody}
          setCommentBody={setCommentBody}
          uploading={uploading}
          onBack={() => {
            setActiveProject(null);
            setSelectedRequest(null);
            setMainTab("projects");
          }}
          onEdit={() => {
            setProjectForm({
              name: activeProject.name,
              description: activeProject.description || "",
              info: activeProject.info || "",
              status: activeProject.status,
            });
            setModal("edit-project");
          }}
          onAssignCoder={async () => {
            setMemberUserId("");
            setModal("assign-coder");
            await ensureStaffLists();
          }}
          onAssignTester={async () => {
            setMemberUserId("");
            setModal("assign-tester");
            await ensureStaffLists();
          }}
          onSetDeadline={() => {
            setDeadlineValue(activeProject.deadline || "");
            setModal("set-deadline");
          }}
          onRemoveMember={removeMember}
          onNewChange={() => {
            setRequestForm({ title: "", description: "", priority: "medium" });
            setModal("new-change");
          }}
          onNewTask={() => {
            setTaskForm({
              title: "",
              description: "",
              assigned_tester_id: projectTesters[0]?.user_id || 0,
            });
            setModal("new-tester-task");
          }}
          onReportBug={(taskId) => {
            setBugTaskId(taskId);
            setRequestForm({ title: "", description: "", priority: "medium" });
            setModal("new-bug");
          }}
          onAct={actOnRequest}
          onTaskStatus={updateTaskStatus}
          onRequestDeadline={(r) => {
            setSelectedRequest(r);
            setDeadlineValue(r.deadline || "");
            setModal("request-deadline");
          }}
          onComment={async (e) => {
            e.preventDefault();
            if (!selectedRequest || !commentBody.trim()) return;
            setSubmitting(true);
            try {
              await pmApi.addComment(selectedRequest.id, commentBody.trim());
              setCommentBody("");
              setComments(await pmApi.comments(selectedRequest.id));
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setSubmitting(false);
            }
          }}
          onUpload={async (list) => {
            if (!selectedRequest || !list?.length) return;
            setUploading(true);
            try {
              await pmApi.uploadFile(selectedRequest.id, list[0]);
              setFiles(await pmApi.files(selectedRequest.id));
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setUploading(false);
            }
          }}
          onDownload={(reqId, fileId, name) => pmApi.downloadFile(reqId, fileId, name)}
        />
      ) : mainTab === "information" ? (
        <InformationView info={info} t={t} />
      ) : mainTab === "monitoring" ? (
        <MonitoringView
          monitoring={monitoring}
          t={t}
          onOpenProject={async (id) => {
            const p = projects.find((x) => x.id === id) || (await pmApi.getProject(id));
            await openProject(p);
          }}
        />
      ) : (
        <ProjectsList
          projects={projects}
          t={t}
          isPM={isPM}
          onOpen={openProject}
          onNew={() => {
            setProjectForm({ name: "", description: "", info: "", status: "active" });
            setModal("new-project");
          }}
        />
      )}

      {/* Modals */}
      {modal === "new-project" && (
        <ModalShell title={t("projectManagement.newProject")} onClose={() => setModal(null)}>
          <form onSubmit={createProject} className="space-y-4">
            <Field label={t("projectManagement.projectName")}>
              <input
                className={inputClass}
                required
                value={projectForm.name}
                onChange={(e) => setProjectForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field label={t("projectManagement.description")}>
              <textarea
                className={inputClass}
                rows={2}
                value={projectForm.description}
                onChange={(e) => setProjectForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>
            <Field label={t("projectManagement.projectInfo")}>
              <textarea
                className={inputClass}
                rows={4}
                placeholder={t("projectManagement.projectInfoHint")}
                value={projectForm.info}
                onChange={(e) => setProjectForm((f) => ({ ...f, info: e.target.value }))}
              />
            </Field>
            <ModalActions
              t={t}
              submitting={submitting}
              onCancel={() => setModal(null)}
            />
          </form>
        </ModalShell>
      )}

      {modal === "edit-project" && (
        <ModalShell title={t("projectManagement.editProject")} onClose={() => setModal(null)}>
          <form onSubmit={saveProject} className="space-y-4">
            <Field label={t("projectManagement.projectName")}>
              <input
                className={inputClass}
                required
                value={projectForm.name}
                onChange={(e) => setProjectForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field label={t("projectManagement.description")}>
              <textarea
                className={inputClass}
                rows={2}
                value={projectForm.description}
                onChange={(e) => setProjectForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>
            <Field label={t("projectManagement.projectInfo")}>
              <textarea
                className={inputClass}
                rows={4}
                value={projectForm.info}
                onChange={(e) => setProjectForm((f) => ({ ...f, info: e.target.value }))}
              />
            </Field>
            <Field label={t("projectManagement.status")}>
              <select
                className={inputClass}
                value={projectForm.status}
                onChange={(e) => setProjectForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="active">{t("projectManagement.active")}</option>
                <option value="on_hold">{t("projectManagement.onHold")}</option>
                <option value="completed">{t("projectManagement.completed")}</option>
              </select>
            </Field>
            <ModalActions t={t} submitting={submitting} onCancel={() => setModal(null)} />
          </form>
        </ModalShell>
      )}

      {modal === "assign-coder" && (
        <ModalShell title={t("projectManagement.assignCoder")} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label={t("projectManagement.selectCoder")}>
              <select
                className={inputClass}
                value={memberUserId}
                onChange={(e) => setMemberUserId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">—</option>
                {coders.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name || c.ldap_username}
                  </option>
                ))}
              </select>
            </Field>
            {coders.length === 0 && (
              <p className="text-sm text-amber-700">{t("projectManagement.noCodersAvailable")}</p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setModal(null)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={submitting || memberUserId === ""}
                onClick={() => addMember("coder")}
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {modal === "assign-tester" && (
        <ModalShell title={t("projectManagement.assignTester")} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label={t("projectManagement.selectTester")}>
              <select
                className={inputClass}
                value={memberUserId}
                onChange={(e) => setMemberUserId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">—</option>
                {testers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name || c.ldap_username}
                  </option>
                ))}
              </select>
            </Field>
            {testers.length === 0 && (
              <p className="text-sm text-amber-700">{t("projectManagement.noTestersAvailable")}</p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setModal(null)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={submitting || memberUserId === ""}
                onClick={() => addMember("tester")}
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {modal === "set-deadline" && activeProject && (
        <ModalShell title={t("projectManagement.setDeadline")} onClose={() => setModal(null)}>
          <form onSubmit={saveProjectDeadline} className="space-y-4">
            <Field label={t("projectManagement.deadline")}>
              <input
                type="date"
                className={inputClass}
                value={deadlineValue}
                onChange={(e) => setDeadlineValue(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={btnSecondary}
                onClick={async () => {
                  setSubmitting(true);
                  try {
                    await pmApi.updateProject(activeProject.id, { clear_deadline: true });
                    setModal(null);
                    await refreshActive();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {t("projectManagement.clearDeadline")}
              </button>
              <button type="submit" className={btnPrimary} disabled={submitting}>
                {t("common.save")}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {modal === "new-change" && (
        <ModalShell title={t("projectManagement.newChangeRequest")} onClose={() => setModal(null)}>
          <form onSubmit={createChangeRequest} className="space-y-4">
            <Field label={t("projectManagement.requestTitle")}>
              <input
                className={inputClass}
                required
                value={requestForm.title}
                onChange={(e) => setRequestForm((f) => ({ ...f, title: e.target.value }))}
              />
            </Field>
            <Field label={t("projectManagement.description")}>
              <textarea
                className={inputClass}
                rows={4}
                value={requestForm.description}
                onChange={(e) => setRequestForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>
            <Field label={t("projectManagement.priority")}>
              <select
                className={inputClass}
                value={requestForm.priority}
                onChange={(e) => setRequestForm((f) => ({ ...f, priority: e.target.value }))}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </Field>
            <ModalActions t={t} submitting={submitting} onCancel={() => setModal(null)} />
          </form>
        </ModalShell>
      )}

      {modal === "new-bug" && (
        <ModalShell title={t("projectManagement.newBugReport")} onClose={() => setModal(null)}>
          <form onSubmit={createBugReport} className="space-y-4">
            <Field label={t("projectManagement.requestTitle")}>
              <input
                className={inputClass}
                required
                value={requestForm.title}
                onChange={(e) => setRequestForm((f) => ({ ...f, title: e.target.value }))}
              />
            </Field>
            <Field label={t("projectManagement.description")}>
              <textarea
                className={inputClass}
                rows={4}
                value={requestForm.description}
                onChange={(e) => setRequestForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>
            <Field label={t("projectManagement.priority")}>
              <select
                className={inputClass}
                value={requestForm.priority}
                onChange={(e) => setRequestForm((f) => ({ ...f, priority: e.target.value }))}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </Field>
            <ModalActions t={t} submitting={submitting} onCancel={() => setModal(null)} />
          </form>
        </ModalShell>
      )}

      {modal === "new-tester-task" && (
        <ModalShell title={t("projectManagement.newTesterTask")} onClose={() => setModal(null)}>
          <form onSubmit={createTesterTask} className="space-y-4">
            <Field label={t("projectManagement.taskTitle")}>
              <input
                className={inputClass}
                required
                value={taskForm.title}
                onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
              />
            </Field>
            <Field label={t("projectManagement.description")}>
              <textarea
                className={inputClass}
                rows={3}
                value={taskForm.description}
                onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>
            <Field label={t("projectManagement.selectTester")}>
              <select
                className={inputClass}
                required
                value={taskForm.assigned_tester_id || ""}
                onChange={(e) =>
                  setTaskForm((f) => ({ ...f, assigned_tester_id: Number(e.target.value) || 0 }))
                }
              >
                <option value="">—</option>
                {projectTesters.map((m) => (
                  <option key={m.id} value={m.user_id}>
                    {m.user_name || m.user_id}
                  </option>
                ))}
              </select>
            </Field>
            <ModalActions t={t} submitting={submitting} onCancel={() => setModal(null)} />
          </form>
        </ModalShell>
      )}

      {modal === "request-deadline" && selectedRequest && (
        <ModalShell title={t("projectManagement.setDeadline")} onClose={() => setModal(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              try {
                const updated = !deadlineValue
                  ? await pmApi.setRequestDeadline(selectedRequest.id, { clear_deadline: true })
                  : await pmApi.setRequestDeadline(selectedRequest.id, { deadline: deadlineValue });
                setSelectedRequest(updated);
                setModal(null);
                await refreshActive();
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <Field label={t("projectManagement.deadline")}>
              <input
                type="date"
                className={inputClass}
                value={deadlineValue}
                onChange={(e) => setDeadlineValue(e.target.value)}
              />
            </Field>
            <ModalActions t={t} submitting={submitting} onCancel={() => setModal(null)} />
          </form>
        </ModalShell>
      )}
    </div>
  );
}

function TeamPhotoAvatar({
  infoId,
  hasPhoto,
  name,
  sizeClass = "size-16",
}: {
  infoId: number;
  hasPhoto?: boolean;
  name: string;
  sizeClass?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!hasPhoto) {
      setSrc(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    pmApi.getTeamPhotoObjectUrl(infoId).then((url) => {
      if (cancelled) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      objectUrl = url;
      setSrc(url);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [infoId, hasPhoto]);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={`${sizeClass} rounded-full object-cover ring-2 ring-slate-100`}
      />
    );
  }
  return (
    <div
      className={`flex ${sizeClass} items-center justify-center rounded-full bg-primary-100 text-lg font-semibold text-primary-700`}
    >
      {(name || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

function InformationView({
  info,
  t,
}: {
  info: PMInformation | null;
  t: (k: string) => string;
}) {
  if (!info || (!info.intro_title && !info.intro_body && !info.team.length)) {
    return (
      <div className="rounded-card border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
        <p className="font-medium text-slate-800">{t("projectManagement.infoEmptyTitle")}</p>
        <p className="mt-1 text-sm text-slate-500">{t("projectManagement.infoEmptyBody")}</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {(info.intro_title || info.intro_body) && (
        <section className="rounded-card border border-slate-200 bg-white p-6 shadow-sm">
          {info.intro_title && (
            <h2 className="text-xl font-semibold text-slate-900">{info.intro_title}</h2>
          )}
          {info.intro_body && (
            <p className="mt-3 whitespace-pre-wrap text-slate-700">{info.intro_body}</p>
          )}
        </section>
      )}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          {t("projectManagement.teamSection")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {info.team.map((row) => (
            <div
              key={row.id}
              className="rounded-card border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-3 flex items-center gap-3">
                <TeamPhotoAvatar
                  infoId={row.id}
                  hasPhoto={row.has_photo}
                  name={row.display_name}
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-primary-700">
                    {t(ROLE_LABEL_KEYS[row.role_type] || row.role_type)}
                  </p>
                  <p className="truncate text-lg font-semibold text-slate-900">{row.display_name}</p>
                  {row.title && <p className="truncate text-sm text-slate-500">{row.title}</p>}
                </div>
              </div>
              {row.description && (
                <p className="whitespace-pre-wrap text-sm text-slate-600">{row.description}</p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProjectsList({
  projects,
  t,
  isPM,
  onOpen,
  onNew,
}: {
  projects: ITProject[];
  t: (k: string) => string;
  isPM: boolean;
  onOpen: (p: ITProject) => void;
  onNew: () => void;
}) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t("projectManagement.clickProjectHint")}</p>
        {isPM && (
          <button type="button" className={btnPrimary} onClick={onNew}>
            {t("projectManagement.newProject")}
          </button>
        )}
      </div>
      {!projects.length ? (
        <div className="rounded-card border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <p className="font-medium text-slate-800">{t("projectManagement.noProjects")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("projectManagement.noProjectsHint")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen(p)}
              className="rounded-card border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-primary-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900">{p.name}</h3>
                <StatusBadge status={p.status} />
              </div>
              {p.description && (
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">{p.description}</p>
              )}
              <p className="mt-3 text-xs text-slate-500">
                {t("projectManagement.coders")}: {p.coder_count ?? 0} ·{" "}
                {t("projectManagement.testers")}: {p.tester_count ?? 0}
                {p.deadline ? ` · ${t("projectManagement.deadline")}: ${p.deadline}` : ""}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectDetail(props: {
  project: ITProject;
  detailTab: DetailTab;
  setDetailTab: (t: DetailTab) => void;
  changeRequests: ProjectRequest[];
  bugRequests: ProjectRequest[];
  testerTasks: TesterTask[];
  selectedRequest: ProjectRequest | null;
  setSelectedRequest: (r: ProjectRequest | null) => void;
  t: (k: string) => string;
  userId?: number;
  isPM: boolean;
  isTL: boolean;
  isMonitor: boolean;
  isProjectCoder: boolean;
  isProjectTester: boolean;
  projectTesters: PMMember[];
  submitting: boolean;
  comments: { id: number; author_name: string | null; body: string; created_at: string | null }[];
  files: { id: number; file_name: string; file_size: number; uploaded_by_name: string | null }[];
  commentBody: string;
  setCommentBody: (v: string) => void;
  uploading: boolean;
  onBack: () => void;
  onEdit: () => void;
  onAssignCoder: () => void;
  onAssignTester: () => void;
  onSetDeadline: () => void;
  onRemoveMember: (m: PMMember) => void;
  onNewChange: () => void;
  onNewTask: () => void;
  onReportBug: (taskId: number | null) => void;
  onAct: (a: "take" | "close" | "confirm" | "reopen", r: ProjectRequest) => void;
  onTaskStatus: (task: TesterTask, status: string) => void;
  onRequestDeadline: (r: ProjectRequest) => void;
  onComment: (e: React.FormEvent) => void;
  onUpload: (files: FileList | null) => void;
  onDownload: (reqId: number, fileId: number, name: string) => void;
}) {
  const {
    project,
    detailTab,
    setDetailTab,
    changeRequests,
    bugRequests,
    testerTasks,
    selectedRequest,
    setSelectedRequest,
    t,
    userId,
    isPM,
    isTL,
    isMonitor,
    isProjectCoder,
    isProjectTester,
    submitting,
    comments,
    files,
    commentBody,
    setCommentBody,
    uploading,
    onBack,
    onEdit,
    onAssignCoder,
    onAssignTester,
    onSetDeadline,
    onRemoveMember,
    onNewChange,
    onNewTask,
    onReportBug,
    onAct,
    onTaskStatus,
    onRequestDeadline,
    onComment,
    onUpload,
    onDownload,
  } = props;

  const coders = project.members?.filter((m) => m.member_role === "coder") || [];
  const testers = project.members?.filter((m) => m.member_role === "tester") || [];

  return (
    <div>
      <button type="button" className="mb-4 text-sm font-medium text-primary-600" onClick={onBack}>
        ← {t("projectManagement.backToProjects")}
      </button>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold text-slate-900">{project.name}</h2>
            <StatusBadge status={project.status} />
          </div>
          {project.description && (
            <p className="mt-1 text-slate-600">{project.description}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {isPM && (
            <button type="button" className={btnSecondary} onClick={onEdit}>
              {t("common.edit")}
            </button>
          )}
          {isTL && (
            <button type="button" className={btnSecondary} onClick={onAssignCoder}>
              {t("projectManagement.assignCoder")}
            </button>
          )}
          {(isProjectCoder || isTL) && (
            <button type="button" className={btnSecondary} onClick={onAssignTester}>
              {t("projectManagement.assignTester")}
            </button>
          )}
          {isMonitor && (
            <button type="button" className={btnSecondary} onClick={onSetDeadline}>
              {t("projectManagement.setDeadline")}
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200">
        {(
          [
            ["overview", t("projectManagement.tabOverview")],
            ["requests", t("projectManagement.tabRequests")],
            ["testing", t("projectManagement.tabTesting")],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setDetailTab(id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${
              detailTab === id
                ? "border-primary-600 text-primary-700"
                : "border-transparent text-slate-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {detailTab === "overview" && (
        <div className="space-y-6">
          <section className="rounded-card border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-slate-500">
              {t("projectManagement.projectInfo")}
            </h3>
            <p className="whitespace-pre-wrap text-slate-700">
              {project.info || project.description || "—"}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              {t("projectManagement.createdBy")}: {project.created_by_name || "—"}
              {project.deadline
                ? ` · ${t("projectManagement.deadline")}: ${project.deadline}`
                : ""}
            </p>
          </section>
          <div className="grid gap-4 sm:grid-cols-2">
            <MemberBlock
              title={t("projectManagement.coders")}
              members={coders}
              canRemove={isTL}
              onRemove={onRemoveMember}
              removeLabel={t("projectManagement.removeMember")}
            />
            <MemberBlock
              title={t("projectManagement.testers")}
              members={testers}
              canRemove={isProjectCoder || isTL}
              onRemove={onRemoveMember}
              removeLabel={t("projectManagement.removeMember")}
            />
          </div>
        </div>
      )}

      {detailTab === "requests" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button type="button" className={btnPrimary} onClick={onNewChange}>
              {t("projectManagement.newChangeRequest")}
            </button>
          </div>
          <RequestList
            requests={changeRequests}
            selectedRequest={selectedRequest}
            setSelectedRequest={setSelectedRequest}
            t={t}
            emptyHint={t("projectManagement.noRequestsHint")}
          />
          {selectedRequest && selectedRequest.request_type === "change_request" && (
            <RequestDrawer
              req={selectedRequest}
              t={t}
              userId={userId}
              canTake={isProjectCoder}
              isMonitor={isMonitor}
              submitting={submitting}
              comments={comments}
              files={files}
              commentBody={commentBody}
              setCommentBody={setCommentBody}
              uploading={uploading}
              onClose={() => setSelectedRequest(null)}
              onAct={onAct}
              onRequestDeadline={onRequestDeadline}
              onComment={onComment}
              onUpload={onUpload}
              onDownload={onDownload}
            />
          )}
        </div>
      )}

      {detailTab === "testing" && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{t("projectManagement.testingHint")}</p>
          <div className="flex flex-wrap gap-2">
            {isProjectCoder && (
              <button type="button" className={btnPrimary} onClick={onNewTask}>
                {t("projectManagement.newTesterTask")}
              </button>
            )}
            {isProjectTester && (
              <button type="button" className={btnSecondary} onClick={() => onReportBug(null)}>
                {t("projectManagement.newBugReport")}
              </button>
            )}
          </div>

          {!testerTasks.length ? (
            <p className="text-sm text-slate-500">{t("projectManagement.noTesterTasks")}</p>
          ) : (
            <div className="space-y-3">
              {testerTasks.map((task) => {
                const taskBugs = bugRequests.filter((b) => b.tester_task_id === task.id);
                return (
                  <div
                    key={task.id}
                    className="rounded-card border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-semibold text-slate-900">{task.title}</h4>
                          <StatusBadge
                            status={task.status === "done" ? "closed" : task.status === "in_testing" ? "in_progress" : "open"}
                            label={
                              task.status === "done"
                                ? t("projectManagement.done")
                                : task.status === "in_testing"
                                  ? t("projectManagement.inTesting")
                                  : t("projectManagement.open")
                            }
                          />
                        </div>
                        {task.description && (
                          <p className="mt-1 text-sm text-slate-600">{task.description}</p>
                        )}
                        <p className="mt-1 text-xs text-slate-500">
                          {t("projectManagement.createdBy")}: {task.created_by_name} ·{" "}
                          {t("projectManagement.testers")}: {task.assigned_tester_name}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {task.assigned_tester_id === userId && task.status === "open" && (
                          <button
                            type="button"
                            className={btnSecondary}
                            disabled={submitting}
                            onClick={() => onTaskStatus(task, "in_testing")}
                          >
                            {t("projectManagement.startTesting")}
                          </button>
                        )}
                        {task.assigned_tester_id === userId &&
                          task.status !== "done" && (
                            <button
                              type="button"
                              className={btnSecondary}
                              disabled={submitting}
                              onClick={() => onTaskStatus(task, "done")}
                            >
                              {t("projectManagement.markTaskDone")}
                            </button>
                          )}
                        {isProjectTester && task.assigned_tester_id === userId && (
                          <button
                            type="button"
                            className={btnPrimary}
                            onClick={() => onReportBug(task.id)}
                          >
                            {t("projectManagement.reportBugForTask")}
                          </button>
                        )}
                      </div>
                    </div>
                    {taskBugs.length > 0 && (
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <p className="mb-2 text-xs font-medium uppercase text-slate-500">
                          {t("projectManagement.taskBugs")}
                        </p>
                        <ul className="space-y-1">
                          {taskBugs.map((b) => (
                            <li key={b.id}>
                              <button
                                type="button"
                                className="w-full rounded-lg bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100"
                                onClick={() => setSelectedRequest(b)}
                              >
                                PM-{b.id}: {b.title}{" "}
                                <StatusBadge
                                  status={b.status}
                                  label={
                                    b.status === "closed_by_coder"
                                      ? t("projectManagement.closedByCoder")
                                      : undefined
                                  }
                                />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6">
            <h3 className="mb-2 font-medium text-slate-800">
              {t("projectManagement.bugReport")}
            </h3>
            <RequestList
              requests={bugRequests}
              selectedRequest={selectedRequest}
              setSelectedRequest={setSelectedRequest}
              t={t}
              emptyHint=""
            />
          </div>

          {selectedRequest && selectedRequest.request_type === "bug_report" && (
            <RequestDrawer
              req={selectedRequest}
              t={t}
              userId={userId}
              canTake={isProjectCoder}
              isMonitor={isMonitor}
              submitting={submitting}
              comments={comments}
              files={files}
              commentBody={commentBody}
              setCommentBody={setCommentBody}
              uploading={uploading}
              onClose={() => setSelectedRequest(null)}
              onAct={onAct}
              onRequestDeadline={onRequestDeadline}
              onComment={onComment}
              onUpload={onUpload}
              onDownload={onDownload}
            />
          )}
        </div>
      )}
    </div>
  );
}

function RequestList({
  requests,
  selectedRequest,
  setSelectedRequest,
  t,
  emptyHint,
}: {
  requests: ProjectRequest[];
  selectedRequest: ProjectRequest | null;
  setSelectedRequest: (r: ProjectRequest | null) => void;
  t: (k: string) => string;
  emptyHint: string;
}) {
  if (!requests.length) {
    return emptyHint ? (
      <div className="rounded-card border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
        <p className="font-medium text-slate-800">{t("projectManagement.noRequests")}</p>
        <p className="mt-1 text-sm text-slate-500">{emptyHint}</p>
      </div>
    ) : (
      <p className="text-sm text-slate-400">—</p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-card border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">{t("projectManagement.colKey")}</th>
            <th className="px-4 py-3">{t("projectManagement.colSummary")}</th>
            <th className="px-4 py-3">{t("projectManagement.colPriority")}</th>
            <th className="px-4 py-3">{t("projectManagement.colStatus")}</th>
            <th className="px-4 py-3">{t("projectManagement.colAssignee")}</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr
              key={r.id}
              className={`cursor-pointer border-b border-slate-100 hover:bg-primary-50/40 ${
                selectedRequest?.id === r.id ? "bg-primary-50" : ""
              }`}
              onClick={() => setSelectedRequest(r)}
            >
              <td className="px-4 py-3 font-mono text-xs text-slate-500">PM-{r.id}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{r.title}</td>
              <td className="px-4 py-3">
                <PriorityBadge priority={r.priority} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  status={r.status}
                  label={
                    r.status === "closed_by_coder"
                      ? t("projectManagement.closedByCoder")
                      : undefined
                  }
                />
              </td>
              <td className="px-4 py-3 text-slate-600">
                {r.assigned_coder_name || t("projectManagement.unassigned")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RequestDrawer(props: {
  req: ProjectRequest;
  t: (k: string) => string;
  userId?: number;
  canTake: boolean;
  isMonitor: boolean;
  submitting: boolean;
  comments: { id: number; author_name: string | null; body: string; created_at: string | null }[];
  files: { id: number; file_name: string; file_size: number; uploaded_by_name: string | null }[];
  commentBody: string;
  setCommentBody: (v: string) => void;
  uploading: boolean;
  onClose: () => void;
  onAct: (a: "take" | "close" | "confirm" | "reopen", r: ProjectRequest) => void;
  onRequestDeadline: (r: ProjectRequest) => void;
  onComment: (e: React.FormEvent) => void;
  onUpload: (files: FileList | null) => void;
  onDownload: (reqId: number, fileId: number, name: string) => void;
}) {
  const {
    req,
    t,
    userId,
    canTake,
    isMonitor,
    submitting,
    comments,
    files,
    commentBody,
    setCommentBody,
    uploading,
    onClose,
    onAct,
    onRequestDeadline,
    onComment,
    onUpload,
    onDownload,
  } = props;

  return (
    <aside className="rounded-card border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-slate-400">PM-{req.id}</p>
          <h3 className="text-base font-semibold text-slate-900">{req.title}</h3>
        </div>
        <button type="button" className="text-slate-400" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <StatusBadge status={req.status} />
        <PriorityBadge priority={req.priority} />
      </div>
      <p className="mb-2 text-sm text-slate-600">
        {t("projectManagement.colRequester")}: {req.created_by_name}
      </p>
      <p className="mb-3 whitespace-pre-wrap text-sm text-slate-700">
        {req.description || "—"}
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {req.status === "open" && canTake && (
          <button
            type="button"
            className={btnPrimary}
            disabled={submitting}
            onClick={() => onAct("take", req)}
          >
            {t("projectManagement.take")}
          </button>
        )}
        {req.status === "in_progress" && req.assigned_coder_id === userId && (
          <button
            type="button"
            className={btnPrimary}
            disabled={submitting}
            onClick={() => onAct("close", req)}
          >
            {t("projectManagement.closeByCoder")}
          </button>
        )}
        {req.status === "closed_by_coder" && req.created_by_id === userId && (
          <>
            <button
              type="button"
              className={btnPrimary}
              disabled={submitting}
              onClick={() => onAct("confirm", req)}
            >
              {t("projectManagement.confirmClose")}
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={submitting}
              onClick={() => onAct("reopen", req)}
            >
              {t("projectManagement.reopen")}
            </button>
          </>
        )}
        {isMonitor && (
          <button type="button" className={btnSecondary} onClick={() => onRequestDeadline(req)}>
            {t("projectManagement.setDeadline")}
          </button>
        )}
      </div>

      <div className="mb-4 border-t border-slate-100 pt-4">
        <p className="mb-2 text-xs font-medium uppercase text-slate-500">
          {t("projectManagement.comments")}
        </p>
        <div className="mb-3 max-h-40 space-y-2 overflow-y-auto">
          {comments.length === 0 ? (
            <p className="text-sm text-slate-400">{t("projectManagement.noComments")}</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <p className="font-medium text-slate-800">{c.author_name}</p>
                <p className="text-slate-600">{c.body}</p>
                {c.created_at && (
                  <p className="mt-1 text-xs text-slate-400">{formatDateUTC5(c.created_at)}</p>
                )}
              </div>
            ))
          )}
        </div>
        <form onSubmit={onComment} className="flex gap-2">
          <input
            className={inputClass}
            placeholder={t("projectManagement.addCommentPlaceholder")}
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
          />
          <button
            type="submit"
            className={btnSecondary}
            disabled={submitting || !commentBody.trim()}
          >
            {t("projectManagement.addComment")}
          </button>
        </form>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <p className="mb-2 text-xs font-medium uppercase text-slate-500">
          {t("projectManagement.attachments")}
        </p>
        <div className="mb-3 space-y-1">
          {files.length === 0 ? (
            <p className="text-sm text-slate-400">{t("projectManagement.noAttachments")}</p>
          ) : (
            files.map((f) => (
              <button
                key={f.id}
                type="button"
                className="block w-full rounded-lg bg-slate-50 px-3 py-2 text-left text-sm text-primary-700 hover:bg-slate-100"
                onClick={() => onDownload(req.id, f.id, f.file_name)}
              >
                {f.file_name}
              </button>
            ))
          )}
        </div>
        <label className={btnSecondary + " cursor-pointer"}>
          {uploading ? t("projectManagement.uploading") : t("projectManagement.uploadFile")}
          <input
            type="file"
            className="hidden"
            disabled={uploading}
            onChange={(e) => onUpload(e.target.files)}
          />
        </label>
      </div>
    </aside>
  );
}

function MemberBlock({
  title,
  members,
  canRemove,
  onRemove,
  removeLabel,
}: {
  title: string;
  members: PMMember[];
  canRemove: boolean;
  onRemove: (m: PMMember) => void;
  removeLabel: string;
}) {
  return (
    <div className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">{title}</p>
      {members.length === 0 ? (
        <p className="text-sm text-slate-400">—</p>
      ) : (
        <ul className="space-y-1">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
            >
              <span>{m.user_name || `#${m.user_id}`}</span>
              {canRemove && (
                <button type="button" className={btnDanger} onClick={() => onRemove(m)}>
                  {removeLabel}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MonitoringView({
  monitoring,
  t,
  onOpenProject,
}: {
  monitoring: PMMonitoring | null;
  t: (k: string) => string;
  onOpenProject: (id: number) => void;
}) {
  if (!monitoring) return <p className="text-slate-500">{t("common.loading")}</p>;
  const c = monitoring.counts;
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-900">
        {t("projectManagement.monitoringTitle")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          [t("projectManagement.activeProjects"), c.active_projects],
          [t("projectManagement.openRequests"), c.open],
          [t("projectManagement.inProgressRequests"), c.in_progress],
          [t("projectManagement.closedByCoder"), c.closed_by_coder],
          [t("projectManagement.overdueProjects"), c.overdue_projects],
          [t("projectManagement.overdueRequests"), c.overdue_requests],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-card border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>
      <section>
        <h3 className="mb-2 font-medium text-slate-800">
          {t("projectManagement.overdueProjects")}
        </h3>
        {monitoring.overdue_projects.length === 0 ? (
          <p className="text-sm text-slate-500">{t("projectManagement.noneOverdue")}</p>
        ) : (
          <ul className="space-y-2">
            {monitoring.overdue_projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-left text-sm hover:bg-red-100"
                  onClick={() => onOpenProject(p.id)}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-red-700">
                    {t("projectManagement.deadline")}: {p.deadline}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button type="button" className="text-slate-400" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  t,
  submitting,
  onCancel,
}: {
  t: (k: string) => string;
  submitting: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" className={btnSecondary} onClick={onCancel}>
        {t("common.cancel")}
      </button>
      <button type="submit" className={btnPrimary} disabled={submitting}>
        {t("common.save")}
      </button>
    </div>
  );
}
