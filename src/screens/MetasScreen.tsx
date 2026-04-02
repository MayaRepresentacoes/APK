// screens/MetasScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, StatusBar,
  Animated, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { Icon } from 'react-native-elements';
import { getMetas, saveMetas } from '../services/firebase';
import { getTodasVisitas }     from '../services/visitaService';

const GOLD='#E8B432', SILVER='#C0D2E6';
const SILVER_LIGHT='#E8EEF5', SILVER_DARK='#8A9BB0';
const DARK_BG='#001E2E', CARD_BG='#002840', CARD_BG2='#003352', MODAL_BG='#001828';
const SUCCESS='#4CAF50', DANGER='#EF5350', WARN='#FF9800', BLUE='#5BA3D0', PURPLE='#C56BF0';

const REPRESENTADAS_PADRAO = [
  { key:'FORTLEV',       label:'FORTLEV',        icon:'water',     color:BLUE        },
  { key:'AFORT',         label:'AFORT',           icon:'plumbing',  color:GOLD        },
  { key:'METAL TECH',    label:'METAL TECH',      icon:'settings',  color:SUCCESS     },
  { key:'SOARES TINTAS', label:'SOARES TINTAS',   icon:'warehouse', color:PURPLE      },
  { key:'geral',         label:'Geral / Outros',  icon:'category',  color:SILVER_DARK },
];

const MESES_NOME = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

function getVendidasPorRepresentada(visitas, mesAtual, anoAtual) {
  const resultado = {};
  visitas.forEach(v => {
    if (v.resultado !== 'comprou') return;
    const d = new Date(v.dataLocal || v.data || 0);
    if (d.getMonth() !== mesAtual || d.getFullYear() !== anoAtual) return;
    const rep = v.representada || 'geral';
    const val = parseFloat(v.valor || v.valorVenda || 0);
    resultado[rep] = (resultado[rep] || 0) + val;
  });
  return resultado;
}

function formatReal(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits:2 });
}

function parseMoeda(str) {
  const num = parseFloat(String(str).replace(/\./g,'').replace(',','.'));
  return isNaN(num) ? 0 : num;
}

function BarraProgresso({ pct, cor, animado = true }) {
  const widthAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(widthAnim, { toValue:Math.min(pct,100), duration:800, useNativeDriver:false }).start();
  }, [pct]);
  const barWidth = animado
    ? widthAnim.interpolate({ inputRange:[0,100], outputRange:['0%','100%'] })
    : `${Math.min(pct,100)}%`;
  return (
    <View style={bp.bg}>
      <Animated.View style={[bp.fill, { width:barWidth, backgroundColor:cor }]} />
    </View>
  );
}
const bp = StyleSheet.create({
  bg  : { height:8, backgroundColor:CARD_BG2, borderRadius:6, overflow:'hidden', flex:1 },
  fill: { height:'100%', borderRadius:6 },
});

