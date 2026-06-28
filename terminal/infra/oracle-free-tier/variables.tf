variable "tenancy_ocid" {
  description = "OCI tenancy OCID."
  type        = string
}

variable "compartment_ocid" {
  description = "OCI compartment OCID for the terminal instance."
  type        = string
}

variable "user_ocid" {
  description = "OCI user OCID used by Terraform."
  type        = string
}

variable "fingerprint" {
  description = "API key fingerprint for the OCI user."
  type        = string
}

variable "private_key_path" {
  description = "Path to the OCI API private key."
  type        = string
}

variable "region" {
  description = "OCI region, for example us-chicago-1."
  type        = string
}

variable "image_ocid" {
  description = "Ubuntu image OCID for the selected region."
  type        = string
}

variable "ssh_public_key_path" {
  description = "Path to the SSH public key to install on the instance."
  type        = string
}

variable "name_prefix" {
  description = "Prefix for OCI resource names."
  type        = string
  default     = "cyberminds-terminal"
}

variable "vcn_cidr" {
  description = "VCN CIDR block."
  type        = string
  default     = "10.40.0.0/16"
}

variable "subnet_cidr" {
  description = "Public subnet CIDR block."
  type        = string
  default     = "10.40.1.0/24"
}

variable "ssh_ingress_cidr" {
  description = "CIDR allowed to SSH to the instance."
  type        = string
  default     = "0.0.0.0/0"
}

variable "instance_shape" {
  description = "OCI compute shape."
  type        = string
  default     = "VM.Standard.A1.Flex"
}

variable "instance_ocpus" {
  description = "Number of OCPUs for the free tier ARM instance."
  type        = number
  default     = 2
}

variable "instance_memory_gbs" {
  description = "Memory allocation in GB for the free tier ARM instance."
  type        = number
  default     = 12
}

variable "repo_url" {
  description = "Git repository URL to deploy on the instance."
  type        = string
  default     = "https://github.com/Cyber-Minds/cyber-minds.github.io.git"
}

variable "repo_branch" {
  description = "Git branch to deploy."
  type        = string
  default     = "main"
}

variable "project_dir" {
  description = "Directory on the VM where the repository should be cloned."
  type        = string
  default     = "/opt/cyberminds"
}

variable "app_domain" {
  description = "Public DNS name for the terminal backend."
  type        = string
}

variable "allowed_origins" {
  description = "Allowed browser origins for the terminal backend CORS policy."
  type        = list(string)
  default     = ["https://cyber-minds.github.io"]
}

variable "caddy_http_port" {
  description = "Host HTTP port exposed by the compose stack."
  type        = number
  default     = 80
}

variable "caddy_https_port" {
  description = "Host HTTPS port exposed by the compose stack."
  type        = number
  default     = 443
}
