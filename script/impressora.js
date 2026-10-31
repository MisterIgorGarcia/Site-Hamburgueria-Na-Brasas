/* =====================================================================
   SISTEMA DE IMPRESSÃO (WEB BLUETOOTH / WEBUSB) - COM TROCA AUTOMÁTICA
   ===================================================================== */

let impressoraChar = null; // Bluetooth
let impressoraDevice = null; // Bluetooth
let usbDevice = null; // USB
let usbEndpoint = null; // USB
let modoImpressao = null; // 'bluetooth' ou 'usb'

const PRINTER_ID_KEY = 'nabrasas_printer_id';

/* ===================== DESCONECTAR ===================== */
async function desconectarImpressoraAtual() {
  try {
    if (modoImpressao === 'bluetooth' && impressoraDevice) {
      if (impressoraDevice.gatt.connected) impressoraDevice.gatt.disconnect();
      console.log('Bluetooth desconectado manualmente.');
    } 
    else if (modoImpressao === 'usb' && usbDevice) {
      if (usbDevice.opened) await usbDevice.close();
      console.log('USB desconectado manualmente.');
    }
  } catch (err) {
    console.error('Aviso: Erro ao fechar a porta física:', err);
  } finally {
    impressoraChar = null;
    impressoraDevice = null;
    usbDevice = null;
    usbEndpoint = null;
    modoImpressao = null;
    atualizarStatusImpressora();
  }
}

/* ===================== RECONEXÃO AUTOMÁTICA ===================== */
async function tentarReconectarBluetoothSalvo() {
  if (modoImpressao === 'usb' || (impressoraChar && impressoraDevice?.gatt?.connected)) return;

  try {
    console.log('Verificando dispositivos Bluetooth salvos...');
    await garantirConexaoBluetooth(false);
    console.log('Bluetooth reconectado automaticamente com sucesso!');
  } catch (err) {
    console.log('Sem conexão Bluetooth ativa no momento.', err.message);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    tentarReconectarBluetoothSalvo();
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  tentarReconectarBluetoothSalvo();

  if (!navigator.usb) return;
  try {
    const devices = await navigator.usb.getDevices();
    if (devices.length > 0) {
      await configurarConexaoUSB(devices[0]);
    }
  } catch (err) {}
});

if (navigator.usb) {
  navigator.usb.addEventListener('disconnect', (event) => {
    if (usbDevice && event.device === usbDevice) {
      usbDevice = null;
      usbEndpoint = null;
      if (modoImpressao === 'usb') atualizarStatusImpressora();
    }
  });
}

/* ===================== CONEXÃO USB ===================== */
const btnConectarUSB = document.getElementById('btn-conectar-usb');
if (btnConectarUSB) {
  btnConectarUSB.addEventListener('click', async () => {
    if (modoImpressao === 'usb') {
      return desconectarImpressoraAtual();
    }

    if (!navigator.usb) {
      alert("Seu navegador não suporta WebUSB. Use o Chrome ou Edge.");
      return;
    }
    
    try {
      if (modoImpressao === 'bluetooth') {
        await desconectarImpressoraAtual();
      }

      btnConectarUSB.disabled = true;
      document.getElementById('txt-usb').textContent = 'Conectando...';
      
      const device = await navigator.usb.requestDevice({ filters: [] });
      await configurarConexaoUSB(device);
    } catch (err) {
      if (err.name === 'NotFoundError' || err.message.includes('cancel')) {
        console.log('Usuário cancelou a conexão USB.');
      } else {
        alert('Falha ao conectar USB: ' + err.message);
      }
    } finally {
      btnConectarUSB.disabled = false;
      atualizarStatusImpressora(); 
    }
  });
}

