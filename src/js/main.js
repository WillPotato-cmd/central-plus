import { supabaseClient } from './supabase.js';
import { esc } from './utils.js';

const LOJAS_PADRAO = [
  "Potato Guará", "Potato Pinda", "Potato Matriz", 
  "Potato Via Vale", "Potato Center Vale", "Potato Vale Sul", 
  "Potato Jacareí", "Kanpek Shopping", "Kanpek Restaurante"
];

const SETORES_CENTRAL = [
  "Recursos Humanos", "Departamento Pessoal", "Administrativo", 
  "Compras", "Manutenção", "Logistica", "Marketing", "TI"
];

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const STATUS_LABEL = { pendente: "Pendente", em_andamento: "Em andamento", aguardando: "Aguardando", concluido: "Concluído" };
const BUCKET_ANEXOS = 'anexos-solicitacoes';

let lojas = [...LOJAS_PADRAO];
let usuariosList = [];
let solicitacoes = [];
let auditoriasStore = {};
let logs = [];
let usuarioLogado = null;
let loginErro = "";
let loginInfo = "";
let viewAuth = "login"; // 'login' | 'esqueci' | 'redefinir'
let userIP = "Buscando IP...";
let realtimeChannel = null;
let acoesLocaisRecentes = new Set(); // evita notificar a própria pessoa pela própria ação

const TEMPO_LIMITE_INATIVIDADE_MS = 30 * 60 * 1000; // 30 minutos
let ultimaAtividade = Date.now();

function registrarAtividade(){
  ultimaAtividade = Date.now();
}

document.addEventListener('click', registrarAtividade);
document.addEventListener('keydown', registrarAtividade);

setInterval(async () => {
  if(usuarioLogado && (Date.now() - ultimaAtividade) > TEMPO_LIMITE_INATIVIDADE_MS){
    await logout();
    loginErro = "Sua sessão expirou por inatividade. Faça login novamente.";
    render();
  }
}, 60 * 1000);

function notificarNavegador(titulo, corpo){
  if(typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const notif = new Notification(titulo, { body: corpo });
    notif.onclick = () => { window.focus(); notif.close(); };
  } catch (e) {
    console.error("Erro ao mostrar notificação:", e);
  }
}

// Registrado o quanto antes: se a pessoa chegou aqui através do link de
// recuperação de senha do e-mail, o Supabase detecta o token na própria URL
// e dispara PASSWORD_RECOVERY assim que o cliente termina de inicializar.
if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      usuarioLogado = null;
      viewAuth = 'redefinir';
      loginErro = "";
      loginInfo = "";
      render();
    }
  });
}

let abaAtiva = "dashboard";
let lojaAtual = "";
let filtroLoja = "todas";
let filtroSetor = "todos";

let searchTerm = "";
let currentPage = 1;
const ITEMS_PER_PAGE = 5;

let novaSolicitacao = {setor:"Manutenção", titulo:"", descricao:"", prioridade:"normal", arquivoImagem:null};
let novaLojaNome = "";
let novoUsuarioObj = {usuario:"", senha:"", tag:"Líder", nome:"", lojasAcesso:[], setoresAcesso:[], tipoSupervisao:"operacao"};
let usuarioEdicaoId = null;

async function fetchUserIP(){
  try{
    let res = await fetch('https://api.ipify.org?format=json');
    let data = await res.json();
    userIP = data.ip;
  }catch(e){
    userIP = "127.0.0.1 (Local)";
  }
}

function initAuditorias(){
  LOJAS_PADRAO.forEach(l => {
    if(!auditoriasStore[l]){
      auditoriasStore[l] = {
        arquivoPresencial: "Auditoria_Presencial_2026.pdf",
        arquivoAdm: "Auditoria_Adm_2026.pdf",
        notasPresenciais: [8.5, 8.8, 9.0, 9.1, 9.3, 9.4, 9.5, 9.2, 9.6, 9.4, 9.5, 9.7],
        notasAdm: [8.0, 8.2, 8.5, 8.7, 8.9, 9.0, 9.2, 9.1, 9.3, 9.2, 9.4, 9.5]
      };
    }
  });
}

async function loadData(){
  if (supabaseClient && usuarioLogado) {
    try {
      const { data: solData } = await supabaseClient.from('solicitacoes').select('*');
      if (solData) {
        solicitacoes = solData;
        await resolverImagensSolicitacoes(solicitacoes);
      }

      const { data: logsData } = await supabaseClient.from('logs').select('*').order('id', { ascending: false });
      if (logsData) logs = logsData;

      const { data: usrData } = await supabaseClient.from('usuarios').select('*');
      if (usrData) usuariosList = usrData;
    } catch (e) {
      console.error("Erro ao carregar banco:", e);
    }
  }
  initAuditorias();
}

async function saveData(tabela, payload){
  if (supabaseClient && tabela) {
    try {
      await supabaseClient.from(tabela).upsert(payload);
    } catch(e) {
      console.error("Erro ao salvar no banco:", e);
    }
  }
}

async function registrarLog(acao){
  const item = {
    usuario_id: usuarioLogado ? usuarioLogado.id : null,
    usuario_nome: usuarioLogado ? usuarioLogado.nome + ' ('+usuarioLogado.tag+')' : 'Sistema',
    ip: userIP,
    acao: acao
  };
  logs = [item, ...logs];
  await saveData('logs', item);
}

function nextId(){
  const n = solicitacoes.length + 1;
  return "SOL-" + String(n).padStart(4,'0');
}

async function uploadAnexo(file){
  try {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const nomeArquivo = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const caminho = (lojaAtual || 'geral') + '/' + nomeArquivo;

    const { data, error } = await supabaseClient.storage
      .from(BUCKET_ANEXOS)
      .upload(caminho, file, { cacheControl: '3600', upsert: false });

    if (error) {
      console.error("Erro ao enviar anexo:", error);
      alert("Não foi possível enviar a foto: " + error.message);
      return "";
    }

    return data.path;
  } catch (e) {
    console.error("Erro inesperado ao enviar anexo:", e);
    alert("Erro inesperado ao enviar a foto.");
    return "";
  }
}

async function gerarUrlAssinada(caminho){
  if (!caminho) return "";
  try {
    const { data, error } = await supabaseClient.storage
      .from(BUCKET_ANEXOS)
      .createSignedUrl(caminho, 3600); // válida por 1 hora

    if (error) {
      console.error("Erro ao gerar link da foto:", error);
      return "";
    }
    return data.signedUrl;
  } catch (e) {
    console.error("Erro inesperado ao gerar link da foto:", e);
    return "";
  }
}

async function resolverImagensSolicitacoes(lista){
  await Promise.all(
    lista.filter(s => s.imagem).map(async (s) => {
      s._imagemUrl = await gerarUrlAssinada(s.imagem);
    })
  );
}

async function excluirAnexoStorage(caminho){
  if (!caminho || !supabaseClient) return;
  try {
    await supabaseClient.storage.from(BUCKET_ANEXOS).remove([caminho]);
  } catch (e) {
    console.error("Erro ao remover anexo do storage:", e);
  }
}

