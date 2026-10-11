// Vocabulario del archivo documental (espejo de los enums del backend).

export const DOC_TYPES = [
  { id: 'invoice_fuel', label: 'Factura · Gasóleo', series: 'FCT' },
  { id: 'invoice_phyto', label: 'Factura · Fitosanitarios', series: 'FCT' },
  { id: 'invoice_seeds', label: 'Factura · Semillas', series: 'FCT' },
  { id: 'invoice_other', label: 'Factura · Otros', series: 'FCT' },
  { id: 'delivery_note', label: 'Albarán', series: 'ALB' },
  { id: 'soil_analysis', label: 'Análisis de suelo', series: 'ASU' },
  { id: 'water_analysis', label: 'Análisis de agua', series: 'AAG' },
  { id: 'farm_logbook', label: 'Cuaderno de explotación', series: 'CUA' },
  { id: 'certificate', label: 'Certificado oficial', series: 'CER' },
  { id: 'contract', label: 'Contrato', series: 'CTR' },
  { id: 'other', label: 'Otro documento', series: 'OTR' },
]

export const DOC_STATUSES = [
  { id: 'pending', label: 'Pendiente', tone: 'bg-accent-50 text-accent-800 ring-accent-200' },
  { id: 'paid', label: 'Pagado', tone: 'bg-primary-50 text-primary-800 ring-primary-200' },
  { id: 'archived', label: 'Archivado', tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
]

export const docTypeLabel = (id) => DOC_TYPES.find((t) => t.id === id)?.label ?? 'Documento'
export const docStatus = (id) => DOC_STATUSES.find((s) => s.id === id) ?? DOC_STATUSES[0]

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
export const formatAmount = (value) => (value === null || value === undefined ? '—' : euro.format(value))
export const formatDay = (iso) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export const CURRENT_YEAR = new Date().getFullYear()

/** Metadatos vacíos del formulario (cadenas para los inputs controlados). */
export function emptyMeta(overrides = {}) {
  return {
    farm_id: '',
    doc_type: 'other',
    fiscal_year: String(CURRENT_YEAR),
    campaign: '',
    status: 'pending',
    accrual_date: '',
    amount: '',
    vendor: '',
    ...overrides,
  }
}

/** Propuesta de la IA → valores del formulario. */
export function metaFromProposal(proposal, fallbackFarmId = '') {
  return emptyMeta({
    farm_id: proposal.farm_id ? String(proposal.farm_id) : String(fallbackFarmId || ''),
    doc_type: proposal.doc_type || 'other',
    fiscal_year: proposal.fiscal_year ? String(proposal.fiscal_year) : String(CURRENT_YEAR),
    campaign: proposal.campaign ?? '',
    status: proposal.status || 'pending',
    accrual_date: proposal.accrual_date ?? '',
    amount: proposal.amount === null || proposal.amount === undefined ? '' : String(proposal.amount).replace('.', ','),
    vendor: proposal.vendor ?? '',
  })
}

/** Validación de UX (el backend vuelve a validar todo). Devuelve { errors, payload }. */
export function validateMeta(values) {
  const errors = {}
  if (!values.farm_id) errors.farm_id = 'Elige la finca.'
  const year = Number(values.fiscal_year)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.fiscal_year = 'Año no válido.'
  const campaign = values.campaign.trim()
  if (campaign && (campaign.length < 2 || campaign.length > 80)) errors.campaign = 'Entre 2 y 80 caracteres.'
  let amount = null
  if (String(values.amount).trim() !== '') {
    amount = Number(String(values.amount).replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) errors.amount = 'Importe no válido.'
    else amount = Math.round(amount * 100) / 100
  }
  const payload = {
    farm_id: Number(values.farm_id),
    doc_type: values.doc_type,
    fiscal_year: year,
    campaign: campaign || null,
    status: values.status,
    accrual_date: values.accrual_date || null,
    amount,
    vendor: values.vendor.trim() || null,
  }
  return { errors, payload }
}
