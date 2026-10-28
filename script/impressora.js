/* =====================================================================
   SISTEMA DE IMPRESSÃO (WEB BLUETOOTH / ESC-POS)
   ===================================================================== */

let impressoraChar = null;
let impressoraDevice = null;

const btnConectar = document.getElementById('btn-conectar');
if (btnConectar) {
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
}

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
  if (!wrap || !txt) return;

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
    // 1. Imprime
    const char = await garantirConexao();
    const bytes = gerarRecibo(pedido);
    await enviarBytes(char, bytes);

    // 2. Arquiva no banco
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

    // 3. Remove da fila de recentes
    const { error: errDelete } = await supabaseClient
      .from('pedidos_recentes')
      .delete()
      .eq('id', pedido.id);
      
    if (errDelete) {
      console.warn('Pedido ficou duplicado (arquivado + recente):', pedido.id);
    }

    // 4. Remove da tela (função do admin-dashboard.js)
    removerPedidoDaTela(pedido.id);
    
  } catch (err) {
    alert('Erro na impressão: ' + err.message);
    botao.disabled = false;
    botao.textContent = '🖨️ Imprimir e arquivar';
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