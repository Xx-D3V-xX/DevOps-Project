# Jenkins Setup Guide — CodeSync CI/CD

Follow these steps in order to configure Jenkins from scratch and get the pipeline running.

---

## 1. Initial Setup

**Access Jenkins**

Open your browser and navigate to:

```
http://MASTER_IP:30080
```

Replace `MASTER_IP` with the public IP of your EC2 master node (available in Terraform outputs).

**Get the initial admin password**

Find your Jenkins pod name, then read the password from inside it:

```bash
kubectl get pods -n codesync -l app=jenkins
kubectl exec -n codesync <jenkins-pod-name> -- cat /var/jenkins_home/secrets/initialAdminPassword
```

Paste the password into the Jenkins unlock screen.

**Install suggested plugins**

When prompted, choose **Install suggested plugins**. Wait for all plugins to finish installing before proceeding.

Create your first admin user when asked, then click **Save and Finish**.

---

## 2. Additional Plugins to Install

Go to **Manage Jenkins → Plugins → Available plugins** and install each of the following:

| Plugin | Purpose |
|--------|---------|
| Docker Pipeline | Enables `docker` DSL in Jenkinsfile |
| Kubernetes CLI | Provides `kubectl` integration in pipeline steps |
| AWS Credentials | Allows storing AWS access/secret key pairs as credentials |
| Git | SCM integration for pipeline trigger and checkout |

Search for each by name, tick the checkbox, then click **Install**. Restart Jenkins after all four are installed.

---

## 3. Credentials to Add

Go to **Manage Jenkins → Credentials → System → Global credentials (unrestricted) → Add Credentials**.

Add the following three credentials exactly as described:

### AWS Credentials

| Field | Value |
|-------|-------|
| Kind | AWS Credentials |
| ID | `aws-credentials` |
| Description | AWS access key for ECR push |
| Access Key ID | Your IAM user access key |
| Secret Access Key | Your IAM user secret key |

### ECR Base URL

| Field | Value |
|-------|-------|
| Kind | Secret text |
| ID | `ecr-url` |
| Description | ECR registry base URL |
| Secret | `<account-id>.dkr.ecr.ap-south-1.amazonaws.com` |

> The ECR URL has no trailing slash and no repository name — just the registry hostname. Terraform outputs this as `ecr_url`.

### Kubeconfig File

| Field | Value |
|-------|-------|
| Kind | Secret file |
| ID | `kubeconfig` |
| Description | kubeconfig for codesync cluster |
| File | Upload `~/.kube/config` from the master EC2 node |

To copy the kubeconfig from the master node to your local machine:

```bash
scp -i your-key.pem ubuntu@MASTER_IP:~/.kube/config ./kubeconfig
```

Then upload that file as the secret file above.

---

## 4. Create the Pipeline Job

1. From the Jenkins dashboard, click **New Item**.
2. Enter name: `codesync-pipeline`
3. Select **Pipeline**, then click **OK**.

**Configure the pipeline:**

- Scroll to the **Pipeline** section at the bottom.
- Set **Definition** to: `Pipeline script from SCM`
- Set **SCM** to: `Git`
- **Repository URL**: your GitHub repository URL (e.g. `https://github.com/your-username/codesync.git`)
- **Branch Specifier**: `*/main`
- **Script Path**: `Jenkinsfile`

Click **Save**.

**Trigger a build:**

Click **Build Now** from the pipeline page. Monitor the build in **Console Output** as it progresses through all 5 stages.

---

## 5. Verify the Pipeline

After a successful build, confirm the following:

**All 5 stages are green** in the Jenkins pipeline view:
- Checkout
- Build Images
- Push to ECR
- Deploy to Kubernetes
- Verify Rollout

**New pods are running the new image tags:**

```bash
kubectl get pods -n codesync -o wide
kubectl describe pod <backend-pod-name> -n codesync | grep Image:
```

The image tag should match the short git SHA from the build.

**Rollout history shows revision 2:**

```bash
kubectl rollout history deployment/backend -n codesync
kubectl rollout history deployment/frontend -n codesync
```

You should see at least two revisions listed.

---

## Troubleshooting

### ECR authentication failure

Symptom: `no basic auth credentials` or `authorization token has expired` during the Push to ECR stage.

Fix: ECR tokens expire after 12 hours. The pipeline re-authenticates on every run, so this usually means the `aws-credentials` credential is misconfigured or the IAM user lacks `ecr:GetAuthorizationToken` permission. Verify the credential ID is exactly `aws-credentials` and that the IAM policy includes:

```json
{
  "Effect": "Allow",
  "Action": [
    "ecr:GetAuthorizationToken",
    "ecr:BatchCheckLayerAvailability",
    "ecr:InitiateLayerUpload",
    "ecr:UploadLayerPart",
    "ecr:CompleteLayerUpload",
    "ecr:PutImage"
  ],
  "Resource": "*"
}
```

### kubectl not found in Jenkins

Symptom: `kubectl: command not found` during Deploy or Verify stages.

Fix: Add `kubectl` to the PATH in **Manage Jenkins → System → Global properties → Environment variables**:

```
Name:  PATH+KUBECTL
Value: /usr/local/bin
```

Alternatively, install `kubectl` directly on the Jenkins pod by adding it to the Jenkins Dockerfile or Ansible playbook for the master node, placing the binary at `/usr/local/bin/kubectl`.

### Docker permission denied

Symptom: `permission denied while trying to connect to the Docker daemon socket` during Build Images stage.

Fix: The user running Jenkins must be in the `docker` group on the master node. SSH into the master and run:

```bash
sudo usermod -aG docker jenkins
```

Then restart Jenkins:

```bash
kubectl rollout restart deployment/jenkins -n codesync
```

If Jenkins runs as a pod, the Docker socket from the host must also be mounted into the Jenkins container. Check that the Jenkins deployment mounts `/var/run/docker.sock`:

```yaml
volumes:
  - name: docker-sock
    hostPath:
      path: /var/run/docker.sock
volumeMounts:
  - name: docker-sock
    mountPath: /var/run/docker.sock
```
