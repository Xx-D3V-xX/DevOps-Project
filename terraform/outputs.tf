# ── Outputs ───────────────────────────────────────────────────────────────────

output "security_group_id" {
  description = "ID of the codesync security group"
  value       = aws_security_group.codesync_sg.id
}

output "master_public_ip" {
  description = "Public IP of the Kubernetes master node"
  value       = aws_instance.master.public_ip
}

output "worker1_public_ip" {
  description = "Public IP of Kubernetes worker node 1"
  value       = aws_instance.worker1.public_ip
}

output "worker2_public_ip" {
  description = "Public IP of Kubernetes worker node 2"
  value       = aws_instance.worker2.public_ip
}
