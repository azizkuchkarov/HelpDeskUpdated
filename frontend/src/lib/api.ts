const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export type AdminUser = {
  id: number;
  ldap_username: string;
  display_name: string;
  email: string;
  telegram_chat_id?: string | null;
  department_id: number | null;
  roles: { role_type: string; section: string | null }[];
  approver_id: number | null;
};

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("helpdesk_token");
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (e) {
    const msg = e instanceof TypeError && e.message === "Failed to fetch"
      ? "Cannot reach server. Check that the backend is running and NEXT_PUBLIC_API_URL is correct."
      : (e instanceof Error ? e.message : String(e));
    throw new Error(msg);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || String(res.status));
  }
  return res.json();
}

async function uploadFileApi<T>(
  path: string,
  file: File
): Promise<T> {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  const headers: HeadersInit = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      body: formData,
      headers,
    });
  } catch (e) {
    const msg = e instanceof TypeError && e.message === "Failed to fetch"
      ? "Cannot reach server. Check that the backend is running and NEXT_PUBLIC_API_URL is correct."
      : (e instanceof Error ? e.message : String(e));
    throw new Error(msg);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || String(res.status));
  }
  return res.json();
}

/** Fetch file from API with auth and trigger browser download (no new tab). */
async function downloadFileApi(path: string, fileName: string): Promise<void> {
  const token = getToken();
  const headers: HeadersInit = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers });
  } catch (e) {
    const msg = e instanceof TypeError && e.message === "Failed to fetch"
      ? "Cannot reach server. Check that the backend is running and NEXT_PUBLIC_API_URL is correct."
      : (e instanceof Error ? e.message : String(e));
    throw new Error(msg);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || String(res.status));
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName || "download";
  a.click();
  URL.revokeObjectURL(url);
}

export const auth = {
  login: (username: string, password: string) =>
    api<{ access_token: string; user_id: number }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => api<{ id: number; ldap_username: string; display_name: string; email: string; phone_number: string | null; department_id: number | null; roles: { role_type: string; section: string | null }[]; approver_id: number | null }>("/auth/me"),
  updatePhone: (phone: string | null) =>
    api("/auth/me", { method: "PATCH", body: JSON.stringify({ phone_number: phone || null }) }),
};

export const admin = {
  departments: () => api<{ id: number; name: string; name_ru: string | null; manager_id: number | null; manager_name: string | null }[]>("/admin/departments"),
  createDepartment: (body: { name: string; name_ru?: string }) =>
    api("/admin/departments", { method: "POST", body: JSON.stringify(body) }),
  updateDepartment: (id: number, body: { name?: string; name_ru?: string; is_active?: boolean; manager_id?: number | null }) =>
    api("/admin/departments/" + id, { method: "PATCH", body: JSON.stringify(body) }),
  users: () => api<AdminUser[]>("/admin/users"),
  setUserDepartment: (userId: number, departmentId: number | null) =>
    api("/admin/users/set-department", { method: "POST", body: JSON.stringify({ user_id: userId, department_id: departmentId }) }),
  setUserTelegramChatId: (userId: number, telegramChatId: string | null) =>
    api("/admin/users/set-telegram-chat-id", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, telegram_chat_id: telegramChatId ?? null }),
    }),
  testUserTelegram: (userId: number) =>
    api("/admin/users/" + userId + "/test-telegram", { method: "POST" }),
  setUserApprover: (userId: number, approverId: number, departmentId?: number) =>
    api("/admin/users/set-approver", { method: "POST", body: JSON.stringify({ user_id: userId, approver_id: approverId, department_id: departmentId ?? null }) }),
  setUserRole: (userId: number, roleType: string, section?: string) =>
    api("/admin/users/set-role", { method: "POST", body: JSON.stringify({ user_id: userId, role_type: roleType, section: section ?? null }) }),
  removeUserRole: (userId: number, roleType: string, section?: string) =>
    api("/admin/users/" + userId + "/roles/" + encodeURIComponent(roleType) + (section ? "?section=" + encodeURIComponent(section) : ""), { method: "DELETE" }),
  meetingRooms: () => api<{ id: number; name: string }[]>("/admin/meeting-rooms"),
  createMeetingRoom: (body: { name: string; name_ru?: string }) =>
    api("/admin/meeting-rooms", { method: "POST", body: JSON.stringify(body) }),
  cars: () => api<{ id: number; name: string; car_type?: string; brand?: string }[]>("/admin/cars"),
  createCar: (body: { name: string; car_type?: string; brand?: string }) => api("/admin/cars", { method: "POST", body: JSON.stringify(body) }),
  deleteCar: (id: number) => api("/admin/cars/" + id, { method: "DELETE" }),
  drivers: () => api<{ id: number; name: string; phone?: string }[]>("/admin/drivers"),
  createDriver: (body: { name: string; phone?: string }) => api("/admin/drivers", { method: "POST", body: JSON.stringify(body) }),
  deleteDriver: (id: number) => api("/admin/drivers/" + id, { method: "DELETE" }),
  topManagers: () => api<{ id: number; name: string }[]>("/admin/top-managers"),
  createTopManager: (body: { name: string; user_id?: number }) =>
    api("/admin/top-managers", { method: "POST", body: JSON.stringify(body) }),
  updateTopManager: (id: number, body: { name?: string; user_id?: number | null }) =>
    api("/admin/top-managers/" + id, { method: "PATCH", body: JSON.stringify(body) }),
  linkSecretaryTopManager: (secretaryId: number, topManagerId: number) =>
    api("/admin/secretary-top-managers", { method: "POST", body: JSON.stringify({ secretary_id: secretaryId, top_manager_id: topManagerId }) }),
};

