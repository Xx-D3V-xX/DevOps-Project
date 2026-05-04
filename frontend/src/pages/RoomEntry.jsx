import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom, getRoom } from '../api';

export default function RoomEntry() {
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleCreate() {
    try {
      setError('');
      const res = await createRoom();
      navigate(`/room/${res.data.data.code}`);
    } catch {
      setError('Failed to create room.');
    }
  }

  async function handleJoin(e) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    try {
      setError('');
      await getRoom(code);
      navigate(`/room/${code}`);
    } catch {
      setError('Room not found.');
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: '280px' }}>
        <h2>CodeSync</h2>

        <button onClick={handleCreate} style={{ padding: '10px', fontSize: '16px' }}>
          Create Room
        </button>

        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <input
            type="text"
            placeholder="Room code"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value)}
            maxLength={6}
            style={{ padding: '8px', fontSize: '16px', textTransform: 'uppercase' }}
          />
          <button type="submit" disabled={!joinCode.trim()} style={{ padding: '8px', fontSize: '16px' }}>
            Join Room
          </button>
        </form>

        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    </div>
  );
}
