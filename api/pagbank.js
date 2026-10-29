// api/pagbank.js
export const config = { runtime: 'edge' };

export default async function handler(request) {
    // Apenas requisições POST são permitidas
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Método não permitido' }), { status: 405 });
    }

    try {
        const body = await request.json();
        const { action, payload } = body;

        const PAGBANK_TOKEN = process.env.PAGBANK_TOKEN;
        if (!PAGBANK_TOKEN) {
            return new Response(JSON.stringify({ error: 'Token do PagBank não configurado' }), { status: 500 });
        }

        const headers = {
            'Authorization': `Bearer ${PAGBANK_TOKEN}`, //trocar no vercel pelo pagbank do cliente
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // URLs da API do PagBank (use sandbox.api.pagseguro.com para testes)
        const baseUrl = 'https://api.pagseguro.com'; 

        let url = '';
        let method = 'POST';

        switch (action) {
            case 'criar_pedido_pix':
                // Cria um pedido com QR Code PIX
                url = `${baseUrl}/orders`;
                break;
            case 'criar_checkout_cartao':
                // Cria um checkout para cartão (redirecionamento)
                url = `${baseUrl}/checkouts`;
                break;
            default:
                return new Response(JSON.stringify({ error: 'Ação inválida' }), { status: 400 });
        }

        const response = await fetch(url, {
            method,
            headers,
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        return new Response(JSON.stringify(data), {
            status: response.status,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: 'Erro interno no servidor' }), { status: 500 });
    }
}