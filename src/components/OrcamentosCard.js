// components/OrcamentosCard.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { Icon } from 'react-native-elements';
import {
  getOrcamentosCliente,
  atualizarStatusOrcamento,
  excluirOrcamento,
} from '../services/orcamentoService';
import OrcamentoModal from './OrcamentoModal';

const GOLD         = '#E8B432';
const SILVER       = '#C0D2E6';
const SILVER_LIGHT = '#E8EEF5';
const SILVER_DARK  = '#8A9BB0';
const DARK_BG      = '#001E2E';
const CARD_BG      = '#002840';
const CARD_BG2     = '#003352';
const SUCCESS      = '#4CAF50';
const DANGER       = '#EF5350';
const WARN         = '#FF9800';
const BLUE         = '#5BA3D0';

const STATUS_CONFIG = {
  aguardando: { label: 'Aguardando', cor: WARN,    icon: 'hourglass-empty', emoji: '⏳' },
  aprovado  : { label: 'Aprovado',   cor: SUCCESS, icon: 'check-circle',    emoji: '✅' },
  perdido   : { label: 'Perdido',    cor: DANGER,  icon: 'cancel',          emoji: '❌' },
};

const PRODUTO_LABEL = {
  caixas  : 'Caixas',
  tubos   : 'Tubos',
  conexoes: 'Conexões',
  telhas  : 'Telhas',
  vasos   : 'Vasos',
  metais  : 'Metais',
  tintas  : 'Tintas',
};

