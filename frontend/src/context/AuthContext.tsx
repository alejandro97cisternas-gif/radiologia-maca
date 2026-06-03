import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getMe } from '../api/auth'

interface AuthState {
  token: string | null
  user: { id: number; username: string; nombre_display?: string } | null
  isLoading: boolean
  setToken: (t: string | null) => void
  logout: () => void
}

const AuthContext = createContext<AuthState>({} as AuthState)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem('token'))
  const [user, setUser] = useState<AuthState['user']>(null)
  const [isLoading, setIsLoading] = useState(true)

  const setToken = (t: string | null) => {
    setTokenState(t)
    if (t) localStorage.setItem('token', t)
    else localStorage.removeItem('token')
  }

  const logout = () => {
    setToken(null)
    setUser(null)
  }

  useEffect(() => {
    if (!token) { setIsLoading(false); return }
    getMe()
      .then(setUser)
      .catch(() => logout())
      .finally(() => setIsLoading(false))
  }, [token])

  return (
    <AuthContext.Provider value={{ token, user, isLoading, setToken, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
