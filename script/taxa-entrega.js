// script/taxa-entrega.js
// Módulo compartilhado de cálculo de taxa de entrega por bairro.
(function (global) {
  'use strict';

  // Cache apenas em memória (reseta ao recarregar a página)
  let cacheMemoria = null;

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
    // Se já buscou nesta sessão e não pediu para forçar, retorna o da memória
    if (!force && cacheMemoria) {
      return cacheMemoria;
    }

    const { data, error } = await supabase
      .from('taxas_entrega')
      .select('bairro, bairro_normalizado, taxa')
      .eq('ativo', true);

    if (error) throw error;
    
    cacheMemoria = data || [];
    return cacheMemoria;
  }

  function encontrarTaxa(bairroDigitado, taxas) {
    const alvo = normalizarBairro(bairroDigitado);
    if (!alvo || !Array.isArray(taxas)) return null;

    // 1) Match exato
    for (const t of taxas) {
      if (t.bairro_normalizado === alvo) return t;
    }

    // 2) Match parcial (contém um ao outro)
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
    cacheMemoria = null;
  }

  global.TaxaEntrega = {
    normalizarBairro,
    buscarTaxas,
    encontrarTaxa,
    formatarBRL,
    limparCache
  };
})(window);