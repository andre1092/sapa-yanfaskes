import jwt

token = jwt.encode({"iss": "https://sapa-yanfaskes.us.auth0.com/", "aud": "https://api.sapa-yanfaskes.com"}, "secret", algorithm="HS256")

try:
    jwt.decode(token, "secret", algorithms=["HS256"], audience="https://api.sapa-yanfaskes.com", issuer="https://sapa-yanfaskes.us.auth0.com//")
    print("Success")
except jwt.InvalidIssuerError as e:
    print(f"Issuer Error: {e}")
except jwt.InvalidAudienceError as e:
    print(f"Audience Error: {e}")
except Exception as e:
    print(f"Other Error: {e}")
