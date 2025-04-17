terraform {
  required_version = "~> 1"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  backend "gcs" {
    bucket = "from-the-hart-terraform"
    prefix = "state/from-the-hart-auth-dev.tfstate"
  }
}