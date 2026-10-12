/** Datos públicos de contacto e identidad de Agropelink (cuenta de Instagram y buzón oficiales). */
export const SITE = {
  name: 'Agropelink',
  domain: 'agropelink.es',
  url: 'https://agropelink.es',
  instagramUrl: 'https://www.instagram.com/agropelink/',
  instagramHandle: '@agropelink',
  // Buzón oficial único: soporte, comercial y notificaciones del formulario de contacto.
  email: 'info@agropelink.es',
  // Provincias seleccionables en el clima en directo (coordenadas de la capital). La primera es la inicial.
  weather: [
    { id: 'almeria', label: 'Almería', latitude: 36.84, longitude: -2.46 },
    { id: 'sevilla', label: 'Sevilla', latitude: 37.39, longitude: -5.98 },
    { id: 'murcia', label: 'Murcia', latitude: 37.99, longitude: -1.13 },
    { id: 'huelva', label: 'Huelva', latitude: 37.26, longitude: -6.95 },
  ],
}

/**
 * Identificación del titular y responsable del tratamiento (LSSI-CE art. 10 y RGPD art. 13).
 * Los campos `null` se muestran como "Pendiente" en las páginas legales hasta completarse.
 */
export const LEGAL = {
  owner: 'Zakaryae Abechar',
  ownerType: 'persona física', // si se constituye sociedad: razón social + datos registrales
  taxId: 'Y4618181W',
  address: 'Calle Río Segre 15, 2ºB, 04007 Almería, España', // Domicilio fiscal (LSSI-CE art. 10.1.a)
  registry: null, // Solo aplica a sociedades inscritas en el Registro Mercantil
  email: SITE.email,
  domain: SITE.domain,
  dpoEmail: null, // Delegado de Protección de Datos, solo si se designa
  hosting: 'Infraestructura Cloud en centros de datos dentro de la Unión Europea (RGPD compliant)',
  rightsSubject: 'Protección de Datos',
  updatedAt: '2026-10-10',
}

export const LANDING_SECTIONS = [
  { id: 'arquitectura', label: 'Arquitectura' },
  { id: 'auditoria', label: 'Blockchain' },
  { id: 'nosotros', label: 'Nosotros' },
  { id: 'mercado', label: 'Mercado' },
  { id: 'normativa', label: 'Normativa' },
  { id: 'equipo', label: 'Equipo' },
  { id: 'contacto', label: 'Contacto' },
]
