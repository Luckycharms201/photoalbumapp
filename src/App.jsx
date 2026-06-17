import { Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Album from './pages/Album.jsx';

export default function App() {
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">📸 Regreso a Casa - Photo Albums</Link>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/album/:token" element={<Album />} />
          <Route path="*" element={<div className="center muted">Page not found.</div>} />
        </Routes>
      </main>
    </>
  );
}
