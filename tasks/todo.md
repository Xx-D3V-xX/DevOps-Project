# CodeSync — Task List

Work through blocks in order. Each block is ~2–4 hours of work.
Hand one block at a time to Claude Code along with CLAUDE.md.

---

## Task 1: AWS Infrastructure (Terraform)

### Block 1.1: VPC and Networking
What it does: Creates the AWS VPC, public subnet, internet gateway, and route table that all EC2 instances will live in.

Prompt for Claude Code:
```
Create the Terraform configuration for CodeSync's AWS networking layer.
File: terraform/main.tf

Create the following resources:
- aws_vpc: CIDR 10.0.0.0/16, enable_dns_hostnames = true, enable_dns_support = true
- aws_subnet: public subnet, CIDR 10.0.1.0/24, map_public_ip_on_launch = true, in the VPC
- aws_internet_gateway: attached to the VPC
- aws_route_table: with a route 0.0.0.0/0 → internet gateway
- aws_route_table_association: associate the subnet with the route table

All resources must be tagged: Project = "codesync", ManagedBy = "terraform"

Also create terraform/variables.tf with:
- aws_region (default: "ap-south-1")
- project_name (default: "codesync")
- vpc_cidr (default: "10.0.0.0/16")
- subnet_cidr (default: "10.0.1.0/24")
- key_name (no default — must be provided by user)

Add a terraform/providers.tf with the AWS provider pinned to ~> 5.0, region from var.aws_region.
```
Exit condition: `terraform init` and `terraform plan` complete without errors. Plan shows VPC, subnet, IGW, route table, association.

---

### Block 1.2: Security Groups
What it does: Creates firewall rules that allow SSH, HTTP, K8s API, Jenkins, NodePort, and inter-node communication.

Prompt for Claude Code:
```
Create terraform/security.tf for the CodeSync project.

Create one security group called "codesync-sg" in the VPC (reference var.vpc_id or use the VPC resource directly).

Ingress rules (allow inbound):
- Port 22 (SSH) from 0.0.0.0/0
- Port 80 (HTTP) from 0.0.0.0/0
- Port 443 (HTTPS) from 0.0.0.0/0
- Port 6443 (K8s API server) from 0.0.0.0/0
- Port 8080 (Jenkins alternate) from 0.0.0.0/0
- Ports 30000–32767 (K8s NodePort range) from 0.0.0.0/0
- All traffic (port -1, protocol -1) from within the VPC CIDR 10.0.0.0/16 (for pod-to-pod and node-to-node)

Egress rules:
- All traffic to 0.0.0.0/0

Tag with Project = "codesync", ManagedBy = "terraform".
Export security_group_id in terraform/outputs.tf.
```
Exit condition: `terraform plan` shows the security group with all 7 ingress rules and 1 egress rule. No errors.

---

### Block 1.3: EC2 Instances
What it does: Provisions the three EC2 nodes — one master (t2.medium) and two workers (t2.micro) — that form the Kubernetes cluster.

Prompt for Claude Code:
```
Create terraform/ec2.tf for the CodeSync project.

Create 3 EC2 instances using the ubuntu/images/hvm-ssd/ubuntu-22.04-amd64 AMI (use a data source to fetch the latest AMI for the region):

1. codesync-master:
   - instance_type = "t2.medium"
   - subnet_id = the public subnet
   - vpc_security_group_ids = [the codesync-sg]
   - key_name = var.key_name
   - root_block_device: volume_size = 20, volume_type = "gp2"
   - tags: Name = "codesync-master", Role = "master"

2. codesync-worker-1:
   - instance_type = "t2.micro"
   - same subnet and SG as master
   - root_block_device: volume_size = 15, volume_type = "gp2"
   - tags: Name = "codesync-worker-1", Role = "worker"

3. codesync-worker-2:
   - instance_type = "t2.micro"
   - same subnet and SG as master
   - root_block_device: volume_size = 15, volume_type = "gp2"
   - tags: Name = "codesync-worker-2", Role = "worker"

All instances: associate_public_ip_address = true, Tag Project = "codesync", ManagedBy = "terraform".

Add to terraform/outputs.tf:
- master_public_ip
- worker1_public_ip
- worker2_public_ip
```
Exit condition: `terraform apply` completes. Three EC2 instances appear in the AWS console. `terraform output` prints all three public IPs. SSH to each using the key pair works.

---

### Block 1.4: ECR Repositories
What it does: Creates two AWS ECR repositories (frontend and backend) where Jenkins will push Docker images.

Prompt for Claude Code:
```
Create terraform/ecr.tf for the CodeSync project.

Create two ECR repositories:
1. "codesync-frontend"
   - image_tag_mutability = "MUTABLE"
   - image_scanning_configuration: scan_on_push = true
   - lifecycle policy (aws_ecr_lifecycle_policy): keep only the last 5 images
     Use this lifecycle policy JSON:
     {"rules":[{"rulePriority":1,"description":"Keep last 5 images","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":5},"action":{"type":"expire"}}]}

2. "codesync-backend"
   - Same configuration as frontend

Tags: Project = "codesync", ManagedBy = "terraform"

Add to terraform/outputs.tf:
- ecr_frontend_url (the repository_url)
- ecr_backend_url (the repository_url)
```
Exit condition: `terraform apply` creates both ECR repos. `terraform output ecr_frontend_url` and `ecr_backend_url` print valid ECR URLs. Repos visible in AWS console.

