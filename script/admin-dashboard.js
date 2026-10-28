/* =====================================================================
   DASHBOARD DO ADMIN (TEMPO REAL OTIMIZADO)
   ===================================================================== */
const SUPABASE_URL = 'https://xzaqqzlfwkjtksjlcbgx.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_hoYHM3UKlvTDMCaadvI1kQ_gcn9-pqq'; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let subscriptionPedidos = null;
const pedidosNaTela = new Map();
let abaAtiva = 'recentes'; 
let novasNotificacoes = 0; // Variável para contar pedidos novos

// Variáveis de Controle de Paginação
const ITENS_POR_PAGINA = 10;
let paginaAtualRecentes = 1;
let totalPaginasRecentes = 1;
let paginaAtualHistorico = 1;
let totalPaginasHistorico = 1;

/* ===================== VERIFICAÇÃO DE LOGIN ===================== */
document.addEventListener('DOMContentLoaded', () => {
  const sessaoSalva = localStorage.getItem('nabrasas_sessao');
  if (!sessaoSalva) { window.location.href = 'login.html'; return; }

  const sessao = JSON.parse(sessaoSalva);
  if (sessao.tipo !== 'admin') { window.location.href = 'login.html'; return; }

  document.getElementById('user-info').textContent = `Logado como: ${sessao.nome} (Admin)`;
  iniciarPainel();
});

function sair() {
  localStorage.removeItem('nabrasas_sessao');
  window.location.href = 'login.html'; 
}

/* ===================== INICIAR PAINEL ===================== */
function iniciarPainel() {
  carregarPedidos(1);
  escutarNovosPedidos();
  
  if (typeof google !== 'undefined') {
    google.charts.load('current', {'packages':['corechart']});
    google.charts.setOnLoadCallback(() => {
      if(abaAtiva === 'graficos') gerarGraficos();
    });
  }
}

/* ===================== NAVEGAÇÃO DE ABAS ===================== */
function mudarAba(aba) {
  abaAtiva = aba; 
  document.querySelectorAll('.aba-btn').forEach(btn => btn.classList.remove('ativo'));
  document.querySelectorAll('.conteudo-aba').forEach(div => div.classList.remove('ativo'));

  document.querySelector(`.aba-btn[onclick="mudarAba('${aba}')"]`).classList.add('ativo');
  document.getElementById(`aba-${aba}`).classList.add('ativo');

  // Se entrou em recentes, ZERA a notificação e esconde o número
  if (aba === 'recentes') {
    novasNotificacoes = 0;
    const badge = document.getElementById('badge-notificacao');
    if (badge) {
        badge.classList.add('escondido');
        badge.textContent = '0';
    }
    carregarPedidos(paginaAtualRecentes); 
  }
  
  if (aba === 'historico') carregarHistorico(1);
  if (aba === 'graficos') gerarGraficos();
  if (aba === 'funcionarios') carregarFuncionarios();
}

/* ===================== NOTIFICAÇÃO VISUAL ===================== */
function atualizarBadgeNotificacao() {
  const badge = document.getElementById('badge-notificacao');
  if (!badge) return;

  // Se tem notificação E não está na aba recentes, mostra. Senão, esconde.
  if (novasNotificacoes > 0 && abaAtiva !== 'recentes') {
    badge.textContent = novasNotificacoes;
    badge.classList.remove('escondido');
  } else {
    badge.classList.add('escondido');
    badge.textContent = '0'; // Reseta o texto interno
  }
}

/* ===================== ESCUTA EM TEMPO REAL ===================== */
function escutarNovosPedidos() {
  subscriptionPedidos = supabaseClient
    .channel('mudancas-gerais')
    
    // Quando um pedido NOVO chega
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos_recentes' }, (payload) => {
      
      if (abaAtiva === 'recentes' && paginaAtualRecentes === 1) {
        // Se já está vendo a lista, insere o pedido no topo
        adicionarPedidoNoTopo(payload.new);
      } else {
        // Se estiver em outra aba, conta a notificação
        novasNotificacoes++;
        atualizarBadgeNotificacao();
      }
      
      if (abaAtiva === 'graficos') gerarGraficos();
    })
    
    // Quando um pedido é DELETADO
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pedidos_recentes' }, (payload) => {
      removerPedidoDaTela(payload.old.id);
    })

    // Quando um pedido vai para o HISTÓRICO
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos_arquivados' }, (payload) => {
      if (abaAtiva === 'historico') carregarHistorico(paginaAtualHistorico);
      if (abaAtiva === 'graficos') gerarGraficos();
    })

    .subscribe();
}

