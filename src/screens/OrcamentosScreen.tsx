// screens/OrcamentosScreen.js
// ════════════════════════════════════════════════════════════════
// FASE 8 — FOLLOW-UP DE ORÇAMENTOS
//
// Checklist:
//   ✅ Cadastro orçamento    — OrcamentoModal + criarOrcamento()
//   ✅ Status orçamento      — OrcamentoCard, chips de filtro,
//                              ações inline Aprovado/Perdido
//   ✅ Follow-up automático  — BannerFollowup + getOrcamentosParaFollowup()
//
// FUSÃO v2 — bugs corrigidos (nada removido):
//
//   [CRASH 1] orc.produtos sem null check
//     → OrcamentoCard fazia orc.produtos.map() diretamente
//     → TypeError se produtos for undefined/null em orçamento antigo
//     CORREÇÃO: (orc.produtos || []).map(...)
//
//   [CRASH 2] mudarStatus / excluir sem try/catch no handler
//     → atualizarStatusOrcamento / excluirOrcamento dentro de Alert.alert
//       sem proteção — erro silencioso sem feedback ao usuário
//     CORREÇÃO: try/catch com Alert.alert('Erro') em ambos
//
//   [BUG 1] Sort por criadoEm retorna NaN para orçamentos sem o campo
//     → new Date(undefined) = Invalid Date → NaN → ordem instável
//     CORREÇÃO: fallback para dataOrcamento na ordenação
//
//   [BUG 2] OrcamentoCard só lia orc.dataRetorno, ignorava dataFollowup
//     → Orçamentos antigos com só dataFollowup nunca mostravam
//       badge de vencimento nem urgência visual
//     CORREÇÃO: const dataRef = orc.dataRetorno || orc.dataFollowup
//
//   [BUG 3] Filtro chip 'aguardando' não pegava status 'pendente'
//     → orcamentos.filter(o => o.status === filtro) excluía
//       orçamentos normalizados com status 'pendente'
//     CORREÇÃO: helper isOrcPendente() no filtro e nas ações
//
//   [BUG 4] STATUS_CONFIG sem entrada 'pendente' + ações inline
//     → status 'pendente' mostrava badge correto (fallback aguardando)
//       mas condição orc.status === 'aguardando' nas ações não
//       exibia botões Aprovado/Perdido para orçamentos pendentes
//     CORREÇÃO: STATUS_CONFIG['pendente'] adicionado +
//               isOrcPendente() substitui comparação direta
// ════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Animated, Alert, RefreshControl,
} from 'react-native';
import { Icon } from 'react-native-elements';
import {
  getTodosOrcamentos,
  getOrcamentosPendentes,
  getOrcamentosParaFollowup,
  atualizarStatusOrcamento,
  excluirOrcamento,
} from '../services/orcamentoService';
import OrcamentoModal from '../components/OrcamentoModal';
import { getTodasVisitas }           from '../services/visitaService';
import { getTodosClientes }          from '../services/clienteService';
import { getAlertasReposicaoGlobal } from '../services/aiService';

// ── Paleta ─────────────────────────────────────────────────────
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
const PURPLE       = '#C56BF0';

// ════════════════════════════════════════════════════════════════
// [BUG 3 + BUG 4] Helper isOrcPendente
// Normaliza 'aguardando' e 'pendente' em todo lugar onde antes
// havia comparação direta orc.status === 'aguardando'.
// Usado no: filtro de chips, ações inline do card, KPI aguardando.
// ════════════════════════════════════════════════════════════════
function isOrcPendente(o) {
  return o.status === 'aguardando' || o.status === 'pendente';
}

