# Photo Album Sharing App

A full-stack app where a single **admin** uploads and manages photo albums, and
the **public** views/downloads photos through unguessable shareable links.

- **Backend:** Node.js + Express, SQLite (Node's built-in `node:sqlite` — no
  external DB, no native build), session-cookie auth with bcrypt.
- **Frontend:** React + Vite.
- **Images:** `sharp` generates webp thumbnails, bakes in EXIF orientation, and
  converts HEIC → JPEG on upload. Files live on the local filesystem behind a
  swappable storage layer.

---

## Features

**Admin (auth-protected):**
- Create, rename, delete albums (with confirmation)
- Upload via file picker **and** drag-and-drop, multi-file, chunked with a live
  progress bar; failed files are reported without aborting the batch
- Delete individual photos or whole albums
- Toggle albums public/private; each public album gets a random shareable link
  (`/album/:token`); "New link" rotates the token to revoke the old one
- Set an album cover

**Public (no login):**
- Responsive gallery grid with a full-screen lightbox (keyboard ← → Esc)
- Download a single photo
- Download a whole album as a ZIP
- **No upload/edit/delete** — enforced on the server, not just hidden in the UI

**Built-in safeguards:**
- File-type validation (jpg/png/webp/heic) + 25 MB/file limit
- `requireAdmin` authorization middleware on **every** admin route
- EXIF orientation baked into stored images
- Pagination / lazy-loading for large albums
- Private albums return 404 from every public endpoint (including raw images)

---

## Requirements

- **Node.js ≥ 22** (uses the built-in `node:sqlite`; developed on Node 26)
- npm

## Setup

### 1. Backend

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env`:

```bash
# Generate a bcrypt hash for your admin password:
npm run create-admin -- "your-strong-password"
# → copy the printed ADMIN_PASSWORD_HASH=... line into .env

# Generate a session secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# → paste as SESSION_SECRET in .env
```

Set `ADMIN_EMAIL` to your login email. (A ready-to-run `.env` was generated
during setup with `admin@example.com` / `changeme123` — **change these**.)

Run it:

```bash
npm run dev      # auto-restarts on change (node --watch)
# or: npm start
```

Server runs on **http://localhost:4000**.

### 2. Frontend

```bash
cd client
npm install
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` to the backend, so sessions
work same-origin in dev.

---

## Usage

1. Go to http://localhost:5173 → you're redirected to **/login**.
2. Sign in with your admin email + password.
3. Create an album, open it, drag in photos.
4. Click **Make public**, then **Copy** the link.
5. Open that `/album/:token` link in a private window (no login) to see the
   public gallery, lightbox, single + ZIP download.

---

## Configuration (`server/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 4000 | API port |
| `CLIENT_ORIGIN` | http://localhost:5173 | CORS origin (dev) |
| `PUBLIC_BASE_URL` | = CLIENT_ORIGIN | Base used to build share links |
| `ADMIN_EMAIL` | — | Admin login email |
| `ADMIN_PASSWORD_HASH` | — | bcrypt hash (preferred) |
| `ADMIN_PASSWORD` | — | Plaintext fallback (hashed on boot) |
| `SESSION_SECRET` | — | Session cookie signing secret |
| `MAX_FILE_MB` | 25 | Per-file upload limit |
| `MAX_FILES_PER_BATCH` | 100 | Max files per request |
| `GALLERY_PAGE_SIZE` | 24 | Photos per page |

---

## Project structure

```
photo-album-app/
├── server/
│   ├── src/
│   │   ├── index.js            # Express app + middleware
│   │   ├── config.js           # env + limits
│   │   ├── db.js               # node:sqlite schema
│   │   ├── auth.js             # bcrypt verify + requireAdmin
│   │   ├── images.js           # sharp: HEIC, EXIF, thumbnails
│   │   ├── storage/
│   │   │   └── localStorage.js # swappable storage interface
│   │   ├── routes/
│   │   │   ├── auth.js         # login / logout / me
│   │   │   ├── admin.js        # album CRUD, upload, deletes, sharing
│   │   │   └── public.js       # token gallery, downloads, ZIP
│   │   └── scripts/createAdmin.js
│   ├── uploads/                # stored images (gitignored)
│   └── data/app.db             # SQLite (gitignored)
└── client/
    └── src/
        ├── App.jsx, main.jsx, auth.jsx, api.js, styles.css
        ├── pages/   Login, AdminAlbums, AdminAlbumDetail, PublicAlbum
        └── components/ Lightbox, ConfirmDialog
```

---

## Swapping storage to S3 later

All file I/O goes through `server/src/storage/localStorage.js`, which exposes
`save / readStream / readBuffer / remove / exists / absolutePath` keyed by opaque
strings. Implement the same interface against S3 (drop `absolutePath`, stream
instead of `sendFile`) and the rest of the app is unchanged.

---

## Deploy to Fly.io

In production a single container runs Express, which serves both the API **and**
the built React app on one port. SQLite + uploads live on a persistent Fly
volume mounted at `/data`. The included `Dockerfile` builds the client and the
server; `fly.toml` wires up the volume and HTTPS.

### One-time setup

```bash
# 1. Install flyctl
brew install flyctl            # macOS
# or: curl -L https://fly.io/install.sh | sh

# 2. Sign up / log in (opens a browser)
fly auth signup                # or: fly auth login
```

### Create the app + volume

Run these from the repo root (where `fly.toml` is). The app name must be
**globally unique** — if `photoalbumapp` is taken, pick another and update the
`app = "..."` line in `fly.toml`; your URL becomes `https://<name>.fly.dev`.

```bash
fly launch --no-deploy --copy-config --name photoalbumapp --region iad
fly volumes create photo_data --region iad --size 1   # 1 GB persistent disk
```

### Set secrets (never commit these)

Generate the admin password hash and session secret, then set them as Fly
secrets. Replace the app name in the URLs if you changed it.

```bash
# admin password hash:
( cd server && npm run create-admin -- "your-strong-password" )
# session secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

fly secrets set \
  ADMIN_EMAIL="you@example.com" \
  ADMIN_PASSWORD_HASH='<paste the hash>' \
  SESSION_SECRET='<paste the secret>' \
  PUBLIC_BASE_URL="https://photoalbumapp.fly.dev" \
  CLIENT_ORIGIN="https://photoalbumapp.fly.dev"
```

### Deploy

```bash
fly deploy        # builds remotely (no local Docker needed)
fly open          # opens the live app
```

Subsequent updates: commit, then `fly deploy` again.

### Notes

- Keep it to **one machine** — the app uses a single Fly volume, which binds to
  one machine. (`fly scale count 1` if needed.)
- `fly.toml` lets the machine auto-stop when idle (cost ≈ \$0 when unused).
  Public viewing/admin auto-starts it on the next request.
- The default `express-session` MemoryStore resets sessions when the machine
  restarts/redeploys, so the admin re-logs-in occasionally. Public visitors have
  no session and are unaffected. Swap in a persistent session store if you want
  logins to survive restarts.
- Back up your data with `fly volumes snapshots create <volume-id>`.

## Generic production notes (other hosts)

- Set `NODE_ENV=production` (enables `secure` cookies — serve over HTTPS).
- The build serves the client from Express automatically; point
  `PUBLIC_BASE_URL` / `CLIENT_ORIGIN` at the real domain.
- Provide persistent storage for `DATA_DIR` and `UPLOADS_DIR`, or implement the
  S3 storage backend behind `server/src/storage/`.
```
