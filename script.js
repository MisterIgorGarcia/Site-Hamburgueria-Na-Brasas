/* ===================== CONFIGURAÇÃO DE HORÁRIOS ===================== */
// Altere aqui os horários de funcionamento da hamburgueria.
// Cada dia da semana é representado por um número:
// 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado
// Para cada dia, você pode definir um ou mais períodos de funcionamento.
// Cada período é um objeto com "abre" e "fecha" no formato "HH:MM" (24 horas).
// Se o horário de "fecha" for menor que o de "abre", significa que o
// estabelecimento fecha no dia seguinte (ex: abre 19:00, fecha 04:00).
// Para dias fechados, use um array vazio: []

const HORARIOS_FUNCIONAMENTO = {
    // Para fechado == [], para aberto [{abre: 'horario', fecha: 'horario'}]
    0: [ { abre: "19:00", fecha: "04:00" } ],  // Domingo
    1: [ { abre: "19:00", fecha: "04:00" } ],  // Segunda
    2: [],                                     // Terça — FECHADO
    3: [ { abre: "19:00", fecha: "04:00" } ],  // Quarta
    4: [ { abre: "19:00", fecha: "04:00" } ],  // Quinta
    5: [ { abre: "19:00", fecha: "04:00" } ],  // Sexta
    6: [ { abre: "19:00", fecha: "04:00" } ]   // Sábado
};

/* ===================== FUNÇÕES AUXILIARES ===================== */

/**
 * Converte uma string de hora "HH:MM" para minutos desde a meia-noite.
 * @param {string} hora - Ex: "07:00" ou "04:00"
 * @returns {number} Minutos desde 00:00
 */
function horaParaMinutos(hora) {
    const [h, m] = hora.split(':').map(Number);
    return h * 60 + m;
}

/**
 * Formata minutos desde a meia-noite para "HH:MM".
 * @param {number} minutos - Ex: 420 (7*60)
 * @returns {string} Ex: "07:00"
 */
