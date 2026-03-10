import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, StatusBar, Animated, RefreshControl,
  Modal, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Icon } from 'react-native-elements';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';

const { width: SW } = Dimensions.get('window');

const GOLD         = '#E8B432';
const GOLD_LIGHT   = '#F5D07A';
const SILVER       = '#C0D2E6';
const SILVER_LIGHT = '#E8EEF5';
const SILVER_DARK  = '#8A9BB0';
const DARK_BG      = '#001E2E';
const CARD_BG      = '#002840';
const CARD_BG2     = '#003352';
const MODAL_BG     = '#001828';
const SUCCESS      = '#4CAF50';
const DANGER       = '#EF5350';
const WARN         = '#FF9800';
const BLUE         = '#5BA3D0';
const PURPLE       = '#C56BF0';

const TIPO_ICON  = { loja: 'store', obra: 'construction', distribuidor: 'business' };
const TIPO_COLOR = { loja: GOLD, obra: SUCCESS, distribuidor: BLUE };

const TIPOS_DESPESA = [
  { key: 'combustivel', label: 'Combustível',  icon: 'local-gas-station', color: WARN    },
  { key: 'alimentacao', label: 'Alimentação',  icon: 'restaurant',        color: SUCCESS },
  { key: 'pedagio',     label: 'Pedágio',       icon: 'toll',              color: BLUE    },
  { key: 'outro',       label: 'Outro',          icon: 'receipt',           color: SILVER  },
];

const ATALHOS = [
  { label: 'Clientes',  icon: 'people',         screen: 'Clientes',     color: GOLD   },
  { label: 'Planejar',  icon: 'calendar-today', screen: 'Planejamento', color: BLUE   },
  { label: 'Mapa',      icon: 'map',            screen: 'Mapa',         color: SUCCESS },
  { label: 'Rotas',     icon: 'navigation',     screen: 'Rotas',        color: WARN   },
  { label: 'Visitas',   icon: 'bar-chart',      screen: 'Visitas',      color: PURPLE },
];

