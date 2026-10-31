/* =====================================================================
   SISTEMA DE IMPRESSÃO (WEB BLUETOOTH / WEBUSB) - COM TROCA AUTOMÁTICA
   + DETECÇÃO DE CONEXÃO OCUPADA COM LOG E RETRY AUTOMÁTICO
   ===================================================================== */

let impressoraChar = null; // Bluetooth
let impressoraDevice = null; // Bluetooth
let usbDevice = null; // USB
let usbEndpoint = null; // USB
let modoImpressao = null; // 'bluetooth' ou 'usb'

const PRINTER_ID_KEY = 'nabrasas_printer_id';

/* =====================================================================
   DETECÇÃO DE CONEXÃO OCUPADA / TRAVADA
   ===================================================================== */

/**
 * Verifica se o erro recebido corresponde a "GATT ocupado" ou
 * "conexão já em andamento" — problema clássico quando outro app,
 * outra aba ou uma sessão anterior ficou "segurando" a impressora.
 */
function ehErroConexaoOcupada(err) {
  if (!err) return false;
  const nome = String(err.name || '').toLowerCase();
  const msg = String(err.message || '').toLowerCase();
  const tudo = nome + ' ' + msg;

  const padroes = [
    'gatt operation already in progress',
    'gatt operation already in progress.',
    'connection attempt failed',
    'connection is busy',
    'already in progress',
    'gatt server is disconnected',
    'gatt operation timed out',
    'operation in progress',
    'networkerror',
    'network error',
    'busy',
    'occupied'
  ];

  return padroes.some(p => tudo.includes(p));
}

/**
 * Registra o erro de conexão ocupada no console (capturado pelo
 * terminal visual do painel admin via admin-dashboard.js).
 */
function registrarLogConexaoOcupada(err, contexto = 'desconhecido') {
  const hora = new Date().toLocaleTimeString('pt-BR');
  console.error(`[impressora-ocupada] ${hora} | Contexto: ${contexto}`);
  console.error(`[impressora-ocupada] Nome do erro: ${err.name || '(sem nome)'}`);
  console.error(`[impressora-ocupada] Mensagem: ${err.message || '(sem mensagem)'}`);
  console.warn('[impressora-ocupada] Dica: verifique se outro app/aba está usando a impressora, ou se ela ficou "presa" de uma sessão anterior.');
}

