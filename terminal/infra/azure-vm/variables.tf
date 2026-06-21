variable "subscription_id" {
  description = "Azure subscription ID."
  type        = string
}

variable "resource_group_name" {
  description = "Existing Azure resource group name."
  type        = string
  default     = "cyberminds-terminal-ncus-rg"
}

variable "location" {
  description = "Azure region for the VM."
  type        = string
  default     = "northcentralus"
}

variable "vm_size" {
  description = "Azure VM size for the terminal host."
  type        = string
  default     = "Standard_B2as_v2"
}

variable "admin_username" {
  description = "Admin username for the Linux VM."
  type        = string
  default     = "azureuser"
}

variable "admin_ssh_public_key" {
  description = "SSH public key for VM access."
  type        = string
}

variable "project_dir" {
  description = "Directory on the VM where the repo will be cloned."
  type        = string
  default     = "/opt/cyberminds"
}

variable "repo_url" {
  description = "Git repository URL to deploy from."
  type        = string
  default     = "https://github.com/Cyber-Minds/cyber-minds.github.io.git"
}

variable "repo_branch" {
  description = "Branch to clone on the VM."
  type        = string
  default     = "main"
}

variable "domain_name_label" {
  description = "Azure public IP DNS label. Final hostname becomes <label>.<region>.cloudapp.azure.com."
  type        = string
  default     = "cyberminds-terminal-20260621-ncus"
}

variable "allowed_origins" {
  description = "Allowed browser origins for the terminal backend CORS policy."
  type        = list(string)
  default = [
    "https://cyber-minds.github.io",
  ]
}
