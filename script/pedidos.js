/* ===================== CONEXÃO COM SUPABASE ===================== */
const SUPABASE_URL = 'https://xzaqqzlfwkjtksjlcbgx.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_hoYHM3UKlvTDMCaadvI1kQ_gcn9-pqq'; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let carrinho = [];
let listaAdicionaisGlobal = [];
let itemAtualSelecionado = null;
let pedidoPendente = null;
let metodoPagamento = "";

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
    await carregarAdicionais();
    await carregarProdutos();
    configurarMascaraTelefone();
    configurarMascaraCPF();
    configurarBuscaCEP();
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
    if (carrinho.length === 0) return alert("Seu carrinho está vazio!");
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
    const totalEl = document.getElementById('total-carrinho-valor');
    
    lista.innerHTML = '';
    let totalGeral = 0, totalItens = 0;

    carrinho.forEach((item, index) => {
        totalGeral += item.preco * item.qtd;
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

    totalEl.textContent = `R$ ${totalGeral.toFixed(2).replace('.', ',')}`;
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
    // Agora aponta para o campo dentro do modal de pagamento
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
            let cep = e.target.value.replace(/\D/g, '');
            if (cep.length === 0) {
                document.getElementById('rua-cliente').value = '';
                document.getElementById('bairro-cliente').value = '';
                document.getElementById('cidade-cliente').value = '';
                ultimoCepBuscado = "";
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
                    } else alert("CEP não encontrado.");
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
    const ruaInput = document.getElementById('rua-cliente');
    const btnBusca = document.getElementById('btn-buscar-rua');
    const rua = ruaInput.value.trim();
    if (rua.length < 3) return alert("Digite pelo menos 3 letras da rua.");
    
    const iconeOriginal = btnBusca.innerHTML;
    btnBusca.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btnBusca.disabled = true;

    try {
        const res = await fetch(`https://viacep.com.br/ws/SP/Cruzeiro/${encodeURIComponent(rua)}/json/`);
        const data = await res.json();
        if (data && data.length > 0) {
            document.getElementById('cep-cliente').value = data[0].cep;
            document.getElementById('rua-cliente').value = data[0].logradouro; 
            document.getElementById('bairro-cliente').value = data[0].bairro;
            document.getElementById('cidade-cliente').value = `${data[0].localidade} - ${data[0].uf}`;
            document.getElementById('num-cliente').focus();
        } else alert("Rua não encontrada em Cruzeiro - SP.");
    } catch (err) { alert("Erro na busca. Digite o CEP."); } 
    finally { btnBusca.innerHTML = iconeOriginal; btnBusca.disabled = false; }
}

/* ===================== ENVIO DE PEDIDO E PAGAMENTO ===================== */
async function enviarPedido() {
    const nome = document.getElementById('nome-cliente').value.trim();
    const telefone = document.getElementById('tel-cliente').value.trim();
    const cep = document.getElementById('cep-cliente').value.trim();
    const rua = document.getElementById('rua-cliente').value.trim();
    const num = document.getElementById('num-cliente').value.trim();
    const bairro = document.getElementById('bairro-cliente').value.trim();
    const cidade = document.getElementById('cidade-cliente').value.trim();

    if (nome.length < 3) return alert("Preencha seu nome completo.");
    if (cep && !num) return alert("Digite o número da sua casa.");

    const total = carrinho.reduce((acc, item) => acc + (item.preco * item.qtd), 0);
    const itensFormatados = carrinho.map(item => ({ nome: item.nome, preco: item.preco, qtd: item.qtd }));
    let enderecoCompleto = (rua && num) ? `${rua}, ${num} - ${bairro}, ${cidade}` : null;

    pedidoPendente = {
        cliente_nome: nome,
        cliente_telefone: telefone,
        cliente_cpf: null, // Será preenchido se for online
        cliente_endereco: enderecoCompleto,
        itens: itensFormatados,
        total: total,
        pagamento: ''
    };

    if (enderecoCompleto) {
        document.getElementById('modal-carrinho').classList.remove('ativo');
        document.getElementById('modal-pagamento').classList.add('ativo');
    } else {
        pedidoPendente.pagamento = 'Retirada no Balcão (Pagar no local)';
        processarEnvioBanco(pedidoPendente);
    }
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

    // Se for online, mostra o CPF e esconde o troco
    if (opcao.includes('online')) {
        containerCpf.style.display = 'block';
        containerTroco.style.display = 'none';
    } 
    // Se for dinheiro, mostra o troco e esconde o CPF
    else if (opcao === 'dinheiro') {
        containerCpf.style.display = 'none';
        containerTroco.style.display = 'block';
        document.getElementById('input-troco').focus();
    } 
    // Outros (cartão/pix na entrega), esconde os dois
    else {
        containerCpf.style.display = 'none';
        containerTroco.style.display = 'none';
    }
}

async function confirmarPagamento() {
    if (!metodoPagamento) return alert("Selecione uma forma de pagamento.");

    const btn = document.querySelector('#modal-pagamento .btn-enviar');
    btn.disabled = true;
    btn.innerHTML = 'Processando...';

    try {
        if (metodoPagamento === 'dinheiro') {
            const troco = document.getElementById('input-troco').value;
            if (!troco) throw new Error("Informe o troco.");
            pedidoPendente.pagamento = `Pagar na Entrega (Dinheiro) - Troco para R$ ${Number(troco).toFixed(2).replace('.', ',')}`;
            await processarEnvioBanco(pedidoPendente);
        } 
        else if (metodoPagamento.includes('online')) {
            // Pega o CPF do campo novo no modal de pagamento
            const cpfInput = document.getElementById('cpf-online').value;
            const cpfLimpo = cpfInput.replace(/\D/g, '');
            
            // Validação matemática
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
            if (metodoPagamento === 'pix') pedidoPendente.pagamento = "Pagar na Entrega (PIX) - Enviar Chave";
            await processarEnvioBanco(pedidoPendente);
        }
    } catch (err) {
        alert(err.message);
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
    
    // Tratamento de erro melhorado: pega a mensagem exata do PagBank
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

async function pagarComPix(pedido) {
    const payload = {
        reference_id: `pedido_${Date.now()}`,
        customer: {
            name: pedido.cliente_nome,
            email: 'cliente@email.com', // Troque por um e-mail válido se o PagBank reclamar
            tax_id: pedido.cliente_cpf,
            phones: [{ country: '55', area: '12', number: pedido.cliente_telefone.replace(/\D/g, '').slice(2), type: 'MOBILE' }]
        },
        items: pedido.itens.map(item => ({
            reference_id: item.nome,
            name: item.nome,
            quantity: item.qtd,
            unit_amount: Math.round(item.preco * 100) 
        })),
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
        items: pedido.itens.map(item => ({
            reference_id: item.nome,
            name: item.nome,
            quantity: item.qtd,
            unit_amount: Math.round(item.preco * 100)
        })),
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
    alert("Código PIX copiado!");
}

/* ===================== SALVAR NO BANCO ===================== */
async function processarEnvioBanco(pedidoFinal, limparTela = true) {
    try {
        const { error } = await supabaseClient.from('pedidos_recentes').insert([pedidoFinal]);
        if (error) throw error;

        carrinho = [];
        atualizarCarrinhoUI();
        
        document.getElementById('nome-cliente').value = '';
        document.getElementById('tel-cliente').value = '';
        document.getElementById('cep-cliente').value = '';
        document.getElementById('num-cliente').value = '';
        document.getElementById('rua-cliente').value = '';
        document.getElementById('bairro-cliente').value = '';
        document.getElementById('cidade-cliente').value = '';
        document.getElementById('input-troco').value = '';
        document.getElementById('cpf-online').value = ''; // Limpa o CPF novo
        metodoPagamento = "";

        if (limparTela) {
            alert("Pedido enviado com sucesso!");
            fecharCarrinho();
            document.getElementById('modal-pagamento').classList.remove('ativo');
        }
    } catch (err) {
        console.error(err);
        alert("Erro ao enviar o pedido: " + err.message);
    }
}