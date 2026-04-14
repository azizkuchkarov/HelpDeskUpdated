"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { admin as adminApi } from "@/lib/api";

type Department = { id: number; name: string; name_ru: string | null; manager_id: number | null; manager_name: string | null };
type UserRow = {
  id: number;
  ldap_username: string;
  display_name: string;
  email: string;
  telegram_chat_id?: string | null;
  department_id: number | null;
  roles: { role_type: string; section: string | null }[];
  approver_id: number | null;
};

const ROLE_OPTIONS = [
  { value: "user", label: "User" },
  { value: "global_admin", label: "Global Admin" },
  { value: "manager", label: "Manager" },
  { value: "it_admin", label: "IT Admin" },
  { value: "it_engineer", label: "IT Engineer" },
  { value: "it_reassign_engineer", label: "IT Reassign Engineer" },
  { value: "adm_engineer", label: "Administration Engineer" },
  { value: "adm_manager", label: "Administration Manager" },
  { value: "adm_ticket_engineer", label: "Administration Ticket Engineer" },
  { value: "hotel_engineer", label: "Hotel Engineer" },
  { value: "secretary", label: "Secretary" },
  { value: "transport_engineer", label: "Transport Engineer" },
  { value: "hr_manager", label: "HR Manager" },
  { value: "inventory_manager", label: "Inventory Manager" },
  { value: "adm_monitoring_manager", label: "Administration Monitoring Manager" },
  { value: "translator_admin", label: "Translator Admin" },
  { value: "translator_engineer", label: "Translator Engineer" },
  { value: "checkin_engineer", label: "Check-in Engineer" },
];

type AdminView = "main" | "workflow-approve" | "new-users" | "departments" | "rooms" | "cars" | "drivers" | "topmanagers";

