// ════════════════════════════════════════════════════════════════
// CLIENTE SERVICE — CRUD + helpers de consulta
// Wrapper do firebase.js — não acessa Firestore diretamente.
// ════════════════════════════════════════════════════════════════
import {
  getClientes,
  getCliente   as fbGetCliente,
  addCliente,
  updateCliente,
  deleteCliente,
}  from './firebase';

// ════════════════════════════════════════════════════════════════
// EXPORT: getTodosClientes
// Retorna todos os clientes ordenados por nome.
// Usa cache interno do firebase.js (TTL 5min).
// ════════════════════════════════════════════════════════════════
export async function getTodosClientes() {
  try {
    const lista = await getClientes();
    return (lista || []).sort((a, b) =>
      (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
    );
  } catch (e) {
    console.log('[clienteService] getTodosClientes:', e);
    return [];
  }
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getCliente
// Retorna um cliente por id.
// ════════════════════════════════════════════════════════════════
export async function getCliente(id) {
  try {
    return await fbGetCliente(id);
  } catch (e) {
    console.log('[clienteService] getCliente:', e);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
// EXPORT: salvarCliente
// Cria (id=null) ou atualiza (id existe) um cliente.
// Campos esperados: nome, tipo, status, cidade, telefone1,
//   telefone2, email, cnpj, endereco, latitude, longitude,
//   observacoes, lembrete, proximaVisita, fornecedores{}
// ════════════════════════════════════════════════════════════════
export async function salvarCliente(dados, id = null) {
  try {
    const payload = {
      nome         : (dados.nome         || '').trim(),
      tipo         : dados.tipo          || 'loja',
      status       : dados.status        || 'ativo',
      cidade       : (dados.cidade       || '').trim(),
      telefone1    : (dados.telefone1    || '').trim(),
      telefone2    : (dados.telefone2    || '').trim(),
      email        : (dados.email        || '').trim(),
      cnpj         : (dados.cnpj         || '').trim(),
      endereco     : (dados.endereco     || '').trim(),
      latitude     : dados.latitude      || null,
      longitude    : dados.longitude     || null,
      observacoes  : (dados.observacoes  || '').trim(),
      lembrete     : (dados.lembrete     || '').trim(),
      proximaVisita: dados.proximaVisita || '',
      fornecedores : dados.fornecedores  || {},
    };
    if (id) {
      await updateCliente(id, payload);
      return id;
    }
    return await addCliente(payload);
  } catch (e) {
    console.log('[clienteService] salvarCliente:', e);
    throw e;
  }
}

// ════════════════════════════════════════════════════════════════
// EXPORT: removerCliente
// Exclui um cliente pelo id.
// ════════════════════════════════════════════════════════════════
export async function removerCliente(id) {
  try {
    await deleteCliente(id);
  } catch (e) {
    console.log('[clienteService] removerCliente:', e);
    throw e;
  }
}

// ════════════════════════════════════════════════════════════════
// EXPORT: excluirCliente
// Alias de removerCliente — mantido para compatibilidade com
// telas que já importavam este nome.
// ════════════════════════════════════════════════════════════════
export async function excluirCliente(id) {
  return removerCliente(id);
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getClientesPorCidade
// Retorna clientes de uma cidade específica (busca exata).
// ════════════════════════════════════════════════════════════════
export async function getClientesPorCidade(cidade) {
  try {
    const todos = await getTodosClientes();
    return todos.filter(c =>
      (c.cidade || '').toLowerCase() === (cidade || '').toLowerCase()
    );
  } catch (e) {
    console.log('[clienteService] getClientesPorCidade:', e);
    return [];
  }
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getClientesAtivos
// Retorna apenas clientes com status 'ativo'.
// ════════════════════════════════════════════════════════════════
export async function getClientesAtivos() {
  try {
    const todos = await getTodosClientes();
    return todos.filter(c => (c.status || 'ativo') === 'ativo');
  } catch (e) {
    console.log('[clienteService] getClientesAtivos:', e);
    return [];
  }
}