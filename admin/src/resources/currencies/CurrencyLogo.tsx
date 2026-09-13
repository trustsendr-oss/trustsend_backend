import Avatar from '@mui/material/Avatar'

export function CurrencyLogo({ src, code, size = 32 }: { src?: string; code: string; size?: number }) {
  return (
    <Avatar
      src={src}
      alt={code}
      sx={{ width: size, height: size, fontSize: size / 3, border: 1, borderColor: 'divider' }}
    >
      {code}
    </Avatar>
  )
}
