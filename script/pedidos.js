/* =====================================================================
   FUNCIONALIDADES DOS PEDIDOS
   ===================================================================== */

/* ===================== CONEXÃO COM SUPABASE ===================== */
const SUPABASE_URL = 'https://xzaqqzlfwkjtksjlcbgx.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_hoYHM3UKlvTDMCaadvI1kQ_gcn9-pqq'; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===================== ESTADO DO CARRINHO ===================== */
let carrinho = [];

/* ===================== MÁSCARA DE TELEFONE ===================== */
// Adiciona máscara automática no input de telefone
document.addEventListener('DOMContentLoaded', () => {
    const telInput = document.getElementById('tel-cliente');
    if(telInput) {
        telInput.addEventListener('input', function (e) {
            let valor = e.target.value.replace(/\D/g, ''); // Remove tudo que não é número
            
            if (valor.length > 11) valor = valor.slice(0, 11); // Limita a 11 números

            if (valor.length > 10) {
                // (XX) XXXXX-XXXX (Celular)
                e.target.value = valor.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
            } else if (valor.length > 6) {
                // (XX) XXXX-XXXX (Telefone fixo)
                e.target.value = valor.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
            } else if (valor.length > 2) {
                // (XX) XXXX
                e.target.value = valor.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
            } else if (valor.length > 0) {
                // (XX
                e.target.value = valor.replace(/^(\d*)/, '($1');
            } else {
                e.target.value = '';
            }
        });
    }
});

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