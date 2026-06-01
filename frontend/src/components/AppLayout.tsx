import { ReactNode } from 'react'
import { Layout, Menu, Button, Typography } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'
import { CalendarOutlined, TeamOutlined, DollarOutlined, LogoutOutlined } from '@ant-design/icons'
import { useAuth } from '../context/AuthContext'
import NotificacionesBell from './NotificacionesBell'

const { Sider, Content, Header } = Layout

export default function AppLayout({ children, noPadding }: { children: ReactNode; noPadding?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()

  const items = [
    { key: '/', icon: <CalendarOutlined />, label: 'Dashboard' },
    { key: '/derivadores', icon: <TeamOutlined />, label: 'Derivadores' },
    { key: '/honorarios', icon: <DollarOutlined />, label: 'Honorarios' },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} style={{ background: '#1e3a5f' }}>
        <div style={{ padding: '20px 16px', color: '#fff', fontWeight: 700, fontSize: 15 }}>
          Radiología · Maca
        </div>
        <Menu
          theme="dark"
          selectedKeys={[location.pathname]}
          items={items}
          onClick={({ key }) => navigate(key)}
          style={{ background: '#1e3a5f', border: 'none' }}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <NotificacionesBell />
            <Button icon={<LogoutOutlined />} type="text" onClick={logout}>Cerrar sesión</Button>
          </div>
        </Header>
        <Content style={{
          padding: noPadding ? 0 : 24,
          background: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 64px)',
          overflow: 'auto',
        }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}
