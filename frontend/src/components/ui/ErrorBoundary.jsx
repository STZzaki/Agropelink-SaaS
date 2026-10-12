import { Component } from 'react'

/**
 * Límite de errores de React: si un hijo falla al renderizar (dato inesperado de una API, widget de terceros…),
 * se muestra `fallback` en su lugar y el resto de la página sigue funcionando (sin pantalla en blanco).
 *
 * - `fallback`: nodo o función `(error, reset) => nodo`. Por defecto no muestra nada (la sección desaparece).
 * - `resetKey`: si cambia (p. ej. la ruta), se vuelve a intentar renderizar los hijos.
 * - `name`: etiqueta para el registro en consola (sin datos del usuario).
 *
 * Nota: un try/catch no sirve aquí: los errores de render ocurren dentro de React, no en nuestro código síncrono.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, resetKey: props.resetKey }
    this.reset = () => this.setState({ error: null })
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  static getDerivedStateFromProps(props, state) {
    // Nueva ruta o nuevos datos: se descarta el error anterior y se reintenta.
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey }
    return null
  }

  componentDidCatch(error) {
    // Solo el tipo y el mensaje: nunca props ni estado (podrían contener datos personales).
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}]`, error?.name, error?.message)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const { fallback = null } = this.props
    return typeof fallback === 'function' ? fallback(error, this.reset) : fallback
  }
}
