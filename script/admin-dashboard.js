/* =====================================================================
   DASHBOARD UNIFICADO (ADMIN E FUNCIONÁRIO)
   ===================================================================== */
const SUPABASE_URL = 'https://xzaqqzlfwkjtksjlcbgx.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_hoYHM3UKlvTDMCaadvI1kQ_gcn9-pqq'; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===================== TERMINAL VISUAL DE LOGS ===================== */
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

let logsVisuais = [];
let pedidosArquivadosGlobais = [];

function adicionarLogVisual(tipo, args) {
  if (!document.getElementById('terminal-container')) return;

  const msg = Array.from(args).map(arg => {
    if (typeof arg === 'object') {
      try { return JSON.stringify(arg); } catch (e) { return '[Objeto]'; }
    }
    return arg;
  }).join(' ');

  const hora = new Date().toLocaleTimeString('pt-BR');
  logsVisuais.push({ tipo, texto: `[${hora}] ${msg}` });
  
  if (logsVisuais.length > 10) logsVisuais.shift();
  atualizarInterfaceLogs();
}

function atualizarInterfaceLogs() {
  const terminal = document.getElementById('terminal-logs');
  if (!terminal) return;

  terminal.innerHTML = logsVisuais.map(log => {
    let classe = 'log-line';
    if (log.tipo === 'error') classe += ' log-erro';
    if (log.tipo === 'warn') classe += ' log-aviso';
    return `<div class="${classe}">${log.texto}</div>`;
  }).join('');
  terminal.scrollTop = terminal.scrollHeight;
}

function toggleTerminal() {
  const term = document.getElementById('terminal-container');
  if (!term) return;
  term.style.display = (term.style.display === 'none') ? 'block' : 'none';
}

console.log = function(...args) { originalLog.apply(console, args); adicionarLogVisual('log', args); };
console.error = function(...args) { originalError.apply(console, args); adicionarLogVisual('error', args); };
console.warn = function(...args) { originalWarn.apply(console, args); adicionarLogVisual('warn', args); };


/* ===================== ESTADO GLOBAL ===================== */
let subscriptionPedidos = null;
let intervaloPolling = null; // Verificação de segurança
const pedidosNaTela = new Map();
let abaAtiva = 'recentes'; 
let novasNotificacoes = 0; 

const ITENS_POR_PAGINA = 10;
let paginaAtualRecentes = 1;
let totalPaginasRecentes = 1;
let paginaAtualHistorico = 1;
let totalPaginasHistorico = 1;

let produtosGlobais = []; 
let carrinhoManual = []; 
let listaAdicionaisGlobal = [];
let itemManualAtual = null;

/* ===================== TAXAS DE ENTREGA (GLOBAIS) ===================== */
let taxasGlobais = [];

/* ===================== INICIALIZAÇÃO E LOGIN ===================== */
document.addEventListener('DOMContentLoaded', () => {
  const sessaoSalva = localStorage.getItem('nabrasas_sessao');
  if (!sessaoSalva) { window.location.href = 'login.html'; return; }

  const sessao = JSON.parse(sessaoSalva);
  
  const isAdminPage = window.location.pathname.includes('administrador-dashboard.html');
  const isFuncPage = window.location.pathname.includes('funcionario-dashboard.html');

  if (sessao.tipo === 'admin' && isFuncPage) { window.location.href = 'administrador-dashboard.html'; return; }
  if (sessao.tipo === 'funcionario' && isAdminPage) { window.location.href = 'funcionario-dashboard.html'; return; }
  if (!isAdminPage && !isFuncPage) { window.location.href = 'login.html'; return; }

  document.getElementById('user-info').textContent = `Logado como: ${sessao.nome} (${sessao.tipo === 'admin' ? 'Admin' : 'Funcionário'})`;
  iniciarPainel();
});

function sair() {
  localStorage.removeItem('nabrasas_sessao');
  window.location.href = 'login.html'; 
}

