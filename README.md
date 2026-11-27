# Central+ 2.0

Central de Solicitações e Operações da rede Potato / Kanpek, reescrita em
**React + TypeScript (Vite)**, com **Supabase** no backend e **Capacitor 8**
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
- Histórico de respostas com nome e cargo de quem respondeu (o cartão mostra
  as 3 mais recentes; "ver todas" abre o resto).
- Quem atende o setor da solicitação (e a Supervisão de operação) pode
  encaminhá-la para outro setor; a troca fica registrada no histórico.

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
2. Abra o SQL Editor e execute, **nesta ordem**, os arquivos de
   `supabase/migrations/`:
   1. `20261124000000_central_plus.sql`
   2. `20261125000000_respostas_e_encaminhamento.sql` (histórico de respostas
      e troca de setor)

   Os dois podem ser rodados de novo sem problema. Se rodar o primeiro de
   novo, rode o segundo logo depois.
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

### 4. App Android (Capacitor 8)

O app é o mesmo site, empacotado para o celular. Ele usa o mesmo Supabase,
então tudo o que muda no banco vale para o site e para o app.

**Instalar no computador (uma vez só, Windows):**
1. [Node.js](https://nodejs.org) versão 22 ou mais nova (botão "LTS").
2. [Android Studio](https://developer.android.com/studio) (versão 2025.2.1 ou
   mais nova). Na primeira abertura, aceite a instalação padrão do SDK.

**Gerar o projeto Android (uma vez só)** — abra o PowerShell na pasta do
projeto (de preferência num caminho sem espaços e sem acentos, ex.
`C:\central-plus`):

```powershell
copy .env.example .env      # confira os valores dentro do .env
npm install
npm run build
npx cap add android
npm run icones              # gera ícone e tela de abertura a partir de assets/
npx cap sync android
npx cap open android        # abre no Android Studio
```

**Rodar no seu celular:**
1. No celular: *Configurações → Sobre o telefone* → toque 7 vezes em
   "Número da versão". Depois, em *Opções do desenvolvedor*, ligue
   **Depuração USB**.
2. Ligue o celular no computador pelo cabo e aceite a permissão que aparece.
3. No Android Studio, escolha o celular no topo e clique em ▶ (Run).

**Gerar o APK para mandar à equipe:**
No Android Studio: *Build → Generate App Bundles or APKs → Generate APKs*.
O arquivo fica em `android/app/build/outputs/apk/debug/app-debug.apk`.
Mande pelo WhatsApp; quem receber precisa permitir "instalar apps desta
fonte" na primeira vez.

**Sempre que o código mudar:** `npm run cap:android` (compila, copia para o
Android e abre o Android Studio) e gere o APK de novo.

**iPhone sem app nativo:** abra o site no Safari → *Compartilhar →
Adicionar à Tela de Início*. O Central+ ganha ícone próprio e abre em tela
cheia (arquivos em `public/` e as meta tags no `index.html`). Na primeira
vez é preciso fazer login dentro dele, porque o iPhone guarda essa sessão
separada da do Safari.

**iPhone (app nativo):** precisa de um Mac com Xcode e conta Apple Developer
(`npx cap add ios`, depois `npm run cap:ios`).

## Ponte com o Avalia Potato

Os líderes veem, na aba **Avaliações** da loja e no Dashboard, os dados do
Avalia Potato: nota da semana, relatório semanal, panorama mensal, notas
totais e operação mensal. **Vendas e investimento nunca são consultados.**

Como funciona: a Edge Function `avalia` (no projeto do Central+) guarda a
chave secreta do Avalia, confere quem está pedindo e devolve só as lojas que
essa pessoa pode ver (Diretoria, Supervisão, ou Líder da loja). Os cálculos
ficam em `src/lib/avalia.ts` e reproduzem os do Avalia.

Configuração (uma vez):
1. No SQL Editor do **Central+**, rode `supabase/migrations/20261125200000_ponte_avalia.sql`.
2. No projeto do **Avalia** no Supabase, em *Settings → API Keys*, crie uma
   **secret key** (`sb_secret_...`) e copie.
3. No projeto do **Central+**, em *Edge Functions → Secrets*, crie:
   - `AVALIA_URL` = `https://zqfznjkeqidpnznqjevv.supabase.co`
   - `AVALIA_SECRET_KEY` = a chave copiada no passo 2
4. Publique a função `supabase/functions/avalia/index.ts` com o nome `avalia`.
5. No Central+, como Diretoria, abra **Lojas** e ligue cada loja à loja
   correspondente do Avalia.

## Notificações com o app fechado (push)

Avisos que chegam mesmo com o Central+ fechado:

| Aviso | Quem recebe | Se a solicitação for **urgente**, também |
|---|---|---|
| Nova solicitação / encaminhada para o setor | Central do setor | Supervisão operacional e administrativa |
| Mudança de status | Todos os líderes da loja | Supervisão operacional e administrativa |
| Nova resposta | Todos os líderes da loja | Supervisão operacional e administrativa |
| Avaliação ruim (nota 1 ou 2) no Avalia | Todos os líderes da loja e Supervisão operacional | — |

A Diretoria não recebe esses avisos (acompanha pelo painel).

Quem fez a ação não recebe o próprio aviso.

Canais: **app Android** pelo Firebase; **iPhone** (ícone da Tela de Início,
iOS 16.4+) e **navegadores** pelo Web Push (`public/sw.js`). O banco chama a
Edge Function `notificar` quando algo acontece, e ela decide quem recebe.

**Configuração (uma vez):**
1. Central+ → SQL Editor: rode `supabase/migrations/20261126000000_notificacoes_push.sql`.
2. Crie um segredo (uma senha longa). No PowerShell:
   `[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')`
3. Central+ → SQL Editor (troque o segredo):
   ```sql
   insert into privado.config (chave, valor) values
     ('notificar_url', 'https://wkxwiwnzpdvzdatrupdu.supabase.co/functions/v1/notificar'),
     ('notificar_segredo', 'COLE-AQUI-O-SEGREDO')
   on conflict (chave) do update set valor = excluded.valor;
   ```
4. Chaves VAPID (iPhone e navegadores), no PowerShell: `npx @pushforge/builder vapid`.
   Guarde a **chave privada** (o JSON entre `{ }`).
5. Central+ → Edge Functions → Secrets:
   - `NOTIFICAR_SEGREDO` = o segredo do passo 2
   - `VAPID_PRIVATE_JWK` = a chave privada do passo 4
   - `VAPID_CONTATO` = `mailto:seu-email@empresa.com`
   - `FCM_SERVICE_ACCOUNT` = o JSON da conta de serviço do Firebase (passo 8)
6. Publique a função `supabase/functions/notificar/index.ts` com o nome
   `notificar` e **desligue "Verify JWT"** nas configurações dela.
7. Avalia → SQL Editor: rode `supabase/avalia/avaliacao_ruim_push.sql` e o
   mesmo `insert into privado.config` do passo 3 (mesmo segredo).
8. Firebase (app Android):
   1. Em console.firebase.google.com, crie um projeto.
   2. Adicione um app **Android** com o pacote `br.com.potato.centralplus` e
      baixe o `google-services.json` para a pasta `android/app/` do projeto.
   3. *Configurações do projeto → Contas de serviço → Gerar nova chave
      privada*: o arquivo JSON baixado vai no segredo `FCM_SERVICE_ACCOUNT`.
   4. `npm install`, `npm run build`, `npx cap sync android` e rode de novo
      pelo Android Studio.

Cada pessoa ativa no próprio aparelho pelo botão **🔔 Ativar notificações**
(no iPhone, pelo ícone da Tela de Início). No **Sair**, o aparelho deixa de
receber os avisos daquela conta.

## Regras de acesso

| Cargo | Vê solicitações de | Pode abrir solicitação | Pode atender (status/resposta) | Extra |
|---|---|---|---|---|
| Diretoria | todas | todas as lojas | todos os setores | usuários, lojas, auditorias, logs, excluir |
| Líder | suas lojas | suas lojas | — | vê auditorias e avaliações das suas lojas |
| Central | seus setores | — | seus setores | — |
| Supervisão (operação) | todas as lojas | todas as lojas | — | vê auditorias e avaliações, troca setor |
| Supervisão (administrativa) | todos os setores | — | todos os setores | — |

As mesmas regras estão em `src/lib/permissions.ts` (para montar a tela) e nas
funções `pode_ver_loja` / `pode_gerenciar_setor` do SQL (que valem de verdade).
