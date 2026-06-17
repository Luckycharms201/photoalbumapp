import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import AdminAlbums from './pages/AdminAlbums.jsx';
import AdminAlbumDetail from './pages/AdminAlbumDetail.jsx';
import PublicAlbum from './pages/PublicAlbum.jsx';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="center muted">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function AdminHeader() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <header className="topbar">
      <Link to="/" className="brand">📷 Photo Albums</Link>
      <div className="topbar-right">
        <span className="muted">{user.email}</span>
        <button className="btn ghost" onClick={logout}>Log out</button>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <>
      <AdminHeader />
      <main className="container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AdminAlbums />
              </ProtectedRoute>
            }
          />
          <Route
            path="/albums/:id"
            element={
              <ProtectedRoute>
                <AdminAlbumDetail />
              </ProtectedRoute>
            }
          />
          {/* Public, no auth */}
          <Route path="/album/:token" element={<PublicAlbum />} />
          <Route path="*" element={<div className="center muted">Page not found.</div>} />
        </Routes>
      </main>
    </>
  );
}