/* ===================== ABA 1: PEDIDOS RECENTES ===================== */
async function carregarPedidos(pagina = 1) {
  paginaAtualRecentes = pagina;
  const inicio = (pagina - 1) * ITENS_POR_PAGINA;
  const fim = inicio + ITENS_POR_PAGINA - 1;

  const { data, error, count } = await supabaseClient
    .from('pedidos_recentes')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false }) 
    .range(inicio, fim);

  if (error) return;

  totalPaginasRecentes = Math.ceil((count || 0) / ITENS_POR_PAGINA) || 1;

  if (paginaAtualRecentes > totalPaginasRecentes) {
    return carregarPedidos(totalPaginasRecentes);
  }

  const lista = document.getElementById('lista-pedidos');
  lista.innerHTML = '';
  pedidosNaTela.clear();

  if (!data || data.length === 0) {
    lista.innerHTML = '<div class="vazio">Nenhum pedido ainda. Aguardando...</div>';
  } else {
    data.forEach(p => criarCardPedido(p, lista, false));
  }

  renderizarPaginacao('recentes', paginaAtualRecentes, totalPaginasRecentes);
}

function adicionarPedidoNoTopo(pedido) {
  if (pedidosNaTela.has(pedido.id)) return;
  
  const lista = document.getElementById('lista-pedidos');
  const vazio = lista.querySelector('.vazio');
  if (vazio) vazio.remove();

  const card = criarCardPedido(pedido, lista, true);
  lista.insertBefore(card, lista.firstChild);
}

function criarCardPedido(pedido, lista, novo) {
  pedidosNaTela.set(pedido.id, pedido);

  const card = document.createElement('div');
  card.className = 'pedido' + (novo ? ' novo' : '');
  card.dataset.pedido = pedido.id;

  const dataObj = new Date(pedido.created_at);
  const dataFormatada = dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const horaFormatada = dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
  const itensHTML = itens.map(i => `<li><span>${i.qtd || 1}x ${i.nome}</span><span>R$ ${Number(i.preco).toFixed(2).replace('.', ',')}</span></li>`).join('');

  card.innerHTML = `
    <div class="pedido-header">
      <span class="pedido-id">#${pedido.id.slice(0, 8)}</span>
      <span class="pedido-hora">${dataFormatada} às ${horaFormatada}</span>
    </div>
    <div class="pedido-cliente">${pedido.cliente_nome} <small>${pedido.cliente_telefone || ''}</small></div>
    <ul class="pedido-itens">${itensHTML}</ul>
    <div class="pedido-total">
      <span>Total</span><span class="valor">R$ ${Number(pedido.total).toFixed(2).replace('.', ',')}</span>
    </div>
    <div class="pedido-acoes">
      <button class="btn-lixeira" onclick="apagarPedidoRecente('${pedido.id}')" title="Apagar este pedido">
        <i class="fa-solid fa-trash"></i>
      </button>
      <button class="btn-admin btn-admin-primario btn-imprimir">🖨️ Imprimir e arquivar</button>
    </div>
  `;

  card.querySelector('.btn-imprimir').addEventListener('click', (ev) => {
    ev.currentTarget.disabled = true;
    ev.currentTarget.textContent = 'Imprimindo...';
    imprimirEArquivar(pedido, ev.currentTarget);
  });

  if (lista) lista.appendChild(card);
  return card;
}

/* ===================== REMOÇÃO DE PEDIDO ===================== */
function removerPedidoDaTela(id) {
  const el = document.querySelector(`[data-pedido="${id}"]`);
  if (el) el.remove();
  pedidosNaTela.delete(id);
  
  // Se o usuário apagar um pedido, diminui a notificação (caso tenha alguma)
  if (novasNotificacoes > 0) {
    novasNotificacoes--;
    atualizarBadgeNotificacao();
  }

  const lista = document.getElementById('lista-pedidos');
  if (lista && lista.children.length === 0) {
    lista.innerHTML = '<div class="vazio">Nenhum pedido ainda. Aguardando...</div>';
  }
}


