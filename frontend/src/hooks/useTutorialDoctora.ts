import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { tutorial } from './tutorialManager'

// ── Fase 1: Dashboard ─────────────────────────────────────────────────────────

export function useTutorialDashboard(loading: boolean) {
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (tutorial.isCompleto()) return
    // Iniciar si no hay fase activa (primer ingreso) o si la fase es dashboard
    const fase = tutorial.getFase()
    if (fase !== null && fase !== 'dashboard') return

    const timer = setTimeout(() => {
      const d = driver({
        showProgress: true,
        progressText: '{{current}} de {{total}}',
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: 'Ir a Derivadores →',
        onDestroyStarted: () => {
          // Al terminar esta fase, navegar a derivadores
          tutorial.setFase('derivadores')
          d.destroy()
          navigate('/derivadores')
        },
        steps: [
          {
            popover: {
              title: '👋 Bienvenida al sistema',
              description: 'Este tutorial te guiará por las funciones principales. Puedes saltarlo en cualquier momento con <b>Esc</b> o reiniciarlo con el botón <b>?</b> del header.',
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
              description: 'Al hacer clic en una tarjeta verás:<br>• <b>Imágenes</b> organizadas por tipo (2D, DICOM, Preview)<br>• Botón <b>Descargar ZIP</b> con todas las imágenes<br>• Botón <b>Subir informe PDF</b> — al subirlo el examen pasa a Completado y se notifica al derivador automáticamente<br>• <b>Incidencias</b> si el derivador reportó algún problema',
              side: 'top',
            },
          },
          {
            element: '#board-pendiente',
            popover: {
              title: '🔢 Versiones',
              description: 'Las tarjetas muestran una etiqueta de versión (<b>v0, v1, v2...</b>). Cada vez que el derivador modifica las imágenes del caso, la versión sube. Si ves <b>v1+</b> en naranja, el derivador actualizó algo.',
              side: 'top',
            },
          },
        ],
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
      const d = driver({
        showProgress: true,
        progressText: '{{current}} de {{total}}',
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: 'Ir a Honorarios →',
        onDestroyStarted: () => {
          tutorial.setFase('honorarios')
          d.destroy()
          navigate('/honorarios')
        },
        steps: [
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
              description: 'Crea un nuevo centro clínico. Necesitas su <b>nombre</b>, <b>email</b> y puedes asignarle un <b>color</b> para identificarlo visualmente en el board.<br><br>💡 <i>Ahora crea un derivador de prueba para continuar el tutorial.</i>',
              side: 'bottom',
            },
          },
          {
            element: '#col-color',
            popover: {
              title: '🎨 Color del derivador',
              description: 'El color aparece en el borde de las tarjetas del board y en los emails. Útil para identificar rápidamente de qué clínica proviene cada examen.',
              side: 'left',
            },
          },
          {
            element: '#col-acciones',
            popover: {
              title: '⚙️ Acciones disponibles',
              description: '<b>Editar</b>: modifica nombre, email, teléfono o color.<br><b>Generar link portal</b>: envía un email al derivador con un enlace único de acceso a su portal (válido 24h, un solo uso).<br><b>Desactivar</b>: el derivador deja de aparecer y no puede acceder al portal.',
              side: 'left',
            },
          },
          {
            element: '#col-acciones',
            popover: {
              title: '🔗 Cómo funciona el portal del derivador',
              description: '1. Generas el link → se envía por email<br>2. El derivador abre el link → accede a <b>susubdominio.novex.cloud</b><br>3. Desde ahí sube casos con imágenes y recibe los informes<br>4. Si el link expira, puede pedir uno nuevo desde la pantalla de acceso ingresando su email.',
              side: 'left',
            },
          },
        ],
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
      const d = driver({
        showProgress: true,
        progressText: '{{current}} de {{total}}',
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: '¡Entendido! Empezar a usar el sistema ✓',
        onDestroyStarted: () => {
          tutorial.completar()
          d.destroy()
        },
        steps: [
          {
            popover: {
              title: '💰 Módulo de Honorarios',
              description: 'Aquí configuras las tarifas por tipo de examen para cada clínica y generas los informes de honorarios mensuales en PDF.',
            },
          },
          {
            element: '#honorarios-selector-periodo',
            popover: {
              title: '📅 Selector de período',
              description: 'Selecciona el mes que quieres calcular. El sistema filtra automáticamente los exámenes <b>completados</b> en ese período.',
              side: 'bottom',
            },
          },
          {
            element: '#honorarios-tabs',
            popover: {
              title: '🏥 Pestaña por clínica',
              description: 'Cada derivador tiene su propia pestaña con su resumen de honorarios del período seleccionado.',
              side: 'top',
            },
          },
          {
            element: '#btn-calcular',
            popover: {
              title: '🧮 Calcular honorarios',
              description: 'Calcula el total del período basado en los exámenes completados y las tarifas configuradas. Genera un borrador que puedes revisar antes de enviar.',
              side: 'bottom',
            },
          },
          {
            element: '#btn-vista-previa',
            popover: {
              title: '👁️ Vista previa del PDF',
              description: 'Abre el informe de honorarios en PDF antes de enviarlo. Muestra el detalle de cada examen con su fecha, paciente, tipo y precio.',
              side: 'bottom',
            },
          },
          {
            element: '#btn-enviar-clinica',
            popover: {
              title: '📧 Enviar a la clínica',
              description: 'Envía el PDF de honorarios por email al derivador. El estado cambia a <b>ENVIADO</b> y queda registrado.',
              side: 'bottom',
            },
          },
          {
            element: '#btn-agregar-examen',
            popover: {
              title: '➕ Configurar tarifas',
              description: 'Aquí defines el precio de cada tipo de examen para esta clínica.<br><br>Al agregar un tipo puedes:<br>• Seleccionar un tipo existente (PANO, CBCT, RETRO...)<br>• <b>Crear uno nuevo</b> con su dimensión (2D, 3D o Ambos)<br>• Asignar el precio en CLP',
              side: 'top',
            },
          },
          {
            element: '#tabla-tarifas',
            popover: {
              title: '📋 Tabla de tarifas',
              description: 'Muestra los tipos de examen configurados para esta clínica con sus precios. Puedes eliminar un tipo si ya no aplica.',
              side: 'top',
            },
          },
        ],
      })
      d.drive()
    }, 600)

    return () => clearTimeout(timer)
  }, [])
}

// ── Botón reiniciar (exportado para el header) ────────────────────────────────

export function reiniciarTutorialDoctora() {
  tutorial.reiniciar()
}
