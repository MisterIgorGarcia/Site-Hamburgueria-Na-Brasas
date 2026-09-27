🍔 Na Brasas Hamburgueria
<div align="center">
https://img.shields.io/badge/status-conclu%C3%ADdo-brightgreen?style=for-the-badge
https://img.shields.io/badge/license-All%20Rights%20Reserved-red?style=for-the-badge
https://img.shields.io/github/repo-size/MisterIgorGarcia/Site-Na-Brasas?style=for-the-badge
https://img.shields.io/github/last-commit/MisterIgorGarcia/Site-Na-Brasas?style=for-the-badge

Site institucional para a hamburgueria Na Brasas, localizada em Cruzeiro - SP.

🌐 Visite o site · 📂 Repositório · 🐛 Reportar um problema

</div>
📖 Sobre o Projeto
A Na Brasas é uma hamburgueria artesanal que une sabor de verdade e ambiente acolhedor. Este site foi desenvolvido para apresentar a hamburgueria, seus combos, horários de funcionamento e formas de contato de maneira moderna, responsiva e atrativa.

O projeto foi construído com HTML, CSS e JavaScript puros, sem frameworks ou bibliotecas de terceiros, garantindo leveza e performance. O design utiliza uma paleta de cores escuras com detalhes em amarelo, transmitindo aconchego e sofisticação.

✨ Funcionalidades
🎨 Design Responsivo: Layout adaptável para desktop, tablet e celular.

📊 Status de Funcionamento em Tempo Real: Um componente inteligente que calcula se a hamburgueria está aberta ou fechada com base no horário atual, exibindo um cronômetro regressivo até a próxima abertura ou fechamento.

🗺️ Integração com Google Maps: Mapa incorporado mostrando a localização exata da hamburgueria.

💬 Links Diretos para Contato: Botões para WhatsApp e Instagram, facilitando a comunicação.

📱 Menu Hambúrguer: Navegação otimizada para dispositivos móveis.

🏷️ Open Graph Tags: Preview personalizado ao compartilhar o link em redes sociais e mensageiros.

⏰ Seção de Horários: Cards informativos com os horários de funcionamento de cada dia da semana, com destaque para dias fechados e para o dia atual.

🍔 Cardápio de Combos: Cards organizados por categorias (individuais, família e especiais) com botão direto para pedido via WhatsApp.

☕ Diferenciais em Destaque: Seção "Sobre" mostrando os pontos fortes da hamburgueria (café grátis, ingredientes selecionados, delivery, etc.).

🛠️ Tecnologias Utilizadas
Tecnologia	Descrição
HTML5	Estruturação semântica do conteúdo.
CSS3	Estilização, layout responsivo (Flexbox, Grid) e animações.
JavaScript	Interatividade, cálculo de horários e atualização dinâmica do status.
Font Awesome	Biblioteca de ícones para redes sociais e elementos visuais.
Google Maps Embed	Integração do mapa de localização.
Vercel	Plataforma de hospedagem e deploy contínuo.
📁 Estrutura do Projeto
text
Site-Na-Brasas/
├── index.html        # Página principal do site
├── style.css         # Estilos e layout responsivo
├── script.js         # Lógica de interatividade e status em tempo real
├── README.md         # Documentação do projeto
└── imagens/
    ├── avatar.png    # Imagem/logo da hamburgueria
    └── preview.jpg   # Imagem de preview para compartilhamento
⚙️ Como Editar os Horários de Funcionamento
Todos os horários ficam centralizados no topo do script.js, no objeto HORARIOS_FUNCIONAMENTO. Para alterar:

Abrir um dia: use [ { abre: "19:00", fecha: "04:00" } ]

Fechar um dia: use []

Múltiplos períodos no mesmo dia: adicione mais objetos no array

Exemplo:

javascript
const HORARIOS_FUNCIONAMENTO = {
    0: [ { abre: "19:00", fecha: "04:00" } ],  // Domingo
    1: [ { abre: "19:00", fecha: "04:00" } ],  // Segunda
    2: [],                                     // Terça — FECHADO
    3: [ { abre: "19:00", fecha: "04:00" } ],  // Quarta
    4: [ { abre: "19:00", fecha: "04:00" } ],  // Quinta
    5: [ { abre: "19:00", fecha: "04:00" } ],  // Sexta
    6: [ { abre: "19:00", fecha: "04:00" } ]   // Sábado
};
💡 Uma única fonte da verdade: ao alterar esse objeto, o badge de status, o cronômetro e os cards de dias se atualizam automaticamente.

📱 Contato
Endereço: R. Francisco Novaes, 707 – Centro, Cruzeiro – SP

Instagram: @nabrasashamburgueria

📄 Licença
Este projeto está sob a licença All Rights Reserved. Todos os direitos reservados à Na Brasas Hamburgueria.

<div align="center">
Feito por Igor Garcia

</div>