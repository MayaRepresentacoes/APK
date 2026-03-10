import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Dimensions, StatusBar, Animated,
} from 'react-native';
import { Icon } from 'react-native-elements';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const { width: SW } = Dimensions.get('window');

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

const FORNECEDORES = ['FORTLEV', 'AFORT', 'METAL TECK', 'TINTAS S.'];

const getResultadoColor = (r) =>
  r === 'comprou' ? SUCCESS : r === 'nao_comprou' ? DANGER : WARN;

const getResultadoLabel = (r) =>
  r === 'comprou' ? 'Comprou' : r === 'nao_comprou' ? 'Não comprou' : 'Retornar';

const getResultadoIcon = (r) =>
  r === 'comprou' ? 'check-circle' : r === 'nao_comprou' ? 'cancel' : 'schedule';

function ShimmerLine({ color = GOLD }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(anim, { toValue: 1, duration: 2200, useNativeDriver: true })).start();
  }, []);
  return (
    <View style={{ height: 2, width: '100%', backgroundColor: color + '30', overflow: 'hidden' }}>
      <Animated.View style={{ position: 'absolute', height: '100%', width: 80, backgroundColor: color + 'CC', transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-80, SW] }) }] }} />
    </View>
  );
}

// ── KPI CARD ──────────────────────────────────────────────────
function KpiCard({ icon, value, label, color = GOLD, sub }) {
  return (
    <View style={[kc.card, { borderColor: color + '30' }]}>
      <View style={[kc.icon, { backgroundColor: color + '18' }]}>
        <Icon name={icon} size={20} color={color} type="material" />
      </View>
      <Text style={[kc.value, { color }]}>{value}</Text>
      <Text style={kc.label}>{label}</Text>
      {sub ? <Text style={kc.sub}>{sub}</Text> : null}
    </View>
  );
}
const kc = StyleSheet.create({
  card:  { flex: 1, alignItems: 'center', backgroundColor: CARD_BG, borderRadius: 16, padding: 14, borderWidth: 1, marginHorizontal: 4 },
  icon:  { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  value: { fontSize: 22, fontWeight: 'bold' },
  label: { fontSize: 10, color: SILVER_DARK, marginTop: 2, textAlign: 'center', letterSpacing: 0.3 },
  sub:   { fontSize: 10, color: SILVER_DARK + '80', marginTop: 1 },
});

// ── BARRA DE FORNECEDOR ───────────────────────────────────────
function FornBar({ nome, count, total, color = GOLD }) {
  const pct = total > 0 ? count / total : 0;
  const barAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(barAnim, { toValue: pct, friction: 8, useNativeDriver: false }).start();
  }, [pct]);
  return (
    <View style={fb.wrap}>
      <View style={fb.labelRow}>
        <Text style={fb.nome}>{nome}</Text>
        <Text style={[fb.count, { color }]}>{count} <Text style={fb.pct}>({(pct * 100).toFixed(0)}%)</Text></Text>
      </View>
      <View style={fb.track}>
        <Animated.View style={[fb.fill, { backgroundColor: color, width: barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
    </View>
  );
}
const fb = StyleSheet.create({
  wrap:     { marginBottom: 12 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  nome:     { fontSize: 13, fontWeight: '600', color: SILVER_LIGHT },
  count:    { fontSize: 13, fontWeight: 'bold' },
  pct:      { fontSize: 11, fontWeight: '400', color: SILVER_DARK },
  track:    { height: 8, backgroundColor: CARD_BG2, borderRadius: 4, overflow: 'hidden' },
  fill:     { height: '100%', borderRadius: 4 },
});

// ── CARD DE VISITA ────────────────────────────────────────────
function VisitaCard({ item }) {
  const color = getResultadoColor(item.resultado);
  const fornAtivos = FORNECEDORES.filter(f => item.fornecedores?.[f]);
  return (
    <View style={[vc.card, { borderColor: color + '30' }]}>
      <View style={[vc.topBar, { backgroundColor: color }]} />
      <View style={vc.content}>
        <View style={vc.row}>
          <View style={[vc.iconWrap, { backgroundColor: color + '18' }]}>
            <Icon name={getResultadoIcon(item.resultado)} size={18} color={color} type="material" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={vc.nome}>{item.clienteNome}</Text>
            <Text style={vc.data}>{item.dataFormatada || '—'}</Text>
          </View>
          <View style={[vc.badge, { backgroundColor: color + '18', borderColor: color + '50' }]}>
            <Text style={[vc.badgeTxt, { color }]}>{getResultadoLabel(item.resultado)}</Text>
          </View>
        </View>

        {/* Fornecedores comprados */}
        {fornAtivos.length > 0 && (
          <View style={vc.tagRow}>
            {fornAtivos.map(f => (
              <View key={f} style={vc.tag}>
                <Text style={vc.tagTxt}>{f}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Motivo não compra */}
        {item.motivo ? (
          <View style={vc.infoRow}>
            <Icon name="info-outline" size={12} color={SILVER_DARK} type="material" />
            <Text style={vc.infoTxt}>Motivo: {item.motivo}</Text>
          </View>
        ) : null}

        {/* Interesse */}
        {item.interesse ? (
          <View style={vc.infoRow}>
            <Icon name="trending-up" size={12} color={SILVER_DARK} type="material" />
            <Text style={vc.infoTxt}>Interesse futuro: {item.interesse}</Text>
          </View>
        ) : null}

        {/* Observações */}
        {item.observacoes ? (
          <View style={vc.infoRow}>
            <Icon name="notes" size={12} color={SILVER_DARK} type="material" />
            <Text style={vc.infoTxt} numberOfLines={2}>{item.observacoes}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
const vc = StyleSheet.create({
  card:    { backgroundColor: CARD_BG, borderRadius: 16, marginBottom: 10, borderWidth: 1, overflow: 'hidden' },
  topBar:  { height: 3 },
  content: { padding: 14 },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  iconWrap:{ width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  nome:    { fontSize: 14, fontWeight: 'bold', color: SILVER_LIGHT },
  data:    { fontSize: 11, color: SILVER_DARK, marginTop: 2 },
  badge:   { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  badgeTxt:{ fontSize: 10, fontWeight: '700' },
  tagRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  tag:     { backgroundColor: GOLD + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: GOLD + '40' },
  tagTxt:  { fontSize: 10, fontWeight: '700', color: GOLD },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  infoTxt: { fontSize: 11, color: SILVER_DARK, flex: 1 },
});

// ════════════════════════════════════════════════════════════
export default function VisitasScreen() {
  const [visitas,    setVisitas]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [exportando, setExportando] = useState(false);
  const [filtro,     setFiltro]     = useState('todos'); // 'todos' | 'comprou' | 'nao_comprou' | 'retornar'

  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerAnim, { toValue: 1, duration: 700, useNativeDriver: true }).start();
    loadVisitas();
  }, []);

  const loadVisitas = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'visitas'));
      const data = [];
      snap.forEach(d => data.push({ id: d.id, ...d.data() }));
      // Ordena por data local (mais recente primeiro)
      data.sort((a, b) => {
        const da = new Date(a.dataLocal || 0);
        const db2 = new Date(b.dataLocal || 0);
        return db2 - da;
      });
      setVisitas(data);
    } catch (e) { console.log('Erro visitas:', e); }
    finally { setLoading(false); }
  };

  // ── MÉTRICAS ───────────────────────────────────────────────
  const total       = visitas.length;
  const compraram   = visitas.filter(v => v.resultado === 'comprou').length;
  const naoCompraram= visitas.filter(v => v.resultado === 'nao_comprou').length;
  const retornar    = visitas.filter(v => v.resultado === 'retornar').length;
  const taxaConversao = total > 0 ? ((compraram / total) * 100).toFixed(0) : '0';

  // Ranking de fornecedores
  const fornRanking = FORNECEDORES.map(f => ({
    nome: f,
    count: visitas.filter(v => v.fornecedores?.[f]).length,
  })).sort((a, b) => b.count - a.count);

  // Motivos mais frequentes
  const motivosMap = {};
  visitas.filter(v => v.motivo).forEach(v => {
    motivosMap[v.motivo] = (motivosMap[v.motivo] || 0) + 1;
  });
  const motivosRank = Object.entries(motivosMap).sort((a, b) => b[1] - a[1]);

  const visitasFiltradas = filtro === 'todos'
    ? visitas
    : visitas.filter(v => v.resultado === filtro);

  // ── EXPORTAR PDF ───────────────────────────────────────────
  const exportarPDF = async () => {
    setExportando(true);
    try {
      const fornCols = FORNECEDORES.map(f => `<th>${f}</th>`).join('');
      const linhas = visitas.map((v, i) => {
        const forn = FORNECEDORES.map(f =>
          `<td style="text-align:center">${v.fornecedores?.[f] ? '✓' : '—'}</td>`
        ).join('');
        const cor = v.resultado === 'comprou' ? '#4CAF50' : v.resultado === 'nao_comprou' ? '#EF5350' : '#FF9800';
        const label = getResultadoLabel(v.resultado);
        return `
          <tr style="background:${i % 2 === 0 ? '#f8f9fa' : '#ffffff'}">
            <td>${v.dataFormatada || '—'}</td>
            <td><b>${v.clienteNome || '—'}</b></td>
            <td><span style="color:${cor};font-weight:bold">${label}</span></td>
            ${forn}
            <td>${v.motivo || '—'}</td>
            <td>${v.interesse || '—'}</td>
            <td>${v.observacoes || '—'}</td>
          </tr>`;
      }).join('');

      const fornRankHtml = fornRanking.map(f =>
        `<li><b>${f.nome}</b>: ${f.count} venda(s) — ${total > 0 ? ((f.count / total) * 100).toFixed(0) : 0}%</li>`
      ).join('');

      const motivosHtml = motivosRank.length > 0
        ? motivosRank.map(([m, c]) => `<li>${m}: <b>${c}x</b></li>`).join('')
        : '<li>Nenhum motivo registrado</li>';

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #333; font-size: 11px; }
    h1   { color: #001E2E; font-size: 20px; margin-bottom: 4px; }
    h2   { color: #001E2E; font-size: 14px; margin: 20px 0 8px; border-bottom: 2px solid #E8B432; padding-bottom: 4px; }
    p    { color: #666; margin-bottom: 16px; }
    .kpis { display: flex; gap: 12px; margin-bottom: 20px; }
    .kpi  { flex: 1; background: #f0f4f8; border-radius: 10px; padding: 12px; text-align: center; }
    .kpi-val  { font-size: 26px; font-weight: bold; color: #001E2E; }
    .kpi-lbl  { font-size: 10px; color: #666; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th  { background: #001E2E; color: #E8B432; padding: 8px 6px; text-align: left; }
    td  { padding: 6px; border-bottom: 1px solid #eee; vertical-align: top; }
    ul  { margin: 0; padding-left: 20px; line-height: 1.8; }
    .cols2 { display: flex; gap: 24px; margin-bottom: 20px; }
    .cols2 > div { flex: 1; }
  </style>
</head>
<body>
  <h1>📋 Relatório de Visitas — MAYA Representações</h1>
  <p>Gerado em ${new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' })} · ${total} visita(s) registrada(s)</p>

  <div class="kpis">
    <div class="kpi"><div class="kpi-val">${total}</div><div class="kpi-lbl">Total de visitas</div></div>
    <div class="kpi"><div class="kpi-val" style="color:#4CAF50">${compraram}</div><div class="kpi-lbl">Compraram</div></div>
    <div class="kpi"><div class="kpi-val" style="color:#EF5350">${naoCompraram}</div><div class="kpi-lbl">Não compraram</div></div>
    <div class="kpi"><div class="kpi-val" style="color:#FF9800">${retornar}</div><div class="kpi-lbl">Retornar</div></div>
    <div class="kpi"><div class="kpi-val" style="color:#E8B432">${taxaConversao}%</div><div class="kpi-lbl">Taxa de conversão</div></div>
  </div>

  <div class="cols2">
    <div>
      <h2>🏆 Ranking de Fornecedores</h2>
      <ul>${fornRankHtml}</ul>
    </div>
    <div>
      <h2>❌ Motivos de Não Compra</h2>
      <ul>${motivosHtml}</ul>
    </div>
  </div>

  <h2>📝 Histórico Detalhado</h2>
  <table>
    <thead>
      <tr>
        <th>Data/Hora</th><th>Cliente</th><th>Resultado</th>
        ${fornCols}
        <th>Motivo</th><th>Interesse</th><th>Observações</th>
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
  </table>
</body>
</html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Relatório de Visitas MAYA' });
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível gerar o PDF.');
      console.log(e);
    } finally { setExportando(false); }
  };

  const FILTROS = [
    { key: 'todos',       label: 'Todas',       color: GOLD    },
    { key: 'comprou',     label: 'Compraram',   color: SUCCESS },
    { key: 'nao_comprou', label: 'Não comprou', color: DANGER  },
    { key: 'retornar',    label: 'Retornar',    color: WARN    },
  ];

  return (
    <View style={ds.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} />

      {/* ══ HEADER ══ */}
      <Animated.View style={[ds.header, {
        opacity: headerAnim,
        transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
      }]}>
        <View style={ds.headerTop}>
          <View style={ds.headerLeft}>
            <View style={ds.headerIcon}>
              <Icon name="bar-chart" size={20} color={DARK_BG} type="material" />
            </View>
            <View>
              <Text style={ds.headerTitle}>Visitas</Text>
              <Text style={ds.headerSub}>{total} registros • taxa {taxaConversao}% conversão</Text>
            </View>
          </View>
          <TouchableOpacity style={ds.pdfBtn} onPress={exportarPDF} disabled={exportando} activeOpacity={0.8}>
            <Icon name="picture-as-pdf" size={15} color={DARK_BG} type="material" />
            <Text style={ds.pdfBtnTxt}>{exportando ? '...' : 'PDF'}</Text>
          </TouchableOpacity>
        </View>
        <ShimmerLine />

        {/* KPIs */}
        <View style={ds.kpiRow}>
          <KpiCard icon="check-circle"  value={compraram}    label="Compraram"   color={SUCCESS} sub={`${taxaConversao}% conv.`} />
          <KpiCard icon="cancel"        value={naoCompraram} label="Não comprou" color={DANGER} />
          <KpiCard icon="schedule"      value={retornar}     label="Retornar"    color={WARN} />
        </View>
      </Animated.View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>

        {/* ── RANKING FORNECEDORES ── */}
        {compraram > 0 && (
          <View style={ds.section}>
            <View style={ds.sectionHeader}>
              <View style={ds.sectionBar} />
              <Text style={ds.sectionTitle}>Fornecedores mais vendidos</Text>
            </View>
            <View style={ds.sectionBody}>
              {fornRanking.map((f, i) => (
                <FornBar key={f.nome} nome={f.nome} count={f.count} total={compraram}
                  color={i === 0 ? GOLD : i === 1 ? SILVER : SILVER_DARK} />
              ))}
            </View>
          </View>
        )}

        {/* ── MOTIVOS NÃO COMPRA ── */}
        {motivosRank.length > 0 && (
          <View style={ds.section}>
            <View style={ds.sectionHeader}>
              <View style={[ds.sectionBar, { backgroundColor: DANGER }]} />
              <Text style={ds.sectionTitle}>Motivos de não compra</Text>
            </View>
            <View style={ds.sectionBody}>
              {motivosRank.map(([m, c]) => (
                <View key={m} style={ds.motivoRow}>
                  <Icon name="info-outline" size={14} color={DANGER} type="material" />
                  <Text style={ds.motivoNome}>{m}</Text>
                  <View style={ds.motivoBadge}>
                    <Text style={ds.motivoCount}>{c}x</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── FILTRO ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ds.filtrosScroll}>
          {FILTROS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[ds.filtroChip, filtro === f.key && { backgroundColor: f.color, borderColor: f.color }]}
              onPress={() => setFiltro(f.key)} activeOpacity={0.8}>
              <Text style={[ds.filtroTxt, { color: filtro === f.key ? DARK_BG : f.color }]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── LISTA DE VISITAS ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          {loading ? (
            <View style={ds.emptyWrap}>
              <Icon name="hourglass-empty" size={40} color={GOLD + '60'} type="material" />
              <Text style={ds.emptyTxt}>Carregando visitas...</Text>
            </View>
          ) : visitasFiltradas.length === 0 ? (
            <View style={ds.emptyWrap}>
              <Icon name="event-busy" size={52} color={GOLD + '40'} type="material" />
              <Text style={ds.emptyTitle}>Nenhuma visita registrada</Text>
              <Text style={ds.emptyTxt}>Use o Check-in nos cards de clientes{'\n'}ou durante a rota</Text>
            </View>
          ) : (
            visitasFiltradas.map(v => <VisitaCard key={v.id} item={v} />)
          )}
        </View>

      </ScrollView>
    </View>
  );
}

const ds = StyleSheet.create({
  container:    { flex: 1, backgroundColor: DARK_BG },
  header:       { backgroundColor: '#001828', paddingBottom: 16, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, shadowColor: GOLD, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 10 },
  headerTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon:   { width: 42, height: 42, borderRadius: 21, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center' },
  headerTitle:  { fontSize: 24, fontWeight: 'bold', color: SILVER_LIGHT },
  headerSub:    { fontSize: 11, color: SILVER_DARK, marginTop: 2 },
  pdfBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: GOLD, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, shadowColor: GOLD, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 5 },
  pdfBtnTxt:    { fontSize: 12, fontWeight: 'bold', color: DARK_BG },
  kpiRow:       { flexDirection: 'row', marginHorizontal: 16, marginTop: 12, gap: 0 },

  // Seções
  section:      { marginHorizontal: 16, marginTop: 18 },
  sectionHeader:{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  sectionBar:   { width: 4, height: 18, borderRadius: 2, backgroundColor: GOLD },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: SILVER_LIGHT },
  sectionBody:  { backgroundColor: CARD_BG, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: GOLD + '20' },

  // Motivos
  motivoRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  motivoNome:   { flex: 1, fontSize: 13, color: SILVER_LIGHT },
  motivoBadge:  { backgroundColor: DANGER + '18', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: DANGER + '40' },
  motivoCount:  { fontSize: 12, fontWeight: 'bold', color: DANGER },

  // Filtros
  filtrosScroll:{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 4, gap: 8, flexDirection: 'row' },
  filtroChip:   { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: CARD_BG, borderWidth: 1, borderColor: SILVER + '30' },
  filtroTxt:    { fontSize: 12, fontWeight: '700' },

  // Empty
  emptyWrap:    { paddingTop: 60, alignItems: 'center' },
  emptyTitle:   { fontSize: 16, fontWeight: 'bold', color: SILVER, marginTop: 16 },
  emptyTxt:     { fontSize: 12, color: SILVER_DARK, marginTop: 6, textAlign: 'center', lineHeight: 18 },
});