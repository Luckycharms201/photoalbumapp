import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

// Ensure the data directory exists before opening the DB file.
fs.mkdirSync(config.paths.data, { recursive: true });

// Node 26 ships a built-in synchronous SQLite (node:sqlite) with a
// prepare/run/get/all API compatible with better-sqlite3 — no native build,
// no external dependency, runs locally out of the box.
export const db = new DatabaseSync(config.paths.dbFile);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// --- Schema -----------------------------------------------------------------
// Albums own photos. Deleting an album cascades to its photos (we also remove
// the underlying files from storage in the route layer).
db.exec(`
  CREATE TABLE IF NOT EXISTS albums (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT    NOT NULL,
    is_public      INTEGER NOT NULL DEFAULT 0,
    public_token   TEXT    UNIQUE,
    cover_photo_id INTEGER,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS photos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id       INTEGER NOT NULL,
    original_name  TEXT    NOT NULL,
    storage_key    TEXT    NOT NULL,
    thumb_key      TEXT    NOT NULL,
    mime           TEXT    NOT NULL,
    size_bytes     INTEGER NOT NULL,
    width          INTEGER,
    height         INTEGER,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_photos_album ON photos(album_id);
  CREATE INDEX IF NOT EXISTS idx_albums_token ON albums(public_token);
`);

export default db;
