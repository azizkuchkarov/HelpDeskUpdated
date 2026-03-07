# Accessing HelpDesk from Other PCs / Other Networks

If the app works on the server PC but **not from other computers or networks**, check the following.

---

## 1. Use the server’s IP (or hostname) in config

Other users must open the app using the **server’s address** (e.g. `http://192.168.2.18:3000`). The frontend then calls the API at that same host on port 8000. If the frontend was built with `localhost`, it will only work on the server PC.

### Docker

1. In the project root, create or edit `.env` and set (replace with your server IP or hostname):

   ```env
   NEXT_PUBLIC_API_URL=http://YOUR_SERVER_IP:8000/api
   CORS_ORIGINS=http://localhost:3000,http://YOUR_SERVER_IP:3000
   ```

   Example for IP `192.168.2.18`:

   ```env
   NEXT_PUBLIC_API_URL=http://192.168.2.18:8000/api
   CORS_ORIGINS=http://localhost:3000,http://192.168.2.18:3000
   ```

2. **Rebuild** the frontend so the API URL is baked in:

   ```bash
   docker-compose build frontend --no-cache
   docker-compose up -d
   ```

3. From other PCs, open: `http://YOUR_SERVER_IP:3000` (e.g. `http://192.168.2.18:3000`).

### Without Docker (frontend on same machine)

- In `frontend/.env.local` set:
  ```env
  NEXT_PUBLIC_API_URL=http://YOUR_SERVER_IP:8000/api
  ```
- Backend `CORS_ORIGINS` (in backend `.env` or config) must include `http://YOUR_SERVER_IP:3000`.
- Run frontend so it listens on all interfaces:
  ```bash
  npm run dev -- -H 0.0.0.0
  ```
- Others open `http://YOUR_SERVER_IP:3000`.

---

## 2. Windows Firewall

Allow inbound TCP for the ports the app uses (e.g. 3000 and 8000) on the **server PC**:

1. Open **Windows Defender Firewall** → **Advanced settings** → **Inbound Rules**.
2. **New Rule** → Port → TCP → Specific local ports: `3000, 8000` → Allow the connection → apply to Private (and Domain/Public if needed) → name e.g. “HelpDesk”.

Or in an **elevated PowerShell** (run as Administrator):

```powershell
New-NetFirewallRule -DisplayName "HelpDesk Frontend" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
New-NetFirewallRule -DisplayName "HelpDesk Backend"  -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

---

## 3. Different network (e.g. another building / internet)

- **192.168.x.x** is a private IP. It is only reachable from the **same LAN** (same building/segment). From another site or from the internet, that IP is not reachable.
- Options:
  - **Same organization:** Use VPN so other PCs are on the same network, or use a hostname/IP that is routable in your internal network.
  - **From the internet:** Put the app behind a reverse proxy (e.g. nginx) on a server with a public IP or domain, or use a tunnel (e.g. ngrok) for testing.

---

## Quick checklist

| Check | Action |
|-------|--------|
| API URL | `.env`: `NEXT_PUBLIC_API_URL=http://SERVER_IP:8000/api` and **rebuild** frontend (Docker: `docker-compose build frontend --no-cache`) |
| CORS | `.env`: `CORS_ORIGINS` includes `http://SERVER_IP:3000` |
| MinIO downloads | Backend `.env`: `MINIO_ENDPOINT=SERVER_IP:9000` (e.g. `192.168.2.18:9000`) so file download links work from other PCs; avoid `localhost` |
| Firewall | Allow TCP 3000, 8000, and **9000** (MinIO) inbound on the server |
| URL to open | Other users open `http://SERVER_IP:3000` (not localhost) |
| Other network | For other sites/internet: use VPN, internal hostname, or public server/tunnel |
