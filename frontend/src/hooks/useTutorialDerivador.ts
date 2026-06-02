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