// ════════════════════════════════════════════════════════════════
// [BUG 4] STATUS_CONFIG com entrada 'pendente' adicionada
// Antes: status 'pendente' caia no fallback STATUS_CONFIG.aguardando
// mas a condição nas ações inline era === 'aguardando', ignorando
// orçamentos com status 'pendente'.
// Agora: entrada explícita + isOrcPendente() nas ações.
// ════════════════════════════════════════════════════════════════
const STATUS_CONFIG = {
  aguardando: { label:'Aguardando', cor:WARN,    icon:'hourglass-empty', emoji:'⏳' },
  pendente  : { label:'Aguardando', cor:WARN,    icon:'hourglass-empty', emoji:'⏳' }, // alias
  aprovado  : { label:'Aprovado',   cor:SUCCESS, icon:'check-circle',    emoji:'✅' },
  perdido   : { label:'Perdido',    cor:DANGER,  icon:'cancel',          emoji:'❌' },
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

// [BUG 2] Aceita dataRetorno OU dataFollowup
function diasRestantes(orc) {
  const dataRef = orc?.dataRetorno || orc?.dataFollowup || null;
  if (!dataRef) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const ret  = new Date(dataRef); ret.setHours(0, 0, 0, 0);
  return Math.floor((ret - hoje) / 86400000);
}

// ════════════════════════════════════════════════════════════════
// ✅ CHECKLIST: Follow-up automático — BannerFollowup
// Alimentado por getOrcamentosParaFollowup() do orcamentoService
// ════════════════════════════════════════════════════════════════
function BannerFollowup({ followups, onVerOrcamento, onMudarStatus }) {
  const [expandido, setExpandido] = useState(true);

  if (!followups?.length) return null;

  const atrasados = followups.filter(o => o.urgencia === 'atrasado');
  const hoje      = followups.filter(o => o.urgencia === 'hoje');
  const corBanner = atrasados.length > 0 ? DANGER : WARN;

  return (
    <View style={[bfu.container, { borderColor: corBanner + '40' }]}>
      <TouchableOpacity
        style={[bfu.header, { backgroundColor: corBanner + '12' }]}
        onPress={() => setExpandido(e => !e)}
        activeOpacity={0.85}>
        <Icon name="notifications-active" size={16} color={corBanner} type="material" />
        <View style={{ flex: 1 }}>
          <Text style={[bfu.titulo, { color: corBanner }]}>
            {atrasados.length > 0
              ? `⚠ ${atrasados.length} follow-up${atrasados.length > 1 ? 's' : ''} atrasado${atrasados.length > 1 ? 's' : ''}`
              : `📅 Follow-up hoje (${hoje.length})`}
          </Text>
          <Text style={bfu.sub}>
            {followups.length} orçamento{followups.length > 1 ? 's' : ''} aguardando retorno
          </Text>
        </View>
        <Icon name={expandido ? 'expand-less' : 'expand-more'} size={18} color={corBanner} type="material" />
      </TouchableOpacity>

      {expandido && (
        <View style={bfu.lista}>
          {followups.map((orc, i) => {
            const urgCor =
              orc.urgencia === 'atrasado' ? DANGER :
              orc.urgencia === 'hoje'     ? WARN   : BLUE;

            // [BUG 2] diasAtraso calculado com dataRetorno || dataFollowup
            const diasAtr = orc.diasAtraso ?? Math.abs(diasRestantes(orc) ?? 0);
            const urgLabel =
              orc.urgencia === 'atrasado' ? `${diasAtr}d atrasado`
              : orc.urgencia === 'hoje'   ? 'Retorno HOJE'
              : 'Pendente';

            return (
              <View key={orc.id || i} style={[bfu.item, i < followups.length - 1 && bfu.itemBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={bfu.clienteNome} numberOfLines={1}>{orc.clienteNome}</Text>
                  <Text style={bfu.orcInfo}>
                    {`Enviado: ${formatarData(orc.dataOrcamento)}`}
                    {(orc.dataFollowup || orc.dataRetorno)
                      ? `  ·  Retorno: ${formatarData(orc.dataFollowup || orc.dataRetorno)}`
                      : ''}
                  </Text>
                  <Text style={[bfu.valor, { color: GOLD }]}>R$ {formatReal(orc.valor)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <View style={[bfu.urgBadge, { backgroundColor: urgCor + '20', borderColor: urgCor + '40' }]}>
                    <Text style={[bfu.urgTxt, { color: urgCor }]}>{urgLabel}</Text>
                  </View>
                  <View style={bfu.acoes}>
                    <TouchableOpacity
                      style={[bfu.acaoBtn, { backgroundColor: SUCCESS + '18', borderColor: SUCCESS + '40' }]}
                      onPress={() => onMudarStatus(orc.id, 'aprovado')}
                      activeOpacity={0.8}>
                      <Icon name="check" size={10} color={SUCCESS} type="material" />
                      <Text style={[bfu.acaoBtnTxt, { color: SUCCESS }]}>Fechou</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[bfu.acaoBtn, { backgroundColor: DANGER + '18', borderColor: DANGER + '40' }]}
                      onPress={() => onMudarStatus(orc.id, 'perdido')}
                      activeOpacity={0.8}>
                      <Icon name="close" size={10} color={DANGER} type="material" />
                      <Text style={[bfu.acaoBtnTxt, { color: DANGER }]}>Perdido</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
const bfu = StyleSheet.create({
  container  : { marginHorizontal: 0, marginBottom: 14, backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  header     : { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  titulo     : { fontSize: 13, fontWeight: '800' },
  sub        : { fontSize: 10, color: SILVER_DARK, marginTop: 2 },
  lista      : { paddingHorizontal: 14, paddingBottom: 12 },
  item       : { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 },
  itemBorder : { borderBottomWidth: 1, borderBottomColor: SILVER + '10' },
  clienteNome: { fontSize: 13, fontWeight: '800', color: SILVER_LIGHT },
  orcInfo    : { fontSize: 10, color: SILVER_DARK, marginTop: 2 },
  valor      : { fontSize: 12, fontWeight: '800', marginTop: 3 },
  urgBadge   : { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  urgTxt     : { fontSize: 9, fontWeight: '900' },
  acoes      : { flexDirection: 'row', gap: 6 },
  acaoBtn    : { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, borderWidth: 1 },
  acaoBtnTxt : { fontSize: 9, fontWeight: '800' },
});

// ════════════════════════════════════════════════════════════════
// BannerReposicao (mantido original — Fase 7)
// ════════════════════════════════════════════════════════════════
function BannerReposicao({ alertas, onVerCliente }) {
  const [expandido, setExpandido] = useState(true);

  if (!alertas?.length) return null;

  const atrasados = alertas.filter(a => a.urgencia === 'atrasado');
  const corBanner = atrasados.length > 0 ? DANGER : PURPLE;
  const urgCor  = { atrasado: DANGER, hoje: WARN, breve: PURPLE };
  const urgIcon = { atrasado: 'warning', hoje: 'schedule', breve: 'autorenew' };

  return (
    <View style={[brp.container, { borderColor: corBanner + '40' }]}>
      <TouchableOpacity
        style={[brp.header, { backgroundColor: corBanner + '12' }]}
        onPress={() => setExpandido(e => !e)}
        activeOpacity={0.85}>
        <Icon name="inventory" size={16} color={corBanner} type="material" />
        <View style={{ flex: 1 }}>
          <Text style={[brp.titulo, { color: corBanner }]}>
            {atrasados.length > 0
              ? `⚠ ${atrasados.length} reposição${atrasados.length > 1 ? 'ões' : ''} atrasada${atrasados.length > 1 ? 's' : ''}`
              : `🔄 ${alertas.length} reposição${alertas.length > 1 ? 'ões' : ''} prevista${alertas.length > 1 ? 's' : ''}`}
          </Text>
          <Text style={brp.sub}>Previsão de reposição por cliente e produto</Text>
        </View>
        <Icon name={expandido ? 'expand-less' : 'expand-more'} size={18} color={corBanner} type="material" />
      </TouchableOpacity>

      {expandido && (
        <View style={brp.lista}>
          {alertas.map((alerta, i) => {
            const cor  = urgCor[alerta.urgencia]  || PURPLE;
            const icon = urgIcon[alerta.urgencia] || 'autorenew';
            let prazoTxt;
            if (alerta.urgencia === 'atrasado') {
              prazoTxt = `${Math.abs(alerta.diasRestantes)}d atrasado`;
            } else if (alerta.urgencia === 'hoje') {
              prazoTxt = 'repor hoje';
            } else {
              prazoTxt = `em ${alerta.diasRestantes}d`;
            }
            return (
              <TouchableOpacity
                key={`${alerta.clienteId}-${alerta.produto}-${i}`}
                style={[brp.item, i < alertas.length - 1 && brp.itemBorder, { borderLeftColor: cor }]}
                onPress={() => onVerCliente?.(alerta)}
                activeOpacity={0.8}>
                <View style={[brp.iconWrap, { backgroundColor: cor + '18' }]}>
                  <Icon name={icon} size={14} color={cor} type="material" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={brp.clienteNome} numberOfLines={1}>{alerta.clienteNome}</Text>
                  <Text style={[brp.mensagem, { color: cor }]}>{alerta.mensagem}</Text>
                  {alerta.ciclo > 0 && (
                    <Text style={brp.detalhe}>
                      Ciclo ~{alerta.ciclo}d · {alerta.totalCompras} compra{alerta.totalCompras > 1 ? 's' : ''} registrada{alerta.totalCompras > 1 ? 's' : ''}
                    </Text>
                  )}
                </View>
                <View style={[brp.prazoBadge, { backgroundColor: cor + '18', borderColor: cor + '40' }]}>
                  <Text style={[brp.prazoTxt, { color: cor }]}>{prazoTxt}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}
const brp = StyleSheet.create({
  container  : { marginBottom: 14, backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  header     : { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  titulo     : { fontSize: 13, fontWeight: '800' },
  sub        : { fontSize: 10, color: SILVER_DARK, marginTop: 2 },
  lista      : { paddingBottom: 8 },
  item       : { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderLeftWidth: 3 },
  itemBorder : { borderBottomWidth: 1, borderBottomColor: SILVER + '0D' },
  iconWrap   : { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  clienteNome: { fontSize: 13, fontWeight: '800', color: SILVER_LIGHT },
  mensagem   : { fontSize: 11, fontWeight: '700', marginTop: 1 },
  detalhe    : { fontSize: 9, color: SILVER_DARK, marginTop: 2 },
  prazoBadge : { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, flexShrink: 0 },
  prazoTxt   : { fontSize: 9, fontWeight: '900' },
});

// ════════════════════════════════════════════════════════════════
// ✅ CHECKLIST: Status orçamento — OrcamentoCard
// [CRASH 1] produtos null check adicionado
// [BUG 2]   diasRestantes agora recebe orc completo (dataRetorno || dataFollowup)
// [BUG 4]   ações inline usam isOrcPendente() em vez de === 'aguardando'
// ════════════════════════════════════════════════════════════════
function OrcamentoCard({ orc, onEditar, onExcluir, onMudarStatus }) {
  const cfg     = STATUS_CONFIG[orc.status] || STATUS_CONFIG.aguardando;
  // [BUG 2] passa orc inteiro para resolver dataRetorno || dataFollowup
  const dias    = diasRestantes(orc);
  const vencido = dias !== null && dias < 0 && isOrcPendente(orc);
  const hojeOrc = dias === 0                && isOrcPendente(orc);
  // [BUG 2] campo de referência para exibição da data
  const dataRef = orc.dataRetorno || orc.dataFollowup;

  return (
    <View style={[
      oc.card,
      vencido && { borderColor: DANGER + '55', borderLeftColor: DANGER },
      hojeOrc && { borderColor: WARN + '55',   borderLeftColor: WARN   },
    ]}>
      <View style={oc.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={oc.clienteNome} numberOfLines={1}>{orc.clienteNome}</Text>
          <Text style={oc.dataOrc}>{formatarData(orc.dataOrcamento)}</Text>
        </View>
        <Text style={[oc.valor, { color: orc.status === 'perdido' ? SILVER_DARK : GOLD }]}>
          R$ {formatReal(orc.valor)}
        </Text>
      </View>

      {/* [CRASH 1] null check em produtos */}
      <Text style={oc.produtos} numberOfLines={1}>
        📦 {(orc.produtos || []).map(p => PRODUTO_LABEL[p] || p).join(' · ') || '—'}
      </Text>

      <View style={oc.badgesRow}>
        <View style={[oc.statusBadge, { backgroundColor: cfg.cor + '18', borderColor: cfg.cor + '40' }]}>
          <Icon name={cfg.icon} size={10} color={cfg.cor} type="material" />
          <Text style={[oc.badgeTxt, { color: cfg.cor }]}>{cfg.emoji} {cfg.label}</Text>
        </View>
        {/* [BUG 2] exibe badge se dataRef existir e orc for pendente */}
        {dataRef && isOrcPendente(orc) && (
          <View style={[
            oc.retornoBadge,
            vencido && { backgroundColor: DANGER + '18', borderColor: DANGER + '40' },
            hojeOrc && { backgroundColor: WARN + '18',   borderColor: WARN + '40'   },
          ]}>
            <Icon name="event" size={10} color={vencido ? DANGER : hojeOrc ? WARN : SILVER_DARK} type="material" />
            <Text style={[oc.badgeTxt, { color: vencido ? DANGER : hojeOrc ? WARN : SILVER_DARK }]}>
              {vencido
                ? `Vencido há ${Math.abs(dias)}d`
                : hojeOrc ? 'Retorno HOJE' : `Retorno em ${dias}d`}
            </Text>
          </View>
        )}
      </View>

      {!!orc.observacao && (
        <Text style={oc.obs} numberOfLines={2}>💬 {orc.observacao}</Text>
      )}

      <View style={oc.acoesRow}>
        {/* [BUG 4] isOrcPendente() em vez de === 'aguardando' */}
        {isOrcPendente(orc) && (
          <>
            <TouchableOpacity
              style={[oc.acaoBtn, { backgroundColor: SUCCESS + '18', borderColor: SUCCESS + '40' }]}
              onPress={() => onMudarStatus(orc.id, 'aprovado')}
              activeOpacity={0.8}>
              <Icon name="check" size={11} color={SUCCESS} type="material" />
              <Text style={[oc.acaoBtnTxt, { color: SUCCESS }]}>Aprovado</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[oc.acaoBtn, { backgroundColor: DANGER + '18', borderColor: DANGER + '40' }]}
              onPress={() => onMudarStatus(orc.id, 'perdido')}
              activeOpacity={0.8}>
              <Icon name="close" size={11} color={DANGER} type="material" />
              <Text style={[oc.acaoBtnTxt, { color: DANGER }]}>Perdido</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity
          style={[oc.acaoBtn, { backgroundColor: BLUE + '18', borderColor: BLUE + '40' }]}
          onPress={() => onEditar(orc)}
          activeOpacity={0.8}>
          <Icon name="edit" size={11} color={BLUE} type="material" />
          <Text style={[oc.acaoBtnTxt, { color: BLUE }]}>Editar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[oc.acaoBtn, { backgroundColor: DANGER + '10', borderColor: DANGER + '20' }]}
          onPress={() => onExcluir(orc.id)}
          activeOpacity={0.8}>
          <Icon name="delete-outline" size={11} color={DANGER + 'AA'} type="material" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
const oc = StyleSheet.create({
  card        : { backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderLeftWidth: 4, borderColor: SILVER + '20', borderLeftColor: GOLD, padding: 14, marginBottom: 10 },
  topRow      : { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 5 },
  clienteNome : { fontSize: 14, fontWeight: '800', color: SILVER_LIGHT },
  dataOrc     : { fontSize: 10, color: SILVER_DARK, marginTop: 1 },
  valor       : { fontSize: 16, fontWeight: '900' },
  produtos    : { fontSize: 12, color: SILVER, fontWeight: '600', marginBottom: 8 },
  badgesRow   : { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  statusBadge : { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  retornoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, backgroundColor: CARD_BG2, borderColor: SILVER + '25' },
  badgeTxt    : { fontSize: 9, fontWeight: '800' },
  obs         : { fontSize: 11, color: SILVER_DARK, fontStyle: 'italic', marginBottom: 8, lineHeight: 15 },
  acoesRow    : { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  acaoBtn     : { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9, borderWidth: 1 },
  acaoBtnTxt  : { fontSize: 10, fontWeight: '700' },
});

// ════════════════════════════════════════════════════════════════
// TELA PRINCIPAL
// ════════════════════════════════════════════════════════════════
export default function OrcamentosScreen({ navigation, route }) {
  const clienteParam = route?.params?.cliente ?? null;

  const [orcamentos,       setOrcamentos]       = useState([]);
  const [followups,        setFollowups]        = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [refreshing,       setRefreshing]       = useState(false);
  const [filtro,           setFiltro]           = useState('todos');
  const [modalVisible,     setModalVisible]     = useState(false);
  const [orcEditando,      setOrcEditando]      = useState(null);
  const [alertasReposicao, setAlertasReposicao] = useState([]);
  const [loadingReposicao, setLoadingReposicao] = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  const carregar = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else           setLoading(true);

    try {
      const todos = await getTodosOrcamentos();
      const lista = clienteParam
        ? todos.filter(o => o.clienteId === clienteParam.id)
        : todos;

      // [BUG 1] Sort com fallback para dataOrcamento quando criadoEm não existe
      const ordenados = [...lista].sort((a, b) => {
        const da = new Date(b.criadoEm || b.dataOrcamento || 0).getTime();
        const db = new Date(a.criadoEm || a.dataOrcamento || 0).getTime();
        return da - db;
      });
      setOrcamentos(ordenados);

      // ✅ CHECKLIST: Follow-up automático — getOrcamentosParaFollowup
      // Passa lista global quando não há clienteParam para capturar todos os follow-ups
      const fuList = getOrcamentosParaFollowup(clienteParam ? lista : todos);
      setFollowups(fuList.filter(o => o.urgencia === 'atrasado' || o.urgencia === 'hoje'));

    } catch (e) {
      console.log('[OrcamentosScreen]', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }

    // Alertas de reposição — bloco independente (Fase 7)
    setLoadingReposicao(true);
    try {
      const [visitas, clientes] = await Promise.all([
        getTodasVisitas(),
        getTodosClientes(),
      ]);
      const clientesAlvo = clienteParam
        ? clientes.filter(c => c.id === clienteParam.id)
        : clientes;
      const alertas = getAlertasReposicaoGlobal(clientesAlvo, visitas, 15);
      setAlertasReposicao(alertas);
    } catch (e) {
      console.log('[OrcamentosScreen] reposicao:', e);
    } finally {
      setLoadingReposicao(false);
    }
  }, [clienteParam?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    carregar();
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ✅ CHECKLIST: Status orçamento — atualização com feedback
  // [CRASH 2] try/catch adicionado nos handlers de status e exclusão
  const mudarStatus = (id, novoStatus) => {
    const label = { aprovado: 'APROVADO ✅', perdido: 'PERDIDO ❌' };
    Alert.alert('Confirmar', `Marcar como ${label[novoStatus]}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: async () => {
        try {
          await atualizarStatusOrcamento(id, novoStatus);
          // Remove do banner de follow-up imediatamente sem reload
          setFollowups(prev => prev.filter(o => o.id !== id));
          carregar();
        } catch (e) {
          console.log('[OrcamentosScreen] mudarStatus:', e);
          Alert.alert('Erro', 'Não foi possível atualizar o orçamento.');
        }
      }},
    ]);
  };

  const excluir = (id) => {
    Alert.alert('Excluir', 'Tem certeza? Esta ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
        try {
          await excluirOrcamento(id);
          setFollowups(prev => prev.filter(o => o.id !== id));
          carregar();
        } catch (e) {
          console.log('[OrcamentosScreen] excluir:', e);
          Alert.alert('Erro', 'Não foi possível excluir o orçamento.');
        }
      }},
    ]);
  };

  // ✅ CHECKLIST: KPIs — usa getOrcamentosPendentes do service
  // [BUG 3] aguardando calculado com isOrcPendente para pegar os dois status
  const pendentes  = getOrcamentosPendentes ? getOrcamentosPendentes(orcamentos) : orcamentos.filter(isOrcPendente);
  const aguardando = pendentes.length;
  const aprovados  = orcamentos.filter(o => o.status === 'aprovado').length;
  const perdidos   = orcamentos.filter(o => o.status === 'perdido').length;
  const totalAprov = orcamentos
    .filter(o => o.status === 'aprovado')
    .reduce((s, o) => s + (o.valor || 0), 0);

  // [BUG 3] Filtro de lista usa isOrcPendente() para chip 'aguardando'
  const filtrados = (() => {
    if (filtro === 'todos') return orcamentos;
    if (filtro === 'aguardando') return orcamentos.filter(isOrcPendente);
    return orcamentos.filter(o => o.status === filtro);
  })();

  if (loading) {
    return (
      <View style={ds.loadingWrap}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={ds.loadingTxt}>Carregando orçamentos...</Text>
      </View>
    );
  }

  return (
    <View style={ds.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} translucent />

      {/* ── Header ── */}
      <View style={ds.header}>
        <View style={ds.headerAccent} />
        <View style={ds.headerRow}>
          {navigation?.canGoBack?.() && (
            <TouchableOpacity style={ds.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
              <Icon name="arrow-back" size={20} color={SILVER} type="material" />
            </TouchableOpacity>
          )}
          <View style={ds.headerIconWrap}>
            <Icon name="request-quote" size={20} color={DARK_BG} type="material" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ds.headerTitulo}>
              {clienteParam ? 'Orçamentos' : 'Todos os Orçamentos'}
            </Text>
            <Text style={ds.headerSub} numberOfLines={1}>
              {clienteParam ? clienteParam.nome : `${orcamentos.length} orçamento${orcamentos.length !== 1 ? 's' : ''}`}
            </Text>
          </View>
          <TouchableOpacity style={ds.refreshBtn} onPress={() => carregar(true)} activeOpacity={0.8}>
            <Icon name="refresh" size={18} color={refreshing ? GOLD : SILVER_DARK} type="material" />
          </TouchableOpacity>
          <TouchableOpacity
            style={ds.novoBtn}
            onPress={() => { setOrcEditando(null); setModalVisible(true); }}
            activeOpacity={0.85}>
            <Icon name="add" size={16} color={DARK_BG} type="material" />
            <Text style={ds.novoBtnTxt}>Novo</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Animated.ScrollView
        style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        contentContainerStyle={ds.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => carregar(true)} tintColor={GOLD} colors={[GOLD]} />
        }>

        {/* ✅ CHECKLIST: Follow-up automático — BannerFollowup */}
        <BannerFollowup
          followups={followups}
          onVerOrcamento={(orc) => { setOrcEditando(orc); setModalVisible(true); }}
          onMudarStatus={mudarStatus}
        />

        {/* Banner de reposição (Fase 7) */}
        {loadingReposicao ? (
          <View style={ds.reposicaoLoadingWrap}>
            <ActivityIndicator size="small" color={PURPLE} />
            <Text style={ds.reposicaoLoadingTxt}>Calculando reposições...</Text>
          </View>
        ) : (
          <BannerReposicao
            alertas={alertasReposicao}
            onVerCliente={(alerta) => {
              navigation?.navigate?.('ClienteDetalhe', {
                cliente: { id: alerta.clienteId, nome: alerta.clienteNome },
              });
            }}
          />
        )}

        {/* ✅ CHECKLIST: KPIs */}
        {orcamentos.length > 0 && (
          <View style={ds.kpisRow}>
            <View style={[ds.kpi, { borderColor: WARN + '40' }]}>
              <Text style={[ds.kpiValor, { color: WARN }]}>{aguardando}</Text>
              <Text style={ds.kpiLabel}>Aguardando</Text>
            </View>
            <View style={[ds.kpi, { borderColor: SUCCESS + '40' }]}>
              <Text style={[ds.kpiValor, { color: SUCCESS }]}>{aprovados}</Text>
              <Text style={ds.kpiLabel}>Aprovados</Text>
            </View>
            <View style={[ds.kpi, { borderColor: DANGER + '40' }]}>
              <Text style={[ds.kpiValor, { color: DANGER }]}>{perdidos}</Text>
              <Text style={ds.kpiLabel}>Perdidos</Text>
            </View>
            <View style={[ds.kpi, { borderColor: GOLD + '40' }]}>
              <Text style={[ds.kpiValor, { color: GOLD, fontSize: 13 }]}>
                {totalAprov >= 1000
                  ? `R$${(totalAprov / 1000).toFixed(1)}k`
                  : `R$${Number(totalAprov).toFixed(0)}`}
              </Text>
              <Text style={ds.kpiLabel}>Convertido</Text>
            </View>
            {alertasReposicao.length > 0 && (
              <View style={[ds.kpi, { borderColor: PURPLE + '40' }]}>
                <Text style={[ds.kpiValor, { color: PURPLE }]}>
                  {alertasReposicao.filter(a => a.urgencia === 'atrasado').length || alertasReposicao.length}
                </Text>
                <Text style={ds.kpiLabel}>Reposição</Text>
              </View>
            )}
          </View>
        )}

        {/* ✅ CHECKLIST: Filtros de status */}
        {orcamentos.length > 0 && (
          <View style={ds.filtroRow}>
            {[
              { key:'todos',      label:'Todos'       },
              { key:'aguardando', label:'⏳ Aguard.'  },
              { key:'aprovado',   label:'✅ Aprovado' },
              { key:'perdido',    label:'❌ Perdido'  },
            ].map(f => (
              <TouchableOpacity
                key={f.key}
                style={[ds.filtroChip, filtro === f.key && ds.filtroChipAtivo]}
                onPress={() => setFiltro(f.key)}
                activeOpacity={0.8}>
                <Text style={[ds.filtroChipTxt, filtro === f.key && { color: GOLD }]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ✅ CHECKLIST: Lista de orçamentos */}
        {filtrados.length === 0 ? (
          <View style={ds.emptyWrap}>
            <Text style={ds.emptyEmoji}>📋</Text>
            <Text style={ds.emptyTitulo}>
              {orcamentos.length === 0 ? 'Nenhum orçamento ainda' : 'Nenhum neste filtro'}
            </Text>
            <Text style={ds.emptyTxt}>
              {orcamentos.length === 0
                ? 'Toque em + Novo para criar o primeiro orçamento.'
                : 'Tente outro filtro acima.'}
            </Text>
            {orcamentos.length === 0 && (
              <TouchableOpacity
                style={ds.emptyBtn}
                onPress={() => { setOrcEditando(null); setModalVisible(true); }}
                activeOpacity={0.85}>
                <Icon name="add" size={16} color={DARK_BG} type="material" />
                <Text style={ds.emptyBtnTxt}>Criar orçamento</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filtrados.map(orc => (
            <OrcamentoCard
              key={orc.id}
              orc={orc}
              onEditar={(o) => { setOrcEditando(o); setModalVisible(true); }}
              onExcluir={excluir}
              onMudarStatus={mudarStatus}
            />
          ))
        )}

        <View style={{ height: 90 }} />
      </Animated.ScrollView>

      {/* ✅ CHECKLIST: Cadastro orçamento — OrcamentoModal */}
      <OrcamentoModal
        visible={modalVisible}
        cliente={clienteParam || { id: 'geral', nome: 'Geral' }}
        orcamento={orcEditando}
        onClose={() => setModalVisible(false)}
        onSaved={() => { setModalVisible(false); carregar(); }}
      />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
// STYLES (mantidos originais + refreshBtn adicionado)
// ════════════════════════════════════════════════════════════════
const ds = StyleSheet.create({
  container    : { flex: 1, backgroundColor: DARK_BG },
  scroll       : { paddingHorizontal: 16, paddingTop: 14 },
  loadingWrap  : { flex: 1, backgroundColor: DARK_BG, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingTxt   : { color: SILVER, fontSize: 14, fontWeight: '600' },

  header        : { backgroundColor: '#001828', borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden', elevation: 10, shadowColor: GOLD, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 14 },
  headerAccent  : { height: 3, backgroundColor: GOLD },
  headerRow     : { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 48, paddingBottom: 14 },
  backBtn       : { width: 36, height: 36, borderRadius: 18, backgroundColor: CARD_BG2, justifyContent: 'center', alignItems: 'center' },
  headerIconWrap: { width: 42, height: 42, borderRadius: 14, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center' },
  headerTitulo  : { fontSize: 17, fontWeight: 'bold', color: SILVER_LIGHT },
  headerSub     : { fontSize: 11, color: SILVER_DARK, marginTop: 1 },
  refreshBtn    : { width: 36, height: 36, borderRadius: 18, backgroundColor: CARD_BG2, justifyContent: 'center', alignItems: 'center' },
  novoBtn       : { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GOLD, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, elevation: 3 },
  novoBtnTxt    : { fontSize: 12, fontWeight: '800', color: DARK_BG },

  kpisRow      : { flexDirection: 'row', gap: 8, marginBottom: 14 },
  kpi          : { flex: 1, alignItems: 'center', gap: 2, backgroundColor: CARD_BG, borderRadius: 14, padding: 10, borderWidth: 1 },
  kpiValor     : { fontSize: 20, fontWeight: '900' },
  kpiLabel     : { fontSize: 8, color: SILVER_DARK, fontWeight: '700', textAlign: 'center' },

  filtroRow      : { flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  filtroChip     : { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: CARD_BG, borderWidth: 1, borderColor: SILVER + '18' },
  filtroChipAtivo: { backgroundColor: GOLD + '18', borderColor: GOLD + '50' },
  filtroChipTxt  : { fontSize: 11, fontWeight: '700', color: SILVER_DARK },

  emptyWrap    : { alignItems: 'center', paddingVertical: 80, gap: 10 },
  emptyEmoji   : { fontSize: 56 },
  emptyTitulo  : { fontSize: 18, fontWeight: 'bold', color: SILVER, textAlign: 'center' },
  emptyTxt     : { fontSize: 13, color: SILVER_DARK, textAlign: 'center', lineHeight: 20 },
  emptyBtn     : { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: GOLD, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 8 },
  emptyBtnTxt  : { fontSize: 13, fontWeight: 'bold', color: DARK_BG },

  reposicaoLoadingWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 4, marginBottom: 10 },
  reposicaoLoadingTxt : { fontSize: 11, color: PURPLE, fontWeight: '600' },
});