function CardMeta({ rep, meta, vendido, onEditar }) {
  const pct    = meta > 0 ? Math.round((vendido / meta) * 100) : 0;
  const cor    = pct >= 100 ? SUCCESS : pct >= 60 ? GOLD : pct >= 30 ? WARN : DANGER;
  const faltam = Math.max(meta - vendido, 0);
  return (
    <View style={[cm.card, { borderColor:rep.color+'35' }]}>
      <View style={cm.header}>
        <View style={[cm.iconWrap, { backgroundColor:rep.color+'20' }]}>
          <Icon name={rep.icon} size={18} color={rep.color} type="material" />
        </View>
        <View style={{ flex:1 }}>
          <Text style={cm.titulo}>{rep.label}</Text>
          <Text style={[cm.pctTxt, { color:cor }]}>
            {pct >= 100 ? '🏆 Meta batida!' : `${pct}% atingido`}
          </Text>
        </View>
        <TouchableOpacity style={[cm.editBtn, { borderColor:rep.color+'40' }]} onPress={onEditar} activeOpacity={0.8}>
          <Icon name="edit" size={14} color={rep.color} type="material" />
          <Text style={[cm.editTxt, { color:rep.color }]}>Editar</Text>
        </TouchableOpacity>
      </View>
      <View style={cm.barRow}>
        <BarraProgresso pct={pct} cor={cor} />
        <Text style={[cm.pctBadge, { color:cor }]}>{pct}%</Text>
      </View>
      <View style={cm.valoresRow}>
        <View style={cm.valItem}>
          <Text style={cm.valLabel}>Vendido</Text>
          <Text style={[cm.valNum, { color:cor }]}>R$ {formatReal(vendido)}</Text>
        </View>
        <View style={cm.divV} />
        <View style={cm.valItem}>
          <Text style={cm.valLabel}>Meta</Text>
          <Text style={cm.valNum}>{meta > 0 ? `R$ ${formatReal(meta)}` : '—'}</Text>
        </View>
        <View style={cm.divV} />
        <View style={cm.valItem}>
          <Text style={cm.valLabel}>{faltam===0 ? 'Resultado' : 'Faltam'}</Text>
          <Text style={[cm.valNum, { color:faltam===0 ? SUCCESS : DANGER }]}>
            {meta === 0 ? '—' : faltam === 0 ? `+R$ ${formatReal(vendido - meta)}` : `R$ ${formatReal(faltam)}`}
          </Text>
        </View>
      </View>
    </View>
  );
}
const cm = StyleSheet.create({
  card     : { backgroundColor:CARD_BG, borderRadius:18, borderWidth:1, marginHorizontal:14, marginBottom:12, overflow:'hidden' },
  header   : { flexDirection:'row', alignItems:'center', gap:10, padding:14 },
  iconWrap : { width:42, height:42, borderRadius:13, justifyContent:'center', alignItems:'center' },
  titulo   : { fontSize:14, fontWeight:'800', color:SILVER_LIGHT },
  pctTxt   : { fontSize:11, fontWeight:'700', marginTop:2 },
  editBtn  : { flexDirection:'row', alignItems:'center', gap:4, borderWidth:1, borderRadius:10, paddingHorizontal:9, paddingVertical:5 },
  editTxt  : { fontSize:11, fontWeight:'700' },
  barRow   : { flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:14, marginBottom:12 },
  pctBadge : { fontSize:11, fontWeight:'900', minWidth:34, textAlign:'right' },
  valoresRow:{ flexDirection:'row', borderTopWidth:1, borderTopColor:SILVER+'12' },
  valItem  : { flex:1, alignItems:'center', paddingVertical:10, gap:3 },
  valLabel : { fontSize:9, color:SILVER_DARK, fontWeight:'600' },
  valNum   : { fontSize:12, fontWeight:'800', color:SILVER_LIGHT },
  divV     : { width:1, backgroundColor:SILVER+'18', marginVertical:8 },
});

