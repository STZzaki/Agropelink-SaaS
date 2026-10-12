import { inputClass, optionClass } from '../../components/ui/FormField.jsx'
import FarmSelect from '../farms/FarmSelect.jsx'
import { DOC_STATUSES, DOC_TYPES } from './documentMeta.js'

/**
 * Campos de indexación de un documento (controlados). Se usan en la subida directa,
 * en la revisión de la propuesta de la IA y en la tarjeta de confirmación del asistente.
 */
export default function DocumentMetaFields({ idPrefix, values, onChange, errors = {}, farms, campaigns = [], disabled, compact }) {
  const set = (field) => (e) => onChange({ ...values, [field]: e.target.value })
  const field = (name, label, control) => (
    <div>
      <label htmlFor={`${idPrefix}-${name}`} className={`mb-1 block font-medium text-slate-300 ${compact ? 'text-[11px]' : 'text-sm'}`}>{label}</label>
      {control}
      {errors[name] && <p id={`${idPrefix}-${name}-error`} className="mt-1 text-xs font-medium text-accent-300">{errors[name]}</p>}
    </div>
  )
  const aria = (name) => ({ 'aria-invalid': errors[name] ? true : undefined, 'aria-describedby': errors[name] ? `${idPrefix}-${name}-error` : undefined })

  return (
    <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
      {field(
        'farm_id',
        'Finca / parcela',
        <FarmSelect id={`${idPrefix}-farm_id`} farms={farms} value={values.farm_id} onChange={(v) => onChange({ ...values, farm_id: v })} invalid={!!errors.farm_id} disabled={disabled} />,
      )}
      {field(
        'doc_type',
        'Tipo de documento',
        <select id={`${idPrefix}-doc_type`} value={values.doc_type} onChange={set('doc_type')} className={inputClass} disabled={disabled}>
          {DOC_TYPES.map((t) => <option className={optionClass} key={t.id} value={t.id}>{t.label}</option>)}
        </select>,
      )}
      {field(
        'fiscal_year',
        'Año fiscal',
        <input id={`${idPrefix}-fiscal_year`} type="number" min={2000} max={2100} value={values.fiscal_year} onChange={set('fiscal_year')} className={inputClass} disabled={disabled} {...aria('fiscal_year')} />,
      )}
      {field(
        'campaign',
        'Campaña / cosecha',
        <>
          <input id={`${idPrefix}-campaign`} list={`${idPrefix}-campaigns`} maxLength={80} value={values.campaign} onChange={set('campaign')} className={inputClass} placeholder="Tomate 2026" disabled={disabled} {...aria('campaign')} />
          <datalist id={`${idPrefix}-campaigns`}>{campaigns.map((c) => <option key={c} value={c} />)}</datalist>
        </>,
      )}
      {field(
        'accrual_date',
        'Fecha de devengo',
        <input id={`${idPrefix}-accrual_date`} type="date" value={values.accrual_date} onChange={set('accrual_date')} className={inputClass} disabled={disabled} />,
      )}
      {field(
        'amount',
        'Importe (€)',
        <input id={`${idPrefix}-amount`} inputMode="decimal" maxLength={14} value={values.amount} onChange={set('amount')} className={inputClass} placeholder="450,00" disabled={disabled} {...aria('amount')} />,
      )}
      {field(
        'status',
        'Estado',
        <select id={`${idPrefix}-status`} value={values.status} onChange={set('status')} className={inputClass} disabled={disabled}>
          {DOC_STATUSES.map((s) => <option className={optionClass} key={s.id} value={s.id}>{s.label}</option>)}
        </select>,
      )}
      {field(
        'vendor',
        'Proveedor / emisor',
        <input id={`${idPrefix}-vendor`} maxLength={150} value={values.vendor} onChange={set('vendor')} className={inputClass} disabled={disabled} />,
      )}
    </div>
  )
}
