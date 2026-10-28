/* =====================================================================
   CONFIGURAÇÃO — troque pelos valores do SEU projeto Supabase
   (Project Settings → API)
   ===================================================================== */
const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA-ANON-KEY-AQUI';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =====================================================================
   ESTADO GLOBAL
   ===================================================================== */
let usuarioLogado = null;
let impressoraChar = null;
let impressoraDevice = null;
let subscriptionPedidos = null;
const pedidosNaTela = new Map();

/* =====================================================================
   LOGIN
   ===================================================================== */
const formLogin = document.getElementById('form-login');
const loginErro = document.getElementById('login-erro');

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-entrar');
  const login = document.getElementById('inp-login').value.trim();
  const senha = document.getElementById('inp-senha').value;

  btn.disabled = true;
  btn.textContent = 'Entrando...';
  loginErro.textContent = '';

  try {
    let { data, error } = await supabaseClient.rpc('login_admin', {
      p_login: login, p_senha: senha
    });
    if (error) throw error;

    if (data?.success) {
      usuarioLogado = { ...data, tipo: 'admin' };
    } else {
      ({ data, error } = await supabaseClient.rpc('login_usuario', {
        p_login: login, p_senha: senha
      }));
      if (error) throw error;

      if (data?.success) {
        usuarioLogado = { ...data, tipo: 'usuario' };
      }
    }

    if (!usuarioLogado) {
      loginErro.textContent = 'Login ou senha inválidos';
      return;
    }

    localStorage.setItem('nabrasas_logado', JSON.stringify(usuarioLogado));
    entrarNoPainel();
  } catch (err) {
    loginErro.textContent = 'Erro: ' + (err.message || 'falha na conexão');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const salvo = localStorage.getItem('nabrasas_logado');
  if (salvo) {
    try {
      usuarioLogado = JSON.parse(salvo);
      entrarNoPainel();
    } catch (e) {
      localStorage.removeItem('nabrasas_logado');
    }
  }
});

document.getElementById('btn-sair').addEventListener('click', () => {
  localStorage.removeItem('nabrasas_logado');
  if (subscriptionPedidos) supabaseClient.removeChannel(subscriptionPedidos);
  location.reload();
});

/* =====================================================================
   ENTRAR NO PAINEL
   ===================================================================== */
function entrarNoPainel() {
  document.getElementById('view-login').style.display = 'none';
  document.getElementById('view-dash').classList.add('ativo');
  document.getElementById('user-info').textContent =
    `${usuarioLogado.login} (${usuarioLogado.tipo})`;

  carregarPedidos();
  escutarNovosPedidos();
  arquivarAntigos();
}

/* =====================================================================
   CARREGAR PEDIDOS DO BANCO
   ===================================================================== */
async function carregarPedidos() {
  const { data, error } = await supabaseClient
    .from('pedidos_recentes')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Erro ao carregar pedidos:', error);
    return;
  }

  const lista = document.getElementById('lista-pedidos');
  lista.innerHTML = '';

  if (!data || data.length === 0) {
    lista.innerHTML = '<div class="vazio">Nenhum pedido ainda. Aguardando...</div>';
    return;
  }

  data.forEach(p => adicionarPedidoNaTela(p, false));
}

/* =====================================================================
   TEMPO REAL
   ===================================================================== */
function escutarNovosPedidos() {
  subscriptionPedidos = supabaseClient
    .channel('pedidos-recentes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'pedidos_recentes' },
      (payload) => {
        if (payload.eventType === 'INSERT') adicionarPedidoNaTela(payload.new, true);
        else if (payload.eventType === 'DELETE') removerPedidoDaTela(payload.old.id);
        else if (payload.eventType === 'UPDATE') atualizarPedidoNaTela(payload.new);
      })
    .subscribe();
}

