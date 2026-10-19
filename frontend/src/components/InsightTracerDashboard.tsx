import React, { useState } from 'react';
import { LaporanKepatuhanDashboard } from './LaporanKepatuhanDashboard';
import { FktpAntrolDashboard } from './FktpAntrolDashboard';
import { UserManagementView } from './UserManagementView';
import { useAuthStore } from '../store/authStore';

// Sub-komponen SVG World Map untuk Geographical Distribution
const WorldMapSvg: React.FC<{ activeMetric: string }> = ({ activeMetric }) => {
  return (
    <div className="relative w-full h-[260px] bg-[#F8F9FD] rounded-xl flex items-center justify-center overflow-hidden border border-[#ECECF3]">
      <svg
        viewBox="0 0 1000 500"
        className="w-full h-full text-[#CBD5E1] fill-current opacity-70"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Kontur Benua Amerika Utara */}
        <path d="M120,80 Q200,60 280,110 Q320,160 260,220 Q200,260 170,200 Q110,160 120,80 Z" />
        {/* Amerika Selatan */}
        <path d="M260,250 Q310,270 330,340 Q310,430 260,420 Q220,340 260,250 Z" />
        {/* Greenland */}
        <path d="M380,40 Q430,30 440,70 Q410,100 370,80 Z" fill="#94A3B8" />
        {/* Eropa & UK */}
        <path d="M470,100 Q485,80 495,100 Q485,120 470,100 Z" />
        <path d="M510,90 Q580,80 600,130 Q560,170 500,150 Z" />
        {/* Afrika */}
        <path d="M500,180 Q570,190 590,260 Q560,370 510,360 Q460,260 500,180 Z" />
        {/* Asia & India */}
        <path d="M620,80 Q780,70 850,150 Q800,240 680,220 Q610,180 620,80 Z" />
        <path d="M680,210 Q710,210 700,260 Q670,250 680,210 Z" fill="#94A3B8" />
        {/* Australia */}
        <path d="M780,310 Q860,300 870,370 Q810,400 760,370 Z" />
      </svg>

      {/* Hotspot Markers (Sesuai 5 Negara Referensi) */}
      {/* 1. India (Terbesar: 50.61%) */}
      <div className="absolute left-[69%] top-[45%] flex items-center justify-center group cursor-pointer">
        <span className="animate-ping absolute inline-flex h-6 w-6 rounded-full bg-[#6C5DD3] opacity-40"></span>
        <span className="relative inline-flex rounded-full h-4 w-4 bg-[#6C5DD3] border-2 border-white shadow-md"></span>
        <div className="absolute -top-7 px-2 py-0.5 bg-[#1E1F31] text-white text-[10px] rounded font-semibold whitespace-nowrap shadow-sm opacity-90">
          India: 14,230 (50.6%)
        </div>
      </div>

      {/* 2. United States (26.21%) */}
      <div className="absolute left-[22%] top-[30%] flex items-center justify-center group cursor-pointer">
        <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#3F8CFF] border-2 border-white shadow-md"></span>
        <div className="absolute -top-7 px-2 py-0.5 bg-[#1E1F31] text-white text-[10px] rounded font-semibold whitespace-nowrap shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
          USA: 8,210 (26.2%)
        </div>
      </div>

      {/* 3. United Kingdom (12.44%) */}
      <div className="absolute left-[48%] top-[22%] flex items-center justify-center group cursor-pointer">
        <span className="relative inline-flex rounded-full h-3 w-3 bg-[#3F8CFF] border-2 border-white shadow-md"></span>
      </div>

      {/* 4. Greenland (6.61%) */}
      <div className="absolute left-[40%] top-[14%] flex items-center justify-center group cursor-pointer">
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#8E8FA3] border-2 border-white shadow-md"></span>
      </div>

      {/* 5. Australia (4.61%) */}
      <div className="absolute left-[81%] top-[72%] flex items-center justify-center group cursor-pointer">
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#8E8FA3] border-2 border-white shadow-md"></span>
      </div>

      {/* Badge Metric Aktif */}
      <div className="absolute top-3 left-3 px-2.5 py-1 bg-white/90 backdrop-blur-sm border border-[#E8E8EE] rounded-lg text-xs font-semibold text-[#1E1F31] shadow-xs">
        Metric: {activeMetric}
      </div>
    </div>
  );
};

