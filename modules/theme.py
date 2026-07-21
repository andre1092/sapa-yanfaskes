import streamlit as st

def inject_glassmorphism_theme():
    """Inject premium Glassmorphism UI theme and responsive collapsible sidebar engine."""
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
        padding-left: calc(1.5rem + 280px) !important;
    }
    iframe { height: 850px !important; border-radius: 8px; }

    /* Hide Streamlit default headers/footers */
    [data-testid="stSidebarCollapsedControl"] { display: none !important; }
    #MainMenu { visibility: hidden !important; }
    footer   { visibility: hidden !important; }
    header   { visibility: hidden !important; }

    /* ================================================================ */
    /*  GLASSMORPHISM SIDEBAR                                            */
    /* ================================================================ */
    section[data-testid="stSidebar"] {
        background: rgba(255, 255, 255, 0.05) !important;
        backdrop-filter: blur(20px) !important;
        -webkit-backdrop-filter: blur(20px) !important;
        border-right: 1px solid rgba(255, 255, 255, 0.1) !important;
        box-shadow: 4px 0 30px rgba(0, 0, 0, 0.12) !important;
        visibility: visible !important;
        position: fixed !important;
        left: 0 !important; top: 0 !important;
        height: 100vh !important;
        z-index: 1000000 !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        transform: none !important;
        width: 280px !important;
        min-width: 280px !important;
        transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                    min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                    box-shadow 0.3s ease !important;
    }
    section[data-testid="stSidebar"] > div:first-child {
        background: transparent !important;
    }
    section[data-testid="stSidebar"]::-webkit-scrollbar { width: 3px; }
    section[data-testid="stSidebar"]::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.08); border-radius: 4px;
    }

    /* ================================================================ */
    /*  MINI-VARIANT (70px COLLAPSED SIDEBAR)                           */
    /* ================================================================ */
    section[data-testid="stSidebar"].mini-variant {
        width: 70px !important;
        min-width: 70px !important;
        overflow: hidden !important;
    }
    section[data-testid="stSidebar"].mini-variant [data-testid="stVerticalBlock"] > div:not(:has(.glass-toggle)):not(:has(.glass-icons)) {
        display: none !important;
    }
    section[data-testid="stSidebar"].mini-variant .stMarkdown:not(:has(.glass-toggle)):not(:has(.glass-icons)),
    section[data-testid="stSidebar"].mini-variant .stRadio,
    section[data-testid="stSidebar"].mini-variant .stSelectbox,
    section[data-testid="stSidebar"].mini-variant .stTextInput,
    section[data-testid="stSidebar"].mini-variant .stFileUploader,
    section[data-testid="stSidebar"].mini-variant .stButton,
    section[data-testid="stSidebar"].mini-variant [data-testid="stCaption"],
    section[data-testid="stSidebar"].mini-variant hr {
        display: none !important;
    }

    /* ================================================================ */
    /*  ICON COLUMN (FOR MINI-VARIANT STATE)                            */
    /* ================================================================ */
    .glass-icons { display: none !important; }
    section[data-testid="stSidebar"].mini-variant .glass-icons {
        display: flex !important;
        flex-direction: column;
        align-items: center;
        padding: 6px 0;
        gap: 2px;
    }
    .glass-icon-logo {
        width: 38px; height: 38px; border-radius: 10px;
        background: linear-gradient(135deg, #02628a, #0ea5e9);
        display: flex; align-items: center; justify-content: center;
        font-size: 16px; font-weight: 800; color: #fff;
        margin-bottom: 8px;
        box-shadow: 0 2px 10px rgba(14,165,233,0.30);
        font-family: 'Inter', system-ui, sans-serif;
    }
    .glass-icon-avatar {
        width: 34px; height: 34px; border-radius: 50%;
        background: linear-gradient(135deg, #3B82F6, #1E40AF);
        display: flex; align-items: center; justify-content: center;
        color: #fff; font-size: 13px; font-weight: 700;
        margin-bottom: 14px;
        border: 2px solid rgba(255,255,255,0.15);
        box-shadow: 0 2px 8px rgba(59,130,246,0.22);
        font-family: 'Inter', system-ui, sans-serif;
    }
    .glass-icon-divider {
        width: 26px; height: 1px;
        background: rgba(255,255,255,0.08);
        margin-bottom: 6px;
    }
    .glass-icon-label {
        font-size: 7.5px; font-weight: 700;
        color: rgba(255,255,255,0.22);
        letter-spacing: 2px; text-transform: uppercase;
        margin-bottom: 10px;
        font-family: 'Inter', system-ui, sans-serif;
    }
    .glass-icon-item {
        width: 42px; height: 42px; border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; color: rgba(255,255,255,0.50);
        cursor: pointer; transition: all 0.2s ease;
        position: relative; margin-bottom: 2px;
    }
    .glass-icon-item:hover {
        background: rgba(255,255,255,0.12);
        color: #60A5FA; transform: scale(1.08);
    }
    .glass-icon-item.active {
        background: rgba(96,165,250,0.12);
        color: #60A5FA;
    }
    .glass-icon-item.active::before {
        content: ''; position: absolute;
        left: -14px; top: 50%; transform: translateY(-50%);
        width: 3px; height: 18px;
        background: #60A5FA; border-radius: 0 3px 3px 0;
    }
    .glass-icon-spacer { flex: 1; min-height: 30px; }
    .glass-icon-item.glass-logout { color: rgba(248,113,113,0.50); }
    .glass-icon-item.glass-logout:hover {
        background: rgba(239,68,68,0.10); color: #F87171;
    }
    .glass-icon-tip {
        position: absolute; left: 54px; top: 50%;
        transform: translateY(-50%);
        background: rgba(15,23,42,0.94);
        backdrop-filter: blur(8px);
        color: #E2E8F0; padding: 4px 10px;
        border-radius: 6px; font-size: 11px; font-weight: 500;
        white-space: nowrap; opacity: 0; pointer-events: none;
        transition: opacity 0.15s ease;
        border: 1px solid rgba(255,255,255,0.08);
        font-family: 'Inter', system-ui, sans-serif;
    }
    .glass-icon-item:hover .glass-icon-tip { opacity: 1; }

    /* ================================================================ */
    /*  TOGGLE BUTTON                                                    */
    /* ================================================================ */
    .glass-toggle {
        display: flex; justify-content: flex-end;
        padding: 12px 14px 4px;
    }
    section[data-testid="stSidebar"].mini-variant .glass-toggle {
        justify-content: center; padding: 12px 0 4px;
    }
    .glass-toggle-btn {
        width: 36px; height: 36px; border-radius: 8px;
        background: rgba(255,255,255,0.07);
        border: 1px solid rgba(255,255,255,0.10);
        color: rgba(255,255,255,0.65);
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-size: 18px;
        transition: all 0.2s ease;
        -webkit-user-select: none; user-select: none;
    }
    .glass-toggle-btn:hover {
        background: rgba(255,255,255,0.14);
        color: #fff; transform: scale(1.06);
        box-shadow: 0 0 12px rgba(255,255,255,0.06);
    }

    /* ================================================================ */
    /*  TYPOGRAPHY & INTERACTIVE WIDGETS                                 */
    /* ================================================================ */
    section[data-testid="stSidebar"],
    section[data-testid="stSidebar"] p,
    section[data-testid="stSidebar"] span,
    section[data-testid="stSidebar"] label,
    section[data-testid="stSidebar"] h1, section[data-testid="stSidebar"] h2,
    section[data-testid="stSidebar"] h3, section[data-testid="stSidebar"] div {
        color: #FFFFFF !important;
    }
    section[data-testid="stSidebar"] [data-testid="stCaption"],
    section[data-testid="stSidebar"] small {
        color: rgba(255,255,255,0.55) !important;
    }

    /* Radio Tiles */
    section[data-testid="stSidebar"] [role="radiogroup"] label {
        padding: 10px 14px !important;
        border-radius: 10px !important;
        margin-bottom: 3px !important;
        transition: background 0.2s ease, transform 0.15s ease !important;
        border: 1px solid transparent !important;
        position: relative;
    }
    section[data-testid="stSidebar"] [role="radiogroup"] label:hover {
        background: rgba(255, 255, 255, 0.12) !important;
        transform: translateX(3px);
    }
    section[data-testid="stSidebar"] [role="radiogroup"] label:has(input:checked) {
        background: rgba(96, 165, 250, 0.14) !important;
        border-color: rgba(96, 165, 250, 0.22) !important;
    }
    section[data-testid="stSidebar"] [role="radiogroup"] label:has(input:checked)::after {
        content: '';
        position: absolute; right: 12px; top: 50%;
        transform: translateY(-50%);
        width: 7px; height: 7px;
        background: #60A5FA; border-radius: 50%;
        box-shadow: 0 0 10px rgba(96,165,250,0.6);
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
        border-radius: 8px !important;
        transition: all 0.2s ease !important;
    }
    section[data-testid="stSidebar"] .stButton button:hover {
        background: rgba(255,255,255,0.14) !important;
        border-color: rgba(255,255,255,0.22) !important;
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

    # Sidebar Header Controls & Icon Column
    st.sidebar.markdown("""
    <div class="glass-toggle">
        <div class="glass-toggle-btn" title="Toggle Sidebar">☰</div>
    </div>
    """, unsafe_allow_html=True)

    st.sidebar.markdown("""
    <div class="glass-icons">
        <div class="glass-icon-logo">S</div>
        <div class="glass-icon-avatar">A</div>
        <div class="glass-icon-divider"></div>
        <div class="glass-icon-label">MENU</div>
        <div class="glass-icon-item active">
            <span>🏠</span><span class="glass-icon-tip">Home</span>
        </div>
        <div class="glass-icon-item">
            <span>⚙️</span><span class="glass-icon-tip">Setting</span>
        </div>
        <div class="glass-icon-spacer"></div>
        <div class="glass-icon-item glass-logout">
            <span>🚪</span><span class="glass-icon-tip">Logout</span>
        </div>
    </div>
    """, unsafe_allow_html=True)
