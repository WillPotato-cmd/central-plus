import { AuthProvider, useAuth } from './context/AuthContext'
import { DataProvider } from './context/DataContext'
import { Login } from './screens/Login'
import { Principal } from './screens/Principal'

function Rotas() {
  const { fase, usuario } = useAuth()
  if (fase === 'carregando') return <div className="loading">Iniciando ambiente seguro Central+…</div>
  if (fase !== 'logado' || !usuario) return <Login />
  // key: ao trocar de usuário, todo o estado de dados é recriado do zero
  return (
    <DataProvider key={usuario.id}>
      <Principal />
    </DataProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Rotas />
    </AuthProvider>
  )
}