function minutosParaHora(minutos) {
    const h = Math.floor(minutos / 60) % 24;
    const m = minutos % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/**
 * Formata um total de segundos em "HH:MM:SS".
 * @param {number} totalSegundos
 * @returns {string}
 */
function formatarCronometro(totalSegundos) {
    const h = Math.floor(totalSegundos / 3600);
    const m = Math.floor((totalSegundos % 3600) / 60);
    const s = totalSegundos % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

/**
 * Gera uma lista de intervalos absolutos (em minutos desde o início da semana,
 * considerando Domingo 00:00 como 0) a partir da configuração.
 * Isso facilita verificar se está aberto e encontrar o próximo evento,
 * mesmo para horários que atravessam a meia-noite.
 * @returns {Array<{inicio: number, fim: number}>}
 */
function gerarIntervalosAbsolutos() {
    const intervalos = [];
    // Para cada dia da semana (0 a 6)
    for (let dia = 0; dia < 7; dia++) {
        const base = dia * 1440; // minutos até o início do dia
        const periodos = HORARIOS_FUNCIONAMENTO[dia] || [];
        periodos.forEach(periodo => {
            const inicio = horaParaMinutos(periodo.abre);
            const fim = horaParaMinutos(periodo.fecha);
            if (fim > inicio) {
                // Intervalo normal dentro do mesmo dia
                intervalos.push({ inicio: base + inicio, fim: base + fim });
            } else {
                // Intervalo que atravessa a meia-noite
                // Parte 1: do início até 24:00 do mesmo dia
                intervalos.push({ inicio: base + inicio, fim: base + 1440 });
                // Parte 2: de 00:00 até o fim no dia seguinte
                intervalos.push({ inicio: base + 1440, fim: base + 1440 + fim });
            }
        });
    }
    // Ordena por início
    intervalos.sort((a, b) => a.inicio - b.inicio);
    return intervalos;
}

// Cache dos intervalos para não recalcular toda hora
let INTERVALOS_ABSOLUTOS = gerarIntervalosAbsolutos();

/**
 * Retorna o status atual da hamburgueria.
 * @returns {Object} { aberto: boolean, proximoEvento: Date, mensagem: string }
 */
function obterStatus() {
    const agora = new Date();
    // Minutos desde o início da semana (Domingo 00:00 = 0)
    const diaSemana = agora.getDay();
    const minutosDoDia = agora.getHours() * 60 + agora.getMinutes() + agora.getSeconds() / 60;
    const minutosAbsolutos = diaSemana * 1440 + minutosDoDia;

    // Verifica se está aberto no momento
    let aberto = false;
    let intervaloAtual = null;
    for (const intervalo of INTERVALOS_ABSOLUTOS) {
        if (minutosAbsolutos >= intervalo.inicio && minutosAbsolutos < intervalo.fim) {
            aberto = true;
            intervaloAtual = intervalo;
            break;
        }
    }

    // Prepara lista de eventos (aberturas e fechamentos) para encontrar o próximo
    const eventos = [];
    INTERVALOS_ABSOLUTOS.forEach(intervalo => {
        eventos.push({ tempo: intervalo.inicio, tipo: 'abertura' });
        eventos.push({ tempo: intervalo.fim, tipo: 'fechamento' });
    });
    eventos.sort((a, b) => a.tempo - b.tempo);

    let proximoEvento = eventos.find(e => e.tempo > minutosAbsolutos);
    let mensagem = '';
    let proximoEventoData;

    if (aberto) {
        // Se está aberto, o próximo evento é o fechamento
        const fechamento = intervaloAtual.fim;
        const diffSegundos = Math.floor((fechamento - minutosAbsolutos) * 60);
        proximoEventoData = new Date(agora.getTime() + diffSegundos * 1000);
        const horaFechamento = minutosParaHora(fechamento % 1440);
        mensagem = `Hamburgueria <strong>aberta</strong>. Fecharemos às <strong>${horaFechamento}</strong>.`;
    } else {
        // Se está fechado, o próximo evento é uma abertura
        if (!proximoEvento) {
            // Não há mais eventos nesta semana, pega o primeiro da próxima
            proximoEvento = { tempo: eventos[0].tempo + 7 * 1440, tipo: 'abertura' };
        }
        const abertura = proximoEvento.tempo;
        const diffSegundos = Math.floor((abertura - minutosAbsolutos) * 60);
        proximoEventoData = new Date(agora.getTime() + diffSegundos * 1000);

        const horaAbertura = minutosParaHora(abertura % 1440);
        const diaEvento = Math.floor(abertura / 1440) % 7;
        const diffDias = Math.floor((abertura - minutosAbsolutos) / 1440);
        let quando;
        if (diffDias === 0) quando = 'hoje';
        else if (diffDias === 1) quando = 'amanhã';
        else {
            const nomes = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
            quando = `na ${nomes[diaEvento]}`;
        }
        mensagem = `Hamburgueria fechada no momento. Abrirá <strong>${quando}</strong> às <strong>${horaAbertura}</strong>.`;
    }

    return { aberto, proximoEvento: proximoEventoData, mensagem };
}

/* ===================== BADGE DE STATUS ===================== */
function BadgeAtualizarStatus() {
    const { aberto } = obterStatus();
    const badge = document.getElementById('statusatualhtml');
    const texto = document.getElementById('texto-bolinha');
    const bolinha = badge.querySelector('.bolinha');

    if (aberto) {
        texto.textContent = 'ABERTO AGORA';
        bolinha.style.backgroundColor = '#22c55e';
        bolinha.style.boxShadow = '0 0 8px rgba(34, 197, 94, 0.8)';
        badge.style.borderColor = '#22c55e';
    } else {
        texto.textContent = 'FECHADO AGORA';
        bolinha.style.backgroundColor = '#ef4444';
        bolinha.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.8)';
        badge.style.borderColor = '#ef4444';
    }
}

BadgeAtualizarStatus();
setInterval(BadgeAtualizarStatus, 60000); // atualiza a cada 1 minuto

/* ===================== MENU HAMBÚRGUER ===================== */
// (Este é o menu de 3 traços, não tem relação com os lanches)
const btnMenu = document.getElementById('btn-menu');
const menuNav = document.getElementById('menu-nav');

btnMenu.addEventListener('click', () => {
    btnMenu.classList.toggle('ativo');
    menuNav.classList.toggle('aberto');
    const aberto = btnMenu.classList.contains('ativo');
    btnMenu.setAttribute('aria-expanded', aberto);
});

const linksMenu = menuNav.querySelectorAll('a');
linksMenu.forEach(link => {
    link.addEventListener('click', () => {
        btnMenu.classList.remove('ativo');
        menuNav.classList.remove('aberto');
        btnMenu.setAttribute('aria-expanded', 'false');
    });
});

document.addEventListener('click', (e) => {
    const clicouFora = !menuNav.contains(e.target) && !btnMenu.contains(e.target);
    if (clicouFora && menuNav.classList.contains('aberto')) {
        btnMenu.classList.remove('ativo');
        menuNav.classList.remove('aberto');
        btnMenu.setAttribute('aria-expanded', 'false');
    }
});

/* ===================== GERAR OS CARDS DE HORÁRIOS ===================== */
// Lê o objeto HORARIOS_FUNCIONAMENTO e monta um card por dia dentro da
// <div id="cards-horario">. Se um dia estiver fechado ([]), o card já
// aparece riscado com a tag "Fechado" — sem precisar editar o HTML.

// Nome exibido em cada card, na ordem Domingo → Sábado
const NOMES_DIAS_SEMANA = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado'
];

