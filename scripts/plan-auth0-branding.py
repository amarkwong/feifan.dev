#!/usr/bin/env python3
"""Import the live default theme and prepare a branding-only Terraform plan."""
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.request

infra = Path(__file__).resolve().parents[1] / 'infra'
os.chdir(infra)
settings = json.loads(Path('live.auto.tfvars.json').read_text())
domain = settings['auth0_domain'].removeprefix('https://').rstrip('/')

def request(path, data=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request('https://' + domain + path,
        data=json.dumps(data).encode() if data is not None else None, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)

try:
    token = request('/oauth/token', {
        'grant_type': 'client_credentials',
        'client_id': os.environ['AUTH0_CLIENT_ID'],
        'client_secret': os.environ['AUTH0_CLIENT_SECRET'],
        'audience': 'https://' + domain + '/api/v2/',
    })['access_token']
    try:
        theme = request('/api/v2/branding/themes/default', token=token)
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        theme = None
    address = 'auth0_branding_theme.lounge[0]'
    state = subprocess.check_output(['terraform', 'state', 'list'], text=True).splitlines()
    if theme and address not in state:
        subprocess.run(['terraform', 'import', address, theme['themeId']], check=True)
    # Do not silently replace existing custom copy on first adoption.
    for prompt in ['login', 'login-id', 'login-password']:
        address = 'auth0_prompt_custom_text.lounge_login["' + prompt + '"]'
        if address not in state:
            custom = request('/api/v2/prompts/' + prompt + '/custom-text/en', token=token)
            if custom:
                raise SystemExit('Existing custom text found for ' + prompt + '; review and import it before proceeding.')
    subprocess.run(['terraform', 'plan',
        '-target=auth0_branding.lounge[0]',
        '-target=auth0_prompt.lounge[0]',
        '-target=auth0_branding_theme.lounge[0]',
        '-target=auth0_prompt_custom_text.lounge_login',
        '-out=branding.tfplan'], check=True)
except KeyError as error:
    raise SystemExit('Missing configuration field: ' + str(error))
except urllib.error.HTTPError as error:
    raise SystemExit('Auth0 request failed: HTTP ' + str(error.code) + '. Check the M2M branding permissions.')
