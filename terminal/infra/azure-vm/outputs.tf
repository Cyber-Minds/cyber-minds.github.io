output "public_ip_address" {
  description = "Static public IP address for the terminal VM."
  value       = azurerm_public_ip.terminal.ip_address
}

output "public_fqdn" {
  description = "Azure-managed public hostname for the terminal VM."
  value       = azurerm_public_ip.terminal.fqdn
}

output "terminal_health_url" {
  description = "Health endpoint for the deployed terminal backend."
  value       = "https://${azurerm_public_ip.terminal.fqdn}/health"
}

output "ssh_command" {
  description = "SSH command for connecting to the VM."
  value       = "ssh ${var.admin_username}@${azurerm_public_ip.terminal.fqdn}"
}