function iniciarPainel() {
  carregarPedidos(1);
  escutarNovosPedidos();
  atualizarBadgeNotificacao();
  carregarProdutosParaManual(); 
  
  if (document.getElementById('piechart') && typeof google !== 'undefined') {
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

  const btn = document.querySelector(`.aba-btn[onclick="mudarAba('${aba}')"]`);
  if (btn) btn.classList.add('ativo');
  
  const conteudo = document.getElementById(`aba-${aba}`);
  if (conteudo) conteudo.classList.add('ativo');

  if (aba === 'recentes') {
    novasNotificacoes = 0;
    atualizarBadgeNotificacao(); 
    carregarPedidos(paginaAtualRecentes); 
  }
  
  if (aba === 'historico' && document.getElementById('lista-historico')) carregarHistorico(1);
  if (aba === 'graficos' && document.getElementById('piechart')) gerarGraficos();
  if (aba === 'funcionarios' && document.getElementById('lista-funcionarios')) carregarFuncionarios();
  if (aba === 'taxas' && document.getElementById('lista-taxas')) carregarTaxasAdmin();
}

/* ===================== NOTIFICAÇÕES ===================== */
function atualizarBadgeNotificacao() {
  const badge = document.getElementById('badge-notificacao');
  if (!badge) return;

  if (novasNotificacoes > 0 && abaAtiva !== 'recentes') {
    badge.textContent = novasNotificacoes;
    badge.classList.remove('escondido');
    badge.style.display = 'inline-flex'; 
  } else {
    badge.classList.add('escondido');
    badge.style.display = 'none'; 
    badge.textContent = ''; 
  }
}

/* ===================== ESCUTA EM TEMPO REAL ===================== */
function escutarNovosPedidos() {
  console.log("⏳ Tentando conectar ao Realtime...");

  // Remove conexão antiga se existir para não duplicar
  if (subscriptionPedidos) {
    supabaseClient.removeChannel(subscriptionPedidos);
  }

  subscriptionPedidos = supabaseClient
    .channel('mudancas-gerais')
    .on('system', {}, (payload) => console.log("🟢 Status do Canal:", payload.status))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos_recentes' }, (payload) => {
      console.log("📦 Novo pedido recebido via WebSocket!");
      if (abaAtiva === 'recentes' && paginaAtualRecentes === 1) {
        adicionarPedidoNoTopo(payload.new);
      } else {
        novasNotificacoes++;
        atualizarBadgeNotificacao();
      }
      if (abaAtiva === 'graficos' && document.getElementById('piechart')) gerarGraficos();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pedidos_recentes' }, (payload) => {
      removerPedidoDaTela(payload.old.id);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos_arquivados' }, (payload) => {
      if (abaAtiva === 'historico' && document.getElementById('lista-historico')) carregarHistorico(paginaAtualHistorico);
      if (abaAtiva === 'graficos' && document.getElementById('piechart')) gerarGraficos();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'taxas_entrega' }, (payload) => {
      if (abaAtiva === 'taxas' && document.getElementById('lista-taxas')) carregarTaxasAdmin();
    })
    .subscribe((status, err) => {
      console.log("🚀 Status final da conexão:", status);
      if (err) console.error("❌ Erro no Realtime:", err);
    });

  // INICIA O POLLING DE SEGURANÇA (Caso o WebSocket falhe na Vercel)
  iniciarPollingFallback();
}

/* ===================== POLLING DE SEGURANÇA (FALLBACK) ===================== */
// Se a rede bloquear o WebSocket, isso busca o último pedido a cada 15 segundos
function iniciarPollingFallback() {
  if (intervaloPolling) clearInterval(intervaloPolling);
  
  intervaloPolling = setInterval(async () => {
    // Só roda o polling se a aba ativa for a de pedidos recentes
    if (abaAtiva === 'recentes') {
      const { data, error } = await supabaseClient
        .from('pedidos_recentes')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        const ultimoId = data[0].id;
        // Se o pedido mais recente no banco não estiver na tela, recarrega!
        if (!pedidosNaTela.has(ultimoId)) {
          console.log("🔄 [Polling] Novo pedido detectado via REST (fallback)!");
          carregarPedidos(1);
        }
      }
    }
  }, 15000); // 15 segundos
}