export const InsightTracerDashboard: React.FC = () => {
  const { logoutUser } = useAuthStore();
  const [geoTab, setGeoTab] = useState<'Clicks' | 'Organic Installs' | 'Non-Organic Installs'>('Clicks');
  const [activeMenu, setActiveMenu] = useState('Capaian Kepatuhan FKRTL');
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const menuSections = [
    {
      category: 'ACTION CENTRE',
      items: [{ name: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' }],
    },
    {
      category: 'DASHBOARD',
      items: [
        { name: 'Capaian Kepatuhan FKRTL', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
        { name: 'Capaian Kepatuhan FKTP', icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2' },
      ],
    },
    {
      category: 'ENGAGEMENTS',
      items: [
        { name: 'Activity', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
        { name: 'Touchpoints', icon: 'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5' },
        { name: 'Installs & Uninstalls', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4' },
        { name: 'Agency', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
        { name: 'Fraud', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
        { name: 'Logs', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
      ],
    },
    {
      category: 'MANAGE',
      items: [
        { name: 'User', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
        { name: 'Smart Banners', icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' },
        { name: 'Events', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
        { name: 'Validation Rules', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
        { name: 'Integration', icon: 'M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z' },
      ],
    },
  ];

  return (
    <div className="flex h-screen bg-[#F1F1F4] text-[#1E1F31] font-sans antialiased overflow-hidden">
      {/* ------------------------------------------------------------- */}
      {/* 1. SIDEBAR NAVIGASI GELAP (#1E1F31) — AUTO-HIDE / HOVER-EXPAND */}
      {/* ------------------------------------------------------------- */}
      <aside
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
        className={`${
          isSidebarHovered ? 'w-[302px] shadow-2xl' : 'w-[72px]'
        } bg-[#1E1F31] text-white flex flex-col flex-shrink-0 h-full select-none z-20 transition-all duration-300 ease-in-out`}
      >
        {/* Brand Logo & Name */}
        <div className={`h-[88px] flex items-center border-b border-[#2A2B3F] transition-all duration-300 ${
          isSidebarHovered ? 'justify-between px-7' : 'justify-center px-0'
        }`}>
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-tr from-[#6C5DD3] to-[#3F8CFF] flex items-center justify-center shadow-md">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            {isSidebarHovered && (
              <span className="font-bold text-lg tracking-tight text-white truncate transition-opacity duration-200">
                SAPA Yanfaskes
              </span>
            )}
          </div>
          {isSidebarHovered && (
            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-[#E4F8DD]/20 text-[#27AE60] border border-[#27AE60]/40 uppercase tracking-wide shrink-0 transition-opacity duration-200">
              LIVE
            </span>
          )}
        </div>

        {/* Scrollable Navigation Items */}
        <div className={`flex-1 overflow-y-auto py-6 space-y-6 scrollbar-thin scrollbar-thumb-gray-700 transition-all duration-300 ${
          isSidebarHovered ? 'px-5' : 'px-2'
        }`}>
          {menuSections.map((sec, idx) => (
            <div key={idx} className="space-y-1.5">
              {isSidebarHovered && (
                <div className="px-3 text-[11px] font-semibold tracking-wider text-[#8E8FA3] uppercase transition-opacity duration-200">
                  {sec.category}
                </div>
              )}
              <div className="mt-1 space-y-1">
                {sec.items.map((item) => {
                  const isActive = activeMenu === item.name;
                  return (
                    <button
                      key={item.name}
                      onClick={() => setActiveMenu(item.name)}
                      title={!isSidebarHovered ? item.name : undefined}
                      className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                        isSidebarHovered
                          ? 'gap-3.5 px-3.5 py-2.5 justify-start text-left'
                          : 'justify-center p-2.5'
                      } ${
                        isActive
                          ? 'bg-[#2E2F45] text-white shadow-xs'
                          : 'text-[#8E8FA3] hover:text-white hover:bg-[#25263A]'
                      }`}
                    >
                      <svg
                        className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? 'text-[#6C5DD3]' : 'text-[#8E8FA3]'}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={item.icon} />
                      </svg>
                      {isSidebarHovered && (
                        <span className="truncate">{item.name}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Section: Log Out Action */}
        <div className={`p-3 border-t border-[#2A2B3F] transition-all duration-300 ${
          isSidebarHovered ? 'px-4' : 'px-2 flex justify-center'
        }`}>
          <button
            onClick={() => setShowLogoutModal(true)}
            title={!isSidebarHovered ? 'Log Out' : undefined}
            className={`w-full flex items-center rounded-xl text-xs font-bold text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 hover:border-rose-600 transition-all duration-200 cursor-pointer ${
              isSidebarHovered
                ? 'gap-3 px-3.5 py-2.5 justify-start text-left'
                : 'justify-center p-2.5'
            }`}
          >
            <svg
              className="w-4 h-4 flex-shrink-0 text-rose-500 hover:text-white transition-colors"
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
            {isSidebarHovered && (
              <span className="truncate">Keluar Sesi (Log Out)</span>
            )}
          </button>
        </div>
      </aside>

      {/* Modal Dialog Konfirmasi Log Out */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm rounded-3xl p-6 bg-[#1E1F31] border border-rose-500/30 shadow-2xl text-center space-y-4 text-white animate-scaleUp">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight">Konfirmasi Keluar Sesi</h3>
              <p className="text-xs text-[#8E8FA3] mt-1.5 leading-relaxed">
                Apakah Anda yakin ingin mengakhiri sesi kerja aktif di sistem SAPA Yanfaskes dan kembali ke Halaman Login?
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  logoutUser();
                  setShowLogoutModal(false);
                }}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-950/40 transition-all cursor-pointer"
              >
                Ya, Keluar Sesi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. AREA KONTEN UTAMA                                          */}
      {/* ------------------------------------------------------------- */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header Navbar */}
        <header className="h-[88px] bg-white border-b border-[#E8E8EE] flex items-center justify-between px-10 flex-shrink-0">
          <h1 className="text-2xl font-bold text-[#1E1F31] tracking-tight">{activeMenu}</h1>

          <div className="flex items-center gap-4">
            {/* Date Range Selector Sesuai Referensi OCR */}
            <button className="flex items-center gap-2 px-3.5 py-1.5 bg-white border border-[#E8E8EE] rounded-lg text-xs font-semibold text-[#1E1F31] shadow-2xs hover:bg-gray-50 transition-colors">
              <svg className="w-3.5 h-3.5 text-[#8E8FA3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Jan 2023 - Feb 2023</span>
              <svg className="w-3.5 h-3.5 text-[#8E8FA3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </header>

        {/* Dashboard Scrollable Canvas */}
        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          {activeMenu === 'Capaian Kepatuhan FKRTL' ? (
            <LaporanKepatuhanDashboard />
          ) : activeMenu === 'Capaian Kepatuhan FKTP' ? (
            <FktpAntrolDashboard />
          ) : activeMenu === 'User' || activeMenu === 'user' ? (
            <UserManagementView />
          ) : (
            <>
              {/* BARIS 1: 2 KARTU METRIK UTAMA (TOUCHPOINTS & INSTALLS) */}
              <div className="grid grid-cols-12 gap-6">
            {/* Kartu 1: Touchpoints */}
            <div className="col-span-12 lg:col-span-6 bg-white rounded-2xl p-6 border border-[#E8E8EE] shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-[#1E1F31]">Touchpoints</h2>
                    <p className="text-xs text-[#8E8FA3] mt-0.5">
                      A touchpoint is the initialisation of a communication process.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6">
                  {/* Clicks */}
                  <div className="p-4 rounded-xl bg-[#F8F9FD] border border-[#ECECF3]">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-extrabold text-[#1E1F31]">23.4k</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#E4F8DD] text-[#27AE60]">
                        14%
                      </span>
                    </div>
                    <span className="text-xs font-medium text-[#8E8FA3] mt-1 block">Clicks</span>
                  </div>

                  {/* Impressions */}
                  <div className="p-4 rounded-xl bg-[#F8F9FD] border border-[#ECECF3]">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-extrabold text-[#1E1F31]">6.4k</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#E4F8DD] text-[#27AE60]">
                        16%
                      </span>
                    </div>
                    <span className="text-xs font-medium text-[#8E8FA3] mt-1 block">Impressions</span>
                  </div>

                  {/* Organic */}
                  <div className="p-4 rounded-xl bg-[#F8F9FD] border border-[#ECECF3]">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-extrabold text-[#1E1F31]">43.2k</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#E4F8DD] text-[#27AE60]">
                        11%
                      </span>
                    </div>
                    <span className="text-xs font-medium text-[#8E8FA3] mt-1 block">Organic</span>
                  </div>

                  {/* Non-Organic */}
                  <div className="p-4 rounded-xl bg-[#F8F9FD] border border-[#ECECF3]">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-extrabold text-[#1E1F31]">83k</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#E4F8DD] text-[#27AE60]">
                        18%
                      </span>
                    </div>
                    <span className="text-xs font-medium text-[#8E8FA3] mt-1 block">Non-Organic</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#F1F1F4] text-[11px] font-semibold text-[#8E8FA3] uppercase tracking-wider">
                Compared To Last 30 Days
              </div>
            </div>

            {/* Kartu 2: Installs */}
            <div className="col-span-12 lg:col-span-6 bg-white rounded-2xl p-6 border border-[#E8E8EE] shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-[#1E1F31]">Installs</h2>
                    <p className="text-xs text-[#8E8FA3] mt-0.5">
                      To put in place or connect for service or use.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6">
                  {/* Organic Installs */}
                  <div className="p-4 rounded-xl bg-[#F8F9FD] border border-[#ECECF3]">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-extrabold text-[#1E1F31]">45.2k</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-[#8E8FA3]">
                        0%
                      </span>
                    </div>
                    <span className="text-xs font-medium text-[#8E8FA3] mt-1 block">Organic</span>
                  </div>

                  {/* Non-Organic */}
                  <div className="p-4 rounded-xl bg-[#F8F9FD] border border-[#ECECF3]">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-extrabold text-[#1E1F31]">36.4k</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#E4F8DD] text-[#27AE60]">
                        12%
                      </span>
                    </div>
                    <span className="text-xs font-medium text-[#8E8FA3] mt-1 block">Non-Organic</span>
                  </div>

                  {/* 0% Organic Sub-Metric */}
                  <div className="p-4 rounded-xl bg-[#F8F9FD] border border-[#ECECF3]">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-extrabold text-[#1E1F31]">0%</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#E4F8DD] text-[#27AE60]">
                        13%
                      </span>
                    </div>
                    <span className="text-xs font-medium text-[#8E8FA3] mt-1 block">Organic</span>
                  </div>

                  {/* Fraudulent */}
                  <div className="p-4 rounded-xl bg-[#F8F9FD] border border-[#ECECF3]">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-extrabold text-[#1E1F31]">14.6k</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#E4F8DD] text-[#27AE60]">
                        16%
                      </span>
                    </div>
                    <span className="text-xs font-medium text-[#8E8FA3] mt-1 block">Fraudulent</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#F1F1F4] text-[11px] font-semibold text-[#8E8FA3] uppercase tracking-wider">
                Compared To Last 30 Days
              </div>
            </div>
          </div>

          {/* BARIS 2: GEOGRAPHICAL DISTRIBUTION (WORLD MAP + TOP COUNTRIES) */}
          <div className="bg-white rounded-2xl p-6 border border-[#E8E8EE] shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#F1F1F4] gap-4">
              <h2 className="text-lg font-bold text-[#1E1F31]">Geographical Distribution</h2>

              {/* Selector Tabs: Clicks | Organic Installs | Non-Organic Installs */}
              <div className="inline-flex p-1 bg-[#F1F1F4] rounded-xl text-xs font-medium">
                {(['Clicks', 'Organic Installs', 'Non-Organic Installs'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setGeoTab(tab)}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      geoTab === tab
                        ? 'bg-white text-[#1E1F31] font-bold shadow-xs'
                        : 'text-[#8E8FA3] hover:text-[#1E1F31]'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-12 gap-8 mt-6">
              {/* Sisi Kiri: Vector World Map & 3 Ringkasan Metrik */}
              <div className="col-span-12 lg:col-span-7 flex flex-col justify-between">
                <WorldMapSvg activeMetric={geoTab} />

                <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-[#F1F1F4]">
                  <div>
                    <span className="text-xl font-bold text-[#1E1F31]">25,344</span>
                    <span className="text-xs font-medium text-[#8E8FA3] block mt-0.5">Viewed</span>
                  </div>
                  <div>
                    <span className="text-xl font-bold text-[#1E1F31]">21,887</span>
                    <span className="text-xs font-medium text-[#8E8FA3] block mt-0.5">Dropouts</span>
                  </div>
                  <div>
                    <span className="text-xl font-bold text-[#1E1F31]">12,834</span>
                    <span className="text-xs font-medium text-[#8E8FA3] block mt-0.5">Responses</span>
                  </div>
                </div>
              </div>

              {/* Sisi Kanan: Daftar 5 Negara dengan Bar Persentase */}
              <div className="col-span-12 lg:col-span-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-[#F1F1F4] text-xs font-semibold text-[#8E8FA3] uppercase tracking-wider">
                    <span>Countries</span>
                    <span>Responses</span>
                  </div>

                  <div className="divide-y divide-[#F8F9FA] mt-1 space-y-3">
                    {[
                      { name: 'India', responses: '14,230', pct: 50.61, color: 'bg-[#6C5DD3]' },
                      { name: 'United States', responses: '8,210', pct: 26.21, color: 'bg-[#3F8CFF]' },
                      { name: 'United Kingdom', responses: '3,540', pct: 12.44, color: 'bg-[#3F8CFF]' },
                      { name: 'Greenland', responses: '1,782', pct: 6.61, color: 'bg-[#8E8FA3]' },
                      { name: 'Australia', responses: '1,054', pct: 4.61, color: 'bg-[#8E8FA3]' },
                    ].map((c) => (
                      <div key={c.name} className="pt-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-[#1E1F31] flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-current opacity-80" />
                            {c.name}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-[#1E1F31]">{c.responses}</span>
                            <span className="text-xs font-medium text-[#8E8FA3] w-12 text-right">
                              {c.pct}%
                            </span>
                          </div>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full h-1.5 bg-[#F1F1F4] rounded-full mt-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${c.color}`}
                            style={{ width: `${c.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* BARIS 3: BREAKDOWN BY MEDIA SOURCE TABLE */}
          <div className="bg-white rounded-2xl p-6 border border-[#E8E8EE] shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#1E1F31]">Breakdown By Media Source</h2>
              <button className="flex items-center gap-1.5 px-3 py-1 bg-white border border-[#E8E8EE] rounded-lg text-xs font-semibold text-[#8E8FA3] hover:text-[#1E1F31] transition-colors shadow-2xs">
                <span>Compared To Last 30 Days</span>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E8E8EE] text-[11px] font-semibold text-[#8E8FA3] uppercase tracking-wider">
                    <th className="py-3 px-4">Media Source</th>
                    <th className="py-3 px-4">Clicks</th>
                    <th className="py-3 px-4">Installs</th>
                    <th className="py-3 px-4">Impressions</th>
                    <th className="py-3 px-4">Click To Install</th>
                    <th className="py-3 px-4">Rejected Installs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F1F4] text-[#1E1F31]">
                  {[
                    { source: 'Demo Partner', clicks: '5.41k', installs: '1.24k', impressions: '18.2k', c2i: '22.9%', rejected: '0%' },
                    { source: 'Google Ads Search', clicks: '12.8k', installs: '3.10k', impressions: '45.0k', c2i: '24.2%', rejected: '1.2%' },
                    { source: 'Meta Audience Network', clicks: '8.60k', installs: '1.95k', impressions: '28.4k', c2i: '22.6%', rejected: '0.8%' },
                    { source: 'Apple Search Ads', clicks: '4.20k', installs: '1.15k', impressions: '14.1k', c2i: '27.3%', rejected: '0.1%' },
                  ].map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#F9F9FB] transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-[#1E1F31] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#6C5DD3]" />
                        {row.source}
                      </td>
                      <td className="py-3.5 px-4 font-medium">{row.clicks}</td>
                      <td className="py-3.5 px-4 font-medium">{row.installs}</td>
                      <td className="py-3.5 px-4 font-medium">{row.impressions}</td>
                      <td className="py-3.5 px-4 font-medium">{row.c2i}</td>
                      <td className="py-3.5 px-4 font-medium">{row.rejected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
};
export default InsightTracerDashboard;
