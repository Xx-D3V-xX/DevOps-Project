# CodeSync
> Real-time collaborative code editor with a full production-grade DevOps pipeline on AWS

---

## Resources

| Document | Link |
|----------|------|
| Engineering plan | [`CLAUDE.md`](CLAUDE.md) |
| Implementation tasks | [`tasks/todo.md`](tasks/todo.md) |
| Progress tracker | [`PROGRESS.md`](PROGRESS.md) |
| Jenkins setup guide | [`docs/jenkins-setup.md`](docs/jenkins-setup.md) |
| Verification checklist | [`docs/verification.md`](docs/verification.md) |
| Cost and teardown | [`docs/cost-and-teardown.md`](docs/cost-and-teardown.md) |
| API reference | [`docs/api.md`](docs/api.md) |
| Database schema | [`docs/schema.md`](docs/schema.md) |

---

## Overview

CodeSync is a real-time collaborative code editing platform where multiple users can write code together in shared, persistent rooms. Users enter a username, create or join a room via a 6-character code, and see each other's edits and cursor positions live. The platform supports Python, Java, and C with Monaco Editor (the engine powering VS Code).

The project is a full DevOps pipeline demonstration — five tools, each with a distinct, non-overlapping role from infrastructure provisioning to automated deployment.

---

## The Problem

Collaborative coding is a critical workflow for pair programming, remote interviews, and team debugging. Existing solutions either require accounts, cost money, or lack persistence. CodeSync is a self-hosted, zero-account, lightweight alternative deployable on any AWS account.

---

## Stakeholders

| Stakeholder | Role |
|-------------|------|
| Developers | Create/join rooms, write code collaboratively |
| Lab evaluators | Assess DevOps pipeline completeness |
| Operators | Provision, configure, deploy, and maintain the system |

---

## High-Level Pipeline

```
git push (main)
    │
    ▼
Jenkins (K8s pod, port 30080)
    │  lint → build Docker images → push to ECR → kubectl rolling deploy
    ▼
Kubernetes Cluster (kubeadm on EC2)
    │  frontend pods + backend pods + postgres pod
    ▼
Browser (user enters username → creates/joins room → edits code live)
```

---

## System Architecture

```
AWS VPC (10.0.0.0/16)  —  provisioned by Terraform
│
├── EC2: codesync-master (t2.medium)
│   └── K8s Control Plane + Jenkins pod
│
├── EC2: codesync-worker-1 (t2.micro)
│   └── Frontend pods (React + Monaco) + Backend pods (Node.js + Socket.io)
│
└── EC2: codesync-worker-2 (t2.micro)
    └── PostgreSQL pod (PVC-backed)

Kubernetes Namespace: codesync
├── frontend-deployment     (2 replicas, NodePort 30001)
├── backend-deployment      (2 replicas, ClusterIP, HPA enabled)
├── postgres-deployment     (1 replica, PVC on EBS gp2)
└── jenkins-deployment      (1 replica, pinned to master, NodePort 30080)

Ingress (nginx):
  /             → frontend-service:80
  /api/*        → backend-service:4000
  /socket.io/*  → backend-service:4000  (WebSocket upgrade + sticky sessions)
```

---

## DevOps Tool Responsibilities

