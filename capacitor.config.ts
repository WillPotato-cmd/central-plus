import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'br.com.potato.centralplus',
  appName: 'Central+',
  webDir: 'dist',
  plugins: {
    // Android 15/16 desenha o app atrás das barras do sistema (edge-to-edge).
    // "css" faz o Capacitor informar a altura dessas barras ao app pelas
    // variáveis --safe-area-inset-*, usadas em src/styles.css.
    SystemBars: {
      insetsHandling: 'css',
      style: 'LIGHT', // ícones escuros na barra, sobre o fundo claro do app
    },
    LocalNotifications: {
      iconColor: '#4B6B4F',
    },
  },
}

export default config
