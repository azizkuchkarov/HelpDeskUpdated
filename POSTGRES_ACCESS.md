# Fix: "no pg_hba.conf entry for host ..." (PostgreSQL)

The error means **PostgreSQL is rejecting your connection** because its config (`pg_hba.conf`) does not allow your client address.

You must change `pg_hba.conf` **on the machine where PostgreSQL is running** (in your case, the server at **192.168.2.18**). If you don’t manage that server, ask your DBA or server admin to do it.

---

## 1. Find pg_hba.conf

On the **PostgreSQL server** (192.168.2.18):

- **Windows:**  
  `C:\Program Files\PostgreSQL\<version>\data\pg_hba.conf`  
  (e.g. `C:\Program Files\PostgreSQL\15\data\pg_hba.conf`)

- **Linux:**  
  Often:  
  `/etc/postgresql/<version>/main/pg_hba.conf`  
  or  
  `/var/lib/pgsql/<version>/data/pg_hba.conf`

---

## 2. Add an entry for your client

Open `pg_hba.conf` **as Administrator / root**.

The error said the **client host** is `192.168.2.18`. So either your backend runs on the same machine as PostgreSQL, or the server sees the client as that IP.

Add one of these lines **before** any “reject” or “all” rules that might match first. Usually you add it near the other `host` lines.

**Option A – allow only that IP (recommended):**

```text
# TYPE  DATABASE   USER      ADDRESS           METHOD
host    HelpDesk   postgres  192.168.2.18/32   scram-sha-256
```

**Option B – allow your whole subnet (e.g. 192.168.2.x):**

```text
host    HelpDesk   postgres  192.168.2.0/24    scram-sha-256
```

**Option C – if your PostgreSQL is old and doesn’t support scram-sha-256, use md5:**

```text
host    HelpDesk   postgres  192.168.2.18/32   md5
```

Use the same **password** in your app as the one set in PostgreSQL for user `postgres` (your `.env` has `postgres:postgres`; the server’s user must have that password if you use it).

---

## 3. Reload PostgreSQL

After saving `pg_hba.conf`:

- **Windows (Services):** Restart the “PostgreSQL” service, or from a **Run as Administrator** command prompt:
  ```bat
  pg_ctl reload -D "C:\Program Files\PostgreSQL\<version>\data"
  ```
- **Linux (systemd):**
  ```bash
  sudo systemctl reload postgresql
  # or
  sudo systemctl reload postgresql@15-main
  ```
- **Linux (pg_ctl):**
  ```bash
  sudo -u postgres pg_ctl reload -D /var/lib/pgsql/15/data
  ```

(Adjust paths and version numbers to your install.)

---

## 4. If backend and PostgreSQL are on the same machine (192.168.2.18)

Then the client address can be `127.0.0.1` or `::1` if you use `localhost` in the URL. You can either:

- Use **localhost** in the backend so the client is `127.0.0.1` (many default `pg_hba.conf` already allow that), or  
- Keep using `192.168.2.18` and add the `host ... 192.168.2.18/32 ...` (or `192.168.2.0/24`) line as above.

---

## Quick checklist

| Step | Action |
|------|--------|
| 1 | On **192.168.2.18**, open `pg_hba.conf`. |
| 2 | Add: `host HelpDesk postgres 192.168.2.18/32 scram-sha-256` (or `192.168.2.0/24` for the subnet). |
| 3 | Reload PostgreSQL (`pg_ctl reload` or restart service). |
| 4 | Run the backend again: `uvicorn main:app --reload --host 0.0.0.0 --port 8000`. |

If you don’t have access to 192.168.2.18, send this file or the steps above to whoever manages that server.