const adminSections: { id: AdminView; key: string; descKey: string; icon: string }[] = [
  { id: "workflow-approve", key: "admin.workflowApprove", descKey: "admin.workflowApproveDesc", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { id: "new-users", key: "admin.newUsers", descKey: "admin.newUsersDesc", icon: "M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" },
  { id: "departments", key: "admin.departments", descKey: "admin.departmentsDesc", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
  { id: "rooms", key: "admin.meetingRooms", descKey: "admin.meetingRooms", icon: "M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" },
  { id: "cars", key: "admin.cars", descKey: "admin.cars", icon: "M8 7h8m-8 4h8m-2 4l2 2 4-4" },
  { id: "drivers", key: "admin.drivers", descKey: "admin.drivers", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
  { id: "topmanagers", key: "admin.topManagers", descKey: "admin.topManagers", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
];

const btnPrimary = "inline-flex items-center justify-center rounded-input bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2";
const btnSecondary = "inline-flex items-center justify-center rounded-input border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300";
const inputClass = "w-full rounded-input border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20";
const labelClass = "mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500";

export default function AdminPage() {
  const { t } = useLocale();
  const { user: currentUser } = useAuth();
  const [view, setView] = useState<AdminView>("main");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [rooms, setRooms] = useState<{ id: number; name: string }[]>([]);
  const [cars, setCars] = useState<{ id: number; name: string }[]>([]);
  const [drivers, setDrivers] = useState<{ id: number; name: string }[]>([]);
  const [topManagers, setTopManagers] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<string | null>(null);
  const [deptForm, setDeptForm] = useState({ name: "", name_ru: "" });
  const [editingDeptId, setEditingDeptId] = useState<number | null>(null);
  const [editingTmId, setEditingTmId] = useState<number | null>(null);
  const [roomForm, setRoomForm] = useState({ name: "" });
  const [carForm, setCarForm] = useState({ name: "", car_type: "", brand: "" });
  const [driverForm, setDriverForm] = useState({ name: "", phone: "" });
  const [tmForm, setTmForm] = useState({ name: "" });
  const [userRoleToAdd, setUserRoleToAdd] = useState("");
  const [secretaryLink, setSecretaryLink] = useState({ secretary_id: 0, top_manager_id: 0 });
  const [expandedDeptId, setExpandedDeptId] = useState<number | null>(null);
  const [workflowAddSelection, setWorkflowAddSelection] = useState<Record<string, number>>({});
  const [telegramDraftByUser, setTelegramDraftByUser] = useState<Record<number, string>>({});

  const isAdmin = currentUser?.roles?.some((r) => r.role_type === "global_admin") ?? false;

  const newUsers = users.filter((u) => u.department_id == null);

  function usersWithRole(roleType: string): UserRow[] {
    return users.filter((u) => u.roles.some((r) => r.role_type === roleType));
  }

  function usersWithoutRole(roleType: string): UserRow[] {
    return users.filter((u) => !u.roles.some((r) => r.role_type === roleType));
  }

  function renderRoleBlock(roleType: string, labelKey: string, options?: { allowTelegramChatId?: boolean }) {
    const list = usersWithRole(roleType);
    const available = usersWithoutRole(roleType);
    const selected = workflowAddSelection[roleType];
    const allowTelegramChatId = options?.allowTelegramChatId ?? false;
    return (
      <div key={roleType} className="mb-4">
        <p className={labelClass}>{t(labelKey)}</p>
        <div className="flex flex-wrap items-center gap-2">
          {list.length === 0 ? (
            <span className="text-sm text-slate-500">—</span>
          ) : (
            list.map((u) => (
              <div key={u.id} className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-slate-100 px-2 py-1 text-sm">
                <span>{u.display_name || u.ldap_username}</span>
                {allowTelegramChatId && (
                  <>
                    <input
                      type="text"
                      value={telegramDraftByUser[u.id] ?? (u.telegram_chat_id || "")}
                      onChange={(e) => setTelegramDraftByUser((s) => ({ ...s, [u.id]: e.target.value }))}
                      placeholder={t("admin.telegramChatId")}
                      className="w-44 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const value = (telegramDraftByUser[u.id] ?? (u.telegram_chat_id || "")).trim();
                        await adminApi.setUserTelegramChatId(u.id, value || null);
                        load();
                      }}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {t("common.save")}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await adminApi.testUserTelegram(u.id);
                          alert(t("admin.telegramTestSent"));
                        } catch (e) {
                          const msg = e instanceof Error ? e.message : String(e);
                          alert(msg);
                        }
                      }}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {t("admin.telegramTest")}
                    </button>
                  </>
                )}
                <button type="button" onClick={() => removeRole(u.id, roleType)} className="text-red-600 hover:underline">×</button>
              </div>
            ))
          )}
          {available.length > 0 && (
            <>
              <select
                value={selected ?? ""}
                onChange={(e) => setWorkflowAddSelection((s) => ({ ...s, [roleType]: Number(e.target.value) || 0 }))}
                className="rounded-input border border-slate-300 bg-white px-3 py-1.5 text-sm"
              >
                <option value="">— {t("admin.wfAddRole")} —</option>
                {available.map((u) => (
                  <option key={u.id} value={u.id}>{u.display_name || u.ldap_username}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={async () => { if (selected) { await addUserRole(selected, roleType); setWorkflowAddSelection((s) => ({ ...s, [roleType]: 0 })); } }}
                disabled={!selected}
                className={btnSecondary + " text-sm"}
              >
                {t("admin.wfAddRole")}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  function getDeptUsers(deptId: number): UserRow[] {
    return users.filter((u) => u.department_id === deptId);
  }

  function getDeptManagerUser(dept: Department): UserRow | null {
    if (!dept.manager_id) return null;
    return users.find((u) => u.id === dept.manager_id) ?? null;
  }

  function getDeptUsersWithoutManager(dept: Department): UserRow[] {
    const managerId = dept.manager_id;
    return getDeptUsers(dept.id).filter((u) => u.id !== managerId);
  }

  async function setDeptManager(deptId: number, managerId: number | null) {
    await adminApi.updateDepartment(deptId, { manager_id: managerId });
    load();
  }

  async function load() {
    setLoading(true);
    try {
      const [d, u, r, c, dr, tm] = await Promise.all([
        adminApi.departments(),
        adminApi.users(),
        adminApi.meetingRooms(),
        adminApi.cars(),
        adminApi.drivers(),
        adminApi.topManagers(),
      ]);
      setDepartments(d);
      setUsers(u);
      setRooms(r);
      setCars(c);
      setDrivers(dr);
      setTopManagers(tm);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="page-container">
        <p className="text-red-600">Access denied. Global Admin only.</p>
      </div>
    );
  }

  async function createDepartment(e: React.FormEvent) {
    e.preventDefault();
    await adminApi.createDepartment({ name: deptForm.name, name_ru: deptForm.name_ru || undefined });
    setModal(null);
    setDeptForm({ name: "", name_ru: "" });
    load();
  }

  async function updateDepartment(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDeptId) return;
    await adminApi.updateDepartment(editingDeptId, { name: deptForm.name, name_ru: deptForm.name_ru || undefined });
    setModal(null);
    setEditingDeptId(null);
    setDeptForm({ name: "", name_ru: "" });
    load();
  }

  async function setUserDept(uid: number, deptId: number | null) {
    await adminApi.setUserDepartment(uid, deptId);
    load();
  }

  async function removeUserFromDepartment(uid: number) {
    if (!confirm(t("admin.removeUserFromDept", "Remove user from department?") + " " + t("admin.userWillAppearInNewUsers", "User will appear in New Users section."))) return;
    await adminApi.setUserDepartment(uid, null);
    load();
  }

  async function setUserAppr(uid: number, approverId: number) {
    await adminApi.setUserApprover(uid, approverId);
    load();
  }

  async function addUserRole(uid: number, roleType?: string) {
    const r = roleType ?? userRoleToAdd;
    if (!r) return;
    await adminApi.setUserRole(uid, r);
    if (!roleType) setUserRoleToAdd("");
    load();
  }

  async function removeRole(uid: number, roleType: string) {
    await adminApi.removeUserRole(uid, roleType);
    load();
  }

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    await adminApi.createMeetingRoom({ name: roomForm.name });
    setModal(null);
    setRoomForm({ name: "" });
    load();
  }

  async function createCar(e: React.FormEvent) {
    e.preventDefault();
    await adminApi.createCar({ name: carForm.name, car_type: carForm.car_type || undefined, brand: carForm.brand || undefined });
    setModal(null);
    setCarForm({ name: "", car_type: "", brand: "" });
    load();
  }

  async function createDriver(e: React.FormEvent) {
    e.preventDefault();
    await adminApi.createDriver({ name: driverForm.name, phone: driverForm.phone || undefined });
    setModal(null);
    setDriverForm({ name: "", phone: "" });
    load();
  }

  async function deleteCar(id: number) {
    if (!confirm(t("common.delete") + "?")) return;
    await adminApi.deleteCar(id);
    load();
  }

  async function deleteDriver(id: number) {
    if (!confirm(t("common.delete") + "?")) return;
    await adminApi.deleteDriver(id);
    load();
  }

  async function createTopManager(e: React.FormEvent) {
    e.preventDefault();
    await adminApi.createTopManager({ name: tmForm.name });
    setModal(null);
    setTmForm({ name: "" });
    load();
  }

  async function updateTopManager(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTmId) return;
    await adminApi.updateTopManager(editingTmId, { name: tmForm.name });
    setModal(null);
    setEditingTmId(null);
    setTmForm({ name: "" });
    load();
  }

  async function linkSecretaryTm(e: React.FormEvent) {
    e.preventDefault();
    await adminApi.linkSecretaryTopManager(secretaryLink.secretary_id, secretaryLink.top_manager_id);
    setModal(null);
    setSecretaryLink({ secretary_id: 0, top_manager_id: 0 });
    load();
  }

  function renderUserCard(u: UserRow, options?: { hideApprover?: boolean }) {
    const hideApprover = options?.hideApprover ?? false;
    return (
      <div key={u.id} className="rounded-card border border-slate-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-slate-900">{u.display_name || u.ldap_username}</span>
          <span className="text-sm text-slate-500">{u.ldap_username}</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Department: {departments.find((d) => d.id === u.department_id)?.name ?? "—"}
          {!hideApprover && ` · Approver: ${users.find((x) => x.id === u.approver_id)?.display_name ?? "—"}`}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <span key={r.role_type + (r.section || "")} className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
              {r.role_type}
              <button type="button" onClick={() => removeRole(u.id, r.role_type)} className="text-red-600 hover:underline">×</button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={u.department_id ?? ""}
            onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; setUserDept(u.id, v); }}
            className="rounded-input border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            <option value="">— Remove from Dept —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          {!hideApprover && (
            <select
              value={u.approver_id ?? ""}
              onChange={(e) => { const v = Number(e.target.value); if (v) setUserAppr(u.id, v); }}
              className="rounded-input border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">— Approver —</option>
              {users.filter((x) => x.id !== u.id).map((x) => (
                <option key={x.id} value={x.id}>{x.display_name || x.ldap_username}</option>
              ))}
            </select>
          )}
          <select
            value={userRoleToAdd}
            onChange={(e) => setUserRoleToAdd(e.target.value)}
            className="rounded-input border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            <option value="">+ Role</option>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button type="button" onClick={() => addUserRole(u.id)} disabled={!userRoleToAdd} className={btnSecondary + " text-sm"}>
            Add role
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {view !== "main" && (
        <button type="button" onClick={() => { setView("main"); setExpandedDeptId(null); }} className="mb-4 text-sm font-medium text-primary-600 hover:text-primary-700">
          ← {t("common.back")}
        </button>
      )}

      {view === "main" && (
        <>
          <h1 className="page-title">{t("nav.admin")}</h1>
          <p className="page-subtitle">Manage departments, users, rooms, cars, drivers and top managers.</p>
          <h2 className="mb-4 mt-10 text-xs font-semibold uppercase tracking-wider text-slate-500">Sections</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/phone-directory"
              className="group flex flex-col rounded-card border border-slate-200 bg-white p-5 text-left shadow-card transition-all hover:border-primary-200 hover:shadow-card-hover focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              <span className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary-100 text-primary-600 transition group-hover:bg-primary-200">
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </span>
                <span className="font-semibold text-slate-900">{t("nav.phoneDirectory")}</span>
              </span>
              <span className="mt-2 text-sm text-slate-500">{t("phoneDirectory.uploadSection")}</span>
              <span className="mt-3 inline-flex items-center text-sm font-medium text-primary-600 group-hover:text-primary-700">
                {t("dashboard.goTo")}
                <svg className="ml-1 size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </span>
            </Link>
            {adminSections.map(({ id, key, descKey, icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className="group flex flex-col rounded-card border border-slate-200 bg-white p-5 text-left shadow-card transition-all hover:border-primary-200 hover:shadow-card-hover focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                <span className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary-100 text-primary-600 transition group-hover:bg-primary-200">
                    <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                    </svg>
                  </span>
                  <span className="font-semibold text-slate-900">{t(key)}</span>
                </span>
                <span className="mt-2 text-sm text-slate-500">{t(descKey)}</span>
                <span className="mt-3 inline-flex items-center text-sm font-medium text-primary-600 group-hover:text-primary-700">
                  {t("dashboard.goTo")}
                  <svg className="ml-1 size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {view === "workflow-approve" && (
        <>
          <h1 className="page-title">{t("admin.workflowApprove")}</h1>
          <p className="page-subtitle">{t("admin.workflowApproveDesc")}</p>
          {loading ? (
            <p className="text-slate-500">{t("common.loading")}</p>
          ) : (
            <div className="mt-8 space-y-8">
              {/* IT Section: User → IT Admin → Assign Engineer */}
              <section className="rounded-card border border-slate-200 bg-white p-6 shadow-card">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">IT Section</h2>
                <p className="mb-4 text-sm text-slate-600">User → IT Admin → Assign Engineer</p>
                {renderRoleBlock("it_admin", "admin.wfItAdmin", { allowTelegramChatId: true })}
                {renderRoleBlock("it_engineer", "admin.wfItEngineer", { allowTelegramChatId: true })}
                <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("admin.wfItReassignSectionTitle")}</p>
                <p className="mb-4 text-sm text-slate-600">{t("admin.wfItReassignEngineerDesc")}</p>
                {renderRoleBlock("it_reassign_engineer", "admin.wfItReassignEngineer")}
              </section>

              {/* Administration: User → Administration Engineer → Close */}
              <section className="rounded-card border border-slate-200 bg-white p-6 shadow-card">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">Administration</h2>
                <p className="mb-4 text-sm text-slate-600">User → Administration Engineer → Close process</p>
                {renderRoleBlock("adm_engineer", "admin.wfAdmEngineer")}
              </section>

              {/* Transport: Daily + Overtime */}
              <section className="rounded-card border border-slate-200 bg-white p-6 shadow-card">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">Transport</h2>
                <p className="mb-2 text-sm text-slate-600">Daily: User → Department Manager Approve → Transport Engineer</p>
                <p className="mb-2 text-sm text-slate-500">{t("admin.wfDeptManagerNote")}</p>
                <p className="mb-4 text-sm text-slate-600">Overtime: User → Manager approve → HR Approve → Transport Engineer</p>
                {renderRoleBlock("transport_engineer", "admin.wfTransportEngineer", { allowTelegramChatId: true })}
                {renderRoleBlock("hr_manager", "admin.wfHrManager")}
              </section>

              {/* Ticket (Travel): User → Ticket Engineer */}
              <section className="rounded-card border border-slate-200 bg-white p-6 shadow-card">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">Ticket Section (Travel)</h2>
                <p className="mb-4 text-sm text-slate-600">User → Ticket Engineer; when &quot;Book Hotel&quot; is checked, also → Hotel Engineer</p>
                {renderRoleBlock("adm_ticket_engineer", "admin.wfTicketEngineer", { allowTelegramChatId: true })}
                {renderRoleBlock("hotel_engineer", "admin.wfHotelEngineer", { allowTelegramChatId: true })}
              </section>

              {/* Translator: User → Translator Admin → Assign Translator + Check-in → Translator Engineer → Check-in Engineer → User */}
              <section className="rounded-card border border-slate-200 bg-white p-6 shadow-card">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">Translator</h2>
                <p className="mb-4 text-sm text-slate-600">User → Translator Admin assigns Translator Engineer + Check-in Engineer → Translator translates → Check-in approves → User gets final files</p>
                {renderRoleBlock("translator_admin", "admin.wfTranslatorAdmin")}
                {renderRoleBlock("translator_engineer", "admin.wfTranslatorEngineer")}
                {renderRoleBlock("checkin_engineer", "admin.wfCheckinEngineer")}
              </section>

              {/* Inventory: Manager assigns items to users */}
              <section className="rounded-card border border-slate-200 bg-white p-6 shadow-card">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">Inventory</h2>
                <p className="mb-4 text-sm text-slate-600">Inventory Manager adds items (PC, Phone, etc.) and assigns them to users. Responsible: Djalilov Dilmurod, Musabaed Abubakir.</p>
                {renderRoleBlock("inventory_manager", "admin.wfInventoryManager")}
              </section>

              {/* Top Managers: Secretary → Top managers */}
              <section className="rounded-card border border-slate-200 bg-white p-6 shadow-card">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">Top Managers</h2>
                <p className="mb-4 text-sm text-slate-600">Secretary links to Top managers</p>
                {renderRoleBlock("secretary", "admin.wfSecretary")}
                <div className="mt-4">
                  <button type="button" onClick={() => setModal("link-secretary")} className={btnSecondary}>
                    {t("admin.wfLinkSecretary")}
                  </button>
                </div>
              </section>
            </div>
          )}
        </>
      )}

      {view === "new-users" && (
        <>
          <h1 className="page-title">{t("admin.newUsers")}</h1>
          <p className="page-subtitle">{t("admin.newUsersDesc")}</p>
          {loading ? (
            <p className="text-slate-500">{t("common.loading")}</p>
          ) : newUsers.length === 0 ? (
            <p className="rounded-card border border-slate-200 bg-white p-6 text-slate-500">{t("admin.noNewUsers")}</p>
          ) : (
            <div className="mt-6 space-y-4">
              {newUsers.map((u) => renderUserCard(u, { hideApprover: true }))}
            </div>
          )}
        </>
      )}

      {view === "departments" && (
        <>
          <div className="page-header">
            <h1 className="page-title">{t("admin.departments")}</h1>
            <button type="button" onClick={() => { setModal("dept"); setEditingDeptId(null); setDeptForm({ name: "", name_ru: "" }); }} className={btnPrimary}>
              {t("admin.addDepartment")}
            </button>
          </div>
          {loading ? (
            <p className="text-slate-500">{t("common.loading")}</p>
          ) : departments.length === 0 ? (
            <p className="rounded-card border border-slate-200 bg-white p-6 text-slate-500">{t("admin.noDepartments")}</p>
          ) : (
            <div className="mt-6 space-y-2">
              {departments.map((d) => (
                <div key={d.id} className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-card">
                  <button
                    type="button"
                    onClick={() => setExpandedDeptId(expandedDeptId === d.id ? null : d.id)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-900">
                      {d.name} {d.name_ru && `(${d.name_ru})`}
                    </span>
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditingDeptId(d.id); setDeptForm({ name: d.name, name_ru: d.name_ru || "" }); setModal("dept-edit"); }}
                        className={btnSecondary + " text-sm"}
                      >
                        {t("common.edit")}
                      </button>
                      <svg className={`size-5 text-slate-500 transition ${expandedDeptId === d.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </span>
                  </button>
                  {expandedDeptId === d.id && (
                    <div className="border-t border-slate-200 bg-slate-50/50 px-4 py-4">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("admin.deptManager")}</h3>
                      <div className="mb-4">
                        <div className="flex items-center gap-2">
                          <select
                            value={d.manager_id ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDeptManager(d.id, v ? Number(v) : null);
                            }}
                            className="flex-1 rounded-input border border-slate-300 bg-white px-3 py-1.5 text-sm"
                          >
                            <option value="">— {t("admin.selectManager")} —</option>
                            {getDeptUsers(d.id).map((u) => (
                              <option key={u.id} value={u.id}>{u.display_name || u.ldap_username}</option>
                            ))}
                          </select>
                          {d.manager_id && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(t("admin.removeManager", "Remove manager from department?") + " " + t("admin.managerWillRemainInDept", "Manager will remain in the department but won't be the manager anymore."))) {
                                  setDeptManager(d.id, null);
                                }
                              }}
                              className="rounded p-1.5 text-red-600 transition hover:bg-red-50"
                              title={t("admin.removeManager", "Remove manager")}
                            >
                              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {d.manager_name && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-700">{d.manager_name}</span>
                            <span className="text-xs text-slate-500">(Manager)</span>
                          </div>
                        )}
                      </div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("admin.managers")} (1)</h3>
                      <ul className="mb-4 space-y-1">
                        {getDeptManagerUser(d) ? (
                          <li className="text-sm font-medium text-slate-800">{getDeptManagerUser(d)!.display_name || getDeptManagerUser(d)!.ldap_username}</li>
                        ) : (
                          <li className="text-sm text-slate-500">—</li>
                        )}
                      </ul>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("admin.users")}</h3>
                      <div className="space-y-3">
                        {getDeptUsersWithoutManager(d).length === 0 ? (
                          <p className="text-sm text-slate-500">—</p>
                        ) : (
                          getDeptUsersWithoutManager(d).map((u) => (
                            <div key={u.id} className="relative">
                              {renderUserCard(u, { hideApprover: true })}
                              <button
                                type="button"
                                onClick={() => removeUserFromDepartment(u.id)}
                                className="absolute right-2 top-2 rounded p-1 text-red-600 transition hover:bg-red-50"
                                title={t("admin.removeFromDept", "Remove from department")}
                              >
                                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view === "rooms" && (
        <>
          <div className="page-header">
            <h1 className="page-title">{t("admin.meetingRooms")}</h1>
            <button type="button" onClick={() => setModal("room")} className={btnPrimary}>Add meeting room</button>
          </div>
          {loading ? <p className="text-slate-500">{t("common.loading")}</p> : (
            <ul className="mt-6 space-y-2">
              {rooms.map((r) => (<li key={r.id} className="rounded-card border border-slate-200 bg-white px-4 py-3">{r.name}</li>))}
            </ul>
          )}
        </>
      )}

      {view === "cars" && (
        <>
          <div className="page-header">
            <h1 className="page-title">{t("admin.cars")}</h1>
            <button type="button" onClick={() => setModal("car")} className={btnPrimary}>Add car</button>
          </div>
          {loading ? <p className="text-slate-500">{t("common.loading")}</p> : (
            <ul className="mt-6 space-y-2">
              {cars.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-card border border-slate-200 bg-white px-4 py-3">
                  <span>
                    {c.name}
                    {(c.car_type || c.brand) && (
                      <span className="ml-2 text-sm text-slate-500">
                        {[c.car_type, c.brand].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <button type="button" onClick={() => deleteCar(c.id)} className="text-sm text-red-600 hover:underline">{t("common.delete")}</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {view === "drivers" && (
        <>
          <div className="page-header">
            <h1 className="page-title">{t("admin.drivers")}</h1>
            <button type="button" onClick={() => setModal("driver")} className={btnPrimary}>Add driver</button>
          </div>
          {loading ? <p className="text-slate-500">{t("common.loading")}</p> : (
            <ul className="mt-6 space-y-2">
              {drivers.map((d) => (
                <li key={d.id} className="flex items-center justify-between rounded-card border border-slate-200 bg-white px-4 py-3">
                  <span>
                    {d.name}
                    {d.phone && <span className="ml-2 text-sm text-slate-500">{d.phone}</span>}
                  </span>
                  <button type="button" onClick={() => deleteDriver(d.id)} className="text-sm text-red-600 hover:underline">{t("common.delete")}</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {view === "topmanagers" && (
        <>
          <div className="page-header">
            <h1 className="page-title">{t("admin.topManagers")}</h1>
            <div className="flex gap-2">
              <button type="button" onClick={() => setModal("tm")} className={btnPrimary}>Add top manager</button>
              <button type="button" onClick={() => setModal("link-secretary")} className={btnSecondary}>Link Secretary to Top Manager</button>
            </div>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Linked secretaries can set At Work / Not at Work. If a secretary does not see the controls, they may need to refresh the page.
          </p>
          {loading ? <p className="text-slate-500">{t("common.loading")}</p> : (
            <ul className="mt-6 space-y-2">
              {topManagers.map((tm) => (
                <li key={tm.id} className="flex items-center justify-between rounded-card border border-slate-200 bg-white px-4 py-3">
                  <span>{tm.name}</span>
                  <button
                    type="button"
                    onClick={() => { setEditingTmId(tm.id); setTmForm({ name: tm.name }); setModal("tm-edit"); }}
                    className={btnSecondary + " text-sm"}
                  >
                    {t("common.edit")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Modals */}
      {modal === "dept" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">Add department</h2>
            <form onSubmit={createDepartment}>
              <div className="mb-3"><label className={labelClass}>Name (EN)</label><input value={deptForm.name} onChange={(e) => setDeptForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} required /></div>
              <div className="mb-3"><label className={labelClass}>Name (RU)</label><input value={deptForm.name_ru} onChange={(e) => setDeptForm((f) => ({ ...f, name_ru: e.target.value }))} className={inputClass} /></div>
              <div className="flex gap-2"><button type="submit" className={btnPrimary}>{t("common.save")}</button><button type="button" onClick={() => setModal(null)} className={btnSecondary}>{t("common.cancel")}</button></div>
            </form>
          </div>
        </div>
      )}

      {modal === "dept-edit" && editingDeptId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">Edit department</h2>
            <form onSubmit={updateDepartment}>
              <div className="mb-3"><label className={labelClass}>Name (EN)</label><input value={deptForm.name} onChange={(e) => setDeptForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} required /></div>
              <div className="mb-3"><label className={labelClass}>Name (RU)</label><input value={deptForm.name_ru} onChange={(e) => setDeptForm((f) => ({ ...f, name_ru: e.target.value }))} className={inputClass} /></div>
              <div className="flex gap-2"><button type="submit" className={btnPrimary}>{t("common.save")}</button><button type="button" onClick={() => setModal(null)} className={btnSecondary}>{t("common.cancel")}</button></div>
            </form>
          </div>
        </div>
      )}

      {modal === "room" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">Add meeting room</h2>
            <form onSubmit={createRoom}>
              <div className="mb-4"><label className={labelClass}>Name</label><input value={roomForm.name} onChange={(e) => setRoomForm({ name: e.target.value })} className={inputClass} required /></div>
              <div className="flex gap-2"><button type="submit" className={btnPrimary}>{t("common.save")}</button><button type="button" onClick={() => setModal(null)} className={btnSecondary}>{t("common.cancel")}</button></div>
            </form>
          </div>
        </div>
      )}

      {modal === "car" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">Add car</h2>
            <form onSubmit={createCar}>
              <div className="mb-3"><label className={labelClass}>Name</label><input value={carForm.name} onChange={(e) => setCarForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} required /></div>
              <div className="mb-3"><label className={labelClass}>{t("admin.carType")}</label><input value={carForm.car_type} onChange={(e) => setCarForm((f) => ({ ...f, car_type: e.target.value }))} className={inputClass} placeholder={t("admin.carTypePlaceholder")} /></div>
              <div className="mb-4"><label className={labelClass}>{t("admin.carBrand")}</label><input value={carForm.brand} onChange={(e) => setCarForm((f) => ({ ...f, brand: e.target.value }))} className={inputClass} placeholder={t("admin.carBrandPlaceholder")} /></div>
              <div className="flex gap-2"><button type="submit" className={btnPrimary}>{t("common.save")}</button><button type="button" onClick={() => setModal(null)} className={btnSecondary}>{t("common.cancel")}</button></div>
            </form>
          </div>
        </div>
      )}

      {modal === "driver" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">Add driver</h2>
            <form onSubmit={createDriver}>
              <div className="mb-3"><label className={labelClass}>Name</label><input value={driverForm.name} onChange={(e) => setDriverForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} required /></div>
              <div className="mb-4"><label className={labelClass}>{t("admin.driverPhone")}</label><input type="tel" value={driverForm.phone} onChange={(e) => setDriverForm((f) => ({ ...f, phone: e.target.value }))} className={inputClass} placeholder="+998 90 123 45 67" /></div>
              <div className="flex gap-2"><button type="submit" className={btnPrimary}>{t("common.save")}</button><button type="button" onClick={() => setModal(null)} className={btnSecondary}>{t("common.cancel")}</button></div>
            </form>
          </div>
        </div>
      )}

      {modal === "tm" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">Add top manager</h2>
            <form onSubmit={createTopManager}>
              <div className="mb-4"><label className={labelClass}>Name</label><input value={tmForm.name} onChange={(e) => setTmForm({ name: e.target.value })} className={inputClass} required /></div>
              <div className="flex gap-2"><button type="submit" className={btnPrimary}>{t("common.save")}</button><button type="button" onClick={() => setModal(null)} className={btnSecondary}>{t("common.cancel")}</button></div>
            </form>
          </div>
        </div>
      )}

      {modal === "tm-edit" && editingTmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={() => { setModal(null); setEditingTmId(null); }}>
          <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">{t("common.edit")} top manager</h2>
            <form onSubmit={updateTopManager}>
              <div className="mb-4"><label className={labelClass}>Name</label><input value={tmForm.name} onChange={(e) => setTmForm({ name: e.target.value })} className={inputClass} required /></div>
              <div className="flex gap-2"><button type="submit" className={btnPrimary}>{t("common.save")}</button><button type="button" onClick={() => { setModal(null); setEditingTmId(null); }} className={btnSecondary}>{t("common.cancel")}</button></div>
            </form>
          </div>
        </div>
      )}

      {modal === "link-secretary" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">Link Secretary to Top Manager</h2>
            <p className="mb-3 text-sm text-slate-600">
              Select a user to link as secretary. They will get Secretary role if needed and can then set At Work / Not at Work for this Top Manager.
            </p>
            <form onSubmit={linkSecretaryTm}>
              <div className="mb-3"><label className={labelClass}>Secretary (user)</label>
                <select value={secretaryLink.secretary_id} onChange={(e) => setSecretaryLink((s) => ({ ...s, secretary_id: Number(e.target.value) }))} className={inputClass} required>
                  <option value={0}>—</option>
                  {users.map((u) => (<option key={u.id} value={u.id}>{u.display_name || u.ldap_username}</option>))}
                </select>
              </div>
              <div className="mb-4"><label className={labelClass}>Top Manager</label>
                <select value={secretaryLink.top_manager_id} onChange={(e) => setSecretaryLink((s) => ({ ...s, top_manager_id: Number(e.target.value) }))} className={inputClass} required>
                  <option value={0}>—</option>
                  {topManagers.map((tm) => (<option key={tm.id} value={tm.id}>{tm.name}</option>))}
                </select>
              </div>
              <div className="flex gap-2"><button type="submit" className={btnPrimary}>{t("common.save")}</button><button type="button" onClick={() => setModal(null)} className={btnSecondary}>{t("common.cancel")}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
