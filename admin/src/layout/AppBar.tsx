import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { AppBar, ToggleThemeButton, LoadingIndicator } from 'react-admin'

export function TumaAppBar() {
  return (
    <AppBar
      color="inherit"
      sx={{
        bgcolor: 'background.paper',
        borderColor: 'divider',
        color: 'text.primary',
      }}
      toolbar={
        <>
          <ToggleThemeButton />
          <LoadingIndicator />
        </>
      }
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* <BoltIcon sx={{ color: 'primary.main' }} /> */}
        <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: -0.3, whiteSpace: 'nowrap' }}>
          TrustSend Panel
        </Typography>
      </Box>
      <Box sx={{ width: 16 }} />
      {/* <TitlePortal /> */}
      <Box sx={{ flex: 1 }} />
    </AppBar>
  )
}
