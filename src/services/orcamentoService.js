// services/orcamentoService.js
// ════════════════════════════════════════════════════════════════
// ORÇAMENTO SERVICE — CRUD + Follow-up automático
//
// Exportações:
//   criarOrcamento()
//   getTodosOrcamentos()
//   getOrcamentosCliente()
//   getOrcamentosPendentes()
//   getOrcamentosParaFollowup()   ← calcula urgência de follow-up
//   atualizarStatusOrcamento()
//   excluirOrcamento()
// ════════════════════════════════════════════════════════════════
import {
  getTodosOrcamentos as fbGetTodos,
  getOrcamentosDoCliente,
  addOrcamento,
  updateOrcamento,
  deleteOrcamento as fbDelete,
}  from './firebase';

// ════════════════════════════════════════════════════════════════
// EXPORT: criarOrcamento
// Persiste um novo orçamento no Firestore.
// @param dados — { clienteId, clienteNome, valor, produtos[], observacao, dataOrcamento, dataFollowup, representada }
// ════════════════════════════════════════════════════════════════
export async function criarOrcamento(dados) {
  const agora = new Date().toISOString().substring(0, 10);
  return addOrcamento({
    ...dados,
    status       : 'aguardando',
    dataOrcamento: dados.dataOrcamento || agora,
  });
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getTodosOrcamentos
// Retorna todos os orçamentos ordenados por data de criação desc.
// ════════════════════════════════════════════════════════════════
export async function getTodosOrcamentos() {
  return fbGetTodos();
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getOrcamentosCliente
// Retorna orçamentos de um cliente específico.
// ════════════════════════════════════════════════════════════════
export async function getOrcamentosCliente(clienteId) {
  return getOrcamentosDoCliente(clienteId);
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getOrcamentosPendentes
// Filtra orçamentos com status 'aguardando' de uma lista já carregada.
// Útil para calcular KPIs sem nova query ao Firestore.
//
// @param lista — array de orçamentos já carregados
// @returns array filtrado
// ════════════════════════════════════════════════════════════════
export function getOrcamentosPendentes(lista = []) {
  return lista.filter(o => o.status === 'aguardando' || o.status === 'pendente');
}

// ════════════════════════════════════════════════════════════════
// EXPORT: getOrcamentosParaFollowup
// Calcula a urgência de follow-up para cada orçamento aguardando retorno.
// Opera sobre uma lista já carregada (sem nova query).
//
// Lógica:
//   - Usa dataRetorno OU dataFollowup como data de referência
//   - Se a data já passou → urgencia = 'atrasado'
//   - Se é hoje          → urgencia = 'hoje'
//   - Se é nos próximos 3 dias → urgencia = 'breve'
//   - Caso contrário     → urgencia = 'ok'
//
// @param lista — array de orçamentos já carregados
// @returns Array com campo 'urgencia' e 'diasAtraso' adicionados,
//          ordenado: atrasado → hoje → breve → ok
// ════════════════════════════════════════════════════════════════
export function getOrcamentosParaFollowup(lista = []) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  const comUrgencia = lista
    .filter(o => o.status === 'aguardando' || o.status === 'pendente')
    .map(o => {
      // Usa dataRetorno ou dataFollowup como data de referência
      const dataRef = o.dataRetorno || o.dataFollowup || null;

      if (!dataRef) {
        // Sem data de retorno definida — verifica pelo tempo de envio
        const diasEnviado = o.dataOrcamento
          ? Math.floor((Date.now() - new Date(o.dataOrcamento).getTime()) / 86400000)
          : null;

        // Acima de 7 dias sem retorno → breve
        const urgencia = diasEnviado !== null && diasEnviado >= 7 ? 'breve' : 'ok';
        return { ...o, urgencia, diasAtraso: 0 };
      }

      const dataRetorno = new Date(dataRef); dataRetorno.setHours(0, 0, 0, 0);
      const diffDias    = Math.floor((dataRetorno.getTime() - hoje.getTime()) / 86400000);

      let urgencia;
      if (diffDias < 0)      urgencia = 'atrasado';
      else if (diffDias === 0) urgencia = 'hoje';
      else if (diffDias <= 3) urgencia = 'breve';
      else                   urgencia = 'ok';

      return {
        ...o,
        urgencia,
        diasAtraso: diffDias < 0 ? Math.abs(diffDias) : 0,
      };
    });

  // Ordena: atrasado > hoje > breve > ok
  const ordemUrgencia = { atrasado: 0, hoje: 1, breve: 2, ok: 3 };
  return comUrgencia.sort((a, b) =>
    (ordemUrgencia[a.urgencia] ?? 3) - (ordemUrgencia[b.urgencia] ?? 3)
  );
}

// ════════════════════════════════════════════════════════════════
// EXPORT: atualizarStatusOrcamento
// Atualiza o status de um orçamento: 'aguardando' | 'aprovado' | 'perdido'
// ════════════════════════════════════════════════════════════════
export async function atualizarStatusOrcamento(id, status) {
  const atualizacao = { status };
  if (status === 'aprovado') atualizacao.dataAprovacao = new Date().toISOString();
  if (status === 'perdido')  atualizacao.dataPerda     = new Date().toISOString();
  return updateOrcamento(id, atualizacao);
}

// ════════════════════════════════════════════════════════════════
// EXPORT: excluirOrcamento
// ════════════════════════════════════════════════════════════════
export async function excluirOrcamento(id) {
  return fbDelete(id);
}