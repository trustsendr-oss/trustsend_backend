import { defaultLightTheme, defaultDarkTheme } from 'react-admin'
import { deepmerge } from '@mui/utils'

const shape = { borderRadius: 10 }

const typography = {
  fontFamily: [
    '"Inter"',
    '-apple-system',
    'BlinkMacSystemFont',
    '"Segoe UI"',
    'Roboto',
    'sans-serif',
  ].join(','),
  h6: { fontWeight: 700 },
  button: { textTransform: 'none' as const, fontWeight: 600 },
}

const componentOverrides = {
  MuiAppBar: {
    styleOverrides: {
      root: {
        boxShadow: 'none',
        borderBottom: '1px solid',
      },
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: {
        backgroundImage: 'none',
      },
      elevation1: {
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)',
      },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        borderRadius: 14,
      },
    },
  },
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: 8,
      },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: {
        borderRadius: 6,
      },
    },
  },
  RaMenuItemLink: {
    styleOverrides: {
      root: {
        borderRadius: 8,
        marginInline: 8,
        marginBlock: 2,
        width: 'auto',
      },
    },
  },
}

export const lightTheme = deepmerge(defaultLightTheme, {
  palette: {
    mode: 'light',
    primary: { main: '#020D30', contrastText: '#ffffff' },
    secondary: { main: '#1e46d1' },
    background: { default: '#F5F6FA', paper: '#FFFFFF' },
    success: { main: '#16A34A' },
    warning: { main: '#D97706' },
    error: { main: '#DC2626' },
  },
  shape,
  typography,
  components: componentOverrides,
})

export const darkTheme = deepmerge(defaultDarkTheme, {
  palette: {
    mode: 'dark',
    primary: { main: '#020D30' },
    secondary: { main: '#1e46d1' },
    background: { default: '#0F1117', paper: '#161923' },
    success: { main: '#4ADE80' },
    warning: { main: '#FBBF24' },
    error: { main: '#F87171' },
  },
  shape,
  typography,
  components: componentOverrides,
})
