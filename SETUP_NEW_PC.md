# Yangi PC'da Setup Qilish (GitHub'dan Clone Qilgandan Keyin)

## Muhim Eslatma

**GitHub'ga yuklanganda database ma'lumotlari yuklanmaydi!** 
- Department'lar
- User'lar  
- Ticket'lar
- Barcha ma'lumotlar

Bularning hammasi yangi database'da bo'sh bo'ladi.

## Setup Qadamlari

### 1. Repository'ni Clone Qiling

```bash
git clone <your-repo-url>
cd HelpDesk-updated
```

### 2. Backend Setup

```bash
cd backend

# Virtual environment yarating
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate  # Linux/Mac

# Dependencies o'rnating
pip install -r requirements.txt

# Environment variables sozlang
cp .env.example .env
# .env faylini tahrirlang: DATABASE_URL, LDAP_SERVER, MINIO_*, JWT_SECRET_KEY
```

### 3. Database Migration va Seed Data

```bash
# Windows:
run_migrations.bat

# Linux/Mac:
chmod +x run_migrations.sh
./run_migrations.sh
```

Bu script quyidagilarni bajaradi:
- ✅ Barcha migration script'larni ishga tushiradi
- ✅ Default department'larni yaratadi (IT, Administration, Transport, HR, Finance, Translation)
- ✅ Default meeting room'larni yaratadi (B Block 401 Left, B Block 402 Right, C Block 106)

### 4. Backend'ni Ishga Tushiring

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### 6. Keyingi Qadamlar

1. **Birinchi LDAP Login:** Birinchi user login qilganda avtomatik database'ga qo'shiladi va Global Admin bo'ladi (agar `AUTO_ADMIN_FIRST_USER=true` bo'lsa)

2. **Admin Panel'da:**
   - User'larni department'larga tayinlang
   - Role'lar bering (IT Admin, IT Engineer, Transport Engineer, va h.k.)
   - Qo'shimcha department'lar yarating (agar kerak bo'lsa)
   - Meeting room'lar, car'lar, driver'lar qo'shing

3. **Department'larni O'zgartirish:**
   - `backend/seed_data.py` faylini tahrirlang
   - `DEFAULT_DEPARTMENTS` list'iga qo'shing yoki o'chiring
   - Script'ni qayta ishga tushiring

## Docker Setup

Agar Docker ishlatayotgan bo'lsangiz:

```bash
# .env faylini yarating
cp .env.example .env

# Container'larni ishga tushiring
docker-compose up -d

# Backend avtomatik ravishda:
# - Migration'larni ishga tushiradi
# - Seed data yaratadi (departments, meeting rooms)
```

## Qo'shimcha Ma'lumotlar

- **Database:** PostgreSQL (ma'lumotlar database'da saqlanadi)
- **MinIO:** File storage (file'lar MinIO'da saqlanadi)
- **LDAP:** User authentication (user'lar LDAP'dan keladi)

## Troubleshooting

### Department'lar ko'rinmayapti?
- `seed_data.py` script'ni qo'lda ishga tushiring: `python seed_data.py`
- Database'ga ulanishni tekshiring

### User'lar ko'rinmayapti?
- LDAP login qiling - user avtomatik yaratiladi
- Admin panel'da user'larni department'larga tayinlang

### Migration xatolari?
- Database'ni tozalang va qayta yarating
- Migration script'larni ketma-ket ishga tushiring
