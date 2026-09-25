import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'id' | 'en';

export interface TranslationDictionary {
  // Navigation & Tabs
  nav_home: string;
  nav_fktp: string;
  nav_fktp_desc: string;
  nav_fkrtl: string;
  nav_fkrtl_desc: string;
  nav_antrol: string;
  nav_settings: string;
  nav_settings_desc: string;
  nav_logout: string;
  badge_primer: string;
  badge_rujukan: string;
  user_role: string;
  user_status: string;

  // Header & Badges
  header_app_tag: string;
  sso_active: string;
  zero_trust: string;
  bc_home: string;
  bc_fktp: string;
  bc_fkrtl: string;
  bc_antrol: string;
  bc_settings: string;
  title_home: string;
  sub_home: string;
  title_fktp: string;
  sub_fktp: string;
  title_fkrtl: string;
  sub_fkrtl: string;
  title_antrol: string;
  sub_antrol: string;
  title_settings: string;
  sub_settings: string;

  // Theme Toggle
  theme_light: string;
  theme_dark: string;
  theme_system: string;

  // Home Portal Overview
  home_badge: string;
  home_hero_title: string;
  home_hero_desc: string;
  home_cta_antrol: string;
  home_target_national: string;
  home_modules_heading: string;
  card1_title: string;
  card1_desc: string;
  card1_action: string;
  card1_status: string;
  card2_title: string;
  card2_desc: string;
  card2_action: string;
  card2_status: string;
  card3_title: string;
  card3_desc: string;
  card3_action: string;
  card3_status: string;
  std_heading: string;
  std_target_title: string;
  std_target_desc: string;
  std_cukup_title: string;
  std_cukup_desc: string;
  std_kanal_title: string;
  std_kanal_desc: string;

  // Language Dropdown
  lang_id: string;
  lang_en: string;
  lang_select: string;
}

