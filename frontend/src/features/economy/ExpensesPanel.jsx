import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { economyApi, getErrorMessage } from '../../api.js'
import Alert from '../../components/ui/Alert.jsx'
import Button from '../../components/ui/Button.jsx'
import Card from '../../components/ui/Card.jsx'
import FormField, { inputClass, optionClass } from '../../components/ui/FormField.jsx'
import { LoadingBlock } from '../../components/ui/Spinner.jsx'
import useApi from '../../hooks/useApi.js'
import { EXPENSE_CATEGORIES, categoryLabel, money, parseAmount, today } from './economyMeta.js'

const EMPTY = { category: 'water', concept: '', amount: '', incurred_on: today(), harvest_id: '', is_fixed: false }

function ExpenseForm({ farmId, harvests, onCreated }) {
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState(null)
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    const amount = parseAmount(values.amount)
    const found = {}
    if (!values.concept.trim()) found.concept = 'Indica el concepto.'
    if (amount === null || !Number.isFinite(amount) || amount <= 0) found.amount = 'Importe mayor que 0.'
    if (!values.incurred_on) found.incurred_on = 'Indica la fecha.'
    setErrors(found)
    if (Object.keys(found).length) return
    setBusy(true)
    setServerError(null)
    try {
      await economyApi.createExpense(farmId, {
        category: values.category,
        concept: values.concept.trim(),
        amount,
        incurred_on: values.incurred_on,
        is_fixed: values.is_fixed,
        harvest_id: values.harvest_id ? Number(values.harvest_id) : null,
      })
      setValues({ ...EMPTY, category: values.category, incurred_on: values.incurred_on })
      onCreated()
    } catch (err) {
      setServerError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const aria = (k) => ({ 'aria-invalid': errors[k] ? true : undefined, 'aria-describedby': errors[k] ? `exp-${k}-error` : undefined })
  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-3 sm:grid-cols-6">
      <FormField id="exp-category" label="Categoría" className="sm:col-span-2">
        <select id="exp-category" value={values.category} onChange={set('category')} className={inputClass}>
          {EXPENSE_CATEGORIES.map((c) => <option className={optionClass} key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </FormField>
      <FormField id="exp-concept" label="Concepto" error={errors.concept} className="sm:col-span-4">
        <input id="exp-concept" value={values.concept} onChange={set('concept')} maxLength={120} placeholder="Agua de riego de mayo" className={inputClass} {...aria('concept')} />
      </FormField>
      <FormField id="exp-amount" label="Importe (€)" error={errors.amount} className="sm:col-span-2">
        <input id="exp-amount" value={values.amount} onChange={set('amount')} inputMode="decimal" maxLength={16} placeholder="350,00" className={inputClass} {...aria('amount')} />
      </FormField>
      <FormField id="exp-incurred_on" label="Fecha" error={errors.incurred_on} className="sm:col-span-2">
        <input id="exp-incurred_on" type="date" value={values.incurred_on} onChange={set('incurred_on')} className={inputClass} {...aria('incurred_on')} />
      </FormField>
      <FormField id="exp-harvest" label="Imputar a" className="sm:col-span-2">
        <select id="exp-harvest" value={values.harvest_id} onChange={set('harvest_id')} className={inputClass}>
          <option className={optionClass} value="">Toda la finca</option>
          {harvests.map((h) => <option className={optionClass} key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </FormField>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-6">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={values.is_fixed} onChange={set('is_fixed')} className="h-4 w-4 rounded border-white/20 bg-white/5 accent-secondary-400" />
          Es un coste fijo
        </label>
        <Button type="submit" loading={busy}>Registrar coste</Button>
      </div>
      {serverError && <div className="sm:col-span-6"><Alert variant="error">{serverError}</Alert></div>}
    </form>
  )
}

/** Costes del año seleccionado: alta y listado con borrado (confirmado en el sitio). */
export default function ExpensesPanel({ farmId, year, harvests, onChanged }) {
  const list = useApi((signal) => economyApi.expenses(farmId, { year, limit: 500 }, { signal }), [farmId, year])
  const [confirm, setConfirm] = useState(null)
  const [error, setError] = useState(null)
  const harvestName = (id) => harvests.find((h) => h.id === id)?.name

  const changed = () => { list.reload(); onChanged() }
  async function remove(id) {
    setError(null)
    try {
      await economyApi.removeExpense(farmId, id)
      setConfirm(null)
      changed()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const items = list.data ?? []
  return (
    <Card title={`Costes registrados · ${year}`}>
      <ExpenseForm farmId={farmId} harvests={harvests} onCreated={changed} />
      <div className="mt-6 border-t border-white/[0.06] pt-4">
        {error && <div className="mb-3"><Alert variant="error">{error}</Alert></div>}
        {list.loading && !list.data ? (
          <LoadingBlock label="Cargando costes…" />
        ) : list.error ? (
          <Alert variant="error" onRetry={list.reload}>{list.error}</Alert>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-400">No hay costes registrados en {year}.</p>
        ) : (
          <div className="relative max-h-[28rem] overflow-auto" data-lenis-prevent>
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="py-2 font-semibold">Fecha</th><th className="py-2 font-semibold">Concepto</th><th className="hidden py-2 font-semibold md:table-cell">Categoría</th><th className="py-2 text-right font-semibold">Importe</th><th className="py-2"><span className="sr-only">Acciones</span></th></tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {items.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-slate-400">{new Date(`${e.incurred_on}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</td>
                    <td className="py-2 pr-3">
                      <p className="text-slate-100">{e.concept}</p>
                      <p className="text-[11px] text-slate-500">
                        {e.is_fixed ? 'Fijo' : 'Variable'}{harvestName(e.harvest_id) ? ` · ${harvestName(e.harvest_id)}` : ''}<span className="md:hidden"> · {categoryLabel(e.category)}</span>
                      </p>
                    </td>
                    <td className="hidden py-2 pr-3 text-slate-300 md:table-cell">{categoryLabel(e.category)}</td>
                    <td className="whitespace-nowrap py-2 text-right tabular-nums text-white">{money(e.amount)}</td>
                    <td className="whitespace-nowrap py-2 pl-2 text-right">
                      {confirm === e.id ? (
                        <span className="inline-flex gap-1">
                          <button type="button" onClick={() => remove(e.id)} className="rounded-lg bg-red-500/20 px-2 py-1 text-xs font-semibold text-red-100 hover:bg-red-500/30">Borrar</button>
                          <button type="button" onClick={() => setConfirm(null)} className="rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-white/10">No</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setConfirm(e.id)} aria-label={`Borrar coste ${e.concept}`} className="rounded-lg p-1.5 text-slate-500 transition-colors duration-300 hover:bg-red-500/10 hover:text-red-200">
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  )
}
