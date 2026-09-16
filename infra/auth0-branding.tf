# Tenant-wide native Universal Login styling. Keep authentication forms owned by
# Auth0; no custom page template or custom domain is required.
resource "auth0_prompt" "lounge" {
  count                      = var.enable_lounge_access ? 1 : 0
  universal_login_experience = "new"
}

resource "auth0_branding" "lounge" {
  count    = var.enable_lounge_access ? 1 : 0
  logo_url = "https://feifan.dev/images/logo.svg"
  colors {
    primary         = "#274b3e"
    page_background = "#f5f3ed"
  }
  font {
    url = "https://rsms.me/inter/font-files/InterVariable.woff2"
  }
}

resource "auth0_branding_theme" "lounge" {
  count        = var.enable_lounge_access ? 1 : 0
  display_name = "Feifan"
  depends_on   = [auth0_branding.lounge, auth0_prompt.lounge]

  colors {
    primary_button            = "#274b3e"
    primary_button_label      = "#ffffff"
    secondary_button_border   = "#d7dbd0"
    secondary_button_label    = "#233c38"
    base_focus_color          = "#6c8651"
    base_hover_color          = "#18372d"
    header                    = "#233c38"
    body_text                 = "#65766e"
    widget_background         = "#fffdfa"
    widget_border             = "#d7dbd0"
    input_background          = "#fffdfa"
    input_border              = "#d7dbd0"
    input_filled_text         = "#233c38"
    input_labels_placeholders = "#65766e"
    links_focused_components  = "#274b3e"
    icons                     = "#65766e"
    error                     = "#a83232"
    success                   = "#274b3e"
  }
  borders {
    button_border_radius = 6
    button_border_weight = 1
    buttons_style        = "rounded"
    input_border_radius  = 6
    input_border_weight  = 1
    inputs_style         = "rounded"
    widget_border_weight = 1
    widget_corner_radius = 10
    show_widget_shadow   = true
  }
  fonts {
    font_url            = "https://rsms.me/inter/font-files/InterVariable.woff2"
    reference_text_size = 16
    links_style         = "underlined"
    title {
      bold = true
      size = 150
    }
    subtitle {
      bold = false
      size = 100
    }
    body_text {
      bold = false
      size = 100
    }
    buttons_text {
      bold = true
      size = 100
    }
    input_labels {
      bold = false
      size = 100
    }
    links {
      bold = false
      size = 100
    }
  }
  page_background {
    background_color = "#f5f3ed"
    page_layout      = "center"
  }
  widget {
    logo_url              = "https://feifan.dev/images/logo.svg"
    logo_height           = 56
    logo_position         = "center"
    header_text_alignment = "center"
    social_buttons_layout = "bottom"
  }
}

# Override user-facing copy without changing the tenant's authentication domain.
resource "auth0_prompt_custom_text" "lounge_login" {
  for_each = var.enable_lounge_access ? toset(["login", "login-id", "login-password"]) : toset([])
  prompt   = each.value
  language = "en"
  body = jsonencode({
    (each.value) = {
      title       = "Welcome"
      description = "Log in to lounge.feifan.dev."
    }
  })
}
