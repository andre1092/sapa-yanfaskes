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
        className={`w-5 h-5 transition-colors ${active ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-[#009B4D] dark:group-hover:text-emerald-300'}`}
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
        className={`w-5 h-5 transition-colors ${active ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-[#009B4D] dark:group-hover:text-emerald-300'}`}
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
    description: 'Fasilitas Rujukan Lanjutan',
    icon: (active) => (
      <svg
        className={`w-5 h-5 transition-colors ${active ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-[#00529C] dark:group-hover:text-emerald-300'}`}
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
        className={`w-5 h-5 transition-colors ${active ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-[#00529C] dark:group-hover:text-emerald-300'}`}
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

  const handleMouseLeave = () => {
    setIsHovered(false);
    setExpandedMenus({});
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (activeTab === 'fkrtl' || activeTab === 'fkrtl-antrol') {
      setExpandedMenus({ fkrtl: true });
    }
  };

  const handleLogout = () => {
    logout({ logoutParams: { returnTo: window.location.origin } });
  };

  const userDisplayName = user?.name || user?.nickname || (user?.email ? user.email.split('@')[0] : 'Petugas BPJS');
  const userInitials = userDisplayName.slice(0, 2).toUpperCase();

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container with Glassmorphism 70% & BPJS Palette */}
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`fixed top-0 bottom-0 left-0 z-50 glass-panel border-r border-slate-200/90 dark:border-emerald-500/20 flex flex-col justify-between transition-all duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0 shadow-2xl shadow-emerald-950/40 w-72' : '-translate-x-full'
        } ${
          isHovered
            ? 'lg:w-72 shadow-2xl shadow-blue-950/20 dark:shadow-emerald-950/50 ring-1 ring-[#00529C]/15 dark:ring-emerald-500/20'
            : 'lg:w-20'
        }`}
      >
        {/* Top: Brand Logo Section */}
        <div className="flex flex-col">
          <div className={`h-20 flex items-center border-b border-slate-200/80 dark:border-slate-800/80 transition-all duration-300 ${
            isHovered || isOpenMobile ? 'px-5 justify-between' : 'px-0 justify-center'
          }`}>
            <div className="flex items-center gap-3.5 min-w-0">
              {/* BPJS Emblem Icon */}
              <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-tr from-[#009B4D] via-[#0A50A1] to-[#00529C] p-[1.5px] shadow-md shadow-emerald-600/25">
                <div className="w-full h-full bg-white dark:bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-[#009B4D] dark:text-emerald-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              </div>
              
              {/* Brand Title (Visible when expanded) */}
              <div className={`flex flex-col min-w-0 transition-opacity duration-200 ${
                isHovered || isOpenMobile ? 'opacity-100' : 'opacity-0 w-0 h-0 overflow-hidden pointer-events-none'
              }`}>
                <span className="font-extrabold text-base tracking-tight flex items-center gap-1.5 whitespace-nowrap">
                  <span className="text-[#00529C] dark:text-white">SAPA</span>
                  <span className="text-[#009B4D] dark:text-emerald-400 font-black">YANFASKES</span>
                </span>
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 tracking-tight whitespace-nowrap">
                  Saluran Analisis Performa & Akselerasi
                </span>
              </div>
            </div>

            {/* Mobile close button */}
            {onCloseMobile && (
              <button
                onClick={onCloseMobile}
                className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
                aria-label="Tutup sidebar"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Navigation Items Section */}
          <div className="py-5 px-3 overflow-y-auto max-h-[calc(100vh-190px)]">
            <div className={`px-3 mb-2.5 transition-opacity duration-200 ${
              isHovered || isOpenMobile ? 'opacity-100 block' : 'opacity-0 hidden'
            }`}>
              <span className="text-[11px] font-bold text-[#00529C] dark:text-emerald-400 tracking-wider uppercase flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#009B4D]" />
                Menu Navigasi
              </span>
            </div>

            <nav className="space-y-1.5" aria-label="Sidebar navigation">
              {navItems.map((item) => {
                const hasChildren = Boolean(item.children && item.children.length > 0);
                const isDirectActive = activeTab === item.id;
                const isChildActive = Boolean(hasChildren && item.children?.some((child) => child.id === activeTab));
                const isParentActive = Boolean(isDirectActive || isChildActive);
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
                          ? 'px-3.5 py-2.5 justify-between text-left'
                          : 'p-2.5 justify-center'
                      } ${
                        isParentActive
                          ? 'bpjs-gradient text-white shadow-md shadow-[#009B4D]/30 border border-emerald-300/30'
                          : 'bg-transparent text-slate-700 dark:text-slate-300 hover:bg-blue-50/80 dark:hover:bg-slate-800/60 hover:text-[#00529C] dark:hover:text-emerald-300 border border-transparent'
                      }`}
                    >
                      {/* Active Accent Bar */}
                      {isParentActive && (
                        <span className="absolute left-0 top-2 bottom-2 w-1.5 bg-emerald-300 rounded-r-full shadow-sm shadow-emerald-200/60" />
                      )}

                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                            isParentActive
                              ? 'bg-white/20 text-white shadow-sm'
                              : 'bg-slate-100/90 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 group-hover:bg-emerald-100/80 dark:group-hover:bg-slate-800 group-hover:text-[#009B4D] dark:group-hover:text-emerald-300'
                          }`}
                        >
                          {item.icon(isParentActive)}
                        </div>

                        {(isHovered || isOpenMobile) && (
                          <div className="flex flex-col min-w-0">
                            <span className={`text-sm truncate leading-tight ${isParentActive ? 'font-bold text-white' : 'font-semibold text-slate-800 dark:text-slate-200 group-hover:text-[#00529C] dark:group-hover:text-white'}`}>
                              {item.label}
                            </span>
                            {item.description && (
                              <span className={`text-[10.5px] truncate leading-tight mt-0.5 ${isParentActive ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                                {item.description}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right: Badge / Expand Chevron */}
                      {(isHovered || isOpenMobile) && (
                        <div className="flex items-center gap-2 shrink-0">
                          {item.badge && (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isParentActive
                                  ? 'bg-white/25 text-white'
                                  : item.badge === 'Primer'
                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-[#007A3D] dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40'
                                  : 'bg-blue-100 dark:bg-blue-950/60 text-[#00529C] dark:text-blue-300 border border-blue-200 dark:border-blue-800/40'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}

                          {hasChildren && (
                            <svg
                              className={`w-4 h-4 transition-transform duration-200 ${
                                isExpanded ? 'rotate-180' : ''
                              } ${isParentActive ? 'text-white' : 'text-slate-400 group-hover:text-[#00529C] dark:group-hover:text-white'}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </div>
                      )}
                    </button>

                    {/* Submenu Item */}
                    {hasChildren && isExpanded && (
                      <div className="pl-6 pr-1 py-1 space-y-1 border-l-2 border-[#009B4D]/30 ml-4 my-1">
                        {item.children?.map((child) => {
                          const isChildCurrentActive = activeTab === child.id;
                          return (
                            <button
                              key={child.id}
                              onClick={() => {
                                onTabChange(child.id);
                                if (onCloseMobile) onCloseMobile();
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all cursor-pointer ${
                                isChildCurrentActive
                                  ? 'bg-gradient-to-r from-[#009B4D]/15 to-[#00529C]/15 text-[#00529C] dark:text-emerald-300 font-bold border border-[#009B4D]/30 shadow-sm'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-[#00529C] dark:hover:text-white hover:bg-blue-50/70 dark:hover:bg-slate-800/40'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isChildCurrentActive ? 'bg-[#009B4D]' : 'bg-slate-400'
                                  }`}
                                />
                                <span className="truncate">{child.label}</span>
                              </div>

                              {child.badge && (
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                    isChildCurrentActive
                                      ? 'bg-[#009B4D] text-white'
                                      : 'bg-blue-100 text-[#00529C] dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40'
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

        {/* Bottom Section: User Info Card & Logout Button */}
        <div className={`p-3 border-t border-slate-200/80 dark:border-slate-800/80 bg-white/40 dark:bg-slate-950/50 backdrop-blur-md space-y-2.5 transition-all duration-300 ${
          isHovered || isOpenMobile ? 'px-4' : 'px-2 flex flex-col items-center'
        }`}>
          {/* User Profile Card */}
          <div className={`flex items-center rounded-xl bg-white/80 dark:bg-slate-800/60 border border-blue-100 dark:border-emerald-500/20 shadow-sm transition-all ${
            isHovered || isOpenMobile ? 'gap-3 px-3 py-2.5 w-full' : 'p-2 justify-center'
          }`}>
            {user?.picture ? (
              <img
                src={user.picture}
                alt={userDisplayName}
                className="w-8 h-8 rounded-full object-cover border border-[#009B4D]/40 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#009B4D] to-[#00529C] flex items-center justify-center font-bold text-xs text-white shadow-md shadow-[#009B4D]/30 shrink-0">
                {userInitials}
              </div>
            )}

            {(isHovered || isOpenMobile) && (
              <>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate" title={userDisplayName}>
                    {userDisplayName}
                  </span>
                  <span className="text-[10px] text-[#00529C] dark:text-slate-400 font-medium truncate" title={user?.email || ''}>
                    {user?.email || 'Verifikator Yanfaskes'}
                  </span>
                </div>
                <div className="w-2 h-2 rounded-full bg-[#009B4D] ring-4 ring-[#009B4D]/20 shrink-0" title="Sesi Aktif" />
              </>
            )}
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            title={!isHovered && !isOpenMobile ? 'Logout' : undefined}
            className={`flex items-center justify-center rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/20 transition-all duration-200 active:scale-[0.98] shadow-sm cursor-pointer ${
              isHovered || isOpenMobile
                ? 'w-full gap-2 px-3.5 py-2'
                : 'w-10 h-10 p-0'
            }`}
          >
            <svg
              className="w-4 h-4 text-rose-500 shrink-0"
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