function calcDist(la1, lo1, la2, lo2) {
  const R = 6371;
  const dL = (la2 - la1) * Math.PI / 180;
  const dO = (lo2 - lo1) * Math.PI / 180;
  const a  = Math.sin(dL/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dO/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ════════════════════════════════════════════════════════════════
export default function DashboardScreen() {
  const navigation = useNavigation();

  const [kpis,           setKpis]           = useState({ clientes: 0, visitas: 0, taxa: 0, semVisita: 0 });
  const [recentes,       setRecentes]       = useState([]);
  const [maisProximo,    setMaisProximo]    = useState(null);
  const [naoVisitados,   setNaoVisitados]   = useState([]);
  const [abaAlerta,      setAbaAlerta]      = useState('proximos');
  const [posicao,        setPosicao]        = useState(null);
  const [lembretes,      setLembretes]      = useState([]);
  const [despesas,       setDespesas]       = useState([]);
  const [totalDespesas,  setTotalDespesas]  = useState(0);
  const [modalDespesa,   setModalDespesa]   = useState(false);
  const [formDespesa,    setFormDespesa]    = useState({ descricao: '', valor: '', tipo: 'combustivel', data: '' });
  const [salvandoDespesa, setSalvandoDespesa] = useState(false);
  const [modalGPS,       setModalGPS]       = useState(false);
  const [capturandoGPS,  setCapturandoGPS]  = useState(false);
  const [formGPS,        setFormGPS]        = useState({
    nome: '', cnpj: '', telefone1: '', email: '',
    endereco: '', cidade: '', latitude: '', longitude: '',
    tipo: 'loja', status: 'ativo', observacoes: '',
  });
  const [salvandoCliente, setSalvandoCliente] = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: false }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: false }),
    ]).start();
    obterPosicao();
    carregarTudo();
  }, []);

  const obterPosicao = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setPosicao(loc.coords);
    } catch (e) {}
  };

  const carregarTudo = async () => {
    try {
      const [snapC, snapV] = await Promise.all([
        getDocs(collection(db, 'clientes')),
        getDocs(collection(db, 'visitas')),
      ]);

      const clientes = [];
      snapC.forEach(d => clientes.push({ id: d.id, ...d.data() }));

      const visitas = [];
      snapV.forEach(d => visitas.push({ id: d.id, ...d.data() }));
      visitas.sort((a, b) => new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0));

      // Despesas
      try {
        const snapD = await getDocs(collection(db, 'despesas'));
        const despList = [];
        snapD.forEach(d => despList.push({ id: d.id, ...d.data() }));
        despList.sort((a, b) => new Date(b.criadoEm?.toDate?.() || 0) - new Date(a.criadoEm?.toDate?.() || 0));
        const total = despList.reduce((s, d) => s + (parseFloat(d.valor) || 0), 0);
        setDespesas(despList.slice(0, 6));
        setTotalDespesas(total);
      } catch (e) {}

      // KPIs
      const compraram = visitas.filter(v => v.resultado === 'comprou').length;
      const taxa = visitas.length > 0 ? Math.round((compraram / visitas.length) * 100) : 0;

      const visitasPorCliente = {};
      visitas.forEach(v => {
        if (!visitasPorCliente[v.clienteId]) visitasPorCliente[v.clienteId] = [];
        visitasPorCliente[v.clienteId].push(v);
      });

      const semVisita = clientes.filter(c => !visitasPorCliente[c.id]);
      setNaoVisitados(semVisita.slice(0, 10));

      // Lembretes de clientes
      const lembretesList = clientes
        .filter(c => c.lembrete && c.lembrete.trim())
        .map(c => ({ id: c.id, nome: c.nome, lembrete: c.lembrete, tipo: c.tipo }))
        .slice(0, 5);
      setLembretes(lembretesList);

      setKpis({ clientes: clientes.length, visitas: visitas.length, taxa, semVisita: semVisita.length });

      setRecentes(visitas.slice(0, 4).map(v => ({
        ...v, clienteNome: clientes.find(c => c.id === v.clienteId)?.nome || 'Cliente',
      })));

      // Mais próximo (recalcula quando posição já disponível)
      if (posicao) calcularMaisProximo(clientes, posicao);

    } catch (e) { console.log('Dashboard load error:', e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const calcularMaisProximo = (clientes, pos) => {
    const comGPS = clientes.filter(c => c.latitude && c.longitude);
    if (!comGPS.length || !pos) { setMaisProximo(null); return; }
    const sorted = comGPS
      .map(c => ({ ...c, dist: calcDist(pos.latitude, pos.longitude, parseFloat(c.latitude), parseFloat(c.longitude)) }))
      .sort((a, b) => a.dist - b.dist);
    setMaisProximo(sorted[0]);
  };

  useEffect(() => {
    if (!posicao) return;
    getDocs(collection(db, 'clientes')).then(snap => {
      const clientes = [];
      snap.forEach(d => clientes.push({ id: d.id, ...d.data() }));
      calcularMaisProximo(clientes, posicao);
    }).catch(() => {});
  }, [posicao]);

  const onRefresh = () => { setRefreshing(true); obterPosicao(); carregarTudo(); };

  // ── Salvar despesa ────────────────────────────────────────────
  const salvarDespesa = async () => {
    if (!formDespesa.descricao.trim()) { Alert.alert('Erro', 'Informe a descrição'); return; }
    if (!formDespesa.valor)            { Alert.alert('Erro', 'Informe o valor');      return; }
    setSalvandoDespesa(true);
    try {
      await addDoc(collection(db, 'despesas'), {
        ...formDespesa,
        valor:    parseFloat(formDespesa.valor.replace(',', '.')),
        criadoEm: serverTimestamp(),
        usuario:  auth.currentUser?.email || '',
      });
      setModalDespesa(false);
      setFormDespesa({ descricao: '', valor: '', tipo: 'combustivel', data: '' });
      carregarTudo();
    } catch (e) { Alert.alert('Erro', 'Não foi possível salvar a despesa.'); }
    finally { setSalvandoDespesa(false); }
  };

  // ── Cadastro rápido via GPS ────────────────────────────────────
  const abrirModalGPS = async () => {
    setCapturandoGPS(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permissão negada', 'Ative a localização.'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      let endereco = '';
      try {
        const addr = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (addr?.length > 0) {
          const a = addr[0];
          endereco = [a.street, a.streetNumber, a.district || a.subregion, a.city, a.region].filter(Boolean).join(', ');
        }
      } catch (e) {}
      setFormGPS(f => ({ ...f, latitude: latitude.toString(), longitude: longitude.toString(), endereco }));
      setModalGPS(true);
    } catch (e) { Alert.alert('Erro GPS', 'Não foi possível capturar a localização.'); }
    finally { setCapturandoGPS(false); }
  };

  const salvarClienteGPS = async () => {
    if (!formGPS.nome.trim()) { Alert.alert('Erro', 'Nome é obrigatório'); return; }
    setSalvandoCliente(true);
    try {
      await addDoc(collection(db, 'clientes'), { ...formGPS, criadoEm: serverTimestamp(), gpsTag: true });
      setModalGPS(false);
      setFormGPS({ nome: '', cnpj: '', telefone1: '', email: '', endereco: '', cidade: '', latitude: '', longitude: '', tipo: 'loja', status: 'ativo', observacoes: '' });
      Alert.alert('✅ Salvo!', 'Cliente cadastrado com GPS.');
      carregarTudo();
    } catch (e) { Alert.alert('Erro', 'Não foi possível salvar.'); }
    finally { setSalvandoCliente(false); }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: DARK_BG }}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={{ color: SILVER, marginTop: 12, fontSize: 13 }}>Carregando...</Text>
      </View>
    );
  }

  return (
    <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={ds.container}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        <ScrollView
          contentContainerStyle={ds.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} colors={[GOLD]} />}
        >
          {/* ══ HEADER ══ */}
          <View style={ds.header}>
            <View>
              <Text style={ds.greeting}>Bem-vindo 👋</Text>
              <Text style={ds.brandName}>MAYA Representações</Text>
            </View>
            <TouchableOpacity style={ds.gpsBtn} onPress={abrirModalGPS} disabled={capturandoGPS} activeOpacity={0.85}>
              {capturandoGPS
                ? <ActivityIndicator size="small" color={DARK_BG} />
                : <Icon name="add-location-alt" size={20} color={DARK_BG} type="material" />
              }
              <Text style={ds.gpsBtnTxt}>{capturandoGPS ? 'GPS...' : 'Cadastrar aqui'}</Text>
            </TouchableOpacity>
          </View>

          {/* ══ KPIs ══ */}
          <View style={ds.kpiRow}>
            <KpiCard icon="people"      value={kpis.clientes}    label="Clientes"    color={GOLD}    />
            <KpiCard icon="bar-chart"   value={kpis.visitas}     label="Visitas"     color={BLUE}    />
            <KpiCard icon="trending-up" value={`${kpis.taxa}%`}  label="Conversão"   color={SUCCESS} />
            <KpiCard icon="event-busy"  value={kpis.semVisita}   label="Sem visita"  color={DANGER}  />
          </View>

          {/* ══ ATALHOS ══ */}
          <SectionHeader title="Acesso Rápido" icon="grid-view" />
          <View style={ds.atalhoGrid}>
            {ATALHOS.map(item => (
              <ShortcutCard key={item.screen} item={item} onPress={() => navigation.navigate(item.screen)} />
            ))}
          </View>

          {/* ══ ALERTAS ══ */}
          <SectionHeader title="Alertas de Campo" icon="notifications-active" iconColor={WARN} />
          <View style={ds.alertasCard}>
            <View style={ds.alertasAba}>
              <TouchableOpacity style={[ds.abaBtn, abaAlerta === 'proximos' && ds.abaBtnAtivo]}
                onPress={() => setAbaAlerta('proximos')} activeOpacity={0.8}>
                <Icon name="my-location" size={12} color={abaAlerta === 'proximos' ? DARK_BG : SUCCESS} type="material" />
                <Text style={[ds.abaTxt, abaAlerta === 'proximos' && ds.abaTxtAtivo]}>Mais próximo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ds.abaBtn, abaAlerta === 'naovisitados' && ds.abaBtnAtivo]}
                onPress={() => setAbaAlerta('naovisitados')} activeOpacity={0.8}>
                <Icon name="event-busy" size={12} color={abaAlerta === 'naovisitados' ? DARK_BG : DANGER} type="material" />
                <Text style={[ds.abaTxt, abaAlerta === 'naovisitados' && ds.abaTxtAtivo]}>Não visitados</Text>
                {kpis.semVisita > 0 && (
                  <View style={ds.abaBadge}><Text style={ds.abaBadgeTxt}>{kpis.semVisita}</Text></View>
                )}
              </TouchableOpacity>
            </View>

            {abaAlerta === 'proximos' && (
              <View style={ds.alertaContent}>
                {!posicao ? (
                  <View style={ds.alertaVazio}>
                    <Icon name="location-off" size={30} color={SILVER_DARK} type="material" />
                    <Text style={ds.alertaVazioTxt}>Aguardando GPS...</Text>
                    <TouchableOpacity style={ds.alertaVazioBtn} onPress={obterPosicao} activeOpacity={0.8}>
                      <Text style={ds.alertaVazioBtnTxt}>Ativar localização</Text>
                    </TouchableOpacity>
                  </View>
                ) : maisProximo ? (
                  <TouchableOpacity style={ds.proximoCard}
                    onPress={() => navigation.navigate('Mapa', { clienteDestino: maisProximo })}
                    activeOpacity={0.85}>
                    <View style={[ds.proximoIconWrap, { backgroundColor: (TIPO_COLOR[maisProximo.tipo] || GOLD) + '20' }]}>
                      <Icon name={TIPO_ICON[maisProximo.tipo] || 'location-on'} size={22} color={TIPO_COLOR[maisProximo.tipo] || GOLD} type="material" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={ds.proximoNome} numberOfLines={1}>{maisProximo.nome}</Text>
                      <Text style={ds.proximoEnd} numberOfLines={1}>{maisProximo.endereco || maisProximo.cidade || '—'}</Text>
                    </View>
                    <View style={ds.proximoDistWrap}>
                      <Text style={ds.proximoDist}>
                        {maisProximo.dist < 1 ? `${(maisProximo.dist*1000).toFixed(0)}m` : `${maisProximo.dist.toFixed(1)}km`}
                      </Text>
                      <Text style={ds.proximoDistLabel}>de você</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={SILVER_DARK} type="material" />
                  </TouchableOpacity>
                ) : (
                  <View style={ds.alertaVazio}>
                    <Text style={ds.alertaVazioTxt}>Nenhum cliente com GPS cadastrado</Text>
                  </View>
                )}
              </View>
            )}

            {abaAlerta === 'naovisitados' && (
              <View style={ds.alertaContent}>
                {naoVisitados.length === 0 ? (
                  <View style={ds.alertaVazio}>
                    <Icon name="check-circle" size={30} color={SUCCESS} type="material" />
                    <Text style={ds.alertaVazioTxt}>Todos os clientes já foram visitados!</Text>
                  </View>
                ) : naoVisitados.map(c => (
                  <TouchableOpacity key={c.id} style={ds.naoVisitadoItem}
                    onPress={() => navigation.navigate('Clientes', { openCliente: c.id })}
                    activeOpacity={0.8}>
                    <View style={[ds.naoVisitadoIcon, { backgroundColor: (TIPO_COLOR[c.tipo] || GOLD) + '18' }]}>
                      <Icon name={TIPO_ICON[c.tipo] || 'location-on'} size={15} color={TIPO_COLOR[c.tipo] || GOLD} type="material" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={ds.naoVisitadoNome}>{c.nome}</Text>
                      <Text style={ds.naoVisitadoCidade}>{c.cidade || 'Sem cidade'}</Text>
                    </View>
                    <View style={ds.naoVisitadoBadge}>
                      <Text style={ds.naoVisitadoBadgeTxt}>nunca visitado</Text>
                    </View>
                  </TouchableOpacity>
                ))}
                {kpis.semVisita > 10 && (
                  <TouchableOpacity style={ds.verTodosBtn} onPress={() => navigation.navigate('Clientes')} activeOpacity={0.8}>
                    <Text style={ds.verTodosTxt}>Ver todos ({kpis.semVisita}) →</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* ══ LEMBRETES ══ */}
          {lembretes.length > 0 && (
            <>
              <SectionHeader title="Lembretes de Clientes" icon="sticky-note-2" iconColor={GOLD_LIGHT} />
              <View style={ds.lembretesCard}>
                {lembretes.map((l, idx) => (
                  <TouchableOpacity key={l.id} style={[ds.lembreteItem, idx < lembretes.length - 1 && ds.lembreteBorder]}
                    onPress={() => navigation.navigate('Clientes', { openCliente: l.id })}
                    activeOpacity={0.8}>
                    <View style={ds.lembreteIconWrap}>
                      <Icon name="notifications-active" size={15} color={WARN} type="material" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={ds.lembreteNome}>{l.nome}</Text>
                      <Text style={ds.lembreteTxt} numberOfLines={2}>{l.lembrete}</Text>
                    </View>
                    <Icon name="chevron-right" size={16} color={SILVER_DARK} type="material" />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* ══ DESPESAS ══ */}
          <View style={ds.sectionRow}>
            <SectionHeader title="Despesas do Mês" icon="receipt-long" iconColor={DANGER} inline />
            <TouchableOpacity style={ds.addDespesaBtn} onPress={() => setModalDespesa(true)} activeOpacity={0.85}>
              <Icon name="add" size={15} color={DARK_BG} type="material" />
              <Text style={ds.addDespesaBtnTxt}>Nova</Text>
            </TouchableOpacity>
          </View>

          <View style={ds.despesasCard}>
            <View style={ds.despesasTotalRow}>
              <View style={ds.despesasTotalIcon}>
                <Icon name="account-balance-wallet" size={16} color={DANGER} type="material" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ds.despesasTotalLabel}>Total registrado</Text>
                <Text style={ds.despesasTotalValor}>R$ {totalDespesas.toFixed(2).replace('.', ',')}</Text>
              </View>
              <Text style={ds.despesasTotalQtd}>{despesas.length} registro{despesas.length !== 1 ? 's' : ''}</Text>
            </View>

            {despesas.length === 0 ? (
              <View style={ds.despesasVazio}>
                <Icon name="receipt" size={26} color={SILVER_DARK} type="material" />
                <Text style={ds.despesasVazioTxt}>Nenhuma despesa registrada</Text>
              </View>
            ) : despesas.map(d => {
              const ti = TIPOS_DESPESA.find(t => t.key === d.tipo) || TIPOS_DESPESA[3];
              return (
                <View key={d.id} style={ds.despesaItem}>
                  <View style={[ds.despesaIconWrap, { backgroundColor: ti.color + '20' }]}>
                    <Icon name={ti.icon} size={15} color={ti.color} type="material" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={ds.despesaDescricao}>{d.descricao}</Text>
                    <Text style={ds.despesaTipo}>{ti.label}{d.data ? ` · ${d.data}` : ''}</Text>
                  </View>
                  <Text style={ds.despesaValor}>- R$ {parseFloat(d.valor || 0).toFixed(2).replace('.', ',')}</Text>
                </View>
              );
            })}
          </View>

          {/* ══ VISITAS RECENTES ══ */}
          {recentes.length > 0 && (
            <>
              <View style={ds.sectionRow}>
                <SectionHeader title="Últimas Visitas" icon="history" inline />
                <TouchableOpacity onPress={() => navigation.navigate('Visitas')} activeOpacity={0.8} style={{ paddingRight: 16 }}>
                  <Text style={ds.verTodosTxt}>Ver tudo →</Text>
                </TouchableOpacity>
              </View>
              {recentes.map(v => (
                <View key={v.id} style={ds.visitaItem}>
                  <View style={[ds.visitaIconWrap, { backgroundColor: v.resultado === 'comprou' ? SUCCESS + '20' : DANGER + '20' }]}>
                    <Icon name={v.resultado === 'comprou' ? 'check-circle' : 'cancel'} size={15}
                      color={v.resultado === 'comprou' ? SUCCESS : DANGER} type="material" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={ds.visitaNome}>{v.clienteNome}</Text>
                    <Text style={ds.visitaData}>{v.dataLocal ? new Date(v.dataLocal).toLocaleDateString('pt-BR') : '—'}</Text>
                  </View>
                  <View style={[ds.visitaBadge, { backgroundColor: v.resultado === 'comprou' ? SUCCESS + '18' : DANGER + '15', borderColor: v.resultado === 'comprou' ? SUCCESS + '40' : DANGER + '35' }]}>
                    <Text style={[ds.visitaBadgeTxt, { color: v.resultado === 'comprou' ? SUCCESS : DANGER }]}>
                      {v.resultado === 'comprou' ? 'Comprou' : 'Não comprou'}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* ══ MODAL NOVA DESPESA ══ */}
        <Modal visible={modalDespesa} transparent animationType="slide" onRequestClose={() => setModalDespesa(false)}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <TouchableOpacity style={ds.modalOverlay} onPress={() => setModalDespesa(false)} activeOpacity={1} />
            <View style={ds.modalSheet}>
              <View style={ds.modalHandle} />
              <Text style={ds.modalTitle}>💰 Nova Despesa</Text>

              <Text style={ds.formLabel}>Tipo</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {TIPOS_DESPESA.map(t => (
                  <TouchableOpacity key={t.key}
                    style={[ds.tipoChip, formDespesa.tipo === t.key && { backgroundColor: t.color, borderColor: t.color }]}
                    onPress={() => setFormDespesa(f => ({ ...f, tipo: t.key }))} activeOpacity={0.8}>
                    <Icon name={t.icon} size={13} color={formDespesa.tipo === t.key ? DARK_BG : t.color} type="material" />
                    <Text style={[ds.tipoChipTxt, formDespesa.tipo === t.key && { color: DARK_BG }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={ds.formLabel}>Descrição</Text>
              <View style={ds.inputWrap}>
                <TextInput style={ds.input} placeholder="Ex: Gasolina posto BR" placeholderTextColor={SILVER_DARK}
                  value={formDespesa.descricao} onChangeText={t => setFormDespesa(f => ({ ...f, descricao: t }))} />
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={ds.formLabel}>Valor (R$)</Text>
                  <View style={ds.inputWrap}>
                    <TextInput style={ds.input} placeholder="0,00" placeholderTextColor={SILVER_DARK}
                      value={formDespesa.valor} onChangeText={t => setFormDespesa(f => ({ ...f, valor: t }))}
                      keyboardType="numeric" />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ds.formLabel}>Data</Text>
                  <View style={ds.inputWrap}>
                    <TextInput style={ds.input} placeholder="dd/mm/aaaa" placeholderTextColor={SILVER_DARK}
                      value={formDespesa.data} onChangeText={t => setFormDespesa(f => ({ ...f, data: t }))}
                      keyboardType="numeric" />
                  </View>
                </View>
              </View>

              <TouchableOpacity style={[ds.saveBtn, salvandoDespesa && { opacity: 0.7 }]}
                onPress={salvarDespesa} disabled={salvandoDespesa} activeOpacity={0.85}>
                <Icon name="save" size={17} color={DARK_BG} type="material" style={{ marginRight: 8 }} />
                <Text style={ds.saveBtnTxt}>{salvandoDespesa ? 'Salvando...' : 'REGISTRAR DESPESA'}</Text>
              </TouchableOpacity>
              <View style={{ height: 24 }} />
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ══ MODAL CADASTRO GPS ══ */}
        <Modal visible={modalGPS} transparent animationType="slide" onRequestClose={() => setModalGPS(false)}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={ds.modalGPSOverlay}>
              <View style={[ds.modalSheet, { maxHeight: '88%' }]}>
                <View style={ds.modalHandle} />
                <View style={ds.gpsBanner}>
                  <Icon name="my-location" size={15} color={SUCCESS} type="material" />
                  <Text style={ds.gpsBannerTxt}>📍 GPS capturado</Text>
                  {formGPS.latitude ? (
                    <Text style={ds.gpsCoordsSmall}>
                      {parseFloat(formGPS.latitude).toFixed(4)}, {parseFloat(formGPS.longitude).toFixed(4)}
                    </Text>
                  ) : null}
                </View>
                <Text style={ds.modalTitle}>Cadastrar Cliente Aqui</Text>

                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={ds.formLabel}>Nome *</Text>
                  <View style={ds.inputWrap}>
                    <TextInput style={ds.input} placeholder="Nome do cliente" placeholderTextColor={SILVER_DARK}
                      value={formGPS.nome} onChangeText={t => setFormGPS(f => ({ ...f, nome: t }))} />
                  </View>

                  <Text style={ds.formLabel}>Telefone</Text>
                  <View style={ds.inputWrap}>
                    <TextInput style={ds.input} placeholder="(00) 00000-0000" placeholderTextColor={SILVER_DARK}
                      value={formGPS.telefone1} onChangeText={t => setFormGPS(f => ({ ...f, telefone1: t }))}
                      keyboardType="phone-pad" />
                  </View>

                  <Text style={ds.formLabel}>Endereço (do GPS)</Text>
                  <View style={ds.inputWrap}>
                    <TextInput style={ds.input} placeholder="Endereço" placeholderTextColor={SILVER_DARK}
                      value={formGPS.endereco} onChangeText={t => setFormGPS(f => ({ ...f, endereco: t }))} />
                  </View>

                  <Text style={ds.formLabel}>Cidade</Text>
                  <View style={ds.inputWrap}>
                    <TextInput style={ds.input} placeholder="Cidade" placeholderTextColor={SILVER_DARK}
                      value={formGPS.cidade} onChangeText={t => setFormGPS(f => ({ ...f, cidade: t }))} />
                  </View>

                  <Text style={ds.formLabel}>Tipo</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                    {['loja', 'obra', 'distribuidor'].map(t => (
                      <TouchableOpacity key={t}
                        style={[ds.tipoChip, formGPS.tipo === t && { backgroundColor: TIPO_COLOR[t] || GOLD, borderColor: TIPO_COLOR[t] || GOLD }]}
                        onPress={() => setFormGPS(f => ({ ...f, tipo: t }))} activeOpacity={0.8}>
                        <Text style={[ds.tipoChipTxt, formGPS.tipo === t && { color: DARK_BG }]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={ds.formLabel}>Observações</Text>
                  <View style={[ds.inputWrap, { alignItems: 'flex-start', paddingTop: 10 }]}>
                    <TextInput style={[ds.input, { height: 60, textAlignVertical: 'top' }]}
                      placeholder="Anotações..." placeholderTextColor={SILVER_DARK}
                      value={formGPS.observacoes} onChangeText={t => setFormGPS(f => ({ ...f, observacoes: t }))}
                      multiline numberOfLines={3} />
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <TouchableOpacity style={ds.cancelBtn} onPress={() => setModalGPS(false)} activeOpacity={0.8}>
                      <Text style={ds.cancelBtnTxt}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[ds.saveBtn, { flex: 1 }, salvandoCliente && { opacity: 0.7 }]}
                      onPress={salvarClienteGPS} disabled={salvandoCliente} activeOpacity={0.85}>
                      <Icon name="person-add" size={16} color={DARK_BG} type="material" style={{ marginRight: 6 }} />
                      <Text style={ds.saveBtnTxt}>{salvandoCliente ? 'Salvando...' : 'CADASTRAR'}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ height: 30 }} />
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </Animated.View>
  );
}

// ── Sub-componentes ───────────────────────────────────────────
function KpiCard({ icon, value, label, color }) {
  return (
    <View style={[kc.card, { borderColor: color + '25' }]}>
      <View style={[kc.icon, { backgroundColor: color + '18' }]}>
        <Icon name={icon} size={14} color={color} type="material" />
      </View>
      <Text style={[kc.value, { color }]}>{value}</Text>
      <Text style={kc.label}>{label}</Text>
    </View>
  );
}
const kc = StyleSheet.create({
  card:  { flex: 1, alignItems: 'center', backgroundColor: CARD_BG, borderRadius: 14, padding: 9, borderWidth: 1, marginHorizontal: 3 },
  icon:  { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
  value: { fontSize: 17, fontWeight: 'bold' },
  label: { fontSize: 8, color: SILVER_DARK, marginTop: 1, textAlign: 'center' },
});

function SectionHeader({ title, icon, iconColor = GOLD, inline = false }) {
  return (
    <View style={[sh2.row, inline && { flex: 1 }]}>
      <View style={[sh2.iconWrap, { backgroundColor: iconColor + '20' }]}>
        <Icon name={icon} size={13} color={iconColor} type="material" />
      </View>
      <Text style={sh2.title}>{title}</Text>
    </View>
  );
}
const sh2 = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 10, paddingHorizontal: 14 },
  iconWrap:{ width: 24, height: 24, borderRadius: 7, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  title:   { fontSize: 13, fontWeight: 'bold', color: SILVER_LIGHT, letterSpacing: 0.3 },
});

function ShortcutCard({ item, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.93, duration: 70, useNativeDriver: false }),
      Animated.timing(scale, { toValue: 1,    duration: 70, useNativeDriver: false }),
    ]).start(() => onPress());
  };
  return (
    <Animated.View style={{ transform: [{ scale }], width: (SW - 44) / 2 - 4 }}>
      <TouchableOpacity style={[sc.card, { borderColor: item.color + '30' }]} onPress={press} activeOpacity={1}>
        <View style={[sc.iconWrap, { backgroundColor: item.color + '18' }]}>
          <Icon name={item.icon} size={22} color={item.color} type="material" />
        </View>
        <Text style={[sc.label, { color: item.color }]}>{item.label}</Text>
        <View style={[sc.arrow, { backgroundColor: item.color + '20' }]}>
          <Icon name="arrow-forward" size={10} color={item.color} type="material" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
const sc = StyleSheet.create({
  card:    { backgroundColor: CARD_BG, borderRadius: 16, padding: 14, borderWidth: 1, minHeight: 86 },
  iconWrap:{ width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  label:   { fontSize: 13, fontWeight: 'bold' },
  arrow:   { position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
});

// ── Estilos principais ────────────────────────────────────────
const ds = StyleSheet.create({
  container:      { flex: 1, backgroundColor: DARK_BG },
  scroll:         { paddingTop: 54, paddingBottom: 40 },

  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, marginBottom: 16 },
  greeting:       { fontSize: 11, color: SILVER_DARK },
  brandName:      { fontSize: 20, fontWeight: 'bold', color: GOLD },
  gpsBtn:         { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: GOLD, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 13, shadowColor: GOLD, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 6 },
  gpsBtnTxt:      { fontSize: 11, fontWeight: 'bold', color: DARK_BG },

  kpiRow:         { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 4 },
  atalhoGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 13, marginBottom: 4 },
  sectionRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 14 },

  alertasCard:    { marginHorizontal: 14, backgroundColor: CARD_BG, borderRadius: 18, borderWidth: 1, borderColor: WARN + '20', overflow: 'hidden', marginBottom: 4 },
  alertasAba:     { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: WARN + '15' },
  abaBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 12 },
  abaBtnAtivo:    { backgroundColor: GOLD },
  abaTxt:         { fontSize: 11, fontWeight: '700', color: SILVER },
  abaTxtAtivo:    { color: DARK_BG },
  abaBadge:       { backgroundColor: DANGER, borderRadius: 7, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 2 },
  abaBadgeTxt:    { fontSize: 9, fontWeight: 'bold', color: '#fff' },
  alertaContent:  { padding: 12 },
  alertaVazio:    { alignItems: 'center', paddingVertical: 18, gap: 8 },
  alertaVazioTxt: { fontSize: 12, color: SILVER_DARK, textAlign: 'center' },
  alertaVazioBtn: { backgroundColor: GOLD + '20', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: GOLD + '30' },
  alertaVazioBtnTxt: { fontSize: 11, color: GOLD, fontWeight: '700' },

  proximoCard:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CARD_BG2, borderRadius: 13, padding: 13, borderWidth: 1, borderColor: SUCCESS + '25' },
  proximoIconWrap:{ width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  proximoNome:    { fontSize: 13, fontWeight: 'bold', color: SILVER_LIGHT },
  proximoEnd:     { fontSize: 10, color: SILVER_DARK, marginTop: 2 },
  proximoDistWrap:{ alignItems: 'center', minWidth: 50 },
  proximoDist:    { fontSize: 15, fontWeight: 'bold', color: SUCCESS },
  proximoDistLabel:{ fontSize: 8, color: SILVER_DARK },

  naoVisitadoItem:{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: SILVER + '10' },
  naoVisitadoIcon:{ width: 32, height: 32, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  naoVisitadoNome:{ fontSize: 12, fontWeight: '700', color: SILVER_LIGHT },
  naoVisitadoCidade:{ fontSize: 10, color: SILVER_DARK, marginTop: 1 },
  naoVisitadoBadge: { backgroundColor: DANGER + '18', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, borderWidth: 1, borderColor: DANGER + '35' },
  naoVisitadoBadgeTxt: { fontSize: 8, fontWeight: '700', color: DANGER },

  lembretesCard:  { marginHorizontal: 14, backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: GOLD + '20', overflow: 'hidden', marginBottom: 4 },
  lembreteItem:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  lembreteBorder: { borderBottomWidth: 1, borderBottomColor: SILVER + '12' },
  lembreteIconWrap:{ width: 32, height: 32, borderRadius: 9, backgroundColor: WARN + '18', justifyContent: 'center', alignItems: 'center' },
  lembreteNome:   { fontSize: 12, fontWeight: 'bold', color: SILVER_LIGHT },
  lembreteTxt:    { fontSize: 11, color: SILVER_DARK, marginTop: 2, lineHeight: 15 },

  despesasCard:   { marginHorizontal: 14, backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: DANGER + '25', overflow: 'hidden', marginBottom: 4 },
  despesasTotalRow:{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderBottomWidth: 1, borderBottomColor: DANGER + '20', backgroundColor: DANGER + '08' },
  despesasTotalIcon:{ width: 34, height: 34, borderRadius: 10, backgroundColor: DANGER + '20', justifyContent: 'center', alignItems: 'center' },
  despesasTotalLabel:{ fontSize: 10, color: SILVER_DARK },
  despesasTotalValor:{ fontSize: 17, fontWeight: 'bold', color: DANGER },
  despesasTotalQtd:{ fontSize: 10, color: SILVER_DARK },
  despesasVazio:  { alignItems: 'center', paddingVertical: 18, gap: 6 },
  despesasVazioTxt:{ fontSize: 12, color: SILVER_DARK },
  despesaItem:    { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderBottomWidth: 1, borderBottomColor: SILVER + '10' },
  despesaIconWrap:{ width: 32, height: 32, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  despesaDescricao:{ fontSize: 12, fontWeight: '700', color: SILVER_LIGHT },
  despesaTipo:    { fontSize: 10, color: SILVER_DARK, marginTop: 1 },
  despesaValor:   { fontSize: 12, fontWeight: 'bold', color: DANGER },
  addDespesaBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GOLD, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10 },
  addDespesaBtnTxt:{ fontSize: 11, fontWeight: 'bold', color: DARK_BG },

  visitaItem:     { flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 14, marginBottom: 7, backgroundColor: CARD_BG, borderRadius: 12, padding: 11, borderWidth: 1, borderColor: SILVER + '15' },
  visitaIconWrap: { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  visitaNome:     { fontSize: 12, fontWeight: '700', color: SILVER_LIGHT },
  visitaData:     { fontSize: 10, color: SILVER_DARK, marginTop: 1 },
  visitaBadge:    { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, borderWidth: 1 },
  visitaBadgeTxt: { fontSize: 9, fontWeight: '700' },
  verTodosBtn:    { paddingHorizontal: 12, paddingVertical: 6 },
  verTodosTxt:    { fontSize: 12, color: GOLD, fontWeight: '700' },

  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalGPSOverlay:{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet:     { backgroundColor: MODAL_BG, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 16, paddingTop: 10, borderWidth: 1, borderColor: GOLD + '20' },
  modalHandle:    { width: 36, height: 4, borderRadius: 2, backgroundColor: SILVER_DARK + '50', alignSelf: 'center', marginBottom: 14 },
  modalTitle:     { fontSize: 17, fontWeight: 'bold', color: SILVER_LIGHT, marginBottom: 14 },
  gpsBanner:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: SUCCESS + '12', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: SUCCESS + '25' },
  gpsBannerTxt:   { fontSize: 12, color: SUCCESS, fontWeight: '700', flex: 1 },
  gpsCoordsSmall: { fontSize: 10, color: SILVER_DARK },

  formLabel:  { fontSize: 11, fontWeight: '700', color: SILVER_DARK, marginBottom: 5, marginTop: 2, letterSpacing: 0.4 },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD_BG2, borderRadius: 11, paddingHorizontal: 12, borderWidth: 1, borderColor: SILVER + '20', marginBottom: 11 },
  input:      { flex: 1, color: SILVER_LIGHT, fontSize: 14, paddingVertical: 11 },
  tipoChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 14, borderWidth: 1.5, borderColor: SILVER + '30', backgroundColor: CARD_BG2, marginRight: 7 },
  tipoChipTxt:{ fontSize: 11, fontWeight: '700', color: SILVER },
  saveBtn:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: GOLD, borderRadius: 13, paddingVertical: 14, marginTop: 4, shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  saveBtnTxt: { fontSize: 14, fontWeight: 'bold', color: DARK_BG },
  cancelBtn:  { flex: 0.4, justifyContent: 'center', alignItems: 'center', backgroundColor: CARD_BG2, borderRadius: 13, paddingVertical: 14, borderWidth: 1, borderColor: SILVER + '20' },
  cancelBtnTxt:{ fontSize: 13, fontWeight: '700', color: SILVER_DARK },
});