/* ===================== LISTA DE PEDIDOS (RECENTES) ===================== */
async function carregarPedidos(pagina = 1) {
  paginaAtualRecentes = pagina;
  const inicio = (pagina - 1) * ITENS_POR_PAGINA;
  const fim = inicio + ITENS_POR_PAGINA - 1;

  const { data, error, count } = await supabaseClient
    .from('pedidos_recentes')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false }) 
    .range(inicio, fim);

  if (error) { console.error("Erro ao buscar pedidos:", error); return; }

  totalPaginasRecentes = Math.ceil((count || 0) / ITENS_POR_PAGINA) || 1;
  if (paginaAtualRecentes > totalPaginasRecentes) return carregarPedidos(totalPaginasRecentes);

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

  // === NOVOS CÁLCULOS — TAXA DE ENTREGA ===
  const taxaEntrega = Number(pedido.taxa_entrega) || 0;
  const totalNum = Number(pedido.total) || 0;
  const subtotalNum = totalNum - taxaEntrega;
  const subtotalFmt = subtotalNum.toFixed(2).replace('.', ',');
  const taxaFmt = taxaEntrega.toFixed(2).replace('.', ',');
  const totalFmt = totalNum.toFixed(2).replace('.', ',');
  // ========================================

  let enderecoHTML = '';
  if (pedido.cliente_endereco) {
      const enderecoMapa = encodeURIComponent(pedido.cliente_endereco);
      enderecoHTML = `
        <div class="pedido-endereco">
            <p><i class="fa-solid fa-location-dot" style="color:var(--cor-secundaria)"></i> ${pedido.cliente_endereco}</p>
            <iframe src="https://maps.google.com/maps?q=${enderecoMapa}&t=&z=16&ie=UTF8&iwloc=&output=embed" class="mapa-pedido" allowfullscreen="" loading="lazy"></iframe>
        </div>
      `;
  }

  const isEntrega = pedido.cliente_endereco && pedido.cliente_endereco.trim() !== '';
  const isMesa = pedido.cliente_telefone === 'Pedido da Mesa' || pedido.cliente_telefone === 'Pedido Interno';
  
  let tagTipoHTML = '';
  if (isEntrega) {
      const bairroInfo = pedido.bairro ? ` • ${pedido.bairro}` : '';
      tagTipoHTML = `<span class="badge-tipo pedido-entrega"><i class="fa-solid fa-motorcycle"></i> Pedido de Entrega${bairroInfo}</span>`;
  } else if (isMesa) {
      tagTipoHTML = `<span class="badge-tipo pedido-mesa"><i class="fa-solid fa-utensils"></i> Pedido da Mesa</span>`;
  }

  let tagPagamentoHTML = '';
  if (pedido.pagamento) {
      let corBadge = 'background: rgba(255,255,255,0.1); color: #fff; border: 1px solid #555;';
      if (pedido.pagamento.includes('Dinheiro')) corBadge = 'background: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid #22c55e;';
      if (pedido.pagamento.includes('Cartão') || pedido.pagamento.includes('PIX')) corBadge = 'background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid #3b82f6;';
      if (pedido.pagamento.includes('Antecipado')) corBadge = 'background: rgba(168, 85, 247, 0.15); color: #a855f7; border: 1px solid #a855f7;';
      
      tagPagamentoHTML = `<span class="badge-tipo" style="${corBadge} margin-bottom: 10px;"><i class="fa-solid fa-wallet"></i> ${pedido.pagamento}</span>`;
  }

  // Bloco do total com subtotal + taxa + total
  const taxaHTML = taxaEntrega > 0
    ? `<div style="display:flex; justify-content:space-between; font-size:0.88rem; color:var(--cor-secundaria);">
         <span><i class="fa-solid fa-motorcycle"></i> Taxa de Entrega</span>
         <span>R$ ${taxaFmt}</span>
       </div>`
    : '';

  card.innerHTML = `
    <div class="pedido-header" style="align-items: flex-start; margin-bottom: 5px;">
      <span class="pedido-id">#${pedido.id.slice(0, 8)}</span>
      <span class="pedido-hora">${dataFormatada} às ${horaFormatada}</span>
    </div>
    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        ${tagTipoHTML}
        ${tagPagamentoHTML}
    </div>
    <div class="pedido-cliente">${pedido.cliente_nome} <small>${pedido.cliente_telefone && !isMesa ? pedido.cliente_telefone : ''}</small></div>
    ${enderecoHTML}
    <ul class="pedido-itens" style="margin-top: 15px;">${itensHTML}</ul>

    <div class="pedido-total" style="display:flex; flex-direction:column; gap:4px;">
      <div style="display:flex; justify-content:space-between; font-size:0.88rem; color:#aaa;">
        <span>Subtotal</span><span>R$ ${subtotalFmt}</span>
      </div>
      ${taxaHTML}
      <div style="display:flex; justify-content:space-between; border-top:1px solid #333; padding-top:6px; margin-top:2px; font-weight:bold;">
        <span>Total</span><span class="valor">R$ ${totalFmt}</span>
      </div>
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

function removerPedidoDaTela(id) {
  const el = document.querySelector(`[data-pedido="${id}"]`);
  if (el) el.remove();
  pedidosNaTela.delete(id);
  
  if (novasNotificacoes > 0) {
    novasNotificacoes--;
    atualizarBadgeNotificacao();
  }

  const lista = document.getElementById('lista-pedidos');
  if (lista && lista.children.length === 0) {
    lista.innerHTML = '<div class="vazio">Nenhum pedido ainda. Aguardando...</div>';
  }
}

async function apagarPedidoRecente(id) {
  if (!confirm("Tem certeza que deseja APAGAR este pedido?")) return;
  removerPedidoDaTela(id);

  const { error } = await supabaseClient.from('pedidos_recentes').delete().eq('id', id);
  if (error) { alert("Erro ao apagar: " + error.message); carregarPedidos(paginaAtualRecentes); }
}

/* ===================== ABA DE HISTÓRICO ===================== */
async function carregarHistorico(pagina = 1) {
  paginaAtualHistorico = pagina;
  const inicio = (pagina - 1) * ITENS_POR_PAGINA;
  const fim = inicio + ITENS_POR_PAGINA - 1;

  const lista = document.getElementById('lista-historico');
  if (!lista) return;

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
      pedidosArquivadosGlobais = data;

      data.forEach(p => {
        const dataObj = new Date(p.created_at);
        const dataStr = dataObj.toLocaleString('pt-BR');
        const nomeFuncionario = p.impresso_por || 'Não registrado';

        const isEntrega = p.cliente_endereco && p.cliente_endereco.trim() !== '';
        const isMesa = p.cliente_telefone === 'Pedido da Mesa' || p.cliente_telefone === 'Pedido Interno';

        // Cálculo da taxa no histórico
        const taxaHist = Number(p.taxa_entrega) || 0;
        const totalHist = Number(p.total) || 0;
        const subtotalHist = totalHist - taxaHist;
        const subtotalHistFmt = subtotalHist.toFixed(2).replace('.', ',');
        const taxaHistFmt = taxaHist.toFixed(2).replace('.', ',');
        const totalHistFmt = totalHist.toFixed(2).replace('.', ',');

        const infoFinanceira = taxaHist > 0
          ? `<span style="color:#aaa;">Subtotal: R$ ${subtotalHistFmt}</span> <span style="color:var(--cor-secundaria);">+ Taxa: R$ ${taxaHistFmt}</span> = <strong style="color:#fff;">Total: R$ ${totalHistFmt}</strong>`
          : `<strong style="color:#fff;">Total: R$ ${totalHistFmt}</strong>`;

        let tagTipoHTML = '';
        if (isEntrega) {
            const bairroInfo = p.bairro ? ` • ${p.bairro}` : '';
            tagTipoHTML = `<span class="badge-tipo pedido-entrega" style="margin-bottom:0; padding:2px 8px; font-size:0.65rem;"><i class="fa-solid fa-motorcycle"></i> Entrega${bairroInfo}</span>`;
        } else if (isMesa) {
            tagTipoHTML = `<span class="badge-tipo pedido-mesa" style="margin-bottom:0; padding:2px 8px; font-size:0.65rem;"><i class="fa-solid fa-utensils"></i> Mesa</span>`;
        }

        let tagPagamentoHTML = '';
        if (p.pagamento) {
            let corBadge = 'background: rgba(255,255,255,0.1); color: #fff; border: 1px solid #555;';
            if (p.pagamento.includes('Dinheiro')) corBadge = 'background: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid #22c55e;';
            if (p.pagamento.includes('Cartão') || p.pagamento.includes('PIX')) corBadge = 'background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid #3b82f6;';
            if (p.pagamento.includes('Antecipado')) corBadge = 'background: rgba(168, 85, 247, 0.15); color: #a855f7; border: 1px solid #a855f7;';
            
            tagPagamentoHTML = `<span class="badge-tipo" style="${corBadge} margin-bottom:0; padding:2px 8px; font-size:0.65rem;"><i class="fa-solid fa-wallet"></i> ${p.pagamento}</span>`;
        }

        let enderecoHTML = '';
        if (isEntrega) {
            enderecoHTML = `
              <p style="font-size: 0.85rem; color: #ccc; margin-top: 8px; background: rgba(255,255,255,0.05); padding: 6px 10px; border-radius: 6px; display: inline-block;">
                  <i class="fa-solid fa-location-dot" style="color:var(--cor-secundaria)"></i> ${p.cliente_endereco}
              </p>
            `;
        }

        lista.innerHTML += `
          <div class="card-historico" id="hist-${p.id}">
            <div class="info">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px; flex-wrap: wrap;">
                ${tagTipoHTML}
                ${tagPagamentoHTML}
                <h4 style="margin: 0;">#${p.id.slice(0, 8)} - ${p.cliente_nome}</h4>
              </div>
              <p>${dataStr} | ${infoFinanceira}</p>
              
              ${enderecoHTML}
              
              <p style="font-size: 0.8rem; color: var(--cor-secundaria); margin-top: 8px; display: flex; align-items: center; gap: 5px;">
                <i class="fa-solid fa-user-check"></i> Impresso por: <strong>${nomeFuncionario}</strong>
              </p>
            </div>
            <div class="acoes">
              <span class="badge-impresso">✔ Impresso</span>
              
              <button class="btn-reimprimir" onclick="acionarReimpressao('${p.id}', this)" title="Emitir Segunda Via">
                <i class="fa-solid fa-print"></i>
              </button>

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

