# CodeSync — API Reference

## Base URL

| Environment | URL |
|-------------|-----|
| Local dev | `http://localhost:4000` |
| Production | `http://WORKER1_IP:30001` (via nginx proxy to backend) |

All responses are JSON. Success responses use `{ data: ... }`. Error responses use `{ error: "message" }`.

---

## REST Endpoints

### `POST /api/rooms`

Create a new room. Generates a random 6-character alphanumeric room code.

**Request body:** none

**Response `201`:**
```json
{
  "data": {
    "code": "X7K2PQ",
    "language": "python",
    "content": "",
    "createdAt": "2026-01-15T10:30:00.000Z"
  }
}
```

**Response `500`:**
```json
{ "error": "Internal server error message" }
```

---

### `GET /api/rooms/:code`

Fetch an existing room by its 6-character code.

**Path params:**
- `code` — the 6-character room code (case-sensitive)

**Response `200`:**
```json
{
  "data": {
    "code": "X7K2PQ",
    "language": "java",
    "content": "public class Main {\n  public static void main...",
    "updatedAt": "2026-01-15T10:45:00.000Z"
  }
}
```

**Response `404`:**
```json
{ "error": "Room not found" }
```

---

### `PATCH /api/rooms/:code`

Update a room's language or save a code snapshot. All fields are optional.

**Path params:**
- `code` — the 6-character room code

**Request body:**
```json
{
  "language": "java",
  "content": "public class Main { ... }"
}
```

**Response `200`:**
```json
{
  "data": {
    "code": "X7K2PQ",
    "language": "java",
    "content": "public class Main { ... }",
    "updatedAt": "2026-01-15T10:46:00.000Z"
  }
}
```

**Response `404`:**
```json
{ "error": "Room not found" }
```

---

### `GET /api/health`

Health check endpoint used by Kubernetes liveness and readiness probes.

**Response `200`:**
```json
{ "status": "ok" }
```

---

## WebSocket Events (Socket.io)

Connect to the backend Socket.io server at the base URL.

```javascript
import { io } from "socket.io-client";
const socket = io("http://localhost:4000");
```

---

### Client → Server Events

#### `join_room`
Join a collaborative room. Triggers room state delivery and notifies other users.

```javascript
socket.emit("join_room", {
  roomCode: "X7K2PQ",
  username: "divit"
});
```

**Server responds with** `room_joined` (to this socket only).
**Server broadcasts** `user_joined` (to all other sockets in the room).

---

#### `code_change`
Broadcast a code update to all other users in the room. Also triggers auto-save to DB (debounced, 5s interval).

```javascript
socket.emit("code_change", {
  roomCode: "X7K2PQ",
  content: "def hello():\n    print('world')"
});
```

**Server broadcasts** `code_update` to all other sockets in the room.

---

#### `cursor_move`
Broadcast this user's cursor position to others.

```javascript
socket.emit("cursor_move", {
  roomCode: "X7K2PQ",
  position: { lineNumber: 5, column: 12 }
});
```

**Server broadcasts** `cursor_update` to all other sockets in the room.

---

#### `leave_room`
Explicitly leave a room (also triggered automatically on disconnect).

```javascript
socket.emit("leave_room", { roomCode: "X7K2PQ" });
```

**Server broadcasts** `user_left` to remaining sockets in the room.

---

### Server → Client Events

#### `room_joined`
Delivered to the joining socket after `join_room`. Contains current room state.

```javascript
socket.on("room_joined", ({ users, language, content }) => {
  // users: [{ username: "divit", color: "#FF6B6B" }, ...]
  // language: "python" | "java" | "c"
  // content: string (last saved code)
});
```

---

#### `code_update`
Received when another user in the room changes code.

```javascript
socket.on("code_update", ({ content }) => {
  // content: full current code string
});
```

---

#### `cursor_update`
Received when another user moves their cursor.

```javascript
socket.on("cursor_update", ({ username, color, position }) => {
  // position: { lineNumber, column }
  // Render as a Monaco editor decoration
});
```

---

#### `user_joined`
Received when a new user joins the room.

```javascript
socket.on("user_joined", ({ username, color }) => {
  // Add to active users list in sidebar
});
```

---

#### `user_left`
Received when a user disconnects or leaves.

```javascript
socket.on("user_left", ({ username }) => {
  // Remove from active users list and clear their cursor
});
```

---

## Error Handling

The REST API returns standard HTTP status codes:

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad request (malformed body) |
| `404` | Room not found |
| `500` | Internal server error |

Socket.io events do not have error responses at this time — connection failures surface as Socket.io disconnect events.
