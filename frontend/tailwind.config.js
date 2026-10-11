import plugin from 'tailwindcss/plugin'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta extraída del logo de Agropelink.
        // primary (verde hoja) — DEFAULT ≈ #5BAD5E
        primary: {
          50: '#f2f9f2',
          100: '#e0f1e1',
          200: '#c2e3c3',
          300: '#97cf99',
          400: '#74bd77',
          500: '#5bad5e',
          DEFAULT: '#5bad5e',
          600: '#46904a',
          700: '#39723c',
          800: '#305b33',
          900: '#294b2b',
          950: '#132914',
        },
        // secondary (verde azulado / teal) — DEFAULT ≈ #2DB59A
        secondary: {
          50: '#effbf8',
          100: '#d7f4ec',
          200: '#b2e8da',
          300: '#7fd6c2',
          400: '#4bc2a8',
          500: '#2db59a',
          DEFAULT: '#2db59a',
          600: '#1f927d',
          700: '#1c7566',
          800: '#1b5d53',
          900: '#1a4d45',
          950: '#082d29',
        },
        // accent (marrón tierra) — DEFAULT ≈ #8C4A1A
        accent: {
          50: '#fbf5ef',
          100: '#f4e5d6',
          200: '#e8c8a9',
          300: '#d9a476',
          400: '#c6804b',
          500: '#a8622e',
          600: '#8c4a1a',
          DEFAULT: '#8c4a1a',
          700: '#733c16',
          800: '#5e3216',
          900: '#4e2b15',
          950: '#2b1409',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      // Profundidad: sombras multicapa con tinte ambiental verde/teal oscuro (en vez de bordes que fingen relieve).
      // Capa 1: hairline de luz · 2: contacto · 3: penumbra · 4: sombra ambiental amplia.
      boxShadow: {
        surface:
          'inset 0 1px 0 0 rgb(255 255 255 / 0.05), 0 0 0 1px rgb(255 255 255 / 0.07), 0 1px 2px 0 rgb(2 6 23 / 0.5), 0 8px 24px -10px rgb(4 30 26 / 0.7), 0 24px 56px -24px rgb(8 45 41 / 0.65)',
        'surface-hover':
          'inset 0 1px 0 0 rgb(255 255 255 / 0.07), 0 0 0 1px rgb(127 214 194 / 0.18), 0 2px 4px 0 rgb(2 6 23 / 0.5), 0 14px 32px -10px rgb(4 30 26 / 0.8), 0 32px 72px -28px rgb(31 146 125 / 0.45)',
        'surface-sm': 'inset 0 1px 0 0 rgb(255 255 255 / 0.04), 0 0 0 1px rgb(255 255 255 / 0.06), 0 1px 2px 0 rgb(2 6 23 / 0.4)',
        overlay:
          '0 0 0 1px rgb(255 255 255 / 0.08), 0 2px 4px 0 rgb(2 6 23 / 0.4), 0 16px 40px -8px rgb(2 6 23 / 0.7), 0 40px 96px -24px rgb(4 30 26 / 0.8)',
        // Resplandor perimetral de los CTA (reposo / hover).
        glow: '0 0 0 1px rgb(127 214 194 / 0.35), 0 1px 2px 0 rgb(2 6 23 / 0.4), 0 8px 24px -8px rgb(45 181 154 / 0.45)',
        'glow-hover': '0 0 0 1px rgb(127 214 194 / 0.6), 0 2px 4px 0 rgb(2 6 23 / 0.4), 0 12px 36px -6px rgb(45 181 154 / 0.65)',
        // Foco "elástico" de campos: halo que crece desde el borde.
        'focus-ring': '0 0 0 1px rgb(75 194 168 / 0.7), 0 0 0 4px rgb(75 194 168 / 0.15)',
        'error-ring': '0 0 0 1px rgb(217 164 118 / 0.75), 0 0 0 4px rgb(217 164 118 / 0.14)',
        // Botones del panel: brillo superior (luz cenital) + sombra de contacto + sombra ambiental difusa.
        btn: 'inset 0 1px 0 0 rgb(255 255 255 / 0.06), 0 1px 2px 0 rgb(0 0 0 / 0.4), 0 6px 16px -8px rgb(0 0 0 / 0.6)',
        'btn-hover': 'inset 0 1px 0 0 rgb(255 255 255 / 0.09), 0 2px 4px 0 rgb(0 0 0 / 0.4), 0 12px 28px -10px rgb(0 0 0 / 0.7)',
        'btn-primary':
          'inset 0 1px 0 0 rgb(255 255 255 / 0.35), 0 1px 2px 0 rgb(0 0 0 / 0.4), 0 8px 24px -10px rgb(45 181 154 / 0.55)',
        'btn-primary-hover':
          'inset 0 1px 0 0 rgb(255 255 255 / 0.4), 0 2px 4px 0 rgb(0 0 0 / 0.4), 0 14px 34px -10px rgb(75 194 168 / 0.7)',
        'inner-soft': 'inset 0 1px 2px 0 rgb(0 0 0 / 0.35)',
      },
      // Curvas de movimiento (alineadas con transitions.dev / make-interfaces-feel-better).
      transitionTimingFunction: {
        out: 'cubic-bezier(0.2, 0, 0, 1)',
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        spring: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
      },
    },
  },
  plugins: [
    // `motion-ok:` anima si el sistema lo permite o si el movimiento está forzado (<html class="force-motion">);
    // `motion-off:` aplica solo con movimiento reducido real (ver src/lib/gsap.js).
    plugin(({ addVariant }) => {
      addVariant('motion-ok', ['@media (prefers-reduced-motion: no-preference) { & }', '.force-motion &'])
      addVariant('motion-off', '@media (prefers-reduced-motion: reduce) { html:not(.force-motion) & }')
    }),
  ],
}
