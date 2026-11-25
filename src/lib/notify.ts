// Notificações: no celular usa o plugin nativo do Capacitor;
// no navegador usa a Notification API.
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

const nativo = Capacitor.isNativePlatform()
let contador = 1

export type EstadoPermissao = 'concedida' | 'negada' | 'pendente' | 'indisponivel'

export async function estadoPermissao(): Promise<EstadoPermissao> {
  if (nativo) {
    const { display } = await LocalNotifications.checkPermissions()
    return display === 'granted' ? 'concedida' : display === 'denied' ? 'negada' : 'pendente'
  }
  if (typeof Notification === 'undefined') return 'indisponivel'
  if (Notification.permission === 'granted') return 'concedida'
  if (Notification.permission === 'denied') return 'negada'
  return 'pendente'
}

export async function pedirPermissao(): Promise<EstadoPermissao> {
  if (nativo) {
    await LocalNotifications.requestPermissions()
  } else if (typeof Notification !== 'undefined') {
    await Notification.requestPermission()
  }
  return estadoPermissao()
}

export async function notificar(titulo: string, corpo: string): Promise<void> {
  try {
    if ((await estadoPermissao()) !== 'concedida') return
    if (nativo) {
      await LocalNotifications.schedule({
        notifications: [{ id: contador++, title: titulo, body: corpo }],
      })
      return
    }
    const n = new Notification(titulo, { body: corpo })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch (e) {
    console.error('Erro ao mostrar notificação:', e)
  }
}
