import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Tooltip from '@mui/material/Tooltip'
import MailOutlineIcon from '@mui/icons-material/MailOutlineOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { useLogin, useNotify } from 'react-admin'
import { lightTheme } from '../theme/theme'
import { internalAuth } from '../providers/authProvider'
import { ApiError } from '../providers/httpClient'

// theme.ts exporte des options (react-admin construit le thème lui-même) : ThemeProvider exige un
// thème construit.
const loginTheme = createTheme(lightTheme)

// Brand tokens — same values as the public site (trustsend_web/src/index.css) and theme.ts
const NAVY = '#020D30'
const ACCENT_LIGHT = '#7D9BFF'
const MIN_PASSWORD_LENGTH = 12

const CAPABILITIES = [
  'Agent and business approvals',
  'KYC and compliance review',
  'Ledger, disputes and accounting',
]

type Step = 'credentials' | 'mfa' | 'password' | 'mfa-setup'

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

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError || err instanceof Error ? err.message : fallback
}

function CodeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <TextField
      variant="outlined"
      fullWidth
      label="Verification code"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      required
      autoFocus
      margin="normal"
      slotProps={{
        htmlInput: {
          inputMode: 'numeric',
          pattern: '[0-9]{6}',
          maxLength: 6,
          autoComplete: 'one-time-code',
          'aria-describedby': 'code-help',
          style: { letterSpacing: '0.4em', fontSize: 20, fontWeight: 600, textAlign: 'center' },
        },
      }}
    />
  )
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  autoFocus = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  autoFocus?: boolean
}) {
  const [visible, setVisible] = useState(false)
  return (
    <TextField
      variant="outlined"
      fullWidth
      label={label}
      type={visible ? 'text' : 'password'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required
      autoFocus={autoFocus}
      autoComplete={autoComplete}
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
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? 'Hide password' : 'Show password'}
              >
                {visible ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  )
}

function SubmitButton({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <Button
      type="submit"
      fullWidth
      variant="contained"
      size="large"
      disabled={loading}
      disableElevation
      sx={{ mt: 3, py: 1.4, fontSize: 15, bgcolor: NAVY, '&:hover': { bgcolor: '#0A1A4F' } }}
    >
      {loading ? (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25 }}>
          <CircularProgress size={18} color="inherit" />
          {loadingLabel}
        </Box>
      ) : (
        label
      )}
    </Button>
  )
}

const headingSx = { fontWeight: 700, fontSize: 28, letterSpacing: '-0.025em', color: NAVY } as const
const leadSx = { mt: 1, mb: 3, color: 'text.secondary', fontSize: 15 } as const

