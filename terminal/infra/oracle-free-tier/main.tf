terraform {
  required_version = ">= 1.5.0"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = ">= 6.0.0"
    }
  }
}

provider "oci" {
  tenancy_ocid     = var.tenancy_ocid
  user_ocid        = var.user_ocid
  fingerprint      = var.fingerprint
  private_key_path = var.private_key_path
  region           = var.region
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

resource "oci_core_vcn" "terminal" {
  compartment_id = var.compartment_ocid
  cidr_block     = var.vcn_cidr
  display_name   = "${var.name_prefix}-vcn"
  dns_label      = "termvcn"
}

resource "oci_core_internet_gateway" "terminal" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.terminal.id
  display_name   = "${var.name_prefix}-igw"
}

resource "oci_core_route_table" "terminal" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.terminal.id
  display_name   = "${var.name_prefix}-rt"

  route_rules {
    network_entity_id = oci_core_internet_gateway.terminal.id
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
  }
}

resource "oci_core_security_list" "terminal" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.terminal.id
  display_name   = "${var.name_prefix}-sec"

  egress_security_rules {
    destination      = "0.0.0.0/0"
    destination_type = "CIDR_BLOCK"
    protocol         = "all"
  }

  ingress_security_rules {
    protocol = "6"
    source   = var.ssh_ingress_cidr

    tcp_options {
      min = 22
      max = 22
    }
  }

  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"

    tcp_options {
      min = 80
      max = 80
    }
  }

  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"

    tcp_options {
      min = 443
      max = 443
    }
  }
}

resource "oci_core_subnet" "terminal" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.terminal.id
  cidr_block                 = var.subnet_cidr
  display_name               = "${var.name_prefix}-subnet"
  dns_label                  = "termsubnet"
  prohibit_public_ip_on_vnic = false
  route_table_id             = oci_core_route_table.terminal.id
  security_list_ids          = [oci_core_security_list.terminal.id]
}

locals {
  cloud_init = templatefile("${path.module}/cloud-init.tftpl", {
    repo_url         = var.repo_url
    repo_branch      = var.repo_branch
    app_domain       = var.app_domain
    allowed_origins  = join(",", var.allowed_origins)
    caddy_http_port  = var.caddy_http_port
    caddy_https_port = var.caddy_https_port
    project_dir      = var.project_dir
  })
}

resource "oci_core_instance" "terminal" {
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  compartment_id      = var.compartment_ocid
  display_name        = "${var.name_prefix}-instance"
  shape               = var.instance_shape

  shape_config {
    ocpus         = var.instance_ocpus
    memory_in_gbs = var.instance_memory_gbs
  }

  create_vnic_details {
    assign_public_ip = true
    subnet_id        = oci_core_subnet.terminal.id
    display_name     = "${var.name_prefix}-vnic"
    hostname_label   = "terminal"
  }

  metadata = {
    ssh_authorized_keys = file(var.ssh_public_key_path)
    user_data           = base64encode(local.cloud_init)
  }

  source_details {
    source_type = "image"
    source_id   = var.image_ocid
  }
}
