terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  subscription_id                 = var.subscription_id
  resource_provider_registrations = "none"
  features {}
}

locals {
  project_name = "cyberminds-terminal"
  fqdn         = azurerm_public_ip.terminal.fqdn
  custom_data = base64encode(templatefile("${path.module}/cloud-init.tftpl", {
    admin_username  = var.admin_username
    project_dir     = var.project_dir
    repo_url        = var.repo_url
    repo_branch     = var.repo_branch
    app_domain      = azurerm_public_ip.terminal.fqdn
    allowed_origins = join(",", var.allowed_origins)
  }))
}

resource "azurerm_virtual_network" "terminal" {
  name                = "${local.project_name}-vnet"
  address_space       = ["10.24.0.0/16"]
  location            = var.location
  resource_group_name = var.resource_group_name
}

resource "azurerm_subnet" "terminal" {
  name                 = "${local.project_name}-subnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.terminal.name
  address_prefixes     = ["10.24.1.0/24"]
}

resource "azurerm_network_security_group" "terminal" {
  name                = "${local.project_name}-nsg"
  location            = var.location
  resource_group_name = var.resource_group_name

  security_rule {
    name                       = "allow-ssh"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "allow-http"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "allow-https"
    priority                   = 120
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

resource "azurerm_public_ip" "terminal" {
  name                = "${local.project_name}-pip"
  location            = var.location
  resource_group_name = var.resource_group_name
  allocation_method   = "Static"
  sku                 = "Standard"
  domain_name_label   = var.domain_name_label
}

resource "azurerm_network_interface" "terminal" {
  name                = "${local.project_name}-nic"
  location            = var.location
  resource_group_name = var.resource_group_name

  ip_configuration {
    name                          = "primary"
    subnet_id                     = azurerm_subnet.terminal.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.terminal.id
  }
}

resource "azurerm_network_interface_security_group_association" "terminal" {
  network_interface_id      = azurerm_network_interface.terminal.id
  network_security_group_id = azurerm_network_security_group.terminal.id
}

resource "azurerm_linux_virtual_machine" "terminal" {
  name                            = local.project_name
  resource_group_name             = var.resource_group_name
  location                        = var.location
  size                            = var.vm_size
  admin_username                  = var.admin_username
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.terminal.id]
  custom_data                     = local.custom_data

  admin_ssh_key {
    username   = var.admin_username
    public_key = var.admin_ssh_public_key
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts-gen2"
    version   = "latest"
  }

  computer_name = "cyberminds-terminal"
}
