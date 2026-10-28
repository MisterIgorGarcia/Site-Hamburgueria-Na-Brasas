const SUPABASE_URL = 'https://xzaqqzlfwkjtksjlcbgx.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_hoYHM3UKlvTDMCaadvI1kQ_gcn9-pqq'; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let impressoraChar = null;
let impressoraDevice = null;
let subscriptionPedidos = null;
const pedidosNaTela = new Map();

/* ===================== VERIFICAÇÃO DE LOGIN ===================== */
document.addEventListener('DOMContentLoaded', () => {
  const sessaoSalva = localStorage.getItem('nabrasas_sessao');
  
  if (!sessaoSalva) {
    window.location.href = '../login.html'; // Não logado
    return;
  }

  const sessao = JSON.parse(sessaoSalva);
  if (sessao.tipo !== 'admin') {
    window.location.href = '../login.html'; // Logado, mas é funcionário
    return;
  }

  // Se chegou aqui, é admin logado!
  document.getElementById('user-info').textContent = `Logado como: ${sessao.nome} (Admin)`;
  iniciarPainel();
});

function sair() {
  localStorage.removeItem('nabrasas_sessao');
  window.location.href = '../login.html';
}

/* ===================== INICIAR PAINEL ===================== */
function iniciarPainel() {
  carregarPedidos();
  escutarNovosPedidos();
  arquivarAntigos();
}

async function carregarPedidos() {
  const { data, error } = await supabaseClient
    .from('pedidos_recentes')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) return;

  const lista = document.getElementById('lista-pedidos');
  lista.innerHTML = '';

  if (!data || data.length === 0) {
    lista.innerHTML = '<div class="vazio">Nenhum pedido ainda. Aguardando...</div>';
    return;
  }

  data.forEach(p => adicionarPedidoNaTela(p, false));
}

function escutarNovosPedidos() {
  subscriptionPedidos = supabaseClient
    .channel('pedidos-recentes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_recentes' }, (payload) => {
        if (payload.eventType === 'INSERT') adicionarPedidoNaTela(payload.new, true);
        else if (payload.eventType === 'DELETE') removerPedidoDaTela(payload.old.id);
        else if (payload.eventType === 'UPDATE') pedidosNaTela.set(payload.new.id, payload.new);
    }).subscribe();
}

function adicionarPedidoNaTela(pedido, novo) {
  if (pedidosNaTela.has(pedido.id)) return;
  pedidosNaTela.set(pedido.id, pedido);

  const lista = document.getElementById('lista-pedidos');
  const vazio = lista.querySelector('.vazio');
  if (vazio) vazio.remove();

  const card = document.createElement('div');
  card.className = 'pedido' + (novo ? ' novo' : '');
  card.dataset.pedido = pedido.id;

  const data = new Date(pedido.created_at);
  const hora = data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
  const itensHTML = itens.map(i => `<li><span>${i.qtd || 1}x ${i.nome}</span><span>R$ ${Number(i.preco).toFixed(2)}</span></li>`).join('');

  card.innerHTML = `
    <div class="pedido-header">
      <span class="pedido-id">#${pedido.id.slice(0, 8)}</span>
      <span class="pedido-hora">${hora}</span>
    </div>
    <div class="pedido-cliente">${pedido.cliente_nome} <small>${pedido.cliente_telefone || ''}</small></div>
    <ul class="pedido-itens">${itensHTML}</ul>
    <div class="pedido-total">
      <span>Total</span><span class="valor">R$ ${Number(pedido.total).toFixed(2)}</span>
    </div>
    <div class="pedido-acoes">
      <button class="btn-admin btn-admin-primario btn-imprimir">🖨️ Imprimir e arquivar</button>
    </div>
  `;

  card.querySelector('.btn-imprimir').addEventListener('click', (ev) => {
    ev.currentTarget.disabled = true;
    imprimirEArquivar(pedido, ev.currentTarget);
  });

  lista.appendChild(card);
}

function removerPedidoDaTela(id) {
  const el = document.querySelector(`[data-pedido="${id}"]`);
  if (el) el.remove();
  pedidosNaTela.delete(id);
  if (document.getElementById('lista-pedidos').children.length === 0) {
    document.getElementById('lista-pedidos').innerHTML = '<div class="vazio">Nenhum pedido ainda.</div>';
  }
}

/* ===================== IMPRESSÃO E ARQUIVAMENTO (Mantidos) ===================== */
// [O restante do código do botão de conectar impressora e gerar recibo continua igual...]
// Vou colocar o resumo para você não precisar reescrever se já estava funcionando.

const btnConectar = document.getElementById('btn-conectar');
btnConectar.addEventListener('click', async () => { /* Lógica bluetooth */ });

async function imprimirEArquivar(pedido, botao) {
    // Lógica de imprimir, inserir em arquivados e deletar de recentes
}

// (Mantenha as funções: garantirConexao, atualizarStatusImpressora, enviarBytes, gerarRecibo, arquivarAntigos que já estavam no seu código)