/* ===================== REIMPRESSÃO (SEGUNDA VIA) ===================== */
function acionarReimpressao(id, botao) {
    if (!confirm("Deseja mesmo re-imprimir o recibo?")) return;

    const pedido = pedidosArquivadosGlobais.find(p => p.id === id);
    
    if (pedido) {
        botao.disabled = true;
        reimprimirRecibo(pedido, botao);
    } else {
        alert("Pedido não encontrado no histórico para reimpressão.");
    }
}

async function apagarHistorico(id) {
  if (!confirm("Tem certeza que deseja apagar este pedido do histórico?")) return;
  const el = document.getElementById(`hist-${id}`);
  if (el) el.remove();
  const { error } = await supabaseClient.from('pedidos_arquivados').delete().eq('id', id);
  if (error) { alert("Erro ao apagar: " + error.message); carregarHistorico(paginaAtualHistorico); }
}

/* ===================== PAGINAÇÃO ===================== */
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

/* ===================== GRÁFICOS ===================== */
async function gerarGraficos() {
  if (!document.getElementById('piechart')) return; 

  const { data: recentes } = await supabaseClient.from('pedidos_recentes').select('*');
  const { data: arquivados } = await supabaseClient.from('pedidos_arquivados').select('*');
  
  const todosPedidos = [...(recentes || []), ...(arquivados || [])];

  const faturamentoTotal = todosPedidos.reduce((acc, p) => acc + Number(p.total), 0);
  const faturamentoEl = document.getElementById('faturamento-total-valor');
  if (faturamentoEl) {
      faturamentoEl.textContent = `R$ ${faturamentoTotal.toFixed(2).replace('.', ',')}`;
  }

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

/* ===================== FUNCIONÁRIOS ===================== */
async function carregarFuncionarios() {
  const lista = document.getElementById('lista-funcionarios');
  if (!lista) return;

  lista.innerHTML = '<div class="vazio">Carregando funcionários...</div>';

  const { data, error } = await supabaseClient
    .from('usuarios_salvos')
    .select('*')
    .eq('tipo', 'funcionario')
    .order('login', { ascending: true });

  if (error) { lista.innerHTML = '<div class="vazio">Erro ao carregar funcionários.</div>'; return; }
  if (data.length === 0) { lista.innerHTML = '<div class="vazio">Nenhum funcionário cadastrado.</div>'; return; }

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

/* ===================== TAXAS DE ENTREGA (CRUD) ===================== */
function limparCacheTaxasFrontend() {
  try { localStorage.removeItem('na_brasas_taxas_entrega_v1'); } catch (_) {}
}

async function carregarTaxasAdmin() {
  const lista = document.getElementById('lista-taxas');
  if (!lista) return;

  lista.innerHTML = '<div class="vazio">Carregando taxas...</div>';

  const { data, error } = await supabaseClient
    .from('taxas_entrega')
    .select('*')
    .order('bairro', { ascending: true });

  if (error) { lista.innerHTML = '<div class="vazio">Erro ao carregar taxas.</div>'; return; }
  if (!data || data.length === 0) { lista.innerHTML = '<div class="vazio">Nenhuma taxa cadastrada.</div>'; return; }

  taxasGlobais = data;
  lista.innerHTML = '';

  data.forEach(t => {
    const valorFmt = Number(t.taxa).toFixed(2).replace('.', ',');
    const badgeAtivo = t.ativo
      ? '<span class="badge-impresso" style="margin-right:8px;">Ativo</span>'
      : '<span class="badge-impresso" style="margin-right:8px; background:#333; color:#999;">Inativo</span>';

    lista.innerHTML += `
      <div class="card-funcionario" id="taxa-${t.id}">
        <div class="info">
          <h4>${t.bairro}</h4>
          <p>Taxa: R$ ${valorFmt}</p>
        </div>
        <div class="acoes">
          ${badgeAtivo}
          <button class="btn-editar" onclick="abrirModalTaxa('${t.id}')" title="Editar">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn-lixeira" onclick="apagarTaxa('${t.id}')" title="Apagar">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  });
}

function abrirModalTaxa(id = null) {
  document.getElementById('modal-taxa').classList.add('ativo');

  if (id) {
    const t = taxasGlobais.find(x => x.id === id);
    if (!t) return;
    document.getElementById('taxa-id').value = t.id;
    document.getElementById('taxa-bairro').value = t.bairro;
    document.getElementById('taxa-valor').value = t.taxa;
    document.getElementById('titulo-modal-taxa').textContent = 'Editar Taxa';
  } else {
    document.getElementById('taxa-id').value = '';
    document.getElementById('taxa-bairro').value = '';
    document.getElementById('taxa-valor').value = '';
    document.getElementById('titulo-modal-taxa').textContent = 'Nova Taxa';
  }
}

function fecharModalTaxa() {
  document.getElementById('modal-taxa').classList.remove('ativo');
}

async function salvarTaxa() {
  const id = document.getElementById('taxa-id').value;
  const bairro = document.getElementById('taxa-bairro').value.trim();
  const valorStr = document.getElementById('taxa-valor').value;
  const valor = parseFloat(valorStr);

  if (!bairro) { alert("Preencha o nome do bairro."); return; }
  if (isNaN(valor) || valor < 0) { alert("Preencha um valor válido (>= 0)."); return; }

  const btn = document.querySelector('#modal-taxa .btn-enviar-manual');
  btn.disabled = true;
  btn.innerHTML = 'Salvando...';

  try {
    if (id) {
      const { error } = await supabaseClient
        .from('taxas_entrega')
        .update({ bairro, taxa: valor })
        .eq('id', id);
      if (error) throw error;
      alert("Taxa atualizada!");
    } else {
      const { error } = await supabaseClient
        .from('taxas_entrega')
        .insert([{ bairro, taxa: valor, ativo: true }]);
      if (error) {
        if (error.code === '23505') throw new Error("Este bairro já está cadastrado.");
        throw error;
      }
      alert("Taxa criada!");
    }
    limparCacheTaxasFrontend();
    fecharModalTaxa();
    carregarTaxasAdmin();
  } catch (err) {
    alert("Erro ao salvar: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar';
  }
}

async function apagarTaxa(id) {
  const t = taxasGlobais.find(x => x.id === id);
  if (!t) return;
  if (!confirm(`Apagar a taxa do bairro "${t.bairro}"?`)) return;

  const el = document.getElementById(`taxa-${id}`);
  if (el) el.style.opacity = '0.5';

  const { error } = await supabaseClient.from('taxas_entrega').delete().eq('id', id);

  if (error) {
    alert("Erro ao apagar: " + error.message);
    if (el) el.style.opacity = '1';
  } else {
    limparCacheTaxasFrontend();
    carregarTaxasAdmin();
  }
}

/* ===================== PEDIDO MANUAL (MESAS) ===================== */
async function carregarProdutosParaManual() {
    if (!document.getElementById('manual-lanche')) return; 

    const { data: produtos } = await supabaseClient.from('produtos').select('*').eq('ativo', true).order('nome');
    const { data: adicionais } = await supabaseClient.from('adicionais').select('*').eq('ativo', true).order('nome');
    if (adicionais) listaAdicionaisGlobal = adicionais;

    if (produtos) {
        produtosGlobais = produtos;
        const select = document.getElementById('manual-lanche');
        select.innerHTML = ''; 
        produtos.forEach(prod => {
            select.innerHTML += `<option value="${prod.nome}|${prod.preco}">${prod.nome} - R$ ${Number(prod.preco).toFixed(2).replace('.', ',')}</option>`;
        });
    }
}

function abrirModalPedidoManual() {
  if (!document.getElementById('modal-pedido-manual')) return;
  carrinhoManual = [];
  atualizarCarrinhoManualUI();
  document.getElementById('manual-nome').value = '';
  document.getElementById('manual-mesa').value = '';
  document.getElementById('modal-pedido-manual').classList.add('ativo');
}

function fecharModalPedidoManual() {
  document.getElementById('modal-pedido-manual').classList.remove('ativo');
}

function adicionarItemManual() {
  const select = document.getElementById('manual-lanche');
  if (!select || !select.value) return;
  
  const [nome, precoStr] = select.value.split('|');
  const preco = parseFloat(precoStr);

  itemManualAtual = { nome, preco };

  const listaModal = document.getElementById('lista-adicionais-manual');
  listaModal.innerHTML = '';

  if (listaAdicionaisGlobal.length === 0) {
      listaModal.innerHTML = '<p style="color:#999">Nenhum adicional disponível.</p>';
  } else {
      listaAdicionaisGlobal.forEach(ad => {
          listaModal.innerHTML += `
              <label class="item-adicional" onclick="this.classList.toggle('checked')">
                  <div style="display:flex; align-items:center; gap:10px;">
                      <input type="checkbox" class="check-adicional-manual" data-preco="${ad.preco}" data-nome="${ad.nome}" onchange="calcularTotalAdicionaisManual()">
                      <span>${ad.nome}</span>
                  </div>
                  <span class="preco-adicional">+ R$ ${Number(ad.preco).toFixed(2).replace('.', ',')}</span>
              </label>
          `;
      });
  }

  document.getElementById('item-manual-nome').textContent = nome;
  calcularTotalAdicionaisManual();
  document.getElementById('modal-adicionais-manual').classList.add('ativo');
}

function calcularTotalAdicionaisManual() {
  if (!itemManualAtual) return;
  let total = itemManualAtual.preco;
  const checkboxes = document.querySelectorAll('.check-adicional-manual:checked');
  
  checkboxes.forEach(cb => {
      total += Number(cb.getAttribute('data-preco'));
  });
  document.getElementById('total-adicionais-manual').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

function fecharModalAdicionaisManual() {
  document.getElementById('modal-adicionais-manual').classList.remove('ativo');
  document.querySelectorAll('.check-adicional-manual').forEach(cb => {
      cb.checked = false;
      cb.closest('.item-adicional').classList.remove('checked');
  });
}

function confirmarAdicionaisManual() {
  if (!itemManualAtual) return;

  const checkboxes = document.querySelectorAll('.check-adicional-manual:checked');
  const adicionaisEscolhidos = [];
  let precoFinal = itemManualAtual.preco;

  checkboxes.forEach(cb => {
      const nomeAd = cb.getAttribute('data-nome');
      const precoAd = Number(cb.getAttribute('data-preco'));
      adicionaisEscolhidos.push({ nome: nomeAd, preco: precoAd });
      precoFinal += precoAd;
  });

  let nomeExibicao = itemManualAtual.nome;
  if (adicionaisEscolhidos.length > 0) {
      nomeExibicao += ` (+ ${adicionaisEscolhidos.map(a => a.nome).join(', ')})`;
  }

  const novoItem = {
      nome: nomeExibicao,
      nomeBase: itemManualAtual.nome,
      preco: precoFinal,
      adicionais: adicionaisEscolhidos,
      qtd: 1
  };

  const itemExistenteIndex = carrinhoManual.findIndex(i => i.nome === novoItem.nome);
  if (itemExistenteIndex > -1) {
      carrinhoManual[itemExistenteIndex].qtd += 1;
  } else {
      carrinhoManual.push(novoItem);
  }

  atualizarCarrinhoManualUI();
  fecharModalAdicionaisManual();
}

function removerItemManual(index) {
  carrinhoManual.splice(index, 1);
  atualizarCarrinhoManualUI();
}

function atualizarCarrinhoManualUI() {
  const lista = document.getElementById('lista-manual-carrinho');
  const totalEl = document.getElementById('total-manual-valor');
  if (!lista || !totalEl) return;

  lista.innerHTML = '';
  let total = 0;

  carrinhoManual.forEach((item, index) => {
    total += item.preco * item.qtd;
    
    let adicionaisHTML = '';
    if (item.adicionais && item.adicionais.length > 0) {
        adicionaisHTML = `<br><span style="font-size:0.75rem; color:#999;">Adic: ${item.adicionais.map(a => a.nome).join(', ')}</span>`;
    }

    lista.innerHTML += `
      <div class="item-manual" style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.9rem;">
        <span>${item.qtd}x ${item.nomeBase || item.nome} ${adicionaisHTML}</span>
        <div>
            <span style="margin-right:15px;">R$ ${(item.preco * item.qtd).toFixed(2).replace('.', ',')}</span>
            <button onclick="removerItemManual(${index})" style="background:none; border:none; color:#ef4444; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
    `;
  });

  if (carrinhoManual.length === 0) {
    lista.innerHTML = '<div style="text-align:center; color:#999; padding: 20px; font-style: italic;">Nenhum item adicionado.</div>';
  }
  totalEl.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

async function enviarPedidoManual() {
  const nome = document.getElementById('manual-nome').value.trim();
  const mesa = document.getElementById('manual-mesa').value.trim();

  if (!nome) { alert("Por favor, preencha o nome do cliente."); return; }
  if (carrinhoManual.length === 0) { alert("Adicione pelo menos um item."); return; }

  const total = carrinhoManual.reduce((acc, item) => acc + (item.preco * item.qtd), 0);
  const nomeFinal = mesa ? `${nome} (${mesa})` : nome;

  const novoPedido = {
    cliente_nome: nomeFinal,
    cliente_telefone: 'Pedido da Mesa',
    cliente_endereco: null,
    bairro: null,
    taxa_entrega: 0,
    pagamento: 'Pagar no Local',
    itens: carrinhoManual,
    total: total
  };

  const btn = document.querySelector('.btn-enviar-manual');
  btn.disabled = true;
  btn.innerHTML = 'Enviando...';

  try {
    const { error } = await supabaseClient.from('pedidos_recentes').insert([novoPedido]);
    if (error) throw error;
    fecharModalPedidoManual();
  } catch (err) {
    alert("Erro ao criar pedido: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar para a Cozinha';
  }
}

/* ===================== MEU PERFIL (ADMIN) ===================== */
function abrirModalPerfil() {
    const sessaoSalva = localStorage.getItem('nabrasas_sessao');
    if (!sessaoSalva) return;
    const sessao = JSON.parse(sessaoSalva);

    if (!sessao.id) { alert("Sessão antiga. Faça login novamente."); return; }

    supabaseClient.from('usuarios_salvos').select('*').eq('id', sessao.id).single().then(({data, error}) => {
        if (error || !data) { alert("Erro ao carregar o perfil."); return; }
        
        document.getElementById('perfil-id').value = data.id;
        document.getElementById('perfil-login').value = data.login;
        document.getElementById('perfil-senha').value = data.senha; 
        document.getElementById('modal-perfil').classList.add('ativo');
    });
}

function fecharModalPerfil() {
    document.getElementById('modal-perfil').classList.remove('ativo');
}

async function salvarPerfil() {
    const id = document.getElementById('perfil-id').value;
    const novoLogin = document.getElementById('perfil-login').value.trim();
    const novaSenha = document.getElementById('perfil-senha').value.trim();

    if (!novoLogin || !novaSenha) { alert("Preencha o login e a senha."); return; }

    const btn = document.querySelector('#modal-perfil .btn-enviar-manual');
    btn.disabled = true;
    btn.innerHTML = 'Salvando...';

    try {
        const { error } = await supabaseClient.from('usuarios_salvos').update({ login: novoLogin, senha: novaSenha }).eq('id', id);
        if (error) throw error;

        const sessaoSalva = localStorage.getItem('nabrasas_sessao');
        if (sessaoSalva) {
            let sessao = JSON.parse(sessaoSalva);
            sessao.nome = novoLogin; 
            localStorage.setItem('nabrasas_sessao', JSON.stringify(sessao));
        }

        document.getElementById('user-info').textContent = `Logado como: ${novoLogin} (Admin)`;
        alert("Perfil atualizado!");
        fecharModalPerfil();

    } catch (err) {
        alert("Erro ao salvar: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Alterações';
    }
}