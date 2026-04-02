// screens/ClienteDetalheScreen.js
// ════════════════════════════════════════════════════════════════
// FASE 5 — CLIENTE DETALHE (CENTRO DE VENDAS)
//
// Checklist:
//   ✅ Resumo cliente     — KPIs: última compra, ticket médio,
//                           dias sem compra, total mês, frequência
//   ✅ Sugestão automática — SugestaoVenda via getSugestaoVendaIA()
//   ✅ Fotos              — GaleriaFotos por tipo (fotoService)
//   ✅ Orçamentos         — ListaOrcamentos + ações inline + modal
//
// FUSÃO v2 — correções de comunicação com services:
//   [FIX 1] Status 'aguardando' (orcamentoService) ≡ 'pendente' (tela)
//           → helper isOrcPendente() normaliza os dois valores
//   [FIX 2] Estado inicial de fotos derivado de TIPOS_FOTO dinamicamente
//           → evita divergência quando fotoService adiciona novos tipos
//   [FIX 3] loadingIA isolado em try/catch próprio
//           → spinner nunca fica travado se aiService lançar erro
// ════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Alert, Image, Animated,
  ActivityIndicator, Linking, Share, RefreshControl,
} from 'react-native';
import { Icon }            from 'react-native-elements';
import * as ImagePicker    from 'expo-image-picker';
import { getTodasVisitas } from '../services/visitaService';
import { getTodosClientes } from '../services/clienteService';
import {
  getOrcamentosCliente,
  atualizarStatusOrcamento,
  getOrcamentosParaFollowup,
}                          from '../services/orcamentoService';
import {
  getSugestaoVendaIA,
  calcularPrioridadeClienteIA,
  preverReposicaoIA,
}                          from '../services/aiService';
import { getResumoCliente } from '../services/analyticsService';
import {
  getFotosPorCliente,
  salvarFoto,
  TIPOS_FOTO,
}                          from '../services/fotoService';
import VisitaModal         from '../components/VisitaModal';
import OrcamentoModal      from '../components/OrcamentoModal';

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

const TIPO_ICON = { loja: 'store', obra: 'construction', distribuidor: 'business' };

const PRODUTO_LABEL = {
  caixas  : 'Caixas',
  tubos   : 'Tubos',
  conexoes: 'Conexões',
  telhas  : 'Telhas',
  vasos   : 'Vasos',
  metais  : 'Metais',
  tintas  : 'Tintas',
};

// ════════════════════════════════════════════════════════════════
// [FIX 1] Helper de status normalizado
// orcamentoService.criarOrcamento() persiste status = 'aguardando'
// mas partes da tela filtravam só 'pendente', tornando orçamentos
// recém-criados invisíveis nos banners e ações inline.
// Solução: isOrcPendente() aceita os dois valores — usado em todo
// lugar que antes usava o.status === 'pendente' diretamente.
// ════════════════════════════════════════════════════════════════
function isOrcPendente(o) {
  return o.status === 'pendente' || o.status === 'aguardando';
}

