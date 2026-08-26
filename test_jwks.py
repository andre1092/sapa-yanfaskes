from jwt import PyJWKClient
jwks_url = "https://https://sapa-yanfaskes.us.auth0.com/.well-known/jwks.json"
try:
    client = PyJWKClient(jwks_url)
    client.get_signing_keys()
except Exception as e:
    print(f"Error fetching: {e}")
