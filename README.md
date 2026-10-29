# 🍔 Na Brasas Hamburgueria

<div align="center">

![Status](https://img.shields.io/badge/status-conclu%C3%ADdo-brightgreen?style=for-the-badge)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)
![GitHub repo size](https://img.shields.io/github/repo-size/MisterIgorGarcia/Site-Hamburgueria-Na-Brasas?style=for-the-badge)
![GitHub last commit](https://img.shields.io/github/last-commit/MisterIgorGarcia/Site-Hamburgueria-Na-Brasas?style=for-the-badge)

**Site institucional e sistema de pedidos para a hamburgueria Na Brasas, localizada em Cruzeiro - SP.**

[🌐 Visite o site](https://nabrasas-hamburgueria.vercel.app/) · [📂 Repositório](https://github.com/MisterIgorGarcia/Site-Hamburgueria-Na-Brasas) · [🐛 Reportar um problema](https://github.com/MisterIgorGarcia/Site-Hamburgueria-Na-Brasas/issues)

</div>

---

## 📖 Sobre o Projeto

A **Na Brasas** é uma hamburgueria artesanal que une sabor de verdade e ambiente acolhedor. Este projeto começou como um site institucional, mas evoluiu para um **Sistema Completo de Pedidos (PDV)**. 

Agora, o cliente pode montar seu carrinho, escolher adicionais, informar o endereço (com busca automática por CEP) e escolher a forma de pagamento. Do outro lado, a hamburgueria conta com um **Painel Administrativo em Tempo Real** e um **Painel para Funcionários**, que recebem os pedidos instantaneamente e os imprimem em uma impressora térmica via Bluetooth ou USB.

O projeto foi construído com **HTML, CSS e JavaScript puros**, utilizando o **Supabase** como banco de dados e autenticação, garantindo leveza, performance e comunicação em tempo real.

---

## ✨ Funcionalidades

### 🛒 Para o Cliente
- **Cardápio Digital Dinâmico:** Lanches, Bebidas e Doces são puxados diretamente do banco de dados, permitindo alteração de preços e produtos sem mexer no código.
- **Carrinho Inteligente:** Adição de itens, cálculo de total em tempo real e seleção de **Adicionais** (Bacon, Cheddar, etc.) com atualização de preço automática.
- **Checkout Completo:** Captura de Nome, WhatsApp e Endereço.
- **Busca por CEP e Reversa:** Integração com a API do ViaCEP para autocompletar o endereço ao digitar o CEP, ou buscar o CEP ao digitar a rua.
- **Sistema de Pagamento:** Opção de pagar na entrega (Dinheiro com cálculo de troco, Cartão de Débito/Crédito ou PIX) ou pagamento antecipado.
- **Design Responsivo:** Layout adaptável, com foco em uma experiência fluida no celular.

### 🛡️ Para o Administrador
- **Login Seguro:** Acesso restrito via banco de dados (Supabase) com separação de cargos (Admin e Funcionário).
- **Notificações em Tempo Real:** Aviso visual (bolinha vermelha) e sonoro (via WebSocket) sempre que um novo pedido chega.
- **Gestão de Pedidos:** Visualização de Delivery (com mapa incorporado do endereço) e Pedidos de Mesa.
- **Criação de Pedido Manual:** Lançamento de pedidos de mesa diretamente pelo painel, com suporte a adicionais.
- **Impressão Térmica (ESC/POS):** Conexão e impressão direta em impressoras térmicas (POS-58) via Web Bluetooth ou Web USB.
- **Histórico Completo:** Arquivamento automático de pedidos, exibindo quem imprimiu, o tipo de pedido, endereço e status do pagamento.
- **Dashboard Financeiro (Google Charts):** Gráficos de faturamento diário, lanches mais vendidos (pizza) e contador de **Faturamento Total**.
- **Gestão de Funcionários:** Criação, edição e exclusão de contas de funcionários com acesso restrito.
- **Terminal de Logs:** Console interno no painel para acompanhar o status do WebSocket e falhas de conexão.

### 🖨️ Hardware e Integrações
- **Web Bluetooth & WebUSB:** Comunicação direta com a impressora térmica, com sistema de reconexão automática caso a página seja atualizada.
- **Formatação de Recibo:** O recibo impresso destaca em negrito se o pedido é de **Entrega** ou **Mesa**, imprime o endereço formatado e detalha a forma de pagamento e o troco.
- **Vercel Analytics:** Monitoramento de acessos integrado ao deploy.

---

## 🍔 Cardápio (Banco de Dados)

*O cardápio abaixo é apenas uma prévia. Todos os itens, descrições e preços são gerenciados no banco de dados (Supabase) e podem ser alterados em tempo real pelo administrador.*

| Categoria | Itens em Destaque | Preço Base |
|-----------|-------------------|------------|
| **Lanches** | Na Brasa's Soberano, Duplo, Triplo, Bacon, Frango | A partir de R$ 15,00 |
| **Bebidas** | Refrigerantes, Cervejas, Sucos, Águas, Copões | A partir de R$ 3,00 |
| **Doces** | Trufas, Bolo de pote, Picolé, Paçoca | A partir de R$ 2,00 |
| **Adicionais** | Bacon, Cheddar, Catupiry, Cebola Roxa, Frango | A partir de R$ 3,00 |

---

## 🛠️ Tecnologias Utilizadas

| Tecnologia | Descrição |
|------------|-----------|
| **HTML5 & CSS3** | Estruturação semântica, layout responsivo (Flexbox, Grid) e animações. |
| **JavaScript (Vanilla)** | Interatividade, manipulação de DOM, cálculo de horários, carrinho e lógica de impressão. |
| **Supabase** | Banco de dados PostgreSQL, Autenticação, Realtime (WebSockets) e Row Level Security (RLS). |
| **Web Bluetooth & WebUSB API** | Comunicação direta e envio de dados ESC/POS para a impressora térmica. |
| **ViaCEP API** | Busca e autocompletar de endereços e CEPs. |
| **Google Charts** | Renderização dos gráficos de pizza e linhas no painel administrativo. |
| **Font Awesome** | Biblioteca de ícones. |
| **Google Maps Embed** | Integração de mapas no site e no painel de delivery. |
| **Vercel** | Plataforma de hospedagem, deploy contínuo e Analytics. |

---

## 📁 Estrutura do Projeto

```text
Site-Hamburgueria-Na-Brasas/
├── administrador/
│   ├── administrador-dashboard.html
│   ├── funcionario-dashboard.html
│   └── login.html
├── api/ (configurações Vercel)
├── estilos/
│   ├── style.css
│   ├── styleadmin.css
│   └── stylepedido.css
├── imagens/
│   ├── logo3d.webp
│   ├── preview.jpg
│   └── lanches/ (fotos em WebP)
├── pedidos/
│   └── pedidos.html
├── script/
│   ├── admin-dashboard.js
│   ├── funcionario-dashboard.js
│   ├── impressora.js
│   ├── index.js
│   ├── login.js
│   └── pedidos.js
├── index.html
└── README.md