import type { MouseEvent, ReactNode } from 'react';
import './FloatingSidebar.css';

export interface FloatingSidebarProps {
  sections: { label: string; items: string[][] }[];
  routes: Record<string, string>;
  activeMenu: string;
  onNavigate: (key: string) => void;
  userName: string;
  userRole: string;
  dark: boolean;
  onToggleTheme: (event?: MouseEvent<HTMLButtonElement>) => void;
  onLogout: () => void;
  onSearch: () => void;
  mobile: boolean;
  onClose: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  renderIcon: (key: string) => ReactNode;
}

function ActionIcon({ name }: { name: 'sun' | 'moon' | 'search' | 'pin' | 'logout' | 'close' }) {
  const paths: Record<typeof name, ReactNode> = {
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
    moon: <path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    pin: <><path d="m9 3 10 10-4 1-3 5-7-7 5-3-1-6Z" /><path d="m8 16-5 5" /></>,
    logout: <><path d="M10 4H4v16h6m4-12 4 4-4 4m-5-4h12" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function FloatingSidebar(props: FloatingSidebarProps) {
  const initials = props.userName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'S';
  const navigate = (event: MouseEvent<HTMLAnchorElement>, key: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    props.onNavigate(key);
    if (props.mobile) props.onClose();
  };
  const renderItem = ([key, label]: string[]) => {
    if (!key) return null;
    const text = label || key;
    const href = props.routes[key] || `/${key.toLowerCase().replace(/\s+/g, '-')}`;
    return <a key={key} className="sapa-sidebar-item" href={href} title={text} aria-label={text} aria-current={props.activeMenu === key ? 'page' : undefined} onClick={event => navigate(event, key)}>
      <span className="sapa-sidebar-icon">{props.renderIcon(key)}</span>
      <span className="sapa-sidebar-reveal sapa-sidebar-item-label">{text}</span>
    </a>;
  };
  return <aside id="workspace-navigation" className="sapa-floating-sidebar" data-theme={props.dark ? 'dark' : 'light'} data-mobile={props.mobile} data-pinned={props.pinned} aria-label="Navigasi ruang kerja">
    <div className="sapa-sidebar-profile">
      <span className="sapa-sidebar-avatar" aria-hidden="true">{initials}</span>
      <div className="sapa-sidebar-reveal sapa-sidebar-profile-details"><p className="sapa-sidebar-name">{props.userName}</p><p className="sapa-sidebar-role">{props.userRole}</p></div>
      {props.mobile && <button type="button" className="sapa-sidebar-close" onClick={props.onClose} aria-label="Tutup navigasi" title="Tutup navigasi"><ActionIcon name="close" /></button>}
    </div>
    <button type="button" className="sapa-sidebar-search" onClick={props.onSearch} aria-label="Cari menu" title="Cari menu"><span className="sapa-sidebar-reveal">Cari menu...</span><span className="sapa-sidebar-search-icon"><ActionIcon name="search" /></span></button>
    <nav className="sapa-sidebar-navigation" aria-label="Menu utama">
      {props.sections.map(section => <section className="sapa-sidebar-group" key={section.label} aria-label={section.label}><h2 className="sapa-sidebar-group-label sapa-sidebar-reveal">{section.label}</h2>{section.items.map(renderItem)}</section>)}
    </nav>
    <div className="sapa-sidebar-actions" aria-label="Tindakan akun">
      <button type="button" className="sapa-sidebar-action" onClick={props.onToggleTheme} aria-label={props.dark ? 'Gunakan tema terang' : 'Gunakan tema gelap'} title={props.dark ? 'Gunakan tema terang' : 'Gunakan tema gelap'} aria-pressed={props.dark}><ActionIcon name={props.dark ? 'sun' : 'moon'} /></button>
      <button type="button" className="sapa-sidebar-action" onClick={props.onSearch} aria-label="Cari menu" title="Cari menu"><ActionIcon name="search" /></button>
      {props.mobile
        ? <button type="button" className="sapa-sidebar-action" onClick={props.onClose} aria-label="Tutup navigasi" title="Tutup navigasi"><ActionIcon name="close" /></button>
        : <button type="button" className="sapa-sidebar-action" onClick={props.onTogglePin} aria-label="Sematkan navigasi" title={props.pinned ? 'Lepas sematan navigasi' : 'Sematkan navigasi'} aria-pressed={props.pinned}><ActionIcon name="pin" /></button>}
      <button type="button" className="sapa-sidebar-action sapa-sidebar-logout" onClick={props.onLogout} aria-label="Keluar" title="Keluar"><ActionIcon name="logout" /></button>
    </div>
  </aside>;
}