/* ===================== DESCONECTAR ===================== */
async function desconectarImpressoraAtual() {
  try {
    if (modoImpressao === 'bluetooth' && impressoraDevice) {
      if (impressoraDevice.gatt.connected) impressoraDevice.gatt.disconnect();
      console.log('[impressora] Bluetooth desconectado manualmente.');
    } 
    else if (modoImpressao === 'usb' && usbDevice) {
      if (usbDevice.opened) await usbDevice.close();
      console.log('[impressora] USB desconectado manualmente.');
    }
  } catch (err) {
    console.error('[impressora] Aviso: Erro ao fechar a porta física:', err);
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
    console.log('[impressora] Verificando dispositivos Bluetooth salvos...');
    await garantirConexaoBluetooth(false);
    console.log('[impressora] Bluetooth reconectado automaticamente com sucesso!');
  } catch (err) {
    if (ehErroConexaoOcupada(err)) {
      registrarLogConexaoOcupada(err, 'tentarReconectarBluetoothSalvo()');
    } else {
      console.log('[impressora] Sem conexão Bluetooth ativa no momento.', err.message);
    }
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
        console.log('[impressora] Usuário cancelou a conexão USB.');
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

/* =====================================================================
   CONEXÃO BLUETOOTH — COM VERIFICAÇÕES, TIMEOUT E RETRY DE OCUPAÇÃO
   ===================================================================== */
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

      /* --- 1. Verifica suporte do navegador --- */
      if (!navigator.bluetooth) {
        alert(
          'Este navegador NÃO suporta Web Bluetooth.\n\n' +
          'Use o Google Chrome ou Microsoft Edge no Android.\n' +
          'No iPhone/iPad o Web Bluetooth não funciona.'
        );
        return;
      }

      btnConectar.disabled = true;
      document.getElementById('txt-bt').textContent = 'Conectando...';

      /* --- 2. Verifica se o Bluetooth está ligado --- */
      if (navigator.bluetooth.getAvailability) {
        try {
          const disponivel = await navigator.bluetooth.getAvailability();
          if (!disponivel) {
            throw new Error('BLUETOOTH_OFF');
          }
        } catch (e) {
          if (e.message === 'BLUETOOTH_OFF') throw e;
          console.warn('[impressora] getAvailability falhou (ignorado):', e);
        }
      }

      /* --- 3. Verifica permissão de Localização (obrigatória Android 12+ para BLE scan) --- */
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const geoPerm = await navigator.permissions.query({ name: 'geolocation' });
          console.log('[impressora] Permissão de localização:', geoPerm.state);
          if (geoPerm.state === 'denied') {
            throw new Error('LOCATION_DENIED');
          }
        } catch (e) {
          if (e.message === 'LOCATION_DENIED') throw e;
        }
      }

      /* --- 4. Executa conexão com timeout de segurança --- */
      console.log('[impressora] Iniciando conexão Bluetooth...');
      await garantirConexaoBluetoothComTimeout(true);
      console.log('[impressora] Conexão Bluetooth concluída com sucesso.');

    } catch (err) {
      /* --- Tratamento contextual dos erros --- */
      if (err.name === 'NotFoundError' || (err.message && err.message.includes('cancel'))) {
        console.log('[impressora] Usuário cancelou a conexão Bluetooth.');
      }
      else if (err.message === 'CONEXAO_OCUPADA' || ehErroConexaoOcupada(err)) {
        registrarLogConexaoOcupada(err, 'btnConectar.click');
        alert(
          '⚠ A impressora está OCUPADA ou com conexão travada.\n\n' +
          'Isso geralmente acontece quando:\n' +
          '• Outro app (Samsung BT, ESC/POS, PrintHand, etc.) está usando a impressora\n' +
          '• Outra aba do painel já está conectada a ela\n' +
          '• A impressora ficou "presa" de uma sessão anterior\n' +
          '• O pareamento foi feito pelo Bluetooth nativo do celular\n\n' +
          'Como resolver:\n' +
          '1. Feche outros apps que usem Bluetooth\n' +
          '2. Feche outras abas do painel\n' +
          '3. Desligue e religue a impressora\n' +
          '4. Se a impressora estiver pareada nas Configurações do Android, "despareie" e tente novamente'
        );
      }
      else if (err.message === 'BLUETOOTH_OFF') {
        alert(
          'O Bluetooth do celular parece estar DESLIGADO.\n\n' +
          '1. Ative o Bluetooth nas configurações\n' +
          '2. Ative também a Localização (GPS)\n' +
          '3. Volte aqui e tente novamente'
        );
      }
      else if (err.message === 'LOCATION_DENIED') {
        alert(
          'A permissão de LOCALIZAÇÃO está BLOQUEADA para este site.\n\n' +
          'O Android exige essa permissão para encontrar a impressora Bluetooth.\n\n' +
          'Como liberar:\n' +
          '1. Toque no cadeado 🔒 ao lado do endereço do site\n' +
          '2. Toque em "Permissões"\n' +
          '3. Permita "Localização" e "Dispositivos próximos"\n' +
          '4. Recarregue a página e tente novamente'
        );
      }
      else if (err.message && err.message.includes('tempo limite')) {
        alert(
          'A conexão demorou mais que o esperado e foi cancelada.\n\n' +
          'Verifique:\n' +
          '• A impressora está ligada e perto do celular?\n' +
          '• O Bluetooth e a Localização (GPS) estão ativos?\n' +
          '• A permissão de Localização foi liberada para o site?\n\n' +
          'Se estiver usando Samsung, tente o navegador Google Chrome.\n' +
          'Se o problema persistir, use o cabo USB com adaptador OTG.'
        );
      }
      else {
        alert('Falha ao conectar Bluetooth: ' + err.message);
      }
    } finally {
      btnConectar.disabled = false;
      atualizarStatusImpressora();
    }
  });
}

