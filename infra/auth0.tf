# Auth0 authenticates users for Cloudflare Access. Authorization stays in
# Cloudflare as an exact email allowlist, so invited friends can create their
# Auth0 account only when they first choose to visit the Lounge.

data "auth0_connection" "lounge" {
  count = var.enable_lounge_access ? 1 : 0
  name  = var.auth0_connection_name
}

resource "auth0_client" "cloudflare_access" {
  count = var.enable_lounge_access ? 1 : 0

  name        = "Cloudflare Access - Feifan's Lounge"
  description = "OIDC identity provider used by Cloudflare Access for invited friends"
  app_type    = "regular_web"

  callbacks = [
    "https://${var.cloudflare_access_team_name}.cloudflareaccess.com/cdn-cgi/access/callback",
  ]

  allowed_logout_urls = [
    "https://${var.lounge_hostname}",
  ]

  grant_types     = ["authorization_code"]
  is_first_party  = true
  oidc_conformant = true

  jwt_configuration {
    alg = "RS256"
  }

  lifecycle {
    precondition {
      condition     = var.auth0_domain != "" && var.cloudflare_access_team_name != ""
      error_message = "auth0_domain and cloudflare_access_team_name must be set when enable_lounge_access is true."
    }
  }
}

resource "auth0_connection_client" "cloudflare_access" {
  count = var.enable_lounge_access ? 1 : 0

  connection_id = data.auth0_connection.lounge[0].id
  client_id     = auth0_client.cloudflare_access[0].id
}

resource "auth0_client_credentials" "cloudflare_access" {
  count = var.enable_lounge_access ? 1 : 0

  client_id             = auth0_client.cloudflare_access[0].id
  authentication_method = "client_secret_post"
}