---

## Task 2: Node Configuration (Ansible)

### Block 2.1: Inventory and Common Role
What it does: Creates the Ansible inventory file and the common role that installs base packages on all nodes.

Prompt for Claude Code:
```
Set up the Ansible project structure for CodeSync.

1. Create ansible/inventory.ini:
[master]
MASTER_IP ansible_user=ubuntu ansible_ssh_private_key_file=~/.ssh/your-key.pem

[workers]
WORKER1_IP ansible_user=ubuntu ansible_ssh_private_key_file=~/.ssh/your-key.pem
WORKER2_IP ansible_user=ubuntu ansible_ssh_private_key_file=~/.ssh/your-key.pem

[all:children]
master
workers

Replace MASTER_IP, WORKER1_IP, WORKER2_IP with placeholder comments.

2. Create ansible/roles/common/ with:
- tasks/main.yml: Run apt-get update, install curl, wget, apt-transport-https, ca-certificates, gnupg, lsb-release, software-properties-common. Use apt module, update_cache: yes.
- All tasks must have names. Use become: yes.

3. Create ansible/ansible.cfg:
[defaults]
host_key_checking = False
roles_path = ./roles
```
Exit condition: `ansible all -m ping -i ansible/inventory.ini` returns SUCCESS for all 3 nodes (after manually filling in IPs).

---

### Block 2.2: Docker Role
What it does: Installs Docker Engine on all nodes — required for both kubeadm and for building/running containers.

Prompt for Claude Code:
```
Create the Ansible Docker role at ansible/roles/docker/.

tasks/main.yml should:
1. Remove old Docker packages (docker, docker-engine, docker.io, containerd, runc) using apt with state=absent
2. Add Docker's official GPG key to /etc/apt/keyrings/docker.gpg
3. Add Docker APT repository for ubuntu-22.04 (jammy)
4. Run apt-get update
5. Install: docker-ce, docker-ce-cli, containerd.io, docker-buildx-plugin, docker-compose-plugin
6. Start and enable the docker service
7. Add ubuntu user to the docker group
8. Configure /etc/docker/daemon.json with:
   {"exec-opts":["native.cgroupdriver=systemd"],"log-driver":"json-file","log-opts":{"max-size":"100m"},"storage-driver":"overlay2"}
9. Restart docker after daemon.json change

Use become: yes for all tasks. All tasks must be idempotent.
```
Exit condition: After running the role via `ansible-playbook ansible/playbooks/setup.yml`, `docker --version` returns successfully on all 3 nodes and `systemctl is-active docker` returns active.

---

### Block 2.3: Kubernetes Role
What it does: Installs kubeadm, kubelet, and kubectl on all nodes.

Prompt for Claude Code:
```
Create the Ansible Kubernetes role at ansible/roles/kubernetes/.

tasks/main.yml should:
1. Disable swap: command swapoff -a, and comment out swap in /etc/fstab (use lineinfile with regexp: '^/.*swap')
2. Load kernel modules: overlay, br_netfilter (use modprobe and persist in /etc/modules-load.d/k8s.conf)
3. Set sysctl params in /etc/sysctl.d/k8s.conf:
   net.bridge.bridge-nf-call-iptables = 1
   net.bridge.bridge-nf-call-ip6tables = 1
   net.ipv4.ip_forward = 1
   Then run sysctl --system
4. Add Kubernetes APT repository (v1.28):
   - Add GPG key from https://pkgs.k8s.io/core:/stable:/v1.28/deb/Release.key to /etc/apt/keyrings/kubernetes-apt-keyring.gpg
   - Add repo: deb [signed-by=...] https://pkgs.k8s.io/core:/stable:/v1.28/deb/ /
5. Install kubelet=1.28.*, kubeadm=1.28.*, kubectl=1.28.* — hold these packages with apt-mark hold
6. Enable and start kubelet service

Use become: yes. All tasks idempotent.
```
Exit condition: After running the role, `kubeadm version`, `kubelet --version`, `kubectl version --client` all return v1.28.x on all 3 nodes.

---

### Block 2.4: Setup, Master, and Workers Playbooks
What it does: Ties the roles together into three playbooks — setup (all nodes), master init (control plane), and workers join.