// ── Helpers de formatação ──────────────────────────────────────
function formatReal(v) {
  if (!v) return '—';
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits:2 })}`;
}
function formatData(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' }); }
  catch { return '—'; }
}
function formatDataCurta(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }); }
  catch { return '—'; }
}
function formatHora(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }); }
  catch { return ''; }
}

// ════════════════════════════════════════════════════════════════
// ✅ CHECKLIST: Resumo cliente — KpiCard
// ════════════════════════════════════════════════════════════════
function KpiCard({ icon, label, value, sub, color = GOLD }) {
  return (
    <View style={[kc.card, { borderColor: color + '30' }]}>
      <View style={[kc.iconWrap, { backgroundColor: color + '18' }]}>
        <Icon name={icon} size={18} color={color} type="material" />
      </View>
      <Text style={[kc.value, { color }]} numberOfLines={1}>{value}</Text>
      <Text style={kc.label}>{label}</Text>
      {sub ? <Text style={kc.sub}>{sub}</Text> : null}
    </View>
  );
}
const kc = StyleSheet.create({
  card    : { flex:1, alignItems:'center', backgroundColor:CARD_BG, borderRadius:14, padding:12, borderWidth:1, marginHorizontal:4, gap:4 },
  iconWrap: { width:36, height:36, borderRadius:11, justifyContent:'center', alignItems:'center' },
  value   : { fontSize:17, fontWeight:'bold' },
  label   : { fontSize:9, color:SILVER_DARK, textAlign:'center', letterSpacing:0.3 },
  sub     : { fontSize:8, color:SILVER_DARK+'80', textAlign:'center' },
});

// ════════════════════════════════════════════════════════════════
// ✅ CHECKLIST: Sugestão automática — SugestaoVenda
// ════════════════════════════════════════════════════════════════
function SugestaoVenda({ sugestoes, loading }) {
  const confCor  = { alta: SUCCESS, media: GOLD, baixa: SILVER_DARK };
  const confIcon = { alta: 'check-circle', media: 'info', baixa: 'radio-button-unchecked' };

  return (
    <View style={sv.container}>
      <View style={sv.header}>
        <View style={sv.iaIconWrap}>
          <Icon name="auto-awesome" size={14} color={DARK_BG} type="material" />
        </View>
        <Text style={sv.titulo}>Sugestão de venda hoje</Text>
        {loading && <ActivityIndicator size="small" color={GOLD} />}
      </View>

      {!loading && sugestoes.length === 0 && (
        <Text style={sv.vazio}>Sem histórico de compras suficiente para sugestão.</Text>
      )}

      {sugestoes.map((s, i) => {
        const cor  = confCor[s.confianca]  || SILVER_DARK;
        const icon = confIcon[s.confianca] || 'radio-button-unchecked';
        return (
          <View key={i} style={[sv.item, { borderLeftColor: cor }]}>
            <Icon name={icon} size={14} color={cor} type="material" />
            <View style={{ flex:1 }}>
              <Text style={sv.itemNome}>{s.nome}</Text>
              <Text style={[sv.itemMotivo, { color: cor }]}>{s.motivo}</Text>
            </View>
            <View style={[sv.confBadge, { backgroundColor: cor + '18', borderColor: cor + '40' }]}>
              <Text style={[sv.confTxt, { color: cor }]}>
                {s.confianca === 'alta' ? 'Alta' : s.confianca === 'media' ? 'Média' : 'Baixa'}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
const sv = StyleSheet.create({
  container : { backgroundColor:CARD_BG, borderRadius:16, borderWidth:1, borderColor:GOLD+'30', overflow:'hidden', marginBottom:14 },
  header    : { flexDirection:'row', alignItems:'center', gap:8, padding:14, backgroundColor:GOLD+'12' },
  iaIconWrap: { width:28, height:28, borderRadius:9, backgroundColor:GOLD, justifyContent:'center', alignItems:'center' },
  titulo    : { flex:1, fontSize:13, fontWeight:'800', color:SILVER_LIGHT },
  vazio     : { padding:14, fontSize:12, color:SILVER_DARK, fontStyle:'italic' },
  item      : { flexDirection:'row', alignItems:'center', gap:10, paddingVertical:10, paddingHorizontal:14, borderBottomWidth:1, borderBottomColor:SILVER+'0D', borderLeftWidth:3 },
  itemNome  : { fontSize:13, fontWeight:'800', color:SILVER_LIGHT },
  itemMotivo: { fontSize:10, fontWeight:'600', marginTop:1 },
  confBadge : { paddingHorizontal:7, paddingVertical:3, borderRadius:7, borderWidth:1 },
  confTxt   : { fontSize:9, fontWeight:'900' },
});

// ════════════════════════════════════════════════════════════════
// ✅ CHECKLIST: Fotos — GaleriaFotos por tipo
// ════════════════════════════════════════════════════════════════
function GaleriaFotos({ fotos, onAdicionarFoto, loading }) {
  const [tipoSelecionado, setTipoSelecionado] = useState('estoque');
  const tipoAtual   = TIPOS_FOTO.find(t => t.key === tipoSelecionado) || TIPOS_FOTO[0];
  const fotosDoTipo = fotos[tipoSelecionado] || [];

  return (
    <View style={gf.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={gf.abas}>
        {TIPOS_FOTO.map(t => {
          const ativo = tipoSelecionado === t.key;
          const qtd   = (fotos[t.key] || []).length;
          return (
            <TouchableOpacity
              key={t.key}
              style={[gf.aba, ativo && { backgroundColor: t.cor, borderColor: t.cor }]}
              onPress={() => setTipoSelecionado(t.key)}
              activeOpacity={0.8}>
              <Icon name={t.icone} size={12} color={ativo ? DARK_BG : t.cor} type="material" />
              <Text style={[gf.abaTxt, { color: ativo ? DARK_BG : t.cor }]}>{t.label}</Text>
              {qtd > 0 && (
                <View style={[gf.abaQtd, { backgroundColor: ativo ? DARK_BG + '30' : t.cor + '30' }]}>
                  <Text style={[gf.abaQtdTxt, { color: ativo ? DARK_BG : t.cor }]}>{qtd}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={gf.body}>
        {loading ? (
          <ActivityIndicator color={GOLD} style={{ padding:20 }} />
        ) : fotosDoTipo.length === 0 ? (
          <View style={gf.empty}>
            <Icon name={tipoAtual.icone} size={32} color={tipoAtual.cor + '40'} type="material" />
            <Text style={gf.emptyTxt}>Nenhuma foto de {tipoAtual.label.toLowerCase()} ainda</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={gf.fotosRow}>
            {fotosDoTipo.map((f, i) => (
              <View key={f.id || i} style={gf.fotoWrap}>
                <Image source={{ uri: f.url }} style={gf.foto} />
                {f.dataISO && <Text style={gf.fotoData}>{formatData(f.dataISO)}</Text>}
              </View>
            ))}
          </ScrollView>
        )}
        <TouchableOpacity
          style={[gf.addBtn, { borderColor: tipoAtual.cor + '50' }]}
          onPress={() => onAdicionarFoto(tipoSelecionado)}
          activeOpacity={0.85}>
          <Icon name="add-a-photo" size={14} color={tipoAtual.cor} type="material" />
          <Text style={[gf.addBtnTxt, { color: tipoAtual.cor }]}>Adicionar foto de {tipoAtual.label.toLowerCase()}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const gf = StyleSheet.create({
  container: { backgroundColor:CARD_BG, borderRadius:16, borderWidth:1, borderColor:SILVER+'15', marginBottom:14, overflow:'hidden' },
  abas     : { paddingHorizontal:14, paddingVertical:10, gap:6 },
  aba      : { flexDirection:'row', alignItems:'center', gap:5, paddingHorizontal:10, paddingVertical:6, borderRadius:12, backgroundColor:CARD_BG2, borderWidth:1, borderColor:SILVER+'18' },
  abaTxt   : { fontSize:11, fontWeight:'800' },
  abaQtd   : { paddingHorizontal:5, paddingVertical:1, borderRadius:6 },
  abaQtdTxt: { fontSize:9, fontWeight:'900' },
  body     : { paddingHorizontal:14, paddingBottom:14 },
  empty    : { alignItems:'center', paddingVertical:20, gap:6 },
  emptyTxt : { fontSize:12, color:SILVER_DARK },
  fotosRow : { gap:10, paddingVertical:8 },
  fotoWrap : { borderRadius:12, overflow:'hidden' },
  foto     : { width:120, height:120 },
  fotoData : { fontSize:9, color:SILVER_DARK, textAlign:'center', marginTop:3 },
  addBtn   : { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, backgroundColor:CARD_BG2, borderRadius:12, paddingVertical:10, borderWidth:1, marginTop:6 },
  addBtnTxt: { fontSize:12, fontWeight:'700' },
});

// ════════════════════════════════════════════════════════════════
// ✅ CHECKLIST: Orçamentos — ListaOrcamentos + ações rápidas inline
// [FIX 1] isOrcPendente() substitui orc.status === 'pendente'
// ════════════════════════════════════════════════════════════════
function ListaOrcamentos({ orcamentos, loading, onAtualizar }) {
  if (loading) return <ActivityIndicator color={GOLD} style={{ padding:20 }} />;
  if (!orcamentos.length) return (
    <View style={lo.empty}>
      <Icon name="request-quote" size={28} color={GOLD + '40'} type="material" />
      <Text style={lo.emptyTxt}>Nenhum orçamento para este cliente</Text>
    </View>
  );

  return (
    <View>
      {orcamentos.map((orc, i) => {
        // [FIX 1] Normaliza 'aguardando' e 'pendente' para exibição consistente
        const statusExibido = isOrcPendente(orc) ? 'pendente' : orc.status;
        const statusCor =
          orc.status === 'aprovado'          ? SUCCESS :
          orc.status === 'perdido'           ? DANGER  :
          isOrcPendente(orc)                 ? WARN    : SILVER_DARK;

        const diasOrc = orc.dataOrcamento
          ? Math.floor((Date.now() - new Date(orc.dataOrcamento).getTime()) / 86400000)
          : null;

        return (
          <View key={orc.id || i} style={[lo.item, { borderLeftColor: statusCor }]}>
            <View style={lo.itemTop}>
              <View style={[lo.statusBadge, { backgroundColor: statusCor + '20', borderColor: statusCor + '40' }]}>
                {/* [FIX 1] Exibe sempre 'pendente' para o usuário, independente do valor interno */}
                <Text style={[lo.statusTxt, { color: statusCor }]}>{statusExibido}</Text>
              </View>
              <Text style={lo.valor}>{formatReal(orc.valor)}</Text>
              {diasOrc != null && <Text style={lo.dias}>{diasOrc}d</Text>}
            </View>

            {orc.produtos?.length > 0 && (
              <Text style={lo.produtos} numberOfLines={1}>{orc.produtos.join(' · ')}</Text>
            )}

            <View style={lo.datas}>
              {orc.dataOrcamento && (
                <Text style={lo.dataTxt}>Enviado: {formatData(orc.dataOrcamento)}</Text>
              )}
              {orc.dataFollowup && (
                <Text style={[lo.dataTxt, { color: WARN }]}>Retorno: {formatData(orc.dataFollowup)}</Text>
              )}
            </View>

            {/* [FIX 1] Ações visíveis para 'aguardando' e 'pendente' */}
            {isOrcPendente(orc) && (
              <View style={lo.acoes}>
                <TouchableOpacity
                  style={[lo.acaoBtn, { backgroundColor: SUCCESS + '18', borderColor: SUCCESS + '40' }]}
                  onPress={() => onAtualizar(orc.id, 'aprovado')}
                  activeOpacity={0.8}>
                  <Icon name="check-circle" size={12} color={SUCCESS} type="material" />
                  <Text style={[lo.acaoBtnTxt, { color: SUCCESS }]}>Fechou!</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[lo.acaoBtn, { backgroundColor: DANGER + '18', borderColor: DANGER + '40' }]}
                  onPress={() => onAtualizar(orc.id, 'perdido')}
                  activeOpacity={0.8}>
                  <Icon name="cancel" size={12} color={DANGER} type="material" />
                  <Text style={[lo.acaoBtnTxt, { color: DANGER }]}>Perdido</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
const lo = StyleSheet.create({
  empty      : { alignItems:'center', paddingVertical:24, gap:8 },
  emptyTxt   : { fontSize:12, color:SILVER_DARK },
  item       : { backgroundColor:CARD_BG2, borderRadius:12, borderWidth:1, borderLeftWidth:4, borderColor:SILVER+'18', padding:11, marginBottom:8 },
  itemTop    : { flexDirection:'row', alignItems:'center', gap:8, marginBottom:5 },
  statusBadge: { paddingHorizontal:8, paddingVertical:3, borderRadius:8, borderWidth:1 },
  statusTxt  : { fontSize:10, fontWeight:'800' },
  valor      : { flex:1, fontSize:14, fontWeight:'900', color:GOLD },
  dias       : { fontSize:10, color:SILVER_DARK, fontWeight:'700' },
  produtos   : { fontSize:11, color:SILVER, fontWeight:'600', marginBottom:5 },
  datas      : { flexDirection:'row', gap:10 },
  dataTxt    : { fontSize:10, color:SILVER_DARK },
  acoes      : { flexDirection:'row', gap:7, marginTop:8 },
  acaoBtn    : { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:4, paddingVertical:7, borderRadius:9, borderWidth:1 },
  acaoBtnTxt : { fontSize:11, fontWeight:'800' },
});

// Card de previsão de reposição IA
function CardPrevisaoReposicao({ previsoes }) {
  const [expandido, setExpandido] = useState(false);
  if (!previsoes?.length) return null;
  const relevantes = previsoes.filter(p => p.urgencia !== 'ok');
  if (!relevantes.length) return null;

  const urgentes  = relevantes.filter(p => p.urgencia === 'atrasado' || p.urgencia === 'hoje');
  const corHeader = urgentes.length > 0 ? DANGER : PURPLE;
  const urgCor    = { atrasado:DANGER, hoje:WARN, breve:BLUE, ok:SUCCESS };
  const urgLabel  = { atrasado:'Atrasado', hoje:'Repor hoje', breve:'Em breve', ok:'Ok' };
  const exibir    = expandido ? relevantes : relevantes.slice(0, 3);

  return (
    <View style={[prv.container, { borderColor: corHeader + '35' }]}>
      <TouchableOpacity
        style={[prv.header, { backgroundColor: corHeader + '10' }]}
        onPress={() => setExpandido(e => !e)}
        activeOpacity={0.85}>
        <View style={[prv.iconWrap, { backgroundColor: corHeader + '18' }]}>
          <Icon name="inventory" size={14} color={corHeader} type="material" />
        </View>
        <View style={{ flex:1 }}>
          <Text style={prv.titulo}>Previsão de Reposição (IA)</Text>
          <Text style={[prv.sub, urgentes.length > 0 && { color:DANGER }]}>
            {urgentes.length > 0
              ? `${urgentes.length} produto${urgentes.length > 1 ? 's' : ''} precisando de atenção`
              : `${relevantes.length} produto${relevantes.length > 1 ? 's' : ''} para acompanhar`}
          </Text>
        </View>
        <Icon name={expandido ? 'expand-less' : 'expand-more'} size={18} color={SILVER_DARK} type="material" />
      </TouchableOpacity>
      <View style={prv.lista}>
        {exibir.map((p, i) => {
          const cor      = urgCor[p.urgencia]   || SILVER_DARK;
          const labelUrg = urgLabel[p.urgencia] || '—';
          const confCor  = p.confianca === 'alta' ? SUCCESS : p.confianca === 'media' ? GOLD : SILVER_DARK;
          return (
            <View key={i} style={[prv.item, i < exibir.length - 1 && prv.itemBorder]}>
              <View style={{ flex:1 }}>
                <Text style={prv.prodNome}>{PRODUTO_LABEL[p.produto] || p.produto}</Text>
                <Text style={prv.prodInfo}>{`Ciclo: ~${p.ciclo}d  ·  Prev.: ${formatDataCurta(p.dataEstimada)}`}</Text>
              </View>
              <View style={{ alignItems:'flex-end', gap:4 }}>
                <View style={[prv.urgBadge, { backgroundColor:cor+'20', borderColor:cor+'40' }]}>
                  <Text style={[prv.urgTxt, { color:cor }]}>{labelUrg}</Text>
                  {p.diasRestantes !== 0 && (
                    <Text style={[prv.urgDias, { color:cor }]}>
                      {p.diasRestantes > 0 ? `${p.diasRestantes}d` : `${Math.abs(p.diasRestantes)}d atr.`}
                    </Text>
                  )}
                </View>
                <Text style={[prv.confTxt, { color:confCor }]}>{p.confianca}</Text>
              </View>
            </View>
          );
        })}
        {relevantes.length > 3 && (
          <TouchableOpacity style={prv.verMaisBtn} onPress={() => setExpandido(e => !e)} activeOpacity={0.8}>
            <Text style={prv.verMaisTxt}>
              {expandido ? 'Recolher' : `Ver todos (${relevantes.length - 3} restantes)`}
            </Text>
            <Icon name={expandido ? 'unfold-less' : 'unfold-more'} size={13} color={PURPLE} type="material" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
const prv = StyleSheet.create({
  container  : { backgroundColor:CARD_BG, borderRadius:16, borderWidth:1, overflow:'hidden', marginBottom:0 },
  header     : { flexDirection:'row', alignItems:'center', gap:10, padding:14 },
  iconWrap   : { width:32, height:32, borderRadius:10, justifyContent:'center', alignItems:'center' },
  titulo     : { fontSize:13, fontWeight:'800', color:SILVER_LIGHT },
  sub        : { fontSize:10, color:SILVER_DARK, marginTop:1 },
  lista      : { paddingHorizontal:14, paddingBottom:10 },
  item       : { flexDirection:'row', alignItems:'center', paddingVertical:10, gap:10 },
  itemBorder : { borderBottomWidth:1, borderBottomColor:SILVER+'0D' },
  prodNome   : { fontSize:13, fontWeight:'700', color:SILVER_LIGHT },
  prodInfo   : { fontSize:10, color:SILVER_DARK, marginTop:1 },
  urgBadge   : { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:8, paddingVertical:3, borderRadius:8, borderWidth:1 },
  urgTxt     : { fontSize:9, fontWeight:'900' },
  urgDias    : { fontSize:9, fontWeight:'700' },
  confTxt    : { fontSize:9, fontWeight:'700', textTransform:'capitalize' },
  verMaisBtn : { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5, paddingVertical:10, borderTopWidth:1, borderTopColor:SILVER+'10', marginTop:4 },
  verMaisTxt : { fontSize:11, fontWeight:'700', color:PURPLE },
});

// Mini timeline das últimas visitas
function UltimasVisitas({ visitas, onVerTodas }) {
  if (!visitas?.length) return null;
  const ultimas = visitas.slice(0, 3);

  return (
    <View style={uv.container}>
      {ultimas.map((v, i) => {
        const comprou  = v.resultado === 'comprou';
        const retornar = v.resultado === 'retornar';
        const cor      = comprou ? SUCCESS : retornar ? WARN : DANGER;
        const icone    = comprou ? 'check-circle' : retornar ? 'schedule' : 'cancel';
        const produtos = Array.isArray(v.produtos) && v.produtos.length > 0
          ? v.produtos.map(p => PRODUTO_LABEL[p] || p).join(', ') : '';

        return (
          <View key={v.id || i} style={[uv.item, i < ultimas.length - 1 && uv.itemBorder]}>
            <View style={[uv.dot, { backgroundColor: cor }]}>
              <Icon name={icone} size={10} color="#fff" type="material" />
            </View>
            <View style={{ flex:1, marginLeft:10 }}>
              <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
                <Text style={uv.data}>{formatDataCurta(v.dataLocal)}</Text>
                <Text style={uv.hora}>{formatHora(v.dataLocal)}</Text>
                {v.tipoRegistro === 'telefone' && (
                  <Icon name="phone" size={10} color={BLUE} type="material" />
                )}
                <View style={{ flex:1 }} />
                {comprou && v.valor > 0 && <Text style={uv.valor}>{formatReal(v.valor)}</Text>}
              </View>
              {comprou && produtos ? (
                <Text style={uv.detalhe} numberOfLines={1}>{produtos}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
      {onVerTodas && (
        <TouchableOpacity style={uv.verBtn} onPress={onVerTodas} activeOpacity={0.8}>
          <Text style={uv.verBtnTxt}>Ver histórico completo</Text>
          <Icon name="chevron-right" size={14} color={PURPLE} type="material" />
        </TouchableOpacity>
      )}
    </View>
  );
}
const uv = StyleSheet.create({
  container  : { backgroundColor:CARD_BG, borderRadius:14, borderWidth:1, borderColor:SILVER+'15', overflow:'hidden', marginBottom:0 },
  item       : { flexDirection:'row', alignItems:'center', padding:12 },
  itemBorder : { borderBottomWidth:1, borderBottomColor:SILVER+'0D' },
  dot        : { width:22, height:22, borderRadius:11, justifyContent:'center', alignItems:'center', flexShrink:0 },
  data       : { fontSize:12, fontWeight:'800', color:SILVER_LIGHT },
  hora       : { fontSize:10, color:SILVER_DARK },
  valor      : { fontSize:12, fontWeight:'800', color:SUCCESS },
  detalhe    : { fontSize:10, color:SILVER_DARK, marginTop:2 },
  verBtn     : { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:4, paddingVertical:10, borderTopWidth:1, borderTopColor:SILVER+'10' },
  verBtnTxt  : { fontSize:11, fontWeight:'700', color:PURPLE },
});

// ════════════════════════════════════════════════════════════════
// TELA PRINCIPAL
// ════════════════════════════════════════════════════════════════
export default function ClienteDetalheScreen({ route, navigation }) {
  const cliente = route?.params?.cliente;

  const [todasVisitas,    setTodasVisitas]    = useState([]);
  const [orcamentos,      setOrcamentos]      = useState([]);

  // ════════════════════════════════════════════════════════════════
  // [FIX 2] Estado inicial de fotos derivado dinamicamente de TIPOS_FOTO
  // Antes: useState({ estoque:[], gondola:[], obra:[], fachada:[], geral:[] })
  // Problema: se fotoService adicionar/remover um tipo, o estado ficava
  // desincronizado — a aba aparecia mas a chave não existia no objeto.
  // Solução: reduz TIPOS_FOTO para o objeto inicial uma única vez.
  // ════════════════════════════════════════════════════════════════
  const [fotos, setFotos] = useState(
    () => TIPOS_FOTO.reduce((acc, t) => ({ ...acc, [t.key]: [] }), {})
  );

  const [sugestoes,       setSugestoes]       = useState([]);
  const [resumo,          setResumo]          = useState(null);
  const [loadingInit,     setLoadingInit]     = useState(true);
  const [loadingFotos,    setLoadingFotos]    = useState(false);
  const [loadingOrcs,     setLoadingOrcs]     = useState(false);
  const [loadingIA,       setLoadingIA]       = useState(false);
  const [visitaModal,     setVisitaModal]     = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);
  const [aiData,          setAiData]          = useState(null);
  const [previsaoRep,     setPrevisaoRep]     = useState([]);
  const [orcModalVisible, setOrcModalVisible] = useState(false);
  const [visitasCliente,  setVisitasCliente]  = useState([]);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── Carga principal ───────────────────────────────────────────
  const carregar = useCallback(async (isRefresh = false) => {
    if (!cliente?.id) return;
    if (isRefresh) setRefreshing(true);
    else           setLoadingInit(true);

    try {
      const [visitas, clts] = await Promise.all([
        getTodasVisitas(),
        getTodosClientes(),
      ]);
      setTodasVisitas(visitas || []);
      setResumo(getResumoCliente(cliente.id, visitas || []));
      setVisitasCliente(
        (visitas || [])
          .filter(v => v.clienteId === cliente.id)
          .sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0))
      );

      // ════════════════════════════════════════════════════════
      // [FIX 3] Bloco de IA isolado em try/catch próprio com
      // finally garantindo setLoadingIA(false) em qualquer cenário.
      // Antes: setLoadingIA(false) estava no bloco try principal —
      // se qualquer função do aiService lançasse, o catch externo
      // era acionado e o spinner ficava travado para sempre.
      // ════════════════════════════════════════════════════════
      setLoadingIA(true);
      try {
        setSugestoes(getSugestaoVendaIA(cliente, visitas || [], clts || []));
        setAiData(calcularPrioridadeClienteIA(cliente, visitas || [], []));
        setPrevisaoRep(preverReposicaoIA(cliente, visitas || []));
      } catch (eIA) {
        console.log('[ClienteDetalhe] aiService:', eIA);
        // Mantém estados vazios/anteriores — a tela continua funcional
      } finally {
        setLoadingIA(false);
      }

    } catch (e) {
      console.log('[ClienteDetalhe] visitas/clientes:', e);
    } finally {
      setLoadingInit(false);
      setRefreshing(false);
    }

    // Orçamentos — bloco independente (não bloqueia visitas/IA)
    setLoadingOrcs(true);
    try {
      setOrcamentos((await getOrcamentosCliente(cliente.id)) || []);
    } catch (e) {
      console.log('[ClienteDetalhe] orcamentos:', e);
    } finally {
      setLoadingOrcs(false);
    }

    // Fotos — bloco independente
    setLoadingFotos(true);
    try {
      setFotos(await getFotosPorCliente(cliente.id));
    } catch (e) {
      console.log('[ClienteDetalhe] fotos:', e);
    } finally {
      setLoadingFotos(false);
    }

    Animated.timing(fadeAnim, { toValue:1, duration:400, useNativeDriver:true }).start();
  }, [cliente?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Early return DEPOIS dos hooks ─────────────────────────────
  if (!cliente) {
    return (
      <View style={s.centro}>
        <Text style={{ color: SILVER_DARK }}>Cliente não encontrado.</Text>
      </View>
    );
  }

  const tc       = { loja: GOLD, obra: SUCCESS, distribuidor: BLUE }[cliente.tipo] || GOLD;
  const tipoIcon = TIPO_ICON[cliente.tipo] || 'store';

  // ── Adicionar foto ─────────────────────────────────────────────
  const handleAdicionarFoto = (tipo) => {
    Alert.alert('Adicionar foto', 'Escolha a origem:', [
      { text:'Câmera',   onPress: () => tirarFoto(tipo)           },
      { text:'Galeria',  onPress: () => escolherFotoGaleria(tipo) },
      { text:'Cancelar', style:'cancel' },
    ]);
  };

  const tirarFoto = async (tipo) => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permissão negada'); return; }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing:true, quality:0.7 });
      if (!result.canceled && result.assets?.[0]?.uri) await persistirFoto(tipo, result.assets[0].uri);
    } catch (e) { Alert.alert('Erro','Não foi possível abrir a câmera.'); }
  };

  const escolherFotoGaleria = async (tipo) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permissão negada'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing:true, quality:0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) await persistirFoto(tipo, result.assets[0].uri);
    } catch (e) { Alert.alert('Erro','Não foi possível abrir a galeria.'); }
  };

  const persistirFoto = async (tipo, uri) => {
    try {
      await salvarFoto({ clienteId: cliente.id, tipo, url: uri });
      setFotos(prev => ({
        ...prev,
        [tipo]: [{ id: Date.now().toString(), url: uri, dataISO: new Date().toISOString(), tipo }, ...(prev[tipo] || [])],
      }));
      Alert.alert('✅ Foto salva!');
    } catch (e) { Alert.alert('Erro','Não foi possível salvar a foto.'); }
  };

  // ── Atualizar status de orçamento ──────────────────────────────
  const handleAtualizarOrc = async (id, status) => {
    const label = status === 'aprovado' ? 'APROVADO' : 'PERDIDO';
    Alert.alert('Confirmar', `Marcar como ${label}?`, [
      { text:'Cancelar', style:'cancel' },
      { text:'Confirmar', onPress: async () => {
        try {
          await atualizarStatusOrcamento(id, status);
          setOrcamentos(prev => prev.map(o => o.id === id ? { ...o, status } : o));
        } catch (e) { Alert.alert('Erro','Não foi possível atualizar o orçamento.'); }
      }},
    ]);
  };

  // ── Compartilhar resumo ────────────────────────────────────────
  const handleCompartilhar = async () => {
    try {
      const diasSemCompra = resumo?.diasSemCompra;
      const ticketMedio   = resumo?.ticketMedio ?? 0;
      const valorTotal    = todasVisitas
        .filter(v => v.clienteId === cliente.id && v.resultado === 'comprou')
        .reduce((acc, v) => acc + (v.valor || 0), 0);
      const msg = [
        `📋 *${cliente.nome}*`,
        cliente.cidade ? `📍 ${cliente.cidade}` : '',
        `🏷 ${cliente.tipo}`,
        ``,
        `💰 Total comprado: ${formatReal(valorTotal)}`,
        `🎯 Ticket médio: ${ticketMedio > 0 ? formatReal(ticketMedio) : '—'}`,
        `⏱ Dias sem compra: ${diasSemCompra != null ? diasSemCompra + 'd' : '—'}`,
        `📊 Visitas: ${resumo?.totalVisitas ?? 0}`,
        cliente.telefone1 ? `📞 ${cliente.telefone1}` : '',
      ].filter(Boolean).join('\n');
      await Share.share({ message: msg });
    } catch (e) { console.log('[ClienteDetalhe] compartilhar:', e); }
  };

  // ── Dados calculados (via resumo de analyticsService) ─────────
  const diasSemCompra   = resumo?.diasSemCompra;
  const ticketMedio     = resumo?.ticketMedio;
  const ultimaCompraObj = resumo?.ultimaCompra;
  const diasBadgeCor    = diasSemCompra == null ? SILVER_DARK
    : diasSemCompra >= 30 ? DANGER
    : diasSemCompra >= 15 ? WARN : SUCCESS;

  // [FIX 1] Banner de orçamentos pendentes usa isOrcPendente()
  const orcsPendentes     = orcamentos.filter(isOrcPendente);
  const followupsUrgentes = getOrcamentosParaFollowup
    ? getOrcamentosParaFollowup(orcamentos).filter(o => o.urgencia === 'atrasado' || o.urgencia === 'hoje')
    : [];
  const aiScore = aiData?.score ?? 0;
  const aiCor   = aiScore >= 70 ? DANGER : aiScore >= 45 ? WARN : PURPLE;

  if (loadingInit && !refreshing) {
    return (
      <View style={s.loading}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={s.loadingTxt}>Carregando cliente...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} translucent />

      {/* ══ HEADER ══ */}
      <View style={[s.header, { borderBottomColor: tc + '30' }]}>
        <View style={[s.headerAccent, { backgroundColor: tc }]} />
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack()} activeOpacity={0.8}>
            <Icon name="arrow-back" size={20} color={SILVER} type="material" />
          </TouchableOpacity>
          <View style={[s.headerIconWrap, { backgroundColor: tc }]}>
            <Icon name={tipoIcon} size={20} color={DARK_BG} type="material" />
          </View>
          <View style={{ flex:1 }}>
            <Text style={s.headerNome} numberOfLines={1}>{cliente.nome}</Text>
            <Text style={s.headerSub}>{cliente.tipo} · {cliente.status}{cliente.cidade ? ` · ${cliente.cidade}` : ''}</Text>
          </View>
          <TouchableOpacity style={s.iconBtn} onPress={handleCompartilhar} activeOpacity={0.8}>
            <Icon name="share" size={18} color={SILVER_DARK} type="material" />
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => carregar(true)} activeOpacity={0.8}>
            <Icon name="refresh" size={18} color={refreshing ? GOLD : SILVER_DARK} type="material" />
          </TouchableOpacity>
        </View>

        {/* Banner IA */}
        {aiScore >= 45 && aiData?.motivos?.[0] && (
          <View style={[s.iaBanner, { borderColor:aiCor+'35', backgroundColor:aiCor+'0C' }]}>
            <Icon name="auto-awesome" size={12} color={aiCor} type="material" />
            <Text style={[s.iaBannerTxt, { color:aiCor }]}>{aiData.motivos[0]}</Text>
            <View style={[s.iaScoreBadge, { backgroundColor:aiCor+'20', borderColor:aiCor+'40' }]}>
              <Text style={[s.iaScoreTxt, { color:aiCor }]}>Score {aiScore}</Text>
            </View>
          </View>
        )}

        {/* Banner orçamentos pendentes — [FIX 1] usa orcsPendentes filtrado por isOrcPendente */}
        {orcsPendentes.length > 0 && (
          <View style={[s.orcBanner, { borderColor: BLUE + '40', backgroundColor: BLUE + '10' }]}>
            <Icon name="request-quote" size={13} color={BLUE} type="material" />
            <Text style={s.orcBannerTxt}>
              {`${orcsPendentes.length} orçamento${orcsPendentes.length > 1 ? 's' : ''} pendente${orcsPendentes.length > 1 ? 's' : ''} de acompanhamento`}
            </Text>
          </View>
        )}

        {/* Banner follow-up urgente */}
        {followupsUrgentes.length > 0 && (
          <View style={[s.orcBanner, { borderColor:DANGER+'40', backgroundColor:DANGER+'10' }]}>
            <Icon name="notifications-active" size={13} color={DANGER} type="material" />
            <Text style={[s.orcBannerTxt, { color:DANGER }]}>
              {`⚠ ${followupsUrgentes.length} follow-up${followupsUrgentes.length > 1 ? 's' : ''} atrasado${followupsUrgentes.length > 1 ? 's' : ''}`}
            </Text>
          </View>
        )}
      </View>

      <Animated.ScrollView
        style={{ opacity: fadeAnim }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => carregar(true)} tintColor={GOLD} colors={[GOLD]} />
        }>

        {/* ══ ✅ CHECKLIST: Resumo cliente — KPIs ══ */}
        <View style={s.kpiRow}>
          <KpiCard
            icon="receipt"
            label="Última compra"
            value={ultimaCompraObj ? formatData(ultimaCompraObj.dataLocal || ultimaCompraObj.data) : '—'}
            color={ultimaCompraObj ? SUCCESS : SILVER_DARK}
          />
          <KpiCard
            icon="schedule"
            label="Dias sem compra"
            value={diasSemCompra != null ? `${diasSemCompra}d` : '—'}
            color={diasBadgeCor}
          />
          <KpiCard
            icon="receipt-long"
            label="Ticket médio"
            value={ticketMedio > 0 ? (ticketMedio >= 1000 ? `R$ ${(ticketMedio / 1000).toFixed(1)}k` : `R$ ${Math.round(ticketMedio)}`) : '—'}
            color={GOLD}
            sub={resumo?.totalCompras > 0 ? `${resumo.totalCompras} compras` : undefined}
          />
        </View>

        <View style={s.kpiRow}>
          <KpiCard icon="history"      label="Total visitas" value={resumo?.totalVisitas ?? '—'} color={BLUE} />
          <KpiCard
            icon="trending-up"
            label="Vendas no mês"
            value={resumo?.totalMes > 0 ? formatReal(resumo.totalMes) : '—'}
            color={resumo?.totalMes > 0 ? SUCCESS : SILVER_DARK}
          />
          <KpiCard
            icon="event-repeat"
            label="Freq. visitas"
            value={resumo?.frequenciaVisitas != null ? `${resumo.frequenciaVisitas}d` : '—'}
            sub="ciclo médio"
            color={PURPLE}
          />
        </View>

        {/* ══ ✅ CHECKLIST: Sugestão automática ══ */}
        <SugestaoVenda sugestoes={sugestoes} loading={loadingIA} />

        {/* Previsão de reposição IA */}
        {previsaoRep.length > 0 && (
          <>
            <Text style={s.secaoTitulo}>Reposição Prevista</Text>
            <View style={s.secaoCard}>
              <CardPrevisaoReposicao previsoes={previsaoRep} />
            </View>
          </>
        )}

        {/* ── Ações rápidas ── */}
        <View style={s.acoesRow}>
          <TouchableOpacity
            style={[s.acaoBtn, { backgroundColor: SUCCESS + '18', borderColor: SUCCESS + '40', flex:2 }]}
            onPress={() => setVisitaModal(true)}
            activeOpacity={0.85}>
            <Icon name="pin-drop" size={18} color={SUCCESS} type="material" />
            <Text style={[s.acaoBtnTxt, { color: SUCCESS }]}>Check-in / Visita</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.acaoBtn, { backgroundColor: GOLD + '18', borderColor: GOLD + '40', flex:1 }]}
            onPress={() => navigation?.navigate?.('EditarCliente', { cliente })}
            activeOpacity={0.85}>
            <Icon name="edit" size={16} color={GOLD} type="material" />
            <Text style={[s.acaoBtnTxt, { color: GOLD }]}>Editar</Text>
          </TouchableOpacity>
          {cliente.latitude && cliente.longitude ? (
            <TouchableOpacity
              style={[s.acaoBtn, { backgroundColor: BLUE + '18', borderColor: BLUE + '40', flex:1 }]}
              onPress={() => Linking.openURL(`waze://ul?ll=${cliente.latitude},${cliente.longitude}&navigate=yes`)}
              activeOpacity={0.85}>
              <Icon name="navigation" size={16} color={BLUE} type="material" />
              <Text style={[s.acaoBtnTxt, { color: BLUE }]}>Rota</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={[s.acoesRow, { marginTop: -4 }]}>
          <TouchableOpacity
            style={[s.acaoBtn, { backgroundColor: PURPLE + '18', borderColor: PURPLE + '40', flex:1 }]}
            onPress={() => navigation?.navigate?.('HistoricoCliente', { cliente })}
            activeOpacity={0.85}>
            <Icon name="history" size={16} color={PURPLE} type="material" />
            <Text style={[s.acaoBtnTxt, { color: PURPLE }]}>Histórico</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.acaoBtn, { backgroundColor: BLUE + '18', borderColor: BLUE + '40', flex:1 }]}
            onPress={() => setOrcModalVisible(true)}
            activeOpacity={0.85}>
            <Icon name="request-quote" size={16} color={BLUE} type="material" />
            <Text style={[s.acaoBtnTxt, { color: BLUE }]}>Novo orçamento</Text>
          </TouchableOpacity>
          {cliente.telefone1 && (
            <TouchableOpacity
              style={[s.acaoBtn, { backgroundColor: SUCCESS + '18', borderColor: SUCCESS + '40', flex:1 }]}
              onPress={() => Linking.openURL(`tel:${cliente.telefone1.replace(/\D/g,'')}`)}
              activeOpacity={0.85}>
              <Icon name="phone" size={16} color={SUCCESS} type="material" />
              <Text style={[s.acaoBtnTxt, { color: SUCCESS }]}>Ligar</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Mini timeline */}
        {visitasCliente.length > 0 && (
          <>
            <Text style={s.secaoTitulo}>Últimas visitas</Text>
            <View style={s.secaoCard}>
              <UltimasVisitas
                visitas={visitasCliente}
                onVerTodas={() => navigation?.navigate?.('HistoricoCliente', { cliente })}
              />
            </View>
          </>
        )}

        {/* ══ ✅ CHECKLIST: Fotos ══ */}
        <Text style={s.secaoTitulo}>Fotos</Text>
        <GaleriaFotos
          fotos={fotos}
          onAdicionarFoto={handleAdicionarFoto}
          loading={loadingFotos}
        />

        {/* ══ ✅ CHECKLIST: Orçamentos ══ */}
        <View style={s.secaoHeaderRow}>
          <Text style={s.secaoTitulo}>
            Orçamentos{orcamentos.length > 0 ? ` (${orcamentos.length})` : ''}
          </Text>
          <TouchableOpacity
            onPress={() => navigation?.navigate?.('Orcamentos', { cliente })}
            activeOpacity={0.8}
            style={s.secaoVerBtn}>
            <Text style={s.secaoVerTxt}>Ver todos</Text>
            <Icon name="chevron-right" size={14} color={SILVER_DARK} type="material" />
          </TouchableOpacity>
        </View>
        <View style={s.secaoCard}>
          <ListaOrcamentos orcamentos={orcamentos} loading={loadingOrcs} onAtualizar={handleAtualizarOrc} />
        </View>

        {/* Informações do cliente */}
        <Text style={s.secaoTitulo}>Informações</Text>
        <View style={s.secaoCard}>
          {[
            { label:'Telefone 1',   icon:'phone',                val:cliente.telefone1,     color:SILVER_DARK },
            { label:'Telefone 2',   icon:'phone',                val:cliente.telefone2,     color:SILVER_DARK },
            { label:'Email',        icon:'email',                val:cliente.email,         color:BLUE        },
            { label:'CNPJ',         icon:'business',             val:cliente.cnpj,          color:SILVER_DARK },
            { label:'Endereço',     icon:'location-on',          val:cliente.endereco,      color:SILVER_DARK },
            { label:'Lembrete',     icon:'notifications-active', val:cliente.lembrete,      color:WARN        },
            { label:'Próx. visita', icon:'event',                val:cliente.proximaVisita, color:GOLD        },
            { label:'Observações',  icon:'notes',                val:cliente.observacoes,   color:SILVER_DARK },
          ].filter(x => x.val).map(x => (
            <View key={x.label} style={si.row}>
              <Icon name={x.icon} size={14} color={x.color} type="material" />
              <View style={{ flex:1, marginLeft:10 }}>
                <Text style={si.label}>{x.label}</Text>
                <Text style={[si.valor, { color:x.color }]}>{x.val}</Text>
              </View>
              {(x.label === 'Telefone 1' || x.label === 'Telefone 2') && x.val && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`tel:${x.val.replace(/\D/g,'')}`)}
                  style={si.callBtn}
                  activeOpacity={0.8}>
                  <Icon name="phone" size={14} color={SUCCESS} type="material" />
                </TouchableOpacity>
              )}
              {(x.label === 'Telefone 1' || x.label === 'Telefone 2') && x.val && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`https://wa.me/55${x.val.replace(/\D/g,'')}`)}
                  style={[si.callBtn, { marginLeft:4 }]}
                  activeOpacity={0.8}>
                  <Icon name="chat" size={14} color={BLUE} type="material" />
                </TouchableOpacity>
              )}
            </View>
          ))}

          {['FORTLEV','AFORT','METAL TECK','TINTAS S.'].filter(f => cliente.fornecedores?.[f]).length > 0 && (
            <View style={si.row}>
              <Icon name="check-circle" size={14} color={SUCCESS} type="material" />
              <View style={{ flex:1, marginLeft:10 }}>
                <Text style={si.label}>Fornecimento atual</Text>
                <Text style={[si.valor, { color:SUCCESS }]}>
                  {['FORTLEV','AFORT','METAL TECK','TINTAS S.'].filter(f => cliente.fornecedores?.[f]).join(' · ')}
                </Text>
              </View>
            </View>
          )}

          <View style={si.row}>
            <Icon name={cliente.latitude ? 'gps-fixed' : 'gps-off'} size={14} color={cliente.latitude ? SUCCESS : SILVER_DARK} type="material" />
            <View style={{ flex:1, marginLeft:10 }}>
              <Text style={si.label}>Localização GPS</Text>
              <Text style={[si.valor, { color: cliente.latitude ? SUCCESS : SILVER_DARK }]}>
                {cliente.latitude
                  ? `${parseFloat(cliente.latitude).toFixed(5)}, ${parseFloat(cliente.longitude).toFixed(5)}`
                  : 'Não cadastrado'}
              </Text>
            </View>
            {cliente.latitude && (
              <TouchableOpacity
                onPress={() => Share.share({ message:`📍 *${cliente.nome}*\nhttps://www.google.com/maps/search/?api=1&query=${cliente.latitude},${cliente.longitude}` })}>
                <Icon name="share" size={16} color={SILVER_DARK} type="material" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={{ height:80 }} />
      </Animated.ScrollView>

      <VisitaModal
        visible={visitaModal}
        cliente={cliente}
        onClose={() => setVisitaModal(false)}
        onSaved={() => { setVisitaModal(false); Alert.alert('✅ Visita registrada!'); carregar(); }}
      />

      <OrcamentoModal
        visible={orcModalVisible}
        cliente={cliente}
        orcamento={null}
        onClose={() => setOrcModalVisible(false)}
        onSaved={() => { setOrcModalVisible(false); Alert.alert('✅ Orçamento criado!'); carregar(); }}
      />
    </View>
  );
}

