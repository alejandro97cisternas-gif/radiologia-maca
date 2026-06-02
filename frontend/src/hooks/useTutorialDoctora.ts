import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { tutorial } from './tutorialManager'

// ── Helpers ───────────────────────────────────────────────────────────────────

function elExists(id: string) {
  return !!document.getElementById(id)
}

function filtrarSteps(steps: any[]) {
  return steps.filter(s => !s.element || elExists(s.element.replace('#', '')))
}

// ── Fase 1: Dashboard ─────────────────────────────────────────────────────────

export function useTutorialDashboard(loading: boolean) {
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (tutorial.isCompleto()) return
    const fase = tutorial.getFase()
    if (fase !== null && fase !== 'dashboard') return

    const timer = setTimeout(() => {
      // Flag para saber si el usuario completó o escapó
      let completado = false

      const steps = [
        {
          popover: {
            title: '👋 Bienvenida al sistema',
            description: 'Este tutorial te guiará por las funciones principales. Puedes reiniciarlo en cualquier momento con el botón <b>?</b> del header.',
          },
        },
        {
          element: '#vista-selector',
          popover: {
            title: '📊 Vistas del dashboard',
            description: '<b>Board</b>: vista kanban con columnas por estado.<br><b>Tabla</b>: listado con filtros.<br><b>Calendario</b>: exámenes por día del mes.',
            side: 'bottom',
          },
        },
        {
          element: '#board-pendiente',
          popover: {
            title: '🟡 Exámenes Pendientes',
            description: 'Aquí llegan los nuevos casos enviados por tus derivadores. <b>Al hacer clic en una tarjeta</b> la pasas automáticamente a "En Proceso" y se abre el panel de detalle.',
            side: 'right',
          },
        },
        {
          element: '#board-en-proceso',
          popover: {
            title: '🔵 En Proceso',
            description: 'Exámenes que estás trabajando. Puedes <b>arrastrar tarjetas</b> entre columnas o cambiar el estado desde el panel de detalle.',
            side: 'right',
          },
        },
        {
          element: '#board-completado',
          popover: {
            title: '✅ Completados',
            description: 'Exámenes con informe subido. El derivador recibe una notificación automática por email con el enlace al PDF.',
            side: 'left',
          },
        },
        {
          element: '#board-pendiente',
          popover: {
            title: '📋 Panel de examen',
            description: 'Al hacer clic en una tarjeta verás:<br>• <b>Imágenes</b> por tipo (2D, DICOM, Preview)<br>• Botón <b>Descargar ZIP</b> con todas las imágenes<br>• Botón <b>Subir informe PDF</b> — al subirlo el examen pasa a Completado y se notifica al derivador<br>• <b>Incidencias</b> si el derivador reportó algún problema',
            side: 'top',
          },
        },
        {
          element: '#board-pendiente',
          popover: {
            title: '🔢 Versiones',
            description: 'Las tarjetas muestran una etiqueta de versión (<b>v0, v1, v2...</b>). Si ves <b>v1+</b> en naranja, el derivador actualizó las imágenes del caso.',
            side: 'top',
            onNextClick: () => {
              completado = true
              d.destroy()
            },
          },
        },
      ]

      const d = driver({
        showProgress: true,
        progressText: '{{current}} de {{total}}',
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: 'Ir a Derivadores →',
        allowClose: false,
        steps: filtrarSteps(steps),
        onDestroyed: () => {
          if (completado) {
            tutorial.setFase('derivadores')
            navigate('/derivadores')
          }
        },
      })
      d.drive()
    }, 600)

    return () => clearTimeout(timer)
  }, [loading])
}

// ── Fase 2: Derivadores ───────────────────────────────────────────────────────