Prompt for Claude Code:
```
Create three Ansible playbooks:

1. ansible/playbooks/setup.yml:
   - hosts: all
   - become: yes
   - roles: [common, docker, kubernetes]
   This runs all three roles on every node.

2. ansible/playbooks/master.yml:
   - hosts: master
   - become: yes
   - tasks:
     a. Run kubeadm init with --pod-network-cidr=10.244.0.0/16
     b. Create /home/ubuntu/.kube/config (copy from /etc/kubernetes/admin.conf, set owner ubuntu:ubuntu)
     c. Also copy kubeconfig to /root/.kube/config
     d. Apply Flannel CNI: kubectl apply -f https://github.com/flannel-io/flannel/releases/latest/download/kube-flannel.yml
     e. Generate join command: kubeadm token create --print-join-command
     f. Save the join command output to a file /tmp/join-command.sh on the master
     g. Fetch /tmp/join-command.sh to the Ansible controller at /tmp/join-command.sh

3. ansible/playbooks/workers.yml:
   - hosts: workers
   - become: yes
   - tasks:
     a. Copy /tmp/join-command.sh from controller to worker at /tmp/join-command.sh
     b. Run the join command: bash /tmp/join-command.sh

Add a comment at the top of each playbook explaining what it does and the order to run them:
setup.yml → master.yml → workers.yml
```
Exit condition: After running all three playbooks in order, `kubectl get nodes` on the master shows all 3 nodes in Ready state.

---

### Block 2.5: Environment Injection Playbook
What it does: Injects ECR URL, region, and other runtime env vars onto the master node for Jenkins and kubectl to use.

Prompt for Claude Code:
```
Create ansible/playbooks/env.yml.

This playbook runs on the master node only and injects environment variables needed by Jenkins and kubectl.

Tasks:
1. Create /etc/codesync-env with the following content (use a template or lineinfile):
   ECR_URL={{ ecr_url }}
   AWS_REGION={{ aws_region }}
   K8S_NAMESPACE=codesync

2. Add a line to /etc/environment to source /etc/codesync-env (append: ". /etc/codesync-env")

3. Create /home/ubuntu/.aws/credentials with:
   [default]
   aws_access_key_id={{ aws_access_key }}
   aws_secret_access_key={{ aws_secret_key }}
   Set file permissions to 0600, owner ubuntu.

Variables ecr_url, aws_region, aws_access_key, aws_secret_key should be passed via --extra-vars at runtime — do NOT hardcode them in the playbook.

Add a comment: "Run with: ansible-playbook env.yml -i inventory.ini --extra-vars 'ecr_url=... aws_region=... aws_access_key=... aws_secret_key=...'"
```
Exit condition: After running the playbook (with extra vars provided), SSH to master and run `source /etc/codesync-env && echo $ECR_URL` — prints the correct ECR URL.

---

## Task 3: Backend Application

### Block 3.1: Project Setup and Prisma Schema
What it does: Initializes the Node.js backend project, installs dependencies, and defines the database schema.

Prompt for Claude Code:
```
Initialize the CodeSync backend at backend/.

1. Run: npm init -y, then install:
   - dependencies: express, socket.io, @prisma/client, pg, cors, dotenv, express-validator
   - devDependencies: prisma, nodemon

2. Create backend/prisma/schema.prisma:
   generator client { provider = "prisma-client-js" }
   datasource db { provider = "postgresql", url = env("DATABASE_URL") }

   model Room {
     id         String   @id @default(uuid())
     code       String   @unique @db.VarChar(6)
     language   Language @default(python)
     content    String   @default("") @db.Text
     createdAt  DateTime @default(now())
     updatedAt  DateTime @updatedAt
     sessions   RoomSession[]
   }

   model RoomSession {
     id        String    @id @default(uuid())
     roomId    String
     room      Room      @relation(fields: [roomId], references: [id])
     username  String    @db.VarChar(50)
     joinedAt  DateTime  @default(now())
     leftAt    DateTime?
   }

   enum Language { python java c }

3. Create backend/.env.example:
   PORT=4000
   DATABASE_URL=postgresql://codesync:password@localhost:5432/codesync
   NODE_ENV=development
   CORS_ORIGIN=http://localhost:5173

4. Update backend/package.json scripts:
   "dev": "nodemon src/index.js"
   "start": "node src/index.js"
   "db:migrate": "prisma migrate dev"
   "db:generate": "prisma generate"
```
Exit condition: `cd backend && npm install` completes. `npx prisma generate` runs without errors. Schema file exists with correct models.

---

### Block 3.2: Express Server and REST Routes
What it does: Creates the Express server entry point and the three REST endpoints for room management.

Prompt for Claude Code:
```
Create the Express server and room API routes for the CodeSync backend.

1. backend/src/index.js:
   - Load dotenv
   - Create Express app
   - Apply cors middleware (origin from process.env.CORS_ORIGIN)
   - Apply express.json()
   - Mount router at /api/rooms from ./routes/rooms
   - Export an httpServer (using node:http createServer(app)) — this will be used by Socket.io
   - Listen on process.env.PORT (default 4000)
   - Log: "Server running on port X"

2. backend/src/routes/rooms.js:
   Express Router with three routes:

   POST /  (create room)
   - Generate a random 6-char alphanumeric room code
   - Create room in DB via Prisma
   - Return { data: { code, language, content, createdAt } }

   GET /:code  (get room)
   - Find room by code in DB
   - If not found: return 404 { error: "Room not found" }
   - Return { data: { code, language, content, updatedAt } }

   PATCH /:code  (update room)
   - Accept body: { language?, content? }
   - Update only the fields that are provided
   - Return { data: { code, language, content, updatedAt } }

   All routes use async/await. Wrap in try/catch — on error return 500 { error: err.message }.

3. Create backend/src/db.js:
   - Import PrismaClient, export a singleton instance
```
Exit condition: `npm run dev` starts without errors. `curl -X POST http://localhost:4000/api/rooms` returns a JSON object with a 6-char code. `curl http://localhost:4000/api/rooms/<code>` returns the room data.

