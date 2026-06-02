/**
 * Gestiona el estado del tutorial multi-página.
 * Persiste en localStorage para sobrevivir navegaciones.
 */

export type TutorialFase = 'dashboard' | 'derivadores' | 'honorarios' | null

const KEY_FASE     = 'tutorial_doc_fase'
const KEY_COMPLETO = 'tutorial_doc_completo'

export const tutorial = {
  getFase: (): TutorialFase => localStorage.getItem(KEY_FASE) as TutorialFase,
  setFase: (f: TutorialFase) => f ? localStorage.setItem(KEY_FASE, f) : localStorage.removeItem(KEY_FASE),
  isCompleto: () => !!localStorage.getItem(KEY_COMPLETO),
  completar: () => { localStorage.setItem(KEY_COMPLETO, '1'); localStorage.removeItem(KEY_FASE) },
  reiniciar: () => { localStorage.removeItem(KEY_COMPLETO); localStorage.setItem(KEY_FASE, 'dashboard') },
}