export const translations: Record<Language, TranslationDictionary> = {
  id: {
    // Navigation & Tabs
    nav_home: 'Beranda',
    nav_fktp: 'FKTP',
    nav_fktp_desc: 'Pelayanan Primer',
    nav_fkrtl: 'FKRTL',
    nav_fkrtl_desc: 'Fasilitas Rujukan',
    nav_antrol: 'Pemanfaatan Antrol',
    nav_settings: 'Pengaturan',
    nav_settings_desc: 'Konfigurasi Sistem',
    nav_logout: 'Keluar',
    badge_primer: 'Primer',
    badge_rujukan: 'Rujukan',
    user_role: 'Verifikator BPJS',
    user_status: 'Online',

    // Header & Badges
    header_app_tag: 'SAPA YANFASKES',
    sso_active: 'SSO BPJS Aktif',
    zero_trust: 'Zero-Trust IAM',
    bc_home: 'Beranda / Overview',
    bc_fktp: 'Faskes Primer / FKTP',
    bc_fkrtl: 'Faskes Rujukan / FKRTL',
    bc_antrol: 'FKRTL / Pemanfaatan Antrol',
    bc_settings: 'Sistem / Pengaturan Admin',
    title_home: 'Portal Overview',
    sub_home: 'Selamat datang di Saluran Analisis Performa & Akselerasi Fasilitas Kesehatan',
    title_fktp: 'FKTP Dashboard',
    sub_fktp: 'Monitoring Kinerja & Pemanfaatan Fasilitas Kesehatan Tingkat Pertama',
    title_fkrtl: 'FKRTL Dashboard',
    sub_fkrtl: 'Monitoring Kinerja & Rujukan Fasilitas Kesehatan Rujukan Tingkat Lanjutan',
    title_antrol: 'Pemanfaatan Antrean Online FKRTL',
    sub_antrol: 'Monitoring & Analisis Pemanfaatan Antrol Terintegrasi Mobile JKN & Bridging RS',
    title_settings: 'Admin Settings',
    sub_settings: 'Manajemen Keamanan IAM, Database Context & Konfigurasi Sistem',

    // Theme Toggle
    theme_light: 'Terang',
    theme_dark: 'Gelap',
    theme_system: 'Sistem',

    // Home Portal Overview
    home_badge: 'Portal Analitik Resmi BPJS Kesehatan',
    home_hero_title: 'Saluran Analisis Performa & Akselerasi',
    home_hero_desc: 'Sistem terpadu monitoring dan evaluasi performa fasilitas kesehatan (FKTP & FKRTL) secara real-time. Terhubung langsung dengan basis data nasional BPJS Kesehatan dengan waktu respons berkecepatan tinggi sub-2-detik.',
    home_cta_antrol: 'Buka Dashboard Antrol FKRTL →',
    home_target_national: 'Target Nasional Antrol: ≥ 85%',
    home_modules_heading: 'Modul Layanan Fasilitas Kesehatan',
    card1_title: 'Pemanfaatan Antrol Online',
    card1_desc: 'Analisis rasio antrean online terbit via Mobile JKN dan Bridging RS terhadap total kunjungan SEP Rawat Jalan (RJTL).',
    card1_action: 'Analisis Data →',
    card1_status: 'Live Data Ready',
    card2_title: 'Monitoring Mutu FKTP',
    card2_desc: 'Pemantauan kinerja Puskesmas, Klinik Pratama, dan Dokter Praktik Mandiri dalam penerapan kontak pertama dan skrining kesehatan.',
    card2_action: 'Buka Modul →',
    card2_status: 'Puskesmas & Klinik',
    card3_title: 'Konfigurasi & Pengaturan',
    card3_desc: 'Sinkronisasi cache spreadsheet secara instan, pengelolaan tenant context, dan personalisasi tema visual sistem.',
    card3_action: 'Kelola Sistem →',
    card3_status: 'Zero-Trust Enabled',
    std_heading: 'Indikator Standar Mutu BPJS Kesehatan',
    std_target_title: 'Target Rasio Pemanfaatan',
    std_target_desc: 'Kepatuhan antrean digital terintegrasi Mobile JKN & Bridging',
    std_cukup_title: 'Kategori Cukup',
    std_cukup_desc: 'Perlu akselerasi sosialisasi pendaftaran via aplikasi',
    std_kanal_title: 'Kanal Integrasi Resmi',
    std_kanal_desc: 'Mobile JKN & Bridging Antrean RS Web Service',

    // Language Dropdown
    lang_id: 'Bahasa Indonesia',
    lang_en: 'English',
    lang_select: 'Pilih Bahasa',
  },
  en: {
    // Navigation & Tabs
    nav_home: 'Home',
    nav_fktp: 'Primary Care',
    nav_fktp_desc: 'Primary Facilities',
    nav_fkrtl: 'Referral Care',
    nav_fkrtl_desc: 'Referral Facilities',
    nav_antrol: 'Queue Utilization',
    nav_settings: 'Settings',
    nav_settings_desc: 'System Configuration',
    nav_logout: 'Log Out',
    badge_primer: 'Primary',
    badge_rujukan: 'Referral',
    user_role: 'BPJS Verifier',
    user_status: 'Online',

    // Header & Badges
    header_app_tag: 'SAPA YANFASKES',
    sso_active: 'BPJS SSO Active',
    zero_trust: 'Zero-Trust IAM',
    bc_home: 'Home / Overview',
    bc_fktp: 'Primary Care / FKTP',
    bc_fkrtl: 'Referral Care / FKRTL',
    bc_antrol: 'FKRTL / Queue Utilization',
    bc_settings: 'System / Admin Settings',
    title_home: 'Portal Overview',
    sub_home: 'Welcome to Health Facility Performance Analysis & Acceleration Channel',
    title_fktp: 'Primary Care Dashboard',
    sub_fktp: 'Performance & Utilization Monitoring of Primary Healthcare Facilities',
    title_fkrtl: 'Referral Care Dashboard',
    sub_fkrtl: 'Performance & Referral Monitoring of Advanced Referral Healthcare Facilities',
    title_antrol: 'FKRTL Online Queue Utilization',
    sub_antrol: 'Integrated Queue Monitoring & Analysis via Mobile JKN & Hospital Bridging',
    title_settings: 'Admin Settings',
    sub_settings: 'IAM Security Management, Database Context & System Configuration',

    // Theme Toggle
    theme_light: 'Light',
    theme_dark: 'Dark',
    theme_system: 'System',

    // Home Portal Overview
    home_badge: 'Official BPJS Kesehatan Analytics Portal',
    home_hero_title: 'Performance Analysis & Acceleration Channel',
    home_hero_desc: 'Integrated real-time performance monitoring and evaluation system for healthcare facilities (FKTP & FKRTL). Connected directly to BPJS Kesehatan national database with sub-2-second response latency.',
    home_cta_antrol: 'Open FKRTL Queue Dashboard →',
    home_target_national: 'National Queue Target: ≥ 85%',
    home_modules_heading: 'Healthcare Facility Service Modules',
    card1_title: 'Online Queue Utilization',
    card1_desc: 'Analysis of digital queues issued via Mobile JKN and Hospital Bridging against total Outpatient SEP visits.',
    card1_action: 'Analyze Data →',
    card1_status: 'Live Data Ready',
    card2_title: 'Primary Care Quality Monitoring',
    card2_desc: 'Performance monitoring of Community Health Centers, Clinics, and Independent Practitioners in primary contact and screening.',
    card2_action: 'Open Module →',
    card2_status: 'Centers & Clinics',
    card3_title: 'Configuration & Settings',
    card3_desc: 'Instant spreadsheet cache sync, tenant context management, and system visual personalization.',
    card3_action: 'Manage System →',
    card3_status: 'Zero-Trust Enabled',
    std_heading: 'BPJS Kesehatan Quality Standard Indicators',
    std_target_title: 'Utilization Ratio Target',
    std_target_desc: 'Digital queue compliance via integrated Mobile JKN & Bridging',
    std_cukup_title: 'Moderate Category',
    std_cukup_desc: 'Requires accelerated patient onboarding via Mobile application',
    std_kanal_title: 'Official Integration Channels',
    std_kanal_desc: 'Mobile JKN & Hospital Queue Bridging Web Service',

    // Language Dropdown
    lang_id: 'Bahasa Indonesia',
    lang_en: 'English',
    lang_select: 'Select Language',
  },
};

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof TranslationDictionary) => string;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      language: 'id',
      setLanguage: (language: Language) => {
        set({ language });
        if (typeof document !== 'undefined') {
          document.documentElement.lang = language;
        }
      },
      t: (key: keyof TranslationDictionary) => {
        const lang = get().language || 'id';
        return translations[lang]?.[key] || translations.id[key] || key;
      },
    }),
    {
      name: 'sapa-language-storage',
      partialize: (state) => ({ language: state.language }),
    }
  )
);