export type ITTicket = {
  id: number;
  problem_type: string | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  created_by_id: number;
  created_by_name: string;
  opened_on_behalf_by_id?: number | null;
  opened_on_behalf_name?: string | null;
  assigned_engineer_id: number | null;
  assigned_engineer_name: string | null;
  created_at: string;
  closed_at: string | null;
  auto_closed_by_system?: boolean;
  confirmed_by_user_at?: string | null;
};

export type ITTicketComment = {
  id: number;
  author_id: number;
  author_name: string;
  body: string;
  created_at: string | null;
};

export type FileAttachment = {
  id: number;
  file_name: string;
  file_size: number;
  content_type: string | null;
  uploaded_by_name: string;
  created_at: string | null;
};

export const it = {
  engineers: () => api<{ id: number; display_name: string }[]>("/it/engineers"),
  departments: () =>
    api<{ id: number; name: string; name_ru: string | null }[]>("/it/departments"),
  usersInDepartment: (departmentId: number) =>
    api<{ id: number; display_name: string; ldap_username: string }[]>(
      "/it/users-in-department?department_id=" + departmentId
    ),
  tickets: (params?: { status?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api<ITTicket[]>(`/it/tickets${q ? `?${q}` : ""}`);
  },
  getTicket: (id: number) => api<ITTicket>("/it/tickets/" + id),
  getComments: (ticketId: number) => api<ITTicketComment[]>("/it/tickets/" + ticketId + "/comments"),
  addComment: (ticketId: number, body: string) =>
    api<ITTicketComment>("/it/tickets/" + ticketId + "/comments", { method: "POST", body: JSON.stringify({ body }) }),
  createTicket: (opts: {
    problem_type?: string | null;
    title: string;
    description?: string;
    priority?: string;
    department_id?: number | null;
    requester_user_id?: number | null;
  }) =>
    api<{ id: number }>("/it/tickets", {
      method: "POST",
      body: JSON.stringify({
        problem_type: opts.problem_type ?? null,
        title: opts.title,
        description: opts.description,
        priority: opts.priority || "medium",
        department_id: opts.department_id ?? null,
        requester_user_id: opts.requester_user_id ?? null,
      }),
    }),
  assign: (ticketId: number, engineerId: number) =>
    api("/it/tickets/" + ticketId + "/assign", { method: "POST", body: JSON.stringify({ engineer_id: engineerId }) }),
  reassign: (ticketId: number, engineerId: number) =>
    api("/it/tickets/" + ticketId + "/reassign", { method: "POST", body: JSON.stringify({ engineer_id: engineerId }) }),
  start: (ticketId: number) => api("/it/tickets/" + ticketId + "/start", { method: "POST" }),
  closeByEngineer: (ticketId: number) => api("/it/tickets/" + ticketId + "/close-by-engineer", { method: "POST" }),
  confirmByUser: (ticketId: number) => api("/it/tickets/" + ticketId + "/confirm-by-user", { method: "POST" }),
  uploadFile: (ticketId: number, file: File) => uploadFileApi<FileAttachment>("/it/tickets/" + ticketId + "/files", file),
  listFiles: (ticketId: number) => api<FileAttachment[]>("/it/tickets/" + ticketId + "/files"),
  getFileDownloadUrl: (ticketId: number, fileId: number) => api<{ download_url: string }>("/it/tickets/" + ticketId + "/files/" + fileId + "/download"),
  downloadFile: (ticketId: number, fileId: number, fileName: string) =>
    downloadFileApi("/it/tickets/" + ticketId + "/files/" + fileId + "/file", fileName),
};

export type TransportApprover = { id: number; display_name: string; is_manager: boolean };

export type AdmTicketBody = {
  ticket_type: string;
  title: string;
  description?: string;
  priority?: string;
  requires_it?: boolean;
  room_id?: number;
  subject?: string;
  start_at?: string;
  end_at?: string;
};

export type AdmTicket = {
  id: number;
  ticket_type: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  created_by_id: number;
  created_by_name: string;
  assigned_engineer_id: number | null;
  requires_it: boolean;
  it_ticket_id: number | null;
  created_at: string;
  closed_at: string | null;
  meeting_booking: { room_id: number; subject: string | null; start_at: string; end_at: string } | null;
};

export const administration = {
  meetingRooms: () => api<{ id: number; name: string }[]>("/administration/meeting-rooms"),
  bookings: (params?: { room_id?: number; from_date?: string; to_date?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api<unknown[]>(`/administration/bookings${q ? `?${q}` : ""}`);
  },
  tickets: (params?: { status?: string; ticket_type?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api<AdmTicket[]>(`/administration/tickets${q ? `?${q}` : ""}`);
  },
  createTicket: (body: AdmTicketBody) =>
    api<{ id: number }>("/administration/tickets", { method: "POST", body: JSON.stringify({ ...body, priority: body.priority || "medium" }) }),
  closeByEngineer: (ticketId: number) => api("/administration/tickets/" + ticketId + "/close-by-engineer", { method: "POST" }),
  reject: (ticketId: number) => api("/administration/tickets/" + ticketId + "/reject", { method: "POST" }),
  confirmByUser: (ticketId: number) => api("/administration/tickets/" + ticketId + "/confirm-by-user", { method: "POST" }),
  getComments: (ticketId: number) => api<{ id: number; author_id: number; author_name: string; body: string; created_at: string | null }[]>("/administration/tickets/" + ticketId + "/comments"),
  addComment: (ticketId: number, body: string) =>
    api<{ id: number; author_id: number; author_name: string; body: string; created_at: string | null }>("/administration/tickets/" + ticketId + "/comments", { method: "POST", body: JSON.stringify({ body }) }),
  uploadFile: (ticketId: number, file: File) => uploadFileApi<FileAttachment>("/administration/tickets/" + ticketId + "/files", file),
  listFiles: (ticketId: number) => api<FileAttachment[]>("/administration/tickets/" + ticketId + "/files"),
  getFileDownloadUrl: (ticketId: number, fileId: number) => api<{ download_url: string }>("/administration/tickets/" + ticketId + "/files/" + fileId + "/download"),
  downloadFile: (ticketId: number, fileId: number, fileName: string) =>
    downloadFileApi("/administration/tickets/" + ticketId + "/files/" + fileId + "/file", fileName),
};

export type TransportTicketBody = {
  ticket_type: string;
  priority?: string;
  from_location?: string;
  destination: string;
  start_date?: string;
  start_time?: string;
  passenger_count: number;
  approximate_time?: string;
  comment?: string;
  approver_id?: number | null;
  requester_phone?: string;
};

export type TransportTicket = {
  id: number;
  ticket_type: string;
  priority: string;
  from_location: string | null;
  destination: string;
  start_date: string | null;
  start_time: string | null;
  passenger_count: number;
  approximate_time: string | null;
  comment: string | null;
  status: string;
  created_by_id: number;
  created_by_name: string;
  approver_id: number | null;
  approver_name: string | null;
  manager_approved_at: string | null;
  hr_approved_at: string | null;
  car_id: number | null;
  driver_id: number | null;
  car_name: string | null;
  driver_name: string | null;
  ready_at: string | null;
  closed_at: string | null;
  created_at: string;
};

export const transport = {
  cars: () => api<{ id: number; name: string }[]>("/transport/cars"),
  drivers: () => api<{ id: number; name: string }[]>("/transport/drivers"),
  approvers: () => api<TransportApprover[]>("/transport/approvers"),
  tickets: (params?: { status?: string; pending_my_approval?: boolean }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api<TransportTicket[]>(`/transport/tickets${q ? `?${q}` : ""}`);
  },
  createTicket: (body: TransportTicketBody) =>
    api<{ id: number }>("/transport/tickets", { method: "POST", body: JSON.stringify({ ...body, priority: body.priority || "medium" }) }),
  managerApprove: (ticketId: number) => api("/transport/tickets/" + ticketId + "/manager-approve", { method: "POST" }),
  hrApprove: (ticketId: number) => api("/transport/tickets/" + ticketId + "/hr-approve", { method: "POST" }),
  assign: (ticketId: number, carId: number, driverId: number) =>
    api("/transport/tickets/" + ticketId + "/assign", { method: "POST", body: JSON.stringify({ car_id: carId, driver_id: driverId }) }),
  closeByEngineer: (ticketId: number) => api("/transport/tickets/" + ticketId + "/close-by-engineer", { method: "POST" }),
  confirmByUser: (ticketId: number) => api("/transport/tickets/" + ticketId + "/confirm-by-user", { method: "POST" }),
  getComments: (ticketId: number) => api<{ id: number; author_id: number; author_name: string; body: string; created_at: string | null }[]>("/transport/tickets/" + ticketId + "/comments"),
  addComment: (ticketId: number, body: string) =>
    api<{ id: number; author_id: number; author_name: string; body: string; created_at: string | null }>("/transport/tickets/" + ticketId + "/comments", { method: "POST", body: JSON.stringify({ body }) }),
  uploadFile: (ticketId: number, file: File) => uploadFileApi<FileAttachment>("/transport/tickets/" + ticketId + "/files", file),
  listFiles: (ticketId: number) => api<FileAttachment[]>("/transport/tickets/" + ticketId + "/files"),
  getFileDownloadUrl: (ticketId: number, fileId: number) => api<{ download_url: string }>("/transport/tickets/" + ticketId + "/files/" + fileId + "/download"),
  downloadFile: (ticketId: number, fileId: number, fileName: string) =>
    downloadFileApi("/transport/tickets/" + ticketId + "/files/" + fileId + "/file", fileName),
};

export type TravelStatCurrency = "UZS" | "USD" | "CNY";
export type TravelStatBody = {
  travel_ticket_id?: number;
  username?: string;
  source_destination?: string;
  date_time?: string;
  company?: string;
  price?: number;
  currency?: TravelStatCurrency;
};

export type TravelTicket = {
  id: number;
  source_destination_json: string;
  comment: string | null;
  priority: string;
  status: string;
  book_hotel?: boolean;
  created_by_id: number;
  created_by_name: string;
  created_at: string;
  closed_at: string | null;
};

export type TravelStat = {
  id: number;
  travel_ticket_id: number;
  username: string | null;
  source_destination: string;
  date_time: string;
  company: string;
  price: number | null;
  currency: TravelStatCurrency;
  created_at: string;
};

export type TravelPlace = { name: string; countryName: string; display: string };

export const travel = {
  places: (q: string) => {
    if (!q || q.length < 2) return Promise.resolve([] as TravelPlace[]);
    return api<TravelPlace[]>(`/travel/places?q=${encodeURIComponent(q)}`);
  },
  tickets: (params?: { status?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api<TravelTicket[]>(`/travel/tickets${q ? `?${q}` : ""}`);
  },
  createTicket: (segments: { source: string; destination: string; date?: string; time?: string }[], comment?: string, priority?: string, book_hotel?: boolean) =>
    api<{ id: number }>("/travel/tickets", { method: "POST", body: JSON.stringify({ segments, comment, priority: priority || "medium", book_hotel: !!book_hotel }) }),
  close: (ticketId: number) => api("/travel/tickets/" + ticketId + "/close", { method: "POST" }),
  getComments: (ticketId: number) => api<{ id: number; author_id: number; author_name: string; body: string; created_at: string | null }[]>("/travel/tickets/" + ticketId + "/comments"),
  addComment: (ticketId: number, body: string) =>
    api<{ id: number; author_id: number; author_name: string; body: string; created_at: string | null }>("/travel/tickets/" + ticketId + "/comments", { method: "POST", body: JSON.stringify({ body }) }),
  reject: (ticketId: number) => api("/travel/tickets/" + ticketId + "/reject", { method: "POST" }),
  stats: () => api<TravelStat[]>("/travel/stats"),
  createStat: (body: TravelStatBody) => api("/travel/stats", { method: "POST", body: JSON.stringify(body) }),
  updateStat: (statId: number, body: { company: string; price: number; currency: TravelStatCurrency }) =>
    api("/travel/stats/" + statId, { method: "PATCH", body: JSON.stringify(body) }),
  uploadFile: (ticketId: number, file: File) => uploadFileApi<FileAttachment>("/travel/tickets/" + ticketId + "/files", file),
  listFiles: (ticketId: number) => api<FileAttachment[]>("/travel/tickets/" + ticketId + "/files"),
  getFileDownloadUrl: (ticketId: number, fileId: number) => api<{ download_url: string }>("/travel/tickets/" + ticketId + "/files/" + fileId + "/download"),
  downloadFile: (ticketId: number, fileId: number, fileName: string) =>
    downloadFileApi("/travel/tickets/" + ticketId + "/files/" + fileId + "/file", fileName),
};

export type TopManagerMyManager = { id: number; name: string; user_id: number | null };

export type TranslatorTicket = {
  id: number;
  title: string;
  description: string | null;
  source_language: string;
  target_language: string;
  status: string;
  created_by_id: number;
  created_by_name: string;
  assigned_translator_id: number | null;
  assigned_translator_name: string | null;
  assigned_checkin_id: number | null;
  assigned_checkin_name: string | null;
  created_at: string;
  closed_at: string | null;
  translator_started_at: string | null;
  translator_submitted_at: string | null;
  confirmed_by_user_at: string | null;
};

export type TranslatorFile = {
  id: number;
  file_name: string;
  file_size: number;
  content_type: string | null;
  file_category: string | null;
  uploaded_by_name: string;
  created_at: string;
};

export const translator = {
  tickets: (params?: { status?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api<TranslatorTicket[]>(`/translator/tickets${q ? `?${q}` : ""}`);
  },
  getTicket: (id: number) => api<TranslatorTicket>("/translator/tickets/" + id),
  getComments: (ticketId: number) => api<{ id: number; author_id: number; author_name: string; body: string; created_at: string | null }[]>("/translator/tickets/" + ticketId + "/comments"),
  addComment: (ticketId: number, body: string) =>
    api<{ id: number; author_id: number; author_name: string; body: string; created_at: string | null }>("/translator/tickets/" + ticketId + "/comments", { method: "POST", body: JSON.stringify({ body }) }),
  createTicket: (body: { title: string; description?: string; source_language: string; target_language: string }) =>
    api<{ id: number }>("/translator/tickets", { method: "POST", body: JSON.stringify(body) }),
  engineers: () => api<{ id: number; display_name: string; role_type: string }[]>("/translator/engineers"),
  assign: (ticketId: number, translatorId: number, checkinId: number) =>
    api("/translator/tickets/" + ticketId + "/assign", {
      method: "POST",
      body: JSON.stringify({ translator_id: translatorId, checkin_id: checkinId }),
    }),
  uploadOriginal: (ticketId: number, file: File) =>
    uploadFileApi<{ id: number; file_name: string; file_size: number }>("/translator/tickets/" + ticketId + "/upload-original", file),
  uploadTranslated: (ticketId: number, file: File) =>
    uploadFileApi<{ id: number; file_name: string; file_size: number }>("/translator/tickets/" + ticketId + "/upload-translated", file),
  listFiles: (ticketId: number, category?: string) => {
    const q = category ? `?category=${encodeURIComponent(category)}` : "";
    return api<TranslatorFile[]>(`/translator/tickets/${ticketId}/files${q}`);
  },
  getFileDownloadUrl: (ticketId: number, fileId: number) =>
    api<{ download_url: string }>("/translator/tickets/" + ticketId + "/files/" + fileId + "/download"),
  downloadFile: (ticketId: number, fileId: number, fileName: string) =>
    downloadFileApi("/translator/tickets/" + ticketId + "/files/" + fileId + "/file", fileName),
  startTranslation: (ticketId: number) =>
    api("/translator/tickets/" + ticketId + "/start-translation", { method: "POST" }),
  submitToCheckin: (ticketId: number) =>
    api("/translator/tickets/" + ticketId + "/submit-to-checkin", { method: "POST" }),
  checkinApprove: (ticketId: number) =>
    api("/translator/tickets/" + ticketId + "/checkin-approve", { method: "POST" }),
  checkinReject: (ticketId: number) =>
    api("/translator/tickets/" + ticketId + "/checkin-reject", { method: "POST" }),
  confirmByUser: (ticketId: number) =>
    api("/translator/tickets/" + ticketId + "/confirm-by-user", { method: "POST" }),
};

export type InventoryType = { id: number; name: string; name_ru: string | null; description: string | null };
export type InventoryItem = {
  id: number;
  type_id: number;
  type_name: string;
  type_name_ru: string | null;
  name: string;
  serial_number: string | null;
  model: string | null;
  brand: string | null;
  status: string;
  assigned_to_id?: number | null;
  assigned_to_name?: string | null;
  assigned_at?: string | null;
  assigned_by_name?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

export const inventory = {
  types: () => api<InventoryType[]>("/inventory/types"),
  createType: (body: { name: string; name_ru?: string; description?: string }) =>
    api<{ id: number }>("/inventory/types", { method: "POST", body: JSON.stringify(body) }),
  updateType: (id: number, body: { name?: string; name_ru?: string; description?: string; is_active?: boolean }) =>
    api("/inventory/types/" + id, { method: "PATCH", body: JSON.stringify(body) }),
  myItems: () => api<InventoryItem[]>("/inventory/my-items"),
  addMyItem: (body: { type_id: number; name: string; serial_number?: string; model?: string; brand?: string; notes?: string }) =>
    api<InventoryItem>("/inventory/my-items", { method: "POST", body: JSON.stringify(body) }),
  items: (params?: { user_id?: number; type_id?: number; status?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api<InventoryItem[]>(`/inventory/items${q ? `?${q}` : ""}`);
  },
  createItem: (body: { type_id: number; name: string; serial_number?: string; model?: string; brand?: string; notes?: string }) =>
    api<InventoryItem>("/inventory/items", { method: "POST", body: JSON.stringify(body) }),
  updateItem: (id: number, body: { type_id?: number; name?: string; serial_number?: string; model?: string; brand?: string; status?: string; notes?: string }) =>
    api("/inventory/items/" + id, { method: "PATCH", body: JSON.stringify(body) }),
  assignItem: (itemId: number, userId: number) =>
    api<{ ok: boolean; assigned_to: string }>("/inventory/items/" + itemId + "/assign", { method: "POST", body: JSON.stringify({ user_id: userId }) }),
  unassignItem: (itemId: number) => api<{ ok: boolean }>("/inventory/items/" + itemId + "/unassign", { method: "POST" }),
  users: () => api<{ id: number; display_name: string; ldap_username: string }[]>("/inventory/users"),
};

export const phoneDirectory = {
  info: () =>
    api<{ file_name: string | null; uploaded_at: string | null; uploaded_by_name: string | null }>("/phone-directory/info"),
  upload: (file: File) =>
    uploadFileApi<{ ok: boolean; file_name: string; uploaded_at: string }>("/phone-directory/upload", file),
  download: (fileName: string) =>
    downloadFileApi("/phone-directory/download", fileName),
};

export const topManagers = {
  availability: () =>
    api<{ id: number; name: string; status: string | null; comment: string | null; updated_at: string | null }[]>("/top-managers/availability"),
  setAvailability: (topManagerId: number, status: string, comment?: string) =>
    api("/top-managers/availability/" + topManagerId, {
      method: "POST",
      body: JSON.stringify({ status, comment: comment || null }),
    }),
  myManagers: () => api<TopManagerMyManager[]>("/top-managers/my-managers"),
};
