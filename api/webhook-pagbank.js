// api/webhook-pagbank.js
export const config = { runtime: 'edge' };

export default async function handler(request) {
    if (request.method !== 'POST') {
        return new Response('Método não permitido', { status: 405 });
    }

    try {
        const body = await request.json();
        console.log('Webhook recebido:', body);

        // O PagBank envia o status da transação
        // Exemplo: { id: 'ORDE_...', status: 'PAID', ... }
        if (body.status === 'PAID') {
            const orderId = body.id;
            // Aqui você pode atualizar o status do pedido no Supabase
            // Exemplo:
            // await supabase.from('pedidos_recentes').update({ status: 'pago' }).eq('pagbank_order_id', orderId);
            console.log(`Pedido ${orderId} pago com sucesso!`);
        }

        return new Response('OK', { status: 200 });
    } catch (error) {
        return new Response('Erro no webhook', { status: 500 });
    }
}