# MinIO Setup va Tekshirish Qo'llanmasi

## 1. MinIO'ni O'rnatish

### Windows uchun:
1. MinIO'ni [rasmiy saytdan](https://min.io/download) yuklab oling
2. Yoki PowerShell orqali:
   ```powershell
   # Chocolatey orqali
   choco install minio
   
   # Yoki manual yuklab oling va extract qiling
   ```

### Docker orqali (Tavsiya etiladi):
```bash
docker run -d \
  -p 9000:9000 \
  -p 9001:9001 \
  --name minio \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  -v D:\minio-data:/data \
  minio/minio server /data --console-address ":9001"
```

## 2. MinIO'ni Ishga Tushirish

### Standalone (Windows) — C:\minio\minio.exe:
```powershell
# MinIO'ni C:\minio papkasida minio.exe orqali ishga tushiring
C:\minio\minio.exe server C:\minio-data --console-address ":9001"
```

Agar `C:\minio-data` papkasi mavjud bo'lmasa, avval yarating:
```powershell
mkdir C:\minio-data
```

**Yoki boshqa joyda (masalan D:\minio-data):**
```powershell
C:\minio\minio.exe server D:\minio-data --console-address ":9001"
```

### Standalone (PATH orqali):
```powershell
# MinIO'ni ishga tushiring (agar minio PATH ichida bo'lsa)
minio server D:\minio-data --console-address ":9001"
```

### Docker:
```powershell
docker start minio
```

## 3. Sozlamalarni Tekshirish

Backend `.env` faylida quyidagi sozlamalar bo'lishi kerak:

```env
# Use server IP (e.g. 192.168.2.18:9000) if users open files from other PCs; localhost makes download links open on user's machine
MINIO_ENDPOINT=192.168.2.18:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=helpdesk-files
MINIO_SECURE=false
```

## 4. MinIO'ni Tekshirish

### A) Web Console orqali:
1. Browser'da oching: http://localhost:9001
2. Login: `minioadmin` / `minioadmin` (yoki `.env` dagi credentials)
3. Bucket'lar ro'yxatini ko'ring
4. `helpdesk-files` bucket'i mavjudligini tekshiring

### B) Test Script orqali:
```powershell
cd backend
python test_minio.py
```

Bu script quyidagilarni tekshiradi:
- ✅ MinIO server'ga ulanish
- ✅ Bucket'lar ro'yxati
- ✅ `helpdesk-files` bucket'ining mavjudligi
- ✅ File upload test
- ✅ Presigned URL generation test

### C) Backend'ni ishga tushirib tekshirish:
```powershell
cd backend
python -m uvicorn main:app --reload
```

Backend ishga tushganda avtomatik ravishda `helpdesk-files` bucket'i yaratiladi (agar mavjud bo'lmasa).

## 5. Muammolarni Hal Qilish

### Muammo: "Connection refused"
**Yechim:**
- MinIO server ishlamayapti
- `MINIO_ENDPOINT` noto'g'ri (default: `localhost:9000`)
- Firewall port'ni bloklab qo'ygan

### Muammo: "Access Denied"
**Yechim:**
- `MINIO_ACCESS_KEY` va `MINIO_SECRET_KEY` noto'g'ri
- `.env` faylini tekshiring

### Muammo: "Bucket not found"
**Yechim:**
- Backend avtomatik yaratadi, lekin manual ham yaratishingiz mumkin:
  1. Console'ga kiring: http://localhost:9001
  2. "Create Bucket" tugmasini bosing
  3. Nomi: `helpdesk-files`

## 6. Production Sozlamalari

Production'da quyidagilarni o'zgartiring:

```env
MINIO_ENDPOINT=minio.yourdomain.com:9000
MINIO_ACCESS_KEY=<strong-random-key>
MINIO_SECRET_KEY=<strong-random-password>
MINIO_SECURE=true  # HTTPS uchun
```

## 7. File Upload Funksiyasini Test Qilish

1. Frontend'ni ishga tushiring
2. IT/Admin/Transport/Travel section'da yangi ticket yarating
3. File upload qiling
4. Ticket detail view'da file ko'rinishini tekshiring
5. File'ni download qilib tekshiring

## 8. Foydali Komandalar

### Docker orqali:
```powershell
# MinIO'ni ko'rish
docker ps | grep minio

# Log'larni ko'rish
docker logs minio

# MinIO'ni to'xtatish
docker stop minio

# MinIO'ni qayta ishga tushirish
docker start minio
```

### MinIO Client (mc) orqali:
```powershell
# mc o'rnatish
choco install minio-client

# Server'ga ulanish
mc alias set myminio http://localhost:9000 minioadmin minioadmin

# Bucket'lar ro'yxati
mc ls myminio

# File yuklash
mc cp test.txt myminio/helpdesk-files/
```

## 9. Tekshirish Checklist

- [ ] MinIO server ishlamoqda (http://localhost:9001)
- [ ] `.env` faylida MinIO sozlamalari to'g'ri
- [ ] `test_minio.py` script muvaffaqiyatli o'tdi
- [ ] Backend ishga tushganda bucket yaratildi
- [ ] Frontend'da file upload ishlayapti
- [ ] File'lar download qilinayapti

## 10. Qo'shimcha Ma'lumot

- MinIO Console: http://localhost:9001
- MinIO API: http://localhost:9000
- Documentation: https://min.io/docs/
uvicorn main:app --reload --host 0.0.0.0 --port 8000