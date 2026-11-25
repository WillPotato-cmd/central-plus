import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // Troque pelo identificador definitivo antes de publicar nas lojas
  appId: 'br.com.potato.centralplus',
  appName: 'Central+',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      iconColor: '#4B6B4F',
    },
  },
}

export default config
