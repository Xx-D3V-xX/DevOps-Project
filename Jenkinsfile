pipeline {
    agent any

    environment {
        ECR_URL         = credentials('ecr-url')
        AWS_REGION      = 'ap-south-1'
        // Set WORKER_IP in Jenkins → Manage Jenkins → System → Global properties → Environment variables
        WORKER_IP       = credentials('worker-ip')
        GIT_COMMIT_SHORT = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
        FRONTEND_IMAGE  = "${ECR_URL}/codesync-frontend:${GIT_COMMIT_SHORT}"
        BACKEND_IMAGE   = "${ECR_URL}/codesync-backend:${GIT_COMMIT_SHORT}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build Images') {
            steps {
                sh "docker build -t ${FRONTEND_IMAGE} --build-arg VITE_API_URL=http://${WORKER_IP}:30001 ./frontend"
                sh "docker build -t ${BACKEND_IMAGE} ./backend"
            }
        }

        stage('Push to ECR') {
            steps {
                sh "aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_URL}"
                sh "docker push ${FRONTEND_IMAGE}"
                sh "docker push ${BACKEND_IMAGE}"
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                sh "kubectl set image deployment/frontend frontend=${FRONTEND_IMAGE} -n codesync"
                sh "kubectl set image deployment/backend backend=${BACKEND_IMAGE} -n codesync"
            }
        }

        stage('Verify Rollout') {
            steps {
                sh "kubectl rollout status deployment/frontend -n codesync --timeout=120s"
                sh "kubectl rollout status deployment/backend -n codesync --timeout=120s"
            }
        }
    }

    post {
        failure {
            echo 'Pipeline failed — check logs above'
        }
    }
}
