# CodeSync

## Workflow Orchestration

### 1. Plan Mode Default
* Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
* If something goes sideways, STOP and re-plan immediately
* Use plan mode for verification steps, not just building
* Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
* Use subagents liberally to keep main context window clean
* Offload research, exploration, and parallel analysis to subagents
* For complex problems, throw more compute at it via subagents
* One task per subagent for focused execution

### 3. Self-Improvement Loop
* After ANY correction from the user: update tasks/lessons.md with the pattern
* Write rules for yourself that prevent the same mistake
* Ruthlessly iterate on these lessons until mistake rate drops
* Review lessons at session start for relevant project

### 4. Verification Before Done
* Never mark a task complete without proving it works
* Diff behavior between main and your changes when relevant
* Ask yourself: "Would a staff engineer approve this?"
* Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
* For non-trivial changes: pause and ask "is there a more elegant way?"
* If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
* Skip this for simple, obvious fixes — don't over-engineer it
* Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
* When given a bug report: just fix it. Don't ask for hand-holding
* Point at logs, errors, failing tests — then resolve them
* Zero context switching required from the user
* Go fix failing CI tests without being told — CI/CD pipeline exists via Jenkins

## Task Management
1. Plan First: Write plan to tasks/todo.md with checkable items
2. Verify Plan: Check in before starting implementation
3. Track Progress: Mark items complete as you go
4. Explain Changes: High-level summary at each step
5. Document Results: Add review section to tasks/todo.md
6. Capture Lessons: Update tasks/lessons.md after corrections

## Core Principles
* Simplicity First: Make every change as simple as possible. Impact minimal code
* No Laziness: Find root causes. No temporary fixes. Senior development standards
* Minimal Impact: Only touch what's necessary. No side effects with new bugs

---

## Project Overview

**CodeSync** is a real-time collaborative code editor. Users enter a username, create or join persistent rooms via a 6-character room code, and write code together with live cursor presence and syntax highlighting for Python, Java, and C.

The project is a full DevOps showcase — every tool has a clear, non-overlapping role:

| Tool | Role |
|------|------|
| Terraform | Provision AWS infrastructure (VPC, EC2, ECR, security groups) |
| Ansible | Configure EC2 nodes (Docker, kubeadm, kubectl, env injection) |
| Jenkins | CI/CD pipeline (lint → build → ECR push → K8s rolling deploy) |
| Docker | Containerize frontend and backend services |
| Kubernetes | Orchestrate pods, services, ingress, HPA, rolling updates |

---

## Architecture

```
VPC (10.0.0.0/16)
├── EC2: Master Node (t2.medium) — K8s control plane + Jenkins pod
├── EC2: Worker Node 1 (t2.micro) — Frontend + Backend pods
└── EC2: Worker Node 2 (t2.micro) — PostgreSQL pod

K8s Namespace: codesync
├── frontend     (React + Monaco, NodePort 30001)
├── backend      (Node.js + Express + Socket.io, ClusterIP)
├── postgres     (PostgreSQL, ClusterIP, PVC-backed)
└── jenkins      (Jenkins CI, NodePort 30080)

Ingress routing:
  /             → frontend service
  /api/*        → backend service
  /socket.io/*  → backend service (WebSocket upgrade enabled)
```

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React (Vite) + Monaco Editor | Monaco = VS Code editor engine |
| Real-time | Socket.io (client + server) | WebSocket with fallback |
| Backend | Node.js 18 + Express | REST API + socket server |
| ORM | Prisma | Schema + migrations |
| Database | PostgreSQL 15 | Runs as K8s pod with PVC |
| Containerization | Docker | node:18-alpine, nginx:alpine |
| Registry | AWS ECR | Free-tier friendly |
| Orchestration | Kubernetes (kubeadm on EC2) | Avoids EKS cost |
| CI/CD | Jenkins (K8s pod) | Jenkinsfile in repo root |
| IaC | Terraform | All AWS resources |
| Config Mgmt | Ansible | Node setup + K8s bootstrap |
| Cloud | AWS ap-south-1 | Mumbai region |

---

## Repository Structure