async function configurarConexaoUSB(device) {
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);

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
    if (modoImpressao === 'bluetooth') {
      return desconectarImpressoraAtual();
    }

    try {
      if (modoImpressao === 'usb') {
        await desconectarImpressoraAtual();
      }

      btnConectar.disabled = true;
      document.getElementById('txt-bt').textContent = 'Conectando...';
      
      await garantirConexaoBluetooth(true); 
    } catch (err) {
      if (err.name === 'NotFoundError' || err.message.includes('cancel')) {
        console.log('Usuário cancelou a conexão Bluetooth.');
      } else {
        alert('Falha ao conectar Bluetooth: ' + err.message);
      }
    } finally {
      btnConectar.disabled = false;
      atualizarStatusImpressora();
    }
  });
}

async function garantirConexaoBluetooth(forcarNovo = false) {
  if (!forcarNovo && impressoraChar && impressoraDevice?.gatt?.connected) return impressoraChar;

  let device;
  if (!forcarNovo && navigator.bluetooth.getDevices) {
    try {
      const devices = await navigator.bluetooth.getDevices();
      const savedId = localStorage.getItem(PRINTER_ID_KEY);
      device = devices.find(d => d.id === savedId) || devices[0];
    } catch (e) {}
  }

  if (!device) {
    if (forcarNovo) {
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455',
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
        ]
      });
      localStorage.setItem(PRINTER_ID_KEY, device.id);
    } else {
      throw new Error('Nenhum dispositivo Bluetooth salvo ou disponível.');
    }
  }

  if (device.watchAdvertisements) {
    try {
      await device.watchAdvertisements();
      device.addEventListener('advertisementreceived', async () => {
        if (!device.gatt.connected && modoImpressao === 'bluetooth') {
          console.log('Anúncio detectado da impressora! Tentando reconectar...');
          try {
            await garantirConexaoBluetooth(false); 
          } catch (e) {}
        }
      });
    } catch (e) {}
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

  device.addEventListener('gattserverdisconnected', async () => {
    impressoraChar = null;
    if (modoImpressao === 'bluetooth') {
      atualizarStatusImpressora();
      console.log('Bluetooth caiu. Tentando reconectar em 3s...');
      setTimeout(async () => {
        try {
          await garantirConexaoBluetooth(false);
          console.log('Bluetooth reconectado!');
        } catch (err) {}
      }, 3000);
    }
  });

  atualizarStatusImpressora();
  return char;
}

/* ===================== STATUS E VISUAL DOS BOTÕES ===================== */
function atualizarStatusImpressora() {
  const wrap = document.getElementById('status-impressora');
  const txt = document.getElementById('status-texto');
  const btnBT = document.getElementById('btn-conectar');
  const btnUSB = document.getElementById('btn-conectar-usb');
  const txtBT = document.getElementById('txt-bt');
  const txtUSB = document.getElementById('txt-usb');

  if (!wrap || !txt) return;

  let conectado = false;
  let nome = '';

  btnBT.classList.remove('btn-admin-perigo');
  btnUSB.classList.remove('btn-admin-perigo');
  txtBT.innerHTML = '<i class="fa-brands fa-bluetooth-b"></i> Bluetooth';
  txtUSB.innerHTML = '<i class="fa-solid fa-plug"></i> USB';

  if (modoImpressao === 'bluetooth' && impressoraChar && impressoraDevice?.gatt?.connected) {
    conectado = true;
    nome = impressoraDevice.name || 'POS-58 (Bluetooth)';
    btnBT.classList.add('btn-admin-perigo'); 
    txtBT.innerHTML = '<i class="fa-solid fa-xmark"></i> Desconectar Bluetooth';
  } 
  else if (modoImpressao === 'usb' && usbDevice && usbDevice.opened) {
    conectado = true;
    nome = usbDevice.productName || 'POS-58 (USB)';
    btnUSB.classList.add('btn-admin-perigo'); 
    txtUSB.innerHTML = '<i class="fa-solid fa-xmark"></i> Desconectar USB';
  }

  if (conectado) {
    wrap.classList.add('conectada');
    txt.textContent = `Impressora conectada — ${nome}`;
  } else {
    wrap.classList.remove('conectada');
    txt.textContent = 'Impressora desconectada';
  }
}

