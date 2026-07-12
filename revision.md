# CodeSync — Complete Engineering Revision

> Consolidated reference: every design decision, every problem encountered, and every identified future improvement with its proposed solution. Built from direct source code inspection and project history.

---

## 1. What It Is

A real-time collaborative code editor — create/join a room via a 6-character code, edit Python/Java/C together with live cursors and presence, powered by Monaco (the VS Code editor engine). Explicitly built as a **full DevOps showcase**: the product surface exists to justify and exercise a complete infrastructure lifecycle — Terraform (provisioning) → Ansible (configuration) → Docker (packaging) → Kubernetes (orchestration) → Jenkins (CI/CD) — each tool with a clear, non-overlapping role.

**Core technical problem, stated precisely:** N clients need to see the same mutable document per room, converge on it quickly, and not lose it when people disconnect. Everything else is infrastructure serving that one sentence.

---

## 2. Architecture Overview

```
Browser ──HTTP/WS──> Nginx Ingress
                          ├── /            → frontend-service (ClusterIP:80) → static React build
                          ├── /api         → backend-service (ClusterIP:4000) → Express REST
                          └── /socket.io   → backend-service (ClusterIP:4000) → Socket.IO
                                                    │
                                              PostgreSQL (PVC-backed)

Infra: 1 master EC2 (t2.medium: control plane + Jenkins) + 2 worker EC2 (t2.micro)
       Provisioned by Terraform, configured by Ansible (kubeadm cluster, Flannel CNI)
       Images built/pushed/deployed by Jenkins (self-hosted pod)
```

**Stack:** React + Vite + Monaco (frontend) · Node/Express + Socket.IO + Prisma (backend) · PostgreSQL · Docker · self-managed Kubernetes (kubeadm) · Terraform · Ansible · Jenkins · AWS (ap-south-1)

---

## 3. Decisions — What Was Chosen, and Why, With Tradeoffs

### 3.1 Product framing: collaborative editor as a DevOps vehicle
**Decision:** Build a real-time editor specifically because it forces genuinely hard problems (concurrent state, WebSockets) rather than a CRUD app, which in turn justifies non-trivial infra work.
**Alternative not taken:** A simpler CRUD product would have made the infra layer feel arbitrary/unjustified.
**Tradeoff accepted:** This is honestly framed as an infra showcase first, product second — not sold as an unmet-market-need startup idea.

### 3.2 Room state: hybrid in-memory broadcast + debounced DB persistence
**Decision:** `code_change` events broadcast instantly via an in-memory `Map<roomCode, {users, lastContent}>`; writes to Postgres are throttled (only if 5+ seconds since last write), with a forced flush to DB when the last user leaves a room.
**Alternatives considered:**
| Option | Pro | Con |
|---|---|---|
| Always write to Postgres per keystroke | One source of truth, simple | DB load + latency on the most latency-sensitive path |
| Pure in-memory, no persistence | Fastest | Data loss on restart/crash — unacceptable for an "editor" |
| **Hybrid (chosen)** | Fast broadcast + durable eventually | Requires careful throttle/flush logic; introduces the multi-pod problem (see §4.1) |

**Why this tradeoff was accepted:** liveness and durability are different concerns with different acceptable latencies — coupling them (option 1) makes both worse than necessary.

### 3.3 Room code: 6-char alphanumeric with collision check
**Decision:** Random 6-character alphanumeric code, checked against DB for uniqueness before insert (`do...while` loop, capped at 10 attempts).
**Alternatives considered:** UUID (safe but unshareable/ugly), sequential integer (guessable, leaks room count).
**Known flaw, accepted:** after 10 failed generation attempts, the loop proceeds anyway — a small, real, non-zero collision race. Schema-level `@unique` constraint on `code` is the actual correctness guarantee; the application-level loop is an optimization to avoid a wasted round-trip, not the last line of defense.

### 3.4 REST API design
**Decision:** Consistent response shape across all endpoints — `{ data: ... }` on success, `{ error: ... }` on failure — decided up front so the frontend needs exactly one parsing rule.
- `POST /api/rooms` — no request body needed; language/content default at schema level; returns only public fields (code, language, content, createdAt), never the internal UUID.
- `GET /api/rooms/:code` — normalizes `.toUpperCase()` on the code param so users don't need to remember case when manually typing a shared code; explicit 404 on miss (not `{data: null}`) so the frontend can distinguish "room doesn't exist" from "room is empty" via HTTP status rather than payload inspection.
- `PATCH /api/rooms/:code` — partial update semantics (only fields present in body get updated); Prisma's `P2025` ("record not found") error code explicitly mapped to HTTP 404, not left to fall through to a generic 500.

