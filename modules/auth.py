def authenticate_credentials(username, password):
    """Validate admin login credentials."""
    if not username or not password:
        return False, "Username dan password wajib diisi."
    if username.strip() == "admin" and password == "123456":
        return True, "Berhasil login!"
    return False, "Username atau password salah."
