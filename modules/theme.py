import streamlit as st

GLASSMORPHISM_CSS = """
/* SAPA YANFASKES Glassmorphism Theme */
body {
    background: #0B132B !important;
    color: #F8FAFC !important;
    font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
}

.glass-card {
    background: rgba(255, 255, 255, 0.05) !important;
    backdrop-filter: blur(20px) !important;
    -webkit-backdrop-filter: blur(20px) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 12px !important;
    padding: 20px !important;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37) !important;
    margin-bottom: 20px !important;
}
"""

def inject_glassmorphism_theme():
    """Inject premium Glassmorphism UI theme matching exact Facenote sidebar design."""
    st.markdown("""
<style>
    /* ================================================================ */
    /*  GLOBAL & LAYOUT STYLING                                          */
    /* ================================================================ */
    .block-container {
        padding-top: 1.2rem !important;
        padding-bottom: 1rem !important;
        padding-left: calc(1.5rem + 70px) !important;
        padding-right: 1.5rem !important;
        max-width: 100% !important;
        transition: padding-left 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }
    body:has(section[data-testid="stSidebar"]:not(.mini-variant)) .block-container {
        padding-left: calc(1.5rem + 260px) !important;
    }
    iframe { height: 850px !important; border-radius: 8px; }

    /* Hide Streamlit default headers/footers */
    [data-testid="stSidebarCollapsedControl"] { display: none !important; }
    #MainMenu { visibility: hidden !important; }
    footer   { visibility: hidden !important; }
    header   { visibility: hidden !important; }

    /* ================================================================ */
    /*  GLASSMORPHISM SIDEBAR (EXPANDED STATE — 260px)                  */
    /* ================================================================ */
    section[data-testid="stSidebar"] {
        background: linear-gradient(180deg, rgba(6, 182, 212, 0.18) 0%, rgba(15, 23, 42, 0.85) 35%, rgba(10, 15, 30, 0.95) 100%) !important;
        backdrop-filter: blur(28px) saturate(190%) !important;
        -webkit-backdrop-filter: blur(28px) saturate(190%) !important;
        border-right: 1px solid rgba(255, 255, 255, 0.12) !important;
        box-shadow: 6px 0 36px rgba(0, 0, 0, 0.35) !important;
        visibility: visible !important;
        position: fixed !important;
        left: 0 !important; top: 0 !important;
        height: 100vh !important;
        z-index: 1000000 !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        transform: none !important;
        width: 260px !important;
        min-width: 260px !important;
        transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                    min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                    box-shadow 0.3s ease !important;
    }
    section[data-testid="stSidebar"] > div:first-child {
        background: transparent !important;
        padding-top: 10px !important;
    }

    /* Custom scrollbar */
    section[data-testid="stSidebar"]::-webkit-scrollbar { width: 3px; }
    section[data-testid="stSidebar"]::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.12); border-radius: 4px;
    }

    /* ================================================================ */
    /*  MINI-VARIANT (COLLAPSED STATE — 70px)                           */
    /* ================================================================ */
    section[data-testid="stSidebar"].mini-variant {
        width: 70px !important;
        min-width: 70px !important;
        overflow: hidden !important;
    }
    /* Hide expanded content in mini variant */
    section[data-testid="stSidebar"].mini-variant [data-testid="stVerticalBlock"] > div:not(:has(.glass-header-controls)):not(:has(.glass-icons)) {
        display: none !important;
    }
    section[data-testid="stSidebar"].mini-variant .sidebar-expanded-content {
        display: none !important;
    }

    /* ================================================================ */
    /*  SIDEBAR EXPANDED HEADER & PROFILE (EXACT MATCH TO FACENOTE)     */
    /* ================================================================ */
    .sidebar-brand-title {
        font-size: 21px; font-weight: 800; color: #FFFFFF;
        letter-spacing: -0.3px; margin-bottom: 22px; margin-left: 6px;
        font-family: 'Inter', system-ui, sans-serif;
    }
    .sidebar-user-card {
        display: flex; align-items: center; gap: 12px;
        padding: 4px 6px 14px 6px;
    }
    .user-avatar-circle {
        width: 38px; height: 38px; border-radius: 50%;
        background: rgba(255, 255, 255, 0.10);
        border: 1px solid rgba(255, 255, 255, 0.20);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    .user-info {
        display: flex; flex-direction: column; justify-content: center;
    }
    .user-name {
        font-size: 14px; font-weight: 600; color: #FFFFFF;
        display: flex; align-items: center; gap: 6px;
        line-height: 1.2;
    }
    .user-arrow { font-size: 10px; opacity: 0.6; }
    .user-role {
        font-size: 11px; color: rgba(255, 255, 255, 0.55);
        margin-top: 2px;
    }
    .glass-divider {
        width: 100%; height: 1px;
        background: rgba(255, 255, 255, 0.10);
        margin: 12px 0 16px 0;
    }
    .glass-section-label {
        font-size: 10.5px; font-weight: 700;
        color: rgba(255, 255, 255, 0.45);
        letter-spacing: 1.8px; text-transform: uppercase;
        margin-bottom: 12px; margin-left: 6px;
    }

    /* ================================================================ */
    /*  MINI-VARIANT ICON COLUMN (EXACT MATCH TO RIGHT SIDE IN IMAGE)   */
    /* ================================================================ */
    .glass-icons { display: none !important; }
    section[data-testid="stSidebar"].mini-variant .glass-icons {
        display: flex !important;
        flex-direction: column;
        align-items: center;
        padding: 14px 0;
        gap: 6px;
    }
    .mini-logo {
        font-size: 20px; font-weight: 800; color: #FFFFFF;
        margin-bottom: 18px; font-family: 'Inter', system-ui, sans-serif;
    }
    .mini-avatar {
        width: 36px; height: 36px; border-radius: 50%;
        background: rgba(255, 255, 255, 0.10);
        border: 1px solid rgba(255, 255, 255, 0.20);
        display: flex; align-items: center; justify-content: center;
        margin-bottom: 14px;
    }
    .mini-divider {
        width: 28px; height: 1px;
        background: rgba(255, 255, 255, 0.10);
        margin-bottom: 10px;
    }
    .mini-label {
        font-size: 8px; font-weight: 700;
        color: rgba(255, 255, 255, 0.45);
        letter-spacing: 1.5px; text-transform: uppercase;
        margin-bottom: 12px;
    }
    .mini-icon-item {
        width: 42px; height: 42px; border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; color: rgba(255,255,255,0.60);
        cursor: pointer; transition: all 0.2s ease;
        position: relative; margin-bottom: 4px;
    }
    .mini-icon-item:hover {
        background: rgba(255,255,255,0.12);
        color: #60A5FA; transform: scale(1.08);
    }
    .mini-icon-item.active {
        background: rgba(96,165,250,0.15);
        color: #60A5FA;
    }
    .mini-icon-item.active::before {
        content: ''; position: absolute;
        left: -14px; top: 50%; transform: translateY(-50%);
        width: 3px; height: 18px;
        background: #60A5FA; border-radius: 0 3px 3px 0;
    }
    .mini-spacer { flex: 1; min-height: 40px; }
    .mini-icon-item.mini-logout { color: rgba(248,113,113,0.60); }
    .mini-icon-item.mini-logout:hover {
        background: rgba(239,68,68,0.12); color: #F87171;
    }
    .mini-tip {
        position: absolute; left: 54px; top: 50%;
        transform: translateY(-50%);
        background: rgba(15,23,42,0.95);
        backdrop-filter: blur(8px);
        color: #E2E8F0; padding: 4px 10px;
        border-radius: 6px; font-size: 11px; font-weight: 500;
        white-space: nowrap; opacity: 0; pointer-events: none;
        transition: opacity 0.15s ease;
        border: 1px solid rgba(255,255,255,0.10);
    }
    .mini-icon-item:hover .mini-tip { opacity: 1; }

    /* ================================================================ */
    /*  HEADER TOGGLE BUTTON                                            */
    /* ================================================================ */
    .glass-header-controls {
        display: flex; justify-content: space-between; align-items: center;
        padding: 4px 4px 12px 4px;
    }
    section[data-testid="stSidebar"].mini-variant .glass-header-controls {
        justify-content: center; padding: 4px 0 10px;
    }
    .glass-toggle-btn {
        width: 32px; height: 32px; border-radius: 8px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.10);
        color: rgba(255,255,255,0.65);
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-size: 16px; transition: all 0.2s ease;
        -webkit-user-select: none; user-select: none;
    }
    .glass-toggle-btn:hover {
        background: rgba(255,255,255,0.15);
        color: #fff; transform: scale(1.06);
    }

    /* ================================================================ */
    /*  STREAMLIT WIDGETS RESTYLING (PURE FACENOTE TILES)               */
    /* ================================================================ */
    section[data-testid="stSidebar"],
    section[data-testid="stSidebar"] p,
    section[data-testid="stSidebar"] span,
    section[data-testid="stSidebar"] label,
    section[data-testid="stSidebar"] div {
        color: #FFFFFF !important;
    }

    /* Hide standard radio header text */
    section[data-testid="stSidebar"] [role="radiogroup"] > label:first-child {
        display: none !important;
    }

    /* Radio option tiles matching Facenote menu items */
    section[data-testid="stSidebar"] [role="radiogroup"] label {
        padding: 10px 14px !important;
        border-radius: 10px !important;
        margin-bottom: 4px !important;
        transition: background 0.2s ease, transform 0.15s ease !important;
        border: 1px solid transparent !important;
        position: relative;
        font-size: 14px !important;
        font-weight: 500 !important;
        cursor: pointer !important;
    }
    section[data-testid="stSidebar"] [role="radiogroup"] label:hover {
        background: rgba(255, 255, 255, 0.10) !important;
        transform: translateX(4px);
    }
    section[data-testid="stSidebar"] [role="radiogroup"] label:has(input:checked) {
        background: rgba(255, 255, 255, 0.12) !important;
        border-color: rgba(255, 255, 255, 0.15) !important;
        font-weight: 600 !important;
    }
    section[data-testid="stSidebar"] [role="radiogroup"] label:has(input:checked)::after {
        content: '';
        position: absolute; right: 12px; top: 50%;
        transform: translateY(-50%);
        width: 6px; height: 6px;
        background: #60A5FA; border-radius: 50%;
        box-shadow: 0 0 10px rgba(96,165,250,0.8);
    }
    section[data-testid="stSidebar"] [data-baseweb="radio"] > div:first-child {
        display: none !important;
    }

    /* Selectbox & Inputs */
    section[data-testid="stSidebar"] [data-baseweb="select"] > div,
    section[data-testid="stSidebar"] .stTextInput input {
        background: rgba(255,255,255,0.06) !important;
        border: 1px solid rgba(255,255,255,0.12) !important;
        border-radius: 8px !important;
        color: #fff !important;
    }
    section[data-testid="stSidebar"] .stButton button {
        background: rgba(255,255,255,0.06) !important;
        border: 1px solid rgba(255,255,255,0.12) !important;
        color: #fff !important;
        border-radius: 10px !important;
        transition: all 0.2s ease !important;
        padding: 10px 14px !important;
        font-weight: 500 !important;
    }
    section[data-testid="stSidebar"] .stButton button:hover {
        background: rgba(239,68,68,0.15) !important;
        border-color: rgba(239,68,68,0.30) !important;
        color: #F87171 !important;
        transform: translateY(-1px) !important;
    }
    section[data-testid="stSidebar"] hr {
        border-color: rgba(255,255,255,0.08) !important;
    }
</style>

<script>
(function() {
    function applySidebarState() {
        var sidebar = document.querySelector('[data-testid="stSidebar"]');
        if (!sidebar) return;
        var isMini = sessionStorage.getItem('sidebar_mini') === 'true';
        if (isMini) { sidebar.classList.add('mini-variant'); }
        else        { sidebar.classList.remove('mini-variant'); }
    }

    applySidebarState();
    setTimeout(applySidebarState, 150);
    setTimeout(applySidebarState, 500);

    if (!window._glassMutObs) {
        var debounce;
        window._glassMutObs = new MutationObserver(function() {
            clearTimeout(debounce);
            debounce = setTimeout(applySidebarState, 80);
        });
        window._glassMutObs.observe(document.body, { childList: true, subtree: true });
    }

    if (!window._glassToggleInit) {
        window._glassToggleInit = true;
        document.addEventListener('click', function(e) {
            if (e.target.closest('.glass-toggle-btn')) {
                var sidebar = document.querySelector('[data-testid="stSidebar"]');
                if (!sidebar) return;
                var nowMini = !sidebar.classList.contains('mini-variant');
                sidebar.classList.toggle('mini-variant', nowMini);
                sessionStorage.setItem('sidebar_mini', String(nowMini));
            }
        });
    }
})();
</script>
""", unsafe_allow_html=True)

    # Sidebar Header & User Profile (Expanded View HTML)
    st.sidebar.markdown("""
    <div class="sidebar-expanded-content">
        <div class="glass-header-controls">
            <div class="sidebar-brand-title">SAPA YANFASKES</div>
            <div class="glass-toggle-btn" title="Toggle Sidebar">☰</div>
        </div>
        <div class="sidebar-user-card">
            <div class="user-avatar-circle">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
            </div>
            <div class="user-info">
                <div class="user-name">admin <span class="user-arrow">⌵</span></div>
                <div class="user-role">Admin SAPA Yanfaskes</div>
            </div>
        </div>
        <div class="glass-divider"></div>
        <div class="glass-section-label">MENU</div>
    </div>
    """, unsafe_allow_html=True)

    # Icon Column (Mini-Variant Collapsed View HTML)
    st.sidebar.markdown("""
    <div class="glass-icons">
        <div class="mini-logo">S</div>
        <div class="mini-avatar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
        </div>
        <div class="mini-divider"></div>
        <div class="mini-label">MENU</div>
        <div class="mini-icon-item active">
            <span>🏠</span><span class="mini-tip">Home</span>
        </div>
        <div class="mini-icon-item">
            <span>⚙️</span><span class="mini-tip">Setting</span>
        </div>
        <div class="mini-spacer"></div>
        <div class="mini-icon-item mini-logout">
            <span>🚪</span><span class="mini-tip">Logout</span>
        </div>
    </div>
    """, unsafe_allow_html=True)
