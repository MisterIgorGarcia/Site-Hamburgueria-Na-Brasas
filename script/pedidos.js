/* ===================== CONEXÃO COM SUPABASE ===================== */
const SUPABASE_URL = 'https://xzaqqzlfwkjtksjlcbgx.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_hoYHM3UKlvTDMCaadvI1kQ_gcn9-pqq'; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let carrinho = [];
let listaAdicionaisGlobal = [];
let itemAtualSelecionado = null;
let pedidoPendente = null;
let metodoPagamento = "";
let tipoEntrega = null; // null, 'delivery' ou 'pickup'

// === TAXA DE ENTREGA POR BAIRRO ===
let taxasEntregaCache = [];
let taxaEntregaAtual = 0;
let taxaEntregaEncontrada = false;
let bairroAtual = '';

/* ===================== MODAL DE AVISO GENÉRICO ===================== */
function mostrarAviso(titulo, texto, tipo = 'erro') {
    const tituloEl = document.getElementById('aviso-titulo');
    const textoEl  = document.getElementById('aviso-texto');
    const modal    = document.getElementById('modal-aviso');
    if (!tituloEl || !textoEl || !modal) return;

    tituloEl.textContent = titulo;
    textoEl.innerHTML = texto;

    const icone = modal.querySelector('.modal-conteudo > i');
    if (icone) {
        const config = {
            erro:    { classe: 'fa-circle-xmark',         cor: '#ef4444' },
            atencao: { classe: 'fa-triangle-exclamation', cor: '#f59e0b' },
            sucesso: { classe: 'fa-circle-check',         cor: '#22c55e' },
            info:    { classe: 'fa-circle-info',          cor: '#3b82f6' }
        }[tipo] || { classe: 'fa-triangle-exclamation', cor: '#ef4444' };

        icone.className = `fa-solid ${config.classe}`;
        icone.style.color = config.cor;
    }

    modal.classList.add('ativo');
}

function fecharModalAviso() {
    const modal = document.getElementById('modal-aviso');
    if (modal) modal.classList.remove('ativo');
}

/* ===================== TAXA DE ENTREGA ===================== */
async function carregarTaxasEntrega() {
    try {
        taxasEntregaCache = await TaxaEntrega.buscarTaxas(supabaseClient);
        console.log('[taxa-entrega] taxas carregadas:', taxasEntregaCache.length);
    } catch (e) {
        console.error('[taxa-entrega] falha ao carregar taxas', e);
        taxasEntregaCache = [];
    }
}

// Função para escolher Entrega ou Retirada
function selecionarTipoEntrega(tipo) {
    tipoEntrega = tipo;
    
    // Atualiza visual dos botões
    const btnDelivery = document.getElementById('btn-opt-delivery');
    const btnPickup = document.getElementById('btn-opt-pickup');
    
    if (tipo === 'delivery') {
        btnDelivery.style.borderColor = 'var(--cor-secundaria)';
        btnDelivery.style.background = 'rgba(223,141,34,0.1)';
        btnDelivery.querySelector('i').style.color = 'var(--cor-secundaria)';
        
        btnPickup.style.borderColor = '#333';
        btnPickup.style.background = '#111';
        btnPickup.querySelector('i').style.color = '#888';

        document.getElementById('campos-delivery').style.display = 'flex';
        document.getElementById('area-formulario').style.display = 'block';
        recalcularTaxaEntrega();
    } 
    else if (tipo === 'pickup') {
        btnPickup.style.borderColor = 'var(--cor-secundaria)';
        btnPickup.style.background = 'rgba(223,141,34,0.1)';
        btnPickup.querySelector('i').style.color = 'var(--cor-secundaria)';
        
        btnDelivery.style.borderColor = '#333';
        btnDelivery.style.background = '#111';
        btnDelivery.querySelector('i').style.color = '#888';

        document.getElementById('campos-delivery').style.display = 'none';
        document.getElementById('area-formulario').style.display = 'block';
        
        // Zera taxa para retirada
        taxaEntregaAtual = 0;
        taxaEntregaEncontrada = true;
        atualizarCarrinhoUI();
    }
}

function configurarBairroListener() {
    const bairroInput = document.getElementById('bairro-cliente');
    if (bairroInput) {
        bairroInput.addEventListener('input', recalcularTaxaEntrega);
        bairroInput.addEventListener('change', recalcularTaxaEntrega);
    }
}

