# CodeSync — Progress Tracker

> **How to use this file:**
> Update this file every time a phase is completed, a component is deployed, or a milestone is reached.
> Each entry should include the date, what changed, and what the current state of the system is.
> Newest entries go at the top of the Change Log.

---

## Project Structure

```
codesync/
├── CLAUDE.md                    # Project instructions for Claude Code
├── PROGRESS.md                  # This file
├── README.md                    # Engineering documentation
├── docker-compose.yml           # Local dev orchestration
├── Jenkinsfile                  # CI/CD pipeline
├── tasks/
│   ├── todo.md                  # Implementation task list
│   └── lessons.md               # Corrections and patterns
├── terraform/                   # AWS infrastructure as code
├── ansible/                     # Node configuration and K8s bootstrap
├── backend/                     # Node.js + Express + Socket.io
├── frontend/                    # React + Monaco Editor
└── k8s/                         # Kubernetes manifests
```

---

## Milestone Status

| Milestone | Status |
|-----------|--------|
| Phase 1 — AWS Infrastructure (Terraform) | ⬜ Not started |
| Phase 2 — Node Configuration (Ansible) | ⬜ Not started |
| Phase 3 — Backend Application | ⬜ Not started |
| Phase 4 — Frontend Application | ⬜ Not started |
| Phase 5 — Kubernetes Manifests | ⬜ Not started |
| Phase 6 — CI/CD Pipeline (Jenkins) | ⬜ Not started |
| Phase 7 — Integration & Testing | ⬜ Not started |
| Phase 8 — Cleanup & Documentation | ⬜ Not started |

---

## Change Log

<!-- Entries added here during implementation — newest first -->
<!-- Format:
### YYYY-MM-DD — [What was done]
- Detail 1
- Detail 2
- Current state: [what's running / what's verified]
-->

---

## What To Do Next

Start with **Phase 1 — Terraform**. Hand `tasks/todo.md` Block 1.1 to a Claude Code session with `CLAUDE.md` attached.

Prerequisites before starting:
- AWS account with IAM user (programmatic access, EC2/ECR/VPC permissions)
- AWS CLI configured locally (`aws configure`)
- Terraform installed (≥ 1.6)
- Ansible installed (≥ 2.14)
- Docker installed locally (for local dev testing)
- kubectl installed locally

---

## Known Issues / Notes

- Jenkins runs as a pod on the master node (t2.medium) — avoid scheduling heavy workloads on master simultaneously
- Socket.io requires sticky sessions at the ingress layer — configure `nginx.ingress.kubernetes.io/affinity: cookie` annotation
- PostgreSQL PVC uses EBS — will incur small storage cost even after EC2 teardown; remember to delete PVC before `terraform destroy`
- ECR images accumulate — add a lifecycle policy to ECR repos to keep only the last 5 images
- Flannel CNI is used for pod networking — ensure security group allows all traffic between nodes on the VPC CIDR
