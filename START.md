# HelpDesk — loyihani ishga tushirish

## Talablar

- **Python 3.10+** (backend)
- **Node.js 18+** va **npm** (frontend)
- **PostgreSQL** — `HelpDesk` database, foydalanuvchi: `postgres`, parol: `postgre`
- **LDAP** server (masalan DC03.atg.uz) — kirish uchun
- **MinIO** (ixtiyoriy, fayl yuklash uchun)

---

## 1. PostgreSQL

Bazani yarating (pgAdmin yoki `psql` da):

```sql
CREATE DATABASE "HelpDesk" OWNER postgres;
-- Parol postgres uchun: postgre (agar boshqacha bo'lsa .env da yozing)
```

---

## 2. Backend (Python)

Terminal 1 da:

```powershell
cd c:\Users\s.shamukhamedov\Desktop\HelpDesk-updated\backend

python -m venv venv
.\venv\Scripts\Activate.ps1

pip install -r requirements.txt
copy .env.example .env
```

`.env` faylini ochib, kerakli joylarni tekshiring:

- `DATABASE_URL=postgresql://postgres:postgre@localhost:5432/HelpDesk`
- `LDAP_SERVER=DC03.atg.uz`
- `JWT_SECRET_KEY=...` (istalgan maxfiy kalit)
- **Lokal admin (LDAP siz):** `LOCAL_ADMIN_USERNAME=admin`, `LOCAL_ADMIN_PASSWORD=admin` — shu login/parol bilan kirish Global Admin beradi. Production da bu ikki qatorni o‘chiring yoki bo‘sh qoldiring.
- MinIO bo‘lsa: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`

Keyin serverni ishga tushiring:

```powershell
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend: **http://localhost:8000**  
API docs: **http://localhost:8000/docs**

---

## 3. Frontend (Next.js)

Yangi terminal (Terminal 2) da:

```powershell
cd c:\Users\s.shamukhamedov\Desktop\HelpDesk-updated\frontend

npm install
npm run dev
```

Frontend: **http://localhost:3000**

API boshqa portda bo‘lsa, `frontend\.env.local` yarating:

```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

---

## 4. Birinchi marta ishlatish

1. Brauzerda **http://localhost:3000** ga kiring.
2. **Login:** agar `.env` da `LOCAL_ADMIN_USERNAME` va `LOCAL_ADMIN_PASSWORD` berilgan bo‘lsa (masalan `admin` / `admin`), shu login va parol bilan kirishingiz mumkin — LDAP kerak emas, user avtomatik Global Admin. Aks holda LDAP (DC03.atg.uz) bilan kiring.
3. Birinchi kirgan user avtomatik yaratiladi va avtomatik **Global Admin** bo‘ladi (lokal).
4. (Ixtiyoriy) .env da AUTO_ADMIN_FIRST_USER=false qilsangiz birinchi user admin bo‘lmaydi.  
   Dastlab biror user ni Admin qilish uchun ma’lumotlar bazasida `user_roles` jadvaliga qo‘l bilan yozish yoki keyingi versiyada “birinchi user = admin” qoidasi qo‘shish mumkin.  
   Hozircha: PostgreSQL da `users` dan birinchi user ning `id` sini biling, keyin:
   (Birinchi user endi avtomatik Global Admin — qo‘lda SQL kerak emas.)
5. **Admin** panelida: Departments, Users (department va approver berish), Meeting Rooms, Cars, Drivers, Top Managers, rollarni berish.

---

## LDAP bilan kirish ishlamasa

Backend **Active Directory** (Windows DC, masalan `DC03.atg.uz`) bilan ishlash uchun sozlandi. Quyidagilarni tekshiring:

1. **`.env` da LDAP sozlamalari**
   - `LDAP_AUTH_STYLE=ad` — AD uchun. Agar server OpenLDAP bo‘lsa, `LDAP_AUTH_STYLE=openldap` qiling.
   - `LDAP_DOMAIN=atg.uz` — domen (UPN uchun: `foydalanuvchi@atg.uz`). Bo‘sh qoldirsangiz, `LDAP_BASE_DN` dan olinadi (DC=atg,DC=uz → atg.uz).
   - `LDAP_SERVER`, `LDAP_PORT`, `LDAP_BASE_DN` to‘g‘ri ekanligini tekshiring.

2. **Tarmoq**
   - Backend serverdan `LDAP_SERVER` (masalan DC03.atg.uz) ga `LDAP_PORT` (389 yoki 636) orqali ulanishi kerak. Firewall yoki VPN tufayli bloklangan bo‘lishi mumkin.

3. **Login formati**
   - Qo‘llab-quvvatlanadigan formatlar:
     - **sAMAccountName** (masalan `a.kuchkarov`) — kod ichida `a.kuchkarov@atg.uz` (UPN) ga o‘giriladi.
     - **UPN** (masalan `a.kuchkarov@atg.uz`) — to‘g‘ridan-to‘g‘ri ishlatiladi.
     - **DOMAIN\\username** (masalan `ATG\a.kuchkarov`) — to‘g‘ridan-to‘g‘ri ishlatiladi.
   - Barcha formatlar bir xil user ni ochadi (database da sAMAccountName saqlanadi).
   - Agar "Invalid credentials" chiqsa: parol noto‘g‘ri yoki AD da shu user bloklangan bo‘lishi mumkin.

4. **Xatolarni ko‘rish**
   - Backend konsolida (uvicorn ishlayotgan terminal) LDAP xatolari `WARNING` darajasida yoziladi. Login urinishida xato chiqsa, shu yerdan sababni ko‘ring.

5. **Lokal test**
   - LDAP siz tekshirish uchun `.env` da `LOCAL_ADMIN_USERNAME=admin` va `LOCAL_ADMIN_PASSWORD=admin123` berib, shu login bilan kiring.

---

## Bazada `priority` ustuni yo‘q xatosi bo‘lsa

Agar baza eski (priority qo‘shilishidan oldin yaratilgan) bo‘lsa, backend papkasida bir marta:

```powershell
cd backend
python add_priority_columns.py
```

Bu skript `it_tickets`, `adm_tickets`, `transport_tickets`, `travel_tickets` jadvallariga `priority` ustunini qo‘shadi.

---

## Bazada Cars/Drivers yangi ustunlari yo‘q bo‘lsa

Agar `cars` va `drivers` jadvallari eski (car_type, brand, phone qo‘shilishidan oldin) bo‘lsa, backend papkasida bir marta:

```powershell
cd backend
python add_car_driver_columns.py
```

Bu skript `cars` jadvaliga `car_type`, `brand` va `drivers` jadvaliga `phone` ustunlarini qo‘shadi.

---

## Departments jadvalida manager_id yo‘q bo‘lsa

Agar `departments` jadvali eski (Department Manager qo‘shilishidan oldin) bo‘lsa, backend papkasida bir marta:

```powershell
cd backend
python add_department_manager_column.py
```

Bu skript `departments` jadvaliga `manager_id` ustunini qo‘shadi (Approver uchun bo‘lim menejeri).

---

## Qisqacha

| Qadam | Joylashuv      | Buyruq |
|-------|----------------|--------|
| 1     | `backend`      | `uvicorn main:app --reload --port 8000` |
| 2     | `frontend`     | `npm run dev` |

Backend: **http://localhost:8000**  
Frontend: **http://localhost:3000**