/* ===================== ENVIO DE BYTES ===================== */
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
    if (!modoImpressao) {
      throw new Error('Conecte uma impressora (Bluetooth ou USB) primeiro.');
    }

    const bytes = gerarRecibo(pedido);
    await enviarBytesParaImpressora(bytes);

    const sessaoSalva = localStorage.getItem('nabrasas_sessao');
    let quemImprimiu = 'Admin';
    if (sessaoSalva) {
        const sessao = JSON.parse(sessaoSalva);
        quemImprimiu = sessao.nome;
    }

    const { error: errInsert } = await supabaseClient
      .from('pedidos_arquivados')
      .insert({
        id: pedido.id,
        cliente_nome: pedido.cliente_nome,
        cliente_telefone: pedido.cliente_telefone,
        cliente_endereco: pedido.cliente_endereco,
        itens: pedido.itens,
        total: pedido.total,
        status: 'impresso',
        pagamento: pedido.pagamento,
        impresso_por: quemImprimiu,
        created_at: pedido.created_at
      });
    if (errInsert) throw new Error('Falha ao arquivar: ' + errInsert.message);

    const { error: errDelete } = await supabaseClient
      .from('pedidos_recentes')
      .delete()
      .eq('id', pedido.id);
      
    if (errDelete) {
      console.warn('Pedido ficou duplicado (arquivado + recente):', pedido.id);
    }

    removerPedidoDaTela(pedido.id);
    
  } catch (err) {
    alert('Erro na impressão: ' + err.message);
    botao.disabled = false;
    botao.textContent = '🖨️ Imprimir e arquivar';
  }
}

/* ===================== GERADOR DE RECIBO (ESC/POS) ===================== */
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
  
  // ==========================================
  // IMPRIMIR TIPO DE PEDIDO NO RECIBO
  // ==========================================
  const isEntrega = pedido.cliente_endereco && pedido.cliente_endereco.trim() !== '';
  const isMesa = pedido.cliente_telefone === 'Pedido da Mesa' || pedido.cliente_telefone === 'Pedido Interno';
  const isRetirada = !isEntrega && !isMesa; // Se não é entrega e não é mesa, é retirada

  if (isEntrega) {
      add(CMD.bold);
      txt('\n>>> PEDIDO DE ENTREGA <<<\n');
      add(CMD.normal);
  } else if (isMesa) {
      add(CMD.bold);
      txt('\n>>> PEDIDO NA MESA <<<\n');
      add(CMD.normal);
  } else if (isRetirada) {
      add(CMD.bold);
      txt('\n>>> RETIRAR NA HAMBURGUERIA <<<\n');
      add(CMD.normal);
  }
  // ==========================================

  txt(linhaIgual);
  add(CMD.left);

  const data = new Date(pedido.created_at);
  txt(`Pedido: #${pedido.id.slice(0, 8)}\n`);
  txt(`Data:   ${data.toLocaleString('pt-BR')}\n`);
  txt(linha);

  add(CMD.bold);
  txt(`Cliente: ${pedido.cliente_nome}\n`);
  add(CMD.normal);
  
  if (pedido.cliente_telefone && !isMesa) {
      txt(`Tel: ${pedido.cliente_telefone}\n`);
  }
  txt(linha);

  // ==========================================
  // IMPRIMIR ENDEREÇO SE FOR ENTREGA
  // ==========================================
  if (isEntrega && pedido.cliente_endereco) {
      add(CMD.bold);
      txt(`ENDEREÇO DE ENTREGA:\n`);
      add(CMD.normal);
      
      const endereco = pedido.cliente_endereco;
      for (let i = 0; i < endereco.length; i += 32) {
          txt(endereco.substring(i, i + 32) + '\n');
      }
      txt(linha);
  }
  // ==========================================

  // ==========================================
  // NOVO: IMPRIMIR PAGAMENTO
  // ==========================================
  if (pedido.pagamento) {
      add(CMD.bold);
      txt(`PAGAMENTO:\n`);
      add(CMD.normal);
      const pgto = pedido.pagamento;
      for (let i = 0; i < pgto.length; i += 32) {
          txt(pgto.substring(i, i + 32) + '\n');
      }
      txt(linha);
  }
  // ==========================================

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