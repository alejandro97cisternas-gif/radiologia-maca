import { useEffect } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

const STORAGE_KEY = 'tutorial_derivador_visto'

export function useTutorialDerivador(skip = false) {
  useEffect(() => {
    if (skip) return
    if (localStorage.getItem(STORAGE_KEY)) return

    const timer = setTimeout(() => {
      const driverObj = driver({
        showProgress: true,
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: 'Entendido ✓',
        progressText: '{{current}} de {{total}}',
        onDestroyed: () => localStorage.setItem(STORAGE_KEY, '1'),
        steps: [
          {
            element: '#portal-titulo',
            popover: {
              title: 'Bienvenido al portal',
              description: 'Este es el portal de tu clínica. Desde aquí envías casos a la doctora y recibes los informes.',
              side: 'bottom',
            },
          },
          {
            element: '#portal-nuevo-caso',
            popover: {
              title: 'Crear nuevo caso',
              description: 'Pulsa aquí para enviar un nuevo paciente con sus exámenes e imágenes a la doctora.',
              side: 'bottom',
            },
          },
          {
            element: '#portal-vista-selector',
            popover: {
              title: 'Vistas disponibles',
              description: 'Puedes ver tus casos en formato Board (kanban), Tabla o Calendario.',
              side: 'bottom',
            },
          },
          {
            element: '#portal-notificaciones',
            popover: {
              title: 'Notificaciones',
              description: 'Aquí recibirás avisos cuando la doctora suba el informe de uno de tus pacientes.',
              side: 'bottom',
            },
          },
          {
            element: '#portal-board',
            popover: {
              title: 'Tus casos',
              description: 'Cada tarjeta representa un examen. Haz clic en una tarjeta para ver las imágenes, modificar archivos o ver el informe cuando esté listo.',
              side: 'top',
            },
          },
          {
            element: '#portal-tarifas-link',
            popover: {
              title: 'Tarifas',
              description: 'Aquí puedes consultar los precios de cada tipo de examen que tiene asignados tu clínica.',
              side: 'right',
            },
          },
        ],
      })

      driverObj.drive()
    }, 800)

    return () => clearTimeout(timer)
  }, [skip])
}

export function reiniciarTutorialDerivador() {
  localStorage.removeItem(STORAGE_KEY)
}

// ── Tutorial Nuevo Caso (contextual por paso) ─────────────────────────────────

const KEYS_NC = ['tutorial_nc_p0', 'tutorial_nc_p1', 'tutorial_nc_p2']

const PASOS_CONFIG = [
  {
    key: 'tutorial_nc_p0',
    steps: [
      {
        element: '#campo-rut',
        popover: {
          title: '🔍 Paso 1 — Datos del paciente',
          description: 'Ingresa el <b>RUT</b> del paciente. Si ya existe en el sistema, sus datos se autocompletarán automáticamente.',
          side: 'bottom' as const,
        },
      },
      {
        element: '#campo-nombre',
        popover: {
          title: '👤 Nombre completo',
          description: 'Escribe el nombre completo del paciente tal como aparece en su documento de identidad.',
          side: 'bottom' as const,
        },
      },
      {
        element: '#campo-fecha',
        popover: {
          title: '📅 Fecha de nacimiento',
          description: 'Selecciona la fecha de nacimiento. Es obligatoria para identificar correctamente al paciente.',
          side: 'bottom' as const,
        },
      },
      {
        element: '#btn-sig-paciente',
        popover: {
          title: '✅ Continuar',
          description: 'Una vez completados los datos, haz clic aquí para pasar al paso de exámenes.',
          side: 'top' as const,
        },
      },
    ],
  },
  {
    key: 'tutorial_nc_p1',
    steps: [
      {
        element: '#selector-tipo',
        popover: {
          title: '🩻 Paso 2 — Tipo de examen',
          description: 'Selecciona el tipo de examen solicitado. Los exámenes están organizados por dimensión:<br>• <b>2D</b>: PANO, RETRO, BW-UNI…<br>• <b>3D (CBCT)</b>: requiere archivos DICOM<br>• <b>2D + 3D</b>: requiere ambos tipos de archivo',
          side: 'bottom' as const,
        },
      },
      {
        element: '#selector-tipo',
        popover: {
          title: '📁 Subir imágenes',
          description: 'Tras seleccionar el tipo, aparecerán las zonas de carga según la dimensión:<br>• <b>2D</b>: arrastra JPG/PNG<br>• <b>3D</b>: arrastra archivos .dcm + fotos de pantalla del DICOM<br>• <b>CBCT Bimaxilar</b>: carpeta Superior + Inferior + Preview',
          side: 'bottom' as const,
        },
      },
      {
        element: '#btn-agregar-otro',
        popover: {
          title: '➕ Múltiples exámenes',
          description: 'Puedes agregar varios exámenes al mismo caso. Por ejemplo PANO + CBCT en una sola visita.',
          side: 'top' as const,
        },
      },
      {
        element: '#btn-sig-examenes',
        popover: {
          title: '▶️ Continuar al resumen',
          description: 'Cuando hayas subido todas las imágenes, este botón se activa. Haz clic para revisar el caso antes de notificar.',
          side: 'top' as const,
        },
      },
    ],
  },
  {
    key: 'tutorial_nc_p2',
    steps: [
      {
        popover: {
          title: '📋 Paso 3 — Resumen del caso',
          description: 'Revisa que todos los exámenes e imágenes estén correctos antes de enviar.',
        },
      },
      {
        element: '#btn-notificar-doctora',
        popover: {
          title: '🔔 Notificar a la doctora',
          description: 'Al pulsar este botón:<br>1. El caso queda registrado como <b>Pendiente</b><br>2. La doctora recibe un email con los datos del paciente<br>3. Puedes ver el estado desde el panel principal<br>4. Cuando el informe esté listo, recibirás una notificación',
          side: 'top' as const,
        },
      },
    ],
  },
]

export function useTutorialNuevoCaso(paso: number) {
  useEffect(() => {
    const config = PASOS_CONFIG[paso]
    if (!config) return
    if (localStorage.getItem(config.key)) return

    const timer = setTimeout(() => {
      const d = driver({
        showProgress: true,
        progressText: '{{current}} de {{total}}',
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: 'Entendido ✓',
        onDestroyed: () => localStorage.setItem(config.key, '1'),
        steps: config.steps,
      })
      d.drive()
    }, 400)

    return () => clearTimeout(timer)
  }, [paso])
}

export function reiniciarTutorialNuevoCaso() {
  KEYS_NC.forEach(k => localStorage.removeItem(k))
}
