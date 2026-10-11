/**
 * Radar de normativa agraria — contenido divulgativo.
 *
 * Revisado el 2026-10-10 con fuentes oficiales (MAPA, Junta de Andalucía, BOE). Los calendarios
 * de aplicación han cambiado varias veces: revisar este archivo al menos cada trimestre.
 * status: 'vigor' (En vigor) | 'proxima' (Próxima exigencia) | 'prevista' (Prevista, fecha por confirmar)
 */
export const REGULATIONS_REVIEWED_AT = '2026-10-10'

export const REGULATION_AREAS = [
  {
    id: 'siex',
    title: 'Cuaderno Digital de Explotación (SIEX)',
    short: 'Cuaderno digital',
    summary:
      'El SIEX (Real Decreto 1054/2022) es el sistema público que reúne la información de las explotaciones agrícolas. Dentro de él, el Cuaderno Digital de Explotación (CUE) sustituye progresivamente al cuaderno de campo en papel. Hoy su uso digital es voluntario salvo en los calendarios que se indican.',
    items: [
      {
        title: 'Registro de aplicaciones de fertilizantes y materia orgánica',
        status: 'vigor',
        date: '1 ene 2026',
        text: 'Cada aplicación de nutrientes debe anotarse en el cuaderno de explotación. Se admite todavía el formato papel o digital.',
      },
      {
        title: 'Registro digital de tratamientos fitosanitarios',
        status: 'proxima',
        date: '1 ene 2027',
        text: 'Quien aplique productos fitosanitarios deberá consignar los tratamientos en el cuaderno digital (CUE) y no solo en papel.',
      },
      {
        title: 'Cuaderno digital completo para explotaciones grandes',
        status: 'prevista',
        date: '2028 (previsto)',
        text: 'Extensión al resto de apartados del cuaderno para explotaciones que superen determinados umbrales de tamaño. Pendiente de concreción normativa.',
      },
    ],
    sources: [
      { label: 'Junta de Andalucía · Cuaderno de explotación', url: 'https://www.juntadeandalucia.es/organismos/agriculturapescaaguaydesarrollorural/areas/agricultura/cuaderno-explotacion.html' },
      { label: 'MAPA · Información sobre el cuaderno digital (PDF)', url: 'https://www.mapa.gob.es/dam/mapa/contenido/reforma-de-la-pac/postura-espanola/informacion-sobre-cuaderno-digital.pdf' },
    ],
  },
  {
    id: 'fito',
    title: 'Productos fitosanitarios y fertilizantes',
    short: 'Fitosanitarios y abonado',
    summary:
      'El uso de fitosanitarios exige formación acreditada, equipos inspeccionados y registro de cada tratamiento. En fertilización, la normativa de nutrición sostenible obliga a planificar el abonado y limita los aportes de nitrógeno, especialmente en zonas vulnerables.',
    items: [
      {
        title: 'Uso sostenible de fitosanitarios (RD 1311/2012)',
        status: 'vigor',
        date: 'Vigente',
        text: 'Carné de usuario profesional, inspección periódica de los equipos de aplicación, gestión integrada de plagas y registro de tratamientos.',
      },
      {
        title: 'Nutrición sostenible de suelos: plan de abonado (RD 1051/2022)',
        status: 'vigor',
        date: '2026 (modificado oct. 2025)',
        text: 'Plan de abonado y asesoramiento en fertilización. Su entrada en vigor se aplazó en octubre de 2025 con un calendario escalonado según el tipo de explotación: comprueba tu caso.',
      },
      {
        title: 'Nitratos en zonas vulnerables (RD 47/2022)',
        status: 'vigor',
        date: 'Vigente',
        text: 'En zonas declaradas vulnerables se aplican los programas de actuación de la comunidad autónoma: límites de nitrógeno, periodos de aplicación y registros.',
      },
    ],
    sources: [
      { label: 'BOE · Real Decreto 1311/2012', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2012-11605' },
      { label: 'MAPA · Modificación de la normativa de nutrición sostenible', url: 'https://www.mapa.gob.es/es/prensa/ultimas-noticias/detalle_noticias/el-gobierno-introduce-medidas-para-favorecer-la-aplicaci-n-de-la-normativa-sobre-nutrici-n-sostenible-de-los-suelos-agrarios-/cc9481bb-0f65-407d-8bf4-91228aaf10d2' },
    ],
  },
  {
    id: 'agua',
    title: 'Dotaciones de agua y normativa de riego',
    short: 'Agua y riego',
    summary:
      'Regar requiere un derecho de uso del agua (concesión o inscripción) y respetar las dotaciones fijadas por el plan hidrológico de tu demarcación. Los volúmenes extraídos deben medirse y comunicarse al organismo de cuenca.',
    items: [
      {
        title: 'Derecho de uso privativo del agua (Ley de Aguas)',
        status: 'vigor',
        date: 'Vigente',
        text: 'El riego necesita concesión administrativa o derecho inscrito. Las dotaciones concedidas son un máximo por hectárea y año.',
      },
      {
        title: 'Control de volúmenes: contadores',
        status: 'vigor',
        date: 'Vigente',
        text: 'Las captaciones deben disponer de sistema de medición homologado y conservar los registros de consumo a disposición del organismo de cuenca.',
      },
      {
        title: 'Planes hidrológicos 2022–2027 (3.er ciclo)',
        status: 'vigor',
        date: 'Hasta 2027',
        text: 'Fijan dotaciones de referencia por cultivo y medidas para masas de agua en mal estado. En Almería aplican principalmente las Cuencas Mediterráneas Andaluzas.',
      },
    ],
    sources: [
      { label: 'BOE · Texto refundido de la Ley de Aguas', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2001-14276' },
    ],
  },
]
