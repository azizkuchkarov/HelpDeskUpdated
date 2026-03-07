# GitHub'ga Yuklash Qo'llanmasi

## 1. Git Repository'ni Boshlash

```bash
cd c:\Users\s.shamukhamedov\Desktop\HelpDesk-updated

# Git repository'ni boshlash
git init

# Barcha fayllarni qo'shish
git add .

# Birinchi commit
git commit -m "Initial commit: HelpDesk system with IT, Admin, Transport, Travel tickets"
```

## 2. GitHub'da Repository Yaratish

1. GitHub.com'ga kiring
2. "New repository" tugmasini bosing
3. Repository nomini kiriting (masalan: `HelpDesk-updated`)
4. Description: "Internal HelpDesk System - IT, Administration, Transport, Travel tickets"
5. **Public** yoki **Private** tanlang
6. **README, .gitignore, license qo'shmaslik** (chunki bizda allaqachon bor)
7. "Create repository" tugmasini bosing

## 3. GitHub'ga Yuklash

GitHub repository yaratilgandan keyin, quyidagi buyruqlarni bajaring:

```bash
# Remote repository'ni qo'shish (YOUR_USERNAME va REPO_NAME o'rniga o'z ma'lumotlaringizni kiriting)
git remote add origin https://github.com/YOUR_USERNAME/HelpDesk-updated.git

# Yoki SSH orqali:
# git remote add origin git@github.com:YOUR_USERNAME/HelpDesk-updated.git

# Branch nomini o'zgartirish (agar kerak bo'lsa)
git branch -M main

# GitHub'ga yuklash
git push -u origin main
```

## 4. Muhim Eslatmalar

### ✅ GitHub'ga Yuklanadigan Fayllar:
- Barcha source code (backend/, frontend/)
- Configuration fayllar (.env.example)
- Migration script'lar
- Seed data script (seed_data.py)
- Documentation (README.md, SETUP_NEW_PC.md, va h.k.)
- Docker fayllar (Dockerfile, docker-compose.yml)

### ❌ GitHub'ga Yuklanmaydigan Fayllar (.gitignore):
- `.env` fayllar (sensitive ma'lumotlar)
- `node_modules/` (frontend dependencies)
- `venv/` yoki `env/` (Python virtual environment)
- `__pycache__/` (Python cache)
- `.next/` (Next.js build)
- Database fayllar
- Log fayllar
- IDE sozlamalari (.vscode/, .idea/)

## 5. Keyingi O'zgarishlarni Yuklash

Kod o'zgarganda:

```bash
# O'zgarishlarni ko'rish
git status

# O'zgarishlarni qo'shish
git add .

# Commit qilish
git commit -m "Description of changes"

# GitHub'ga yuklash
git push
```

## 6. Boshqa PC'da Clone Qilish

```bash
# Repository'ni clone qilish
git clone https://github.com/YOUR_USERNAME/HelpDesk-updated.git
cd HelpDesk-updated

# Setup qilish (SETUP_NEW_PC.md'ga qarang)
cd backend
run_migrations.bat  # Windows
# yoki
./run_migrations.sh  # Linux/Mac
```

## 7. Branch'lar (Ixtiyoriy)

Agar bir nechta developer ishlayotgan bo'lsa:

```bash
# Yangi branch yaratish
git checkout -b feature/new-feature

# O'zgarishlarni commit qilish
git add .
git commit -m "Add new feature"

# GitHub'ga yuklash
git push -u origin feature/new-feature

# Main branch'ga qaytish
git checkout main
```

## 8. .env Fayllarni Eslatma

**Muhim:** `.env` fayllar GitHub'ga yuklanmaydi (xavfsizlik uchun).

Har bir developer:
1. `.env.example` faylini `.env` ga nusxalaydi
2. O'z ma'lumotlarini kirgizadi (DATABASE_URL, LDAP_SERVER, va h.k.)

## 9. Troubleshooting

### "Repository not found" xatosi?
- GitHub'da repository yaratilganini tekshiring
- Remote URL'ni to'g'ri ekanligini tekshiring
- Authentication (username/password yoki SSH key) to'g'ri ekanligini tekshiring

### "Permission denied" xatosi?
- GitHub'da repository'ga access borligini tekshiring
- SSH key sozlanganini tekshiring (agar SSH ishlatayotgan bo'lsangiz)

### "Large files" xatosi?
- `.gitignore` faylida katta fayllar ignore qilinganini tekshiring
- `node_modules/`, `venv/` kabi katta papkalar ignore qilinganini tekshiring