function recalcularTaxaEntrega() {
    if (tipoEntrega !== 'delivery') return; // Só calcula se for entrega

    const bairroInput = document.getElementById('bairro-cliente');
    let bairro = bairroInput ? bairroInput.value.trim() : '';
    const cidade = document.getElementById('cidade-cliente')?.value || '';

    if (cidade.toLowerCase().includes('lavrinhas') && bairro) {
        if (!bairro.toLowerCase().startsWith('lavrinhas -')) {
            bairro = `Lavrinhas - ${bairro}`;
        }
    }

    const linha   = document.getElementById('linha-taxa-entrega');
    const valorEl = document.getElementById('valor-taxa-entrega');
    const aviso   = document.getElementById('aviso-taxa-entrega');

    if (!bairro) {
        taxaEntregaAtual = 0;
        taxaEntregaEncontrada = false;
        bairroAtual = '';
        if (linha) linha.style.display = 'none';
        if (aviso) aviso.style.display = 'none';
        atualizarCarrinhoUI();
        return;
    }

    const match = TaxaEntrega.encontrarTaxa(bairro, taxasEntregaCache);

    if (match) {
        taxaEntregaEncontrada = true;
        taxaEntregaAtual = Number(match.taxa) || 0;
        bairroAtual = match.bairro;
        if (linha)   linha.style.display = 'flex';
        if (valorEl) valorEl.textContent = TaxaEntrega.formatarBRL(taxaEntregaAtual);
        if (aviso)   aviso.style.display = 'none';
    } else {
        taxaEntregaEncontrada = false;
        taxaEntregaAtual = 0;
        bairroAtual = bairro;
        if (linha) linha.style.display = 'none';
        if (aviso) {
            aviso.style.display = 'block';
            aviso.textContent = 'Ainda não entregamos nesse bairro. Escolha "Retirar no Local" ou fale com a gente.';
        }
    }

    atualizarCarrinhoUI();
}

/* ===================== NAVEGAÇÃO DE CATEGORIAS ===================== */
function mudarCategoria(categoria) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('ativo'));
    document.querySelectorAll('.categoria-conteudo').forEach(conteudo => conteudo.classList.remove('ativo'));
    const botaoClicado = document.querySelector(`.tab-btn[onclick="mudarCategoria('${categoria}')"]`);
    if (botaoClicado) botaoClicado.classList.add('ativo');
    const conteudoAlvo = document.getElementById(`cat-${categoria}`);
    if (conteudoAlvo) conteudoAlvo.classList.add('ativo');
}

/* ===================== CARREGAR PRODUTOS E ADICIONAIS ===================== */
document.addEventListener('DOMContentLoaded', async () => {
    await carregarTaxasEntrega();
    await carregarAdicionais();
    await carregarProdutos();
    configurarMascaraTelefone();
    configurarMascaraCPF();
    configurarBuscaCEP();
    configurarBairroListener();
});

async function carregarAdicionais() {
    const { data, error } = await supabaseClient.from('adicionais').select('*').eq('ativo', true).order('nome', { ascending: true });
    if (!error) listaAdicionaisGlobal = data;
}

async function carregarProdutos() {
    const { data, error } = await supabaseClient.from('produtos').select('*').eq('ativo', true).order('nome', { ascending: true });
    if (error) return;

    const catLanches = document.getElementById('cat-lanches');
    const catBebidas = document.getElementById('cat-bebidas');
    const catDoces = document.getElementById('cat-doces');
    
    catLanches.innerHTML = '<h3 class="titulo-grupo-planos">Todo nosso cardápio disponível de lanches, faça a sua escolha</h3>';
    catBebidas.innerHTML = '<h3 class="titulo-grupo-planos">Refresque-se com nossas bebidas</h3>';
    catDoces.innerHTML = '<h3 class="titulo-grupo-planos">A sobremesa perfeita para fechar a conta</h3>';

    data.forEach(produto => {
        const precoFormatado = Number(produto.preco).toFixed(2).replace('.', ',');
        let descricaoTratada = produto.descricao ? produto.descricao.replace(/\\n/g, '\n') : '';
        const listaDescricao = descricaoTratada ? descricaoTratada.split('\n').filter(l => l.trim() !== '').map(item => `<li><i class="fa-solid fa-check"></i> ${item}</li>`).join('') : '';
        const classeCard = produto.destaque ? 'card-premium' : 'card';
        const icone = produto.destaque ? '<i class="fa-solid fa-crown"></i>' : '<i class="fa-solid fa-star"></i>';
        const imagemHTML = produto.imagem_url ? `<img src="${produto.imagem_url}" alt="${produto.nome}" class="card-imagem" loading="lazy">` : `<div class="imagem-placeholder"><i class="fa-solid fa-image"></i></div>`;
        const funcaoClique = produto.categoria === 'lanches' ? `abrirModalItem('${produto.id}')` : `adicionarAoCarrinhoDireto('${produto.nome}', ${produto.preco})`;

        const cardHTML = `
            <div class="${classeCard}">
                ${imagemHTML}
                <h3>${icone} ${produto.nome}</h3>
                <p class="preco">R$ ${precoFormatado}<span>/unidade</span></p>
                <ul class="lista-descricao">${listaDescricao}</ul>
                <button class="btn-amarelo btn-add-carrinho" onclick="${funcaoClique}">Adicionar</button>
            </div>
        `;

        if (produto.categoria === 'lanches') catLanches.innerHTML += cardHTML;
        if (produto.categoria === 'bebidas') catBebidas.innerHTML += cardHTML;
        if (produto.categoria === 'doces') catDoces.innerHTML += cardHTML;
    });
}

