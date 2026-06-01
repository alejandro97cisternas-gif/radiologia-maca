import { useEffect, useState } from 'react'
import { Badge, Popover, List, Button, Typography, Empty } from 'antd'
import { BellOutlined, CheckOutlined } from '@ant-design/icons'
import { getNotificaciones, leerTodas } from '../api/notificaciones'
import type { Notificacion } from '../api/notificaciones'

export default function NotificacionesBell() {
  const [notifs, setNotifs] = useState<Notificacion[]>([])
  const [open, setOpen] = useState(false)

  const cargar = () => getNotificaciones().then(setNotifs).catch(() => {})

  useEffect(() => {
    cargar()
    const interval = setInterval(cargar, 30_000)
    return () => clearInterval(interval)
  }, [])

  const noLeidas = notifs.filter(n => !n.leida).length

  const handleLeerTodas = async () => {
    await leerTodas()
    setNotifs(prev => prev.map(n => ({ ...n, leida: true })))
  }

  const content = (
    <div style={{ width: 320 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Typography.Text strong>Notificaciones</Typography.Text>
        {noLeidas > 0 && (
          <Button size="small" icon={<CheckOutlined />} onClick={handleLeerTodas}>
            Marcar todas leídas
          </Button>
        )}
      </div>
      {notifs.length === 0 ? (
        <Empty description="Sin notificaciones" imageStyle={{ height: 40 }} />
      ) : (
        <List
          size="small"
          dataSource={notifs.slice(0, 20)}
          renderItem={n => (
            <List.Item style={{ padding: '8px 0', opacity: n.leida ? 0.5 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                {!n.leida && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563EB', marginTop: 4, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1 }}>
                  <Typography.Text style={{ fontSize: 12 }}>{n.mensaje}</Typography.Text>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                    {new Date(n.creado_en).toLocaleString('es-CL')}
                  </div>
                </div>
              </div>
            </List.Item>
          )}
        />
      )}
    </div>
  )

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={v => { setOpen(v); if (v) cargar() }}
      placement="bottomRight"
    >
      <Badge count={noLeidas} size="small">
        <Button
          type="text"
          icon={<BellOutlined style={{ fontSize: 18 }} />}
          style={{ display: 'flex', alignItems: 'center' }}
        />
      </Badge>
    </Popover>
  )
}
