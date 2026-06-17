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

## Production notes

- Set `NODE_ENV=production` (enables `secure` cookies — serve over HTTPS).
- Build the client (`cd client && npm run build`) and serve `dist/` from any
  static host or from Express; point `PUBLIC_BASE_URL` at the real domain.
- The default `express-session` MemoryStore is fine for a single admin but
  resets sessions on restart; use a persistent store if that matters.
```
