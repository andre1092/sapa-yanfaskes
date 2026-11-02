import { ToggleButton, ToggleButtonGroup, Typography, Box } from '@mui/material';
import { useThemeStore, type ThemeMode } from '../store/themeStore';
import { useLanguageStore } from '../store/languageStore';
interface ThemeToggleProps { variant?: 'compact' | 'expanded'; className?: string; }
export function ThemeToggle({ variant = 'compact', className = '' }: ThemeToggleProps) {
 const { theme, effectiveTheme, setTheme } = useThemeStore(); const { t } = useLanguageStore();
 const options: { mode: ThemeMode; label: string }[] = [{mode:'light',label:t('theme_light')},{mode:'dark',label:t('theme_dark')},{mode:'system',label:t('theme_system')}];
 return <ToggleButtonGroup exclusive value={theme} onChange={(_event, next: ThemeMode | null) => {if(next) setTheme(next);}}
  aria-label="Pemilih Tema" className={className} color="secondary" sx={{ display:'flex', flexWrap:'wrap', width: variant==='expanded'?'100%':undefined, gap:1 }}>
  {options.map(option => <ToggleButton key={option.mode} value={option.mode} aria-label={option.label} sx={{ flex:variant==='expanded'?1:undefined, minHeight:44, textTransform:'none', borderRadius:2, textAlign:'left', p:variant==='expanded'?2:1 }}>
   <Box><Typography component="span" variant="body1" fontWeight={500}>{option.label}</Typography>{variant==='expanded'&&<Typography component="span" display="block" variant="caption" color="text.secondary">{option.mode==='system'?`Otomatis (${effectiveTheme==='dark'?'gelap':'terang'})`:`Tema ${option.label.toLowerCase()}`}</Typography>}</Box>
  </ToggleButton>)}
 </ToggleButtonGroup>;
}