```
codesync/
├── CLAUDE.md                    # This file — project instructions for Claude Code
├── PROGRESS.md                  # Running log of completed work and next steps
├── README.md                    # Engineering documentation
├── docker-compose.yml           # Local development only
├── Jenkinsfile                  # CI/CD pipeline definition
├── tasks/
│   ├── todo.md                  # Implementation task list (work through in order)
│   └── lessons.md               # Running log of corrections and patterns
├── terraform/
│   ├── main.tf                  # VPC, subnets, IGW, route tables
│   ├── ec2.tf                   # EC2 instances (master + workers)
│   ├── security.tf              # Security groups and rules
│   ├── ecr.tf                   # ECR repositories
│   ├── outputs.tf               # Public IPs, ECR URLs
│   └── variables.tf             # All configurable values
├── ansible/
│   ├── inventory.ini            # EC2 IPs (populated from Terraform outputs)
│   ├── playbooks/
│   │   ├── setup.yml            # Install Docker + kubeadm on all nodes
│   │   ├── master.yml           # kubeadm init + Flannel CNI
│   │   ├── workers.yml          # kubeadm join
│   │   └── env.yml              # Inject env vars on nodes
│   └── roles/
│       ├── common/              # apt update, base packages
│       ├── docker/              # Docker install + daemon config
│       └── kubernetes/          # kubeadm, kubelet, kubectl
├── backend/
│   ├── src/
│   │   ├── routes/              # REST endpoints (rooms.js)
│   │   ├── socket/              # Socket.io event handlers
│   │   └── index.js             # Entry point
│   ├── prisma/
│   │   └── schema.prisma        # Data model
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/               # UsernameEntry, RoomEntry, Editor
│   │   ├── components/          # Sidebar, LanguageSelector, CursorOverlay
│   │   └── hooks/               # useSocket, useEditor
│   ├── nginx.conf               # Prod nginx config (SPA routing + proxy)
│   ├── Dockerfile
│   └── package.json
└── k8s/
    ├── namespace.yaml
    ├── frontend/
    │   ├── deployment.yaml
    │   └── service.yaml
    ├── backend/
    │   ├── deployment.yaml
    │   ├── service.yaml
    │   └── hpa.yaml
    ├── postgres/
    │   ├── deployment.yaml
    │   ├── service.yaml
    │   └── pvc.yaml
    ├── jenkins/
    │   ├── deployment.yaml
    │   └── service.yaml
    └── ingress.yaml
```

---

## Coding Conventions

### General
- `camelCase` for variables and functions
- `PascalCase` for React components and classes
- `UPPER_SNAKE_CASE` for environment variables
- No hardcoded secrets — `.env` files only (never committed)

### Backend (Node.js)
- All routes in `src/routes/` — one file per resource
- All socket logic in `src/socket/` — separate handler per event group
- Validate request body before processing (use express-validator or manual checks)
- Use `async/await` — never raw `.then()` chains
- Return consistent JSON: `{ data: ... }` on success, `{ error: "message" }` on failure

### Frontend (React)
- One component per file
- Socket connection managed in a single `useSocket` custom hook
- Monaco editor instance controlled via `useRef` — never re-instantiate on state change
- Only `localStorage` for username — no other client-side persistence
- No inline styles — use Tailwind or CSS modules

### Docker
- Multi-stage builds for production images
- Never use `latest` tag — always tag with git SHA (`$GIT_COMMIT`)
- `.dockerignore` must exclude `node_modules`, `.env`, `*.log`, `.git`

### Kubernetes
- All resources in `codesync` namespace
- Resource requests and limits set on every pod — no unbounded containers
- ConfigMaps for non-secret env; Secrets for DB credentials and ECR auth
- Rolling update strategy: `maxSurge: 1`, `maxUnavailable: 0` on all Deployments
- Liveness and readiness probes on backend pods

### Terraform
- All resources tagged: `Project = codesync`, `ManagedBy = terraform`
- All configurable values in `variables.tf` — nothing hardcoded in resource blocks
- Always `terraform plan` before `apply` — review the diff before applying

### Ansible
- All playbooks must be idempotent — safe to re-run multiple times
- Use roles for reusable config (docker, kubernetes, common)
- Never store secrets in inventory or playbook files

---

## Environment Variables

### Backend (`.env`)
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Express server port |
| `DATABASE_URL` | — | Postgres connection string |
| `NODE_ENV` | `development` | Environment mode |
| `CORS_ORIGIN` | `http://localhost:5173` | Frontend URL for CORS |

### Jenkins (injected via Ansible `env.yml`)
| Variable | Description |
|----------|-------------|
| `ECR_URL` | AWS ECR registry base URL |
| `AWS_REGION` | AWS region (e.g. `ap-south-1`) |
| `K8S_NAMESPACE` | Target K8s namespace (`codesync`) |
| `KUBECONFIG` | Path to kubeconfig on master node |

---

## Local Development

```bash
# Start everything locally (frontend + backend + postgres)
docker-compose up --build

# Frontend: http://localhost:5173
# Backend:  http://localhost:4000
# Postgres: localhost:5432
```

```bash
# Run Prisma migrations
cd backend && npx prisma migrate dev

# Reset database
cd backend && npx prisma migrate reset

# Open Prisma Studio (DB GUI)
cd backend && npx prisma studio
```

---

## Known Constraints

- **No code execution** — collaborative editing only, no sandbox runtime
- **PostgreSQL in K8s** — PVC on EBS; not HA but acceptable for lab
- **kubeadm cluster** — manual control plane, no EKS managed node groups
- **Last-write-wins** — concurrent edits use simple delta broadcast; no CRDT/OT
- **Socket.io + Ingress** — ingress must support WebSocket upgrade headers and sticky sessions
- **t2.micro RAM limit** — K8s worker pods must have tight resource limits; avoid bloated base images