---

### Block 3.3: Socket.io Real-Time Events
What it does: Adds the Socket.io server with all collaborative editing events — join, code change, cursor movement, and leave.

Prompt for Claude Code:
```
Create the Socket.io server for CodeSync real-time collaboration.

Create backend/src/socket/index.js that takes the httpServer and attaches Socket.io to it.

Socket.io config:
- cors: { origin: process.env.CORS_ORIGIN, methods: ["GET", "POST"] }

In-memory room state (a Map):
- Key: roomCode
- Value: { users: Map<socketId, { username, color }> }

Assign a color from this palette on join (cycle through):
["#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD","#98D8C8"]

Handle these socket events:

1. "join_room" ({ roomCode, username }):
   - Add user to in-memory room state with assigned color
   - socket.join(roomCode)
   - Fetch room from DB (language + content)
   - Emit "room_joined" back to this socket: { users: [...], language, content }
   - Broadcast "user_joined" to room (excluding this socket): { username, color }
   - Create a RoomSession record in DB (joinedAt = now)

2. "code_change" ({ roomCode, content }):
   - Save content snapshot to DB (debounce in memory — only write to DB if last write was >5s ago, use a Map to track last write times per room)
   - Broadcast "code_update" to room (excluding sender): { content }

3. "cursor_move" ({ roomCode, position }):
   - Broadcast "cursor_update" to room (excluding sender): { username, color, position }
   - (Get username from the in-memory user state for this socket)

4. "disconnect":
   - Find which rooms this socket was in
   - Remove user from in-memory state
   - Broadcast "user_left" to affected rooms: { username }
   - Update RoomSession.leftAt in DB

Import and call this function from backend/src/index.js, passing the httpServer.
```
Exit condition: Two browser tabs open to the backend test page (or Postman WebSocket) can join the same room. A `code_change` event from tab 1 is received as `code_update` in tab 2. Disconnect from tab 1 sends `user_left` to tab 2.

---

## Task 4: Frontend Application

### Block 4.1: React Project Setup and Routing
What it does: Initializes the Vite + React project, installs dependencies, and sets up the three-page app structure.

Prompt for Claude Code:
```
Initialize the CodeSync frontend at frontend/.

1. Create a new Vite React project: npm create vite@latest . -- --template react
   Then install:
   - socket.io-client
   - @monaco-editor/react
   - axios

2. Set up three pages in frontend/src/pages/:
   - UsernameEntry.jsx — a centered form where user types their name and clicks "Enter"
     On submit: save username to localStorage under key "codesync_username", navigate to /room
   - RoomEntry.jsx — two options: "Create Room" button (POST /api/rooms → redirect to /room/:code)
     and "Join Room" input (enter a code → GET /api/rooms/:code → redirect to /room/:code)
   - EditorPage.jsx — placeholder div for now ("Editor coming in Block 4.2")

3. Set up React Router in frontend/src/main.jsx:
   Routes:
   / → UsernameEntry (if no username in localStorage, else redirect to /room)
   /room → RoomEntry
   /room/:code → EditorPage

4. Create frontend/src/api.js:
   - axios instance with baseURL = import.meta.env.VITE_API_URL (default: http://localhost:4000)
   - Export: createRoom(), getRoom(code)

5. frontend/.env.example:
   VITE_API_URL=http://localhost:4000
```
Exit condition: `npm run dev` starts. Navigating to / shows the username entry page. Entering a name navigates to /room. Clicking "Create Room" calls the API and navigates to /room/:code.

---

### Block 4.2: Monaco Editor and Socket Integration
What it does: Builds the core editor page with Monaco, Socket.io connection, real-time code sync, and cursor presence.

Prompt for Claude Code:
```
Build the EditorPage for CodeSync at frontend/src/pages/EditorPage.jsx.

Create a custom hook frontend/src/hooks/useSocket.js:
- Connects to the backend socket URL (import.meta.env.VITE_API_URL)
- Accepts roomCode and username as params
- On mount: emits "join_room" with { roomCode, username }
- Listens for: room_joined, code_update, cursor_update, user_joined, user_left
- On unmount: emits "leave_room" and disconnects socket
- Returns: { socket, users, remoteContent, remoteCursors, roomLanguage }

EditorPage.jsx:
- Read roomCode from useParams(), username from localStorage
- If no username: redirect to /
- Use useSocket hook
- State: localContent (string), language (from roomLanguage)

Layout (split pane):
Left (sidebar, ~200px wide):
  - Room code display with a "Copy" button
  - Language selector: <select> with options Python/Java/C
    On change: emit "language_change" event (add this to backend too), PATCH /api/rooms/:code
  - Active users list: each user shown with a colored dot and their username

Right (main, flex-grow):
  - @monaco-editor/react <Editor> component
    - language prop: "python" | "java" | "c" (map "c" to "c" for Monaco)
    - value: localContent
    - onChange: (val) => { setLocalContent(val); socket.emit("code_change", { roomCode, content: val }) }
    - theme: "vs-dark"
    - options: fontSize 14, minimap disabled, wordWrap "on"

When remoteContent changes (from socket): update localContent (avoid cursor jump — use a ref flag to skip re-emitting)

Add basic CSS: dark background (#1e1e1e), sidebar in #252526, editor takes full height.
```
Exit condition: Two browser windows open to the same room URL. Typing in one window updates the other within ~100ms. The sidebar shows both users with colored dots. Language selector change updates both editors.

