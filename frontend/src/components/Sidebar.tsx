import React, { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

export type NavTab = 'home' | 'fktp' | 'fkrtl' | 'fkrtl-antrol' | 'admin';

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

interface SubMenuItem {
  id: NavTab;
  label: string;
  badge?: string;
  description?: string;
}

interface NavItemConfig {
  id: NavTab;
  label: string;
  badge?: string;
  description?: string;
  icon: (active: boolean) => React.ReactNode;
  children?: SubMenuItem[];
}

const navItems: NavItemConfig[] = [
  {
    id: 'home',
    label: 'Home',
    description: 'Portal Overview',
    icon: (active) => (
      <svg
        className={`w-5 h-5 transition-colors ${active ? 'text-cyan-400' : 'text-slate-400 group-hover:text-slate-200'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.8}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
  },
  {
    id: 'fktp',
    label: 'FKTP Dashboard',
    badge: 'Primer',
    description: 'Fasilitas Kesehatan Tingkat Pertama',
    icon: (active) => (
      <svg
        className={`w-5 h-5 transition-colors ${active ? 'text-cyan-400' : 'text-slate-400 group-hover:text-slate-200'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.8}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
        />
      </svg>
    ),
  },
  {
    id: 'fkrtl',
    label: 'FKRTL Dashboard',
    badge: 'Rujukan',
    description: 'Fasilitas Rujukan Tingkat Lanjutan',
    icon: (active) => (
      <svg
        className={`w-5 h-5 transition-colors ${active ? 'text-cyan-400' : 'text-slate-400 group-hover:text-slate-200'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.8}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
    children: [
      {
        id: 'fkrtl-antrol',
        label: 'Pemanfaatan Antrol',
        badge: 'Live',
        description: 'Monitoring Antrean Online FKRTL',
      },
    ],
  },
  {
    id: 'admin',
    label: 'Admin Settings',
    description: 'IAM, RLS & Konfigurasi',
    icon: (active) => (
      <svg
        className={`w-5 h-5 transition-colors ${active ? 'text-cyan-400' : 'text-slate-400 group-hover:text-slate-200'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.8}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const { user, logout } = useAuth0();
  const [isHovered, setIsHovered] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    fkrtl: true,
  });

  // When cursor leaves the sidebar, auto-collapse all submenus & reset hovered state
  const handleMouseLeave = () => {
    setIsHovered(false);
    setExpandedMenus({});
  };

  // When cursor enters the sidebar, enable full hover mode and auto-expand active parent submenu
  const handleMouseEnter = () => {
    setIsHovered(true);
    // Auto expand FKRTL if FKRTL or any of its children is currently active
    if (activeTab === 'fkrtl' || activeTab === 'fkrtl-antrol') {
      setExpandedMenus({ fkrtl: true });
    }
  };

  const toggleExpand = (menuId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedMenus((prev) => ({
      ...prev,
      [menuId]: !prev[menuId],
    }));
  };

  const handleLogout = () => {
    logout({ logoutParams: { returnTo: window.location.origin } });
  };

  const userDisplayName = user?.name || user?.nickname || (user?.email ? user.email.split('@')[0] : 'User');
  const userInitials = userDisplayName.slice(0, 2).toUpperCase();

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container: Auto-collapses to w-20 (icon only) and expands to w-72 on hover */}
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`fixed top-0 bottom-0 left-0 z-50 bg-slate-900/95 backdrop-blur-2xl border-r border-slate-800 flex flex-col justify-between transition-all duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0 shadow-2xl shadow-cyan-950/40 w-72' : '-translate-x-full'
        } ${
          isHovered
            ? 'lg:w-72 shadow-2xl shadow-cyan-950/60 ring-1 ring-cyan-500/20'
            : 'lg:w-20'
        }`}
      >
        {/* Top: Brand / Logo Header */}
        <div className="flex flex-col">
          <div className={`h-20 flex items-center border-b border-slate-800/80 transition-all duration-300 ${
            isHovered || isOpenMobile ? 'px-5 justify-between' : 'px-0 justify-center'
          }`}>
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-tr from-cyan-500 via-teal-500 to-blue-600 p-[1px] shadow-lg shadow-cyan-500/20">
                <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-cyan-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              </div>
              
              {/* Brand Title (Fades in when hovered or on mobile) */}
              <div className={`flex flex-col min-w-0 transition-opacity duration-200 ${
                isHovered || isOpenMobile ? 'opacity-100' : 'opacity-0 w-0 h-0 overflow-hidden pointer-events-none'
              }`}>
                <span className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5 whitespace-nowrap">
                  SAPA <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-300">YANFASKES</span>
                </span>
                <span className="text-[10px] font-medium text-slate-400 tracking-wide uppercase whitespace-nowrap">
                  Health Analytics
                </span>
              </div>
            </div>

            {/* Mobile close button */}
            {onCloseMobile && (
              <button
                onClick={onCloseMobile}
                className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close sidebar"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Navigation Section */}
          <div className="py-5 px-3 overflow-y-auto max-h-[calc(100vh-190px)]">
            <div className={`px-3 mb-2.5 transition-opacity duration-200 ${
              isHovered || isOpenMobile ? 'opacity-100 block' : 'opacity-0 hidden'
            }`}>
              <span className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
                Menu Navigasi
              </span>
            </div>

            <nav className="space-y-1.5" aria-label="Sidebar navigation">
              {navItems.map((item) => {
                const hasChildren = Boolean(item.children && item.children.length > 0);
                const isDirectActive = activeTab === item.id;
                const isChildActive = Boolean(hasChildren && item.children?.some((child) => child.id === activeTab));
                const isParentActive = Boolean(isDirectActive || isChildActive);
                // Submenus only show when the entire sidebar is hovered or on mobile
                const isExpanded = Boolean((isHovered || isOpenMobile) && (expandedMenus[item.id] ?? false));

                return (
                  <div key={item.id} className="space-y-1">
                    {/* Main Nav Item */}
                    <button
                      onClick={() => {
                        if (hasChildren) {
                          setExpandedMenus((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
                          if (item.children?.[0]) {
                            onTabChange(item.children[0].id);
                          } else {
                            onTabChange(item.id);
                          }
                        } else {
                          onTabChange(item.id);
                        }
                        if (onCloseMobile && !hasChildren) onCloseMobile();
                      }}
                      title={!isHovered && !isOpenMobile ? item.label : undefined}
                      className={`group w-full flex items-center rounded-xl font-medium text-sm transition-all duration-200 relative cursor-pointer ${
                        isHovered || isOpenMobile
                          ? 'px-3.5 py-3 justify-between text-left'
                          : 'p-3 justify-center'
                      } ${
                        isParentActive
                          ? 'bg-gradient-to-r from-cyan-500/15 via-teal-500/10 to-transparent text-white border border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/60 border border-transparent'
                      }`}
                    >
                      {/* Active Accent Bar */}
                      {isParentActive && (
                        <span className="absolute left-0 top-2 bottom-2 w-1 bg-gradient-to-b from-cyan-400 to-teal-400 rounded-r-full" />
                      )}

                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                            isParentActive
                              ? 'bg-cyan-500/20 text-cyan-300'
                              : 'bg-slate-800/80 text-slate-400 group-hover:bg-slate-800 group-hover:text-slate-200'
                          }`}
                        >
                          {item.icon(isParentActive)}
                        </div>

                        {/* Menu Label & Description (Visible only when hovered or mobile) */}
                        {(isHovered || isOpenMobile) && (
                          <div className="flex flex-col min-w-0 transition-opacity duration-200">
                            <span className={`leading-none truncate ${isParentActive ? 'font-semibold text-cyan-100' : 'font-medium'}`}>
                              {item.label}
                            </span>
                            {item.description && (
                              <span className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                                {item.description}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Badges & Chevron (Visible only when hovered or mobile) */}
                      {(isHovered || isOpenMobile) && (
                        <div className="flex items-center gap-2 shrink-0">
                          {item.badge && (
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                isParentActive
                                  ? 'bg-cyan-400/20 text-cyan-300 border-cyan-400/30'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}

                          {hasChildren && (
                            <span
                              onClick={(e) => toggleExpand(item.id, e)}
                              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/50 transition-transform duration-200"
                              aria-label="Toggle submenu"
                            >
                              <svg
                                className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-cyan-400' : 'text-slate-400'}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </span>
                          )}
                        </div>
                      )}
                    </button>

                    {/* Sub-menu Items (e.g. Pemanfaatan Antrol) — Auto-collapsed unless hovered */}
                    {hasChildren && isExpanded && (isHovered || isOpenMobile) && (
                      <div className="pl-6 pr-1 py-1 space-y-1 border-l-2 border-slate-800/80 ml-5 my-1 transition-all duration-200">
                        {item.children?.map((child) => {
                          const isChildCurrentActive = activeTab === child.id;
                          return (
                            <button
                              key={child.id}
                              onClick={() => {
                                onTabChange(child.id);
                                if (onCloseMobile) onCloseMobile();
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all text-left cursor-pointer ${
                                isChildCurrentActive
                                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isChildCurrentActive ? 'bg-cyan-400 ring-2 ring-cyan-400/30' : 'bg-slate-600'
                                  }`}
                                />
                                <span className="truncate">{child.label}</span>
                              </div>

                              {child.badge && (
                                <span
                                  className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                                    isChildCurrentActive
                                      ? 'bg-cyan-400/30 text-cyan-200'
                                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                                  }`}
                                >
                                  {child.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Bottom Section: User Info & Logout Button */}
        <div className={`p-3 border-t border-slate-800/80 bg-slate-950/50 space-y-2.5 transition-all duration-300 ${
          isHovered || isOpenMobile ? 'px-4' : 'px-2 flex flex-col items-center'
        }`}>
          {/* User Profile Card */}
          <div className={`flex items-center rounded-xl bg-slate-800/40 border border-slate-800/60 transition-all ${
            isHovered || isOpenMobile ? 'gap-3 px-3 py-2.5 w-full' : 'p-2 justify-center'
          }`}>
            {user?.picture ? (
              <img
                src={user.picture}
                alt={userDisplayName}
                className="w-8 h-8 rounded-full object-cover border border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-600 to-teal-500 flex items-center justify-center font-bold text-xs text-white shadow-md shadow-cyan-900/30 shrink-0">
                {userInitials}
              </div>
            )}

            {(isHovered || isOpenMobile) && (
              <>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-semibold text-slate-200 truncate" title={userDisplayName}>
                    {userDisplayName}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate" title={user?.email || ''}>
                    {user?.email || 'Authenticated User'}
                  </span>
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-400 ring-4 ring-emerald-400/20 shrink-0" title="Active session" />
              </>
            )}
          </div>

          {/* Logout Button placed at the very bottom */}
          <button
            onClick={handleLogout}
            title={!isHovered && !isOpenMobile ? 'Logout' : undefined}
            className={`flex items-center justify-center rounded-xl text-sm font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/30 transition-all duration-200 active:scale-[0.98] shadow-sm shadow-rose-950/30 cursor-pointer ${
              isHovered || isOpenMobile
                ? 'w-full gap-2.5 px-4 py-2.5'
                : 'w-10 h-10 p-0'
            }`}
          >
            <svg
              className="w-4 h-4 text-rose-400 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            {(isHovered || isOpenMobile) && <span>Logout</span>}
          </button>
        </div>
      </aside>
    </>
  );
};