/* ===================== ABA 2: HISTÓRICO ===================== */
async function carregarHistorico(pagina = 1) {
  paginaAtualHistorico = pagina;
  const inicio = (pagina - 1) * ITENS_POR_PAGINA;
  const fim = inicio + ITENS_POR_PAGINA - 1;

  const lista = document.getElementById('lista-historico');
  if (lista.innerHTML === '' || lista.innerHTML.includes('vazio')) {
    lista.innerHTML = '<div class="vazio">Buscando histórico...</div>';
  }

  const { data, error, count } = await supabaseClient
    .from('pedidos_arquivados')
    .select('*', { count: 'exact' })
    .order('archived_at', { ascending: false })
    .range(inicio, fim);

  if (error || !data) return;

  totalPaginasHistorico = Math.ceil((count || 0) / ITENS_POR_PAGINA) || 1;
  if (data.length === 0 && pagina > 1) return carregarHistorico(pagina - 1);

  lista.innerHTML = '';
  if (data.length === 0) {
    lista.innerHTML = '<div class="vazio">Nenhum pedido no histórico.</div>';
  } else {
    data.forEach(p => {
      const dataObj = new Date(p.created_at);
      const dataStr = dataObj.toLocaleString('pt-BR');

      lista.innerHTML += `
        <div class="card-historico" id="hist-${p.id}">
          <div class="info">
            <h4>#${p.id.slice(0, 8)} - ${p.cliente_nome}</h4>
            <p>${dataStr} | Total: R$ ${Number(p.total).toFixed(2).replace('.', ',')}</p>
          </div>
          <div class="acoes">
            <span class="badge-impresso">✔ Impresso</span>
            <button class="btn-lixeira" onclick="apagarHistorico('${p.id}')" title="Apagar este registro">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    });
  }

  renderizarPaginacao('historico', paginaAtualHistorico, totalPaginasHistorico);
}

async function apagarHistorico(id) {
  if (!confirm("Tem certeza que deseja apagar este pedido do histórico?")) return;

  const el = document.getElementById(`hist-${id}`);
  if (el) el.remove();

  const { error } = await supabaseClient.from('pedidos_arquivados').delete().eq('id', id);
  if (error) { alert("Erro ao apagar: " + error.message); carregarHistorico(paginaAtualHistorico); }
}

/* ===================== CONTROLE DE PAGINAÇÃO ===================== */
function renderizarPaginacao(aba, paginaAtual, totalPaginas) {
  const container = document.getElementById(`paginacao-${aba}`);
  if (!container) return;

  if (totalPaginas <= 1) { container.innerHTML = ''; return; }

  container.innerHTML = `
    <button class="btn-pag" onclick="mudarPagina('${aba}', ${paginaAtual - 1})" ${paginaAtual === 1 ? 'disabled' : ''}>
      <i class="fa-solid fa-chevron-left"></i> Anterior
    </button>
    <span class="texto-pag">Página ${paginaAtual} de ${totalPaginas}</span>
    <button class="btn-pag" onclick="mudarPagina('${aba}', ${paginaAtual + 1})" ${paginaAtual === totalPaginas ? 'disabled' : ''}>
      Próxima <i class="fa-solid fa-chevron-right"></i>
    </button>
  `;
}

function mudarPagina(aba, novaPagina) {
  if (aba === 'recentes') carregarPedidos(novaPagina);
  if (aba === 'historico') carregarHistorico(novaPagina);
}

/* ===================== ABA 3: GRÁFICOS ===================== */
async function gerarGraficos() {
  const { data: recentes } = await supabaseClient.from('pedidos_recentes').select('*');
  const { data: arquivados } = await supabaseClient.from('pedidos_arquivados').select('*');
  
  const todosPedidos = [...(recentes || []), ...(arquivados || [])];

  if (todosPedidos.length === 0) {
    document.getElementById('piechart').innerHTML = '<div class="vazio" style="padding-top:100px;">Sem dados.</div>';
    document.getElementById('linechart').innerHTML = '';
    return;
  }

  const vendasPorLanche = {};
  const vendasPorDia = {};

  todosPedidos.forEach(p => {
    if (Array.isArray(p.itens)) {
      p.itens.forEach(item => { vendasPorLanche[item.nome] = (vendasPorLanche[item.nome] || 0) + (item.qtd || 1); });
    }
    const dia = new Date(p.created_at).toLocaleDateString('pt-BR');
    vendasPorDia[dia] = (vendasPorDia[dia] || 0) + Number(p.total);
  });

  const dataPie = new google.visualization.DataTable();
  dataPie.addColumn('string', 'Lanche');
  dataPie.addColumn('number', 'Quantidade');
  for (const [nome, qtd] of Object.entries(vendasPorLanche)) dataPie.addRow([nome, qtd]);

  const pieChart = new google.visualization.PieChart(document.getElementById('piechart'));
  pieChart.draw(dataPie, {
    title: 'Lanches Mais Vendidos', pieHole: 0.4, backgroundColor: '#1a1a1a',
    titleTextStyle: { color: '#df8d22', fontSize: 18 }, legend: { textStyle: { color: '#f5f5f5' } }, chartArea: { width: '90%', height: '80%' }
  });

  const diasOrdenados = Object.keys(vendasPorDia).sort((a, b) => {
    const [da, ma, ya] = a.split('/').map(Number);
    const [db, mb, yb] = b.split('/').map(Number);
    return new Date(ya, ma-1, da) - new Date(yb, mb-1, db);
  });

  const dataLine = new google.visualization.DataTable();
  dataLine.addColumn('string', 'Data');
  dataLine.addColumn('number', 'Faturamento (R$)');
  diasOrdenados.forEach(dia => dataLine.addRow([dia, vendasPorDia[dia]]));

  const lineChart = new google.visualization.LineChart(document.getElementById('linechart'));
  lineChart.draw(dataLine, {
    title: 'Faturamento por Dia', backgroundColor: '#1a1a1a',
    titleTextStyle: { color: '#df8d22', fontSize: 18 }, legend: { textStyle: { color: '#f5f5f5' } },
    hAxis: { title: 'Data', textStyle: { color: '#999' }, titleTextStyle: { color: '#999' } },
    vAxis: { title: 'R$', textStyle: { color: '#999' }, titleTextStyle: { color: '#999' } },
    colors: ['#df8d22'], curveType: 'function', chartArea: { width: '85%', height: '70%' }
  });
}

/* ===================== ABA 4: FUNCIONÁRIOS ===================== */
async function carregarFuncionarios() {
  const lista = document.getElementById('lista-funcionarios');
  lista.innerHTML = '<div class="vazio">Carregando funcionários...</div>';

  const { data, error } = await supabaseClient
    .from('usuarios_salvos')
    .select('*')
    .eq('tipo', 'funcionario')
    .order('login', { ascending: true });

  if (error) {
    lista.innerHTML = '<div class="vazio">Erro ao carregar funcionários.</div>';
    return;
  }

  if (data.length === 0) {
    lista.innerHTML = '<div class="vazio">Nenhum funcionário cadastrado.</div>';
    return;
  }

  lista.innerHTML = '';
  data.forEach(func => {
    lista.innerHTML += `
      <div class="card-funcionario" id="func-${func.id}">
        <div class="info">
          <h4>${func.login}</h4>
          <p>Senha: ${func.senha}</p>
        </div>
        <div class="acoes">
          <button class="btn-editar" onclick="abrirModalFuncionario('${func.id}', '${func.login}', '${func.senha}')" title="Editar">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn-lixeira" onclick="apagarFuncionario('${func.id}', '${func.login}')" title="Apagar">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  });
}

function abrirModalFuncionario(id = null, login = '', senha = '') {
  document.getElementById('modal-funcionario').classList.add('ativo');
  document.getElementById('func-id').value = id || '';
  document.getElementById('func-login').value = login;
  document.getElementById('func-senha').value = senha;
  document.getElementById('titulo-modal-func').textContent = id ? 'Editar Funcionário' : 'Novo Funcionário';
}

function fecharModalFuncionario() {
  document.getElementById('modal-funcionario').classList.remove('ativo');
}

async function salvarFuncionario() {
  const id = document.getElementById('func-id').value;
  const login = document.getElementById('func-login').value.trim();
  const senha = document.getElementById('func-senha').value.trim();

  if (!login || !senha) { alert("Preencha o login e a senha."); return; }

  const btn = document.querySelector('#modal-funcionario .btn-enviar-manual');
  btn.disabled = true;
  btn.innerHTML = 'Salvando...';

  try {
    if (id) {
      const { error } = await supabaseClient.from('usuarios_salvos').update({ login, senha }).eq('id', id);
      if (error) throw error;
      alert("Funcionário atualizado!");
    } else {
      const { error } = await supabaseClient.from('usuarios_salvos').insert([{ login, senha, tipo: 'funcionario' }]);
      if (error) {
        if (error.code === '23505') throw new Error("Este login já está em uso.");
        throw error;
      }
      alert("Funcionário criado!");
    }
    
    fecharModalFuncionario();
    carregarFuncionarios();
  } catch (err) {
    alert("Erro ao salvar: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar';
  }
}

async function apagarFuncionario(id, login) {
  if (!confirm(`Tem certeza que deseja APAGAR o funcionário "${login}"?`)) return;

  const el = document.getElementById(`func-${id}`);
  if (el) el.style.opacity = '0.5';

  const { error } = await supabaseClient.from('usuarios_salvos').delete().eq('id', id);

  if (error) {
    alert("Erro ao apagar: " + error.message);
    if (el) el.style.opacity = '1';
  } else {
    carregarFuncionarios();
  }
}