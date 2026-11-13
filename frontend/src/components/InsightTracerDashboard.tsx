import React, { Suspense, useState, useEffect, useRef } from 'react';
import { AppBar, Avatar, Box, Button, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Paper, Stack, TextField, Toolbar, Typography, useMediaQuery, useTheme } from '@mui/material';
import { IconMenu2, IconSearch, IconSun, IconMoon, IconX } from '@tabler/icons-react';
import { resilientLazy } from '../lib/resilientLazy';
import { KerangkaMemuat } from './ui/KerangkaMemuat';
import { AdminDialog } from './AdminDialog';
import { AnimatedButton } from './ui/AnimatedButton';
import { FloatingSidebar } from './ui/FloatingSidebar';
import { HeroUIAssistant } from './HeroUIAssistant';
import { useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';
import { menuBoleh } from '../lib/izinPeran';
import { namaTampilan, peranTampilan } from '../lib/namaTampilan';

const ROUTE_MAP: Record<string, string> = {
  '/monitoring-laras': 'Monitoring LARAS',
  '/laras': 'Monitoring LARAS',
  '/kepatuhanfkrtl': 'Capaian Kepatuhan FKRTL',
  '/kepatuhan-fkrtl': 'Capaian Kepatuhan FKRTL',
  '/antrolfkrtl': 'Pemanfaatan Antrol FKRTL',
  '/antrol-fkrtl': 'Pemanfaatan Antrol FKRTL',
  '/kepatuhanfktp': 'Capaian Kepatuhan FKTP',
  '/kepatuhan-fktp': 'Capaian Kepatuhan FKTP',
  '/integration': 'Integration',
  '/logs': 'Logs',
  '/validation-rules': 'Validation Rules',
  '/home': 'Home',
  '/': 'Capaian Kepatuhan FKRTL',
};

const MENU_TO_ROUTE: Record<string, string> = {
  'Monitoring LARAS': '/monitoring-laras',
  'Capaian Kepatuhan FKRTL': '/kepatuhanfkrtl',
  'Pemanfaatan Antrol FKRTL': '/antrolfkrtl',
  'Capaian Kepatuhan FKTP': '/kepatuhanfktp',
  'Integration': '/integration',
  'Logs': '/logs',
  'Validation Rules': '/validation-rules',
  'Home': '/home',
};

const getMenuFromCurrentPath = (): string => {
  if (typeof window === 'undefined') return 'Capaian Kepatuhan FKRTL';
  const path = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  if (path.includes('kepatuhanfkrtl') || path.includes('kepatuhan-fkrtl')) {
    return 'Capaian Kepatuhan FKRTL';
  }
  return ROUTE_MAP[path] || 'Capaian Kepatuhan FKRTL';
};


const sections = [
  { label: 'Pemantauan', items: [['Home', 'Beranda'], ['Pemanfaatan Antrol FKRTL', 'Antrean online FKRTL'], ['Capaian Kepatuhan FKTP', 'Antrean online FKTP'], ['Monitoring LARAS', 'Monitoring LARAS']] },
  { label: 'Laporan', items: [['Capaian Kepatuhan FKRTL', 'Kepatuhan FKRTL']] },
  { label: 'Administrasi', items: [['Integration', 'Integrasi data'], ['Logs', 'Log aktivitas'], ['Validation Rules', 'Pengaturan']] },
];
const labelFor = (menu: string) => sections.flatMap(section => section.items).find(([key]) => key === menu)?.[1] || menu;

const navPaths: Record<string, string> = {
  'Monitoring LARAS': 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  Home: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  'Pemanfaatan Antrol FKRTL': 'M4 6h16M4 12h10M4 18h6m7-4 4 4-4 4',
  'Capaian Kepatuhan FKRTL': 'M4 21V7h16v14M9 7V3h6v4M9 12h6m-3-3v6M8 21v-3h8v3',
  'Capaian Kepatuhan FKTP': 'M4 20h16M7 16v-5m5 5V4m5 12V8',
  User: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m14-17a4 4 0 0 1 0 8m6 9v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  Logs: 'M12 8v4l3 2M3 12a9 9 0 1 0 3-6.7M3 3v5h5',
  Integration: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2m3 6a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  'Validation Rules': 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7Zm-4 9 3 3 5-6',
};
// Halaman dimuat saat dibuka, bukan semuanya di muatan pertama (audit UI/UX 2026-11-12, temuan 13).
const LaporanKepatuhanDashboard = resilientLazy(() => import('./LaporanKepatuhanDashboard').then(m => ({ default: m.LaporanKepatuhanDashboard })));
const PemanfaatanAntrolDashboard = resilientLazy(() => import('./PemanfaatanAntrolDashboard').then(m => ({ default: m.PemanfaatanAntrolDashboard })));
const FktpAntrolDashboard = resilientLazy(() => import('./FktpAntrolDashboard').then(m => ({ default: m.FktpAntrolDashboard })));
const MonitoringLarasDashboard = resilientLazy(() => import('./MonitoringLarasDashboard').then(m => ({ default: m.MonitoringLarasDashboard })));
const AuditLogView = resilientLazy(() => import('./AuditLogView').then(m => ({ default: m.AuditLogView })));
const DataIntegrationView = resilientLazy(() => import('./DataIntegrationView').then(m => ({ default: m.DataIntegrationView })));
const AdminSettings = resilientLazy(() => import('./AdminSettings').then(m => ({ default: m.AdminSettings })));

const NavIcon = ({ name }: { name: string }) => <svg className="sapa-nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={navPaths[name] || navPaths.Home} /></svg>;

export const InsightTracerDashboard: React.FC = () => {
  const { user, logoutUser } = useAuthStore();
  const sectionsBoleh = sections.map(section => ({ ...section, items: section.items.filter(([key]) => menuBoleh(key, user?.role)) })).filter(section => section.items.length > 0);
  const { effectiveTheme, setTheme } = useThemeStore();
  const nama = namaTampilan(user);
  const peran = peranTampilan(user?.role);
  const [activeMenu, setActiveMenu] = useState(getMenuFromCurrentPath);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState('');
  const menuResults = sectionsBoleh.flatMap(section => section.items.map(([key, label]) => ({ key, label, group: section.label }))).filter(item => `${item.label} ${item.group}`.toLocaleLowerCase('id').includes(menuQuery.trim().toLocaleLowerCase('id')));
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('lg'));
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handlePopState = () => { setActiveMenu(getMenuFromCurrentPath()); setMobileMenuOpen(false); };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  useEffect(() => {
    const query = window.matchMedia(theme.breakpoints.up('lg').replace('@media ', ''));
    const closeMobileDrawer = () => { if (query.matches) setMobileMenuOpen(false); };
    query.addEventListener('change', closeMobileDrawer);
    return () => query.removeEventListener('change', closeMobileDrawer);
  }, [theme]);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !mobileMenuOpen && !showLogoutModal) { event.preventDefault(); setSearchOpen(open => !open); }
    };
    document.addEventListener('keydown', onShortcut);
    return () => document.removeEventListener('keydown', onShortcut);
  }, [mobileMenuOpen, showLogoutModal]);
  useEffect(() => {
    if (!searchOpen) return;
    const frame = requestAnimationFrame(() => document.getElementById('menu-search')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [searchOpen]);
  const previousMenu = useRef(activeMenu);
  useEffect(() => {
    if (previousMenu.current === activeMenu) return;
    previousMenu.current = activeMenu;
    const frame = requestAnimationFrame(() => document.getElementById('workspace-content')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [activeMenu]);
  const handleMenuSelect = (menuName: string) => {
    setActiveMenu(menuName);
    setSearchOpen(false);
    setMenuQuery('');
    setMobileMenuOpen(false);
    if (typeof window !== 'undefined') {
      const targetPath = MENU_TO_ROUTE[menuName] || `/${menuName.toLowerCase().replace(/\s+/g, '-')}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ menu: menuName }, '', targetPath);
      }
    }
  };


  const navigation = <FloatingSidebar
    sections={sectionsBoleh} routes={MENU_TO_ROUTE}
    activeMenu={activeMenu} onNavigate={handleMenuSelect}
    userName={nama} userRole={peran}
    dark={effectiveTheme === 'dark'} onToggleTheme={() => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')}
    onLogout={() => { setMobileMenuOpen(false); setShowLogoutModal(true); }}
    onSearch={() => { setMobileMenuOpen(false); setSearchOpen(true); }}
    mobile={!desktop} onClose={() => setMobileMenuOpen(false)}
    pinned={sidebarPinned} onTogglePin={() => setSidebarPinned(value => !value)} renderIcon={name => <NavIcon name={name} />}
  />;

  return <Box className="berry-shell sapa-reference-shell" data-sidebar-pinned={sidebarPinned} sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'background.paper' }}>
    <a href="#workspace-content" className="skip-link">Langsung ke konten</a>
    <AppBar enableColorOnDark position="fixed" color="inherit" elevation={0} sx={{ bgcolor: 'background.paper', zIndex: theme.zIndex.appBar, left: { xs: 0, lg: sidebarPinned ? 312 : 132 }, width: { xs: '100%', lg: `calc(100% - ${sidebarPinned ? 312 : 132}px)` }, transition: 'left 220ms ease, width 220ms ease' }}>
      <Toolbar sx={{ minHeight: { xs: 72, lg: 88 }, gap: 2, px: { xs: 2, lg: 3 } }}>
        <Box sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', gap: 1.5, flexShrink: 0 }}><Box component="img" src="/logo-sapa-yanfaskes-128.png" alt="" sx={{ width: 42, height: 42 }} /><Box><Typography variant="h4" component="p">SAPA Yanfaskes</Typography><Typography variant="caption" color="text.secondary">BPJS Kesehatan</Typography></Box></Box>
        <IconButton aria-label="Buka navigasi" aria-expanded={mobileMenuOpen} aria-controls="workspace-navigation" onClick={() => setMobileMenuOpen(true)} sx={{ display: { lg: 'none' }, bgcolor: 'secondary.light', color: 'secondary.main', borderRadius: 2 }}><IconMenu2 size={20} /></IconButton>
        <Button aria-label="Cari menu" onClick={() => setSearchOpen(true)} startIcon={<IconSearch size={20} />} color="inherit" sx={{ bgcolor: 'background.default', color: 'text.secondary', border: 1, borderColor: 'divider', minWidth: { xs: 0, sm: 200 }, justifyContent: 'flex-start', display: { xs: 'none', sm: 'inline-flex' } }}>Cari menu<Typography component="kbd" variant="caption" sx={{ ml: 'auto' }}>⌘ K</Typography></Button>
        <Box sx={{ flexGrow: 1 }} />
        <IconButton aria-label="Cari menu" onClick={() => setSearchOpen(true)} sx={{ display: { sm: 'none' } }}><IconSearch size={20} /></IconButton>
        <IconButton aria-label={effectiveTheme === 'dark' ? 'Aktifkan tema terang' : 'Aktifkan tema gelap'} onClick={() => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')} sx={{ color: 'secondary.main', bgcolor: 'secondary.light', borderRadius: 2 }}>{effectiveTheme === 'dark' ? <IconSun size={20} /> : <IconMoon size={20} />}</IconButton>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: 'background.default', borderRadius: 6, py: 0.5, pl: 0.5, pr: { xs: 0.5, sm: 2 } }}><Avatar sx={{ bgcolor: 'secondary.light', color: 'secondary.main' }}>{nama.slice(0, 1).toUpperCase()}</Avatar><Box sx={{ display: { xs: 'none', md: 'block' } }}><Typography variant="subtitle2">{nama}</Typography><Typography variant="caption" color="text.secondary">{peran}</Typography></Box></Box>
      </Toolbar>
    </AppBar>
    {desktop ? navigation : <Drawer variant="temporary" open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} slotProps={{ paper: { sx: { width: 'min(264px, 100vw)', border: 0, bgcolor: 'transparent', backgroundImage: 'none', boxShadow: 'none' } } }}>{navigation}</Drawer>}
    <Box ref={mainRef} className="berry-workspace" sx={{ flex: 1, minWidth: 0, mt: { xs: 9, lg: 11 }, mr: { xs: 1, sm: 2.5 }, ml: { xs: 1, lg: sidebarPinned ? '312px' : '132px' }, transition: 'margin-left 220ms ease', mb: 0, bgcolor: 'background.default', borderRadius: 'var(--radius-panel, 12px) var(--radius-panel, 12px) 0 0', p: { xs: 2, sm: 2.5 } }}>
      <Box sx={{ mb: 2.5 }}><Typography variant="caption" component="p" color="text.secondary">Ruang kerja / {sections.find(section => section.items.some(([key]) => key === activeMenu))?.label || 'Modul'} / {labelFor(activeMenu)}</Typography></Box>
      <main id="workspace-content" tabIndex={-1} key={activeMenu} className="berry-canvas">
        <Suspense fallback={<KerangkaMemuat label={`Memuat ${labelFor(activeMenu)}`} />}>
        {!menuBoleh(activeMenu, user?.role) ? <Paper component="section" elevation={0} sx={{ p: 4, borderRadius: 3 }}><Typography variant="h2" component="h1" sx={{ mb: 2 }}>{labelFor(activeMenu)}</Typography><Typography color="text.secondary">Akun Anda tidak memiliki izin untuk membuka menu ini.</Typography></Paper> : activeMenu === 'Monitoring LARAS' ? <MonitoringLarasDashboard /> : activeMenu === 'Capaian Kepatuhan FKRTL' ? <LaporanKepatuhanDashboard /> : activeMenu === 'Pemanfaatan Antrol FKRTL' ? <PemanfaatanAntrolDashboard /> : activeMenu === 'Capaian Kepatuhan FKTP' ? <FktpAntrolDashboard /> : activeMenu === 'Logs' ? <AuditLogView /> : activeMenu === 'Integration' ? <DataIntegrationView /> : activeMenu === 'Validation Rules' ? <AdminSettings /> : activeMenu === 'Home' ? <Box className="sapa-page berry-home">
          <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, mb: 3, borderRadius: 3, bgcolor: 'secondary.dark', color: 'common.white' }}>
            <Typography variant="overline" sx={{ color: 'inherit', opacity: 0.85 }}>Ruang kendali layanan</Typography>
            <Typography variant="h1" component="h1" sx={{ color: 'inherit', my: 2, maxWidth: '24ch', overflowWrap: 'anywhere' }}>Selamat datang, {nama.split(' ')[0]}</Typography>
            <Typography sx={{ maxWidth: '65ch', mb: 3 }}>Telusuri capaian fasilitas kesehatan dan temukan hal yang perlu mendapat perhatian.</Typography>
            <Button variant="contained" color="inherit" href="/kepatuhanfkrtl" onClick={event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); handleMenuSelect('Capaian Kepatuhan FKRTL'); } }} sx={{ bgcolor: 'background.paper', color: 'text.primary', boxShadow: 'none', '&:hover': { bgcolor: 'background.default' } }}>Buka kepatuhan FKRTL</Button>
          </Paper>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, mb: 3 }}>
            {[['Pemanfaatan Antrol FKRTL','Antrean online FKRTL','Pahami pemanfaatan antrean rumah sakit, dari fasilitas hingga poliklinik.'],['Capaian Kepatuhan FKTP','Antrean online FKTP','Tinjau pemanfaatan antrean online fasilitas kesehatan tingkat pertama.']].map(([key,label,description]) => <Paper key={key} elevation={0} sx={{ p: 3, borderRadius: 3 }}><Avatar variant="rounded" sx={{ bgcolor: 'primary.light', color: 'primary.dark', mb: 2 }}><NavIcon name={key} /></Avatar><Typography variant="h3" component="h2" sx={{ mb: 1 }}>{label}</Typography><Typography color="text.secondary" sx={{ mb: 2 }}>{description}</Typography><Button href={MENU_TO_ROUTE[key]} onClick={event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); handleMenuSelect(key); } }}>Buka laporan</Button></Paper>)}
          </Box>
          <Paper component="section" elevation={0} aria-label="Panduan membaca laporan" sx={{ p: 3, borderRadius: 3 }}><Typography variant="h3" component="h2" sx={{ mb: 3 }}>Alur pemantauan</Typography><Stack spacing={3} direction={{ xs: 'column', md: 'row' }}>{[['Pilih konteks','Tentukan periode dan fasilitas melalui filter laporan.'],['Telusuri capaian','Baca indikator bersama grafik dan rincian sumbernya.'],['Siapkan tindak lanjut','Gunakan hasil ekspor yang tersedia untuk pembahasan berikutnya.']].map(([title,description],index) => <Box key={title} sx={{ flex: 1 }}><Avatar sx={{ bgcolor: 'secondary.light', color: 'secondary.main', mb: 1.5 }}>{index + 1}</Avatar><Typography component="h3" variant="h4" sx={{ mb: 1 }}>{title}</Typography><Typography color="text.secondary" variant="body2">{description}</Typography></Box>)}</Stack></Paper>
        </Box> : <Paper component="section" elevation={0} sx={{ p: 4, borderRadius: 3 }}><Typography variant="h2" component="h1" sx={{ mb: 2 }}>{labelFor(activeMenu)}</Typography><Typography variant="h4" component="h2" sx={{ mb: 1 }}>Modul belum tersedia</Typography><Typography color="text.secondary" sx={{ mb: 3 }}>Modul ini belum memiliki data atau fungsi yang dapat digunakan.</Typography><Button variant="contained" onClick={() => handleMenuSelect('Home')}>Kembali ke beranda</Button></Paper>}

        </Suspense>
      </main>
    </Box>
    {searchOpen && <AdminDialog label="Cari menu" onClose={() => { setSearchOpen(false); setMenuQuery(''); }}><Box sx={{ p: { xs: 2, sm: 3 } }}><Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}><Typography component="h2" variant="h3">Cari menu</Typography><IconButton aria-label="Tutup pencarian" onClick={() => setSearchOpen(false)}><IconX size={20} /></IconButton></Stack><TextField fullWidth id="menu-search" label="Nama menu" type="search" value={menuQuery} onChange={event => setMenuQuery(event.target.value)} placeholder="Kepatuhan, antrean, integrasi…" autoComplete="off" /><Typography role="status" variant="caption" color="text.secondary" sx={{ display: 'block', my: 2 }}>{menuResults.length} menu ditemukan</Typography><List component="nav" aria-label="Hasil pencarian menu">{menuResults.map(item => <ListItemButton component="a" key={item.key} href={MENU_TO_ROUTE[item.key]} onClick={event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); handleMenuSelect(item.key); } }} sx={{ borderRadius: 2 }}><ListItemIcon><NavIcon name={item.key} /></ListItemIcon><ListItemText primary={item.label} secondary={item.group} /></ListItemButton>)}</List>{menuResults.length === 0 && <Typography color="text.secondary">Tidak ada menu yang cocok. Coba kata lain, seperti “kepatuhan”.</Typography>}</Box></AdminDialog>}
    {showLogoutModal && <AdminDialog label="Keluar dari SAPA?" onClose={() => setShowLogoutModal(false)}><div className="sapa-dialog"><p className="sapa-eyebrow">AKUN PENGGUNA</p><h2 id="logout-title">Keluar dari SAPA?</h2><p id="logout-description" className="sapa-description">Sesi kerja Anda akan berakhir. Masuk kembali untuk melanjutkan pemantauan layanan.</p><div className="sapa-dialog-actions"><AnimatedButton className="sapa-button sapa-button-secondary" onClick={() => setShowLogoutModal(false)}>Batal</AnimatedButton><AnimatedButton className="sapa-button sapa-button-danger" onClick={() => {
                  logoutUser();
                  setShowLogoutModal(false);
}}>Keluar dari akun</AnimatedButton></div></div></AdminDialog>}
    <HeroUIAssistant onNavigate={handleMenuSelect} />
  </Box>;
};
