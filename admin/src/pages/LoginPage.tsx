import { useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import InputAdornment from '@mui/material/InputAdornment'
import MailOutlineIcon from '@mui/icons-material/MailOutlineOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import BoltIcon from '@mui/icons-material/Bolt'
import { useLogin, useNotify } from 'react-admin'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(circle at 20% 20%, #7C6FF0 0%, #5B4FE9 35%, #2A2470 100%)',
        p: 2,
      }}
    >
      <Paper
        elevation={8}
        sx={{
          width: '100%',
          maxWidth: 400,
          p: 4,
          borderRadius: 4,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'primary.main',
              color: 'white',
            }}
          >
            <BoltIcon />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            TumaPlus
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Sign in to the internal admin console
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            margin="normal"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <MailOutlineIcon fontSize="small" color="disabled" />
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField
            fullWidth
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            margin="normal"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <LockOutlinedIcon fontSize="small" color="disabled" />
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
            sx={{ mt: 3, py: 1.2 }}
          >
            {loading ? <CircularProgress size={22} color="inherit" /> : 'Sign in'}
          </Button>
        </Box>

        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ display: 'block', textAlign: 'center', mt: 3 }}
        >
          Staff / compliance / finance access only. Every action is audited.
        </Typography>
      </Paper>
    </Box>
  )
}
