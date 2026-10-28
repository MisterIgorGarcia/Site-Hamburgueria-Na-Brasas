/* =====================================================================
   FUNCIONALIDADES DOS PEDIDOS
   ===================================================================== */

/* ===================== CONEXÃO COM SUPABASE ===================== */
const SUPABASE_URL = 'https://xzaqqzlfwkjtksjlcbgx.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_hoYHM3UKlvTDMCaadvI1kQ_gcn9-pqq'; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===================== ESTADO DO CARRINHO ===================== */
let carrinho = [];

/* ===================== NAVEGAÇÃO DE CATEGORIAS ===================== */
function mudarCategoria(categoria) {
    // 1. Remove a classe 'ativo' de todos os botões
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('ativo'));
    
    // 2. Remove a classe 'ativo' de todas as divs de conteúdo
    document.querySelectorAll('.categoria-conteudo').forEach(conteudo => conteudo.classList.remove('ativo'));

    // 3. Adiciona 'ativo' apenas no botão que foi clicado
    const botaoClicado = document.querySelector(`.tab-btn[onclick="mudarCategoria('${categoria}')"]`);
    if (botaoClicado) botaoClicado.classList.add('ativo');
    
    // 4. Adiciona 'ativo' apenas no conteúdo da categoria clicada
    const conteudoAlvo = document.getElementById(`cat-${categoria}`);
    if (conteudoAlvo) conteudoAlvo.classList.add('ativo');
}

/* ===================== CARREGAR PRODUTOS DO BANCO ===================== */
document.addEventListener('DOMContentLoaded', async () => {
    // Carrega o HTML dos produtos assim que a página abre
    await carregarProdutos();
    // Inicializa a máscara de telefone
    configurarMascaraTelefone();
});

async function carregarProdutos() {
    const { data, error } = await supabaseClient
        .from('produtos')
        .select('*')
        .eq('ativo', true)
        .order('nome', { ascending: true });

    if (error) {
        console.error('Erro ao carregar produtos:', error);
        return;
    }

    const catLanches = document.getElementById('cat-lanches');
    const catBebidas = document.getElementById('cat-bebidas');
    const catDoces = document.getElementById('cat-doces');
    
    catLanches.innerHTML = '<h3 class="titulo-grupo-planos">Todo nosso cardápio disponível de lanches, faça a sua escolha</h3>';
    catBebidas.innerHTML = '<h3 class="titulo-grupo-planos">Refresque-se com nossas bebidas</h3>';
    catDoces.innerHTML = '<h3 class="titulo-grupo-planos">A sobremesa perfeita para fechar a conta</h3>';

    data.forEach(produto => {
        const precoFormatado = Number(produto.preco).toFixed(2).replace('.', ',');
        
        // Correção do \n
        let descricaoTratada = produto.descricao ? produto.descricao.replace(/\\n/g, '\n') : '';
        
        const listaDescricao = descricaoTratada
            ? descricaoTratada.split('\n').filter(linha => linha.trim() !== '').map(item => `<li><i class="fa-solid fa-check"></i> ${item}</li>`).join('') 
            : '';

        const classeCard = produto.destaque ? 'card-premium' : 'card';
        const icone = produto.destaque ? '<i class="fa-solid fa-crown"></i>' : '<i class="fa-solid fa-star"></i>';

        const imagemHTML = produto.imagem_url 
            ? `<img src="${produto.imagem_url}" alt="${produto.nome}" class="card-imagem" loading="lazy">`
            : `<div class="imagem-placeholder"><i class="fa-solid fa-image"></i></div>`;

        const nomeSeguro = produto.nome.replace(/'/g, "\\'");

        const cardHTML = `
            <div class="${classeCard}">
                ${imagemHTML}
                <h3>${icone} ${produto.nome}</h3>
                <p class="preco">R$ ${precoFormatado}<span>/unidade</span></p>
                <ul class="lista-descricao">${listaDescricao}</ul>
                <button class="btn-amarelo btn-add-carrinho" onclick="adicionarAoCarrinho('${nomeSeguro}', ${produto.preco})">Adicionar</button>
            </div>
        `;

        if (produto.categoria === 'lanches') catLanches.innerHTML += cardHTML;
        if (produto.categoria === 'bebidas') catBebidas.innerHTML += cardHTML;
        if (produto.categoria === 'doces') catDoces.innerHTML += cardHTML;
    });
}

/* ===================== MÁSCARA DE TELEFONE ===================== */
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

/* ===================== FUNÇÕES DO CARRINHO ===================== */
function adicionarAoCarrinho(nome, preco) {
    const itemExistente = carrinho.find(i => i.nome === nome);
    
    if (itemExistente) {
        itemExistente.qtd += 1;
    } else {
        carrinho.push({ nome, preco, qtd: 1 });
    }
    
    atualizarCarrinhoUI();
    
    // Efeito visual para avisar que adicionou
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
        carrinho.splice(index, 1); // Remove o item
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

        lista.innerHTML += `
            <div class="item-carrinho">
                <div class="item-info">
                    <span class="item-nome">${item.nome}</span>
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
        fecharCarrinho(); // Fecha o modal se o cliente remover tudo
    }
}

/* ===================== ENVIAR PEDIDO PRO BANCO ===================== */
async function enviarPedido() {
    const nome = document.getElementById('nome-cliente').value.trim();
    const telefone = document.getElementById('tel-cliente').value.trim();

    // Validação do Nome
    if (nome.length < 3) {
        alert("Por favor, preencha seu nome completo.");
        return;
    }

    // Validação do Telefone (Regex para formato (XX) XXXXX-XXXX ou (XX) XXXX-XXXX)
    if (telefone) {
        const regexTelefone = /^\(\d{2}\) \d{4,5}-\d{4}$/;
        if (!regexTelefone.test(telefone)) {
            alert("Por favor, digite um número de WhatsApp válido: (DD) 99999-9999.");
            return;
        }
    }

    const total = carrinho.reduce((acc, item) => acc + (item.preco * item.qtd), 0);

    const novoPedido = {
        cliente_nome: nome,
        cliente_telefone: telefone,
        itens: carrinho,
        total: total
    };

    const btnEnviar = document.querySelector('.btn-enviar');
    btnEnviar.disabled = true;
    btnEnviar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';

    try {
        const { error } = await supabaseClient
            .from('pedidos_recentes')
            .insert([novoPedido]);

        if (error) throw error;

        alert("Pedido enviado com sucesso! Aguarde a impressão na cozinha.");
        
        // Limpa tudo e volta ao normal
        carrinho = [];
        atualizarCarrinhoUI();
        document.getElementById('nome-cliente').value = '';
        document.getElementById('tel-cliente').value = '';
        fecharCarrinho();

    } catch (err) {
        console.error(err);
        alert("Erro ao enviar o pedido. Tente novamente ou chame no WhatsApp.");
    } finally {
        btnEnviar.disabled = false;
        btnEnviar.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar Pedido';
    }
}