**Deliberately not built (scope cuts, stated proactively):** no authentication (room code is the only access control), no rate limiting, no input size validation on `content`.

### 3.5 Frontend/Monaco wiring
**Decision:** Monaco instance held in a `useRef`, never re-instantiated on state change — because Monaco is imperative, stateful third-party UI that React shouldn't try to reconcile/remount.
**Decision:** Echo-loop prevention via a synchronous boolean suppression flag (`isRemoteUpdate`) set immediately before/after programmatically applying a remote update via `.setValue()`, so Monaco's own `onDidChangeModelContent` handler can distinguish "user typed this" from "this arrived from the network."
**Alternatives considered and rejected:** diffing content before applying (doesn't prevent the event from firing regardless), debouncing the emit (reduces frequency, doesn't fix the loop).
**Subtlety:** this flag pattern only works because Monaco's change event fires synchronously within the same call stack as `.setValue()`. If it fired asynchronously, the flag would need to be cleared on next tick instead of immediately.

**Decision:** `cursor_move` kept as a separate socket event from `code_change`, not bundled — different urgency/volume characteristics (cursor movement fires far more often than meaningful content changes).

**Decision:** Username/identity via `localStorage` only, no auth/session tokens — deliberate scope boundary, not an oversight; keeps the project's focus on real-time sync and infra rather than identity systems.

### 3.6 Local containerization (docker-compose)
**Decision:** Prove the full stack locally before any cloud resource exists — isolates "application bug" from "cloud/infra bug" for every subsequent debugging session.
**Decision:** `postgres:15-alpine` — smaller footprint, directly relevant later given t2.micro RAM constraints.
**Decision:** Named Docker volume for Postgres data (not a bind mount) — portable across host OSes (relevant given your own dual-boot Windows/Ubuntu setup).
**Critical decision, got right the first time in retrospect but not initially understood:** `VITE_API_URL` must be passed as a Docker **build arg**, not a runtime env var — Vite bakes `VITE_`-prefixed variables into the static JS bundle at build time. Setting it as a runtime `environment:` value (the way `DATABASE_URL` works for the backend) does nothing, because by container-start time the build has already finished. This distinction is the direct root cause of a real production bug (§4.2).
**Contrast decision:** `CORS_ORIGIN` kept as a genuine runtime env var on the backend — correctly identified as a value that *can* change via redeploy/ConfigMap without requiring an image rebuild, unlike `VITE_API_URL`.

### 3.7 Cloud infrastructure (Terraform)
**Decision:** Single public subnet (not the usual public/private split) — avoids the cost of a NAT gateway, consistent with the same free-tier-consciousness that motivated avoiding EKS.
**Decision:** Asymmetric EC2 sizing — 1× t2.medium (master: control plane + Jenkins, genuinely more memory-hungry) + 2× t2.micro (workers, free-tier eligible).
**Decision:** Self-managed kubeadm cluster on raw EC2 instead of EKS — purely cost-driven (EKS bills a per-cluster control-plane fee on top of node costs). Explicit tradeoff: full ownership of control-plane correctness (etcd, CNI, node joins, upgrades) vs. AWS managing all of that.
**Decision:** ECR lifecycle policy retaining only the last 5 images per repo — cost hygiene, since every Jenkins run pushes a new SHA-tagged image and none would otherwise ever be cleaned up.

