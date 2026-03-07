# HelpDesk Docker Setup

Bu loyiha Docker orqali ishga tushirish uchun tayyorlangan.

## Talablar

- Docker
- Docker Compose

## Tez boshlash

### Development (Development mode)

**Windows:**
```bash
start.bat
```

**Linux/Mac:**
```bash
chmod +x start.sh
./start.sh
```

**Yoki qo'lda:**

1. `.env.example` faylini `.env` ga nusxalang va kerakli o'zgarishlarni kiriting:

```bash
cp .env.example .env
```

2. Docker container'larni ishga tushiring:

```bash
docker-compose up -d
```

3. Backend avtomatik reload bo'ladi (kod o'zgarishlarida).
4. Frontend: http://localhost:3000
5. Backend API: http://localhost:8000
6. MinIO Console: http://localhost:9001

### Production

1. `.env` faylini yarating va production qiymatlarini kiriting:

```bash
cp .env.example .env
# .env faylini tahrirlang
```

2. Production mode'da ishga tushiring:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Container'lar

- **postgres**: PostgreSQL database (port 5432)
- **backend**: FastAPI backend (port 8000)
- **frontend**: Next.js frontend (port 3000)
- **minio**: MinIO object storage (ports 9000, 9001)

## MinIO

MinIO file storage tizimi Docker'da ishga tushirilgan va backend'da service mavjud (`backend/services/minio_service.py`). 

**Hozirgi holat:**
- MinIO service tayyor, lekin hozircha router'larda ishlatilmayapti
- Bucket avtomatik yaratiladi backend ishga tushganda
- File upload funksiyalari qo'shilganda MinIO ishlatiladi

**MinIO Console:**
- URL: http://localhost:9001
- Login: `minioadmin` / `minioadmin` (default)
- Bucket: `helpdesk-files` (avtomatik yaratiladi)

**Keyingi qadamlar (file upload qo'shilganda):**
- Ticket'larga file attachment qo'shish
- MinIO'ga file upload endpoint qo'shish
- Frontend'da file upload UI qo'shish

## Initial Data (Seed Data)

Backend container ishga tushganda avtomatik ravishda quyidagilar yaratiladi:
- **Default Departments:** IT, Administration, Transport, HR, Finance, Translation
- **Default Meeting Rooms:** B Block 401 Left, B Block 402 Right, C Block 106

Agar siz boshqa department yoki meeting room qo'shmoqchi bo'lsangiz, `backend/seed_data.py` faylini tahrirlang va container'ni qayta ishga tushiring.

**Muhim:** GitHub'dan clone qilgandan keyin:
1. Database bo'sh bo'ladi (ma'lumotlar saqlanmaydi)
2. `seed_data.py` script ishga tushganda default department va meeting room'lar yaratiladi
3. User'lar birinchi LDAP login'da avtomatik yaratiladi
4. Global Admin user'larni department'larga tayinlaydi va role'lar beradi

## Foydali buyruqlar

### Container'larni ko'rish:
```bash
docker-compose ps
```

### Log'larni ko'rish:
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Container'larni to'xtatish:
```bash
docker-compose down
```

### Container'larni to'xtatish va volume'larni o'chirish:
```bash
docker-compose down -v
```

### Qayta build qilish:
```bash
docker-compose build --no-cache
docker-compose up -d
```

### Backend shell'ga kirish:
```bash
docker-compose exec backend bash
```

### Database'ga kirish:
```bash
docker-compose exec postgres psql -U postgres -d HelpDesk
```

## Environment Variables

Asosiy o'zgaruvchilar `.env` faylida:

- `DATABASE_URL`: PostgreSQL connection string (Docker ichida: `postgresql://postgres:postgre@postgres:5432/HelpDesk`)
- `LDAP_SERVER`: LDAP server address
- `JWT_SECRET_KEY`: JWT secret key (production'da o'zgartiring!)
- `NEXT_PUBLIC_API_URL`: Frontend API URL (browser uchun, masalan: `http://localhost:8000/api` yoki production domain)
- `CORS_ORIGINS`: Backend CORS origins (masalan: `http://localhost:3000,http://frontend:3000`)
- Va boshqalar...

**Eslatma:** `NEXT_PUBLIC_API_URL` browser'da ishlatiladi, shuning uchun u public URL bo'lishi kerak (localhost yoki domain), Docker service name emas.

## Migration'lar

Migration'lar backend container ishga tushganda avtomatik ishga tushadi. Agar qo'lda ishga tushirish kerak bo'lsa:

```bash
docker-compose exec backend python add_department_manager_column.py
docker-compose exec backend python add_transport_approver_column.py
docker-compose exec backend python add_it_problem_type_column.py
docker-compose exec backend python add_transport_start_time_column.py
docker-compose exec backend python make_meeting_subject_nullable.py
```

Yoki barcha migration'larni bir vaqtda:

```bash
docker-compose exec backend bash run_migrations.sh
```

## Muammolarni hal qilish

### Backend ishlamayapti:
```bash
docker-compose logs backend
```

### Database connection muammosi:
- `postgres` service'ning `healthcheck` natijasini tekshiring
- `DATABASE_URL` to'g'ri ekanligini tekshiring

### Frontend build muammosi:
```bash
docker-compose build --no-cache frontend
```

### Port'lar band:
- `.env` faylida port'larni o'zgartiring
- Yoki `docker-compose.yml` da port mapping'larni o'zgartiring

### Frontend build xatosi (standalone):
- `next.config.mjs` da `output: 'standalone'` borligini tekshiring
- Build qayta ishga tushiring: `docker-compose build --no-cache frontend`

## Qo'shimcha ma'lumot

- Backend kod o'zgarishlarida avtomatik reload bo'ladi (development mode)
- Database ma'lumotlari `postgres_data` volume'da saqlanadi
- MinIO fayllar `minio_data` volume'da saqlanadi
- Barcha migration'lar backend ishga tushganda avtomatik ishga tushadi