function formatReal(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function formatarData(iso) {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function diasRestantes(dataRetorno) {
  if (!dataRetorno) return null;
  const hoje  = new Date(); hoje.setHours(0, 0, 0, 0);
  const ret   = new Date(dataRetorno); ret.setHours(0, 0, 0, 0);
  return Math.floor((ret - hoje) / 86400000);
}

// ── Item de orçamento ────────────────────────────────────────────
function OrcamentoItem({ orc, onEditar, onExcluir, onMudarStatus }) {
  const cfg    = STATUS_CONFIG[orc.status] || STATUS_CONFIG.aguardando;
  const dias   = diasRestantes(orc.dataRetorno);
  const vencido = dias !== null && dias < 0 && orc.status === 'aguardando';
  const hoje    = dias === 0 && orc.status === 'aguardando';

  return (
    <View style={[oi.card, vencido && { borderColor: DANGER + '55' }, hoje && { borderColor: WARN + '55' }]}>

      {/* Linha superior */}
      <View style={oi.topRow}>
        <View style={[oi.statusDot, { backgroundColor: cfg.cor }]} />
        <Text style={oi.dataOrc}>{formatarData(orc.dataOrcamento)}</Text>
        <View style={{ flex: 1 }} />
        <Text style={[oi.valorTxt, { color: orc.status === 'perdido' ? SILVER_DARK : GOLD }]}>
          R$ {formatReal(orc.valor)}
        </Text>
      </View>

      {/* Produtos */}
      <Text style={oi.produtos} numberOfLines={1}>
        📦 {orc.produtos.map(p => PRODUTO_LABEL[p] || p).join(' · ') || 'Sem produtos'}
      </Text>

      {/* Status + retorno */}
      <View style={oi.midRow}>
        <View style={[oi.statusBadge, { backgroundColor: cfg.cor + '18', borderColor: cfg.cor + '40' }]}>
          <Icon name={cfg.icon} size={10} color={cfg.cor} type="material" />
          <Text style={[oi.statusBadgeTxt, { color: cfg.cor }]}>{cfg.label}</Text>
        </View>

        {orc.dataRetorno && orc.status === 'aguardando' && (
          <View style={[
            oi.retornoBadge,
            vencido && { backgroundColor: DANGER + '18', borderColor: DANGER + '40' },
            hoje    && { backgroundColor: WARN + '18',   borderColor: WARN + '40'   },
          ]}>
            <Icon
              name="event"
              size={10}
              color={vencido ? DANGER : hoje ? WARN : SILVER_DARK}
              type="material" />
            <Text style={[
              oi.retornoBadgeTxt,
              vencido && { color: DANGER },
              hoje    && { color: WARN   },
            ]}>
              {vencido
                ? `Vencido há ${Math.abs(dias)}d`
                : hoje
                  ? 'Retorno HOJE'
                  : `Retorno em ${dias}d`}
            </Text>
          </View>
        )}
      </View>

      {/* Observação */}
      {!!orc.observacao && (
        <Text style={oi.obs} numberOfLines={2}>💬 {orc.observacao}</Text>
      )}

      {/* Ações */}
      <View style={oi.acoesRow}>
        {orc.status === 'aguardando' && (
          <>
            <TouchableOpacity
              style={[oi.acaoBtn, { backgroundColor: SUCCESS + '18', borderColor: SUCCESS + '40' }]}
              onPress={() => onMudarStatus(orc.id, 'aprovado')}
              activeOpacity={0.8}>
              <Icon name="check" size={12} color={SUCCESS} type="material" />
              <Text style={[oi.acaoBtnTxt, { color: SUCCESS }]}>Aprovado</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[oi.acaoBtn, { backgroundColor: DANGER + '18', borderColor: DANGER + '40' }]}
              onPress={() => onMudarStatus(orc.id, 'perdido')}
              activeOpacity={0.8}>
              <Icon name="close" size={12} color={DANGER} type="material" />
              <Text style={[oi.acaoBtnTxt, { color: DANGER }]}>Perdido</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity
          style={[oi.acaoBtn, { backgroundColor: BLUE + '18', borderColor: BLUE + '40' }]}
          onPress={() => onEditar(orc)}
          activeOpacity={0.8}>
          <Icon name="edit" size={12} color={BLUE} type="material" />
          <Text style={[oi.acaoBtnTxt, { color: BLUE }]}>Editar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[oi.acaoBtn, { backgroundColor: DANGER + '10', borderColor: DANGER + '20' }]}
          onPress={() => onExcluir(orc.id)}
          activeOpacity={0.8}>
          <Icon name="delete-outline" size={12} color={DANGER + 'AA'} type="material" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const oi = StyleSheet.create({
  card           : { backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, borderColor: SILVER + '18', padding: 13, marginBottom: 8 },
  topRow         : { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  statusDot      : { width: 8, height: 8, borderRadius: 4 },
  dataOrc        : { fontSize: 11, color: SILVER_DARK, fontWeight: '600' },
  valorTxt       : { fontSize: 15, fontWeight: '900' },
  produtos       : { fontSize: 12, color: SILVER, marginBottom: 7, fontWeight: '600' },
  midRow         : { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  statusBadge    : { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  statusBadgeTxt : { fontSize: 9, fontWeight: '800' },
  retornoBadge   : { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, backgroundColor: CARD_BG2, borderColor: SILVER + '25' },
  retornoBadgeTxt: { fontSize: 9, fontWeight: '700', color: SILVER_DARK },
  obs            : { fontSize: 11, color: SILVER_DARK, fontStyle: 'italic', marginBottom: 7, lineHeight: 15 },
  acoesRow       : { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  acaoBtn        : { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9, borderWidth: 1 },
  acaoBtnTxt     : { fontSize: 10, fontWeight: '700' },
});

// ════════════════════════════════════════════════════════════════
// CARD PRINCIPAL EXPORTADO
// ════════════════════════════════════════════════════════════════
export default function OrcamentosCard({ cliente, onAlertaContador }) {
  const [orcamentos,    setOrcamentos]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [modalVisible,  setModalVisible]  = useState(false);
  const [orcEditando,   setOrcEditando]   = useState(null);
  const [expandido,     setExpandido]     = useState(true);
  const [filtroStatus,  setFiltroStatus]  = useState('todos');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const lista = await getOrcamentosCliente(cliente.id);
      setOrcamentos(lista);
      // Informa o Dashboard quantos precisam de follow-up
      const pendentes = lista.filter(o => o.status === 'aguardando').length;
      onAlertaContador?.(pendentes);
    } catch (e) {
      console.log('[OrcamentosCard]', e);
    } finally {
      setLoading(false);
    }
  }, [cliente.id]);

  useEffect(() => { carregar(); }, []);

  const mudarStatus = (id, novoStatus) => {
    const labelMap = { aprovado: 'APROVADO ✅', perdido: 'PERDIDO ❌' };
    Alert.alert(
      'Confirmar',
      `Marcar como ${labelMap[novoStatus]}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            await atualizarStatusOrcamento(id, novoStatus);
            carregar();
          },
        },
      ]
    );
  };

  const excluir = (id) => {
    Alert.alert(
      'Excluir orçamento',
      'Tem certeza? Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            await excluirOrcamento(id);
            carregar();
          },
        },
      ]
    );
  };

  const abrirNovo = () => {
    setOrcEditando(null);
    setModalVisible(true);
  };

  const abrirEditar = (orc) => {
    setOrcEditando(orc);
    setModalVisible(true);
  };

  // Filtro
  const filtrados = filtroStatus === 'todos'
    ? orcamentos
    : orcamentos.filter(o => o.status === filtroStatus);

  const aguardando = orcamentos.filter(o => o.status === 'aguardando').length;
  const aprovados  = orcamentos.filter(o => o.status === 'aprovado').length;
  const perdidos   = orcamentos.filter(o => o.status === 'perdido').length;
  const totalValor = orcamentos
    .filter(o => o.status === 'aprovado')
    .reduce((s, o) => s + o.valor, 0);

  return (
    <View style={oc.container}>

      {/* ── Cabeçalho ── */}
      <TouchableOpacity
        style={oc.header}
        onPress={() => setExpandido(e => !e)}
        activeOpacity={0.85}>
        <View style={oc.headerIconWrap}>
          <Icon name="request-quote" size={16} color={DARK_BG} type="material" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={oc.headerTitulo}>Orçamentos</Text>
          <Text style={oc.headerSub}>
            {`${orcamentos.length} total${aguardando > 0 ? ` · ${aguardando} aguardando` : ''}`}
          </Text>
        </View>
        {aguardando > 0 && (
          <View style={oc.alertaBadge}>
            <Icon name="notifications-active" size={10} color={DARK_BG} type="material" />
            <Text style={oc.alertaBadgeTxt}>{aguardando}</Text>
          </View>
        )}
        <TouchableOpacity
          style={oc.novoBtn}
          onPress={abrirNovo}
          activeOpacity={0.85}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="add" size={14} color={DARK_BG} type="material" />
          <Text style={oc.novoBtnTxt}>Novo</Text>
        </TouchableOpacity>
        <Icon
          name={expandido ? 'expand-less' : 'expand-more'}
          size={20}
          color={GOLD}
          type="material" />
      </TouchableOpacity>

      {expandido && (
        <View style={oc.body}>

          {/* KPIs resumo */}
          {orcamentos.length > 0 && (
            <View style={oc.kpisRow}>
              <View style={[oc.kpi, { borderColor: WARN + '40' }]}>
                <Text style={[oc.kpiValor, { color: WARN }]}>{aguardando}</Text>
                <Text style={oc.kpiLabel}>Aguardando</Text>
              </View>
              <View style={[oc.kpi, { borderColor: SUCCESS + '40' }]}>
                <Text style={[oc.kpiValor, { color: SUCCESS }]}>{aprovados}</Text>
                <Text style={oc.kpiLabel}>Aprovados</Text>
              </View>
              <View style={[oc.kpi, { borderColor: DANGER + '40' }]}>
                <Text style={[oc.kpiValor, { color: DANGER }]}>{perdidos}</Text>
                <Text style={oc.kpiLabel}>Perdidos</Text>
              </View>
              {totalValor > 0 && (
                <View style={[oc.kpi, { borderColor: GOLD + '40' }]}>
                  <Text style={[oc.kpiValor, { color: GOLD, fontSize: 13 }]}>
                    {totalValor >= 1000
                      ? `R$${(totalValor / 1000).toFixed(1)}k`
                      : `R$${Number(totalValor).toFixed(0)}`}
                  </Text>
                  <Text style={oc.kpiLabel}>Aprovado $</Text>
                </View>
              )}
            </View>
          )}

          {/* Filtro de status */}
          {orcamentos.length > 1 && (
            <View style={oc.filtroRow}>
              {[
                { key: 'todos',     label: 'Todos'      },
                { key: 'aguardando',label: '⏳ Aguard.' },
                { key: 'aprovado',  label: '✅ Aprov.'  },
                { key: 'perdido',   label: '❌ Perd.'   },
              ].map(f => (
                <TouchableOpacity
                  key={f.key}
                  style={[oc.filtroChip, filtroStatus === f.key && oc.filtroChipAtivo]}
                  onPress={() => setFiltroStatus(f.key)}
                  activeOpacity={0.8}>
                  <Text style={[oc.filtroChipTxt, filtroStatus === f.key && { color: GOLD }]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Lista */}
          {loading ? (
            <ActivityIndicator color={GOLD} style={{ paddingVertical: 20 }} />
          ) : filtrados.length === 0 ? (
            <View style={oc.emptyWrap}>
              <Text style={oc.emptyEmoji}>📋</Text>
              <Text style={oc.emptyTxt}>
                {orcamentos.length === 0
                  ? 'Nenhum orçamento ainda.\nToque em + Novo para criar.'
                  : 'Nenhum orçamento neste filtro.'}
              </Text>
            </View>
          ) : (
            filtrados.map(orc => (
              <OrcamentoItem
                key={orc.id}
                orc={orc}
                onEditar={abrirEditar}
                onExcluir={excluir}
                onMudarStatus={mudarStatus}
              />
            ))
          )}
        </View>
      )}

      {/* Modal */}
      <OrcamentoModal
        visible={modalVisible}
        cliente={cliente}
        orcamento={orcEditando}
        onClose={() => setModalVisible(false)}
        onSaved={() => { setModalVisible(false); carregar(); }}
      />
    </View>
  );
}

const oc = StyleSheet.create({
  container       : { marginHorizontal: 16, marginBottom: 16, backgroundColor: CARD_BG, borderRadius: 18, borderWidth: 1, borderColor: GOLD + '30', overflow: 'hidden' },
  header          : { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: GOLD + '10' },
  headerIconWrap  : { width: 36, height: 36, borderRadius: 11, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center' },
  headerTitulo    : { fontSize: 14, fontWeight: '800', color: SILVER_LIGHT },
  headerSub       : { fontSize: 10, color: SILVER_DARK, marginTop: 1 },
  alertaBadge     : { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: WARN, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  alertaBadgeTxt  : { fontSize: 11, fontWeight: '900', color: DARK_BG },
  novoBtn         : { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GOLD, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  novoBtnTxt      : { fontSize: 11, fontWeight: '800', color: DARK_BG },
  body            : { padding: 14 },
  kpisRow         : { flexDirection: 'row', gap: 6, marginBottom: 12 },
  kpi             : { flex: 1, alignItems: 'center', gap: 2, backgroundColor: CARD_BG2, borderRadius: 12, padding: 8, borderWidth: 1 },
  kpiValor        : { fontSize: 18, fontWeight: '900' },
  kpiLabel        : { fontSize: 8, color: SILVER_DARK, fontWeight: '700', textAlign: 'center' },
  filtroRow       : { flexDirection: 'row', gap: 6, marginBottom: 12 },
  filtroChip      : { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: CARD_BG2, borderWidth: 1, borderColor: SILVER + '18' },
  filtroChipAtivo : { backgroundColor: GOLD + '18', borderColor: GOLD + '50' },
  filtroChipTxt   : { fontSize: 10, fontWeight: '700', color: SILVER_DARK },
  emptyWrap       : { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyEmoji      : { fontSize: 36 },
  emptyTxt        : { fontSize: 12, color: SILVER_DARK, textAlign: 'center', lineHeight: 18 },
});
