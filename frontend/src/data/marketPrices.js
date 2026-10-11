/**
 * Precios medios ORIENTATIVOS en origen (€/kg) para hortícolas de Almería.
 *
 * Datos de referencia de actualización manual: no son cotizaciones oficiales ni en tiempo real.
 * Sustituir por una fuente de lonja/alhóndiga integrada en el backend cuando esté disponible.
 * `history`: últimos 7 registros (el último es el precio actual).
 */
export const MARKET_PRICES_UPDATED_AT = '2026-10-09'

export const MARKET_PRICES = [
  { id: 'tomate', product: 'Tomate', variety: 'Rama', history: [0.92, 0.95, 0.9, 0.97, 1.02, 0.99, 1.06] },
  { id: 'pimiento', product: 'Pimiento', variety: 'California rojo', history: [1.38, 1.34, 1.31, 1.29, 1.33, 1.27, 1.24] },
  { id: 'pepino', product: 'Pepino', variety: 'Almería', history: [0.58, 0.61, 0.66, 0.63, 0.69, 0.72, 0.74] },
  { id: 'calabacin', product: 'Calabacín', variety: 'Fino', history: [0.85, 0.81, 0.79, 0.83, 0.78, 0.76, 0.77] },
  { id: 'berenjena', product: 'Berenjena', variety: 'Larga', history: [0.7, 0.72, 0.71, 0.75, 0.74, 0.78, 0.81] },
]
