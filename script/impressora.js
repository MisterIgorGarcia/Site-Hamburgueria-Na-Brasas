/* =====================================================================
   SISTEMA DE IMPRESSÃO (WEB BLUETOOTH / WEBUSB)
   ===================================================================== */

let impressoraChar = null; // Bluetooth
let impressoraDevice = null; // Bluetooth
let usbDevice = null; // USB
let usbEndpoint = null; // USB
let modoImpressao = null; // 'bluetooth' ou 'usb'

/* ===================== CONEXÃO BLUETOOTH ===================== */
const btnConectar = document.getElementById('btn-conectar');
if (btnConectar) {
  btnConectar.addEventListener('click', async () => {
    try {
      btnConectar.disabled = true;
      btnConectar.textContent = 'Conectando...';
      await garantirConexaoBluetooth();
      modoImpressao = 'bluetooth';
    } catch (err) {
      alert('Falha ao conectar Bluetooth: ' + err.message);
    } finally {
      btnConectar.disabled = false;
      btnConectar.textContent = '🔌 Bluetooth';
    }
  });
}

async function garantirConexaoBluetooth() {
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
    if (modoImpressao === 'bluetooth') atualizarStatusImpressora();
  });

  atualizarStatusImpressora();
  return char;
}

/* ===================== CONEXÃO USB ===================== */
const btnConectarUSB = document.getElementById('btn-conectar-usb');
if (btnConectarUSB) {
  btnConectarUSB.addEventListener('click', async () => {
    if (!navigator.usb) {
      alert("Seu navegador não suporta WebUSB. Use o Chrome ou Edge.");
      return;
    }
    try {
      btnConectarUSB.disabled = true;
      btnConectarUSB.textContent = 'Conectando...';
      await garantirConexaoUSB();
      modoImpressao = 'usb';
    } catch (err) {
      alert('Falha ao conectar USB: ' + err.message);
    } finally {
      btnConectarUSB.disabled = false;
      btnConectarUSB.textContent = '🔗 USB';
    }
  });
}

async function garantirConexaoUSB() {
  if (usbDevice && usbDevice.opened) return usbEndpoint;

  // Abre o seletor de dispositivos USB do navegador
  const device = await navigator.usb.requestDevice({ filters: [] }); // filtro vazio mostra todos
  await device.open();

  if (device.configuration === null) {
    await device.selectConfiguration(1);
  }

  // Procura a interface que tem um endpoint de saída (OUT)
  let interfaceEncontrada = null;
  for (const iface of device.configuration.interfaces) {
    for (const alt of iface.alternates) {
      // Classe 7 = Impressora
      if (alt.interfaceClass === 0x07 || alt.endpoints.some(e => e.direction === 'out')) {
        interfaceEncontrada = iface;
        break;
      }
    }
    if (interfaceEncontrada) break;
  }

  if (!interfaceEncontrada) {
    throw new Error('Nenhuma interface de impressora encontrada no dispositivo USB.');
  }

  await device.claimInterface(interfaceEncontrada.interfaceNumber);

  // Encontra o endpoint de saída
  let endpoint = null;
  for (const alt of interfaceEncontrada.alternates) {
    for (const ep of alt.endpoints) {
      if (ep.direction === 'out') {
        endpoint = ep;
        break;
      }
    }
    if (endpoint) break;
  }

  if (!endpoint) {
    throw new Error('Endpoint de saída não encontrado.');
  }

  usbDevice = device;
  usbEndpoint = endpoint;
  atualizarStatusImpressora();
  return endpoint;
}

/* ===================== STATUS UNIFICADO ===================== */
function atualizarStatusImpressora() {
  const wrap = document.getElementById('status-impressora');
  const txt = document.getElementById('status-texto');
  if (!wrap || !txt) return;

  let conectado = false;
  let nome = '';

  if (modoImpressao === 'bluetooth' && impressoraChar && impressoraDevice?.gatt?.connected) {
    conectado = true;
    nome = impressoraDevice.name || 'POS-58 (Bluetooth)';
  } else if (modoImpressao === 'usb' && usbDevice && usbDevice.opened) {
    conectado = true;
    nome = usbDevice.productName || 'POS-58 (USB)';
  }

  if (conectado) {
    wrap.classList.add('conectada');
    txt.textContent = `Impressora conectada — ${nome}`;
  } else {
    wrap.classList.remove('conectada');
    txt.textContent = 'Impressora desconectada';
  }
}

/* ===================== ENVIO DE BYTES UNIFICADO ===================== */
async function enviarBytesParaImpressora(bytes) {
  if (modoImpressao === 'bluetooth') {
    // Envio via Bluetooth (chunks de 100 bytes)
    const CHUNK = 100;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const pedaco = bytes.slice(i, i + CHUNK);
      await impressoraChar.writeValue(pedaco);
      await new Promise(r => setTimeout(r, 25));
    }
  } else if (modoImpressao === 'usb') {
    // Envio via USB (WebUSB transferOut)
    await usbDevice.transferOut(usbEndpoint.endpointNumber, bytes);
  } else {
    throw new Error('Nenhuma impressora conectada. Conecte via Bluetooth ou USB.');
  }
}

/* ===================== IMPRESSÃO E ARQUIVAMENTO ===================== */
async function imprimirEArquivar(pedido, botao) {
  try {
    if (!modoImpressao) {
      throw new Error('Conecte uma impressora (Bluetooth ou USB) primeiro.');
    }

    // 1. Gera o recibo e envia
    const bytes = gerarRecibo(pedido);
    await enviarBytesParaImpressora(bytes);

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

    // 4. Remove da tela
    removerPedidoDaTela(pedido.id);
    
  } catch (err) {
    alert('Erro na impressão: ' + err.message);
    botao.disabled = false;
    botao.textContent = '🖨️ Imprimir e arquivar';
  }
}

/* ===================== GERADOR DE RECIBO (ESC/POS) ===================== */
// (Mantenha a função gerarRecibo que você já tem)
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