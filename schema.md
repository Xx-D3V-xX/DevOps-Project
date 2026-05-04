# CodeSync — Database Schema

## Overview

CodeSync uses PostgreSQL 15 managed via Prisma ORM. The schema is intentionally minimal — two tables that capture room state and session history.

---

## Entity Relationship

```
rooms (1) ──────< (many) room_sessions
```

---

## Tables

### `rooms`

Stores each collaborative editing room and its current state.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, default `gen_random_uuid()` | Internal identifier |
| `code` | `VARCHAR(6)` | UNIQUE, NOT NULL | The 6-char join code shown to users |
| `language` | `ENUM` | NOT NULL, default `python` | Active language: `python`, `java`, `c` |
| `content` | `TEXT` | NOT NULL, default `''` | Latest code snapshot (auto-saved every 5s) |
| `created_at` | `TIMESTAMP` | NOT NULL, default `now()` | Room creation time |
| `updated_at` | `TIMESTAMP` | NOT NULL, auto-updated | Last content or language change |

**Indexes:**
- Primary key on `id`
- Unique index on `code` (used for join lookups)

---

### `room_sessions`

Tracks each user's presence in a room — created on join, `left_at` filled on disconnect.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `UUID` | PK, default `gen_random_uuid()` | Internal identifier |
| `room_id` | `UUID` | FK → `rooms.id`, NOT NULL | Which room this session belongs to |
| `username` | `VARCHAR(50)` | NOT NULL | Display name entered by the user |
| `joined_at` | `TIMESTAMP` | NOT NULL, default `now()` | When the user connected |
| `left_at` | `TIMESTAMP` | nullable | When the user disconnected (null = still active) |

**Indexes:**
- Primary key on `id`
- Index on `room_id` (for querying sessions per room)
- Index on `(room_id, left_at)` (for finding active sessions: `WHERE left_at IS NULL`)

---

## Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Room {
  id        String        @id @default(uuid())
  code      String        @unique @db.VarChar(6)
  language  Language      @default(python)
  content   String        @default("") @db.Text
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  sessions  RoomSession[]
}

model RoomSession {
  id       String    @id @default(uuid())
  roomId   String
  room     Room      @relation(fields: [roomId], references: [id])
  username String    @db.VarChar(50)
  joinedAt DateTime  @default(now())
  leftAt   DateTime?
}

enum Language {
  python
  java
  c
}
```

---

## Migrations

```bash
# Create and apply a new migration
cd backend && npx prisma migrate dev --name init

# Apply migrations in production (no prompt)
npx prisma migrate deploy

# Reset database (dev only — destroys all data)
npx prisma migrate reset
```

---

## Design Decisions

**Why UUID for primary keys?**
Avoids sequential ID guessing — room IDs should not be discoverable by incrementing. UUIDs are also safer for distributed systems if the schema is ever extended.

**Why store `content` in the rooms table?**
Avoids a separate `snapshots` table for MVP. The last-write-wins auto-save (every 5s) is sufficient for persistence — this is a collaborative editor, not a version control system. A future `snapshots` table can be added without schema changes.

**Why `VARCHAR(6)` for room code?**
6 alphanumeric characters = 36^6 ≈ 2.1 billion combinations. More than enough. Short enough to type by hand.

**Why soft presence via `left_at` vs. a separate active-sessions table?**
`room_sessions` is append-only — historical data is preserved. This enables future analytics (average session length, users per room over time) without schema changes.
