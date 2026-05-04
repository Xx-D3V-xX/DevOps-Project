import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function UsernameEntry() {
  const [username, setUsername] = useState('');
  const navigate = useNavigate();

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) return;
    localStorage.setItem('codesync_username', trimmed);
    navigate('/room');
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '280px' }}>
        <h2>CodeSync</h2>
        <input
          type="text"
          placeholder="Enter your username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          style={{ padding: '8px', fontSize: '16px' }}
          autoFocus
        />
        <button type="submit" disabled={!username.trim()} style={{ padding: '8px', fontSize: '16px' }}>
          Enter
        </button>
      </form>
    </div>
  );
}
