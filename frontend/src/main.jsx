import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import UsernameEntry from './pages/UsernameEntry';
import RoomEntry from './pages/RoomEntry';
import EditorPage from './pages/EditorPage';

function RequireUsername({ children }) {
  return localStorage.getItem('codesync_username') ? children : <Navigate to="/" replace />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            localStorage.getItem('codesync_username')
              ? <Navigate to="/room" replace />
              : <UsernameEntry />
          }
        />
        <Route path="/room" element={<RequireUsername><RoomEntry /></RequireUsername>} />
        <Route path="/room/:code" element={<RequireUsername><EditorPage /></RequireUsername>} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