/* ===================== LÓGICA DO MODAL DE ADICIONAIS ===================== */
function abrirModalItem(id) {
    supabaseClient.from('produtos').select('*').eq('id', id).single().then(({data}) => {
        itemAtualSelecionado = data;
        document.getElementById('item-nome-titulo').textContent = data.nome;
        const listaModal = document.getElementById('lista-adicionais-modal');
        listaModal.innerHTML = '';

        if(listaAdicionaisGlobal.length === 0) {
            listaModal.innerHTML = '<p style="color:#999">Nenhum adicional disponível.</p>';
        } else {
            listaAdicionaisGlobal.forEach(ad => {
                listaModal.innerHTML += `
                    <label class="item-adicional" onclick="this.classList.toggle('checked')">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <input type="checkbox" class="check-adicional" value="${ad.id}" data-preco="${ad.preco}" data-nome="${ad.nome}" onchange="calcularTotalModal()">
                            <span>${ad.nome}</span>
                        </div>
                        <span class="preco-adicional">+ R$ ${Number(ad.preco).toFixed(2).replace('.', ',')}</span>
                    </label>
                `;
            });
        }
        calcularTotalModal(); 
        document.getElementById('modal-item').classList.add('ativo');
    });
}

function fecharModalItem() {
    document.getElementById('modal-item').classList.remove('ativo');
    itemAtualSelecionado = null;
}

