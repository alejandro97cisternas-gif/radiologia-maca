import { useEffect } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

const STORAGE_KEY = 'tutorial_doctora_visto'

export function useTutorialDoctora(skip = false) {
  useEffect(() => {
    if (skip) return
    if (localStorage.getItem(STORAGE_KEY)) return

    // Esperar a que el DOM esté renderizado
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
            element: '#menu-dashboard',
            popover: {
              title: 'Dashboard de exámenes',
              description: 'Aquí verás todos los exámenes que llegan desde los derivadores. Puedes filtrarlos por estado.',
              side: 'right',
            },
          },
          {
            element: '#vista-selector',
            popover: {
              title: 'Vistas disponibles',
              description: 'Cambia entre vista Board (kanban), Tabla o Calendario según tu preferencia de trabajo.',
              side: 'bottom',
            },
          },
          {
            element: '#board-pendiente',
            popover: {
              title: 'Columna Pendiente',
              description: 'Los exámenes nuevos aparecen aquí. Al hacer clic en uno lo pasas automáticamente a "En Proceso".',
              side: 'right',
            },
          },
          {
            element: '#board-en-proceso',
            popover: {
              title: 'En Proceso',
              description: 'Exámenes que estás trabajando actualmente. Puedes arrastrarlos entre columnas.',
              side: 'right',
            },
          },
          {
            element: '#board-completado',
            popover: {
              title: 'Completado',
              description: 'Exámenes con informe subido y notificados al derivador.',
              side: 'left',
            },
          },
          {
            element: '#menu-derivadores',
            popover: {
              title: 'Derivadores',
              description: 'Gestiona tus centros derivadores. Desde aquí envías el enlace de acceso al portal a cada derivador.',
              side: 'right',
            },
          },
          {
            element: '#menu-honorarios',
            popover: {
              title: 'Honorarios',
              description: 'Configura tarifas por tipo de examen para cada derivador y genera informes de honorarios mensuales en PDF.',
              side: 'right',
            },
          },
          {
            element: '#btn-tutorial',
            popover: {
              title: '¿Necesitas ayuda?',
              description: 'Puedes volver a ver este tutorial en cualquier momento desde aquí.',
              side: 'bottom',
            },
          },
        ],
      })

      driverObj.drive()
    }, 800)

    return () => clearTimeout(timer)
  }, [skip])
}

export function reiniciarTutorialDoctora() {
  localStorage.removeItem(STORAGE_KEY)
}
