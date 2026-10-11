import { Link } from 'react-router-dom'
import LegalPage, { LegalValue, Section } from '../components/legal/LegalPage.jsx'
import { LEGAL, SITE } from '../config/site.js'
import usePageMeta from '../hooks/usePageMeta.js'

const TOC = [
  { id: 'titular', label: '1. Titular (aviso legal)' },
  { id: 'objeto', label: '2. Objeto' },
  { id: 'cuenta', label: '3. Registro y cuenta' },
  { id: 'uso', label: '4. Uso aceptable' },
  { id: 'foro', label: '5. Foro de la comunidad' },
  { id: 'ia', label: '6. Asistente de IA' },
  { id: 'datos-mercado', label: '7. Datos de mercado y normativa' },
  { id: 'documentos', label: '8. Documentos subidos' },
  { id: 'propiedad', label: '9. Propiedad intelectual' },
  { id: 'responsabilidad', label: '10. Responsabilidad' },
  { id: 'baja', label: '11. Suspensión y baja' },
  { id: 'ley', label: '12. Ley aplicable' },
]

export default function TermsPage() {
  usePageMeta({
    title: 'Aviso legal y condiciones de uso',
    description: 'Aviso legal de agropelink.es y condiciones de uso de la plataforma Agropelink: cuenta, foro, asistente de IA, datos de mercado y responsabilidades.',
    path: '/terminos',
  })

  return (
    <LegalPage
      eyebrow="Legal"
      title="Aviso legal y condiciones de uso"
      intro="Estas condiciones regulan el acceso a agropelink.es y el uso de la plataforma Agropelink. Al registrarte o usar el servicio las aceptas; si no estás de acuerdo, no utilices la plataforma."
      toc={TOC}
    >
      <Section id="titular" title="1. Datos del titular (LSSI-CE, art. 10)">
        <ul>
          <li><strong>Titular:</strong> <LegalValue value={LEGAL.owner} label="titular" /> ({LEGAL.ownerType})</li>
          <li><strong>NIF:</strong> <LegalValue value={LEGAL.taxId} label="NIF" /></li>
          <li><strong>Domicilio fiscal:</strong> <LegalValue value={LEGAL.address} label="domicilio" /></li>
          {LEGAL.registry && <li><strong>Datos registrales:</strong> {LEGAL.registry}</li>}
          <li><strong>Email de contacto:</strong> <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></li>
          <li><strong>Dominio:</strong> {LEGAL.domain}</li>
        </ul>
      </Section>

      <Section id="objeto" title="2. Objeto del servicio">
        <p>Agropelink es una plataforma digital para la gestión de explotaciones agrícolas: registro de parcelas, tareas y documentos, asistente agronómico con inteligencia artificial, información meteorológica y de mercado, y un foro de la comunidad.</p>
      </Section>

      <Section id="cuenta" title="3. Registro y cuenta de usuario">
        <ul>
          <li>Debes ser mayor de edad y facilitar datos veraces.</li>
          <li>Tus credenciales son personales e intransferibles. Elige una contraseña robusta y avísanos en <a href={`mailto:${SITE.email}`}>{SITE.email}</a> si sospechas de un uso no autorizado.</li>
          <li>Eres responsable de la actividad realizada desde tu cuenta.</li>
        </ul>
      </Section>

      <Section id="uso" title="4. Uso aceptable">
        <p>Queda prohibido:</p>
        <ul>
          <li>Usar la plataforma con fines ilícitos o contrarios a estas condiciones.</li>
          <li>Intentar acceder a cuentas o datos ajenos, eludir medidas de seguridad o introducir software malicioso.</li>
          <li>Extraer datos de forma masiva o automatizada sin autorización.</li>
          <li>Suplantar a otras personas o entidades.</li>
        </ul>
      </Section>

      <Section id="foro" title="5. Foro de la comunidad">
        <ul>
          <li>Eres responsable de lo que publicas. No se permite contenido ilegal, ofensivo, publicitario no autorizado ni que vulnere derechos de terceros.</li>
          <li>No recomiendes productos fitosanitarios no autorizados ni usos distintos a los indicados en su etiqueta.</li>
          <li>Nos concedes una licencia no exclusiva y gratuita para mostrar tus publicaciones en la plataforma mientras permanezcan publicadas.</li>
          <li>Podemos retirar contenidos que incumplan estas normas y, en casos graves o reiterados, suspender la cuenta.</li>
        </ul>
        <h3 id="condiciones-publicacion">Condiciones de publicación de imágenes y vídeos</h3>
        <ul>
          <li>Solo puedes subir fotos o vídeos propios o sobre los que tengas los derechos necesarios. Al marcar la declaración de derechos asumes toda la responsabilidad legal sobre su contenido; guardamos la fecha de esa aceptación.</li>
          <li>No publiques imágenes en las que aparezcan personas identificables sin su consentimiento, ni datos personales, matrículas o documentos.</li>
          <li>Formatos admitidos: PNG, JPEG y WEBP (hasta 5 MB) y MP4 (hasta 15 MB), un máximo de 4 por tema. Por seguridad y privacidad, las imágenes se vuelven a procesar y se eliminan sus metadatos (incluida la ubicación GPS), y en los vídeos se eliminan los metadatos de ubicación y autor.</li>
          <li>Los archivos que no se llegan a publicar se eliminan automáticamente a las 24 horas, y los de temas retirados por moderación dejan de mostrarse.</li>
        </ul>
      </Section>

      <Section id="ia" title="6. Asistente de inteligencia artificial">
        <ul>
          <li>Agropelink AI genera respuestas automáticas que pueden contener errores. Son <strong>orientativas</strong> y no sustituyen el criterio de un técnico, asesor en gestión integrada de plagas o profesional acreditado.</li>
          <li>El asistente solo <strong>propone</strong> acciones: tú decides si las apruebas. Antes de aplicar cualquier tratamiento, verifica la etiqueta del producto, sus plazos de seguridad y la normativa vigente.</li>
          <li>Más detalles en la <Link to="/privacidad#ia">política de privacidad</Link>.</li>
        </ul>
      </Section>

      <Section id="datos-mercado" title="7. Datos de mercado, clima y normativa">
        <p>La información meteorológica (Open-Meteo), de carburantes (Ministerio para la Transición Ecológica), las cotizaciones de referencia y el radar de normativa tienen carácter <strong>informativo y orientativo</strong>. Pueden contener retrasos o inexactitudes y no constituyen asesoramiento jurídico, financiero ni oferta comercial.</p>
      </Section>

      <Section id="documentos" title="8. Documentos que subes">
        <p>Garantizas que tienes derecho a subir los documentos (albaranes, facturas, etc.) y que no contienen datos de terceros sin base legal. Solo se admiten PDF e imágenes con un tamaño máximo y se almacenan de forma privada.</p>
      </Section>

      <Section id="propiedad" title="9. Propiedad intelectual e industrial">
        <p>La marca Agropelink, el diseño, el software y los contenidos propios de la web pertenecen a su titular o a sus licenciantes. No está permitida su reproducción o explotación sin autorización, salvo el uso personal necesario para utilizar el servicio.</p>
      </Section>

      <Section id="responsabilidad" title="10. Disponibilidad y responsabilidad">
        <p>Trabajamos para que la plataforma esté disponible y sea segura, pero no garantizamos la ausencia de interrupciones o errores. No respondemos de las decisiones agronómicas o comerciales tomadas a partir de la información orientativa del servicio, ni de los contenidos publicados por usuarios en el foro, salvo en los casos en que la ley no permita excluir esta responsabilidad.</p>
      </Section>

      <Section id="baja" title="11. Suspensión y baja">
        <p>Puedes solicitar la baja de tu cuenta en cualquier momento escribiendo a <a href={`mailto:${SITE.email}`}>{SITE.email}</a>. Podemos suspender cuentas que incumplan estas condiciones, informando del motivo salvo impedimento legal.</p>
      </Section>

      <Section id="ley" title="12. Legislación aplicable y jurisdicción">
        <p>Estas condiciones se rigen por la legislación española. Para cualquier controversia, las partes se someten a los juzgados y tribunales que correspondan conforme a la ley; si actúas como consumidor, los de tu domicilio.</p>
      </Section>
    </LegalPage>
  )
}