function calcularTotalModal() {
    if (!itemAtualSelecionado) return;
    let total = Number(itemAtualSelecionado.preco);
    document.querySelectorAll('.check-adicional:checked').forEach(cb => total += Number(cb.getAttribute('data-preco')));
    document.getElementById('total-item-valor').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

function confirmarAdicaoAoCarrinho() {
    if (!itemAtualSelecionado) return;
    const checkboxes = document.querySelectorAll('.check-adicional:checked');
    const adicionaisEscolhidos = [];
    let precoFinal = Number(itemAtualSelecionado.preco);

    checkboxes.forEach(cb => {
        const nome = cb.getAttribute('data-nome');
        const preco = Number(cb.getAttribute('data-preco'));
        adicionaisEscolhidos.push({ nome, preco });
        precoFinal += preco;
    });

    let nomeExibicao = itemAtualSelecionado.nome;
    if (adicionaisEscolhidos.length > 0) nomeExibicao += ` (+ ${adicionaisEscolhidos.map(a => a.nome).join(', ')})`;

    const novoItem = { nome: nomeExibicao, nomeBase: itemAtualSelecionado.nome, preco: precoFinal, adicionais: adicionaisEscolhidos, qtd: 1 };
    const itemExistenteIndex = carrinho.findIndex(i => i.nome === novoItem.nome);
    
    if (itemExistenteIndex > -1) carrinho[itemExistenteIndex].qtd += 1;
    else carrinho.push(novoItem);

    atualizarCarrinhoUI();
    fecharModalItem();
    animarBotaoCarrinho();
}

/* ===================== LÓGICA DO CARRINHO ===================== */
function adicionarAoCarrinhoDireto(nome, preco) {
    const itemExistente = carrinho.find(i => i.nome === nome);
    if (itemExistente) itemExistente.qtd += 1;
    else carrinho.push({ nome, preco, adicionais: [], qtd: 1 });
    atualizarCarrinhoUI();
    animarBotaoCarrinho();
}

function animarBotaoCarrinho() {
    const btn = document.getElementById('btn-carrinho');
    btn.style.transform = 'scale(1.2)';
    btn.style.backgroundColor = '#ffe066';
    setTimeout(() => { btn.style.transform = 'scale(1)'; btn.style.backgroundColor = 'var(--cor-secundaria)'; }, 300);
}

function abrirCarrinho() {
    if (carrinho.length === 0) {
        mostrarAviso('Carrinho vazio', 'Adicione pelo menos um item antes de abrir o carrinho.', 'atencao');
        return;
    }
    
    // Reseta o formulário ao abrir
    tipoEntrega = null;
    document.getElementById('area-formulario').style.display = 'none';
    document.getElementById('btn-opt-delivery').style.borderColor = '#333';
    document.getElementById('btn-opt-delivery').style.background = '#111';
    document.getElementById('btn-opt-delivery').querySelector('i').style.color = '#888';
    document.getElementById('btn-opt-pickup').style.borderColor = '#333';
    document.getElementById('btn-opt-pickup').style.background = '#111';
    document.getElementById('btn-opt-pickup').querySelector('i').style.color = '#888';
    
    document.getElementById('modal-carrinho').classList.add('ativo');
}

function fecharCarrinho() { document.getElementById('modal-carrinho').classList.remove('ativo'); }

function alterarQtd(index, mudanca) {
    carrinho[index].qtd += mudanca;
    if (carrinho[index].qtd <= 0) carrinho.splice(index, 1); 
    atualizarCarrinhoUI();
}

function atualizarCarrinhoUI() {
    const lista = document.getElementById('lista-carrinho');
    const badge = document.getElementById('badge-carrinho');
    const subtotalEl = document.getElementById('subtotal-carrinho-valor');
    const totalEl = document.getElementById('total-carrinho-valor');
    
    lista.innerHTML = '';
    let subtotal = 0, totalItens = 0;

    carrinho.forEach((item, index) => {
        subtotal += item.preco * item.qtd;
        totalItens += item.qtd;
        let adicionaisHTML = item.adicionais && item.adicionais.length > 0 ? `<span class="item-adicionais-carrinho">Adicionais: ${item.adicionais.map(a => a.nome).join(', ')}</span>` : '';

        lista.innerHTML += `
            <div class="item-carrinho">
                <div class="item-info">
                    <span class="item-nome">${item.nomeBase || item.nome}</span>
                    ${adicionaisHTML}
                    <span class="item-preco">R$ ${item.preco.toFixed(2).replace('.', ',')}</span>
                </div>
                <div class="item-controles">
                    <button onclick="alterarQtd(${index}, -1)">-</button>
                    <span>${item.qtd}</span>
                    <button onclick="alterarQtd(${index}, 1)">+</button>
                </div>
            </div>
        `;
    });

    const totalFinal = subtotal + (tipoEntrega === 'delivery' ? taxaEntregaAtual : 0);
    if (subtotalEl) subtotalEl.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
    totalEl.textContent = `R$ ${totalFinal.toFixed(2).replace('.', ',')}`;

    if (totalItens > 0) { badge.textContent = totalItens; badge.classList.remove('escondido'); } 
    else { badge.classList.add('escondido'); fecharCarrinho(); }
}

/* ===================== MÁSCARAS E BUSCA ===================== */
function configurarMascaraTelefone() {
    const telInput = document.getElementById('tel-cliente');
    if(telInput) {
        telInput.addEventListener('input', function (e) {
            let valor = e.target.value.replace(/\D/g, '');
            if (valor.length > 11) valor = valor.slice(0, 11);
            if (valor.length > 10) e.target.value = valor.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
            else if (valor.length > 6) e.target.value = valor.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
            else if (valor.length > 2) e.target.value = valor.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
            else if (valor.length > 0) e.target.value = valor.replace(/^(\d*)/, '($1');
            else e.target.value = '';
        });
    }
}

function configurarMascaraCPF() {
    const cpfInput = document.getElementById('cpf-online');
    if(cpfInput) {
        cpfInput.addEventListener('input', function(e) {
            let val = e.target.value.replace(/\D/g, '');
            if (val.length > 11) val = val.slice(0, 11);
            val = val.replace(/(\d{3})(\d)/, '$1.$2');
            val = val.replace(/(\d{3})(\d)/, '$1.$2');
            val = val.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
            e.target.value = val;
        });
    }
}

function validarCPF(cpf) {
    cpf = cpf.replace(/\D/g, '');
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    let soma = 0, resto;
    for (let i = 1; i <= 9; i++) soma += parseInt(cpf.substring(i-1, i)) * (11 - i);
    resto = (soma * 10) % 11;
    if ((resto === 10) || (resto === 11)) resto = 0;
    if (resto !== parseInt(cpf.substring(9, 10))) return false;
    soma = 0;
    for (let i = 1; i <= 10; i++) soma += parseInt(cpf.substring(i-1, i)) * (12 - i);
    resto = (soma * 10) % 11;
    if ((resto === 10) || (resto === 11)) resto = 0;
    if (resto !== parseInt(cpf.substring(10, 11))) return false;
    return true;
}

function configurarBuscaCEP() {
    const cepInput = document.getElementById('cep-cliente');
    let ultimoCepBuscado = ""; 
    if (cepInput) {
        cepInput.addEventListener('blur', async (e) => {
            if (tipoEntrega !== 'delivery') return;

            let cep = e.target.value.replace(/\D/g, '');
            if (cep.length === 0) {
                document.getElementById('rua-cliente').value = '';
                document.getElementById('bairro-cliente').value = '';
                document.getElementById('cidade-cliente').value = '';
                ultimoCepBuscado = "";
                recalcularTaxaEntrega();
                return;
            }
            if (cep.length === 8 && cep !== ultimoCepBuscado) {
                ultimoCepBuscado = cep; 
                try {
                    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                    const data = await res.json();
                    if (!data.erro) {
                        document.getElementById('rua-cliente').value = data.logradouro;
                        document.getElementById('bairro-cliente').value = data.bairro;
                        document.getElementById('cidade-cliente').value = `${data.localidade} - ${data.uf}`;
                        document.getElementById('num-cliente').focus();
                        recalcularTaxaEntrega();
                    } else {
                        mostrarAviso('CEP não encontrado', 'O CEP digitado não foi localizado. Confira e tente novamente, ou digite o endereço manualmente.', 'erro');
                    }
                } catch (err) { console.error("Erro ao buscar CEP", err); }
            }
        });
        cepInput.addEventListener('input', function(e) {
            let val = e.target.value.replace(/\D/g, '');
            if (val.length > 5) val = val.replace(/^(\d{5})(\d)/, '$1-$2');
            e.target.value = val;
            ultimoCepBuscado = "";
        });
    }
}

async function buscarEnderecoPorRua() {
    if (tipoEntrega !== 'delivery') return;

    const ruaInput = document.getElementById('rua-cliente');
    const btnBusca = document.getElementById('btn-buscar-rua');
    const rua = ruaInput.value.trim();
    if (rua.length < 3) {
        mostrarAviso('Busca muito curta', 'Digite pelo menos 3 letras do nome da rua para buscar.', 'atencao');
        return;
    }
    
    const iconeOriginal = btnBusca.innerHTML;
    btnBusca.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btnBusca.disabled = true;

    try {
        const [resCruzeiro, resLavrinhas] = await Promise.all([
            fetch(`https://viacep.com.br/ws/SP/Cruzeiro/${encodeURIComponent(rua)}/json/`),
            fetch(`https://viacep.com.br/ws/SP/Lavrinhas/${encodeURIComponent(rua)}/json/`)
        ]);

        const dataCruzeiro = await resCruzeiro.json();
        const dataLavrinhas = await resLavrinhas.json();

        let resultados = [];
        if (Array.isArray(dataCruzeiro)) resultados = resultados.concat(dataCruzeiro);
        if (Array.isArray(dataLavrinhas)) resultados = resultados.concat(dataLavrinhas);

        if (resultados.length > 0) {
            const data = resultados[0];
            document.getElementById('cep-cliente').value = data.cep;
            document.getElementById('rua-cliente').value = data.logradouro; 
            document.getElementById('bairro-cliente').value = data.bairro;
            document.getElementById('cidade-cliente').value = `${data.localidade} - ${data.uf}`;
            document.getElementById('num-cliente').focus();
            recalcularTaxaEntrega();
        } else {
            mostrarAviso('Rua não encontrada', 'Não encontramos essa rua em Cruzeiro ou Lavrinhas - SP. Tente digitar o CEP diretamente.', 'erro');
        }
    } catch (err) { 
        mostrarAviso('Erro na busca', 'Não foi possível buscar o endereço agora. Digite o CEP manualmente.', 'erro');
    } finally { 
        btnBusca.innerHTML = iconeOriginal; 
        btnBusca.disabled = false; 
    }
}

/* ===================== ENVIO DE PEDIDO E PAGAMENTO ===================== */
async function enviarPedido() {
    if (!tipoEntrega) {
        mostrarAviso('Escolha o tipo de entrega', 'Você precisa escolher entre "Receber em Casa" ou "Retirar no Local" antes de continuar.', 'atencao');
        return;
    }

    const nome = document.getElementById('nome-cliente').value.trim();
    if (nome.length < 3) {
        mostrarAviso('Nome incompleto', 'Por favor, preencha seu nome completo para continuarmos.', 'atencao');
        return;
    }

    const subtotal = carrinho.reduce((acc, item) => acc + (item.preco * item.qtd), 0);
    const itensFormatados = carrinho.map(item => ({ nome: item.nome, preco: item.preco, qtd: item.qtd }));

    // === FLUXO DE RETIRADA (Pickup) ===
    if (tipoEntrega === 'pickup') {
        pedidoPendente = {
            cliente_nome: nome,
            cliente_telefone: 'Retirada no Balcão',
            cliente_cpf: null,
            cliente_endereco: null,
            bairro: null,
            taxa_entrega: 0,
            itens: itensFormatados,
            total: subtotal,
            pagamento: 'Retirada no Balcão (Pagar no Local)'
        };
        
        // Envia direto (Pula o modal de pagamento)
        await processarEnvioBanco(pedidoPendente);
        return;
    }

    // === FLUXO DE ENTREGA (Delivery) ===
    const telefone = document.getElementById('tel-cliente').value.trim();
    const cep = document.getElementById('cep-cliente').value.trim();
    const rua = document.getElementById('rua-cliente').value.trim();
    const num = document.getElementById('num-cliente').value.trim();
    const bairro = document.getElementById('bairro-cliente').value.trim();
    const cidade = document.getElementById('cidade-cliente').value.trim();

    if (cep && !num) {
        mostrarAviso('Falta o número', 'Digite o número da sua casa para completar o endereço.', 'atencao');
        return;
    }
    if (bairro && !taxaEntregaEncontrada) {
        mostrarAviso(
            'Bairro não atendido',
            'Não conseguimos calcular a taxa de entrega para o bairro <strong>"' + bairro + '"</strong>.<br><br>Fale com a gente pelo WhatsApp ou escolha <strong>"Retirar no Local"</strong>.',
            'erro'
        );
        return;
    }

    const total = subtotal + (bairro ? taxaEntregaAtual : 0);
    let enderecoCompleto = (rua && num) ? `${rua}, ${num} - ${bairro}, ${cidade}` : null;

    pedidoPendente = {
        cliente_nome: nome,
        cliente_telefone: telefone,
        cliente_cpf: null,
        cliente_endereco: enderecoCompleto,
        bairro: bairro || null,
        taxa_entrega: bairro ? taxaEntregaAtual : 0,
        itens: itensFormatados,
        total: total,
        pagamento: ''
    };

    const totalPgtoEl = document.getElementById('total-pagamento-valor');
    if (totalPgtoEl) totalPgtoEl.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;

    // Reseta modal de pagamento ao abrir
    metodoPagamento = "";
    document.querySelectorAll('.btn-pgto-entrega').forEach(btn => btn.classList.remove('ativo'));
    
    const containerCpf = document.getElementById('container-cpf-online');
    const containerTroco = document.getElementById('container-troco');
    if (containerCpf) containerCpf.style.display = 'none';
    if (containerTroco) containerTroco.style.display = 'none';
    if (document.getElementById('cpf-online')) document.getElementById('cpf-online').value = '';
    if (document.getElementById('input-troco')) document.getElementById('input-troco').value = '';

    document.getElementById('modal-carrinho').classList.remove('ativo');
    document.getElementById('modal-pagamento').classList.add('ativo');
}

function fecharModalPagamento() {
    document.getElementById('modal-pagamento').classList.remove('ativo');
    document.getElementById('modal-carrinho').classList.add('ativo');
}

function selecionarOpcaoPagamento(opcao, elementoBotao) {
    metodoPagamento = opcao;
    document.querySelectorAll('.btn-pgto-entrega').forEach(btn => btn.classList.remove('ativo'));
    if (elementoBotao) elementoBotao.classList.add('ativo');

    const containerCpf = document.getElementById('container-cpf-online');
    const containerTroco = document.getElementById('container-troco');

    if (opcao.includes('online')) {
        containerCpf.style.display = 'block';
        containerTroco.style.display = 'none';
    } 
    else if (opcao === 'dinheiro') {
        containerCpf.style.display = 'none';
        containerTroco.style.display = 'block';
        document.getElementById('input-troco').focus();
    } 
    else {
        containerCpf.style.display = 'none';
        containerTroco.style.display = 'none';
    }
}

async function confirmarPagamento() {
    if (!metodoPagamento) {
        mostrarAviso('Forma de pagamento', 'Selecione como você pretende pagar antes de confirmar o pedido.', 'atencao');
        return;
    }

    if (!pedidoPendente.cliente_endereco) {
        mostrarAviso('Endereço incompleto', 'Preencha o endereço completo (rua, número, bairro) para entrega.', 'atencao');
        return;
    }
    if (taxaEntregaAtual === 0 && !taxaEntregaEncontrada) {
        mostrarAviso('Taxa não calculada', 'Não foi possível calcular a taxa de entrega. Fale com a gente pelo WhatsApp ou escolha retirar no local.', 'erro');
        return;
    }

    const btn = document.querySelector('#modal-pagamento .btn-enviar');
    btn.disabled = true;
    btn.innerHTML = 'Processando...';

    try {
        if (metodoPagamento === 'dinheiro') {
            const troco = document.getElementById('input-troco').value;
            if (!troco) throw new Error("Informe o valor do troco.");
            pedidoPendente.pagamento = `Pagar na Entrega (Dinheiro) - Troco para R$ ${Number(troco).toFixed(2).replace('.', ',')}`;
            await processarEnvioBanco(pedidoPendente);
        } 
        else if (metodoPagamento.includes('online')) {
            const cpfInput = document.getElementById('cpf-online').value;
            const cpfLimpo = cpfInput.replace(/\D/g, '');
            
            if (!validarCPF(cpfLimpo)) {
                throw new Error("CPF inválido. Por favor, digite um CPF real.");
            }
            pedidoPendente.cliente_cpf = cpfLimpo;

            if (metodoPagamento === 'pix-online') {
                await pagarComPix(pedidoPendente);
            } else if (metodoPagamento === 'cartao-credito-online' || metodoPagamento === 'cartao-debito-online') {
                await pagarComCartao(pedidoPendente);
            }
        } 
        else {
            if (metodoPagamento === 'cartao-debito') pedidoPendente.pagamento = "Pagar na Entrega (Cartão de Débito) - Levar Máquina";
            if (metodoPagamento === 'cartao-credito') pedidoPendente.pagamento = "Pagar na Entrega (Cartão de Crédito) - Levar Máquina";
            if (metodoPagamento === 'pix') pedidoPendente.pagamento = "Pagar na Entrega (PIX) - Levar Máquina";
            await processarEnvioBanco(pedidoPendente);
        }
    } catch (err) {
        mostrarAviso('Erro no pagamento', err.message, 'erro');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar Pedido';
    }
}

/* ===================== INTEGRAÇÃO PAGBANK ===================== */
async function chamarApiPagBank(action, payload) {
    const response = await fetch('/api/pagbank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
        let msgErro = 'Erro desconhecido no PagBank.';
        if (data.error_messages && data.error_messages.length > 0) {
            msgErro = data.error_messages.map(e => e.description).join(' | ');
        } else if (data.message) {
            msgErro = data.message;
        }
        throw new Error(msgErro);
    }
    
    return data;
}

function montarItensPagBank(pedido) {
    const items = pedido.itens.map(item => ({
        reference_id: item.nome,
        name: item.nome,
        quantity: item.qtd,
        unit_amount: Math.round(item.preco * 100)
    }));
    if (Number(pedido.taxa_entrega) > 0) {
        items.push({
            reference_id: 'taxa-entrega',
            name: 'Taxa de Entrega ',
            quantity: 1,
            unit_amount: Math.round(Number(pedido.taxa_entrega) * 100)
        });
    }
    return items;
}

async function pagarComPix(pedido) {
    const payload = {
        reference_id: `pedido_${Date.now()}`,
        customer: {
            name: pedido.cliente_nome,
            email: 'cliente@email.com', 
            tax_id: pedido.cliente_cpf,
            phones: [{ country: '55', area: '12', number: pedido.cliente_telefone.replace(/\D/g, '').slice(2), type: 'MOBILE' }]
        },
        items: montarItensPagBank(pedido),
        qr_codes: [{ amount: { value: Math.round(pedido.total * 100) } }],
        notification_urls: [`https://${window.location.hostname}/api/webhook-pagbank`]
    };

    const result = await chamarApiPagBank('criar_pedido_pix', payload);
    
    if (result.qr_codes && result.qr_codes.length > 0) {
        const qrCodeText = result.qr_codes[0].text;
        
        pedido.pagamento = "Pagamento Antecipado (PIX) - Aguardando Pagamento";
        pedido.pagbank_id = result.id;
        await processarEnvioBanco(pedido, false); 

        document.getElementById('modal-pagamento').classList.remove('ativo');
        document.getElementById('modal-pix').classList.add('ativo');
        
        document.getElementById('qrcode-container').innerHTML = '';
        new QRCode(document.getElementById('qrcode-container'), {
            text: qrCodeText,
            width: 200,
            height: 200
        });
        
        document.getElementById('pix-copia-cola').value = qrCodeText;
    } else {
        throw new Error("Erro ao gerar PIX no PagBank.");
    }
}

async function pagarComCartao(pedido) {
    const payload = {
        reference_id: `pedido_${Date.now()}`,
        customer: {
            name: pedido.cliente_nome,
            email: 'cliente@email.com',
            tax_id: pedido.cliente_cpf
        },
        items: montarItensPagBank(pedido),
        redirect_url: `https://${window.location.hostname}/index.html?status=sucesso`,
        notification_urls: [`https://${window.location.hostname}/api/webhook-pagbank`]
    };

    const result = await chamarApiPagBank('criar_checkout_cartao', payload);
    
    if (result.links && result.links.length > 0) {
        const linkPagamento = result.links.find(l => l.rel === 'PAY').href;
        
        pedido.pagamento = `Pagamento Antecipado (${metodoPagamento === 'cartao-credito-online' ? 'Crédito' : 'Débito'}) - Redirecionado`;
        pedido.pagbank_id = result.id;
        await processarEnvioBanco(pedido, false);

        window.location.href = linkPagamento;
    } else {
        throw new Error("Erro ao gerar link de pagamento no PagBank.");
    }
}

function copiarPix() {
    const textarea = document.getElementById('pix-copia-cola');
    textarea.select();
    document.execCommand('copy');
    mostrarAviso('PIX copiado!', 'O código PIX foi copiado. Cole no aplicativo do seu banco para finalizar o pagamento.', 'sucesso');
}

/* ===================== SALVAR NO BANCO ===================== */
async function processarEnvioBanco(pedidoFinal, limparTela = true) {
    try {
        // O .select() é necessário para pegarmos o ID gerado pelo banco
        const { data, error } = await supabaseClient.from('pedidos_recentes').insert([pedidoFinal]).select();
        if (error) throw error;

        // Pega o ID gerado (primeiros 8 caracteres para ficar igual ao painel)
        const novoPedidoId = data[0].id.substring(0, 8).toUpperCase();

        // Limpa carrinho e formulário
        carrinho = [];
        tipoEntrega = null;
        taxaEntregaAtual = 0;
        taxaEntregaEncontrada = false;
        bairroAtual = '';
        atualizarCarrinhoUI();
        
        document.getElementById('nome-cliente').value = '';
        document.getElementById('tel-cliente').value = '';
        document.getElementById('cep-cliente').value = '';
        document.getElementById('num-cliente').value = '';
        document.getElementById('rua-cliente').value = '';
        document.getElementById('bairro-cliente').value = '';
        document.getElementById('cidade-cliente').value = '';
        document.getElementById('input-troco').value = '';
        document.getElementById('cpf-online').value = ''; 
        metodoPagamento = "";

        const linha = document.getElementById('linha-taxa-entrega');
        const aviso = document.getElementById('aviso-taxa-entrega');
        if (linha) linha.style.display = 'none';
        if (aviso) aviso.style.display = 'none';

        if (limparTela) {
            // Mostra o Modal de Sucesso com o ID
            document.getElementById('sucesso-pedido-id').textContent = `#${novoPedidoId}`;
            document.getElementById('modal-sucesso').classList.add('ativo');
            
            // Fecha os outros modais
            fecharCarrinho();
            document.getElementById('modal-pagamento').classList.remove('ativo');
        }
    } catch (err) {
        console.error(err);
        mostrarAviso('Erro ao enviar', 'Não foi possível enviar seu pedido: ' + err.message, 'erro');
    }
}

// Função para fechar o modal de sucesso e limpar tudo
function fecharModalSucesso() {
    document.getElementById('modal-sucesso').classList.remove('ativo');
    window.location.reload(); // Recarrega a página para limpar o estado
}