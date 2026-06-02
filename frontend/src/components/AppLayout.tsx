import { ReactNode } from 'react'
import { Layout, Menu, Button } from 'antd'
import novexLogo from '/logonovex_t.png'
import { useNavigate, useLocation } from 'react-router-dom'
import { CalendarOutlined, TeamOutlined, DollarOutlined, LogoutOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { useAuth } from '../context/AuthContext'
import NotificacionesBell from './NotificacionesBell'
import { reiniciarTutorialDoctora } from '../hooks/useTutorialDoctora'

const { Sider, Content, Header, Footer } = Layout

export default function AppLayout({ children, noPadding }: { children: ReactNode; noPadding?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()

  const items = [
    { key: '/', icon: <CalendarOutlined />, label: <span id="menu-dashboard">Dashboard</span> },
    { key: '/derivadores', icon: <TeamOutlined />, label: <span id="menu-derivadores">Derivadores</span> },
    { key: '/honorarios', icon: <DollarOutlined />, label: <span id="menu-honorarios">Honorarios</span> },
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
            <Button
              id="btn-tutorial"
              icon={<QuestionCircleOutlined />}
              type="text"
              onClick={() => { reiniciarTutorialDoctora(); navigate('/') }}
              title="Ver tutorial"
            />
            <Button icon={<LogoutOutlined />} type="text" onClick={logout}>Cerrar sesión</Button>
          </div>
        </Header>
        <Content style={{
          padding: noPadding ? 0 : 24,
          background: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 64px - 36px)',
          overflow: 'auto',
        }}>
          {children}
        </Content>
        <Footer style={{
          height: 36,
          padding: '0 24px',
          background: '#fff',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}>
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#9CA3AF', fontWeight: 500 }}>Crafted by</span>
          <img src={novexLogo} alt="Novex" style={{ height: 16, width: 'auto' }} />
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#9CA3AF', fontWeight: 700 }}>Novex</span>
        </Footer>
      </Layout>
    </Layout>
  )
}
