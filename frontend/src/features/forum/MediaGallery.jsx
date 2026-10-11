import { forumApi } from '../../api.js'

/**
 * Galería de un tema. Las imágenes ya vienen recodificadas y sin metadatos desde el servidor; los vídeos
 * se cargan solo bajo demanda (`preload="metadata"`), sin reproducción automática: coste mínimo al hacer scroll.
 */
export default function MediaGallery({ media }) {
  if (!media?.length) return null
  const single = media.length === 1

  return (
    <ul className={`mt-4 grid gap-3 ${single ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {media.map((item) => {
        const src = forumApi.mediaUrl(item.url)
        const ratio = item.width && item.height ? `${item.width} / ${item.height}` : undefined
        return (
          <li key={item.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/40 shadow-surface-sm">
            {item.kind === 'image' ? (
              <a href={src} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={src}
                  alt="Imagen adjunta al tema"
                  loading="lazy"
                  decoding="async"
                  width={item.width ?? undefined}
                  height={item.height ?? undefined}
                  style={{ aspectRatio: ratio }}
                  className={`w-full object-cover transition-opacity duration-300 hover:opacity-90 ${single ? 'max-h-[28rem]' : 'aspect-square'}`}
                />
              </a>
            ) : (
              <video src={src} controls playsInline preload="metadata" className={`w-full bg-black ${single ? 'max-h-[28rem]' : 'aspect-square object-cover'}`}>
                Tu navegador no puede reproducir este vídeo.
              </video>
            )}
          </li>
        )
      })}
    </ul>
  )
}
