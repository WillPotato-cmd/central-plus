# Central+ 2.0

Central de Solicitações e Operações da rede Potato / Kanpek, reescrita em
**React + TypeScript (Vite)**, com **Supabase** no backend e **Capacitor**
para gerar o app Android e iOS a partir do mesmo código.

## O que mudou em relação à versão 1

**Segurança (o mais importante)**
- Quem não tem perfil na tabela `usuarios` **não entra mais**. Antes, o app
  dava acesso de Diretoria a qualquer conta sem perfil.
- O banco passa a filtrar tudo pelo cargo (RLS). Um Líder só recebe as
  solicitações das lojas dele, mesmo que alguém chame a API diretamente.
- Ninguém consegue alterar o próprio cargo.
- Mudar status e responder passam por funções no banco que conferem a
  permissão do setor.
- Logs são gravados pelo servidor: usuário e IP não podem ser forjados, e
  ninguém edita nem apaga logs.
- Usuários são criados pela Edge Function `admin-create-user` (só a Diretoria
  pode chamar). Assim dá para desligar o cadastro público.
- Desativar um usuário corta o acesso dele na hora, mesmo com sessão aberta.
- Senha mínima de 8 caracteres.

**Coisas que antes se perdiam ao recarregar a página**
- **Notas de auditoria** agora são salvas no banco (tabela `auditorias`), por
  ano. Antes eram dados de exemplo fixos no código.
- **Relatórios de auditoria** são enviados de verdade para o Storage
  (bucket `auditorias`) e abertos por link temporário.
- **Lojas** ficam no banco (tabela `lojas`). "Excluir" agora desativa e
  mantém o histórico.

**Outras melhorias**
- Supervisão de operação passa a ver as lojas (antes caía numa tela vazia).
- Todos os perfis têm "Meu Perfil" (clique no seu nome) e o nome é salvo.
- No celular o quadro da Central mostra uma coluna por vez, com seletor.
- Notificações nativas no app (Capacitor) e do navegador no site.
- Gráfico em SVG (nítido em qualquer tela) e campo de busca no quadro.

## Estrutura

```
src/
  lib/          supabase, tipos, constantes, regras de acesso, chamadas à API, notificações
  context/      AuthContext (login, sessão, inatividade) e DataContext (dados + tempo real)
  components/   cartão de solicitação, gráfico, abas, paginação
  screens/      Login, LiderView, CentralView, Perfil, diretoria/*
supabase/
  migrations/   SQL com tabelas, RLS, funções e Storage
  functions/    Edge Functions admin-create-user e admin-set-password
capacitor.config.ts
```

## Como colocar no ar

### 1. Banco (Supabase)

1. **Faça um backup** (Database → Backups) ou teste antes num projeto separado.
   A migração apaga as políticas antigas destas tabelas e cria as novas.
2. Abra o SQL Editor, cole o conteúdo de
   `supabase/migrations/20261124000000_central_plus.sql` e execute.
3. Confira se a sua conta é Diretoria (o final do arquivo SQL tem a consulta e
   o comando para corrigir, se precisar).
4. Em **Authentication → Sign In / Providers**, desligue
   **"Allow new users to sign up"**.
5. Em **Authentication → URL Configuration**, coloque o endereço do site em
   *Site URL* e em *Redirect URLs* (é para onde vai o link "esqueci minha
   senha").

### 2. Edge Functions

Com a [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref wkxwiwnzpdvzdatrupdu
supabase functions deploy admin-create-user
supabase functions deploy admin-set-password
```

A `admin-set-password` substitui a que já existe (mesmo nome).

### 3. Site (Vercel)

```bash
cp .env.example .env
npm install
npm run dev        # testar em http://localhost:5173
npm run build      # gera a pasta dist/
```

Na Vercel, cadastre as variáveis do `.env.example` em
*Settings → Environment Variables*. O `vercel.json` já configura o build.

### 4. App de celular (Capacitor)

Uma vez só:

```bash
npx cap add android   # precisa do Android Studio
npx cap add ios       # precisa de um Mac com Xcode
```

Sempre que mudar o código:

```bash
npm run cap:android   # compila, copia para o projeto Android e abre o Android Studio
npm run cap:ios       # idem para iOS
```

Antes de publicar nas lojas, troque o `appId` em `capacitor.config.ts` pelo
identificador definitivo (ex.: `br.com.suaempresa.centralplus`) e crie os
ícones (`npx @capacitor/assets generate`).

**Observações sobre o app**
- O link de "esqueci minha senha" abre o **site**. Depois de trocar a senha
  lá, é só entrar no app normalmente.
- As notificações do app aparecem enquanto ele está aberto ou em segundo plano
  recente. Para avisos com o app fechado será preciso *push* (Firebase Cloud
  Messaging + uma Edge Function). Fica como próximo passo.

## Regras de acesso

| Cargo | Vê solicitações de | Pode abrir solicitação | Pode atender (status/resposta) | Extra |
|---|---|---|---|---|
| Diretoria | todas | todas as lojas | todos os setores | usuários, lojas, auditorias, logs, excluir |
| Líder | suas lojas | suas lojas | — | — |
| Central | seus setores | — | seus setores | — |
| Supervisão (operação) | todas as lojas | todas as lojas | — | vê auditorias |
| Supervisão (administrativa) | todos os setores | — | todos os setores | — |

As mesmas regras estão em `src/lib/permissions.ts` (para montar a tela) e nas
funções `pode_ver_loja` / `pode_gerenciar_setor` do SQL (que valem de verdade).
