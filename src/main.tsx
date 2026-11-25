import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const raiz = document.getElementById('root')!

/** Mostra o erro na tela em vez de ficar parado em "Iniciando..." */
function mostrarErro(e: unknown) {
  console.error(e)
  raiz.innerHTML = ''
  const caixa = document.createElement('div')
  caixa.className = 'loading'
  caixa.style.color = 'var(--rust)'
  caixa.textContent = 'Não foi possível iniciar o Central+: ' + ((e as Error)?.message ?? String(e))
  raiz.appendChild(caixa)
}

// Importa o app depois: se a configuração estiver faltando, o erro aparece na tela
import('./App')
  .then(({ default: App }) => {
    createRoot(raiz).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
  .catch(mostrarErro)

// Botão "voltar" do Android: fecha telas sobrepostas; na tela inicial, minimiza o app
if (Capacitor.isNativePlatform()) {
  void CapApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back()
    else void CapApp.minimizeApp()
  })
}
