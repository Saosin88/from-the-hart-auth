variable "auth_image_uri" {
  description = "Google Artifacts image URI for the Auth service"
  type        = string
}

resource "google_cloud_run_service" "from_the_hart_auth" {
  name     = "from-the-hart-auth"
  location = "africa-south1"

  template {
    spec {
      containers {
        image = var.auth_image_uri

        ports {
          container_port = 8080
          name           = "http1"
        }

        resources {
          limits = {
            memory = "512Mi"
            cpu    = "1000m"
          }
        }

        startup_probe {
          tcp_socket {
            port = 8080
          }
          timeout_seconds   = 240
          period_seconds    = 240
          failure_threshold = 1
        }
      }

      service_account_name = data.terraform_remote_state.shared.outputs.tech_dev_firebase_admin_sdk_email

      timeout_seconds       = 30
      container_concurrency = 80
    }

    metadata {
      annotations = {
        "run.googleapis.com/ingress"               = "all"
        "run.googleapis.com/ingress-status"        = "all"
        "autoscaling.knative.dev/minScale"         = "0"
        "autoscaling.knative.dev/maxScale"         = "2"
        "run.googleapis.com/execution-environment" = "gen2"
        "run.googleapis.com/startup-cpu-boost"     = "true"
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  autogenerate_revision_name = true
}

# Make the service publicly accessible
resource "google_cloud_run_service_iam_member" "public_access" {
  service  = google_cloud_run_service.from_the_hart_auth.name
  location = google_cloud_run_service.from_the_hart_auth.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "service_url" {
  value = google_cloud_run_service.from_the_hart_auth.status[0].url
}