export function useTutorialDerivadores() {
  const navigate = useNavigate()

  useEffect(() => {
    if (tutorial.getFase() !== 'derivadores') return

    const timer = setTimeout(() => {
      let completado = false

      const steps = [
        {
          popover: {
            title: '🏥 Módulo de Derivadores',
            description: 'Aquí gestionas los centros clínicos que te envían pacientes. Cada derivador tiene su propio <b>portal de acceso</b> con subdominio único.',
          },
        },
        {
          element: '#btn-nuevo-derivador',
          popover: {
            title: '➕ Crear derivador',
            description: 'Crea un nuevo centro clínico. Necesitas su <b>nombre</b>, <b>email</b> y puedes asignarle un <b>color</b> para identificarlo en el board.<br><br>💡 <i>Cuando el tutorial termine, crea un derivador de prueba.</i>',
            side: 'bottom',
          },
        },
        {
          element: '#col-acciones',
          popover: {
            title: '⚙️ Acciones disponibles',
            description: '<b>Editar</b>: modifica nombre, email, teléfono o color.<br><b>Generar link portal</b>: envía email al derivador con enlace único (válido 24h).<br><b>Desactivar</b>: el derivador deja de aparecer y no puede acceder.',
            side: 'left',
          },
        },
        {
          element: '#col-acciones',
          popover: {
            title: '🔗 Portal del derivador',
            description: '1. Generas el link → se envía por email<br>2. El derivador abre el link → accede a su portal<br>3. Sube casos con imágenes y recibe los informes<br>4. Si el link expira, puede pedir uno nuevo ingresando su email.',
            side: 'left',
            onNextClick: () => {
              completado = true
              d.destroy()
            },
          },
        },
      ]

      const d = driver({
        showProgress: true,
        progressText: '{{current}} de {{total}}',
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: 'Ir a Honorarios →',
        allowClose: false,
        steps: filtrarSteps(steps),
        onDestroyed: () => {
          if (completado) {
            tutorial.setFase('honorarios')
            navigate('/honorarios')
          }
        },
      })
      d.drive()
    }, 600)

    return () => clearTimeout(timer)
  }, [])
}

// ── Fase 3: Honorarios ────────────────────────────────────────────────────────

export function useTutorialHonorarios() {
  useEffect(() => {
    if (tutorial.getFase() !== 'honorarios') return

    const timer = setTimeout(() => {
      let completado = false

      const steps = [
        {
          popover: {
            title: '💰 Módulo de Honorarios',
            description: 'Aquí configuras las tarifas por tipo de examen para cada clínica y generas informes de honorarios mensuales en PDF.',
          },
        },
        {
          element: '#honorarios-selector-periodo',
          popover: {
            title: '📅 Selector de período',
            description: 'Selecciona el mes que quieres calcular. El sistema filtra los exámenes <b>completados</b> en ese período.',
            side: 'bottom',
          },
        },
        {
          element: '#honorarios-tabs',
          popover: {
            title: '🏥 Pestaña por clínica',
            description: 'Cada derivador tiene su propia pestaña. Haz clic en una para ver su resumen de honorarios.',
            side: 'top',
          },
        },
        {
          element: '#honorarios-tabs',
          popover: {
            title: '🧮 Calcular y enviar',
            description: 'Dentro de cada pestaña encontrarás:<br>• <b>Calcular</b>: genera el borrador del período<br>• <b>Vista previa</b>: abre el PDF antes de enviarlo<br>• <b>Enviar a clínica</b>: envía el PDF por email al derivador',
            side: 'top',
          },
        },
        {
          element: '#honorarios-tabs',
          popover: {
            title: '➕ Configurar tarifas',
            description: 'Al final de cada pestaña hay una sección de tarifas. Aquí defines el precio de cada tipo de examen para esa clínica.<br><br>Puedes agregar tipos existentes (PANO, CBCT…) o <b>crear nuevos</b> con su dimensión (2D, 3D o Ambos) y precio en CLP.',
            side: 'top',
            onNextClick: () => {
              completado = true
              d.destroy()
            },
          },
        },
      ]

      const d = driver({
        showProgress: true,
        progressText: '{{current}} de {{total}}',
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: '¡Entendido! Empezar a usar el sistema ✓',
        allowClose: false,
        steps: filtrarSteps(steps),
        onDestroyed: () => {
          if (completado) tutorial.completar()
        },
      })
      d.drive()
    }, 600)

    return () => clearTimeout(timer)
  }, [])
}

// ── Reiniciar ─────────────────────────────────────────────────────────────────

export function reiniciarTutorialDoctora() {
  tutorial.reiniciar()
}
