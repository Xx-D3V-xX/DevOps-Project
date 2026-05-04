# ── Outputs ───────────────────────────────────────────────────────────────────

output "security_group_id" {
  description = "ID of the codesync security group"
  value       = aws_security_group.codesync_sg.id
}
