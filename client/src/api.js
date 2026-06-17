const BASE = '/api';

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    credentials: 'include',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    ...opts,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty / non-json response */
  }
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  // auth
  me: () => req('/auth/me'),
  login: (email, password) =>
    req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => req('/auth/logout', { method: 'POST' }),

  // admin: albums
  listAlbums: () => req('/admin/albums'),
  createAlbum: (title) =>
    req('/admin/albums', { method: 'POST', body: JSON.stringify({ title }) }),
  updateAlbum: (id, patch) =>
    req(`/admin/albums/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  rotateToken: (id) => req(`/admin/albums/${id}/rotate-token`, { method: 'POST' }),
  deleteAlbum: (id) => req(`/admin/albums/${id}`, { method: 'DELETE' }),
  getAlbum: (id, page = 1) => req(`/admin/albums/${id}?page=${page}`),
  setCover: (id, photoId) =>
    req(`/admin/albums/${id}/cover`, { method: 'PATCH', body: JSON.stringify({ photoId }) }),

  // admin: photos
  deletePhoto: (id) => req(`/admin/photos/${id}`, { method: 'DELETE' }),

  // public
  getPublicAlbum: (token, page = 1) => req(`/public/albums/${token}?page=${page}`),

  // Upload via XHR so we get real upload progress (fetch can't report it).
  uploadPhotos(albumId, files, onProgress) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      for (const f of files) fd.append('photos', f);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}/admin/albums/${albumId}/photos`);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* ignore */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Network error during upload.'));
      xhr.send(fd);
    });
  },
};
