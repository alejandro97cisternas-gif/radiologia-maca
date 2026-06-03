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
            description: '<b>Calendario</b> (vista principal): casos por día en vista mes o semana.<br><b>Board</b>: kanban por estado (Pendiente / En proceso / Completado).<br><b>Tabla</b>: listado con filtros de búsqueda.',
            side: 'bottom',
          },
        },
        {
          element: '#vista-selector',
          popover: {
            title: '📅 Vista Calendario',
            description: 'Alterna entre <b>Mes</b> y <b>Semana</b>. Cada caso aparece el día que lo envió el derivador.<br><br>Los casos están ordenados por <b>orden de llegada</b> (🕐 #01 = más antiguo, tiene prioridad). Las horas usan <b>zona horaria Chile</b>.',
            side: 'bottom',
          },
        },
        {
          element: '#board-pendiente',
          popover: {
            title: '🟡 Casos Pendientes',
            description: 'Cada tarjeta representa un <b>caso completo</b> — puede contener varios exámenes (ej: Análisis de Ricketts + CBCT-LOC). <b>Al hacer clic</b> el caso pasa automáticamente a "En Proceso" y se abre el panel de detalle.',
            side: 'right',
          },
        },
        {
          element: '#board-en-proceso',
          popover: {
            title: '🔵 En Proceso',
            description: 'Casos que estás trabajando. Puedes <b>arrastrar</b> entre columnas para cambiar el estado de todos los exámenes del caso a la vez.',
            side: 'right',
          },
        },
        {
          element: '#board-completado',
          popover: {
            title: '✅ Completados',
            description: 'Casos con todos los informes subidos. Una vez subidos todos, usa el botón <b>Enviar informes al derivador</b> para notificarle por email.',
            side: 'left',
          },
        },
        {
          element: '#board-pendiente',
          popover: {
            title: '📋 Panel del caso',
            description: 'Al abrir un caso verás <b>una sección por cada examen</b>:<br>• Pestaña <b>Imágenes 2D</b> y <b>DICOM</b><br>• Botón <b>Subir informe PDF</b> individual por examen<br>• Botón <b>Descargar ZIP</b> (una carpeta por tipo de examen)<br>• <b>Incidencias</b> por examen',
            side: 'top',
          },
        },
        {
          popover: {
            title: '🔢 Versiones',
            description: 'Cada examen muestra su versión (<b>v0, v1…</b>). Si ves <b>v1+</b> en naranja, el derivador actualizó las imágenes de ese examen.',
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
          tutorial.setFase('derivadores')
          navigate('/derivadores')
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
          popover: {
            title: '🔗 Portal del derivador',
            description: '1. Generas el link → se envía por email<br>2. El derivador abre el link → accede a su portal<br>3. Sube casos con imágenes y recibe los informes<br>4. Si el link expira, puede pedir uno nuevo ingresando su email.',
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
          tutorial.setFase('honorarios')
          navigate('/honorarios')
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
            description: 'Al final de cada pestaña puedes:<br>• <b>Agregar examen</b>: precio individual con búsqueda inteligente (busca por palabras, sin tildes)<br>• <b>Por categoría</b>: aplica el mismo precio a todos los exámenes de una categoría (ej: todos los Análisis de Cefalometría)<br><br>Solo los tipos con tarifa configurada estarán disponibles para ese centro.',
            side: 'top',
          },
        },
        {
        {
          popover: {
            title: '🤝 Convenios de descuento',
            description: 'Debajo de las tarifas puedes configurar <b>convenios</b> por categoría:<br>• 1° examen: precio completo<br>• 2° examen del mismo tipo en el caso: precio − descuento 2<br>• 3°+ examen: precio − descuento 3<br><br>El descuento se aplica automáticamente al calcular honorarios.',
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
          tutorial.completar()
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
