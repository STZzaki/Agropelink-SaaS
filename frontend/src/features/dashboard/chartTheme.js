// Tema de gráficas del panel (validado con dataviz/validate_palette.js sobre la superficie oscura #1c2623, gris bosque):
// insumos este año vs anterior → verde azulado vs tierra: ΔE CVD 9,2 (protan), visión normal 19,4, contraste ≥ 3:1.
export const CHART = {
  water: '#24a58c', // agua usada (barras)
  moisture: '#7fc982', // humedad del suelo (línea; serie única en su gráfica)
  thisYear: '#24a58c',
  lastYear: '#c6804b', // además, trazo discontinuo (codificación secundaria)
  // Economía (barras apiladas): fijos · variables · facturas. Validado con --pairs all sobre #1c2623:
  // ΔE CVD peor 9,2 (protan), tritan 9,6, visión normal ≥ 19,4. Siempre con leyenda y vista de tabla.
  fixed: '#24a58c',
  variable: '#c6804b',
  invoices: '#8a7fd6',
  declared: '#6f8379', // gasto declarado sin desglose: gris neutro, no es una categoría
  grid: 'rgb(255 255 255 / 0.06)',
  axis: '#6f8379',
  ink: '#e9efeb',
  muted: '#93a59b',
}

export const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })
export const fmt = (v) => (v === null || v === undefined ? '—' : nf.format(v))
export const fmtEuro = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v ?? 0)
export const fmtLiters = (v) => (v >= 10000 ? `${nf.format(v / 1000)} m³` : `${nf.format(v)} L`)
export const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

/**
 * Datos de EJEMPLO (deterministas) solo para previsualizar las gráficas cuando la cuenta aún no tiene lecturas
 * ni facturas. Se muestran siempre etiquetados como ejemplo y nunca se mezclan con datos reales.
 */
export function demoOverview(days = 30) {
  const today = new Date()
  const water = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const k = days - i
    const irrigated = k % 3 !== 0
    water.push({
      date: d.toISOString().slice(0, 10),
      water_liters: irrigated ? 900 + ((k * 137) % 600) : 0,
      soil_moisture_pct: Math.round((26 + 7 * Math.sin(k / 3.2) + (irrigated ? 4 : -2)) * 10) / 10,
    })
  }
  const base = [180, 220, 410, 520, 610, 380, 240, 200, 450, 560, 300, 150]
  const month = today.getMonth() + 1
  const inputs = base.map((v, i) => ({ month: i + 1, this_year: i + 1 <= month ? Math.round(v * 1.12) : 0, last_year: v }))
  return { water_vs_moisture: water, inputs_spend: inputs }
}