### 3.8 Ansible / kubeadm bootstrap
**Decision:** Strict staged sequence — `setup.yml` (Docker + kubeadm/kubelet/kubectl on all nodes identically) → `master.yml` (kubeadm init + Flannel CNI, captures join token) → `workers.yml` (consumes join token, kubeadm join) → `env.yml` (injects Jenkins-facing env vars, kept separate since it's a different concern from cluster bootstrap).
**Decision:** All playbooks written idempotent (safe to re-run) — necessary because real debugging required re-running stages without tearing down EC2 instances from scratch.
**Decision:** Flannel chosen as CNI over Calico/Cilium — simplest option that does the one job needed (pod-to-pod networking across nodes); Calico's network-policy features and Cilium's eBPF capabilities would add operational complexity this project doesn't use.

### 3.9 Kubernetes manifests + Ingress
**Decision:** Single `codesync` namespace for all resources — clean scoping, one-command visibility (`kubectl get pods -n codesync`).
**Decision:** Explicit resource requests/limits on every pod, no exceptions — necessary given t2.micro constraints, not optional best-practice.
**Decision:** Rolling update strategy `maxSurge: 1, maxUnavailable: 0` on backend — guarantees zero-downtime deploys (never drops below current replica count during rollout), at the cost of briefly running N+1 pods during rollout.
**Decision:** Separate readiness (10s delay/5s period) and liveness (30s delay/10s period) probes, both hitting `/api/health` — readiness controls traffic routing without restart (assumes recoverable), liveness triggers a hard pod restart (assumes stuck). Deliberately not conflated into one probe type.
**Decision:** Backend Service is `ClusterIP` (internal-only) — correct by design; all external access must go through the Ingress. (Note: this correct design choice is unrelated to the bug in §4.2 — the Service type wasn't the problem, the frontend's hardcoded connection target was.)
**Decision:** Ingress explicitly routes `/api` and `/socket.io` to backend before the catch-all `/` to frontend — prevents the catch-all from swallowing API/WebSocket traffic.
**Decision:** `nginx.ingress.kubernetes.io/affinity: cookie` (sticky sessions) — required because of the in-memory-per-pod room state design (§3.2); without it, a client reconnecting could land on a different pod with no knowledge of their room.

### 3.10 CI/CD (Jenkins)
**Decision:** Jenkins self-hosted as a pod on the cluster, not a SaaS CI (GitHub Actions) — deliberately the harder path, chosen specifically to demonstrate operating CI infrastructure yourself, not just writing pipeline YAML. Honest tradeoff: GitHub Actions would have been objectively less setup work and is the better default choice for most real teams.
**Decision:** Docker images tagged with git short SHA, never `latest` — makes "what's actually deployed" answerable from the manifest alone and makes rollback precise (`kubectl set image` to a specific known-good SHA).
**Decision:** `kubectl rollout status` as an explicit, blocking pipeline stage — verifies the rollout actually completed (new pods Ready) rather than just having been requested; without this, a pipeline could report success the instant `set image` is accepted even if new pods immediately crash-loop.

---

## 4. Problems Encountered

### 4.1 Multi-user concurrency issue (UNRESOLVED — be upfront about this)
**What's remembered:** issues connecting/syncing multiple users in the same room; concurrency claims are not fully verified working.
**Most likely root cause given the architecture:** the in-memory `Map` holding room state lives on a single Node process. With more than one backend replica (which the HPA config explicitly allows, scaling 2–5 pods), two users in the "same" room can land on different pods, each with an independent, non-synchronized in-memory copy of room state. Sticky sessions (§3.9) mitigate this by trying to keep a client routed to the same pod, but don't eliminate the underlying gap — a pod restart, scaling event, or affinity failure can still surface divergent state.
**Status:** identified, not fixed. Proposed solution below (§5.1).
**How to talk about this in an interview:** name it proactively, briefly, with the architectural reason and the proposed fix already in hand (see the "explain this project" answer we built) — this converts a weakness into a demonstration of understanding your own system's failure modes.

### 4.2 The Socket.IO / Ingress debugging saga (RESOLVED — strongest "tell me about a bug" story)
**Symptom:** backend reachable via direct API calls (curl), but real-time collaboration simply didn't work between browsers once deployed to the cluster.
**Root causes, layered — this is what makes it a strong story, it wasn't one bug:**
1. `backend-service` was ClusterIP-only with no Ingress routing to it at all — unreachable from outside the cluster.
2. Frontend was hardcoded to connect its Socket.IO client to the **frontend's own NodePort** (30001) instead of the backend.
3. `VITE_API_URL` is a Vite **build-time** variable, baked into the static JS bundle at `docker build` time — changing it on a running pod does nothing; the image must be rebuilt (see §3.6).
4. `CORS_ORIGIN` configmap was pointing at a stale port.
5. `imagePullPolicy` wasn't set to `Always` — nodes kept running cached old images even after new ones were pushed to ECR, making genuine fixes look like they weren't taking effect.
**Fix applied:** introduced proper Ingress routing (`/api`, `/socket.io` → backend; `/` → frontend), added sticky-session cookie affinity, corrected CORS origin, ensured image pulls were forced.
**Why this is the best interview story:** demonstrates understanding of build-time vs. runtime config in containerized frontends (a genuinely common real-world gotcha), why Socket.IO specifically needs sticky sessions, and systematic layer-by-layer debugging across the network stack rather than guessing.

### 4.3 Jenkins agent PATH problem (RESOLVED, but via workaround, not a fully clean fix)
**What happened:** the pipeline was originally written calling `docker`, `aws`, `kubectl` unqualified, as if in a normal interactive shell. This failed on the actual Jenkins agent, whose runtime `$PATH` (running as its own service user, non-interactively, without a login shell's `.bashrc`/`.profile`) didn't resolve these tools.
**Fix applied:** hardcoded absolute paths (`/tmp/docker`, `/tmp/kubectl`, `/tmp/bin/aws`), explicit `KUBECONFIG=/tmp/kubeconfig`, and split AWS credential env vars, rather than depending on ambient shell configuration.
**Known gap:** the originally planned Lint stage (ESLint on frontend/backend) is absent from the current, live Jenkinsfile. It's not clearly remembered whether this was a deliberate scope cut or something that broke and got silently dropped under time pressure — flagged honestly as an open question rather than invented a clean answer.
**Proposed improvement:** see §5.3.

### 4.4 Security/hardening gaps (IDENTIFIED, not yet addressed)
**What exists:** a single shared security group opens SSH (22), HTTP/HTTPS (80/443), Kubernetes API (6443), Jenkins (8080), and the full NodePort range (30000-32767) to `0.0.0.0/0` — the entire internet.
**Why this exists:** simplicity for a lab-scale project; no bastion/VPN infrastructure was built.
**Risk:** SSH and the Kubernetes API being open to the whole internet is a genuine, nameable weakness — not a hidden one, worth stating proactively if asked about security posture.
**Proposed improvement:** see §5.4.

### 4.5 Verification checklist never executed (IDENTIFIED)
**What happened:** a `docs/verification.md` checklist exists in the repo but was never actually run through and filled in — meaning several correctness claims (including, likely, multi-user concurrency) were never formally confirmed end-to-end.
**Why this matters:** directly connects to §4.1 — the concurrency issue may never have been rigorously characterized because the testing pass that would have caught/documented it specifically was skipped.
**Proposed improvement:** see §5.5.

---

## 5. Future Improvements — Identified Problems and Proposed Solutions

### 5.1 Fix: Redis-backed shared room state (addresses §4.1)
**Problem being solved:** in-memory-per-pod room state causes divergence risk across multiple backend replicas.
**Proposed design:**
- `room:{code}:content` — Redis string key, replacing the in-memory `lastContent`. Every `code_change` writes here (cheap, in-memory store built for this).
- `room:{code}:users` — Redis hash (socketId → username), replacing the in-memory `users` Map.
- `room:{code}:lastWrite` — Redis string holding the shared debounce timestamp, so *all* pods check the same clock rather than each pod keeping an independent one (which itself was a subtler correctness gap — two pods could previously both decide independently that "enough time has passed" and both write to Postgres out of order).
- Broadcast logic (`socket.to(roomCode).emit(...)`) stays unconditional and instant, same as before — only the *storage* of the live copy moves from process memory to Redis.
- Postgres debounce logic (5-second throttle, flush-on-empty) stays conceptually identical, now reading the shared Redis timestamp instead of a local one.
**What this buys:** sticky sessions become a pure performance/routing optimization instead of a correctness requirement — a client reconnecting to a different pod still reads the same Redis-backed content, closing the divergence gap entirely rather than just reducing its likelihood.
**New cost, stated honestly:** an extra network hop per keystroke (Redis round-trip vs. in-process map lookup) — real but small (sub-millisecond, same-VPC) — and a new infrastructure dependency (Redis itself needs deploying/monitoring, though likely without its own PVC, since Postgres remains the durable source of truth and Redis can be treated as a rehydratable cache).
**New failure mode this introduces, and the next problem it creates:** Redis itself becomes a new single point of failure — if asked "what if Redis goes down," the honest current answer is "this design doesn't yet handle that; the next step would be a Redis Sentinel/cluster setup, or a degraded-mode fallback to direct Postgres reads/writes when Redis is unreachable." This is presented as the known *next* layer of the problem, not something already solved.

### 5.2 Fix: reverse index for disconnect handling (minor efficiency improvement)
**Problem being solved:** current disconnect handler iterates every room in the in-memory (or future Redis) map to find which one a disconnecting socket belonged to — O(rooms) per disconnect.
**Proposed solution:** maintain a direct reverse index, `socketId → roomCode`, updated on join/leave, turning disconnect cleanup into an O(1) lookup instead of a scan.
**Priority:** low — irrelevant at current scale, worth naming proactively as a known inefficiency rather than presenting current code as fully optimized.

### 5.3 Fix: formalize the Jenkins agent environment + reinstate a deliberate Lint decision (addresses §4.3)
**Problem being solved:** the PATH mismatch was discovered reactively (pipeline written, then failed); the Lint stage disappeared without a clearly recorded decision.
**Proposed process change:** before writing pipeline stages, verify the actual Jenkins agent execution environment directly (e.g. `sudo -u jenkins bash -c 'which docker; which kubectl; echo $PATH'`) so the pipeline is written around a confirmed environment rather than an assumed one.
**Proposed decision to make explicitly:** either reinstate the Lint stage as an early, fast-failing step (catches basic errors cheaply before the more expensive build/push stages), or consciously document the decision to cut it and why (e.g., pipeline speed) — the goal is that this becomes a stated tradeoff, not a silent gap.

### 5.4 Fix: network hardening (addresses §4.4)
**Problem being solved:** SSH and Kubernetes API access open to the entire internet.
**Proposed solution:** restrict security group rules for ports 22 and 6443 to a known IP range (e.g., a specific home/office IP or VPN range) rather than `0.0.0.0/0`; consider a bastion host or AWS SSM Session Manager for administrative access instead of direct public SSH. Split the current single public subnet into public (Ingress/load-balancer only) and private (worker nodes, database) subnets, with a NAT gateway for private-subnet outbound access — explicitly naming the cost tradeoff (NAT gateway has an hourly + data-processing cost) as the reason this wasn't done initially.

### 5.5 Fix: actually execute the verification checklist, with concurrency as the priority case (addresses §4.5)
**Problem being solved:** correctness claims, especially around multi-user concurrency, were never formally tested and documented.
**Proposed solution:** before considering the project "done" in any future iteration, explicitly test with 3+ simultaneous editors in the same room and watch for content divergence, specifically because the current architecture (in-memory-per-pod state, debounced writes) has a plausible, architecturally-explainable failure mode there that a 2-tab localhost test would not catch. Fill in the existing `docs/verification.md` checklist as this is done, rather than leaving it as an unexecuted template.

### 5.6 Longer-term: real conflict resolution (CRDT/OT)
**Problem being solved:** current concurrent-edit model is last-write-wins, no operational transform or CRDT — stated explicitly as a "Known Constraint" in the project's own documentation.
**Proposed solution, if taken further:** adopt a CRDT-based library (e.g., Y.js) for the document model, which would also resolve the related cursor-position drift issue (cursor positions currently don't get transformed against incoming remote edits, so they're approximate, not rigorously accurate, under concurrent editing).
**Why this is listed as longer-term, not immediate:** it's a substantially larger architectural change than §5.1–5.5 — it changes the document model itself, not just where state is stored — and is appropriately scoped as a "if this became a real product" improvement rather than a near-term fix.

---

## 6. Quick-Reference: Strongest Interview Stories, Ranked

1. **Socket.IO/Ingress debugging saga (§4.2)** — best "tell me about a bug," multi-layered, demonstrates build-time-vs-runtime understanding.
2. **Redis redesign reasoning (§5.1)** — best "how would you improve this" or "design this differently" answer, shows deep understanding of the state-management tradeoff and its cascading consequences (sticky sessions, debounce timing).
3. **Hybrid in-memory/DB persistence design (§3.2)** — best opening "explain your architecture" answer; a clean problem-solution pair.
4. **Concurrency limitation, stated proactively (§4.1)** — best move to pre-empt criticism; shows self-awareness.
5. **Jenkins PATH issue (§4.3)** — good secondary "CI/CD challenges" answer if asked specifically about the pipeline.
6. **Security group gap (§4.4)** — good answer if asked specifically about production-readiness/security, don't volunteer unless asked.
