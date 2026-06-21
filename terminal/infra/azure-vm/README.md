# Azure VM deploy for the CyberMinds terminal

This Terraform stack provisions a small Azure VM, assigns a static public IP
with an Azure-managed DNS hostname, installs Docker, clones the repo, and
starts the existing production terminal stack from
`terminal/docker-compose.prod.yml`.

## What it creates

- resource group wiring compatible with Azure CLI auth
- virtual network, subnet, public IP, NIC, and network security group
- one Ubuntu VM
- cloud-init bootstrapping for Docker, repo clone, `.env`, and systemd

## Why this fixes the current outage

The current public terminal endpoint uses `terminal.egeuysal.com`, which is
serving an invalid certificate chain to browsers. This stack uses an
Azure-managed hostname like:

`https://cyberminds-terminal-20260621-ncus.northcentralus.cloudapp.azure.com`

That hostname terminates through the repo's Caddy config and should obtain a
valid certificate automatically once the VM is up and ports 80/443 are open.

## Prerequisites

- `az login` already completed
- `terraform` installed
- a resource group created, for example:

```bash
az group create --name cyberminds-terminal-ncus-rg --location northcentralus
```

## Usage

```bash
cd terminal/infra/azure-vm
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` and set:

- `subscription_id`
- `admin_ssh_public_key`
- optionally `domain_name_label` if the default is already taken

Then run:

```bash
terraform init
terraform apply
```

After apply:

```bash
terraform output public_fqdn
terraform output terminal_health_url
```

Verify health:

```bash
curl -I "$(terraform output -raw terminal_health_url)"
```

SSH access:

```bash
terraform output -raw ssh_command
```

## Notes

- This deploy path uses the Azure hostname directly, so it does not require
  moving DNS for `terminal.egeuysal.com`.
- The frontend terminal default API origin should match the `public_fqdn`
  output if the DNS label changes.