export function LoginPage() {
  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [setupSteps, setSetupSteps] = useState(0)
  const [enrolment, setEnrolment] = useState<{ secret: string; qr: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const login = useLogin()
  const notify = useNotify()

  const goTo = (next: Step) => {
    setError(null)
    setCode('')
    setStep(next)
  }

  // Tous les contrôles sont faits côté serveur : login() revérifie seulement que la session est complète
  const finish = () => login({})

  const afterPasswordStep = async (enabled: boolean) => {
    if (enabled) {
      await finish()
    } else {
      goTo('mfa-setup')
    }
  }

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await internalAuth.signIn(email, password)
      if (result.status === 'mfa_required') {
        setMfaEnabled(true)
        goTo('mfa')
        return
      }
      setMfaEnabled(result.mfaEnabled)
      setSetupSteps(Number(result.mustChangePassword) + Number(!result.mfaEnabled))
      if (result.mustChangePassword) {
        goTo('password')
      } else {
        await afterPasswordStep(result.mfaEnabled)
      }
    } catch (err) {
      setError(errorMessage(err, 'Login failed'))
      notify('Invalid credentials', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { mustChangePassword } = await internalAuth.verifyMfa(code)
      if (mustChangePassword) {
        setSetupSteps(1)
        goTo('password')
      } else {
        await finish()
      }
    } catch (err) {
      setError(errorMessage(err, 'Verification failed'))
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('The two passwords do not match.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await internalAuth.changePassword(password, newPassword)
      setPassword(newPassword)
      setNewPassword('')
      setConfirmPassword('')
      await afterPasswordStep(mfaEnabled)
    } catch (err) {
      setError(errorMessage(err, 'Could not change the password'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (step !== 'mfa-setup' || enrolment) return
    let cancelled = false
    internalAuth
      .setupMfa()
      .then(async ({ secret, otpauth_url }) => {
        const qr = await QRCode.toDataURL(otpauth_url, {
          margin: 1,
          width: 240,
          color: { dark: NAVY, light: '#FFFFFF' },
        })
        if (!cancelled) setEnrolment({ secret, qr })
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, 'Could not start two-factor setup'))
      })
    return () => {
      cancelled = true
    }
  }, [step, enrolment])

  const handleEnable = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await internalAuth.enableMfa(code)
      await finish()
    } catch (err) {
      setError(errorMessage(err, 'Verification failed'))
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  const startOver = async () => {
    await internalAuth.cancel()
    setPassword('')
    setEnrolment(null)
    setSetupSteps(0)
    goTo('credentials')
  }

  const progress = (current: number) => (setupSteps > 1 ? `Step ${current} of ${setupSteps}. ` : '')

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
            sx={{ position: 'absolute', right: -160, bottom: -160, width: 520, height: 520, pointerEvents: 'none' }}
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
            <Typography sx={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>TrustSend</Typography>
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
              sx={{ fontWeight: 700, fontSize: { md: 32, lg: 38 }, lineHeight: 1.15, letterSpacing: '-0.03em', textWrap: 'balance' }}
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
                  <Box aria-hidden sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: ACCENT_LIGHT, flexShrink: 0 }} />
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
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', px: { xs: 3, sm: 6 }, py: { xs: 6, md: 8 } }}
        >
          <Box
            key={step}
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
              <Typography sx={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em' }}>TrustSend Admin</Typography>
            </Box>

            {step === 'credentials' && (
              <>
                <Typography component="h1" sx={headingSx}>
                  Sign in
                </Typography>
                <Typography sx={{ ...leadSx, mb: 4 }}>Sign in to the internal admin console</Typography>
              </>
            )}
            {step === 'mfa' && (
              <>
                <Typography component="h1" sx={headingSx}>
                  Two-factor verification
                </Typography>
                <Typography id="code-help" sx={leadSx}>
                  Enter the 6-digit code from your authenticator app.
                </Typography>
              </>
            )}
            {step === 'password' && (
              <>
                <Typography component="h1" sx={headingSx}>
                  Choose a new password
                </Typography>
                <Typography sx={leadSx}>
                  {progress(1)}Replace your temporary password with one of at least {MIN_PASSWORD_LENGTH} characters.
                </Typography>
              </>
            )}
            {step === 'mfa-setup' && (
              <>
                <Typography component="h1" sx={headingSx}>
                  Set up two-factor authentication
                </Typography>
                <Typography id="code-help" sx={leadSx}>
                  {progress(setupSteps)}Scan the QR code with an authenticator app, then enter the 6-digit code it shows.
                </Typography>
              </>
            )}

            {error && (
              <Alert severity="error" variant="outlined" sx={{ mb: 2, borderRadius: '10px' }}>
                {error}
              </Alert>
            )}

            {step === 'credentials' && (
              <Box component="form" onSubmit={handleCredentials} aria-busy={loading}>
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
                            {showPassword ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <SubmitButton loading={loading} label="Sign in" loadingLabel="Signing in…" />
              </Box>
            )}

            {step === 'mfa' && (
              <Box component="form" onSubmit={handleMfa} aria-busy={loading}>
                <CodeField value={code} onChange={setCode} />
                <SubmitButton loading={loading} label="Verify" loadingLabel="Verifying…" />
              </Box>
            )}

            {step === 'password' && (
              <Box component="form" onSubmit={handlePasswordChange} aria-busy={loading}>
                <PasswordField label="New password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" autoFocus />
                <PasswordField label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
                <SubmitButton loading={loading} label="Save password" loadingLabel="Saving…" />
              </Box>
            )}

            {step === 'mfa-setup' && (
              <Box component="form" onSubmit={handleEnable} aria-busy={loading}>
                {enrolment ? (
                  <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: '12px' }}>
                      <Box
                        component="img"
                        src={enrolment.qr}
                        alt="QR code to add TrustSend Admin to your authenticator app"
                        sx={{ width: 120, height: 120, flexShrink: 0 }}
                      />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          Can't scan? Enter this key manually
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                          <Typography
                            sx={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 13, fontWeight: 600, color: NAVY, wordBreak: 'break-all' }}
                          >
                            {enrolment.secret.match(/.{1,4}/g)?.join(' ')}
                          </Typography>
                          <Tooltip title="Copy key">
                            <IconButton size="small" aria-label="Copy key" onClick={() => navigator.clipboard.writeText(enrolment.secret)}>
                              <ContentCopyIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                    </Box>
                    <CodeField value={code} onChange={setCode} />
                    <SubmitButton loading={loading} label="Enable and continue" loadingLabel="Enabling…" />
                  </>
                ) : (
                  !error && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                      <CircularProgress size={28} />
                    </Box>
                  )
                )}
              </Box>
            )}

            {step !== 'credentials' && (
              <Typography sx={{ mt: 2.5, textAlign: 'center', fontSize: 14 }}>
                <Link component="button" type="button" onClick={startOver} underline="hover" sx={{ color: 'text.secondary' }}>
                  Use a different account
                </Link>
              </Typography>
            )}

            <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'flex-start', gap: 1 }}>
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
