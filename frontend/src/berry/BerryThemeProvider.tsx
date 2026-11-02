// Berry Free theme architecture adapted for SAPA. MIT: LICENSE.berry.txt.
import { useMemo, useLayoutEffect, type ReactNode } from 'react';
import { createTheme, ThemeProvider, StyledEngineProvider, alpha } from '@mui/material/styles';
import { CssBaseline, GlobalStyles } from '@mui/material';
import colors from './colors';
import typography from './typography';
import { useThemeStore } from '../store/themeStore';

export function BerryThemeProvider({ children }: { children: ReactNode }) {
  const mode = useThemeStore(state => state.effectiveTheme);
  const theme = useMemo(() => {
    const dark = mode === 'dark';
    return createTheme({
      palette: {
        mode,
        primary: { main: dark ? colors.primary200 : colors.primary800, light: dark ? colors.darkLevel2 : colors.primaryLight, dark: colors.primary800 },
        secondary: { main: dark ? colors.darkSecondary200 : colors.secondaryMain, light: dark ? colors.darkLevel1 : colors.secondaryLight, dark: colors.secondary800 },
        background: { default: dark ? colors.darkBackground : colors.grey100, paper: dark ? colors.darkPaper : colors.paper },
        text: { primary: dark ? colors.darkTextTitle : colors.grey900, secondary: dark ? colors.darkTextPrimary : colors.grey600 },
        divider: dark ? colors.darkLevel1 : colors.grey200,
        success: { main: dark ? '#69f0ae' : '#167747' },
        warning: { main: dark ? colors.warningMain : '#8c5700' },
        error: { main: dark ? colors.errorLight : colors.errorDark },
      },
      shape: { borderRadius: 12 },
      typography: typography('Poppins, sans-serif'),
      transitions: { duration: { shortest: 120, shorter: 160, short: 180, standard: 220, enteringScreen: 240, leavingScreen: 180 } },
      components: {
        MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 8, minHeight: 44, textTransform: 'none', fontWeight: 500, transition: 'transform 140ms ease, background-color 140ms ease', '&:active': { transform: 'scale(.97)' } } } },
        MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44, borderRadius: 8 } } },
        MuiCard: { styleOverrides: { root: { borderRadius: 12, boxShadow: 'none', backgroundImage: 'none', minWidth: 0 } } },
        MuiCardHeader: { styleOverrides: { root: { padding: 24 }, action: { margin: 0, alignSelf: 'center' } } },
        MuiCardContent: { styleOverrides: { root: { padding: 24, '&:last-child': { paddingBottom: 24 } } } },
        MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 8, minHeight: 44 }, input: { padding: '12px 14px', fontSize: '0.8125rem' }, notchedOutline: { borderColor: dark ? colors.darkLevel1 : colors.grey300 } } },
        MuiInputLabel: { styleOverrides: { root: { fontSize: '0.875rem' } } },
        MuiTableCell: { styleOverrides: { root: { padding: '14px 16px', borderColor: dark ? colors.darkLevel1 : colors.grey200, fontSize: '0.8125rem' }, head: { fontWeight: 600, backgroundColor: dark ? colors.darkLevel2 : colors.grey50 } } },
        MuiDialog: { styleOverrides: { paper: { borderRadius: 12, backgroundImage: 'none' } } },
        MuiListItemButton: { styleOverrides: { root: { borderRadius: 8, minHeight: 46, '&.Mui-selected': { backgroundColor: dark ? alpha(colors.secondary200, .16) : colors.secondaryLight, color: dark ? colors.secondary200 : colors.secondaryDark } } } },
        MuiTab: { styleOverrides: { root: { textTransform: 'none', minHeight: 48, fontWeight: 500 } } },
      },
    });
  }, [mode]);
  const p = theme.palette;
  const variables = {
      '--bpjs-navy': p.primary.main, '--bpjs-green': p.secondary.main, '--bpjs-mint-light': mode === 'dark' ? colors.darkLevel1 : colors.secondaryLight,
      '--bpjs-soft-blue': colors.primaryLight, '--bpjs-sage': colors.secondary200, '--bpjs-mint-white': p.background.paper, '--bpjs-slate-blue': p.text.secondary,
      '--nav-bg': mode === 'dark' ? colors.secondary800 : colors.secondaryDark, '--nav-fg': '#ffffff', '--nav-muted': '#ede7f6', '--brand-on-dark': '#ffffff', '--on-brand': '#ffffff',
      '--surface': p.background.paper, '--bg-main': p.background.default, '--panel-bg': p.background.paper, '--card-bg': p.background.paper,
      '--text-main': p.text.primary, '--text-muted': p.text.secondary, '--panel-border': p.divider, '--border-color': p.divider, '--card-border': p.divider,
      '--input-bg': p.background.paper, '--input-border': mode === 'dark' ? colors.darkLevel1 : colors.grey300, '--input-text': p.text.primary,
      '--surface-subtle': mode === 'dark' ? colors.darkLevel2 : colors.grey50,
      '--accent-soft': mode === 'dark' ? alpha(colors.secondary200, .14) : colors.secondaryLight,
      '--surface-accent': mode === 'dark' ? alpha(colors.primary200, .12) : colors.primaryLight,
      '--accent-text': p.secondary.main, '--focus-ring': p.primary.main,
      '--on-primary': p.getContrastText(p.primary.main), '--action-on-primary': p.getContrastText(p.secondary.main), '--action-primary': p.secondary.main, '--danger': p.error.main, '--danger-soft': mode === 'dark' ? '#3b2538' : '#fff0f0',
      '--warning': p.warning.main, '--warning-soft': mode === 'dark' ? '#3a3040' : '#fff8e1', '--info': p.primary.main, '--warning-text': p.warning.main, '--success': p.success.main, '--font-sans': theme.typography.fontFamily,
      '--panel-shadow': 'none', '--card-shadow': 'none', '--radius-panel': '12px', '--radius-control': '8px',
      '--space-page': '24px', '--berry-blue': p.primary.main, '--berry-purple': p.secondary.main,
    };
  useLayoutEffect(() => {
    for (const [key, value] of Object.entries(variables)) document.documentElement.style.setProperty(key, String(value));
  }, [theme]);
  return <StyledEngineProvider injectFirst><ThemeProvider theme={theme}><CssBaseline /><GlobalStyles styles={{
    body: { fontFamily: theme.typography.fontFamily, backgroundColor: p.background.paper },
    '@media (prefers-reduced-motion: reduce)': { '*, *::before, *::after': { animation: 'none !important', transitionDuration: '.01ms !important', scrollBehavior: 'auto !important' } },
  }} />{children}</ThemeProvider></StyledEngineProvider>;
}
