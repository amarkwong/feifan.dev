# Cloudflare Access enforces authorization before browser-based requests reach
# the tunnel origins. Jellyfin is intentionally absent because its native
# clients cannot complete Cloudflare's interactive OIDC flow.

resource "cloudflare_zero_trust_access_identity_provider" "auth0" {
  count = var.enable_lounge_access ? 1 : 0

  account_id = var.cloudflare_account_id
  name       = "Auth0 - Feifan's Lounge"
  type       = "oidc"

  config {
    client_id        = auth0_client.cloudflare_access[0].id
    client_secret    = auth0_client_credentials.cloudflare_access[0].client_secret
    auth_url         = "https://${var.auth0_domain}/authorize"
    token_url        = "https://${var.auth0_domain}/oauth/token"
    certs_url        = "https://${var.auth0_domain}/.well-known/jwks.json"
    email_claim_name = "email"
    # Authorization uses the standard email claim only. Keep custom claims
    # empty so Access does not make an unnecessary user/group lookup.
    claims = []
    scopes = ["openid", "email", "profile"]
  }
}

resource "cloudflare_zero_trust_access_policy" "friends" {
  count = var.enable_lounge_access ? 1 : 0

  account_id       = var.cloudflare_account_id
  name             = "Lounge - invited friends"
  decision         = "allow"
  session_duration = "24h"

  include {
    email = var.lounge_allowed_emails
  }

  require {
    login_method = [cloudflare_zero_trust_access_identity_provider.auth0[0].id]
  }

  lifecycle {
    precondition {
      condition     = length(var.lounge_allowed_emails) > 0 && contains(var.lounge_allowed_emails, var.owner_email)
      error_message = "lounge_allowed_emails must contain owner_email before Access can protect existing applications."
    }
  }
}

resource "cloudflare_zero_trust_access_policy" "owner" {
  count = var.enable_lounge_access ? 1 : 0

  account_id       = var.cloudflare_account_id
  name             = "Lounge - owner only"
  decision         = "allow"
  session_duration = "12h"

  include {
    email = [var.owner_email]
  }

  require {
    login_method = [cloudflare_zero_trust_access_identity_provider.auth0[0].id]
  }

  lifecycle {
    precondition {
      condition     = var.owner_email != ""
      error_message = "owner_email must be set when enable_lounge_access is true."
    }
  }
}

resource "cloudflare_zero_trust_access_application" "friends" {
  for_each = var.enable_lounge_access ? setunion(var.lounge_friend_hostnames, toset([
    var.discount_tracker_hostname,
    var.discount_tracker_legacy_hostname,
  ])) : toset([])

  account_id                = var.cloudflare_account_id
  name                      = "Lounge - ${each.value}"
  domain                    = each.value
  type                      = "self_hosted"
  session_duration          = "24h"
  allowed_idps              = [cloudflare_zero_trust_access_identity_provider.auth0[0].id]
  auto_redirect_to_identity = true
  app_launcher_visible      = false
  policies                  = [cloudflare_zero_trust_access_policy.friends[0].id]

  depends_on = [
    cloudflare_pages_domain.lounge,
  ]
}

resource "cloudflare_zero_trust_access_application" "home" {
  count = var.enable_lounge_access ? 1 : 0

  account_id                = var.cloudflare_account_id
  name                      = "Lounge - owner home"
  domain                    = var.home_hostname
  type                      = "self_hosted"
  session_duration          = "12h"
  allowed_idps              = [cloudflare_zero_trust_access_identity_provider.auth0[0].id]
  auto_redirect_to_identity = true
  app_launcher_visible      = false
  policies                  = [cloudflare_zero_trust_access_policy.owner[0].id]

}