/* ---------------------------------------------------------------------
   Wrapper com timeout para não travar a interface eternamente.
   --------------------------------------------------------------------- */
async function garantirConexaoBluetoothComTimeout(forcarNovo = false) {
  let timer = null;

  const promessaConexao = garantirConexaoBluetooth(forcarNovo).finally(() => {
    if (timer) clearTimeout(timer);
  });

  const promessaTimeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Tempo limite de conexão Bluetooth excedido.'));
    }, 30000);
  });

  return Promise.race([promessaConexao, promessaTimeout]);
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
      console.log('[impressora] Abrindo seletor de pareamento...');
      try {
        device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [
            '000018f0-0000-1000-8000-00805f9b34fb',
            '49535343-fe7d-4ae5-8fa9-9fafd205e455',
            'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
          ]
        });
      } catch (err) {
        if (ehErroConexaoOcupada(err)) {
          registrarLogConexaoOcupada(err, 'requestDevice()');
          throw new Error('CONEXAO_OCUPADA');
        }
        throw err;
      }
      localStorage.setItem(PRINTER_ID_KEY, device.id);
      console.log('[impressora] Dispositivo escolhido:', device.name || device.id);
    } else {
      throw new Error('Nenhum dispositivo Bluetooth salvo ou disponível.');
    }
  }

  /* watchAdvertisements — opcional, com timeout curto para não travar Samsung */
  if (device.watchAdvertisements) {
    try {
      await Promise.race([
        device.watchAdvertisements(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('watchAdvertisements timeout')), 3000)
        )
      ]);
      device.addEventListener('advertisementreceived', async () => {
        if (!device.gatt.connected && modoImpressao === 'bluetooth') {
          console.log('[impressora] Anúncio detectado da impressora! Tentando reconectar...');
          try {
            await garantirConexaoBluetooth(false); 
          } catch (e) {}
        }
      });
    } catch (e) {
      console.warn('[impressora] watchAdvertisements indisponível/expirou (ignorado).');
    }
  }

  /* --- Conexão GATT com retry específico para ocupação --- */
  let server;
  try {
    server = await device.gatt.connect();
  } catch (err) {
    if (ehErroConexaoOcupada(err)) {
      registrarLogConexaoOcupada(err, 'device.gatt.connect() [1ª tentativa]');
      console.warn('[impressora] Conexão ocupada — forçando disconnect() e tentando novamente em 1.5s...');

      try {
        if (device.gatt.connected) device.gatt.disconnect();
      } catch (discErr) {
        console.warn('[impressora] Falha ao forçar disconnect (ignorado):', discErr);
      }

      await new Promise(r => setTimeout(r, 1500));

      try {
        server = await device.gatt.connect();
        console.log('[impressora] Retry bem-sucedido após liberar conexão ocupada.');
      } catch (retryErr) {
        if (ehErroConexaoOcupada(retryErr)) {
          registrarLogConexaoOcupada(retryErr, 'device.gatt.connect() [retry]');
        }
        throw new Error('CONEXAO_OCUPADA');
      }
    } else {
      throw err;
    }
  }

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
    } catch (e) {
      if (ehErroConexaoOcupada(e)) {
        registrarLogConexaoOcupada(e, `getPrimaryService(${uuid})`);
      }
    }
  }

  if (!char) throw new Error('Característica de escrita não encontrada. Verifique se a impressora está no modo BLE correto.');

  impressoraChar = char;
  impressoraDevice = device;
  modoImpressao = 'bluetooth';

  device.addEventListener('gattserverdisconnected', async () => {
    impressoraChar = null;
    if (modoImpressao === 'bluetooth') {
      atualizarStatusImpressora();
      console.log('[impressora] Bluetooth caiu. Tentando reconectar em 3s...');
      setTimeout(async () => {
        try {
          await garantirConexaoBluetooth(false);
          console.log('[impressora] Bluetooth reconectado!');
        } catch (err) {
          if (ehErroConexaoOcupada(err)) {
            registrarLogConexaoOcupada(err, 'reconexão automática pós-queda');
          }
        }
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

  if (!wrap || !txt || !btnBT || !btnUSB) return;

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

/* ===================== ENVIO DE BYTES (COM LOG DE OCUPAÇÃO) ===================== */
async function enviarBytesParaImpressora(bytes) {
  if (modoImpressao === 'bluetooth') {
    const CHUNK = 100;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const pedaco = bytes.slice(i, i + CHUNK);
      try {
        await impressoraChar.writeValue(pedaco);
      } catch (err) {
        if (ehErroConexaoOcupada(err)) {
          registrarLogConexaoOcupada(err, `writeValue chunk ${i}/${bytes.length}`);
          throw new Error('CONEXAO_OCUPADA');
        }
        throw err;
      }
      await new Promise(r => setTimeout(r, 25));
    }
  } else if (modoImpressao === 'usb') {
    await usbDevice.transferOut(usbEndpoint.endpointNumber, bytes);
  } else {
    throw new Error('Nenhuma impressora conectada.');
  }
}

/* ===================== IMPRESSÃO + ARQUIVAMENTO ===================== */
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
        created_at: pedido.created_at,
        // NOVOS CAMPOS — TAXA DE ENTREGA
        bairro: pedido.bairro || null,
        taxa_entrega: Number(pedido.taxa_entrega) || 0
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
    if (err.message === 'CONEXAO_OCUPADA' || ehErroConexaoOcupada(err)) {
      alert(
        '⚠ A impressora ficou ocupada durante a impressão.\n\n' +
        'O pedido NÃO foi arquivado. Verifique se a impressora imprimiu algo parcial.\n\n' +
        'Tente:\n' +
        '1. Desligar e religar a impressora\n' +
        '2. Desconectar e reconectar no painel\n' +
        '3. Imprimir novamente'
      );
    } else {
      alert('Erro na impressão: ' + err.message);
    }
    if (botao) {
      botao.disabled = false;
      botao.textContent = '🖨️ Imprimir e arquivar';
    }
  }
}

/* ===================== REIMPRESSÃO (SEGUNDA VIA) ===================== */
async function reimprimirRecibo(pedido, botao) {
  try {
    if (!modoImpressao) {
      throw new Error('Conecte uma impressora (Bluetooth ou USB) primeiro.');
    }

    const bytes = gerarRecibo(pedido);
    await enviarBytesParaImpressora(bytes);

    alert('Segunda via impressa com sucesso!');
  } catch (err) {
    if (err.message === 'CONEXAO_OCUPADA' || ehErroConexaoOcupada(err)) {
      alert(
        '⚠ A impressora ficou ocupada durante a reimpressão.\n\n' +
        'Desconecte e reconecte a impressora no painel e tente novamente.'
      );
    } else {
      alert('Erro na reimpressão: ' + err.message);
    }
  } finally {
    if (botao) botao.disabled = false;
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
  
  // TIPO DE PEDIDO
  const isEntrega = pedido.cliente_endereco && pedido.cliente_endereco.trim() !== '';
  const isMesa = pedido.cliente_telefone === 'Pedido da Mesa' || pedido.cliente_telefone === 'Pedido Interno';
  const isRetirada = !isEntrega && !isMesa;

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

  // ENDEREÇO SE FOR ENTREGA (já inclui bairro)
  if (isEntrega && pedido.cliente_endereco) {
      add(CMD.bold);
      txt(`ENDERECO DE ENTREGA:\n`);
      add(CMD.normal);
      
      const endereco = pedido.cliente_endereco;
      for (let i = 0; i < endereco.length; i += 32) {
          txt(endereco.substring(i, i + 32) + '\n');
      }
      txt(linha);
  }

  // PAGAMENTO
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

  // ======================================================
  // TAXA DE ENTREGA (somente se > 0)
  // ======================================================
  const taxa = Number(pedido.taxa_entrega) || 0;
  if (taxa > 0) {
      const taxaLabel = 'Taxa de Entrega:';
      const taxaVal   = `R$ ${taxa.toFixed(2).replace('.', ',')}`;
      const espTaxa   = Math.max(1, 32 - taxaLabel.length - taxaVal.length);
      txt(taxaLabel + ' '.repeat(espTaxa) + taxaVal + '\n');
      txt(linha);
  }
  // ======================================================

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