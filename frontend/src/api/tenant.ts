const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'localhost'

export function getTenantSlug(): string | null {
  const host = window.location.hostname
  if (host === BASE_DOMAIN || host === `admin.${BASE_DOMAIN}`) return null
  if (host.endsWith(`.${BASE_DOMAIN}`)) {
    return host.slice(0, -(BASE_DOMAIN.length + 1))
  }
  // Dev local: leer de localStorage si no hay subdominio real
  return localStorage.getItem('dev_tenant_slug')
}
