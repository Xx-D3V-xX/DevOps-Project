# CodeSync Verification Checklist

Run through each scenario in order against the live cluster. Fill in the Status column as you go.

**Prerequisites:**
- Cluster is up: `kubectl get nodes` shows all nodes `Ready`
- All pods running: `kubectl get pods -n codesync` shows no `CrashLoopBackOff` or `Pending`
- Frontend accessible at `http://WORKER1_IP:30001`
- Jenkins accessible at `http://MASTER_IP:30080`

---

## Test Results Summary

| # | Scenario | Status |
|---|----------|--------|
| 1 | Real-time collaboration | ☐ PASS / ☐ FAIL |
| 2 | Cursor presence | ☐ PASS / ☐ FAIL |
| 3 | Language switch persistence | ☐ PASS / ☐ FAIL |
| 4 | Code persistence | ☐ PASS / ☐ FAIL |
| 5 | K8s self-healing | ☐ PASS / ☐ FAIL |
| 6 | Rolling deploy via Jenkins | ☐ PASS / ☐ FAIL |
| 7 | HPA registration | ☐ PASS / ☐ FAIL |

---

## Test 1 — Real-Time Collaboration

**Goal:** Confirm that code typed in one browser appears in the other within ~200ms.

**Steps:**

1. Open two separate browser windows (use normal + incognito, or two different browsers).
2. Navigate both to `http://WORKER1_IP:30001`.
3. In Browser 1: enter username `user-a` and press Enter.
4. In Browser 2: enter username `user-b` and press Enter.
5. In Browser 1: click **Create Room**. Note the 6-character room code displayed.
6. In Browser 2: enter the room code from step 5 and click **Join Room**.
7. In Browser 1: type several lines of code into the editor.
8. Watch Browser 2 — content should appear within approximately 200ms of each keystroke.

**Expected outcome:**
- Both editors show identical content in real time.
- No manual refresh required in Browser 2.

**Status:** ☐ PASS / ☐ FAIL

**Notes:**
```
(record any deviation here)
```

---

## Test 2 — Cursor Presence

**Goal:** Confirm that a remote user's cursor position is visible with their username label.

**Steps:**

1. With both browsers in the shared room from Test 1, click into the editor in Browser 1.
2. Move the cursor to different lines and columns using arrow keys or mouse clicks.
3. Observe Browser 2's editor.

