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

let lojas = [...LOJAS_PADRAO];
let usuariosList = [];
let solicitacoes = [];
let auditoriasStore = {};
let logs = [];
let usuarioLogado = null;
let loginErro = "";
let userIP = "Buscando IP...";

let abaAtiva = "dashboard";
let lojaAtual = "";
let filtroLoja = "todas";
let filtroSetor = "todos";

let searchTerm = "";
let currentPage = 1;
const ITEMS_PER_PAGE = 5;

let novaSolicitacao = {setor:"Manutenção", titulo:"", descricao:"", prioridade:"normal", imagem:""};

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
      if (solData) solicitacoes = solData;

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
    render();
  } catch (err) {
    console.error("Erro na autenticação:", err);
    loginErro = "Erro ao conectar com o servidor.";
    render();
  }
}

async function logout() {
  if (usuarioLogado) await registrarLog("Realizou Logout");
  if (supabaseClient) await supabaseClient.auth.signOut();
  usuarioLogado = null;
  solicitacoes = [];
  logs = [];
  render();
}

async function criarSolicitacao(){
  if(!novaSolicitacao.titulo.trim()) return;
  const s = {
    id: nextId(),
    loja: lojaAtual,
    setor: novaSolicitacao.setor,
    titulo: novaSolicitacao.titulo.trim(),
    descricao: novaSolicitacao.descricao.trim(),
    prioridade: novaSolicitacao.prioridade,
    imagem: novaSolicitacao.imagem || "",
    status: "pendente",
    resposta: "",
    criador_id: usuarioLogado.id,
    criado_em: new Date().toISOString(),
    timestamp: Date.now()
  };
  solicitacoes = [s, ...solicitacoes];
  novaSolicitacao = {setor:"Manutenção", titulo:"", descricao:"", prioridade:"normal", imagem:""};
  await registrarLog("Criou a solicitação " + s.id + " para " + s.loja);
  await saveData('solicitacoes', s);
  abaAtiva = "solicitacoes";
  render();
}