---

### Block 4.3: Dockerfiles and docker-compose
What it does: Containerizes the frontend and backend and sets up local docker-compose for integrated testing.

Prompt for Claude Code:
```
Create Docker configuration for CodeSync.

1. backend/Dockerfile (multi-stage):
   Stage 1 (deps): node:18-alpine, WORKDIR /app, copy package*.json, RUN npm ci --only=production
   Stage 2 (prod): node:18-alpine, WORKDIR /app, copy from deps /app/node_modules, copy src/ and prisma/, EXPOSE 4000, CMD ["node", "src/index.js"]
   Note: prisma generate must run — add it as part of the build or use a postinstall script.

2. frontend/Dockerfile (multi-stage):
   Stage 1 (build): node:18-alpine, WORKDIR /app, copy package*.json, npm ci, copy src/ public/ index.html vite.config.js, ARG VITE_API_URL, ENV VITE_API_URL=$VITE_API_URL, RUN npm run build
   Stage 2 (serve): nginx:alpine, copy --from=build /app/dist /usr/share/nginx/html, copy nginx.conf /etc/nginx/conf.d/default.conf, EXPOSE 80

3. frontend/nginx.conf:
   server {
     listen 80;
     root /usr/share/nginx/html;
     index index.html;
     location / { try_files $uri $uri/ /index.html; }  # SPA routing
     location /api/ { proxy_pass http://backend:4000/api/; }
     location /socket.io/ {
       proxy_pass http://backend:4000/socket.io/;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
     }
   }

4. docker-compose.yml (root level, for local dev only):
   services:
     postgres: image postgres:15-alpine, env POSTGRES_USER=codesync POSTGRES_PASSWORD=password POSTGRES_DB=codesync, port 5432:5432
     backend: build ./backend, depends_on postgres, env DATABASE_URL=postgresql://codesync:password@postgres:5432/codesync PORT=4000 CORS_ORIGIN=http://localhost:5173 NODE_ENV=development, port 4000:4000
     frontend: build ./frontend with ARG VITE_API_URL=http://localhost:4000, depends_on backend, port 5173:80

5. Create backend/.dockerignore and frontend/.dockerignore:
   Both should exclude: node_modules, .env, *.log, .git, README.md
```
Exit condition: `docker-compose up --build` starts all three services. Opening http://localhost:5173 shows the username entry page. Full flow works (create room, join, type code, see it sync).

---

## Task 5: Kubernetes Manifests

### Block 5.1: Namespace, ConfigMap, and Secrets
What it does: Creates the K8s namespace and base configuration objects used by all other resources.

Prompt for Claude Code:
```
Create Kubernetes base configuration for CodeSync.

1. k8s/namespace.yaml:
   apiVersion: v1, kind: Namespace, metadata: name: codesync

2. k8s/postgres/secret.yaml:
   Kind: Secret, name: postgres-secret, namespace: codesync
   type: Opaque
   stringData:
     POSTGRES_USER: codesync
     POSTGRES_PASSWORD: codesync_password_change_me
     POSTGRES_DB: codesync
     DATABASE_URL: postgresql://codesync:codesync_password_change_me@postgres-service:5432/codesync

3. k8s/backend/configmap.yaml:
   Kind: ConfigMap, name: backend-config, namespace: codesync
   data:
     PORT: "4000"
     NODE_ENV: "production"
     CORS_ORIGIN: "http://NODE_PUBLIC_IP:30001"  # placeholder comment to replace

4. k8s/backend/secret.yaml:
   Kind: Secret, name: backend-secret, namespace: codesync
   type: Opaque
   stringData:
     DATABASE_URL: postgresql://codesync:codesync_password_change_me@postgres-service:5432/codesync

Add a README comment at the top of each secret file: "# DO NOT COMMIT — replace values before applying"
```
Exit condition: `kubectl apply -f k8s/namespace.yaml` creates the codesync namespace. `kubectl get ns codesync` shows Active.

---

### Block 5.2: PostgreSQL Pod
What it does: Deploys PostgreSQL as a StatefulSet-like Deployment with a PersistentVolumeClaim for durable storage.