**Expected outcome:**
- A colored cursor indicator appears in Browser 2 at the position where Browser 1's cursor is.
- The indicator is labeled with `user-a` (Browser 1's username).
- The cursor tracks movement in near real time.

**Status:** ☐ PASS / ☐ FAIL

**Notes:**
```
(record any deviation here)
```

---

## Test 3 — Language Switch Persistence

**Goal:** Confirm that the selected language is retained when a second user rejoins the room.

**Steps:**

1. In either browser, locate the language selector (top of the editor).
2. Switch the language to **Java**.
3. Confirm the editor syntax highlighting updates to Java in both browsers.
4. Hard-refresh Browser 2 (`Ctrl+Shift+R` / `Cmd+Shift+R`).
5. In Browser 2, re-enter username `user-b` and rejoin the same room code.
6. Observe which language is selected after rejoining.

**Expected outcome:**
- Browser 2 rejoins the room with **Java** already selected.
- Syntax highlighting is Java without the user having to reselect it.

**Status:** ☐ PASS / ☐ FAIL

**Notes:**
```
(record any deviation here)
```

---

## Test 4 — Code Persistence

**Goal:** Confirm that code is saved to PostgreSQL and survives a full session close.

**Steps:**

1. In the shared room, type a recognizable block of code — something easy to identify, e.g.:

   ```python
   # persistence test
   def hello():
       return "codesync"
   ```

2. Wait at least **10 seconds** for the auto-save interval to fire.
3. Close both browser windows completely.
4. Wait a further 5 seconds.
5. Open a fresh browser window and navigate to `http://WORKER1_IP:30001`.
6. Enter any username and join the **same room code** as before.
7. Observe the editor content after joining.

**Expected outcome:**
- The code block typed in step 1 is present in the editor.
- No code is missing or truncated.

**Status:** ☐ PASS / ☐ FAIL

**Notes:**
```
(record any deviation here)
```

---

## Test 5 — Kubernetes Self-Healing

**Goal:** Confirm that Kubernetes restarts a deleted backend pod automatically.

**Steps:**

1. Record current backend pod names:

   ```bash
   kubectl get pods -n codesync -l app=backend
   ```

2. Delete all backend pods:

   ```bash
   kubectl delete pod -l app=backend -n codesync
   ```

3. Immediately start watching pod status:

   ```bash
   kubectl get pods -n codesync -w
   ```

4. Watch the output for new backend pods to appear with status `Running`.

**Expected outcome:**
- Within **30 seconds**, new backend pod(s) appear with a new name and reach `Running` status.
- `kubectl get pods -n codesync` shows the same number of backend pods as before deletion.
- The application remains accessible at `http://WORKER1_IP:30001` (brief interruption during restart is acceptable).

**Status:** ☐ PASS / ☐ FAIL

**Notes:**
```
(record time to restart and any connection errors observed)
```

---

## Test 6 — Rolling Deploy via Jenkins

**Goal:** Confirm the full CI/CD pipeline builds, pushes, and deploys a new image without downtime.

**Steps:**

1. Make a trivial change to the backend — edit a log message in [backend/src/index.js](../backend/src/index.js):

   ```js
   // change this line
   console.log('Server running on port', PORT);
   // to something identifiable
   console.log('Server running on port', PORT, '— deploy test');
   ```

2. Commit and push to `main`:

   ```bash
   git add backend/src/index.js
   git commit -m "chore: deploy verification test"
   git push origin main
   ```

3. Open Jenkins at `http://MASTER_IP:30080` and navigate to the `codesync-pipeline` job.
4. If SCM polling is not configured, click **Build Now** manually.
5. Watch the pipeline progress through all 5 stages.
6. After the pipeline completes, verify the new image is running:

   ```bash
   kubectl describe pod -l app=backend -n codesync | grep Image:
   ```

   The image tag should match the short SHA of the commit from step 2:

   ```bash
   git rev-parse --short HEAD
   ```

7. Check rollout history:

   ```bash
   kubectl rollout history deployment/backend -n codesync
   ```

**Expected outcome:**
- All 5 pipeline stages complete green (no red stages).
- Backend pod image tag matches the latest git SHA.
- `kubectl rollout history` shows a new revision entry.
- Application is still accessible at `http://WORKER1_IP:30001` throughout the deploy.

**Status:** ☐ PASS / ☐ FAIL

**Notes:**
```
(record pipeline duration and image tag observed)
```

---

## Test 7 — HPA Registration

**Goal:** Confirm the Horizontal Pod Autoscaler is registered and reporting correctly (no load test required).

**Steps:**

1. Query the HPA in the codesync namespace:

   ```bash
   kubectl get hpa -n codesync
   ```

2. Inspect the backend HPA in detail:

   ```bash
   kubectl describe hpa backend-hpa -n codesync
   ```

**Expected outcome:**

```
NAME          REFERENCE               TARGETS   MINPODS   MAXPODS   REPLICAS
backend-hpa   Deployment/backend      <x>%/70%  2         5         2
```

- `MINPODS` = 2
- `MAXPODS` = 5
- `REPLICAS` (current) = 2
- `TARGETS` shows a CPU percentage with a target of `70%`
- No `<unknown>` in the TARGETS column (if metrics-server is installed; `<unknown>` is acceptable if metrics-server is not deployed on this cluster)

**Status:** ☐ PASS / ☐ FAIL

**Notes:**
```
(record actual kubectl output here)
```

---

## Failure Reference

| Symptom | Likely cause | Quick check |
|---------|-------------|-------------|
| Browser 2 never receives edits | Socket.io not reaching backend through ingress | `kubectl logs -l app=backend -n codesync` for connection errors |
| Cursor indicator missing | Cursor event not emitted or overlay component not rendering | Browser console for JS errors |
| Language reverts after rejoin | Room state not persisted to DB or not sent on join event | Check `rooms` table in Postgres via `kubectl exec` |
| Code lost after browser close | Auto-save not firing or DB write failing | Backend logs around save interval; check DB connectivity |
| Pod not restarting | Deployment replica count = 0 or image pull failing | `kubectl describe deployment backend -n codesync` |
| Pipeline stage fails | See [docs/jenkins-setup.md](jenkins-setup.md) Troubleshooting section | Jenkins Console Output for exact error |
| HPA shows `<unknown>` targets | metrics-server not installed | `kubectl top nodes` — if this also fails, install metrics-server |
