import { useState } from 'react';
import { Button, Menu, MenuItem, ListItemText } from '@mui/material';
import { useLanguageStore, type Language } from '../store/languageStore';
export function LanguageSwitcher({ className = '' }: { className?: string }) {
 const { language, setLanguage, t } = useLanguageStore();
 const [anchor, setAnchor] = useState<HTMLElement | null>(null);
 const languages: { code: Language; label: string }[] = [{code:'id',label:'Bahasa Indonesia'},{code:'en',label:'English'}];
 return <><Button className={className} onClick={event=>setAnchor(event.currentTarget)} aria-label={t('lang_select')} aria-haspopup="menu" aria-expanded={Boolean(anchor)} aria-controls={anchor?'sapa-language-menu':undefined} color="secondary">{language.toUpperCase()}</Button>
 <Menu id="sapa-language-menu" anchorEl={anchor} open={Boolean(anchor)} onClose={()=>setAnchor(null)}>{languages.map(item=><MenuItem key={item.code} selected={item.code===language} onClick={()=>{setLanguage(item.code);setAnchor(null);}}><ListItemText>{item.label}</ListItemText></MenuItem>)}</Menu></>;
}
