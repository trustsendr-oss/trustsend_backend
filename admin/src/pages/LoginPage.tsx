import { useState } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import MailOutlineIcon from '@mui/icons-material/MailOutlineOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { useLogin, useNotify } from 'react-admin'
import { lightTheme } from '../theme/theme'

// theme.ts exporte des options (react-admin construit le thème lui-même) : ThemeProvider exige un
// thème construit.
const loginTheme = createTheme(lightTheme)

// Brand tokens — same values as the public site (trustsend_web/src/index.css) and theme.ts
const NAVY = '#020D30'
const ACCENT_LIGHT = '#7D9BFF'

const CAPABILITIES = [
  'Agent and business approvals',
  'KYC and compliance review',
  'Ledger, disputes and accounting',
]

function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <Box
      component="img"
      src="/logo-mark.png"
      alt=""
      aria-hidden
      sx={{ width: size, height: size, borderRadius: '9px', display: 'block' }}
    />
  )
}

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const login = useLogin()
  const notify = useNotify()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login({ username: email, password })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      notify('Invalid credentials', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  // La page peint sa propre surface claire : on fige le thème clair pour qu'un navigateur en mode
  // sombre n'applique pas des couleurs de texte claires sur ce fond blanc.
  return (
    <ThemeProvider theme={loginTheme}>
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 5fr) minmax(0, 6fr)' },
        bgcolor: '#FFFFFF',
        // Le body garde la couleur du thème global (claire en mode sombre) : on repose l'encre ici
        color: 'text.primary',
      }}
    >
      {/* ------------------------------------------------ Brand panel */}
      <Box
        component="aside"
        sx={{
          position: 'relative',
          overflow: 'hidden',
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          bgcolor: NAVY,
          color: '#FFFFFF',
          px: { md: 6, lg: 8 },
          py: 6,
        }}
      >
        {/* Arcs repris de la charte du site (motif Group (1).png) */}
        <Box
          component="svg"
          viewBox="0 0 480 480"
          aria-hidden
          sx={{
            position: 'absolute',
            right: -160,
            bottom: -160,
            width: 520,
            height: 520,
            pointerEvents: 'none',
          }}
        >
          {[230, 190, 150, 110].map((r, i) => (
            <circle
              key={r}
              cx="240"
              cy="240"
              r={r}
              fill="none"
              stroke="#FFFFFF"
              strokeOpacity={0.05 + i * 0.02}
              strokeWidth="1.5"
            />
          ))}
        </Box>

        <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <BrandMark />
          <Typography sx={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>
            TrustSend
          </Typography>
          <Typography
            component="span"
            sx={{
              fontSize: 12,
              fontWeight: 600,
              color: ACCENT_LIGHT,
              border: '1px solid rgba(125, 155, 255, 0.35)',
              borderRadius: '6px',
              px: 0.75,
              py: 0.1,
            }}
          >
            Admin
          </Typography>
        </Box>

        <Box sx={{ position: 'relative', maxWidth: 420 }}>
          <Typography
            component="h2"
            sx={{
              fontWeight: 700,
              fontSize: { md: 32, lg: 38 },
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
              textWrap: 'balance',
            }}
          >
            One audited workspace for every operation.
          </Typography>
          <Typography sx={{ mt: 2, color: 'rgba(255, 255, 255, 0.72)', fontSize: 15, lineHeight: 1.6 }}>
            Review agents, businesses, KYC cases and transactions from the internal console.
          </Typography>

          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 4 }}>
            {CAPABILITIES.map((item) => (
              <Box
                component="li"
                key={item}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  py: 1.5,
                  borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                  fontSize: 14,
                  color: 'rgba(255, 255, 255, 0.88)',
                  '&:last-of-type': { borderBottom: '1px solid rgba(255, 255, 255, 0.1)' },
                }}
              >
                <Box
                  aria-hidden
                  sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: ACCENT_LIGHT, flexShrink: 0 }}
                />
                {item}
              </Box>
            ))}
          </Box>
        </Box>

        <Typography sx={{ position: 'relative', fontSize: 12, color: 'rgba(255, 255, 255, 0.5)' }}>
          © {new Date().getFullYear()} TrustSend
        </Typography>
      </Box>

      {/* ------------------------------------------------ Form panel */}
      <Box
        component="main"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: { xs: 3, sm: 6 },
          py: { xs: 6, md: 8 },
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: 380,
            '@keyframes loginEnter': {
              from: { opacity: 0, transform: 'translateY(8px)' },
              to: { opacity: 1, transform: 'translateY(0)' },
            },
            animation: 'loginEnter 420ms cubic-bezier(0.16, 1, 0.3, 1) both',
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          {/* En-tête compact, visible uniquement sans le panneau de marque */}
          <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1.25, mb: 5 }}>
            <BrandMark size={32} />
            <Typography sx={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em' }}>
              TrustSend Admin
            </Typography>
          </Box>

          <Typography
            component="h1"
            sx={{ fontWeight: 700, fontSize: 28, letterSpacing: '-0.025em', color: NAVY }}
          >
            Sign in
          </Typography>
          <Typography sx={{ mt: 1, mb: 4, color: 'text.secondary', fontSize: 15 }}>
            Sign in to the internal admin console
          </Typography>

          {error && (
            <Alert severity="error" variant="outlined" sx={{ mb: 3, borderRadius: '10px' }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate={false} aria-busy={loading}>
            <TextField
              variant="outlined"
              fullWidth
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              margin="normal"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <MailOutlineIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <TextField
              variant="outlined"
              fullWidth
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              margin="normal"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlinedIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <VisibilityOffOutlinedIcon fontSize="small" />
                        ) : (
                          <VisibilityOutlinedIcon fontSize="small" />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              disableElevation
              sx={{
                mt: 3,
                py: 1.4,
                fontSize: 15,
                bgcolor: NAVY,
                '&:hover': { bgcolor: '#0A1A4F' },
              }}
            >
              {loading ? (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25 }}>
                  <CircularProgress size={18} color="inherit" />
                  Signing in…
                </Box>
              ) : (
                'Sign in'
              )}
            </Button>
          </Box>

          <Box
            sx={{
              mt: 4,
              pt: 3,
              borderTop: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
            }}
          >
            <ShieldOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled', mt: '2px' }} />
            <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
              Staff / compliance / finance access only. Every action is audited.
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
    </ThemeProvider>
  )
}
