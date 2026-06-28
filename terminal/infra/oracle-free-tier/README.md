# Oracle Free Tier Terminal Deploy

This Terraform config provisions a small OCI VM and bootstraps the CyberMinds
terminal backend with Docker Compose and the existing production Caddy setup in
`terminal/docker-compose.prod.yml`.

## What it does

- creates a VCN, public subnet, route table, internet gateway, and security
  list
- creates one public ARM instance on `VM.Standard.A1.Flex`
- installs Docker and Git with cloud-init
- clones `Cyber-Minds/cyber-minds.github.io`
- writes `terminal/.env`
- starts the terminal stack with the repo's production compose file

## Why this fixes the current terminal outage

The live frontend currently fails at terminal session creation because the
browser rejects `https://terminal.egeuysal.com` with
`ERR_CERT_AUTHORITY_INVALID`. This deployment path fixes that by standing up a
fresh host where the compose stack's Caddy container can obtain a valid
certificate for a real DNS hostname that points at the OCI VM.

## Prerequisites

1. Create an Oracle Cloud compartment and API key.
2. Pick an Ubuntu image OCID for your target region.
3. Point your terminal DNS name to the instance public IP after `terraform apply`.
4. Use a domain that can obtain a public Let's Encrypt certificate.

## Usage

```bash
cd terminal/infra/oracle-free-tier
cp terraform.tfvars.example terraform.tfvars
# fill in your OCI OCIDs, image OCID, SSH key path, and public domain

terraform init
terraform plan
terraform apply
```

## After apply

1. Create or update the DNS `A` record from `app_domain` to the output public IP.
2. Wait a minute for DNS propagation.
3. Re-run:

```bash
terraform apply
```

4. Verify:

```bash
curl -I https://<your-terminal-domain>/health
```

Expected: `HTTP/2 200`

## Notes

- The default `allowed_origins` is `https://cyber-minds.github.io`.
- Oracle free tier capacity for `VM.Standard.A1.Flex` can be region-limited.
- This config assumes you want the terminal backend only. It does not manage
  the GitHub Pages frontend.
