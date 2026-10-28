/* ===================== CONEXÃO COM SUPABASE ===================== */
const SUPABASE_URL = 'https://xzaqqzlfwkjtksjlcbgx.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_hoYHM3UKlvTDMCaadvI1kQ_gcn9-pqq'; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let carrinho = [];
let listaAdicionaisGlobal = []; // Armazena os adicionais do banco
let itemAtualSelecionado = null; // Item que está aberto no modal

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
    await carregarAdicionais(); // Carrega os adicionais primeiro
    await carregarProdutos();
    configurarMascaraTelefone();
    configurarBuscaCEP(); // Inicia a busca de CEP
});

async function carregarAdicionais() {
    const { data, error } = await supabaseClient
        .from('adicionais')
        .select('*')
        .eq('ativo', true)
        .order('nome', { ascending: true });

    if (error) {
        console.error('Erro ao carregar adicionais:', error);
        return;
    }
    listaAdicionaisGlobal = data;
}

async function carregarProdutos() {
    const { data, error } = await supabaseClient
        .from('produtos')
        .select('*')
        .eq('ativo', true)
        .order('nome', { ascending: true });

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
        const listaDescricao = descricaoTratada
            ? descricaoTratada.split('\n').filter(linha => linha.trim() !== '').map(item => `<li><i class="fa-solid fa-check"></i> ${item}</li>`).join('') 
            : '';

        const classeCard = produto.destaque ? 'card-premium' : 'card';
        const icone = produto.destaque ? '<i class="fa-solid fa-crown"></i>' : '<i class="fa-solid fa-star"></i>';
        const imagemHTML = produto.imagem_url 
            ? `<img src="${produto.imagem_url}" alt="${produto.nome}" class="card-imagem" loading="lazy">`
            : `<div class="imagem-placeholder"><i class="fa-solid fa-image"></i></div>`;

        // Lógica: Se for lanche, abre o modal. Se não, adiciona direto.
        const funcaoClique = produto.categoria === 'lanches' 
            ? `abrirModalItem('${produto.id}')` 
            : `adicionarAoCarrinhoDireto('${produto.nome}', ${produto.preco})`;

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
            listaModal.innerHTML = '<p style="color:#999">Nenhum adicional disponível no momento.</p>';
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
    const checkboxes = document.querySelectorAll('.check-adicional:checked');
    
    checkboxes.forEach(cb => {
        total += Number(cb.getAttribute('data-preco'));
    });

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
    if (adicionaisEscolhidos.length > 0) {
        nomeExibicao += ` (+ ${adicionaisEscolhidos.map(a => a.nome).join(', ')})`;
    }

    const novoItem = {
        nome: nomeExibicao,
        nomeBase: itemAtualSelecionado.nome,
        preco: precoFinal,
        adicionais: adicionaisEscolhidos,
        qtd: 1
    };

    const itemExistenteIndex = carrinho.findIndex(i => i.nome === novoItem.nome);
    
    if (itemExistenteIndex > -1) {
        carrinho[itemExistenteIndex].qtd += 1;
    } else {
        carrinho.push(novoItem);
    }

    atualizarCarrinhoUI();
    fecharModalItem();
    animarBotaoCarrinho();
}

/* ===================== LÓGICA DO CARRINHO ===================== */
function adicionarAoCarrinhoDireto(nome, preco) {
    const itemExistente = carrinho.find(i => i.nome === nome);
    
    if (itemExistente) {
        itemExistente.qtd += 1;
    } else {
        carrinho.push({ nome, preco, adicionais: [], qtd: 1 });
    }
    
    atualizarCarrinhoUI();
    animarBotaoCarrinho();
}

function animarBotaoCarrinho() {
    const btn = document.getElementById('btn-carrinho');
    btn.style.transform = 'scale(1.2)';
    btn.style.backgroundColor = '#ffe066';
    setTimeout(() => {
        btn.style.transform = 'scale(1)';
        btn.style.backgroundColor = 'var(--cor-secundaria)';
    }, 300);
}

function abrirCarrinho() {
    if (carrinho.length === 0) {
        alert("Seu carrinho está vazio! Escolha um lanche primeiro.");
        return;
    }
    document.getElementById('modal-carrinho').classList.add('ativo');
}

function fecharCarrinho() {
    document.getElementById('modal-carrinho').classList.remove('ativo');
}

function alterarQtd(index, mudanca) {
    carrinho[index].qtd += mudanca;
    if (carrinho[index].qtd <= 0) {
        carrinho.splice(index, 1); 
    }
    atualizarCarrinhoUI();
}

