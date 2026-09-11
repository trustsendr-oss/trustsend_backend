import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'
import CircularProgress from '@mui/material/CircularProgress'
import ButtonBase from '@mui/material/ButtonBase'
import DownloadIcon from '@mui/icons-material/DownloadOutlined'
import DescriptionIcon from '@mui/icons-material/DescriptionOutlined'
import ZoomInIcon from '@mui/icons-material/ZoomInOutlined'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import HighlightOffIcon from '@mui/icons-material/HighlightOff'
import { Show, useRecordContext, TextField, DateField, Labeled, TopToolbar, useNotify } from 'react-admin'
import { StatusChip } from '../../components/StatusChip'
import { ConfirmActionButton, ReasonActionButton } from '../../components/ActionButtons'
import { adminActions } from '../../providers/dataProvider'
import { apiFetchBlob, ApiError } from '../../providers/httpClient'

function KycActions() {
  const record = useRecordContext()
  if (!record) return null
  const decidable = record.status === 'pending' || record.status === 'in_review'
  return (
    <TopToolbar sx={{ gap: 1 }}>
      {decidable && (
        <>
          <ConfirmActionButton
            label="Approve"
            icon={CheckCircleOutlineIcon}
            color="success"
            confirmText="Approve this KYC verification?"
            onConfirm={() => adminActions.kycApprove(record.id)}
          />
          <ReasonActionButton
            label="Reject"
            icon={HighlightOffIcon}
            color="error"
            onConfirm={(reason) => adminActions.kycReject(record.id, reason)}
          />
        </>
      )}
    </TopToolbar>
  )
}

interface KycDocument {
  id: number
  document_type: string
  created_at: string
}

/** Populated once the document's bytes have been fetched and probed for whether they decode as an image. */
interface LoadedDocument extends KycDocument {
  url: string
  isImage: boolean | null // null while <img> is still probing
}

function DocumentTile({ doc, onOpen }: { doc: LoadedDocument; onOpen: () => void }) {
  const notify = useNotify()
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setDownloading(true)
    try {
      const a = document.createElement('a')
      a.href = doc.url
      a.download = `kyc-${doc.id}-${doc.document_type}`
      a.click()
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Download failed', { type: 'error' })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Box sx={{ width: 160 }}>
      <ButtonBase
        onClick={doc.isImage !== false ? onOpen : undefined}
        sx={{
          width: 160,
          height: 160,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          overflow: 'hidden',
          position: 'relative',
          bgcolor: 'action.hover',
          display: 'block',
          '&:hover .doc-overlay': { opacity: 1 },
        }}
      >
        {doc.isImage === false ? (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.5,
            }}
          >
            <DescriptionIcon sx={{ fontSize: 40, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              No preview
            </Typography>
          </Box>
        ) : (
          <Box
            component="img"
            src={doc.url}
            alt={doc.document_type}
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
        {doc.isImage !== false && (
          <Box
            className="doc-overlay"
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(0,0,0,0.35)',
              opacity: 0,
              transition: 'opacity 0.15s ease',
            }}
          >
            <ZoomInIcon sx={{ color: 'white', fontSize: 32 }} />
          </Box>
        )}
        <IconButton
          size="small"
          onClick={handleDownload}
          disabled={downloading}
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            bgcolor: 'background.paper',
            '&:hover': { bgcolor: 'background.paper' },
          }}
        >
          {downloading ? <CircularProgress size={14} /> : <DownloadIcon fontSize="small" />}
        </IconButton>
      </ButtonBase>
      <Typography
        variant="caption"
        sx={{ display: 'block', mt: 0.5, textTransform: 'capitalize', fontWeight: 600 }}
      >
        {doc.document_type.replace(/_/g, ' ')}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {doc.created_at}
      </Typography>
    </Box>
  )
}