function ResumoGeralCard({ totalMeta, totalVendido }) {
  const pct = totalMeta > 0 ? Math.round((totalVendido / totalMeta) * 100) : 0;
  const cor = pct >= 100 ? SUCCESS : pct >= 60 ? GOLD : pct >= 30 ? WARN : DANGER;
  return (
    <View style={rg.card}>
      <View style={rg.topRow}>
        <View style={rg.iconWrap}>
          <Icon name="emoji-events" size={22} color={DARK_BG} type="material" />
        </View>
        <View style={{ flex:1 }}>
          <Text style={rg.titulo}>Resultado Geral do Mês</Text>
          <Text style={[rg.pct, { color:cor }]}>
            {pct >= 100 ? '🏆 Todas as metas batidas!' : `${pct}% da meta total`}
          </Text>
        </View>
      </View>
      <BarraProgresso pct={pct} cor={cor} />
      <View style={rg.valRow}>
        <View style={rg.valItem}>
          <Text style={rg.valLabel}>Total vendido</Text>
          <Text style={[rg.valNum, { color:cor }]}>R$ {formatReal(totalVendido)}</Text>
        </View>
        <View style={rg.divV} />
        <View style={rg.valItem}>
          <Text style={rg.valLabel}>Meta total</Text>
          <Text style={rg.valNum}>R$ {formatReal(totalMeta)}</Text>
        </View>
        <View style={rg.divV} />
        <View style={rg.valItem}>
          <Text style={rg.valLabel}>% Atingido</Text>
          <Text style={[rg.valNum, { color:cor }]}>{pct}%</Text>
        </View>
      </View>
    </View>
  );
}
const rg = StyleSheet.create({
  card    : { marginHorizontal:14, backgroundColor:CARD_BG, borderRadius:18, borderWidth:1, borderColor:GOLD+'35', padding:16, marginBottom:20, gap:12 },
  topRow  : { flexDirection:'row', alignItems:'center', gap:10 },
  iconWrap: { width:46, height:46, borderRadius:15, backgroundColor:GOLD, justifyContent:'center', alignItems:'center' },
  titulo  : { fontSize:15, fontWeight:'800', color:SILVER_LIGHT },
  pct     : { fontSize:12, fontWeight:'700', marginTop:2 },
  valRow  : { flexDirection:'row', borderTopWidth:1, borderTopColor:SILVER+'15', paddingTop:10, marginTop:4 },
  valItem : { flex:1, alignItems:'center', gap:3 },
  valLabel: { fontSize:9, color:SILVER_DARK, fontWeight:'600' },
  valNum  : { fontSize:14, fontWeight:'900', color:SILVER_LIGHT },
  divV    : { width:1, backgroundColor:SILVER+'18', marginVertical:4 },
});

