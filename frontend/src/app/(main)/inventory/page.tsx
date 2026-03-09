"use client";

import { useState, useEffect } from "react";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { inventory as invApi, type InventoryType, type InventoryItem } from "@/lib/api";
import { formatDateUTC5 } from "@/lib/dateUtils";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20";
const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2";
const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300";

const STATUS_LABELS: Record<string, string> = {
  available: "Available",
  assigned: "Assigned",
  damaged: "Damaged",
  maintenance: "Maintenance",
  retired: "Retired",
};

export default function InventoryPage() {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const [tab, setTab] = useState<"my" | "manage">("my");
  const [myItems, setMyItems] = useState<InventoryItem[]>([]);
  const [allItems, setAllItems] = useState<InventoryItem[]>([]);
  const [types, setTypes] = useState<InventoryType[]>([]);
  const [users, setUsers] = useState<{ id: number; display_name: string; ldap_username: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"new-type" | "new-item" | "add-my" | "assign" | "edit-item" | null>(null);
  const [assignItemId, setAssignItemId] = useState<number | null>(null);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [filterUserId, setFilterUserId] = useState<number | null>(null);
  const [filterTypeId, setFilterTypeId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [formType, setFormType] = useState({ name: "", name_ru: "", description: "" });
  const [formItem, setFormItem] = useState({
    type_id: 0,
    name: "",
    serial_number: "",
    model: "",
    brand: "",
    notes: "",
  });
  const [assignUserId, setAssignUserId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isManager = user?.roles?.some((r) => r.role_type === "inventory_manager") ?? false;

  async function loadMyItems() {
    try {
      const data = await invApi.myItems();
      setMyItems(data);
    } catch (e) {
      setMyItems([]);
    }
  }

  async function loadAll() {
    if (!isManager) return;
    setLoading(true);
    try {
      const [itemsData, typesData, usersData] = await Promise.all([
        invApi.items({
          user_id: filterUserId ?? undefined,
          type_id: filterTypeId ?? undefined,
          status: filterStatus || undefined,
        }),
        invApi.types(),
        invApi.users(),
      ]);
      setAllItems(itemsData);
      setTypes(typesData);
      setUsers(usersData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAllItems([]);
      setTypes([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMyItems();
  }, [user]);

  async function addMyItem(e: React.FormEvent) {
    e.preventDefault();
    if (!formItem.type_id || !formItem.name.trim()) return;
    setSubmitting(true);
    try {
      await invApi.addMyItem({
        type_id: formItem.type_id,
        name: formItem.name.trim(),
        serial_number: formItem.serial_number.trim() || undefined,
        model: formItem.model.trim() || undefined,
        brand: formItem.brand.trim() || undefined,
        notes: formItem.notes.trim() || undefined,
      });
      setModal(null);
      setFormItem({ type_id: 0, name: "", serial_number: "", model: "", brand: "", notes: "" });
      loadMyItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (tab === "my") {
      loadMyItems();
      invApi.types().then(setTypes).catch(() => []);
    } else if (isManager) {
      loadAll();
    }
  }, [tab, isManager, filterUserId, filterTypeId, filterStatus]);

  async function createType(e: React.FormEvent) {
    e.preventDefault();
    if (!formType.name.trim()) return;
    setSubmitting(true);
    try {
      await invApi.createType({
        name: formType.name.trim(),
        name_ru: formType.name_ru.trim() || undefined,
        description: formType.description.trim() || undefined,
      });
      setModal(null);
      setFormType({ name: "", name_ru: "", description: "" });
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    if (!formItem.type_id || !formItem.name.trim()) return;
    setSubmitting(true);
    try {
      await invApi.createItem({
        type_id: formItem.type_id,
        name: formItem.name.trim(),
        serial_number: formItem.serial_number.trim() || undefined,
        model: formItem.model.trim() || undefined,
        brand: formItem.brand.trim() || undefined,
        notes: formItem.notes.trim() || undefined,
      });
      setModal(null);
      setFormItem({ type_id: 0, name: "", serial_number: "", model: "", brand: "", notes: "" });
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function doAssign() {
    if (!assignItemId || !assignUserId) return;
    setSubmitting(true);
    try {
      await invApi.assignItem(assignItemId, assignUserId);
      setModal(null);
      setAssignItemId(null);
      setAssignUserId(null);
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function doUnassign(itemId: number) {
    if (!confirm(t("inventory.confirmUnassign"))) return;
    setSubmitting(true);
    try {
      await invApi.unassignItem(itemId);
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function updateItem(e: React.FormEvent) {
    e.preventDefault();
    if (!editItem) return;
    setSubmitting(true);
    try {
      await invApi.updateItem(editItem.id, {
        type_id: formItem.type_id || undefined,
        name: formItem.name.trim() || undefined,
        serial_number: formItem.serial_number.trim() || undefined,
        model: formItem.model.trim() || undefined,
        brand: formItem.brand.trim() || undefined,
        status: editItem.status,
        notes: formItem.notes.trim() || undefined,
      });
      setModal(null);
      setEditItem(null);
      setFormItem({ type_id: 0, name: "", serial_number: "", model: "", brand: "", notes: "" });
      loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  function openAssignModal(itemId: number) {
    setAssignItemId(itemId);
    setAssignUserId(null);
    setModal("assign");
  }

  function openEditModal(item: InventoryItem) {
    setEditItem(item);
    setFormItem({
      type_id: item.type_id,
      name: item.name,
      serial_number: item.serial_number || "",
      model: item.model || "",
      brand: item.brand || "",
      notes: item.notes || "",
    });
    setModal("edit-item");
  }

  const typeName = (item: InventoryItem) => (locale === "ru" && item.type_name_ru ? item.type_name_ru : item.type_name);

  return (
    <div className="page-container">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">{t("inventory.title")}</h1>
          <p className="page-subtitle">{t("inventory.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("my")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === "my" ? "bg-primary-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {t("inventory.myItems")}
          </button>
          {isManager && (
            <button
              type="button"
              onClick={() => setTab("manage")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === "manage" ? "bg-primary-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t("inventory.manage")}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 underline">
            {t("common.close")}
          </button>
        </div>
      )}

      {tab === "my" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              {t("inventory.assignedToMe")}
            </h2>
            <button
              type="button"
              onClick={() => { setModal("add-my"); setFormItem({ type_id: types[0]?.id || 0, name: "", serial_number: "", model: "", brand: "", notes: "" }); }}
              className={btnPrimary}
              disabled={types.length === 0}
              title={types.length === 0 ? t("inventory.noTypesHint") : undefined}
            >
              {t("inventory.addMyItem")}
            </button>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {myItems.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-slate-500">{t("inventory.noItems")}</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {myItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 transition hover:border-primary-200"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-800">
                        {typeName(item)}
                      </span>
                      {item.assigned_at && (
                        <span className="text-xs text-slate-500">{formatDateUTC5(item.assigned_at)}</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-slate-900">{item.name}</h3>
                    {(item.serial_number || item.model || item.brand) && (
                      <div className="mt-2 space-y-1 text-sm text-slate-600">
                        {item.serial_number && <p>SN: {item.serial_number}</p>}
                        {item.model && <p>{item.model}</p>}
                        {item.brand && <p>{item.brand}</p>}
                      </div>
                    )}
                    {item.notes && <p className="mt-2 text-xs text-slate-500">{item.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {t("inventory.responsible")}: Djalilov Dilmurod, Musabaed Abubakir
          </p>
        </div>
      )}

      {tab === "manage" && isManager && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => { setModal("new-type"); setFormType({ name: "", name_ru: "", description: "" }); }} className={btnPrimary}>
              {t("inventory.addType")}
            </button>
            <button type="button" onClick={() => { setModal("new-item"); setFormItem({ type_id: types[0]?.id || 0, name: "", serial_number: "", model: "", brand: "", notes: "" }); }} className={btnPrimary}>
              {t("inventory.addItem")}
            </button>
            <select
              value={filterUserId ?? ""}
              onChange={(e) => setFilterUserId(e.target.value ? Number(e.target.value) : null)}
              className={inputClass}
              style={{ maxWidth: 200 }}
            >
              <option value="">{t("inventory.allUsers")}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.display_name}</option>
              ))}
            </select>
            <select
              value={filterTypeId ?? ""}
              onChange={(e) => setFilterTypeId(e.target.value ? Number(e.target.value) : null)}
              className={inputClass}
              style={{ maxWidth: 180 }}
            >
              <option value="">{t("inventory.allTypes")}</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className={inputClass}
              style={{ maxWidth: 150 }}
            >
              <option value="">{t("inventory.allStatuses")}</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="text-slate-500">{t("common.loading")}</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">{t("inventory.type")}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">{t("inventory.name")}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">{t("inventory.serialNumber")}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">{t("inventory.status")}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">{t("inventory.assignedTo")}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {allItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{typeName(item)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{item.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{item.serial_number || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          item.status === "assigned" ? "bg-emerald-100 text-emerald-800" :
                          item.status === "available" ? "bg-blue-100 text-blue-800" :
                          item.status === "damaged" ? "bg-red-100 text-red-800" :
                          item.status === "maintenance" ? "bg-amber-100 text-amber-800" :
                          "bg-slate-100 text-slate-800"
                        }`}>
                          {STATUS_LABELS[item.status] || item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{item.assigned_to_name || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                        <button type="button" onClick={() => openEditModal(item)} className="text-primary-600 hover:underline mr-2">{t("common.edit")}</button>
                        {item.status === "assigned" ? (
                          <button type="button" onClick={() => doUnassign(item.id)} className="text-red-600 hover:underline">{t("inventory.unassign")}</button>
                        ) : (
                          <button type="button" onClick={() => openAssignModal(item.id)} className="text-primary-600 hover:underline">{t("inventory.assign")}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {allItems.length === 0 && (
                <p className="px-4 py-8 text-center text-slate-500">{t("inventory.noItems")}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal: New Type */}
      {modal === "new-type" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">{t("inventory.addType")}</h2>
            <form onSubmit={createType} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.typeName")}</label>
                <input value={formType.name} onChange={(e) => setFormType((f) => ({ ...f, name: e.target.value }))} className={inputClass} required placeholder="PC, Phone, ..." />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.typeNameRu")}</label>
                <input value={formType.name_ru} onChange={(e) => setFormType((f) => ({ ...f, name_ru: e.target.value }))} className={inputClass} placeholder="ПК, Телефон, ..." />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("it.description")}</label>
                <textarea value={formType.description} onChange={(e) => setFormType((f) => ({ ...f, description: e.target.value }))} className={inputClass} rows={2} />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={submitting} className={btnPrimary}>{submitting ? t("common.loading") : t("common.save")}</button>
                <button type="button" onClick={() => setModal(null)} className={btnSecondary}>{t("common.cancel")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add My Item (any user) */}
      {modal === "add-my" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">{t("inventory.addMyItem")}</h2>
            <form onSubmit={addMyItem} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.type")}</label>
                <select value={formItem.type_id} onChange={(e) => setFormItem((f) => ({ ...f, type_id: Number(e.target.value) }))} className={inputClass} required>
                  <option value={0}>—</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.name")}</label>
                <input value={formItem.name} onChange={(e) => setFormItem((f) => ({ ...f, name: e.target.value }))} className={inputClass} required placeholder="Dell Latitude 5520" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.serialNumber")}</label>
                <input value={formItem.serial_number} onChange={(e) => setFormItem((f) => ({ ...f, serial_number: e.target.value }))} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.model")}</label>
                  <input value={formItem.model} onChange={(e) => setFormItem((f) => ({ ...f, model: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.brand")}</label>
                  <input value={formItem.brand} onChange={(e) => setFormItem((f) => ({ ...f, brand: e.target.value }))} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.notes")}</label>
                <textarea value={formItem.notes} onChange={(e) => setFormItem((f) => ({ ...f, notes: e.target.value }))} className={inputClass} rows={2} />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={submitting} className={btnPrimary}>{submitting ? t("common.loading") : t("common.save")}</button>
                <button type="button" onClick={() => setModal(null)} className={btnSecondary}>{t("common.cancel")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Item */}
      {modal === "new-item" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">{t("inventory.addItem")}</h2>
            <form onSubmit={createItem} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.type")}</label>
                <select value={formItem.type_id} onChange={(e) => setFormItem((f) => ({ ...f, type_id: Number(e.target.value) }))} className={inputClass} required>
                  <option value={0}>—</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.name")}</label>
                <input value={formItem.name} onChange={(e) => setFormItem((f) => ({ ...f, name: e.target.value }))} className={inputClass} required placeholder="Dell Latitude 5520" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.serialNumber")}</label>
                <input value={formItem.serial_number} onChange={(e) => setFormItem((f) => ({ ...f, serial_number: e.target.value }))} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.model")}</label>
                  <input value={formItem.model} onChange={(e) => setFormItem((f) => ({ ...f, model: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.brand")}</label>
                  <input value={formItem.brand} onChange={(e) => setFormItem((f) => ({ ...f, brand: e.target.value }))} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.notes")}</label>
                <textarea value={formItem.notes} onChange={(e) => setFormItem((f) => ({ ...f, notes: e.target.value }))} className={inputClass} rows={2} />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={submitting} className={btnPrimary}>{submitting ? t("common.loading") : t("common.save")}</button>
                <button type="button" onClick={() => setModal(null)} className={btnSecondary}>{t("common.cancel")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Assign */}
      {modal === "assign" && assignItemId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">{t("inventory.assign")}</h2>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.selectUser")}</label>
              <select value={assignUserId ?? ""} onChange={(e) => setAssignUserId(e.target.value ? Number(e.target.value) : null)} className={inputClass} required>
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.display_name} ({u.ldap_username})</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={doAssign} disabled={!assignUserId || submitting} className={btnPrimary}>{submitting ? t("common.loading") : t("common.save")}</button>
              <button type="button" onClick={() => setModal(null)} className={btnSecondary}>{t("common.cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Item */}
      {modal === "edit-item" && editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">{t("common.edit")} {editItem.name}</h2>
            <form onSubmit={updateItem} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.type")}</label>
                <select value={formItem.type_id} onChange={(e) => setFormItem((f) => ({ ...f, type_id: Number(e.target.value) }))} className={inputClass} required>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.name")}</label>
                <input value={formItem.name} onChange={(e) => setFormItem((f) => ({ ...f, name: e.target.value }))} className={inputClass} required />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.serialNumber")}</label>
                <input value={formItem.serial_number} onChange={(e) => setFormItem((f) => ({ ...f, serial_number: e.target.value }))} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.model")}</label>
                  <input value={formItem.model} onChange={(e) => setFormItem((f) => ({ ...f, model: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.brand")}</label>
                  <input value={formItem.brand} onChange={(e) => setFormItem((f) => ({ ...f, brand: e.target.value }))} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("inventory.notes")}</label>
                <textarea value={formItem.notes} onChange={(e) => setFormItem((f) => ({ ...f, notes: e.target.value }))} className={inputClass} rows={2} />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={submitting} className={btnPrimary}>{submitting ? t("common.loading") : t("common.save")}</button>
                <button type="button" onClick={() => setModal(null)} className={btnSecondary}>{t("common.cancel")}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