// ── STYLES ─────────────────────────────────────────────────────
const si = StyleSheet.create({
  row    : { flexDirection:'row', alignItems:'flex-start', paddingVertical:10, borderBottomWidth:1, borderBottomColor:SILVER+'0D' },
  label  : { fontSize:9, color:SILVER_DARK, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.5, marginBottom:2 },
  valor  : { fontSize:13, fontWeight:'600' },
  callBtn: { width:28, height:28, borderRadius:9, backgroundColor:SUCCESS+'15', justifyContent:'center', alignItems:'center' },
});

const s = StyleSheet.create({
  container    : { flex:1, backgroundColor:DARK_BG },
  loading      : { flex:1, backgroundColor:DARK_BG, justifyContent:'center', alignItems:'center', gap:12 },
  loadingTxt   : { color:SILVER, fontSize:14, fontWeight:'600' },
  centro       : { flex:1, backgroundColor:DARK_BG, justifyContent:'center', alignItems:'center' },
  scroll       : { paddingHorizontal:16, paddingTop:12 },

  header       : { backgroundColor:'#001828', borderBottomWidth:1, paddingBottom:12, elevation:10, shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.25, shadowRadius:10 },
  headerAccent : { height:3 },
  headerRow    : { flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:14, paddingTop:44, paddingBottom:10 },
  backBtn      : { width:36, height:36, borderRadius:18, backgroundColor:CARD_BG2, justifyContent:'center', alignItems:'center' },
  headerIconWrap:{ width:40, height:40, borderRadius:13, justifyContent:'center', alignItems:'center' },
  headerNome   : { fontSize:18, fontWeight:'900', color:SILVER_LIGHT },
  headerSub    : { fontSize:10, color:SILVER_DARK, marginTop:1, textTransform:'capitalize' },
  iconBtn      : { width:36, height:36, borderRadius:18, backgroundColor:CARD_BG2, justifyContent:'center', alignItems:'center' },
  orcBanner    : { flexDirection:'row', alignItems:'center', gap:8, marginHorizontal:14, marginBottom:6, paddingHorizontal:12, paddingVertical:7, borderRadius:10, borderWidth:1 },
  orcBannerTxt : { fontSize:11, color:SILVER, flex:1, fontWeight:'600' },
  iaBanner     : { flexDirection:'row', alignItems:'center', gap:8, marginHorizontal:14, marginBottom:6, paddingHorizontal:12, paddingVertical:6, borderRadius:10, borderWidth:1 },
  iaBannerTxt  : { flex:1, fontSize:11, fontWeight:'700' },
  iaScoreBadge : { paddingHorizontal:8, paddingVertical:3, borderRadius:8, borderWidth:1 },
  iaScoreTxt   : { fontSize:10, fontWeight:'900' },

  kpiRow       : { flexDirection:'row', marginBottom:10 },

  acoesRow     : { flexDirection:'row', gap:8, marginBottom:14 },
  acaoBtn      : { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:12, borderRadius:13, borderWidth:1 },
  acaoBtnTxt   : { fontSize:12, fontWeight:'800' },

  secaoTitulo    : { fontSize:13, fontWeight:'800', color:SILVER_LIGHT, letterSpacing:0.2, marginBottom:8, marginTop:6 },
  secaoCard      : { backgroundColor:CARD_BG, borderRadius:16, borderWidth:1, borderColor:SILVER+'12', padding:14, marginBottom:14 },
  secaoHeaderRow : { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:6, marginBottom:8 },
  secaoVerBtn    : { flexDirection:'row', alignItems:'center', gap:2 },
  secaoVerTxt    : { fontSize:11, fontWeight:'600', color:SILVER_DARK },
});