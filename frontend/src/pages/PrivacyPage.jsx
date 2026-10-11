import LegalPage, { DataTable, LegalValue, Section } from '../components/legal/LegalPage.jsx'
import { LEGAL, SITE } from '../config/site.js'
import { CookieSettingsLink } from '../consent/CookieBanner.jsx'
import usePageMeta from '../hooks/usePageMeta.js'

const TOC = [
  { id: 'responsable', label: '1. Responsable' },
  { id: 'datos', label: '2. Datos que tratamos' },
  { id: 'finalidades', label: '3. Finalidades y base jurídica' },
  { id: 'conservacion', label: '4. Conservación' },
  { id: 'destinatarios', label: '5. Destinatarios' },
  { id: 'ia', label: '6. Inteligencia artificial' },
  { id: 'derechos', label: '7. Tus derechos' },
  { id: 'cookies', label: '8. Cookies' },
  { id: 'seguridad', label: '9. Seguridad' },
  { id: 'cambios', label: '10. Cambios' },
]

export default function PrivacyPage() {
  usePageMeta({
    title: 'Política de privacidad',
    description: 'Cómo trata Agropelink tus datos personales: responsable, finalidades, derechos RGPD, cookies y transparencia en el uso de inteligencia artificial.',
  })

  return (
    <LegalPage
      eyebrow="Legal"
      title="Política de privacidad"
      intro="En Agropelink tratamos los datos de agricultores, técnicos y visitantes con la mínima intrusión posible. Esta política explica qué datos usamos, para qué, durante cuánto tiempo y cómo ejercer tus derechos conforme al Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD)."
      toc={TOC}
    >
      <Section id="responsable" title="1. Responsable del tratamiento">
        <ul>
          <li><strong>Responsable:</strong> <LegalValue value={LEGAL.owner} label="titular" /> ({LEGAL.ownerType})</li>
          <li><strong>NIF:</strong> <LegalValue value={LEGAL.taxId} label="NIF" /></li>
          <li><strong>Domicilio fiscal:</strong> <LegalValue value={LEGAL.address} label="domicilio" /></li>
          <li><strong>Sitio web:</strong> {LEGAL.domain}</li>
          <li><strong>Contacto de privacidad:</strong> <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></li>
          {LEGAL.dpoEmail && <li><strong>Delegado de Protección de Datos:</strong> <a href={`mailto:${LEGAL.dpoEmail}`}>{LEGAL.dpoEmail}</a></li>}
        </ul>
      </Section>

      <Section id="datos" title="2. Qué datos tratamos">
        <ul>
          <li><strong>Cuenta:</strong> nombre, email, fecha de nacimiento (solo para verificar que eres mayor de 18 años; el servicio no está dirigido a menores) y contraseña (guardada solo como hash Argon2id; nunca en claro).</li>
          <li><strong>Moderación:</strong> advertencias y, en su caso, motivo y fecha de la suspensión de la cuenta por incumplir las normas del foro.</li>
          <li><strong>Explotación:</strong> granjas y parcelas (dimensiones, cosechas, programaciones, laboratorios, insumos, presupuesto y foto de la instalación, sin metadatos de ubicación), lecturas de riego y humedad, tareas y documentos que subas (albaranes, facturas). Los documentos se clasifican en nuestro propio servidor, sin enviarlos a terceros.</li>
          <li><strong>Equipo de la explotación:</strong> nombre y puesto de los operarios que el agricultor registre (sin datos de contacto ni identificadores). El agricultor es responsable de informar a sus trabajadores.</li>
          <li><strong>Contacto:</strong> nombre, teléfono, email y mensaje del formulario.</li>
          <li><strong>Foro:</strong> tu nombre público y lo que publiques. Tu email nunca se muestra.</li>
          <li><strong>Asistente IA:</strong> los mensajes que escribas a Agropelink AI.</li>
          <li><strong>Datos técnicos:</strong> cookie de sesión y dirección IP en registros de seguridad (p. ej. para frenar intentos de acceso por fuerza bruta).</li>
        </ul>
        <p>No tratamos categorías especiales de datos ni elaboramos perfiles con fines publicitarios.</p>
      </Section>

      <Section id="finalidades" title="3. Finalidades y base jurídica">
        <DataTable
          caption="Finalidades del tratamiento y su base jurídica"
          head={['Finalidad', 'Base jurídica (RGPD)']}
          rows={[
            ['Crear y gestionar tu cuenta y prestar la plataforma', 'Ejecución del contrato (art. 6.1.b)'],
            ['Responder a tu solicitud de contacto o demo', 'Consentimiento (art. 6.1.a) y medidas precontractuales (art. 6.1.b)'],
            ['Publicar tus aportaciones en el foro', 'Ejecución del contrato (art. 6.1.b)'],
            ['Asistente agronómico de IA (Agropelink AI)', 'Ejecución del contrato (art. 6.1.b): lo usas por iniciativa propia, y cada acción que propone requiere tu aprobación expresa'],
            ['Seguridad: prevención de fraude y accesos no autorizados', 'Interés legítimo (art. 6.1.f)'],
            ['Analítica de uso de la web pública', 'Consentimiento (art. 6.1.a), solo si lo aceptas'],
            ['Mostrar el feed de Instagram (contenido de terceros)', 'Consentimiento (art. 6.1.a), solo si lo aceptas'],
          ]}
        />
      </Section>

      <Section id="conservacion" title="4. Plazo de conservación">
        <ul>
          <li><strong>Cuenta y datos de explotación:</strong> mientras la cuenta esté activa; después, bloqueados durante los plazos legales de prescripción.</li>
          <li><strong>Mensajes de contacto:</strong> hasta 12 meses si no se inicia relación comercial.</li>
          <li><strong>Sesiones:</strong> 7 días como máximo; se eliminan al cerrar sesión.</li>
          <li><strong>Registros de seguridad:</strong> el tiempo imprescindible para detectar y resolver incidentes.</li>
        </ul>
      </Section>

      <Section id="destinatarios" title="5. Destinatarios y encargados del tratamiento">
        <p>No vendemos ni cedemos tus datos. Para prestar el servicio contamos con proveedores que actúan como encargados del tratamiento bajo contrato:</p>
        <ul>
          <li><strong>Alojamiento e infraestructura:</strong> <LegalValue value={LEGAL.hosting} label="proveedor de hosting" />.</li>
          <li><strong>Correo electrónico:</strong> proveedor del buzón {SITE.email} para gestionar los contactos.</li>
          <li><strong>Google (API de Gemini):</strong> procesa los mensajes del asistente Agropelink AI para generar respuestas.</li>
          <li><strong>Elfsight:</strong> solo si aceptas el contenido de terceros, para mostrar el feed de Instagram.</li>
          <li><strong>Google Fonts y Open-Meteo:</strong> tu navegador les solicita tipografías y datos meteorológicos, lo que les comunica tu dirección IP.</li>
        </ul>
        <p>
          Algunos proveedores pueden tratar datos fuera del Espacio Económico Europeo. En ese caso se aplican garantías adecuadas:
          decisiones de adecuación (como el Marco de Privacidad de Datos UE-EE. UU.) o cláusulas contractuales tipo de la Comisión Europea.
        </p>
      </Section>

      <Section id="ia" title="6. Transparencia en el uso de inteligencia artificial">
        <ul>
          <li><strong>Uso voluntario y con tu consentimiento.</strong> El asistente solo se activa cuando abres el chat y le escribes; no analiza tu cuenta por su cuenta ni en segundo plano.</li>
          <li><strong>Sabrás cuándo hablas con una IA.</strong> Agropelink AI es un asistente automático basado en un modelo de lenguaje de Google (Gemini) y se identifica siempre como tal.</li>
          <li><strong>Supervisión humana obligatoria.</strong> El asistente solo propone acciones (por ejemplo, crear una tarea). Ninguna se ejecuta sin tu aprobación expresa en la tarjeta «Confirmación requerida».</li>
          <li><strong>Sin decisiones automatizadas</strong> con efectos jurídicos o significativos sobre ti (art. 22 RGPD).</li>
          <li><strong>Recomendaciones orientativas.</strong> Las respuestas pueden contener errores y no sustituyen el criterio de un técnico o asesor acreditado.</li>
          <li><strong>Formulario de contacto:</strong> podemos usar herramientas de IA para clasificar y agilizar la respuesta a tu consulta, siempre revisada por una persona.</li>
          <li><strong>Consejo:</strong> no incluyas en el chat datos personales de terceros ni información que no sea necesaria.</li>
        </ul>
      </Section>

      <Section id="derechos" title="7. Tus derechos">
        <p>Como titular de tus datos puedes ejercer en cualquier momento tus derechos de:</p>
        <ul>
          <li><strong>Acceso:</strong> saber qué datos tuyos tratamos.</li>
          <li><strong>Rectificación:</strong> corregir datos inexactos o incompletos.</li>
          <li><strong>Supresión:</strong> pedir que eliminemos tus datos.</li>
          <li><strong>Oposición:</strong> oponerte a un tratamiento concreto.</li>
          <li>Además, <strong>limitación del tratamiento</strong>, <strong>portabilidad</strong> y <strong>retirada del consentimiento</strong>, sin que afecte a la licitud del tratamiento previo.</li>
        </ul>
        <p>
          Para ejercerlos, escribe a{' '}
          <a href={`mailto:${LEGAL.email}?subject=${encodeURIComponent(LEGAL.rightsSubject)}`}>{LEGAL.email}</a> con la referencia{' '}
          <strong>«{LEGAL.rightsSubject}»</strong> en el asunto, indicando el derecho que quieres ejercer. Si no podemos verificar tu identidad,
          podremos pedirte información adicional. Respondemos en el plazo máximo de un mes.
        </p>
        <p>Si consideras que no hemos atendido correctamente tu solicitud, puedes reclamar ante la <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">Agencia Española de Protección de Datos</a>.</p>
      </Section>

      <Section id="cookies" title="8. Cookies y almacenamiento local">
        <p>Solo usamos las cookies imprescindibles salvo que aceptes otras categorías en el banner de consentimiento.</p>
        <DataTable
          caption="Cookies y almacenamiento utilizados"
          head={['Nombre', 'Tipo', 'Finalidad', 'Duración']}
          rows={[
            ['__Host-agropelink_session', 'Propia · necesaria', 'Mantener tu sesión iniciada (HttpOnly, Secure, SameSite=Lax)', '7 días'],
            ['agropelink_consent', 'Propia · necesaria (localStorage)', 'Recordar tu elección sobre cookies', '12 meses'],
            ['Analítica', 'Terceros · opcional', 'Medición agregada de visitas, solo si la aceptas', 'Según proveedor'],
            ['Elfsight / Instagram', 'Terceros · opcional', 'Mostrar el feed de Instagram, solo si lo aceptas', 'Según proveedor'],
          ]}
        />
        <p>
          Puedes cambiar tu elección en cualquier momento:{' '}
          <CookieSettingsLink className="font-medium text-secondary-300 underline underline-offset-2" />.
        </p>
      </Section>

      <Section id="seguridad" title="9. Seguridad">
        <p>Aplicamos medidas técnicas y organizativas adecuadas: cifrado en tránsito, contraseñas con Argon2id, sesiones en cookies HttpOnly revocables, protección frente a fuerza bruta y CSRF, y almacenamiento privado de documentos con validación de tipo y tamaño.</p>
      </Section>

      <Section id="cambios" title="10. Cambios en esta política">
        <p>Podemos actualizar esta política para reflejar cambios legales o del servicio. Publicaremos la versión vigente en esta página con su fecha de actualización y, si el cambio es relevante, te lo comunicaremos.</p>
      </Section>
    </LegalPage>
  )
}