Prompt for Claude Code:
```
Create Kubernetes manifests for the PostgreSQL database pod.

1. k8s/postgres/pvc.yaml:
   Kind: PersistentVolumeClaim, name: postgres-pvc, namespace: codesync
   accessModes: [ReadWriteOnce]
   resources: requests: storage: 5Gi
   storageClassName: gp2  # AWS EBS gp2

2. k8s/postgres/deployment.yaml:
   Kind: Deployment, name: postgres, namespace: codesync
   replicas: 1
   selector: matchLabels: app: postgres
   template:
     labels: app: postgres
     spec:
       containers:
       - name: postgres
         image: postgres:15-alpine
         ports: [5432]
         envFrom: secretRef: postgres-secret
         volumeMounts: [mountPath: /var/lib/postgresql/data, name: postgres-data, subPath: pgdata]
         resources:
           requests: memory: 256Mi, cpu: 250m
           limits: memory: 512Mi, cpu: 500m
         livenessProbe: exec: command: [pg_isready, -U, codesync], initialDelaySeconds: 30, periodSeconds: 10
       volumes:
       - name: postgres-data, persistentVolumeClaim: claimName: postgres-pvc

3. k8s/postgres/service.yaml:
   Kind: Service, name: postgres-service, namespace: codesync
   selector: app: postgres
   ports: [port: 5432, targetPort: 5432]
   type: ClusterIP
```
Exit condition: `kubectl apply -f k8s/postgres/` starts the postgres pod. `kubectl get pods -n codesync` shows postgres pod Running. `kubectl exec -it postgres-xxx -n codesync -- psql -U codesync` connects successfully.

---

### Block 5.3: Backend and Frontend Deployments
What it does: Deploys the backend and frontend pods with rolling update strategy, resource limits, and HPA for the backend.

