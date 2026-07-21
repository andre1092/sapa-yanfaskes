import streamlit as st

def render_login_screen():
    """Render BPJS Kesehatan SSO style login screen."""
    st.markdown("""
    <style>
        [data-testid="stSidebar"] { display: none !important; }
        [data-testid="collapsedControl"] { display: none !important; }
        .stTextInput > div > div > input {
            background-color: #FFFDF0 !important;
            border: 1px solid #D1D5DB !important;
            color: #1F2937 !important;
        }
        .stTextInput > div > div > input:focus {
            border-color: #02628a !important;
            box-shadow: 0 0 0 1px #02628a !important;
        }
        div.stButton > button {
            background-color: #02628a !important;
            color: white !important;
            width: 100% !important;
            border-radius: 4px !important;
            border: none !important;
            padding: 10px 0 !important;
            font-size: 16px !important;
            font-weight: 600 !important;
        }
        div.stButton > button:hover {
            background-color: #014c6c !important;
            color: white !important;
        }
    </style>
    """, unsafe_allow_html=True)

    col_left, col_center, col_right = st.columns([1, 1.3, 1])
    
    with col_center:
        st.write("")
        st.write("")
        logo_url = "https://upload.wikimedia.org/wikipedia/commons/b/b4/BPJS_Kesehatan_logo.svg"
        st.image(logo_url, width=280)
        st.write("")
        
        username_val = st.text_input("Username", key="login_username", placeholder="")
        password_val = st.text_input("Password", type="password", key="login_password", placeholder="")
        
        error_msg = ""
        show_password_error = False
        
        sign_in_clicked = st.button("Sign In")
        
        if sign_in_clicked:
            if not username_val:
                error_msg = "Username harus diisi"
            elif not password_val:
                show_password_error = True
            elif username_val == "admin" and password_val == "123456":
                st.session_state.logged_in = True
                st.rerun()
            else:
                error_msg = "Username atau password salah"
        
        if show_password_error:
            st.markdown("<p style='color: #EF4444; font-size: 13px; margin-top: -10px; margin-bottom: 10px;'>🚫 Enter your password</p>", unsafe_allow_html=True)
        elif error_msg:
            st.markdown(f"<p style='color: #EF4444; font-size: 13px; margin-top: -10px; margin-bottom: 10px;'>🚫 {error_msg}</p>", unsafe_allow_html=True)
            
    st.stop()

def check_authentication():
    """Ensure user is logged in before allowing access to app."""
    if 'logged_in' not in st.session_state:
        st.session_state.logged_in = False

    if not st.session_state.logged_in:
        render_login_screen()

def logout():
    """Logout current user and reset session state."""
    st.session_state.logged_in = False
    st.rerun()
