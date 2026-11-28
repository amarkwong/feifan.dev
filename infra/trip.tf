# Shared trip plan for the Lounge itinerary studio (https://<lounge>/trip/).
#
# A Worker on <lounge host>/api/trip/* stores one shared plan in D1. Cloudflare Access
# already gates the hostname; the Worker additionally verifies the signed Access JWT and
# only lets the emails in var.trip_editors read or write. Other invited Lounge friends
# are denied. Local development uses scripts/trip-dev-server.mjs instead of this.
resource "cloudflare_d1_database" "trip" {
  account_id = var.cloudflare_account_id
  name       = "lounge-trip"
}

resource "cloudflare_worker_script" "trip" {
  account_id = var.cloudflare_account_id
  name       = "lounge-trip"
  content    = file("${path.module}/trip-worker.js")
  module     = true

  d1_database_binding {
    name        = "DB"
    database_id = cloudflare_d1_database.trip.id
  }

  plain_text_binding {
    name = "ACCESS_TEAM"
    text = var.cloudflare_access_team_name
  }

  plain_text_binding {
    name = "ACCESS_AUD"
    text = cloudflare_zero_trust_access_application.friends[var.lounge_hostname].aud
  }

  secret_text_binding {
    name = "TRIP_EDITORS"
    text = join(",", var.trip_editors)
  }

  lifecycle {
    precondition {
      condition     = length(var.trip_editors) > 0
      error_message = "trip_editors must list at least one email, otherwise nobody can use the shared plan."
    }
  }
}

resource "cloudflare_worker_route" "trip" {
  zone_id     = local.managed_zone_id
  pattern     = "${var.lounge_hostname}/api/trip/*"
  script_name = cloudflare_worker_script.trip.name
}