Prompt for Claude Code:
```
Create Kubernetes manifests for backend and frontend services.

BACKEND:

1. k8s/backend/deployment.yaml:
   Kind: Deployment, name: backend, namespace: codesync
   replicas: 2
   strategy: RollingUpdate, maxSurge: 1, maxUnavailable: 0
   selector: matchLabels: app: backend
   template:
     labels: app: backend
     spec:
       containers:
       - name: backend
         image: ECR_BACKEND_URL:latest  # placeholder — Jenkins replaces this
         ports: [4000]
         envFrom: [configMapRef: backend-config, secretRef: backend-secret]
         resources:
           requests: memory: 128Mi, cpu: 100m
           limits: memory: 256Mi, cpu: 300m
         readinessProbe: httpGet: path: /api/health, port: 4000, initialDelaySeconds: 10, periodSeconds: 5
         livenessProbe: httpGet: path: /api/health, port: 4000, initialDelaySeconds: 30, periodSeconds: 10

   Note: Add GET /api/health route to backend that returns { status: "ok" }

2. k8s/backend/service.yaml:
   Kind: Service, name: backend-service, namespace: codesync
   selector: app: backend
   ports: [port: 4000, targetPort: 4000]
   type: ClusterIP

3. k8s/backend/hpa.yaml:
   Kind: HorizontalPodAutoscaler, name: backend-hpa, namespace: codesync
   scaleTargetRef: backend Deployment
   minReplicas: 2, maxReplicas: 5
   metrics: [cpu: averageUtilization: 70]

FRONTEND:

4. k8s/frontend/deployment.yaml:
   Kind: Deployment, name: frontend, namespace: codesync
   replicas: 2
   strategy: RollingUpdate, maxSurge: 1, maxUnavailable: 0
   container:
     image: ECR_FRONTEND_URL:latest  # placeholder
     ports: [80]
     resources: requests: memory: 64Mi cpu: 50m / limits: memory: 128Mi cpu: 150m

5. k8s/frontend/service.yaml:
   Kind: Service, name: frontend-service, namespace: codesync
   selector: app: frontend
   ports: [port: 80, targetPort: 80, nodePort: 30001]
   type: NodePort
```
Exit condition: `kubectl apply -f k8s/backend/ -f k8s/frontend/` applies all manifests without errors. `kubectl get deployments -n codesync` shows backend and frontend (pods will be in ImagePullBackOff until ECR is set up — that's expected at this stage).

---

### Block 5.4: Ingress and Jenkins Pod
What it does: Sets up the nginx ingress controller to route traffic and deploys Jenkins as a pod on the master node.

Prompt for Claude Code:
```
Create the Ingress and Jenkins manifests for CodeSync.

1. Install nginx ingress controller (add instructions as a comment in k8s/ingress.yaml):
   kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.4/deploy/static/provider/baremetal/deploy.yaml

2. k8s/ingress.yaml:
   Kind: Ingress, name: codesync-ingress, namespace: codesync
   annotations:
     kubernetes.io/ingress.class: nginx
     nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
     nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
     nginx.ingress.kubernetes.io/affinity: cookie
     nginx.ingress.kubernetes.io/session-cookie-name: INGRESSCOOKIE
   spec.rules:
   - http:
       paths:
       - path: /api, pathType: Prefix → backend-service:4000
       - path: /socket.io, pathType: Prefix → backend-service:4000
       - path: /, pathType: Prefix → frontend-service:80

3. k8s/jenkins/deployment.yaml:
   Kind: Deployment, name: jenkins, namespace: codesync
   replicas: 1
   nodeSelector: kubernetes.io/hostname: codesync-master  # pin to master node
   tolerations: [key: node-role.kubernetes.io/control-plane, effect: NoSchedule]
   container:
     image: jenkins/jenkins:lts-jdk17
     ports: [8080, 50000]
     volumeMounts: [/var/jenkins_home → jenkins-data PVC]
     resources: requests: memory: 512Mi cpu: 300m / limits: memory: 1Gi cpu: 600m

4. k8s/jenkins/pvc.yaml:
   PVC: jenkins-data, 5Gi, ReadWriteOnce, gp2

5. k8s/jenkins/service.yaml:
   Service: jenkins-service, NodePort 30080 → 8080
```
Exit condition: `kubectl apply -f k8s/jenkins/ -f k8s/ingress.yaml`. Jenkins pod starts. Accessing http://MASTER_IP:30080 shows the Jenkins setup screen.

---

## Task 6: CI/CD Pipeline (Jenkins)

### Block 6.1: Jenkinsfile
What it does: Defines the full CI/CD pipeline — lint, build Docker images, push to ECR, and rolling deploy to K8s.

Prompt for Claude Code:
```
Create the Jenkinsfile at the repo root for the CodeSync CI/CD pipeline.

Pipeline should be declarative. Stages:

environment block (top level):
  ECR_URL = credentials('ecr-url')  # or use env var from Jenkins config
  AWS_REGION = "ap-south-1"
  GIT_COMMIT_SHORT = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
  FRONTEND_IMAGE = "${ECR_URL}/codesync-frontend:${GIT_COMMIT_SHORT}"
  BACKEND_IMAGE = "${ECR_URL}/codesync-backend:${GIT_COMMIT_SHORT}"

Stages:

1. "Checkout": checkout scm

2. "Lint":
   - sh 'cd frontend && npm ci && npx eslint src/ --max-warnings 0'
   - sh 'cd backend && npm ci && npx eslint src/ --max-warnings 0'
   (Add .eslintrc.cjs to both frontend and backend with basic rules)

3. "Build Images":
   - sh "docker build -t ${FRONTEND_IMAGE} --build-arg VITE_API_URL=http://WORKER1_IP:30001 ./frontend"
   - sh "docker build -t ${BACKEND_IMAGE} ./backend"

4. "Push to ECR":
   - sh "aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_URL}"
   - sh "docker push ${FRONTEND_IMAGE}"
   - sh "docker push ${BACKEND_IMAGE}"

5. "Deploy to Kubernetes":
   - sh "kubectl set image deployment/frontend frontend=${FRONTEND_IMAGE} -n codesync"
   - sh "kubectl set image deployment/backend backend=${BACKEND_IMAGE} -n codesync"

6. "Verify Rollout":
   - sh "kubectl rollout status deployment/frontend -n codesync --timeout=120s"
   - sh "kubectl rollout status deployment/backend -n codesync --timeout=120s"

post { failure { echo 'Pipeline failed — check logs above' } }

Also create basic .eslintrc.cjs for both frontend and backend (eslint:recommended config, node env for backend, browser env for frontend).
```
Exit condition: Jenkinsfile exists at repo root. Pipeline can be parsed by Jenkins (verify via Jenkins "Pipeline Syntax" checker). On a manual run, all 6 stages complete green.

---

### Block 6.2: Jenkins Configuration
What it does: Documents the Jenkins setup steps — plugins, credentials, and pipeline job creation.

Prompt for Claude Code:
```
Create docs/jenkins-setup.md with step-by-step Jenkins configuration instructions.

Document the following steps:

1. Initial Setup:
   - Access Jenkins at http://MASTER_IP:30080
   - Get initial admin password: kubectl exec -n codesync jenkins-xxx -- cat /var/jenkins_home/secrets/initialAdminPassword
   - Install suggested plugins

2. Additional Plugins to Install (Manage Jenkins → Plugins):
   - Docker Pipeline
   - Kubernetes CLI
   - AWS Credentials
   - Git

3. Credentials to Add (Manage Jenkins → Credentials → Global):
   - ID: aws-credentials, Kind: AWS Credentials, access key + secret key
   - ID: ecr-url, Kind: Secret text, value: your ECR base URL
   - ID: kubeconfig, Kind: Secret file, upload the kubeconfig from master (~/.kube/config)

4. Create Pipeline Job:
   - New Item → Pipeline → name: codesync-pipeline
   - Definition: Pipeline script from SCM
   - SCM: Git, Repository URL: your GitHub repo
   - Branch: */main
   - Script Path: Jenkinsfile
   - Save and Build Now

5. Verify:
   - All 6 stages green
   - kubectl get pods -n codesync shows new pods running new image tags
   - kubectl rollout history deployment/backend -n codesync shows revision 2

Also add a Troubleshooting section for common issues:
- ECR auth failure: re-run aws ecr get-login-password
- kubectl not found in Jenkins: add kubectl to PATH in Jenkins global env config
- Docker permission denied: ensure jenkins user is in docker group on master node
```
Exit condition: docs/jenkins-setup.md exists with all sections complete. A human following this doc can set up Jenkins from scratch and get the pipeline running.

---

## Task 7: Integration and Testing

### Block 7.1: End-to-End Verification
What it does: Verifies the full system — real-time sync, persistence, rolling deploys, and K8s self-healing.

Prompt for Claude Code:
```
Create docs/verification.md with a structured verification checklist for CodeSync.

Include the following test scenarios with exact steps and expected outcomes:

1. Real-time collaboration:
   - Open two browsers to http://WORKER1_IP:30001
   - Enter different usernames
   - Create a room in browser 1, join in browser 2 using the room code
   - Type in browser 1 → verify content appears in browser 2 within ~200ms
   - Expected: both editors show same content

2. Cursor presence:
   - In the shared room, move cursor in browser 1
   - Expected: a colored cursor indicator appears in browser 2 with browser 1's username

3. Language switch persistence:
   - In a room, change language to Java
   - Refresh browser 2
   - Expected: browser 2 rejoins and sees Java selected

4. Code persistence:
   - Type code in a room, wait 10s (auto-save interval)
   - Close both browsers
   - Reopen and join the same room code
   - Expected: previous code is still there

5. K8s self-healing:
   - kubectl delete pod -l app=backend -n codesync (delete one backend pod)
   - kubectl get pods -n codesync -w
   - Expected: K8s restarts a new backend pod within 30s

6. Rolling deploy via Jenkins:
   - Make a trivial code change (e.g. change a console.log message in backend)
   - Push to main branch
   - Watch Jenkins pipeline at http://MASTER_IP:30080
   - Expected: pipeline completes all 6 stages, new pod runs new image tag

7. HPA (load not required — just verify it's registered):
   - kubectl get hpa -n codesync
   - Expected: backend-hpa shows current replicas = 2, target CPU = 70%

For each test: write PASS/FAIL status column to fill in during verification.
```
Exit condition: docs/verification.md exists. All 7 tests can be run manually. At least tests 1–5 pass on the live cluster.

---

## Task 8: Cleanup and Documentation

### Block 8.1: README
What it does: Writes the engineering README covering architecture, setup, and running the project.

Prompt for Claude Code:
```
Write README.md for the CodeSync project at the repo root.

Follow this structure exactly:

# CodeSync
> Real-time collaborative code editor with full DevOps pipeline on AWS

## Overview
[2–3 sentences: what it is, what it does, who it's for]

## Architecture
[Include the ASCII diagram from CLAUDE.md — VPC, nodes, K8s namespace layout]
[Include a tool responsibility table: Terraform / Ansible / Jenkins / Docker / K8s — one role per tool]

## Tech Stack
[Table: Layer | Technology | Notes]

## Prerequisites
[Exact versions: Node 18+, Python 3.x for Ansible, Terraform 1.6+, Ansible 2.14+, Docker, kubectl, AWS CLI]

## Setup Guide
### 1. Provision Infrastructure (Terraform)
[Copy-pasteable commands: terraform init, plan, apply, output]

### 2. Configure Nodes (Ansible)
[Commands: fill inventory.ini, run playbooks in order]

### 3. Deploy Application (Kubernetes)
[kubectl apply commands in order]

### 4. Set Up CI/CD (Jenkins)
[Link to docs/jenkins-setup.md]

## Local Development
[docker-compose up --build, URLs]

## Environment Variables
[Table from CLAUDE.md]

## Project Structure
[Directory tree from CLAUDE.md with annotations]

## Teardown
[terraform destroy steps, ECR cleanup, PVC deletion warning]
```
Exit condition: README.md exists at repo root, covers all sections, all commands are copy-pasteable and accurate.

---

### Block 8.2: Teardown and Cost Notes
What it does: Documents how to safely destroy all AWS resources and minimize cost during development.

Prompt for Claude Code:
```
Create docs/cost-and-teardown.md with the following sections:

## Estimated AWS Costs
Table showing:
| Resource | Type | Est. Cost/day | Notes |
| EC2 Master | t2.medium | ~$0.05 | K8s control plane + Jenkins |
| EC2 Worker × 2 | t2.micro | ~$0.02 each | Pods |
| EBS Volumes × 3 | gp2, 20+15+15 GB | ~$0.01 | Attached to EC2 |
| EBS PVCs × 2 | gp2, 5+5 GB | ~$0.01 | postgres + jenkins |
| ECR | storage | ~$0.001 | Per GB |
| Data Transfer | outbound | varies | |
| Total estimate | | ~$0.12/day | ~$3.60/month |

## Stopping Costs Without Destroying
- Stop EC2 instances (not terminate): EBS still incurs cost, EC2 compute stops
- kubectl scale deployment --replicas=0 for all deployments

## Full Teardown (in order)
1. Delete K8s PVCs first (to release EBS volumes):
   kubectl delete pvc --all -n codesync
2. Run terraform destroy (destroys EC2, VPC, ECR repos — NOT EBS PVCs if not deleted first)
3. Manually delete any orphaned EBS volumes in AWS console
4. Delete ECR images: aws ecr batch-delete-image --repository-name codesync-frontend --image-ids imageTag=latest

## Cost-Saving Tips During Development
- Stop EC2 instances when not actively working
- Use t2.micro for workers — avoid t3 (not free-tier eligible)
- Set ECR lifecycle policy (already done in Terraform) to avoid image storage bloat
- Use ap-south-1 (Mumbai) — usually cheaper than us-east-1 for EC2
```
Exit condition: docs/cost-and-teardown.md exists with all sections. Teardown steps are accurate and safe to follow.