function iniciarRealtime(){
  if(!supabaseClient || realtimeChannel) return;
  realtimeChannel = supabaseClient
    .channel('solicitacoes-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes' }, async (payload) => {
      if(payload.eventType === 'INSERT'){
        const novo = payload.new;
        const chaveLocal = 'novo:' + novo.id;
        const foiEuQuemCriou = acoesLocaisRecentes.has(chaveLocal);
        if(foiEuQuemCriou) acoesLocaisRecentes.delete(chaveLocal);

        if(!solicitacoes.find(s => s.id === novo.id)){
          if(novo.imagem) novo._imagemUrl = await gerarUrlAssinada(novo.imagem);
          solicitacoes = [novo, ...solicitacoes];
        }

        if(!foiEuQuemCriou){
          const souGestorDoSetor = usuarioLogado.tag === 'Diretoria'
            || usuarioLogado.tag === 'Supervisão'
            || (usuarioLogado.tag === 'Central' && getSetoresPermitidos(usuarioLogado).includes(novo.setor));
          if(souGestorDoSetor){
            notificarNavegador("Nova solicitação: " + novo.titulo, novo.loja + " · " + novo.setor);
          }
        }
      } else if(payload.eventType === 'UPDATE'){
        const atualizado = payload.new;
        const anterior = payload.old;
        const chaveLocal = 'status:' + atualizado.id + ':' + atualizado.status;
        const fuiEuQuemAlterou = acoesLocaisRecentes.has(chaveLocal);
        if(fuiEuQuemAlterou) acoesLocaisRecentes.delete(chaveLocal);

        if(atualizado.imagem) atualizado._imagemUrl = await gerarUrlAssinada(atualizado.imagem);
        solicitacoes = solicitacoes.map(s => s.id === atualizado.id ? atualizado : s);

        const statusRealmenteMudou = anterior && anterior.status !== undefined && anterior.status !== atualizado.status;
        if(!fuiEuQuemAlterou && statusRealmenteMudou){
          const souLiderDaLoja = usuarioLogado.tag === 'Líder' && getLojasPermitidas(usuarioLogado).includes(atualizado.loja);
          if(souLiderDaLoja){
            notificarNavegador("Solicitação " + atualizado.id + " atualizada", "Novo status: " + STATUS_LABEL[atualizado.status]);
          }
        }
      } else if(payload.eventType === 'DELETE'){
        solicitacoes = solicitacoes.filter(s => s.id !== payload.old.id);
      }
      if(usuarioLogado) render();
    })
    .subscribe((status) => {
      console.log('[Central+] Status do tempo real:', status);
    });
}

function pararRealtime(){
  if(realtimeChannel && supabaseClient){
    supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

function getLojasPermitidas(user){
  if(!user) return [];
  if(user.tag === "Diretoria" || (user.tag === "Supervisão" && user.tipo_supervisao === "operacao")){
    return lojas;
  }
  if(user.tag === "Líder"){
    return user.lojas_acesso || [];
  }
  return [];
}

function getSetoresPermitidos(user){
  if(!user) return [];
  if(user.tag === "Diretoria" || (user.tag === "Supervisão" && user.tipo_supervisao === "administrativa")){
    return SETORES_CENTRAL;
  }
  if(user.tag === "Central"){
    return user.setores_acesso || [];
  }
  return [];
}

async function autenticar(emailInput, passInput) {
  try {
    loginErro = "";
    loginInfo = "";
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: emailInput.trim(),
      password: passInput.trim()
    });

    if (error) {
      loginErro = "E-mail ou senha inválidos.";
      render();
      return;
    }

    const { data: perfil } = await supabaseClient
      .from('usuarios')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if(perfil && perfil.ativo === false){
      await supabaseClient.auth.signOut();
      loginErro = "Sua conta está desativada. Fale com a Diretoria.";
      render();
      return;
    }

    if(!perfil){
      usuarioLogado = {
        id: data.user.id,
        nome: data.user.email.split('@')[0],
        email: data.user.email,
        tag: 'Diretoria',
        lojas_acesso: [],
        setores_acesso: []
      };
    } else {
      usuarioLogado = perfil;
    }

    loginErro = "";
    const permitidas = getLojasPermitidas(usuarioLogado);
    lojaAtual = permitidas.length ? permitidas[0] : (lojas[0] || "");
    abaAtiva = "dashboard";
    
    await registrarLog("Realizou Login via Auth");
    await loadData();
    iniciarRealtime();
    render();
  } catch (err) {
    console.error("Erro na autenticação:", err);
    loginErro = "Erro ao conectar com o servidor.";
    render();
  }
}

async function logout() {
  if (usuarioLogado) await registrarLog("Realizou Logout");
  pararRealtime();
  if (supabaseClient) await supabaseClient.auth.signOut();
  usuarioLogado = null;
  viewAuth = "login";
  loginErro = "";
  loginInfo = "";
  solicitacoes = [];
  logs = [];
  render();
}

async function enviarRecuperacaoSenha(email){
  const emailLimpo = (email || '').trim().toLowerCase();
  if(!emailLimpo){
    loginErro = "Informe seu e-mail para recuperar a senha.";
    loginInfo = "";
    render();
    return;
  }

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(emailLimpo, {
      redirectTo: window.location.origin
    });

    if (error) {
      loginErro = "Não foi possível enviar o e-mail de recuperação: " + error.message;
      loginInfo = "";
    } else {
      loginErro = "";
      // Mensagem genérica de propósito: não confirma se aquele e-mail existe
      // no sistema, pra não facilitar descoberta de contas cadastradas.
      loginInfo = "Se esse e-mail estiver cadastrado, você vai receber um link para redefinir a senha em instantes.";
    }
  } catch (e) {
    console.error("Erro ao solicitar recuperação de senha:", e);
    loginErro = "Erro ao conectar com o servidor.";
    loginInfo = "";
  }
  render();
}

async function redefinirSenha(novaSenha, confirmarSenha){
  if(!novaSenha || novaSenha.length < 6){
    loginErro = "A nova senha precisa ter pelo menos 6 caracteres.";
    render();
    return;
  }
  if(novaSenha !== confirmarSenha){
    loginErro = "As senhas não coincidem.";
    render();
    return;
  }

  try {
    const { error } = await supabaseClient.auth.updateUser({ password: novaSenha });

    if (error) {
      loginErro = "Não foi possível redefinir a senha: " + error.message;
      render();
      return;
    }

    await supabaseClient.auth.signOut();
    viewAuth = "login";
    loginErro = "";
    loginInfo = "Senha redefinida com sucesso! Faça login com a nova senha.";
    render();
  } catch (e) {
    console.error("Erro inesperado ao redefinir senha:", e);
    loginErro = "Erro inesperado ao redefinir a senha.";
    render();
  }
}

async function salvarUsuarioAdmin() {
  if (!novoUsuarioObj.usuario.trim() || !novoUsuarioObj.senha.trim() || !novoUsuarioObj.nome.trim()) {
    alert("Preencha e-mail, senha e nome do usuário!");
    return;
  }

  const emailLimpo = novoUsuarioObj.usuario.trim().toLowerCase();
  const senha = novoUsuarioObj.senha.trim();
  const nome = novoUsuarioObj.nome.trim();

  try {
    // Checagem prévia: evita chamar o Auth se o e-mail já está cadastrado
    // na nossa própria tabela de perfis.
    const { data: existente } = await supabaseClient
      .from('usuarios')
      .select('id')
      .eq('email', emailLimpo)
      .maybeSingle();

    if (existente) {
      alert("Já existe um usuário cadastrado com o e-mail " + emailLimpo + ".");
      return;
    }

    // Cria um cliente temporário sem afetar a sessão atual da Diretoria.
    // Reaproveita a URL/chave já usadas pelo cliente principal (evita
    // depender de constantes que não existem neste arquivo).
    const tempSupabase = supabase.createClient(supabaseClient.supabaseUrl, supabaseClient.supabaseKey, {
      auth: { persistSession: false }
    });

    // 1. Cadastra o novo usuário no Supabase Auth
    const { data: authData, error: authError } = await tempSupabase.auth.signUp({
      email: emailLimpo,
      password: senha,
      options: {
        data: { nome: nome }
      }
    });

    if (authError) {
      alert("Erro no cadastro de Auth: " + authError.message);
      return;
    }

    if (!authData.user) {
      alert("Não foi possível gerar o usuário no Auth.");
      return;
    }

    // Quando o e-mail já existe (e a confirmação de e-mail está ativa),
    // o Supabase não retorna erro — só devolve `identities` vazio, pra
    // não revelar que a conta já existe. Sem checar isso, o passo
    // seguinte sobrescreveria o perfil de quem já estava cadastrado.
    if (Array.isArray(authData.user.identities) && authData.user.identities.length === 0) {
      alert("Esse e-mail já está cadastrado no sistema de autenticação.");
      return;
    }

    const newUid = authData.user.id;

    // 2. Salva/Atualiza o perfil na tabela pública usuarios
    const perfilPayload = {
      id: newUid,
      nome: nome,
      email: emailLimpo,
      tag: novoUsuarioObj.tag,
      lojas_acesso: novoUsuarioObj.tag === 'Líder' ? novoUsuarioObj.lojasAcesso : [],
      setores_acesso: novoUsuarioObj.tag === 'Central' ? novoUsuarioObj.setoresAcesso : [],
      tipo_supervisao: novoUsuarioObj.tag === 'Supervisão' ? novoUsuarioObj.tipoSupervisao : '',
      ativo: true
    };

    const { error: dbError } = await supabaseClient
      .from('usuarios')
      .upsert(perfilPayload);

    if (dbError) {
      console.error("Erro ao salvar perfil:", dbError);
      alert("Conta criada no Auth, mas ocorreu erro ao salvar o perfil: " + dbError.message);
    } else {
      alert("Usuário " + nome + " cadastrado com sucesso!");
      await registrarLog("Cadastrou novo usuário: " + emailLimpo);
      novoUsuarioObj = { usuario: "", senha: "", tag: "Líder", nome: "", lojasAcesso: [], setoresAcesso: [], tipoSupervisao: "operacao" };
      await loadData();
      render();
    }

  } catch (err) {
    console.error("Erro inesperado:", err);
    alert("Erro ao processar cadastro: " + err.message);
  }
}

