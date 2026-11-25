import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Botão "voltar" do Android: fecha telas sobrepostas; na tela inicial, minimiza o app
if (Capacitor.isNativePlatform()) {
  void CapApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back()
    else void CapApp.minimizeApp()
  })
}