/* =====================================================================
   RENDERIZAÇÃO
   ===================================================================== */
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
  const hora = data.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });

  const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
  const itensHTML = itens.map(i => {
    const nome = i.nome || '?';
    const qtd = i.qtd || 1;
    const preco = Number(i.preco || 0).toFixed(2).replace('.', ',');
    return `<li><span>${qtd}x ${escapar(nome)}</span><span>R$ ${preco}</span></li>`;
  }).join('');

  card.innerHTML = `
    <div class="pedido-header">
      <span class="pedido-id">#${pedido.id.slice(0, 8)}</span>
      <span class="pedido-hora">${hora}</span>
    </div>
    <div class="pedido-cliente">
      ${escapar(pedido.cliente_nome)}
      ${pedido.cliente_telefone ? `<small>${escapar(pedido.cliente_telefone)}</small>` : ''}
    </div>
    <ul class="pedido-itens">${itensHTML || '<li><em>(sem itens)</em></li>'}</ul>
    <div class="pedido-total">
      <span>Total</span>
      <span class="valor">R$ ${Number(pedido.total).toFixed(2).replace('.', ',')}</span>
    </div>
    <div class="pedido-acoes">
      <button class="btn btn-primario btn-imprimir">🖨️ Imprimir e arquivar</button>
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

  const lista = document.getElementById('lista-pedidos');
  if (lista.children.length === 0) {
    lista.innerHTML = '<div class="vazio">Nenhum pedido ainda. Aguardando...</div>';
  }
}

function atualizarPedidoNaTela(pedido) {
  pedidosNaTela.set(pedido.id, pedido);
}

function escapar(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* =====================================================================
   IMPRESSÃO VIA WEB BLUETOOTH
   ===================================================================== */
const btnConectar = document.getElementById('btn-conectar');

btnConectar.addEventListener('click', async () => {
  try {
    btnConectar.disabled = true;
    btnConectar.textContent = 'Conectando...';
    await garantirConexao();
  } catch (err) {
    alert('Falha ao conectar: ' + err.message);
  } finally {
    btnConectar.disabled = false;
    btnConectar.textContent = '🔌 Conectar Impressora';
  }
});

async function garantirConexao() {
  if (impressoraChar && impressoraDevice?.gatt?.connected) return impressoraChar;

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [
      '000018f0-0000-1000-8000-00805f9b34fb',
      '49535343-fe7d-4ae5-8fa9-9fafd205e455',
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
    ]
  });

  const server = await device.gatt.connect();

  let char = null;
  const servicos = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
  ];

  for (const uuid of servicos) {
    try {
      const svc = await server.getPrimaryService(uuid);
      const chars = await svc.getCharacteristics();
      char = chars.find(c => c.properties.write || c.properties.writeWithoutResponse);
      if (char) break;
    } catch (_) {}
  }

  if (!char) throw new Error('Característica de escrita não encontrada');

  impressoraChar = char;
  impressoraDevice = device;
  device.addEventListener('gattserverdisconnected', () => {
    impressoraChar = null;
    atualizarStatusImpressora();
  });

  atualizarStatusImpressora();
  return char;
}

function atualizarStatusImpressora() {
  const wrap = document.getElementById('status-impressora');
  const txt = document.getElementById('status-texto');
  if (impressoraChar && impressoraDevice?.gatt?.connected) {
    wrap.classList.add('conectada');
    txt.textContent = 'Impressora conectada — ' + (impressoraDevice.name || 'POS-58');
  } else {
    wrap.classList.remove('conectada');
    txt.textContent = 'Impressora desconectada';
  }
}

async function imprimirEArquivar(pedido, botao) {
  try {
    const char = await garantirConexao();
    const bytes = gerarRecibo(pedido);
    await enviarBytes(char, bytes);

    const { error: errInsert } = await supabaseClient
      .from('pedidos_arquivados')
      .insert({
        id: pedido.id,
        cliente_nome: pedido.cliente_nome,
        cliente_telefone: pedido.cliente_telefone,
        itens: pedido.itens,
        total: pedido.total,
        status: 'impresso',
        created_at: pedido.created_at
      });
    if (errInsert) throw new Error('Falha ao arquivar: ' + errInsert.message);

    const { error: errDelete } = await supabaseClient
      .from('pedidos_recentes')
      .delete()
      .eq('id', pedido.id);
    if (errDelete) {
      console.warn('Pedido ficou duplicado (arquivado + recente):', pedido.id);
      alert('Impresso e arquivado, mas não foi possível remover da fila. Recarregue a página.');
    }

    removerPedidoDaTela(pedido.id);
  } catch (err) {
    alert('Erro na impressão: ' + err.message);
    botao.disabled = false;
  }
}

async function enviarBytes(characteristic, bytes) {
  const CHUNK = 100;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const pedaco = bytes.slice(i, i + CHUNK);
    await characteristic.writeValue(pedaco);
    await new Promise(r => setTimeout(r, 25));
  }
}

function normalizar(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function gerarRecibo(pedido) {
  const CMD = {
    init:   [0x1B, 0x40],
    center: [0x1B, 0x61, 0x01],
    left:   [0x1B, 0x61, 0x00],
    normal: [0x1B, 0x21, 0x00],
    bold:   [0x1B, 0x21, 0x08],
    double: [0x1B, 0x21, 0x30],
    cut:    [0x1D, 0x56, 0x00]
  };

  const partes = [];
  const add = (arr) => partes.push(new Uint8Array(arr));
  const txt = (s) => partes.push(new TextEncoder().encode(normalizar(s)));

  const linha      = '-'.repeat(32) + '\n';
  const linhaIgual = '='.repeat(32) + '\n';

  add(CMD.init);
  add(CMD.center);
  add(CMD.double);
  txt('NA BRASAS\n');
  add(CMD.normal);
  txt('Hamburgueria Artesanal\n');
  txt(linhaIgual);
  add(CMD.left);

  const data = new Date(pedido.created_at);
  txt(`Pedido: #${pedido.id.slice(0, 8)}\n`);
  txt(`Data:   ${data.toLocaleString('pt-BR')}\n`);
  txt(linha);

  add(CMD.bold);
  txt(`Cliente: ${pedido.cliente_nome}\n`);
  add(CMD.normal);
  if (pedido.cliente_telefone) txt(`Tel: ${pedido.cliente_telefone}\n`);
  txt(linha);

  add(CMD.bold);
  txt('ITENS:\n');
  add(CMD.normal);

  const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
  for (const i of itens) {
    const nome  = i.nome || '?';
    const qtd   = i.qtd || 1;
    const preco = Number(i.preco || 0).toFixed(2).replace('.', ',');
    const label = `${qtd}x ${nome}`;
    const val   = `R$ ${preco}`;
    const esp   = Math.max(1, 32 - label.length - val.length);
    txt(label + ' '.repeat(esp) + val + '\n');
  }

  txt(linha);
  add(CMD.bold);
  const totLabel = 'TOTAL:';
  const totVal   = `R$ ${Number(pedido.total).toFixed(2).replace('.', ',')}`;
  txt(totLabel + ' '.repeat(Math.max(1, 32 - totLabel.length - totVal.length)) + totVal + '\n');
  add(CMD.normal);
  txt(linhaIgual);

  add(CMD.center);
  txt('Obrigado pela preferencia!\n');
  txt('@na_brasas_hamburgueria\n');
  txt('\n\n\n');
  add(CMD.cut);

  const total = partes.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of partes) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

async function arquivarAntigos() {
  const limite = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: antigos, error } = await supabaseClient
    .from('pedidos_recentes')
    .select('*')
    .lt('created_at', limite);

  if (error || !antigos?.length) return;

  const { error: eIns } = await supabaseClient
    .from('pedidos_arquivados')
    .insert(antigos.map(p => ({
      id: p.id,
      cliente_nome: p.cliente_nome,
      cliente_telefone: p.cliente_telefone,
      itens: p.itens,
      total: p.total,
      status: 'impresso',
      created_at: p.created_at,
      archived_at: new Date().toISOString()
    })));
  if (eIns) return;

  await supabaseClient
    .from('pedidos_recentes')
    .delete()
    .in('id', antigos.map(p => p.id));
}