function iniciarEdicaoUsuario(id){
  const u = usuariosList.find(u => u.id === id);
  if(!u) return;
  usuarioEdicaoId = id;
  novoUsuarioObj = {
    usuario: u.email || "",
    senha: "",
    tag: u.tag || "Líder",
    nome: u.nome || "",
    lojasAcesso: u.lojas_acesso || [],
    setoresAcesso: u.setores_acesso || [],
    tipoSupervisao: u.tipo_supervisao || "operacao"
  };
  render();
}

function cancelarEdicaoUsuario(){
  usuarioEdicaoId = null;
  novoUsuarioObj = { usuario: "", senha: "", tag: "Líder", nome: "", lojasAcesso: [], setoresAcesso: [], tipoSupervisao: "operacao" };
  render();
}

async function atualizarUsuarioAdmin(novaSenhaOpcional){
  if(!usuarioEdicaoId) return;
  if(!novoUsuarioObj.nome.trim()){
    alert("Preencha o nome do usuário!");
    return;
  }

  const payload = {
    nome: novoUsuarioObj.nome.trim(),
    tag: novoUsuarioObj.tag,
    lojas_acesso: novoUsuarioObj.tag === 'Líder' ? novoUsuarioObj.lojasAcesso : [],
    setores_acesso: novoUsuarioObj.tag === 'Central' ? novoUsuarioObj.setoresAcesso : [],
    tipo_supervisao: novoUsuarioObj.tag === 'Supervisão' ? novoUsuarioObj.tipoSupervisao : ''
  };

  const { error } = await supabaseClient
    .from('usuarios')
    .update(payload)
    .eq('id', usuarioEdicaoId);

  if (error) {
    console.error("Erro ao atualizar usuário:", error);
    alert("Não foi possível salvar as alterações: " + error.message);
    return;
  }

  const senhaLimpa = (novaSenhaOpcional || '').trim();
  if(senhaLimpa){
    if(senhaLimpa.length < 6){
      alert("Perfil salvo, mas a senha não foi alterada: precisa ter pelo menos 6 caracteres.");
    } else {
      try {
        const { data: resultado, error: fnError } = await supabaseClient.functions.invoke('admin-set-password', {
          body: { userId: usuarioEdicaoId, novaSenha: senhaLimpa }
        });
        if(fnError){
          let motivo = fnError.message;
          try {
            if(fnError.context && typeof fnError.context.json === 'function'){
              const corpo = await fnError.context.json();
              if(corpo && corpo.error) motivo = corpo.error;
            }
          } catch(_e) {
            // mantém a mensagem genérica se não der pra ler o corpo do erro
          }
          alert("Perfil salvo, mas não foi possível redefinir a senha: " + motivo);
        } else if(resultado && resultado.error){
          alert("Perfil salvo, mas não foi possível redefinir a senha: " + resultado.error);
        } else {
          await registrarLog("Redefiniu a senha do usuário " + usuarioEdicaoId);
        }
      } catch (e) {
        console.error("Erro ao chamar admin-set-password:", e);
        alert("Perfil salvo, mas houve um erro inesperado ao redefinir a senha.");
      }
    }
  }

  await registrarLog("Editou o usuário " + (novoUsuarioObj.usuario || usuarioEdicaoId));
  usuarioEdicaoId = null;
  novoUsuarioObj = { usuario: "", senha: "", tag: "Líder", nome: "", lojasAcesso: [], setoresAcesso: [], tipoSupervisao: "operacao" };
  await loadData();
  render();
}

async function alternarAtivoUsuario(id, ativarPara){
  if(id === usuarioLogado.id){
    alert("Você não pode desativar seu próprio usuário.");
    return;
  }

  const { error } = await supabaseClient
    .from('usuarios')
    .update({ ativo: ativarPara })
    .eq('id', id);

  if (error) {
    console.error("Erro ao atualizar status do usuário:", error);
    alert("Não foi possível " + (ativarPara ? "reativar" : "desativar") + " o usuário: " + error.message);
    return;
  }

  await registrarLog((ativarPara ? "Reativou" : "Desativou") + " o usuário " + id);
  await loadData();
  render();
}

async function criarSolicitacao(){
  if(!novaSolicitacao.titulo.trim()) return;

  let imagemPath = "";
  if(novaSolicitacao.arquivoImagem){
    imagemPath = await uploadAnexo(novaSolicitacao.arquivoImagem);
    if(!imagemPath){
      // uploadAnexo já mostrou o alerta com o motivo; não segue sem o anexo
      // pra evitar criar o ticket "quebrado" sem a foto que a pessoa queria anexar.
      return;
    }
  }

  const payload = {
    loja: lojaAtual,
    setor: novaSolicitacao.setor,
    titulo: novaSolicitacao.titulo.trim(),
    descricao: novaSolicitacao.descricao.trim(),
    prioridade: novaSolicitacao.prioridade,
    imagem: imagemPath,
    status: "pendente",
    resposta: "",
    criador_id: usuarioLogado.id,
    criado_em: new Date().toISOString(),
    timestamp: Date.now()
  };

  try {
    // Não enviamos mais o `id` — o banco gera "SOL-000X" sozinho
    // (ver gatilho gerar_id_solicitacao no supabase_rls_e_ids.sql),
    // evitando colisão quando duas pessoas criam ao mesmo tempo.
    const { data, error } = await supabaseClient
      .from('solicitacoes')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("Erro ao criar solicitação:", error);
      alert("Não foi possível enviar a solicitação: " + error.message);
      if(imagemPath) await excluirAnexoStorage(imagemPath); // evita foto órfã no storage
      return;
    }

    if(data.imagem) data._imagemUrl = await gerarUrlAssinada(data.imagem);

    acoesLocaisRecentes.add('novo:' + data.id);
    setTimeout(() => acoesLocaisRecentes.delete('novo:' + data.id), 8000);

    if(!solicitacoes.find(s => s.id === data.id)){
      solicitacoes = [data, ...solicitacoes];
    }
    novaSolicitacao = {setor:"Manutenção", titulo:"", descricao:"", prioridade:"normal", arquivoImagem:null};
    await registrarLog("Criou a solicitação " + data.id + " para " + data.loja);
    abaAtiva = "solicitacoes";
    render();
  } catch (err) {
    console.error("Erro inesperado ao criar solicitação:", err);
    alert("Erro inesperado ao enviar a solicitação.");
  }
}

async function mudarStatus(id, novoStatus){
  const target = solicitacoes.find(s => s.id === id);
  if(target){
    target.status = novoStatus;
    acoesLocaisRecentes.add('status:' + id + ':' + novoStatus);
    setTimeout(() => acoesLocaisRecentes.delete('status:' + id + ':' + novoStatus), 8000);
    await registrarLog("Alterou status da solicitação " + id + " para " + STATUS_LABEL[novoStatus]);
    await saveData('solicitacoes', target);
  }
  render();
}

