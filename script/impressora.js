/* =====================================================================
   SISTEMA DE IMPRESSÃO (WEB BLUETOOTH / WEBUSB) - COM RECONEXÃO AUTOMÁTICA
   ===================================================================== */

let impressoraChar = null; // Bluetooth
let impressoraDevice = null; // Bluetooth
let usbDevice = null; // USB
let usbEndpoint = null; // USB
let modoImpressao = null; // 'bluetooth' ou 'usb'

/* ===================== INICIALIZAÇÃO E RECONEXÃO USB ===================== */
// Tenta reconectar ao USB automaticamente quando a página carrega
document.addEventListener('DOMContentLoaded', async () => {
  if (!navigator.usb) return;
  
  try {
    const devices = await navigator.usb.getDevices();
    if (devices.length > 0) {
      // Tenta configurar o primeiro dispositivo USB autorizado
      await configurarConexaoUSB(devices[0]);
      console.log('USB reconectado automaticamente!');
    }
  } catch (err) {
    console.log('Nenhum USB autorizado previamente.', err);
  }
});

// Monitora se o cabo USB foi desconectado ou reconectado fisicamente
if (navigator.usb) {
  navigator.usb.addEventListener('disconnect', (event) => {
    if (usbDevice && event.device === usbDevice) {
      usbDevice = null;
      usbEndpoint = null;
      if (modoImpressao === 'usb') atualizarStatusImpressora();
    }
  });

  navigator.usb.addEventListener('connect', async (event) => {
    // Se o cabo for plugado novamente, tenta reconectar sozinho
    if (!usbDevice && modoImpressao === 'usb') {
      try {
        await configurarConexaoUSB(event.device);
      } catch (e) {}
    }
  });
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
      const device = await navigator.usb.requestDevice({ filters: [] });
      await configurarConexaoUSB(device);
    } catch (err) {
      alert('Falha ao conectar USB: ' + err.message);
    } finally {
      btnConectarUSB.disabled = false;
      btnConectarUSB.textContent = '🔗 USB';
    }
  });
}

async function configurarConexaoUSB(device) {
  if (usbDevice && usbDevice.opened) return usbEndpoint;

  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);

  // Procura a interface de impressora
  let interfaceEncontrada = null;
  for (const iface of device.configuration.interfaces) {
    for (const alt of iface.alternates) {
      if (alt.interfaceClass === 0x07 || alt.endpoints.some(e => e.direction === 'out')) {
        interfaceEncontrada = iface;
        break;
      }
    }
    if (interfaceEncontrada) break;
  }
  if (!interfaceEncontrada) throw new Error('Interface não encontrada.');

  await device.claimInterface(interfaceEncontrada.interfaceNumber);

  // Procura o endpoint de saída
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
  if (!endpoint) throw new Error('Endpoint de saída não encontrado.');

  usbDevice = device;
  usbEndpoint = endpoint;
  modoImpressao = 'usb';
  atualizarStatusImpressora();
}

/* ===================== CONEXÃO BLUETOOTH ===================== */
const btnConectar = document.getElementById('btn-conectar');
if (btnConectar) {
  btnConectar.addEventListener('click', async () => {
    try {
      btnConectar.disabled = true;
      btnConectar.textContent = 'Conectando...';
      await garantirConexaoBluetooth(true); // true = forçar novo seletor
    } catch (err) {
      alert('Falha ao conectar Bluetooth: ' + err.message);
    } finally {
      btnConectar.disabled = false;
      btnConectar.textContent = '🔌 Bluetooth';
    }
  });
}

async function garantirConexaoBluetooth(forcarNovo = false) {
  // Se já está conectado, não faz nada
  if (!forcarNovo && impressoraChar && impressoraDevice?.gatt?.connected) return impressoraChar;

  let device;
  
  // Tenta pegar um dispositivo salvo em cache (Reconexão rápida no celular)
  if (!forcarNovo && navigator.bluetooth.getDevices) {
    try {
      const devices = await navigator.bluetooth.getDevices();
      if (devices.length > 0) device = devices[0]; // Pega o primeiro autorizado
    } catch (e) {}
  }

  // Se não achou no cache ou forçou novo, abre a janelinha do Chrome
  if (!device) {
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        '000018f0-0000-1000-8000-00805f9b34fb',
        '49535343-fe7d-4ae5-8fa9-9fafd205e455',
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
      ]
    });
  }

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

  if (!char) throw new Error('Característica não encontrada');

  impressoraChar = char;
  impressoraDevice = device;
  modoImpressao = 'bluetooth';

  // Se cair a conexão no celular, tenta reconectar sozinho
  device.addEventListener('gattserverdisconnected', async () => {
    impressoraChar = null;
    if (modoImpressao === 'bluetooth') {
      atualizarStatusImpressora();
      console.log('Bluetooth caiu. Tentando reconectar em 3 segundos...');
      
      setTimeout(async () => {
        try {
          await garantirConexaoBluetooth(false);
          console.log('Bluetooth reconectado com sucesso!');
        } catch (err) {
          console.log('Falha na reconexão automática.');
        }
      }, 3000);
    }
  });

  atualizarStatusImpressora();
  return char;
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
    const CHUNK = 100;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const pedaco = bytes.slice(i, i + CHUNK);
      await impressoraChar.writeValue(pedaco);
      await new Promise(r => setTimeout(r, 25));
    }
  } else if (modoImpressao === 'usb') {
    await usbDevice.transferOut(usbEndpoint.endpointNumber, bytes);
  } else {
    throw new Error('Nenhuma impressora conectada.');
  }
}

/* ===================== IMPRESSÃO E ARQUIVAMENTO ===================== */
async function imprimirEArquivar(pedido, botao) {
  try {
    if (!modoImpressao) throw new Error('Conecte uma impressora primeiro.');

    const bytes = gerarRecibo(pedido);
    await enviarBytesParaImpressora(bytes);

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
      
    if (errDelete) console.warn('Pedido duplicado:', pedido.id);

    removerPedidoDaTela(pedido.id);
    
  } catch (err) {
    alert('Erro na impressão: ' + err.message);
    botao.disabled = false;
    botao.textContent = '🖨️ Imprimir e arquivar';
  }
}

/* ===================== GERADOR DE RECIBO (ESC/POS) ===================== */
// (Mantenha sua função gerarRecibo e normalizar exatamente como estão)
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