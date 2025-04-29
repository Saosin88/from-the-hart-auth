resource "google_service_account" "auth_firebase_admin_sdk" {
  account_id   = "auth-firebase-adminsdk-fbsvc"
  display_name = "Auth Firebase Admin SDK"
  description  = "Service account for the Auth Domain Firebase Admin SDK authentication"
  project      = data.terraform_remote_state.shared.outputs.tech_dev_project_id
}

resource "google_project_iam_member" "auth_firebase_admin_roles" {
  for_each = toset([
    "roles/firebase.admin",
    "roles/firebaseauth.admin",
    "roles/iam.serviceAccountTokenCreator"
  ])

  project = data.terraform_remote_state.shared.outputs.tech_dev_project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.auth_firebase_admin_sdk.email}"
}

resource "google_service_account_iam_member" "auth_firebase_admin_impersonator_token_creator" {
  service_account_id = google_service_account.auth_firebase_admin_sdk.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "user:sheldon@fromthehart.tech"
}

resource "google_cloud_run_service_iam_member" "cloudflare_worker_invoker" {
  project  = data.terraform_remote_state.shared.outputs.tech_dev_project_id
  service  = google_cloud_run_service.from_the_hart_auth.name
  location = google_cloud_run_service.from_the_hart_auth.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${data.terraform_remote_state.shared.outputs.cloudflare_worker_cloud_run_invoker_service_account_email}"
}


variable "auth_image_uri" {
  description = "Google Artifacts image URI for the Auth service"
  type        = string
  default = "africa-south1-docker.pkg.dev/from-the-hart-tech-dev/from-the-hart-tech/from-the-hart-auth:20250422143014"
}

resource "google_cloud_run_service" "from_the_hart_auth" {
  project  = data.terraform_remote_state.shared.outputs.tech_dev_project_id
  name     = "from-the-hart-auth"
  location = "africa-south1"

  metadata {
    annotations = {
      "run.googleapis.com/ingress"        = "all"
      "run.googleapis.com/ingress-status" = "all"
    }
  }

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
          http_get {
            path = "/auth/health"
            port = 8080
          }
          initial_delay_seconds = 10
          timeout_seconds       = 5
          period_seconds        = 10
          failure_threshold     = 12
        }
      }

      service_account_name = google_service_account.auth_firebase_admin_sdk.email

      timeout_seconds       = 30
      container_concurrency = 80
    }

    metadata {
      annotations = {
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

output "service_url" {
  value = google_cloud_run_service.from_the_hart_auth.status[0].url
}

resource "google_identity_platform_config" "from_the_hart_auth" {
  project = data.terraform_remote_state.shared.outputs.tech_dev_project_id

  sign_in {
    email {
      enabled           = true
      password_required = true
    }
    phone_number {
      enabled            = false
      test_phone_numbers = {}
    }
  }

  authorized_domains = [
    "localhost",
    "from-the-hart-tech-dev.firebaseapp.com",
    "from-the-hart-tech-dev.web.app",
  ]
}

resource "google_firestore_database" "tech_dev_auth_firestore_database" {
  project     = data.terraform_remote_state.shared.outputs.tech_dev_project_id
  name        = "auth"
  location_id = "africa-south1"
  type        = "FIRESTORE_NATIVE"
}