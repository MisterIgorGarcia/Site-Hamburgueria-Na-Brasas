// script/taxa-entrega.js
// Módulo compartilhado de cálculo de taxa de entrega por bairro.
// Carregar ANTES de pedidos.js e admin-dashboard.js.
(function (global) {
  'use strict';

  const CACHE_KEY = 'na_brasas_taxas_entrega_v1';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

  function normalizarBairro(texto) {
    if (texto == null) return '';
    return String(texto)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function buscarTaxas(supabase, { force = false } = {}) {
    if (!force) {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Date.now() - parsed.ts < CACHE_TTL_MS) {
            return parsed.data;
          }
        }
      } catch (_) { /* ignore */ }
    }

    const { data, error } = await supabase
      .from('taxas_entrega')
      .select('bairro, bairro_normalizado, taxa')
      .eq('ativo', true);

    if (error) throw error;
    const lista = data || [];

    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ts: Date.now(), data: lista })
      );
    } catch (_) { /* ignore */ }

    return lista;
  }

  function encontrarTaxa(bairroDigitado, taxas) {
    const alvo = normalizarBairro(bairroDigitado);
    if (!alvo || !Array.isArray(taxas)) return null;

    // 1) Match exato
    for (const t of taxas) {
      if (t.bairro_normalizado === alvo) return t;
    }

    // 2) Match parcial (contém um ao outro) — ajuda quando ViaCEP retorna "Jardim América" e a tabela tem "Jd América"
    for (const t of taxas) {
      const n = t.bairro_normalizado;
      if (!n) continue;
      if (alvo.includes(n) || n.includes(alvo)) return t;
    }

    return null;
  }

  function formatarBRL(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function limparCache() {
    try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
  }

  global.TaxaEntrega = {
    normalizarBairro,
    buscarTaxas,
    encontrarTaxa,
    formatarBRL,
    limparCache
  };
})(window);