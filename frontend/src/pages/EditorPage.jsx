import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { useSocket } from '../hooks/useSocket';

const LANGUAGE_OPTIONS = [
  { label: 'Python', value: 'python' },
  { label: 'Java', value: 'java' },
  { label: 'C', value: 'c' },
];

export default function EditorPage() {
  const { code: roomCode } = useParams();
  const navigate = useNavigate();
  const username = localStorage.getItem('codesync_username');

  const [localContent, setLocalContent] = useState('');
  const [language, setLanguage] = useState('python');
  const [copied, setCopied] = useState(false);

  const suppressRemoteRef = useRef(false);

  const { socket, connected, users, remoteContent, roomLanguage } = useSocket(
    username ? roomCode : null,
    username
  );

  useEffect(() => {
    if (!username) navigate('/', { replace: true });
  }, [username, navigate]);

  useEffect(() => {
    if (roomLanguage) setLanguage(roomLanguage);
  }, [roomLanguage]);

  useEffect(() => {
    if (remoteContent === null) return;
    suppressRemoteRef.current = true;
    setLocalContent(remoteContent);
    setTimeout(() => { suppressRemoteRef.current = false; }, 0);
  }, [remoteContent]);

  function handleEditorChange(value) {
    if (suppressRemoteRef.current) return;
    setLocalContent(value ?? '');
    if (!connected) return;
    socket?.emit('code_change', { roomCode, content: value ?? '' });
  }

  function handleLanguageChange(e) {
    const lang = e.target.value;
    setLanguage(lang);
    socket?.emit('language_change', { roomCode, language: lang });
  }

  function handleCopy() {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!username) return null;

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#1e1e1e', color: '#ccc', fontFamily: 'monospace' }}>
      {/* Sidebar */}
      <div style={{ width: '200px', flexShrink: 0, background: '#252526', display: 'flex', flexDirection: 'column', padding: '16px', gap: '20px', borderRight: '1px solid #333' }}>
        <div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#888', marginBottom: '6px' }}>Room</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 'bold', letterSpacing: '2px' }}>{roomCode}</span>
            <button
              onClick={handleCopy}
              style={{ padding: '2px 6px', fontSize: '11px', background: '#333', color: '#ccc', border: '1px solid #555', cursor: 'pointer', borderRadius: '3px' }}
            >
              {copied ? '✓' : 'Copy'}
            </button>
          </div>
        </div>

        <div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#888', marginBottom: '6px' }}>Language</div>
          <select
            value={language}
            onChange={handleLanguageChange}
            style={{ width: '100%', padding: '4px', background: '#333', color: '#ccc', border: '1px solid #555', borderRadius: '3px' }}
          >
            {LANGUAGE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#888', marginBottom: '8px' }}>
            Users ({users.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {users.map(u => (
              <div key={u.socketId || u.username} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: u.color, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.username}{u.username === username ? ' (you)' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Editor
          height="100%"
          language={language}
          value={localContent}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            wordWrap: 'on',
            scrollBeyondLastLine: false,
          }}
        />
      </div>
    </div>
  );
}
