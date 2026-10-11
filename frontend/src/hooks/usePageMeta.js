import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { SITE } from '../config/site.js'

const DEFAULT_DESCRIPTION =
  'Agropelink: plataforma AgTech de sensorización, IA agronómica y datos de mercado para explotaciones agrícolas.'

function upsertMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Metadatos por página: <title>, description, canonical, robots y Open Graph.
 * Los valores por defecto para redes sociales (que no ejecutan JS) están en index.html.
 *
 * @param {{ title: string, description?: string, noindex?: boolean, path?: string }} meta
 */
export default function usePageMeta({ title, description = DEFAULT_DESCRIPTION, noindex = false, path }) {
  const { pathname } = useLocation()
  const canonicalPath = path ?? pathname

  useEffect(() => {
    const fullTitle = title.includes('Agropelink') ? title : `${title} · Agropelink`
    const url = `${SITE.url}${canonicalPath === '/' ? '/' : canonicalPath}`
    document.title = fullTitle
    upsertMeta('name', 'description', description)
    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow')
    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', url)
    upsertMeta('name', 'twitter:title', fullTitle)
    upsertMeta('name', 'twitter:description', description)
    upsertCanonical(url)
  }, [title, description, noindex, canonicalPath])
}
