/* =====================================================================
   DASHBOARD DO ADMIN (TEMPO REAL INSTANTÂNEO VIA WEBSOCKET)
   ===================================================================== */
const SUPABASE_URL = 'https://xzaqqzlfwkjtksjlcbgx.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_hoYHM3UKlvTDMCaadvI1kQ_gcn9-pqq'; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let subscriptionPedidos = null;
const pedidosNaTela = new Map();
let abaAtiva = 'recentes'; 

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
  arquivarAntigos();
  
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

  if (aba === 'historico') carregarHistorico(1);
  if (aba === 'graficos') gerarGraficos();
}

/* ===================== ESCUTA EM TEMPO REAL (WEBSOCKET) ===================== */
function escutarNovosPedidos() {
  subscriptionPedidos = supabaseClient
    .channel('mudancas-gerais')
    
    // Quando um pedido NOVO chega
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos_recentes' }, (payload) => {
      // Insere o pedido direto na tela do usuário instantaneamente (sem esperar banco)
      if (abaAtiva === 'recentes' && paginaAtualRecentes === 1) {
        adicionarPedidoNoTopo(payload.new);
      } else {
        // Se o admin estiver em outra aba, só atualiza o contador (para não piscar a tela dele)
        totalPaginasRecentes = Math.ceil((totalPaginasRecentes * ITENS_POR_PAGINA + 1) / ITENS_POR_PAGINA);
      }
      
      // Atualiza os gráficos se estiver na aba deles
      if (abaAtiva === 'graficos') gerarGraficos();
    })
    
    // Quando um pedido é DELETADO (pela lixeira ou impressão)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pedidos_recentes' }, (payload) => {
      removerPedidoDaTela(payload.old.id);
    })

    // Quando um pedido vai para o HISTÓRICO
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos_arquivados' }, (payload) => {
      if (abaAtiva === 'historico') {
        carregarHistorico(paginaAtualHistorico);
      }
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

// Função nova exclusiva para colocar o pedido no topo assim que ele chega via WebSocket
function adicionarPedidoNoTopo(pedido) {
  if (pedidosNaTela.has(pedido.id)) return;
  
  const lista = document.getElementById('lista-pedidos');
  const vazio = lista.querySelector('.vazio');
  if (vazio) vazio.remove();

  // Cria o card e insere ANTES do primeiro elemento da lista (no topo)
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

  if (lista) {
    lista.appendChild(card);
  }
  
  return card;
}

function removerPedidoDaTela(id) {
  const el = document.querySelector(`[data-pedido="${id}"]`);
  if (el) el.remove();
  pedidosNaTela.delete(id);
  
  const lista = document.getElementById('lista-pedidos');
  if (lista && lista.children.length === 0) {
    lista.innerHTML = '<div class="vazio">Nenhum pedido ainda. Aguardando...</div>';
  }
}

async function apagarPedidoRecente(id) {
  if (!confirm("Tem certeza que deseja APAGAR este pedido?")) return;

  removerPedidoDaTela(id);

  const { error } = await supabaseClient.from('pedidos_recentes').delete().eq('id', id);
  if (error) { 
    alert("Erro ao apagar: " + error.message); 
    carregarPedidos(paginaAtualRecentes);
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

/* ===================== LIMPEZA AUTOMÁTICA (+7 DIAS) ===================== */
async function arquivarAntigos() {
  const limite = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: antigos, error } = await supabaseClient.from('pedidos_recentes').select('*').lt('created_at', limite);
  if (error || !antigos?.length) return;

  const { error: eIns } = await supabaseClient.from('pedidos_arquivados').insert(antigos.map(p => ({
    id: p.id, cliente_nome: p.cliente_nome, cliente_telefone: p.cliente_telefone,
    itens: p.itens, total: p.total, status: 'impresso', created_at: p.created_at, archived_at: new Date().toISOString()
  })));
  if (eIns) return;
  await supabaseClient.from('pedidos_recentes').delete().in('id', antigos.map(p => p.id));
}