async function responder(id, texto){
  if(!texto.trim()) return;
  const target = solicitacoes.find(s => s.id === id);
  if(target){
    target.resposta = texto.trim();
    await registrarLog("Respondeu a solicitação " + id);
    await saveData('solicitacoes', target);
  }
  render();
}

async function excluirSolicitacao(id){
  if(confirm("Deseja remover esta solicitação?")){
    const alvo = solicitacoes.find(s => s.id === id);
    solicitacoes = solicitacoes.filter(s => s.id !== id);
    if(supabaseClient) await supabaseClient.from('solicitacoes').delete().eq('id', id);
    if(alvo && alvo.imagem) await excluirAnexoStorage(alvo.imagem);
    await registrarLog("Excluiu a solicitação " + id);
    render();
  }
}

function drawChartCanvas(){
  setTimeout(() => {
    const canvas = document.getElementById('chartCanvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const storeData = auditoriasStore[lojaAtual] || {};
    const dataPresencial = storeData.notasPresenciais || Array(12).fill(0);
    const dataAdm = storeData.notasAdm || Array(12).fill(0);

    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle = "#ECE6D8"; ctx.lineWidth = 1;
    for(let i=1; i<=4; i++){
      let y = (canvas.height/5)*i;
      ctx.beginPath(); ctx.moveTo(35, y); ctx.lineTo(canvas.width-15, y); ctx.stroke();
    }

    const stepX = (canvas.width - 55) / 11;

    function drawLine(data, color){
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath();
      data.forEach((val, i) => {
        let x = 35 + (i * stepX);
        let numVal = parseFloat(val) || 0;
        let y = canvas.height - 30 - ((numVal - 5) / 5) * (canvas.height - 45);
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.stroke();

      data.forEach((val, i) => {
        let x = 35 + (i * stepX);
        let numVal = parseFloat(val) || 0;
        let y = canvas.height - 30 - ((numVal - 5) / 5) * (canvas.height - 45);
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = "#20291F"; ctx.font = "9px IBM Plex Sans";
        ctx.fillText(numVal.toString(), x-6, color === "#4B6B4F" ? y-7 : y+12);
      });
    }

    drawLine(dataPresencial, "#4B6B4F");
    drawLine(dataAdm, "#49606B");

    MESES.forEach((m, i) => {
      let x = 35 + (i * stepX);
      ctx.fillStyle = "#5C6259"; ctx.font = "10px IBM Plex Sans";
      ctx.fillText(m, x-8, canvas.height-8);
    });
  }, 50);
}

function slipHTML(s, showLoja){
  let canManage = usuarioLogado.tag === "Diretoria" || usuarioLogado.tag === "Central" || usuarioLogado.tag === "Supervisão";
  let actions = '';
  
  if(canManage){
    if(s.status === 'pendente') actions += '<button data-action="mudar-status" data-id="'+s.id+'" data-status="em_andamento">Colocar em andamento</button>';
    if(s.status === 'em_andamento') actions += '<button data-action="mudar-status" data-id="'+s.id+'" data-status="aguardando">Aguardar</button>';
    if(s.status === 'aguardando') actions += '<button data-action="mudar-status" data-id="'+s.id+'" data-status="em_andamento">Voltar p/ andamento</button>';
    if(s.status !== 'concluido') actions += '<button data-action="mudar-status" data-id="'+s.id+'" data-status="concluido">Dar baixa</button>';
    if(usuarioLogado.tag === "Diretoria") actions += '<button class="danger" data-action="excluir" data-id="'+s.id+'">Excluir</button>';
  }

  let respRow = '';
  if(canManage && s.status !== 'pendente'){
    respRow = '<div class="resp-row">'
      + '<input placeholder="Responder ou adicionar nota..." data-resp-input="'+s.id+'" value=""/>'
      + '<button data-action="responder" data-id="'+s.id+'">Responder</button>'
      + '</div>';
  }

  return ''
    + '<div class="slip '+esc(s.prioridade)+'">'
    + '  <div class="slip-top">'
    + '    <div>'
    + '      <div class="slip-id">'+esc(s.id)+(showLoja ? ' · '+esc(s.loja) : '')+'</div>'
    + '      <div class="slip-title">'+esc(s.titulo)+'</div>'
    + '    </div>'
    + '    <span class="status-pill status-'+esc(s.status)+'">'+STATUS_LABEL[s.status]+'</span>'
    + '  </div>'
    + '  <div class="slip-meta"><span class="tag">'+esc(s.setor)+'</span></div>'
    + (s.descricao ? '<div class="slip-desc">'+esc(s.descricao)+'</div>' : '')
    + (s.imagem ? '<img src="'+esc(s._imagemUrl || '')+'" class="slip-img" alt="Anexo">' : '')
    + (s.resposta ? '<div class="resposta">Retorno Central: '+esc(s.resposta)+'</div>' : '')
    + (actions ? '<div class="slip-actions">'+actions+'</div>' : '')
    + respRow
    + '</div>';
}

function renderSearchPaginationBar(totalItems, perPage = ITEMS_PER_PAGE){
  const totalPages = Math.ceil(totalItems / perPage) || 1;
  if(currentPage > totalPages) currentPage = totalPages;

  return ''
    + '<div class="search-pagination-bar">'
    + '  <input type="text" id="global-search-input" placeholder="Pesquisar..." value="'+esc(searchTerm)+'"/>'
    + '  <div class="pagination-controls">'
    + '    <span>Página <strong>'+currentPage+'</strong> de <strong>'+totalPages+'</strong> ('+totalItems+' registros)</span>'
    + '    <button data-action="prev-page" '+(currentPage<=1?'disabled':'')+'>Anterior</button>'
    + '    <button data-action="next-page" '+(currentPage>=totalPages?'disabled':'')+'>Próxima</button>'
    + '  </div>'
    + '</div>';
}

function renderLogin(){
  if(viewAuth === 'esqueci'){
    return ''
      + '<div class="login-wrapper">'
      + '  <div class="login-card">'
      + '    <h2>Recuperar senha</h2>'
      + '    <p>Informe seu e-mail corporativo. Se ele estiver cadastrado, você vai receber um link para criar uma nova senha.</p>'
      + (loginErro ? '<div class="error-msg">'+esc(loginErro)+'</div>' : '')
      + (loginInfo ? '<div class="info-msg">'+esc(loginInfo)+'</div>' : '')
      + '    <div class="field"><label>E-mail Corporativo</label><input id="recover-email" type="email" placeholder="seuemail@empresa.com"/></div>'
      + '    <button class="submit-btn" data-action="enviar-recuperacao">Enviar link de recuperação</button>'
      + '    <button class="submit-btn" style="background:#fff;color:var(--ink);border:1.5px solid var(--line);margin-top:8px;" data-action="voltar-login">Voltar ao login</button>'
      + '  </div>'
      + '</div>';
  }

  if(viewAuth === 'redefinir'){
    return ''
      + '<div class="login-wrapper">'
      + '  <div class="login-card">'
      + '    <h2>Nova senha</h2>'
      + '    <p>Defina uma nova senha para a sua conta.</p>'
      + (loginErro ? '<div class="error-msg">'+esc(loginErro)+'</div>' : '')
      + '    <div class="field"><label>Nova senha</label><input id="nova-senha-input" type="password" placeholder="Mínimo 6 caracteres"/></div>'
      + '    <div class="field"><label>Confirmar nova senha</label><input id="confirmar-senha-input" type="password"/></div>'
      + '    <button class="submit-btn" data-action="redefinir-senha">Salvar nova senha</button>'
      + '  </div>'
      + '</div>';
  }

  return ''
    + '<div class="login-wrapper">'
    + '  <div class="login-card">'
    + '    <h2>Central+</h2>'
    + '    <p>Central de Solicitações e Operações</p>'
    + (loginErro ? '<div class="error-msg">'+esc(loginErro)+'</div>' : '')
    + (loginInfo ? '<div class="info-msg">'+esc(loginInfo)+'</div>' : '')
    + '    <div class="field"><label>E-mail Corporativo</label><input id="login-user" type="email" placeholder="seuemail@empresa.com"/></div>'
    + '    <div class="field"><label>Senha</label><input id="login-pass" type="password" placeholder="Sua senha"/></div>'
    + '    <button class="submit-btn" data-action="login">Entrar</button>'
    + '    <button class="submit-btn" style="background:#fff;color:var(--ink);border:1.5px solid var(--line);margin-top:8px;font-size:0.82rem;padding:8px;" data-action="ir-esqueci-senha">Esqueci minha senha</button>'
    + '  </div>'
    + '</div>';
}

function renderVisaoLider(){
  const permitidas = getLojasPermitidas(usuarioLogado);
  if(!permitidas.length){
    return '<div class="empty">Nenhuma loja atribuída ao seu perfil. Solicite acesso à Diretoria.</div>';
  }

  let selectLojaHTML = permitidas.map(l => '<option value="'+esc(l)+'" '+(l===lojaAtual?'selected':'')+'>'+esc(l)+'</option>').join('');

  const solicitacoesLoja = solicitacoes.filter(s => s.loja === lojaAtual);
  const abertas = solicitacoesLoja.filter(s => s.status !== 'concluido');
  const historico = solicitacoesLoja.filter(s => s.status === 'concluido');
  
  const auditData = auditoriasStore[lojaAtual] || {notasPresenciais: Array(12).fill("-"), notasAdm: Array(12).fill("-")};
  const ultimaNotaPresencial = auditData.notasPresenciais ? auditData.notasPresenciais[auditData.notasPresenciais.length - 1] : "-";
  const ultimaNotaAdm = auditData.notasAdm ? auditData.notasAdm[auditData.notasAdm.length - 1] : "-";

  let bodyAba = '';

  if(abaAtiva === 'dashboard'){
    drawChartCanvas();
    bodyAba = ''
      + '<div class="grid">'
      + '  <div>'
      + '    <div class="card">'
      + '      <h2>Desempenho Atual da Unidade</h2>'
      + '      <div style="display:flex;gap:20px;">'
      + '        <div><small style="color:var(--ink-soft);">Auditoria Presencial</small><div class="audit-score" style="color:var(--moss);">'+esc(ultimaNotaPresencial)+'</div></div>'
      + '        <div><small style="color:var(--ink-soft);">Auditoria Adm</small><div class="audit-score" style="color:var(--steel);">'+esc(ultimaNotaAdm)+'</div></div>'
      + '      </div>'
      + '    </div>'
      + '    <div class="card">'
      + '      <h2>Evolução Anual de Auditorias</h2>'
      + '      <canvas id="chartCanvas" width="320" height="220"></canvas>'
      + '      <div class="chart-legend">'
      + '        <span><div class="legend-box" style="background:#4B6B4F;"></div> Auditoria Presencial</span>'
      + '        <span><div class="legend-box" style="background:#49606B;"></div> Auditoria Administrativa</span>'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '  <div>'
      + '    <div class="card">'
      + '      <h2>Resumo Operacional</h2>'
      + '      <p style="font-size:0.9rem;">Você possui <strong>'+abertas.length+'</strong> solicitações em aberto nesta unidade.</p>'
      + '    </div>'
      + '    <div class="card">'
      + '      <h2>Documentos de Auditoria</h2>'
      + '      <div class="history-box"><strong>Relatório Presencial:</strong> '+esc(auditData.arquivoPresencial || 'Nenhum enviado')+'</div>'
      + '      <div class="history-box"><strong>Relatório Adm:</strong> '+esc(auditData.arquivoAdm || 'Nenhum enviado')+'</div>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  } else if(abaAtiva === 'nova_solicitacao'){
    let setorOpts = SETORES_CENTRAL.map(s => '<option value="'+s+'">'+s+'</option>').join('');
    let priBtns = ['baixa','normal','urgente'].map(p => 
      '<button data-action="set-prioridade" data-p="'+p+'" class="'+(novaSolicitacao.prioridade===p?'active':'')+'">'+p+'</button>'
    ).join('');

    bodyAba = ''
      + '<div class="card" style="max-width:600px;margin:0 auto;">'
      + '  <h2>Nova Solicitação para '+esc(lojaAtual)+'</h2>'
      + '  <div class="field"><label>Setor de Destino</label><select id="categoria-select">'+setorOpts+'</select></div>'
      + '  <div class="field"><label>Título da Demanda</label><input id="titulo-input" placeholder="Ex: Manutenção no forno" value="'+esc(novaSolicitacao.titulo)+'"/></div>'
      + '  <div class="field"><label>Detalhes</label><textarea id="descricao-input" placeholder="Descreva a demanda">'+esc(novaSolicitacao.descricao)+'</textarea></div>'
      + '  <div class="field"><label>Anexar Foto (opcional)</label><input type="file" id="imagem-input" accept="image/*"/></div>'
      + '  <div class="field"><label>Prioridade</label><div class="priority-row">'+priBtns+'</div></div>'
      + '  <button class="submit-btn" data-action="criar-solicitacao">Enviar para a Central</button>'
      + '</div>';
  } else if(abaAtiva === 'solicitacoes' || abaAtiva === 'historico'){
    let sourceList = abaAtiva === 'solicitacoes' ? abertas : historico;
    let filtered = sourceList.filter(s => {
      const q = searchTerm.toLowerCase();
      return s.id.toLowerCase().includes(q) || s.titulo.toLowerCase().includes(q) || s.setor.toLowerCase().includes(q) || (s.descricao && s.descricao.toLowerCase().includes(q));
    });

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginated = filtered.slice(startIdx, startIdx + ITEMS_PER_PAGE);

    bodyAba = renderSearchPaginationBar(filtered.length)
      + (paginated.length ? paginated.map(s => slipHTML(s, false)).join('') : '<div class="empty">Nenhuma solicitação encontrada.</div>');
  }

  return ''
    + '<div class="store-row"><label>Unidade em atendimento:</label><select id="loja-select">'+selectLojaHTML+'</select></div>'
    + '<div class="nav-tabs">'
    + '  <button class="'+(abaAtiva==='dashboard'?'active':'')+'" data-action="set-tab" data-tab="dashboard">Dashboard</button>'
    + '  <button class="'+(abaAtiva==='nova_solicitacao'?'active':'')+'" data-action="set-tab" data-tab="nova_solicitacao">Nova Solicitação</button>'
    + '  <button class="'+(abaAtiva==='solicitacoes'?'active':'')+'" data-action="set-tab" data-tab="solicitacoes">Solicitações em Aberto ('+abertas.length+')</button>'
    + '  <button class="'+(abaAtiva==='historico'?'active':'')+'" data-action="set-tab" data-tab="historico">Histórico Concluído ('+historico.length+')</button>'
    + '</div>'
    + bodyAba;
}

function renderVisaoCentral(){
  const setoresPermitidos = getSetoresPermitidos(usuarioLogado);
  if(!setoresPermitidos.length){
    return '<div class="empty">Você não possui setores vinculados. Contate a Diretoria.</div>';
  }

  const pesoPrioridade = { urgente: 1, normal: 2, baixa: 3 };

  let filtrados = solicitacoes.filter(s => {
    const matchSetorPermitido = setoresPermitidos.includes(s.setor);
    const matchSetorFiltro = filtroSetor === 'todos' || s.setor === filtroSetor;
    const matchLojaFiltro = filtroLoja === 'todas' || s.loja === filtroLoja;
    return matchSetorPermitido && matchSetorFiltro && matchLojaFiltro;
  });

  filtrados.sort((a, b) => {
    if(pesoPrioridade[a.prioridade] !== pesoPrioridade[b.prioridade]){
      return pesoPrioridade[a.prioridade] - pesoPrioridade[b.prioridade];
    }
    return (a.timestamp || 0) - (b.timestamp || 0);
  });

  let setorOpts = '<option value="todos">Todos os meus setores</option>';
  setoresPermitidos.forEach(s => { setorOpts += '<option value="'+s+'" '+(filtroSetor===s?'selected':'')+'>'+s+'</option>'; });

  let lojaOpts = '<option value="todas">Todas as lojas</option>';
  lojas.forEach(l => { lojaOpts += '<option value="'+esc(l)+'" '+(filtroLoja===l?'selected':'')+'>'+esc(l)+'</option>'; });

  const cols = ['pendente','em_andamento','aguardando','concluido'];
  let colsHTML = cols.map(c => {
    const list = filtrados.filter(s=>s.status===c);
    const body = list.length ? list.map(s=>slipHTML(s,true)).join('') : '<div class="empty">Vazio</div>';
    return '<div><div class="col-head">'+STATUS_LABEL[c]+' <small>'+list.length+'</small></div>'+body+'</div>';
  }).join('');

  return ''
    + '<div class="filter-row">'
    + '  <label style="font-size:0.82rem;color:var(--ink-soft);">Setor:</label><select id="filtro-setor-select">'+setorOpts+'</select>'
    + '  <label style="font-size:0.82rem;color:var(--ink-soft);">Loja:</label><select id="filtro-loja-select">'+lojaOpts+'</select>'
    + '</div>'
    + '<div class="kanban">'+colsHTML+'</div>';
}

function renderPainelAuditorias(tipo){
  const titulo = tipo === 'presencial' ? 'Auditorias Presenciais Mensais (Supervisão Operacional)' : 'Auditorias Administrativas Mensais (Diretoria)';
  let headerMeses = MESES.map(m => '<th style="text-align:center;">'+m.toUpperCase()+'</th>').join('');

  let rows = lojas.map(loja => {
    const data = auditoriasStore[loja] || {};
    const notasList = (tipo === 'presencial' ? data.notasPresenciais : data.notasAdm) || Array(12).fill(0);
    const arqAtual = tipo === 'presencial' ? data.arquivoPresencial : data.arquivoAdm;

    let inputsMeses = MESES.map((m, idx) => ''
      + '<td style="padding:4px;"><input style="width:45px;text-align:center;padding:4px 2px;font-size:0.78rem;" data-audit-mes="'+idx+'" data-audit-tipo="'+tipo+'" data-loja="'+esc(loja)+'" value="'+esc(notasList[idx] !== undefined ? notasList[idx] : '')+'"/></td>'
    ).join('');

    return ''
      + '<tr>'
      + '  <td><strong>'+esc(loja)+'</strong></td>'
      +    inputsMeses
      + '  <td><input type="file" style="font-size:0.75rem;" data-audit-file="'+tipo+'" data-loja="'+esc(loja)+'"/> <br><small>'+esc(arqAtual || 'Nenhum enviado')+'</small></td>'
      + '</tr>';
  }).join('');

  return ''
    + '<h2 style="font-family:\'Fraunces\',serif;font-size:1.2rem;margin-bottom:14px;">'+titulo+'</h2>'
    + '<div class="table-responsive">'
    + '  <table class="table-list"><thead><tr><th>LOJA</th>'+headerMeses+'<th>DOCUMENTO ANEXO</th></tr></thead><tbody>'+rows+'</tbody></table>'
    + '</div>';
}

function renderLogsSistema(){
  const q = searchTerm.toLowerCase();
  let filteredLogs = logs.filter(l => 
    (l.usuario_nome && l.usuario_nome.toLowerCase().includes(q)) || 
    (l.acao && l.acao.toLowerCase().includes(q)) || 
    (l.ip && l.ip.toLowerCase().includes(q))
  );

  const LOGS_PER_PAGE = 10;
  const startIdx = (currentPage - 1) * LOGS_PER_PAGE;
  const paginatedLogs = filteredLogs.slice(startIdx, startIdx + LOGS_PER_PAGE);

  let rows = paginatedLogs.length ? paginatedLogs.map(l => ''
    + '<tr>'
    + '  <td><strong>'+esc(l.usuario_nome || 'Sistema')+'</strong></td>'
    + '  <td><span class="tag">'+esc(l.ip || '127.0.0.1')+'</span></td>'
    + '  <td>'+esc(l.acao)+'</td>'
    + '</tr>'
  ).join('') : '<tr><td colspan="3" class="empty">Nenhum log encontrado.</td></tr>';

  return ''
    + '<h2 style="font-family:\'Fraunces\',serif;font-size:1.2rem;margin-bottom:14px;">Registro de Ações do Sistema (Logs Auditados)</h2>'
    + renderSearchPaginationBar(filteredLogs.length, LOGS_PER_PAGE)
    + '<table class="table-list"><thead><tr><th>USUÁRIO</th><th>ENDEREÇO IP</th><th>AÇÃO REGISTRADA</th></tr></thead><tbody>'+rows+'</tbody></table>';
}

function renderVisaoDiretoria(){
  if(abaAtiva === 'dashboard'){
    const total = solicitacoes.length;
    const pendentes = solicitacoes.filter(s => s.status === 'pendente').length;
    const emAndamento = solicitacoes.filter(s => s.status === 'em_andamento').length;
    const aguardando = solicitacoes.filter(s => s.status === 'aguardando').length;
    const concluidos = solicitacoes.filter(s => s.status === 'concluido').length;

    let storeCardsHTML = lojas.map(loja => {
      const storeSolicitacoes = solicitacoes.filter(s => s.loja === loja);
      const totalLoja = storeSolicitacoes.length;
      const concLoja = storeSolicitacoes.filter(s => s.status === 'concluido').length;
      const pct = totalLoja ? Math.round((concLoja / totalLoja) * 100) : 0;

      return ''
        + '<div class="store-card">'
        + '  <div class="store-card-header">'
        + '    <div class="store-card-title">'+esc(loja)+'</div>'
        + '    <span class="tag">'+pct+'% resolvido</span>'
        + '  </div>'
        + '  <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:'+pct+'%;"></div></div>'
        + '</div>';
    }).join('');

    return ''
      + '<h2 style="font-family:\'Fraunces\',serif;font-size:1.3rem;margin:0 0 16px;">Balanço Executivo de Rede</h2>'
      + '<div class="kpi-grid">'
      + '  <div class="kpi-card"><span class="kpi-title">TOTAL</span><span class="kpi-value">'+total+'</span></div>'
      + '  <div class="kpi-card"><span class="kpi-title">PENDENTES</span><span class="kpi-value" style="color:var(--mustard);">'+pendentes+'</span></div>'
      + '  <div class="kpi-card"><span class="kpi-title">EM ANDAMENTO</span><span class="kpi-value" style="color:var(--steel);">'+emAndamento+'</span></div>'
      + '  <div class="kpi-card"><span class="kpi-title">AGUARDANDO</span><span class="kpi-value" style="color:var(--rust);">'+aguardando+'</span></div>'
      + '  <div class="kpi-card"><span class="kpi-title">CONCLUÍDAS</span><span class="kpi-value" style="color:var(--moss);">'+concluidos+'</span></div>'
      + '</div>'
      + '<h2 style="font-family:\'Fraunces\',serif;font-size:1.2rem;margin:24px 0 14px;">Desempenho por Unidade</h2>'
      + '<div class="store-summary-grid">'+storeCardsHTML+'</div>';
  } else if(abaAtiva === 'audit_adm'){
    return renderPainelAuditorias('adm');
  } else if(abaAtiva === 'audit_presencial'){
    return renderPainelAuditorias('presencial');
  } else if(abaAtiva === 'logs'){
    return renderLogsSistema();
  } else if(abaAtiva === 'lojas'){
    let filteredLojas = lojas.filter(l => l.toLowerCase().includes(searchTerm.toLowerCase()));
    let list = filteredLojas.map((l, idx) => ''
      + '<tr>'
      + '  <td>'+esc(l)+'</td>'
      + '  <td>'+solicitacoes.filter(s=>s.loja===l).length+' solicitações</td>'
      + '  <td class="table-actions">'
      + '    <button class="btn-sm danger" data-action="delete-loja" data-idx="'+idx+'">Excluir</button>'
      + '  </td>'
      + '</tr>'
    ).join('');

    return ''
      + '<div class="grid">'
      + '  <div class="card">'
      + '    <h2>Cadastrar Nova Loja</h2>'
      + '    <div class="field"><label>Nome da Unidade</label><input id="nova-loja-input" value="'+esc(novaLojaNome)+'"/></div>'
      + '    <button class="submit-btn" data-action="save-loja">Salvar Loja</button>'
      + '  </div>'
      + '  <div>'
      +    renderSearchPaginationBar(filteredLojas.length, 8)
      + '  <table class="table-list"><thead><tr><th>LOJA</th><th>HISTÓRICO</th><th>AÇÕES</th></tr></thead><tbody>'+list+'</tbody></table></div>'
      + '</div>';
  } else if(abaAtiva === 'usuarios'){
    let filteredUsers = usuariosList.filter(u => u.nome.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase()));
    let list = filteredUsers.map((u) => {
      const inativo = u.ativo === false;
      const souEu = u.id === usuarioLogado.id;
      let toggleBtn = '';
      if(!souEu){
        toggleBtn = inativo
          ? '<button class="btn-sm" data-action="toggle-ativo-usuario" data-id="'+esc(u.id)+'" data-ativo="true">Reativar</button>'
          : '<button class="btn-sm danger" data-action="toggle-ativo-usuario" data-id="'+esc(u.id)+'" data-ativo="false">Desativar</button>';
      }
      return ''
        + '<tr>'
        + '  <td><strong>'+esc(u.nome)+'</strong><br><small>'+esc(u.email)+'</small></td>'
        + '  <td><span class="tag">'+esc(u.tag)+'</span></td>'
        + '  <td><span class="tag">'+(inativo ? 'Inativo' : 'Ativo')+'</span></td>'
        + '  <td class="table-actions">'
        + '    <button class="btn-sm" data-action="editar-usuario" data-id="'+esc(u.id)+'">Editar</button>'
        +      toggleBtn
        + '  </td>'
        + '</tr>';
    }).join('');

    let lojasCheck = lojas.map(l => '<label class="checkbox-item"><input type="checkbox" data-user-loja="'+esc(l)+'" '+(novoUsuarioObj.lojasAcesso.includes(l)?'checked':'')+'/> '+esc(l)+'</label>').join('');
    let setoresCheck = SETORES_CENTRAL.map(s => '<label class="checkbox-item"><input type="checkbox" data-user-setor="'+esc(s)+'" '+(novoUsuarioObj.setoresAcesso.includes(s)?'checked':'')+'/> '+esc(s)+'</label>').join('');

    const emEdicao = !!usuarioEdicaoId;

    return ''
      + '<div class="grid">'
      + '  <div class="card">'
      + '    <h2>'+(emEdicao ? 'Editar Usuário' : 'Cadastrar Novo Usuário')+'</h2>'
      + '    <div class="field"><label>Nome Completo</label><input id="user-nome-input" value="'+esc(novoUsuarioObj.nome)+'"/></div>'
      + '    <div class="field"><label>E-mail Corporativo (Login)</label><input id="user-login-input" type="email" value="'+esc(novoUsuarioObj.usuario)+'" '+(emEdicao?'disabled':'')+'/></div>'
      + (emEdicao ? '    <div class="field"><label>Nova senha (deixe em branco para manter a atual)</label><input id="user-reset-senha-input" type="password" placeholder="Mínimo 6 caracteres"/></div>' : '')
      + (emEdicao ? '' : '    <div class="field"><label>Senha Inicial</label><input id="user-pass-input" type="password" value="'+esc(novoUsuarioObj.senha)+'"/></div>')
      + '    <div class="field"><label>Tag (Função)</label>'
      + '      <select id="user-tag-select">'
      + '        <option value="Líder" '+(novoUsuarioObj.tag==='Líder'?'selected':'')+'>Líder</option>'
      + '        <option value="Central" '+(novoUsuarioObj.tag==='Central'?'selected':'')+'>Central</option>'
      + '        <option value="Supervisão" '+(novoUsuarioObj.tag==='Supervisão'?'selected':'')+'>Supervisão</option>'
      + '        <option value="Diretoria" '+(novoUsuarioObj.tag==='Diretoria'?'selected':'')+'>Diretoria</option>'
      + '      </select>'
      + '    </div>'
      + (novoUsuarioObj.tag === 'Líder' ? '<div class="field"><label>Liberar Acesso às Lojas:</label><div class="checkbox-group">'+lojasCheck+'</div></div>' : '')
      + (novoUsuarioObj.tag === 'Central' ? '<div class="field"><label>Liberar Acesso aos Setores:</label><div class="checkbox-group">'+setoresCheck+'</div></div>' : '')
      + (novoUsuarioObj.tag === 'Supervisão' ? '<div class="field"><label>Escopo de Supervisão:</label><select id="user-supervision-select"><option value="operacao" '+(novoUsuarioObj.tipoSupervisao==='operacao'?'selected':'')+'>Operação (Todas as Lojas)</option><option value="administrativa" '+(novoUsuarioObj.tipoSupervisao==='administrativa'?'selected':'')+'>Administrativa (Todos os Setores)</option></select></div>' : '')
      + '    <button class="submit-btn" data-action="'+(emEdicao ? 'salvar-edicao-usuario' : 'save-user')+'">'+(emEdicao ? 'Salvar Alterações' : 'Cadastrar Usuário')+'</button>'
      + (emEdicao ? '    <button class="submit-btn" style="background:#fff;color:var(--ink);border:1.5px solid var(--line);margin-top:8px;" data-action="cancelar-edicao-usuario">Cancelar</button>' : '')
      + '  </div>'
      + '  <div>'
      + '    <h2>Usuários Cadastrados</h2>'
      +      renderSearchPaginationBar(filteredUsers.length, 8)
      + '    <table class="table-list"><thead><tr><th>USUÁRIO</th><th>TAG</th><th>STATUS</th><th>AÇÕES</th></tr></thead><tbody>'+list+'</tbody></table>'
      + '  </div>'
      + '</div>';
  } else if(abaAtiva === 'perfil'){
    return ''
      + '<div class="card" style="max-width:500px;margin:0 auto;">'
      + '  <h2>Editar Meu Perfil</h2>'
      + '  <div class="field"><label>Nome Exibido</label><input id="perfil-nome-input" value="'+esc(usuarioLogado.nome)+'"/></div>'
      + '  <div class="field"><label>E-mail</label><input id="perfil-email-input" disabled value="'+esc(usuarioLogado.email)+'"/></div>'
      + '</div>';
  }
}

function renderMainContent(){
  if(usuarioLogado.tag === "Diretoria"){
    return ''
      + '<div class="nav-tabs">'
      + '  <button class="'+(abaAtiva==='dashboard'?'active':'')+'" data-action="set-tab" data-tab="dashboard">Balanço Geral</button>'
      + '  <button class="'+(abaAtiva==='audit_adm'?'active':'')+'" data-action="set-tab" data-tab="audit_adm">Auditoria Adm (12 Meses)</button>'
      + '  <button class="'+(abaAtiva==='audit_presencial'?'active':'')+'" data-action="set-tab" data-tab="audit_presencial">Auditoria Presencial (12 Meses)</button>'
      + '  <button class="'+(abaAtiva==='central'?'active':'')+'" data-action="set-tab" data-tab="central">Painel Central</button>'
      + '  <button class="'+(abaAtiva==='solicitacoes'?'active':'')+'" data-action="set-tab" data-tab="solicitacoes">Visão Líderes</button>'
      + '  <button class="'+(abaAtiva==='lojas'?'active':'')+'" data-action="set-tab" data-tab="lojas">Lojas</button>'
      + '  <button class="'+(abaAtiva==='usuarios'?'active':'')+'" data-action="set-tab" data-tab="usuarios">Usuários</button>'
      + '  <button class="'+(abaAtiva==='logs'?'active':'')+'" data-action="set-tab" data-tab="logs">Logs do Sistema</button>'
      + '  <button class="'+(abaAtiva==='perfil'?'active':'')+'" data-action="set-tab" data-tab="perfil">Meu Perfil</button>'
      + '</div>'
      + (abaAtiva==='solicitacoes' ? renderVisaoLider() : (abaAtiva==='central' ? renderVisaoCentral() : renderVisaoDiretoria()));
  }

  if(usuarioLogado.tag === "Líder"){
    return renderVisaoLider();
  }

  if(usuarioLogado.tag === "Central" || usuarioLogado.tag === "Supervisão"){
    return renderVisaoCentral();
  }
}

function render(){
  const app = document.getElementById('app');
  if(!usuarioLogado){
    app.innerHTML = renderLogin();
    return;
  }

  const podePedirNotificacao = typeof Notification !== 'undefined' && Notification.permission === 'default';

  app.innerHTML = ''
    + '<div class="topbar">'
    + '  <div class="brand"><h1>Central+</h1><span>CENTRAL DE SOLICITAÇÕES E OPERAÇÕES</span></div>'
    + '  <div class="user-info">'
    + (podePedirNotificacao ? '    <button class="btn-sm" data-action="ativar-notificacoes">🔔 Ativar notificações</button>' : '')
    + '    <span>' + esc(usuarioLogado.nome) + ' <small class="tag">' + esc(usuarioLogado.tag) + '</small></span>'
    + '    <button class="logout-btn" data-action="logout">Sair</button>'
    + '  </div>'
    + '</div>'
    + renderMainContent();
}

document.addEventListener('click', function(e){
  const btn = e.target.closest('[data-action]');
  if(!btn) return;
  const action = btn.getAttribute('data-action');
  
  if(action === 'login'){
    autenticar(document.getElementById('login-user').value, document.getElementById('login-pass').value);
  } else if(action === 'ir-esqueci-senha'){
    viewAuth = 'esqueci';
    loginErro = ""; loginInfo = "";
    render();
  } else if(action === 'voltar-login'){
    viewAuth = 'login';
    loginErro = ""; loginInfo = "";
    render();
  } else if(action === 'enviar-recuperacao'){
    enviarRecuperacaoSenha(document.getElementById('recover-email').value);
  } else if(action === 'redefinir-senha'){
    redefinirSenha(
      document.getElementById('nova-senha-input').value,
      document.getElementById('confirmar-senha-input').value
    );
  } else if(action === 'logout'){
    logout();
  } else if(action === 'ativar-notificacoes'){
    if(typeof Notification !== 'undefined'){
      Notification.requestPermission().then(() => render());
    }
  } else if(action === 'set-tab'){
    abaAtiva = btn.getAttribute('data-tab');
    searchTerm = ""; currentPage = 1;
    render();
  } else if(action === 'prev-page'){
    if(currentPage > 1){ currentPage--; render(); }
  } else if(action === 'next-page'){
    currentPage++; render();
  } else if(action === 'set-prioridade'){
    novaSolicitacao.prioridade = btn.getAttribute('data-p');
    render();
  } else if(action === 'criar-solicitacao'){
    criarSolicitacao();
  } else if(action === 'save-loja'){
    if(novaLojaNome.trim()){
      lojas.push(novaLojaNome.trim());
      initAuditorias();
      novaLojaNome = "";
      render();
    }
  } else if(action === 'delete-loja'){
    const idx = parseInt(btn.getAttribute('data-idx'));
    if(confirm('Excluir loja?')){
      lojas.splice(idx,1);
      render();
    }
  } else if(action === 'save-user'){
    salvarUsuarioAdmin();
  } else if(action === 'editar-usuario'){
    iniciarEdicaoUsuario(btn.getAttribute('data-id'));
  } else if(action === 'salvar-edicao-usuario'){
    const senhaInput = document.getElementById('user-reset-senha-input');
    atualizarUsuarioAdmin(senhaInput ? senhaInput.value : '');
  } else if(action === 'cancelar-edicao-usuario'){
    cancelarEdicaoUsuario();
  } else if(action === 'toggle-ativo-usuario'){
    alternarAtivoUsuario(btn.getAttribute('data-id'), btn.getAttribute('data-ativo') === 'true');
  } else if(action === 'mudar-status'){
    mudarStatus(btn.getAttribute('data-id'), btn.getAttribute('data-status'));
  } else if(action === 'responder'){
    const id = btn.getAttribute('data-id');
    const input = document.querySelector('[data-resp-input="'+id+'"]');
    if(input){
      responder(id, input.value);
      input.value = "";
    }
  } else if(action === 'excluir'){
    excluirSolicitacao(btn.getAttribute('data-id'));
  }
});

document.addEventListener('change', function(e){
  if(e.target.id === 'loja-select'){
    lojaAtual = e.target.value;
    render();
  } else if(e.target.id === 'categoria-select'){
    novaSolicitacao.setor = e.target.value;
  } else if(e.target.id === 'filtro-loja-select'){
    filtroLoja = e.target.value;
    render();
  } else if(e.target.id === 'filtro-setor-select'){
    filtroSetor = e.target.value;
    render();
  } else if(e.target.id === 'user-tag-select'){
    novoUsuarioObj.tag = e.target.value;
    render();
  } else if(e.target.id === 'user-supervision-select'){
    novoUsuarioObj.tipoSupervisao = e.target.value;
  } else if(e.target.hasAttribute('data-audit-mes')){
    const mesIdx = parseInt(e.target.getAttribute('data-audit-mes'));
    const tipo = e.target.getAttribute('data-audit-tipo');
    const lj = e.target.getAttribute('data-loja');
    
    if(!auditoriasStore[lj]) auditoriasStore[lj] = {};
    if(tipo === 'presencial'){
      if(!auditoriasStore[lj].notasPresenciais) auditoriasStore[lj].notasPresenciais = Array(12).fill(0);
      auditoriasStore[lj].notasPresenciais[mesIdx] = parseFloat(e.target.value) || 0;
    } else {
      if(!auditoriasStore[lj].notasAdm) auditoriasStore[lj].notasAdm = Array(12).fill(0);
      auditoriasStore[lj].notasAdm[mesIdx] = parseFloat(e.target.value) || 0;
    }
    registrarLog("Atualizou nota do mês "+MESES[mesIdx]+" ("+tipo+") para a loja "+lj);
  } else if(e.target.hasAttribute('data-user-loja')){
    const l = e.target.getAttribute('data-user-loja');
    if(e.target.checked){
      if(!novoUsuarioObj.lojasAcesso.includes(l)) novoUsuarioObj.lojasAcesso.push(l);
    } else {
      novoUsuarioObj.lojasAcesso = novoUsuarioObj.lojasAcesso.filter(item => item !== l);
    }
  } else if(e.target.hasAttribute('data-user-setor')){
    const s = e.target.getAttribute('data-user-setor');
    if(e.target.checked){
      if(!novoUsuarioObj.setoresAcesso.includes(s)) novoUsuarioObj.setoresAcesso.push(s);
    } else {
      novoUsuarioObj.setoresAcesso = novoUsuarioObj.setoresAcesso.filter(item => item !== s);
    }
  } else if(e.target.id === 'imagem-input'){
    novaSolicitacao.arquivoImagem = e.target.files[0] || null;
  }
});

document.addEventListener('input', function(e){
  if(e.target.id === 'global-search-input'){
    searchTerm = e.target.value;
    currentPage = 1;
    render();
  } else if(e.target.id === 'titulo-input') novaSolicitacao.titulo = e.target.value;
  else if(e.target.id === 'descricao-input') novaSolicitacao.descricao = e.target.value;
  else if(e.target.id === 'nova-loja-input') novaLojaNome = e.target.value;
  else if(e.target.id === 'user-nome-input') novoUsuarioObj.nome = e.target.value;
  else if(e.target.id === 'user-login-input') novoUsuarioObj.usuario = e.target.value;
  else if(e.target.id === 'user-pass-input') novoUsuarioObj.senha = e.target.value;
});

document.addEventListener('keydown', function(e){
  if(e.key !== 'Enter' || usuarioLogado) return;
  if(viewAuth === 'login'){
    autenticar(document.getElementById('login-user').value, document.getElementById('login-pass').value);
  } else if(viewAuth === 'esqueci'){
    enviarRecuperacaoSenha(document.getElementById('recover-email').value);
  } else if(viewAuth === 'redefinir'){
    redefinirSenha(
      document.getElementById('nova-senha-input').value,
      document.getElementById('confirmar-senha-input').value
    );
  }
});

(async function init(){
  await fetchUserIP();
  render();
})();
