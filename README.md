# Photo Album — Static Site

A **fully static** photo gallery you publish to Cloudflare Pages. You add photos
to folders and run a build; the public can browse a responsive gallery, view
photos in a lightbox, and download single photos or whole albums as a ZIP.

There is **no server and no login** — "managing" albums means editing folders in
this repo and pushing. Because it's static, *private* means **unlisted**: an
album marked unlisted isn't shown on the home page and isn't in the public
manifest, but anyone who has its link can view it. It is not access-controlled.

- **Frontend:** React + Vite (static build).
- **Build step:** Node script using `sharp` (thumbnails, EXIF rotation, HEIC→JPEG)
  and `archiver` (per-album ZIPs). Runs locally and on Cloudflare's build.
- **Hosting:** Cloudflare Pages, auto-deploy on push.

---

## How it works

```
albums/
  welcome/                 ← you create this
    album.json             ← optional: { "title", "unlisted", "order" }
    photo-1.jpg            ← drop full-size photos here
    photo-2.png
  trip-2026/
    ...

        ↓  npm run build  (sharp + archiver)

dist/
  index.html, assets/…                 ← the React app
  gallery/
    manifest.json                      ← list of PUBLIC albums only
    data/<token>.json                  ← one per album (public + unlisted)
    thumbs/<token>/*.webp              ← fast-loading thumbnails
    photos/<token>/*.<ext>             ← full-size images
    zips/<token>.zip                   ← whole-album download
```

Each album's `<token>` is a SHA-256 of its folder name, so the shareable
`/album/<token>` link is **stable across builds** with nothing to commit.
(Renaming a folder changes its link — by design.)

---

## Requirements

- Node.js ≥ 18 (developed on 18–20; sharp ships prebuilt binaries)
- npm

## Local setup

```bash
npm install
npm run build      # builds the app + processes albums into dist/
npm run preview    # serve dist/ at http://localhost:4173
```

For iterative work with hot reload:

```bash
npm run dev        # processes albums into public/gallery, then starts Vite (:5173)
```

> `npm run dev` snapshots your albums once at startup. After adding/removing
> photos, restart `dev` (or just use `npm run build && npm run preview`).

---

## Adding / managing albums

1. **Create an album:** make a folder under `albums/`, e.g. `albums/birthday/`.
2. **Add photos:** drop `.jpg`, `.png`, `.webp`, or `.heic` files in it.
3. **(Optional) `album.json`** in the folder to customize:
   ```json
   { "title": "Maya's Birthday", "unlisted": false, "order": 2 }
   ```
   - `title` — display name (defaults to a prettified folder name)
   - `unlisted` — `true` hides it from the home page (link-only access)
   - `order` — sort position on the home page (lower first)
4. **Rename an album:** rename the folder. (Its share link changes.)
5. **Delete an album / photo:** delete the folder or the file.
6. **Publish:** `git add -A && git commit -m "..." && git push`.
   Cloudflare rebuilds and deploys automatically.

The shareable link for an album is whatever Cloudflare URL +
`/album/<token>`. The easiest way to get a token: run `npm run build` and read
`dist/gallery/manifest.json`, or open the album from the home page and copy the
browser URL.

---

## Deploy to Cloudflare Pages

One-time setup in the Cloudflare dashboard:

1. **Workers & Pages → Create → Pages → Connect to Git.**
2. Pick the repo **`Luckycharms201/photoalbumapp`**.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - (Node version is pinned to 20 via `.nvmrc`.)
4. **Save and Deploy.**

Every `git push` to `main` then triggers a new build + deploy. The SPA routing
for `/album/:token` is handled by `public/_redirects` (`/* /index.html 200`).

> **Note on photos in git:** because Cloudflare runs the build, your original
> photos in `albums/` are committed to the repo. That's fine for personal use;
> just be aware the repo grows with your library. (Generated `dist/` and
> `public/gallery/` are gitignored.)

---

## Project structure

```
photoalbumapp/
├── albums/                 # SOURCE photos you add (committed)
├── scripts/build-gallery.mjs   # sharp/archiver build step
├── src/
│   ├── App.jsx, main.jsx, styles.css
│   ├── pages/   Home.jsx (album list), Album.jsx (gallery + lightbox)
│   └── components/Lightbox.jsx
├── public/_redirects       # SPA fallback for Cloudflare Pages
├── .nvmrc                  # Node 20 for the Cloudflare build
├── index.html, vite.config.js, package.json
└── dist/                   # build output (gitignored)
```