function DocumentsCard() {
  const record = useRecordContext()
  const notify = useNotify()
  const [documents, setDocuments] = useState<LoadedDocument[] | null>(null)
  const [preview, setPreview] = useState<LoadedDocument | null>(null)

  useEffect(() => {
    if (!record) return
    let cancelled = false
    const urls: string[] = []

    adminActions
      .kycDocuments(record.id)
      .then(async (docs) => {
        const loaded = await Promise.all(
          docs.map(async (doc): Promise<LoadedDocument> => {
            try {
              const blob = await apiFetchBlob(`/kyc/${record.id}/documents/${doc.id}`)
              const url = URL.createObjectURL(blob)
              urls.push(url)
              return { ...doc, url, isImage: null }
            } catch {
              return { ...doc, url: '', isImage: false }
            }
          })
        )
        if (!cancelled) setDocuments(loaded)
      })
      .catch(() => {
        if (!cancelled) {
          setDocuments([])
          notify('Failed to load documents', { type: 'error' })
        }
      })

    return () => {
      cancelled = true
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id])

  const markImageResult = (id: number, isImage: boolean) => {
    setDocuments((prev) => prev?.map((d) => (d.id === id ? { ...d, isImage } : d)) ?? prev)
  }

  return (
    <Card sx={{ mt: 2 }}>
      <CardHeader
        title={
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Submitted documents
          </Typography>
        }
      />
      <CardContent sx={{ pt: 0 }}>
        {documents === null ? (
          <Stack direction="row" sx={{ gap: 2 }}>
            <Skeleton variant="rounded" width={160} height={160} />
            <Skeleton variant="rounded" width={160} height={160} />
          </Stack>
        ) : documents.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No documents on file.
          </Typography>
        ) : (
          <>
            {/* Off-screen probe images: real <img> elements so the browser tells us, via
                onLoad/onError, whether each blob actually decodes as an image (KYC uploads can be
                a photo or a PDF, and the backend always serves application/octet-stream — see
                kyc_controller.ts getDocument() — so content-type can't be trusted here). */}
            {documents
              .filter((d) => d.isImage === null && d.url)
              .map((d) => (
                <img
                  key={d.id}
                  src={d.url}
                  alt=""
                  style={{ display: 'none' }}
                  onLoad={() => markImageResult(d.id, true)}
                  onError={() => markImageResult(d.id, false)}
                />
              ))}
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
              {documents.map((doc) => (
                <DocumentTile key={doc.id} doc={doc} onOpen={() => setPreview(doc)} />
              ))}
            </Stack>
          </>
        )}
      </CardContent>

      <Dialog open={!!preview} onClose={() => setPreview(null)} maxWidth="md" fullWidth>
        {preview && (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', textTransform: 'capitalize' }}>
              {preview.document_type.replace(/_/g, ' ')}
              <IconButton onClick={() => setPreview(null)} size="small">
                <CloseIcon fontSize="small" />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', justifyContent: 'center', bgcolor: 'action.hover' }}>
              <Box component="img" src={preview.url} alt={preview.document_type} sx={{ maxWidth: '100%', maxHeight: '70vh' }} />
            </DialogContent>
            <DialogActions>
              <Button
                startIcon={<DownloadIcon fontSize="small" />}
                onClick={() => {
                  const a = document.createElement('a')
                  a.href = preview.url
                  a.download = `kyc-${preview.id}-${preview.document_type}`
                  a.click()
                }}
              >
                Download
              </Button>
              <Button onClick={() => setPreview(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Card>
  )
}

export function KycShow() {
  return (
    <Show actions={<KycActions />}>
      <KycShowContent />
    </Show>
  )
}

function KycShowContent() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, textTransform: 'capitalize' }}>
          {record.subject_type} #{record.subject_id} — {record.verification_type}
        </Typography>
        <StatusChip status={record.status} />
      </Stack>
      <Card>
        <CardContent>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
            <Labeled label="KYC ID">
              <TextField source="id" />
            </Labeled>
            <Labeled label="Provider">
              <TextField source="provider" emptyText="—" />
            </Labeled>
            <Labeled label="Submitted">
              <DateField source="submitted_at" showTime emptyText="—" />
            </Labeled>
            <Labeled label="Decided">
              <DateField source="decided_at" showTime emptyText="—" />
            </Labeled>
            <Labeled label="Reviewed by (internal user id)">
              <TextField source="reviewed_by" emptyText="—" />
            </Labeled>
          </Stack>
          {record.decision_reason && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Decision reason
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {record.decision_reason}
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>
      <DocumentsCard />
    </Box>
  )
}