// Ícone (Font Awesome) exibido no topo de cada card — troque livremente
const ICONES_DIAS = {
    0: 'fa-mug-hot',    // Domingo
    1: 'fa-dumbbell',   // Segunda
    2: 'fa-dumbbell',   // Terça
    3: 'fa-dumbbell',   // Quarta
    4: 'fa-dumbbell',   // Quinta
    5: 'fa-dumbbell',   // Sexta
    6: 'fa-sun'         // Sábado
};

/**
 * Monta os 7 cards de horários dentro de #cards-horario.
 * Roda uma única vez ao carregar a página. Se HORARIOS_FUNCIONAMENTO
 * for alterado em runtime, basta chamar gerarCardsHorarios() de novo.
 */
function gerarCardsHorarios() {
    const container = document.getElementById('cards-horario');
    if (!container) return;

    // Limpa antes de gerar (importante caso seja chamada mais de uma vez)
    container.innerHTML = '';

    // Ordem fixa: Domingo (0) → Sábado (6)
    for (let dia = 0; dia < 7; dia++) {
        const periodos = HORARIOS_FUNCIONAMENTO[dia] || [];
        const fechado = periodos.length === 0;

        // ----- Cria o card -----
        const card = document.createElement('div');
        card.className = 'card-horario' + (fechado ? ' fechado' : '');
        card.dataset.dia = dia; // usado pelo cronômetro para marcar o dia atual

        // Ícone grande no topo
        const icone = document.createElement('div');
        icone.className = 'horario-icone';
        icone.innerHTML = `<i class="fa-solid ${ICONES_DIAS[dia] || 'fa-clock'}"></i>`;
        card.appendChild(icone);

        // Nome do dia (título do card)
        const titulo = document.createElement('h3');
        titulo.textContent = NOMES_DIAS_SEMANA[dia];
        card.appendChild(titulo);

        // ----- Linhas de horário -----
        if (fechado) {
            // Um único aviso de fechado
            const linha = document.createElement('p');
            linha.className = 'horario-linha';
            linha.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Fechado';
            card.appendChild(linha);
        } else {
            // Uma linha por período (ex: 19:00 — 04:00)
            periodos.forEach(p => {
                const linha = document.createElement('p');
                linha.className = 'horario-linha';
                linha.innerHTML = `<i class="fa-regular fa-clock"></i> ${p.abre} — ${p.fecha}`;
                card.appendChild(linha);
            });
        }

        // ----- Tag de status (Aberto / Fechado) -----
        const tag = document.createElement('span');
        tag.className = 'horario-tag ' + (fechado ? 'folga' : 'aberto');
        tag.textContent = fechado ? 'Fechado' : 'Aberto';
        card.appendChild(tag);

        container.appendChild(card);
    }
}

// Gera os cards assim que a página abre
gerarCardsHorarios();

/* ===================== CRONÔMETRO DA SEÇÃO HORÁRIOS ===================== */
function atualizarCronometroHorarios() {
    const status = obterStatus();
    const cronometroEl = document.getElementById('cronometro');
    const textoEl = document.getElementById('cronometro-texto');
    const cardEl = document.getElementById('horario-status-card');

    if (cronometroEl && status.proximoEvento) {
        const agora = new Date();
        const diffSegundos = Math.max(0, Math.floor((status.proximoEvento - agora) / 1000));
        cronometroEl.textContent = formatarCronometro(diffSegundos);
    }
    if (textoEl) {
        textoEl.innerHTML = status.mensagem;
    }
    if (cardEl) {
        cardEl.classList.toggle('fechado', !status.aberto);
    }

    // Marca o dia atual nos cards (adiciona a classe "hoje")
    const diaAtual = new Date().getDay();
    document.querySelectorAll('[data-dia]').forEach(item => {
        const dias = item.dataset.dia.split(',').map(Number);
        item.classList.toggle('hoje', dias.includes(diaAtual)); // ✅ corrigido: "item"
    });
}

// Atualiza imediatamente e depois a cada segundo
atualizarCronometroHorarios();
setInterval(atualizarCronometroHorarios, 1000);

// Recalcula os intervalos se a configuração for alterada em tempo de execução
// (útil para desenvolvimento, mas não necessário em produção)
// Se você alterar HORARIOS_FUNCIONAMENTO no console, chame:
// INTERVALOS_ABSOLUTOS = gerarIntervalosAbsolutos();