export default function MetasScreen({ navigation }) {
  const agora = new Date();
  const [mesSel,   setMesSel]   = useState(agora.getMonth());
  const [anoSel,   setAnoSel]   = useState(agora.getFullYear());
  const [metas,    setMetas]    = useState({});
  const [visitas,  setVisitas]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modalVis,  setModalVis]  = useState(false);
  const [repAtual,  setRepAtual]  = useState(null);
  const [inputMeta, setInputMeta] = useState('');
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const [todasVisitas, metasSalvas] = await Promise.all([getTodasVisitas(), getMetas()]);
      setVisitas(todasVisitas);
      setMetas(metasSalvas || {});
    } catch (e) {
      console.log('MetasScreen error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue:1, duration:450, useNativeDriver:true }),
      Animated.timing(slideAnim, { toValue:0, duration:450, useNativeDriver:true }),
    ]).start();
  }, []);

  const vendidasPorRep = getVendidasPorRepresentada(visitas, mesSel, anoSel);
  const totalVendido   = REPRESENTADAS_PADRAO.reduce((s, r) => s + (vendidasPorRep[r.key] || 0), 0);
  const totalMeta      = REPRESENTADAS_PADRAO.reduce((s, r) => s + (metas[r.key]         || 0), 0);

  const abrirModal = (rep) => {
    setRepAtual(rep);
    const atual = metas[rep.key] || 0;
    setInputMeta(atual > 0 ? formatReal(atual) : '');
    setModalVis(true);
  };

  const salvarMeta = async () => {
    if (!repAtual) return;
    const valor = parseMoeda(inputMeta);
    setSalvando(true);
    try {
      const novasMetas = { ...metas, [repAtual.key]: valor };
      await saveMetas(novasMetas);
      setMetas(novasMetas);
      setModalVis(false);
      setRepAtual(null);
      setInputMeta('');
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível salvar a meta.');
    } finally {
      setSalvando(false);
    }
  };

  const mesAnterior = () => {
    if (mesSel === 0) { setMesSel(11); setAnoSel(a => a - 1); }
    else setMesSel(m => m - 1);
  };
  const mesProximo = () => {
    if (mesSel === 11) { setMesSel(0); setAnoSel(a => a + 1); }
    else setMesSel(m => m + 1);
  };

  if (loading) return (
    <View style={{ flex:1, backgroundColor:DARK_BG, justifyContent:'center', alignItems:'center' }}>
      <View style={ds.loadingWrap}>
        <Icon name="flag" size={32} color={GOLD} type="material" />
      </View>
      <Text style={{ color:SILVER, fontSize:14, fontWeight:'600', marginTop:14 }}>Carregando metas...</Text>
      <ActivityIndicator color={GOLD} style={{ marginTop:12 }} />
    </View>
  );

  return (
    <View style={ds.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} translucent />
      <View style={ds.header}>
        <View style={ds.headerAccentLine} />
        <View style={ds.headerRow}>
          {navigation?.canGoBack?.() && (
            <TouchableOpacity style={ds.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
              <Icon name="arrow-back" size={20} color={SILVER_LIGHT} type="material" />
            </TouchableOpacity>
          )}
          <View style={ds.headerIconWrap}>
            <Icon name="flag" size={20} color={DARK_BG} type="material" />
          </View>
          <View style={{ flex:1 }}>
            <Text style={ds.headerTitulo}>Metas de Vendas</Text>
            <Text style={ds.headerSub}>{MESES_NOME[mesSel]} {anoSel} · {REPRESENTADAS_PADRAO.length} representadas</Text>
          </View>
          <TouchableOpacity style={ds.refreshBtn} onPress={carregarDados} activeOpacity={0.8}>
            <Icon name="refresh" size={18} color={SILVER_DARK} type="material" />
          </TouchableOpacity>
        </View>
        <View style={ds.shimmerLine} />
      </View>

      <Animated.ScrollView style={{ opacity:fadeAnim, transform:[{ translateY:slideAnim }] }} contentContainerStyle={ds.scroll} showsVerticalScrollIndicator={false}>
        <View style={ds.mesNav}>
          <TouchableOpacity style={ds.mesNavBtn} onPress={mesAnterior} activeOpacity={0.8}>
            <Icon name="chevron-left" size={22} color={GOLD} type="material" />
          </TouchableOpacity>
          <View style={ds.mesNavCenter}>
            <Text style={ds.mesNavTxt}>{MESES_NOME[mesSel]}</Text>
            <Text style={ds.mesNavAno}>{anoSel}</Text>
          </View>
          <TouchableOpacity
            style={[ds.mesNavBtn, mesSel===agora.getMonth()&&anoSel===agora.getFullYear()&&{opacity:0.3}]}
            onPress={mesProximo}
            disabled={mesSel===agora.getMonth()&&anoSel===agora.getFullYear()}
            activeOpacity={0.8}>
            <Icon name="chevron-right" size={22} color={GOLD} type="material" />
          </TouchableOpacity>
        </View>
        <ResumoGeralCard totalMeta={totalMeta} totalVendido={totalVendido} />
        {REPRESENTADAS_PADRAO.map(rep => (
          <CardMeta key={rep.key} rep={rep} meta={metas[rep.key] || 0} vendido={vendidasPorRep[rep.key] || 0} onEditar={() => abrirModal(rep)} />
        ))}
        <View style={ds.dica}>
          <Icon name="info-outline" size={14} color={SILVER_DARK} type="material" />
          <Text style={ds.dicaTxt}>
            As vendas são calculadas automaticamente com base nas visitas e check-ins com resultado "comprou".
            Certifique-se de registrar o campo <Text style={{ color:GOLD }}>representada</Text> ao fazer uma visita.
          </Text>
        </View>
        <View style={{ height:80 }} />
      </Animated.ScrollView>

      <Modal visible={modalVis} transparent animationType="slide" onRequestClose={() => setModalVis(false)}>
        <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==='ios'?'padding':undefined}>
          <TouchableOpacity style={ds.modalOverlay} onPress={() => setModalVis(false)} activeOpacity={1} />
          <View style={ds.modalSheet}>
            <View style={ds.modalHandle} />
            {repAtual && (
              <View style={ds.modalHeader}>
                <View style={[ds.modalIconWrap, { backgroundColor:repAtual.color+'25' }]}>
                  <Icon name={repAtual.icon} size={20} color={repAtual.color} type="material" />
                </View>
                <View>
                  <Text style={ds.modalTitulo}>Meta — {repAtual.label}</Text>
                  <Text style={ds.modalSub}>{MESES_NOME[mesSel]} {anoSel}</Text>
                </View>
              </View>
            )}
            <Text style={ds.formLabel}>Valor da meta (R$)</Text>
            <View style={ds.inputWrap}>
              <Icon name="attach-money" size={18} color={GOLD} type="material" style={{ marginRight:6 }} />
              <TextInput style={ds.input} placeholder="Ex: 40.000,00" placeholderTextColor={SILVER_DARK} value={inputMeta} onChangeText={setInputMeta} keyboardType="numeric" autoFocus />
            </View>
            <Text style={ds.formLabel}>Valores rápidos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:18 }}>
              {[5000,10000,20000,30000,40000,50000,80000,100000].map(v => (
                <TouchableOpacity key={v}
                  style={[ds.quickChip, inputMeta===formatReal(v) && ds.quickChipAtivo]}
                  onPress={() => setInputMeta(formatReal(v))} activeOpacity={0.8}>
                  <Text style={[ds.quickChipTxt, inputMeta===formatReal(v) && { color:DARK_BG }]}>
                    {v >= 1000 ? `${v/1000}k` : v}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {parseMoeda(inputMeta) > 0 && repAtual && (() => {
              const vendido = vendidasPorRep[repAtual.key] || 0;
              const meta    = parseMoeda(inputMeta);
              const pct     = Math.round((vendido / meta) * 100);
              const cor     = pct >= 100 ? SUCCESS : pct >= 60 ? GOLD : pct >= 30 ? WARN : DANGER;
              return (
                <View style={ds.preview}>
                  <View style={ds.previewRow}>
                    <Text style={ds.previewLabel}>Situação atual:</Text>
                    <Text style={[ds.previewPct, { color:cor }]}>{pct}%</Text>
                  </View>
                  <BarraProgresso pct={pct} cor={cor} animado={false} />
                  <Text style={[ds.previewSub, { color:cor }]}>R$ {formatReal(vendido)} vendido de R$ {formatReal(meta)}</Text>
                </View>
              );
            })()}
            <View style={ds.modalBtns}>
              <TouchableOpacity style={ds.cancelBtn} onPress={() => setModalVis(false)} activeOpacity={0.8}>
                <Text style={ds.cancelTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ds.saveBtn, salvando && { opacity:0.7 }]} onPress={salvarMeta} disabled={salvando} activeOpacity={0.85}>
                {salvando ? <ActivityIndicator size="small" color={DARK_BG} /> : <Icon name="save" size={16} color={DARK_BG} type="material" />}
                <Text style={ds.saveTxt}>{salvando ? 'Salvando...' : 'SALVAR META'}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height:20 }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const ds = StyleSheet.create({
  container      : { flex:1, backgroundColor:DARK_BG },
  scroll         : { paddingTop:14, paddingBottom:40 },
  loadingWrap    : { width:72, height:72, borderRadius:24, backgroundColor:CARD_BG, borderWidth:1, borderColor:GOLD+'40', justifyContent:'center', alignItems:'center' },
  header         : { backgroundColor:'#001828', borderBottomLeftRadius:24, borderBottomRightRadius:24, overflow:'hidden', elevation:10, shadowColor:GOLD, shadowOffset:{width:0,height:6}, shadowOpacity:0.15, shadowRadius:14 },
  headerAccentLine: { height:3, backgroundColor:GOLD },
  headerRow      : { flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:16, paddingTop:48, paddingBottom:14 },
  backBtn        : { width:36, height:36, borderRadius:18, backgroundColor:CARD_BG2, justifyContent:'center', alignItems:'center' },
  headerIconWrap : { width:42, height:42, borderRadius:14, backgroundColor:GOLD, justifyContent:'center', alignItems:'center' },
  headerTitulo   : { fontSize:19, fontWeight:'bold', color:SILVER_LIGHT },
  headerSub      : { fontSize:11, color:SILVER_DARK, marginTop:1 },
  refreshBtn     : { width:36, height:36, borderRadius:18, backgroundColor:CARD_BG2, justifyContent:'center', alignItems:'center' },
  shimmerLine    : { height:2, backgroundColor:GOLD+'30' },
  mesNav         : { flexDirection:'row', alignItems:'center', marginHorizontal:14, marginBottom:18, backgroundColor:CARD_BG, borderRadius:16, borderWidth:1, borderColor:GOLD+'25', overflow:'hidden' },
  mesNavBtn      : { width:52, height:52, justifyContent:'center', alignItems:'center' },
  mesNavCenter   : { flex:1, alignItems:'center', gap:2 },
  mesNavTxt      : { fontSize:16, fontWeight:'800', color:SILVER_LIGHT },
  mesNavAno      : { fontSize:11, color:SILVER_DARK },
  dica           : { flexDirection:'row', alignItems:'flex-start', gap:8, marginHorizontal:14, backgroundColor:CARD_BG, borderRadius:14, padding:14, borderWidth:1, borderColor:SILVER+'15' },
  dicaTxt        : { fontSize:11, color:SILVER_DARK, flex:1, lineHeight:16 },
  modalOverlay   : { flex:1, backgroundColor:'rgba(0,0,0,0.6)' },
  modalSheet     : { backgroundColor:MODAL_BG, borderTopLeftRadius:28, borderTopRightRadius:28, paddingHorizontal:16, paddingTop:10, borderWidth:1, borderColor:GOLD+'25' },
  modalHandle    : { width:38, height:4, borderRadius:2, backgroundColor:SILVER_DARK+'50', alignSelf:'center', marginBottom:16 },
  modalHeader    : { flexDirection:'row', alignItems:'center', gap:12, marginBottom:18 },
  modalIconWrap  : { width:46, height:46, borderRadius:14, justifyContent:'center', alignItems:'center' },
  modalTitulo    : { fontSize:16, fontWeight:'800', color:SILVER_LIGHT },
  modalSub       : { fontSize:11, color:SILVER_DARK, marginTop:2 },
  formLabel      : { fontSize:11, fontWeight:'700', color:SILVER_DARK, marginBottom:6, letterSpacing:0.4 },
  inputWrap      : { flexDirection:'row', alignItems:'center', backgroundColor:CARD_BG2, borderRadius:12, paddingHorizontal:14, borderWidth:1, borderColor:GOLD+'30', marginBottom:16 },
  input          : { flex:1, color:SILVER_LIGHT, fontSize:18, fontWeight:'700', paddingVertical:13 },
  quickChip      : { paddingHorizontal:13, paddingVertical:8, borderRadius:12, borderWidth:1.5, borderColor:SILVER+'30', backgroundColor:CARD_BG2, marginRight:8 },
  quickChipAtivo : { backgroundColor:GOLD, borderColor:GOLD },
  quickChipTxt   : { fontSize:12, fontWeight:'700', color:SILVER },
  preview        : { backgroundColor:CARD_BG2, borderRadius:14, padding:12, marginBottom:16, gap:8, borderWidth:1, borderColor:SILVER+'20' },
  previewRow     : { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  previewLabel   : { fontSize:12, color:SILVER_DARK, fontWeight:'600' },
  previewPct     : { fontSize:16, fontWeight:'900' },
  previewSub     : { fontSize:11, fontWeight:'600', marginTop:4 },
  modalBtns      : { flexDirection:'row', gap:10, marginTop:4 },
  cancelBtn      : { flex:0.4, justifyContent:'center', alignItems:'center', backgroundColor:CARD_BG2, borderRadius:14, paddingVertical:14, borderWidth:1, borderColor:SILVER+'20' },
  cancelTxt      : { fontSize:13, fontWeight:'700', color:SILVER_DARK },
  saveBtn        : { flex:1, flexDirection:'row', justifyContent:'center', alignItems:'center', gap:8, backgroundColor:GOLD, borderRadius:14, paddingVertical:14, elevation:6, shadowColor:GOLD, shadowOffset:{width:0,height:4}, shadowOpacity:0.4, shadowRadius:8 },
  saveTxt        : { fontSize:14, fontWeight:'bold', color:DARK_BG },
});