async function mudarStatus(id, novoStatus){
  const target = solicitacoes.find(s => s.id === id);
  if(target){
    target.status = novoStatus;
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
    solicitacoes = solicitacoes.filter(s => s.id !== id);
    if(supabaseClient) await supabaseClient.from('solicitacoes').delete().eq('id', id);
    await registrarLog("Excluiu a solicitação " + id);
    render();
  }
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
    + (s.imagem ? '<img src="'+esc(s.imagem)+'" class="slip-img" alt="Anexo">' : '')
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
  return ''
    + '<div class="login-wrapper">'
    + '  <div class="login-card">'
    + '    <h2>Central+</h2>'
    + '    <p>Central de Solicitações e Operações</p>'
    + (loginErro ? '<div class="error-msg">'+esc(loginErro)+'</div>' : '')
    + '    <div class="field"><label>E-mail Corporativo</label><input id="login-user" type="email" placeholder="seuemail@empresa.com"/></div>'
    + '    <div class="field"><label>Senha</label><input id="login-pass" type="password" placeholder="Sua senha"/></div>'
    + '    <button class="submit-btn" data-action="login">Entrar</button>'
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

  let bodyAba = '';

  if(abaAtiva === 'dashboard'){
    bodyAba = '<div class="card"><h2>Resumo Operacional</h2><p>Você possui <strong>'+abertas.length+'</strong> solicitações abertas nesta unidade.</p></div>';
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
      + '  <div class="field"><label>Prioridade</label><div class="priority-row">'+priBtns+'</div></div>'
      + '  <button class="submit-btn" data-action="criar-solicitacao">Enviar para a Central</button>'
      + '</div>';
  } else if(abaAtiva === 'solicitacoes' || abaAtiva === 'historico'){
    let sourceList = abaAtiva === 'solicitacoes' ? abertas : historico;
    let filtered = sourceList.filter(s => {
      const q = searchTerm.toLowerCase();
      return s.id.toLowerCase().includes(q) || s.titulo.toLowerCase().includes(q) || s.setor.toLowerCase().includes(q);
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

  let filtrados = solicitacoes.filter(s => setoresPermitidos.includes(s.setor));
  const cols = ['pendente','em_andamento','aguardando','concluido'];
  
  let colsHTML = cols.map(c => {
    const list = filtrados.filter(s=>s.status===c);
    const body = list.length ? list.map(s=>slipHTML(s,true)).join('') : '<div class="empty">Vazio</div>';
    return '<div><div class="col-head">'+STATUS_LABEL[c]+' <small>'+list.length+'</small></div>'+body+'</div>';
  }).join('');

  return '<div class="kanban">'+colsHTML+'</div>';
}

function renderVisaoDiretoria(){
  if(abaAtiva === 'dashboard'){
    return '<div class="card"><h2>Balanço Geral de Unidades</h2><p>Total de solicitações registradas no sistema: <strong>'+solicitacoes.length+'</strong></p></div>';
  } else if(abaAtiva === 'usuarios'){
    let list = usuariosList.map(u => '<tr><td><strong>'+esc(u.nome)+'</strong><br><small>'+esc(u.email)+'</small></td><td><span class="tag">'+esc(u.tag)+'</span></td></tr>').join('');
    return '<table class="table-list"><thead><tr><th>USUÁRIO</th><th>TAG</th></tr></thead><tbody>'+list+'</tbody></table>';
  } else if(abaAtiva === 'logs'){
    let list = logs.map(l => '<tr><td><strong>'+esc(l.usuario_nome || 'Sistema')+'</strong></td><td>'+esc(l.acao)+'</td></tr>').join('');
    return '<table class="table-list"><thead><tr><th>USUÁRIO</th><th>AÇÃO</th></tr></thead><tbody>'+list+'</tbody></table>';
  }
}

function renderMainContent(){
  if(usuarioLogado.tag === "Diretoria"){
    return ''
      + '<div class="nav-tabs">'
      + '  <button class="'+(abaAtiva==='dashboard'?'active':'')+'" data-action="set-tab" data-tab="dashboard">Balanço Geral</button>'
      + '  <button class="'+(abaAtiva==='central'?'active':'')+'" data-action="set-tab" data-tab="central">Painel Central</button>'
      + '  <button class="'+(abaAtiva==='solicitacoes'?'active':'')+'" data-action="set-tab" data-tab="solicitacoes">Visão Líderes</button>'
      + '  <button class="'+(abaAtiva==='usuarios'?'active':'')+'" data-action="set-tab" data-tab="usuarios">Usuários</button>'
      + '  <button class="'+(abaAtiva==='logs'?'active':'')+'" data-action="set-tab" data-tab="logs">Logs do Sistema</button>'
      + '</div>'
      + (abaAtiva==='solicitacoes' ? renderVisaoLider() : (abaAtiva==='central' ? renderVisaoCentral() : renderVisaoDiretoria()));
  }

  if(usuarioLogado.tag === "Líder") return renderVisaoLider();
  if(usuarioLogado.tag === "Central" || usuarioLogado.tag === "Supervisão") return renderVisaoCentral();
}

function render(){
  const app = document.getElementById('app');
  if(!usuarioLogado){
    app.innerHTML = renderLogin();
    return;
  }

  app.innerHTML = ''
    + '<div class="topbar">'
    + '  <div class="brand"><h1>Central+</h1><span>CENTRAL DE SOLICITAÇÕES E OPERAÇÕES</span></div>'
    + '  <div class="user-info">'
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
  } else if(action === 'logout'){
    logout();
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
  } else if(action === 'mudar-status'){
    mudarStatus(btn.getAttribute('data-id'), btn.getAttribute('data-status'));
  } else if(action === 'responder'){
    const id = btn.getAttribute('data-id');
    const input = document.querySelector('[data-resp-input="'+id+'"]');
    if(input){ responder(id, input.value); input.value = ""; }
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
  }
});

document.addEventListener('input', function(e){
  if(e.target.id === 'global-search-input'){
    searchTerm = e.target.value;
    currentPage = 1;
    render();
  } else if(e.target.id === 'titulo-input') novaSolicitacao.titulo = e.target.value;
  else if(e.target.id === 'descricao-input') novaSolicitacao.descricao = e.target.value;
});

document.addEventListener('keydown', function(e){
  if(e.key === 'Enter' && !usuarioLogado){
    autenticar(document.getElementById('login-user').value, document.getElementById('login-pass').value);
  }
});

(async function init(){
  await fetchUserIP();
  render();
})();