function atualizarCarrinhoUI() {
    const lista = document.getElementById('lista-carrinho');
    const badge = document.getElementById('badge-carrinho');
    const totalEl = document.getElementById('total-carrinho-valor');
    
    lista.innerHTML = '';
    let totalGeral = 0;
    let totalItens = 0;

    carrinho.forEach((item, index) => {
        totalGeral += item.preco * item.qtd;
        totalItens += item.qtd;

        let adicionaisHTML = '';
        if (item.adicionais && item.adicionais.length > 0) {
            const nomes = item.adicionais.map(a => a.nome).join(', ');
            adicionaisHTML = `<span class="item-adicionais-carrinho">Adicionais: ${nomes}</span>`;
        }

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
    
    if (totalItens > 0) {
        badge.textContent = totalItens;
        badge.classList.remove('escondido');
    } else {
        badge.classList.add('escondido');
        fecharCarrinho(); 
    }
}

/* ===================== MÁSCARA E ENVIO ===================== */
function configurarMascaraTelefone() {
    const telInput = document.getElementById('tel-cliente');
    if(telInput) {
        telInput.addEventListener('input', function (e) {
            let valor = e.target.value.replace(/\D/g, '');
            if (valor.length > 11) valor = valor.slice(0, 11);
            if (valor.length > 10) {
                e.target.value = valor.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
            } else if (valor.length > 6) {
                e.target.value = valor.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
            } else if (valor.length > 2) {
                e.target.value = valor.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
            } else if (valor.length > 0) {
                e.target.value = valor.replace(/^(\d*)/, '($1');
            } else {
                e.target.value = '';
            }
        });
    }
}

async function enviarPedido() {
    const nome = document.getElementById('nome-cliente').value.trim();
    const telefone = document.getElementById('tel-cliente').value.trim();

    // Captura endereço
    const cep = document.getElementById('cep-cliente').value.trim();
    const rua = document.getElementById('rua-cliente').value.trim();
    const num = document.getElementById('num-cliente').value.trim();
    const bairro = document.getElementById('bairro-cliente').value.trim();
    const cidade = document.getElementById('cidade-cliente').value.trim();

    if (nome.length < 3) { alert("Por favor, preencha seu nome completo."); return; }
    if (telefone) {
        const regexTelefone = /^\(\d{2}\) \d{4,5}-\d{4}$/;
        if (!regexTelefone.test(telefone)) {
            alert("Por favor, digite um número de WhatsApp válido: (DD) 99999-9999.");
            return;
        }
    }

    // Se o cliente preencheu o CEP, obriga a digitar o número da casa.
    if (cep && !num) {
        alert("Por favor, digite o número da sua casa para completar o endereço.");
        document.getElementById('num-cliente').focus();
        return;
    }

    const total = carrinho.reduce((acc, item) => acc + (item.preco * item.qtd), 0);

    // Limpa o formato do carrinho para mandar pro banco
    const itensFormatados = carrinho.map(item => {
        return {
            nome: item.nome,
            preco: item.preco,
            qtd: item.qtd
        };
    });

    // Monta o endereço completo
    let enderecoCompleto = '';
    if (rua && num) {
        enderecoCompleto = `${rua}, ${num} - ${bairro}, ${cidade}`;
    }

    const novoPedido = {
        cliente_nome: nome,
        cliente_telefone: telefone,
        cliente_endereco: enderecoCompleto || null, // Envia null se for retirada no balcão
        itens: itensFormatados,
        total: total
    };

    const btnEnviar = document.querySelector('.btn-enviar');
    btnEnviar.disabled = true;
    btnEnviar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';

    try {
        const { error } = await supabaseClient.from('pedidos_recentes').insert([novoPedido]);
        if (error) throw error;

        alert("Pedido enviado com sucesso! Aguarde a impressão na cozinha.");
        
        // Limpa o carrinho e TODOS os campos do formulário
        carrinho = [];
        atualizarCarrinhoUI();
        
        document.getElementById('nome-cliente').value = '';
        document.getElementById('tel-cliente').value = '';
        document.getElementById('cep-cliente').value = '';
        document.getElementById('num-cliente').value = '';
        document.getElementById('rua-cliente').value = '';
        document.getElementById('bairro-cliente').value = '';
        document.getElementById('cidade-cliente').value = '';
        
        fecharCarrinho();

    } catch (err) {
        console.error(err);
        // Mostra o erro real no console, caso a coluna do banco não exista ainda
        alert("Erro ao enviar o pedido. Verifique a conexão e tente novamente.");
    } finally {
        btnEnviar.disabled = false;
        btnEnviar.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar Pedido';
    }
}

/* ===================== BUSCA DE CEP (ViaCEP) ===================== */
function configurarBuscaCEP() {
    const cepInput = document.getElementById('cep-cliente');
    if (cepInput) {
        cepInput.addEventListener('blur', async (e) => {
            let cep = e.target.value.replace(/\D/g, '');
            if (cep.length === 8) {
                try {
                    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                    const data = await res.json();
                    if (!data.erro) {
                        document.getElementById('rua-cliente').value = data.logradouro;
                        document.getElementById('bairro-cliente').value = data.bairro;
                        document.getElementById('cidade-cliente').value = `${data.localidade} - ${data.uf}`;
                        document.getElementById('num-cliente').focus();
                    } else {
                        alert("CEP não encontrado.");
                    }
                } catch (err) {
                    console.error("Erro ao buscar CEP", err);
                }
            }
        });

        // Máscara do CEP (00000-000)
        cepInput.addEventListener('input', function(e) {
            let val = e.target.value.replace(/\D/g, '');
            if (val.length > 5) val = val.replace(/^(\d{5})(\d)/, '$1-$2');
            e.target.value = val;
        });
    }
}