| Tool | Role | What it manages |
|------|------|-----------------|
| **Terraform** | Infrastructure provisioning | VPC, subnets, EC2 instances, security groups, ECR repos |
| **Ansible** | Node configuration | Docker install, kubeadm setup, K8s cluster bootstrap, env injection |
| **Jenkins** | CI/CD pipeline | Lint → build → ECR push → kubectl rolling deploy → rollout verify |
| **Docker** | Containerization | Frontend (nginx:alpine) and backend (node:18-alpine) images |
| **Kubernetes** | Orchestration | Pod scheduling, rolling updates, HPA, ingress routing, self-healing |

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React (Vite) | Fast build, modern component model |
| Code editor | Monaco Editor (`@monaco-editor/react`) | VS Code engine — best-in-class syntax highlighting and cursor API |
| Real-time | Socket.io (client + server) | WebSocket with automatic fallback, room namespacing |
| Backend | Node.js 18 + Express | Native Socket.io support, fast to build |
| ORM | Prisma | Clean schema definitions, type-safe queries, easy migrations |
| Database | PostgreSQL 15 | Reliable, runs well in K8s pod |
| Container registry | AWS ECR | Free-tier friendly, integrates natively with IAM |
| Orchestration | Kubernetes (kubeadm on EC2) | Avoids EKS hourly control plane fee (~$0.10/hr) |
| CI/CD | Jenkins (LTS) | Meets lab requirement; Jenkinsfile-as-code in repo |
| IaC | Terraform ≥ 1.6 | Declarative AWS provisioning |
| Config management | Ansible ≥ 2.14 | Idempotent node setup; role-based |
| Cloud | AWS ap-south-1 | Mumbai region — low latency for SPIT lab |

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18.x | [nodejs.org](https://nodejs.org) |
| Terraform | ≥ 1.6 | [terraform.io](https://terraform.io) |
| Ansible | ≥ 2.14 | `pip install ansible` |
| Docker | ≥ 24.x | [docker.com](https://docker.com) |
| kubectl | ≥ 1.28 | [kubernetes.io/docs/tasks/tools](https://kubernetes.io/docs/tasks/tools) |
| AWS CLI | ≥ 2.x | [aws.amazon.com/cli](https://aws.amazon.com/cli) |

Also required:
- AWS account with IAM user (programmatic access: EC2, VPC, ECR full permissions)
- AWS key pair created in ap-south-1 (`aws ec2 create-key-pair`)
- `aws configure` set up locally

---

## Setup Guide

### 1. Clone and configure

```bash
git clone https://github.com/YOUR_USERNAME/codesync.git
cd codesync
```

### 2. Provision AWS Infrastructure (Terraform)

```bash
cd terraform
terraform init
terraform plan -var="key_name=your-key-pair-name"
terraform apply -var="key_name=your-key-pair-name"
terraform output  # note the public IPs and ECR URLs
```

### 3. Fill Ansible inventory

```bash
# Edit ansible/inventory.ini with the IPs from terraform output
nano ansible/inventory.ini
```

### 4. Configure nodes (Ansible)

```bash
cd ansible

# Install Docker + kubeadm on all nodes
ansible-playbook playbooks/setup.yml -i inventory.ini

# Init K8s control plane on master
ansible-playbook playbooks/master.yml -i inventory.ini

# Join worker nodes to cluster
ansible-playbook playbooks/workers.yml -i inventory.ini

# Inject ECR URL and AWS credentials on master
ansible-playbook playbooks/env.yml -i inventory.ini \
  --extra-vars "ecr_url=YOUR_ECR_URL aws_region=ap-south-1 aws_access_key=KEY aws_secret_key=SECRET"
```

### 5. Verify K8s cluster

```bash
# SSH to master node
ssh -i ~/.ssh/your-key.pem ubuntu@MASTER_IP
kubectl get nodes  # should show 3 nodes: Ready
```

### 6. Deploy to Kubernetes

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/backend/
kubectl apply -f k8s/frontend/
kubectl apply -f k8s/jenkins/
kubectl apply -f k8s/ingress.yaml

kubectl get pods -n codesync -w  # wait for all pods Running
```

### 7. Set up Jenkins CI/CD

See [`docs/jenkins-setup.md`](docs/jenkins-setup.md) for full Jenkins configuration steps.

### 8. Access the app

| Service | URL |
|---------|-----|
| CodeSync app | `http://WORKER1_IP:30001` |
| Jenkins | `http://MASTER_IP:30080` |

---

## Local Development

```bash
# Start everything locally
docker-compose up --build

# Services:
# Frontend: http://localhost:5173
# Backend:  http://localhost:4000
# Postgres: localhost:5432

# Run DB migrations
cd backend && npx prisma migrate dev

# Open Prisma Studio (DB browser)
cd backend && npx prisma studio
```

---

## Environment Variables

### Backend

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Express server port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `NODE_ENV` | `development` | Runtime mode |
| `CORS_ORIGIN` | `http://localhost:5173` | Frontend URL for CORS |

### Frontend

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:4000` | Backend URL (used at build time) |

---

## Socket Events

| Direction | Event | Payload |
|-----------|-------|---------|
| Client → Server | `join_room` | `{ roomCode, username }` |
| Client → Server | `code_change` | `{ roomCode, content }` |
| Client → Server | `cursor_move` | `{ roomCode, position }` |
| Client → Server | `leave_room` | `{ roomCode }` |
| Server → Client | `room_joined` | `{ users[], language, content }` |
| Server → Client | `code_update` | `{ content }` |
| Server → Client | `cursor_update` | `{ username, color, position }` |
| Server → Client | `user_joined` | `{ username, color }` |
| Server → Client | `user_left` | `{ username }` |

---

## Project Structure

```
codesync/
├── CLAUDE.md                    # Project instructions for Claude Code
├── PROGRESS.md                  # Running progress log
├── README.md                    # This file
├── docker-compose.yml           # Local dev orchestration
├── Jenkinsfile                  # CI/CD pipeline definition
├── tasks/
│   ├── todo.md                  # Ordered implementation blocks
│   └── lessons.md               # Corrections and learned patterns
├── docs/
│   ├── jenkins-setup.md         # Step-by-step Jenkins config
│   ├── verification.md          # End-to-end test checklist
│   ├── cost-and-teardown.md     # AWS cost estimates and cleanup
│   ├── api.md                   # REST API reference
│   └── schema.md                # Database schema reference
├── terraform/
│   ├── main.tf                  # VPC, subnets, internet gateway
│   ├── ec2.tf                   # EC2 instances (master + 2 workers)
│   ├── security.tf              # Security groups and firewall rules
│   ├── ecr.tf                   # ECR repositories with lifecycle policy
│   ├── outputs.tf               # Public IPs and ECR URLs
│   └── variables.tf             # Configurable values
├── ansible/
│   ├── inventory.ini            # EC2 node IPs and SSH config
│   ├── ansible.cfg              # Ansible configuration
│   ├── playbooks/
│   │   ├── setup.yml            # Install Docker + kubeadm on all nodes
│   │   ├── master.yml           # kubeadm init + Flannel CNI
│   │   ├── workers.yml          # kubeadm join
│   │   └── env.yml              # Inject ECR URL and credentials
│   └── roles/
│       ├── common/              # Base apt packages
│       ├── docker/              # Docker Engine installation
│       └── kubernetes/          # kubeadm, kubelet, kubectl
├── backend/
│   ├── src/
│   │   ├── index.js             # Express + Socket.io entry point
│   │   ├── db.js                # Prisma client singleton
│   │   ├── routes/
│   │   │   └── rooms.js         # POST / GET /:code PATCH /:code
│   │   └── socket/
│   │       └── index.js         # Socket.io event handlers
│   ├── prisma/
│   │   └── schema.prisma        # Room + RoomSession models
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── main.jsx             # React Router setup
│   │   ├── api.js               # Axios instance + API calls
│   │   ├── pages/
│   │   │   ├── UsernameEntry.jsx
│   │   │   ├── RoomEntry.jsx
│   │   │   └── EditorPage.jsx
│   │   ├── components/
│   │   │   ├── Sidebar.jsx
│   │   │   └── LanguageSelector.jsx
│   │   └── hooks/
│   │       └── useSocket.js
│   ├── nginx.conf               # SPA routing + backend proxy
│   ├── Dockerfile
│   ├── .dockerignore
│   └── package.json
└── k8s/
    ├── namespace.yaml
    ├── ingress.yaml
    ├── frontend/
    │   ├── deployment.yaml
    │   └── service.yaml
    ├── backend/
    │   ├── deployment.yaml
    │   ├── service.yaml
    │   ├── configmap.yaml
    │   ├── secret.yaml
    │   └── hpa.yaml
    ├── postgres/
    │   ├── deployment.yaml
    │   ├── service.yaml
    │   ├── pvc.yaml
    │   └── secret.yaml
    └── jenkins/
        ├── deployment.yaml
        ├── service.yaml
        └── pvc.yaml
```

---

## Teardown

See [`docs/cost-and-teardown.md`](docs/cost-and-teardown.md) for full teardown instructions.

Quick teardown:
```bash
# Delete PVCs first (releases EBS volumes)
kubectl delete pvc --all -n codesync

# Destroy all AWS infrastructure
cd terraform && terraform destroy -var="key_name=your-key-pair-name"

# Manually verify no orphaned EBS volumes in AWS console
```

> ⚠️ Always delete PVCs before running `terraform destroy` — otherwise EBS volumes will be orphaned and continue incurring charges.
