output "instance_public_ip" {
  description = "Public IP for the terminal instance."
  value       = oci_core_instance.terminal.public_ip
}

output "terminal_health_url" {
  description = "Health endpoint for the deployed terminal backend."
  value       = "https://${var.app_domain}/health"
}

output "dns_a_record_hint" {
  description = "Point this hostname at the instance public IP before expecting TLS issuance."
  value       = "${var.app_domain} -> ${oci_core_instance.terminal.public_ip}"
}
