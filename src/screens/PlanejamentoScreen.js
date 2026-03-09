import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  FlatList, TextInput, Modal, Alert, Dimensions,
  StatusBar, Animated,
} from 'react-native';
import { Icon } from 'react-native-elements';
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, getDocs,
} from 'firebase/firestore';
import { db, auth } from '../services/firebase';

const { width: SW } = Dimensions.get('window');

// ── PALETA ───────────────────────────────────────────────────
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

// ── HELPERS ──────────────────────────────────────────────────
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_SEMANA_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

const toDateStr = (d) => d.toISOString().split('T')[0];
const todayStr  = () => toDateStr(new Date());

const getPriorityColor = (p) => p === 'alta' ? DANGER : p === 'media' ? WARN : SUCCESS;
const getStatusColor   = (s) => s === 'confirmado' ? SUCCESS : s === 'cancelado' ? DANGER : s === 'realizado' ? SILVER : WARN;

// ── SHIMMER LINE ─────────────────────────────────────────────
function ShimmerLine({ color = GOLD }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 2200, useNativeDriver: true })
    ).start();
  }, []);
  return (
    <View style={{ height: 1, width: '100%', backgroundColor: color + '25', overflow: 'hidden' }}>
      <Animated.View style={{
        position: 'absolute', height: '100%', width: 80,
        backgroundColor: color + 'BB',
        transform: [{ translateX: anim.interpolate({ inputRange: [0,1], outputRange: [-80, SW] }) }],
      }} />
    </View>
  );
}

// ════════════════════════════════════════════════════════════
// CALENDÁRIO PURO — sem react-native-calendars
// ════════════════════════════════════════════════════════════
function CalendarioPuro({ selectedDate, onDayPress, markedDates = {} }) {
  const hoje = new Date();
  const [viewYear,  setViewYear]  = useState(hoje.getFullYear());
  const [viewMonth, setViewMonth] = useState(hoje.getMonth());

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  // Gera as células do calendário
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Completa para múltiplo de 7
  while (cells.length % 7 !== 0) cells.push(null);

  const todayISO = toDateStr(hoje);

  return (
    <View style={cal.wrap}>
      {/* Navegação mês */}
      <View style={cal.nav}>
        <TouchableOpacity style={cal.navBtn} onPress={prevMonth}>
          <Icon name="chevron-left" size={22} color={GOLD} />
        </TouchableOpacity>
        <Text style={cal.navTitle}>{MESES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity style={cal.navBtn} onPress={nextMonth}>
          <Icon name="chevron-right" size={22} color={GOLD} />
        </TouchableOpacity>
      </View>

      {/* Dias da semana */}
      <View style={cal.row}>
        {DIAS_SEMANA_SHORT.map(d => (
          <View key={d} style={cal.cell}>
            <Text style={cal.dayLabel}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Células */}
      {Array.from({ length: cells.length / 7 }, (_, week) => (
        <View key={week} style={cal.row}>
          {cells.slice(week * 7, week * 7 + 7).map((day, idx) => {
            if (!day) return <View key={idx} style={cal.cell} />;
            const iso = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const isSelected = iso === selectedDate;
            const isToday    = iso === todayISO;
            const marked     = markedDates[iso];
            return (
              <TouchableOpacity
                key={idx}
                style={[
                  cal.cell,
                  isSelected && { backgroundColor: GOLD, borderRadius: 10 },
                  isToday && !isSelected && { borderWidth: 1, borderColor: GOLD + '80', borderRadius: 10 },
                ]}
                onPress={() => onDayPress(iso)}
                activeOpacity={0.75}
              >
                <Text style={[
                  cal.dayNum,
                  isSelected && { color: DARK_BG, fontWeight: 'bold' },
                  isToday && !isSelected && { color: GOLD },
                ]}>
                  {day}
                </Text>
                {marked && (
                  <View style={cal.dotRow}>
                    {marked.visita   && <View style={[cal.dot, { backgroundColor: GOLD }]} />}
                    {marked.tarefa   && <View style={[cal.dot, { backgroundColor: SILVER }]} />}
                    {marked.lembrete && <View style={[cal.dot, { backgroundColor: SUCCESS }]} />}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}
const cal = StyleSheet.create({
  wrap:     { backgroundColor: CARD_BG, borderRadius: 18, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: GOLD + '25' },
  nav:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  navBtn:   { width: 34, height: 34, borderRadius: 17, backgroundColor: CARD_BG2, justifyContent: 'center', alignItems: 'center' },
  navTitle: { fontSize: 15, fontWeight: 'bold', color: SILVER_LIGHT },
  row:      { flexDirection: 'row' },
  cell:     { flex: 1, alignItems: 'center', paddingVertical: 5, minHeight: 36 },
  dayLabel: { fontSize: 10, color: SILVER_DARK, fontWeight: '600' },
  dayNum:   { fontSize: 13, color: SILVER_LIGHT },
  dotRow:   { flexDirection: 'row', gap: 2, marginTop: 2 },
  dot:      { width: 4, height: 4, borderRadius: 2 },
});

// ── CARD ITEM (visita / tarefa / lembrete) ───────────────────
function ItemCard({ item, tipo, onPress, onDelete, onToggle }) {
  const accent = tipo === 'visita' ? GOLD : tipo === 'tarefa' ? SILVER : SUCCESS;
  return (
    <TouchableOpacity style={[ic.card, { borderLeftColor: accent, opacity: item.concluido ? 0.65 : 1 }]} onPress={onPress} activeOpacity={0.85}>
      <View style={ic.row}>
        {/* Checkbox / ícone */}
        {tipo !== 'visita' ? (
          <TouchableOpacity onPress={() => onToggle(item)} style={ic.check}>
            <Icon
              name={item.concluido ? 'check-box' : 'check-box-outline-blank'}
              size={20}
              color={item.concluido ? SUCCESS : SILVER_DARK}
            />
          </TouchableOpacity>
        ) : (
          <View style={[ic.iconWrap, { backgroundColor: accent + '20' }]}>
            <Icon name="event" size={16} color={accent} />
          </View>
        )}

        {/* Conteúdo */}
        <View style={{ flex: 1 }}>
          <Text style={[ic.titulo, item.concluido && ic.riscado]}>{item.titulo}</Text>
          {item.clienteNome ? <Text style={ic.sub}>{item.clienteNome}</Text> : null}
          {item.descricao   ? <Text style={ic.desc} numberOfLines={1}>{item.descricao}</Text> : null}
        </View>

        {/* Badge + hora + lixo */}
        <View style={ic.right}>
          {tipo === 'visita' && (
            <View style={[ic.badge, { backgroundColor: getStatusColor(item.status) + '25', borderColor: getStatusColor(item.status) + '60' }]}>
              <Text style={[ic.badgeTxt, { color: getStatusColor(item.status) }]}>{item.status}</Text>
            </View>
          )}
          {tipo === 'tarefa' && (
            <View style={[ic.badge, { backgroundColor: getPriorityColor(item.prioridade) + '25', borderColor: getPriorityColor(item.prioridade) + '60' }]}>
              <Text style={[ic.badgeTxt, { color: getPriorityColor(item.prioridade) }]}>{item.prioridade}</Text>
            </View>
          )}
          <Text style={ic.hora}>{item.hora || '--:--'}</Text>
          <TouchableOpacity onPress={() => onDelete(item)} style={ic.del}>
            <Icon name="delete-outline" size={16} color={DANGER} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}
const ic = StyleSheet.create({
  card:    { backgroundColor: CARD_BG, borderRadius: 14, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderWidth: 1, borderColor: SILVER + '20' },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  check:   { width: 28, alignItems: 'center' },
  iconWrap:{ width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  titulo:  { fontSize: 13, fontWeight: 'bold', color: SILVER_LIGHT },
  riscado: { textDecorationLine: 'line-through', color: SILVER_DARK },
  sub:     { fontSize: 11, color: SILVER_DARK, marginTop: 1 },
  desc:    { fontSize: 11, color: SILVER_DARK, marginTop: 1 },
  right:   { alignItems: 'flex-end', gap: 4 },
  badge:   { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  badgeTxt:{ fontSize: 9, fontWeight: '700' },
  hora:    { fontSize: 10, color: SILVER_DARK },
  del:     { width: 26, height: 26, borderRadius: 8, backgroundColor: DANGER + '15', justifyContent: 'center', alignItems: 'center' },
});

// ── FORM VAZIO ───────────────────────────────────────────────
const emptyForm = (date) => ({
  titulo: '', descricao: '', data: date || todayStr(),
  hora: '09:00', clienteId: '', clienteNome: '',
  status: 'pendente', prioridade: 'media', concluido: false,
});

// ════════════════════════════════════════════════════════════
export default function PlanejamentoScreen({ navigation, route }) {
  const [visitas,       setVisitas]       = useState([]);
  const [tarefas,       setTarefas]       = useState([]);
  const [lembretes,     setLembretes]     = useState([]);
  const [clientes,      setClientes]      = useState([]);
  const [selectedDate,  setSelectedDate]  = useState(todayStr());
  const [activeTab,     setActiveTab]     = useState('visita');
  const [modalVisible,  setModalVisible]  = useState(false);
  const [modalType,     setModalType]     = useState('visita');
  const [editingItem,   setEditingItem]   = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [formData,      setFormData]      = useState(emptyForm());

  useEffect(() => { loadAll(); loadClientes(); }, []);

  // Suporte a parâmetros de navegação vindos do Dashboard
  useEffect(() => {
    if (!route?.params) return;
    const { tab, data } = route.params;
    if (tab)  setActiveTab(tab === 'tarefa' ? 'tarefa' : 'visita');
    if (data) setSelectedDate(data);
  }, [route?.params]);

  const loadAll = async () => {
    try {
      const load = async (col) => {
        const snap = await getDocs(collection(db, col));
        const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
        return arr;
      };
      setVisitas(await load('visitas'));
      setTarefas(await load('tarefas'));
      setLembretes(await load('lembretes'));
    } catch (e) { console.log('Erro planejamento:', e); }
  };

  const loadClientes = async () => {
    try {
      const snap = await getDocs(collection(db, 'clientes'));
      const arr = []; snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      setClientes(arr);
    } catch (e) {}
  };

  // Filtros por data
  const visitasDoDia   = visitas.filter(v => v.data === selectedDate);
  const tarefasDoDia   = tarefas.filter(t => t.data === selectedDate);
  const lembretesDoDia = lembretes.filter(l => l.data === selectedDate);

  // Datas marcadas para o calendário
  const markedDates = {};
  visitas.forEach(v => {
    if (!markedDates[v.data]) markedDates[v.data] = {};
    markedDates[v.data].visita = true;
  });
  tarefas.forEach(t => {
    if (!markedDates[t.data]) markedDates[t.data] = {};
    markedDates[t.data].tarefa = true;
  });
  lembretes.forEach(l => {
    if (!markedDates[l.data]) markedDates[l.data] = {};
    markedDates[l.data].lembrete = true;
  });

  const salvarItem = async () => {
    if (!formData.titulo) { Alert.alert('Atenção', 'Título é obrigatório'); return; }
    setLoading(true);
    try {
      const colName = modalType === 'visita' ? 'visitas' : modalType === 'tarefa' ? 'tarefas' : 'lembretes';
      const dados = { ...formData, usuarioId: auth.currentUser?.uid, dataCriacao: new Date().toISOString() };
      if (editingItem) {
        await updateDoc(doc(db, colName, editingItem.id), dados);
      } else {
        await addDoc(collection(db, colName), dados);
      }
      setModalVisible(false); setEditingItem(null);
      await loadAll();
    } catch (e) { Alert.alert('Erro', 'Não foi possível salvar'); }
    finally { setLoading(false); }
  };

  const deleteItem = (item) => {
    const colName = activeTab === 'visita' ? 'visitas' : activeTab === 'tarefa' ? 'tarefas' : 'lembretes';
    Alert.alert('Excluir', `Remover "${item.titulo}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
        await deleteDoc(doc(db, colName, item.id));
        await loadAll();
      }},
    ]);
  };

  const toggleConcluido = async (item) => {
    const colName = activeTab === 'tarefa' ? 'tarefas' : 'lembretes';
    try {
      await updateDoc(doc(db, colName, item.id), { concluido: !item.concluido });
      await loadAll();
    } catch (e) {}
  };

  const openModal = (tipo, item = null) => {
    setModalType(tipo);
    setEditingItem(item);
    setFormData(item ? { ...item } : emptyForm(selectedDate));
    setModalVisible(true);
  };

  const listData = activeTab === 'visita' ? visitasDoDia : activeTab === 'tarefa' ? tarefasDoDia : lembretesDoDia;

  const TABS = [
    { key: 'visita',   label: 'Visitas',   icon: 'event',         count: visitasDoDia.length   },
    { key: 'tarefa',   label: 'Tarefas',   icon: 'check-circle',  count: tarefasDoDia.length   },
    { key: 'lembrete', label: 'Lembretes', icon: 'notifications', count: lembretesDoDia.length  },
  ];

  // Formata data selecionada p/ exibição
  const [sy, sm, sd] = selectedDate.split('-');
  const dataExibida  = `${sd}/${sm}/${sy}`;
  const dataObj      = new Date(parseInt(sy), parseInt(sm)-1, parseInt(sd));
  const diaSemana    = DIAS_SEMANA_SHORT[dataObj.getDay()];

  return (
    <View style={ds.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} />

      {/* HEADER */}
      <View style={ds.header}>
        <View style={ds.headerRow}>
          <View>
            <Text style={ds.headerTitle}>Planejamento</Text>
            <Text style={ds.headerSub}>Organize suas visitas e tarefas</Text>
          </View>
          <TouchableOpacity
            style={ds.addBtn}
            onPress={() => openModal(activeTab)}
            activeOpacity={0.85}
          >
            <Icon name="add" size={20} color={DARK_BG} />
            <Text style={ds.addBtnTxt}>Novo</Text>
          </TouchableOpacity>
        </View>
        <ShimmerLine color={GOLD} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* CALENDÁRIO PURO */}
        <View style={ds.section}>
          <CalendarioPuro
            selectedDate={selectedDate}
            onDayPress={setSelectedDate}
            markedDates={markedDates}
          />
        </View>

        {/* RESUMO DO DIA */}
        <View style={ds.section}>
          <View style={ds.diaResumo}>
            <View>
              <Text style={ds.diaLabel}>{diaSemana}</Text>
              <Text style={ds.diaData}>{dataExibida}</Text>
            </View>
            <View style={ds.diaStats}>
              {TABS.map(tab => (
                <View key={tab.key} style={ds.diaStat}>
                  <Text style={[ds.diaStatNum, { color: tab.key === 'visita' ? GOLD : tab.key === 'tarefa' ? SILVER : SUCCESS }]}>
                    {tab.count}
                  </Text>
                  <Text style={ds.diaStatLabel}>{tab.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ABAS */}
        <View style={ds.section}>
          <View style={ds.tabs}>
            {TABS.map(tab => {
              const active = activeTab === tab.key;
              const accent = tab.key === 'visita' ? GOLD : tab.key === 'tarefa' ? SILVER : SUCCESS;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[ds.tab, active && { backgroundColor: accent + '20', borderColor: accent + '60' }]}
                  onPress={() => setActiveTab(tab.key)}
                  activeOpacity={0.8}
                >
                  <Icon name={tab.icon} size={15} color={active ? accent : SILVER_DARK} />
                  <Text style={[ds.tabTxt, { color: active ? accent : SILVER_DARK }]}>{tab.label}</Text>
                  {tab.count > 0 && (
                    <View style={[ds.tabBadge, { backgroundColor: accent }]}>
                      <Text style={ds.tabBadgeTxt}>{tab.count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* LISTA DO DIA */}
        <View style={ds.section}>
          {listData.length === 0 ? (
            <View style={ds.empty}>
              <Icon name={activeTab === 'visita' ? 'event-busy' : activeTab === 'tarefa' ? 'assignment' : 'notifications-off'} size={44} color={GOLD + '35'} />
              <Text style={ds.emptyTitle}>Nenhum item para este dia</Text>
              <TouchableOpacity style={ds.emptyBtn} onPress={() => openModal(activeTab)}>
                <Text style={ds.emptyBtnTxt}>+ Adicionar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            listData
              .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''))
              .map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
                  tipo={activeTab}
                  onPress={() => openModal(activeTab, item)}
                  onDelete={deleteItem}
                  onToggle={toggleConcluido}
                />
              ))
          )}
        </View>

      </ScrollView>

      {/* ══ MODAL ══ */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={mo.overlay}>
          <View style={mo.sheet}>
            <View style={mo.header}>
              <View style={mo.headerLeft}>
                <View style={mo.headerIcon}>
                  <Icon name={modalType === 'visita' ? 'event' : modalType === 'tarefa' ? 'check-circle' : 'notifications'} size={18} color={DARK_BG} />
                </View>
                <Text style={mo.headerTitle}>
                  {editingItem ? 'Editar' : 'Novo'} {modalType === 'visita' ? 'Visita' : modalType === 'tarefa' ? 'Tarefa' : 'Lembrete'}
                </Text>
              </View>
              <TouchableOpacity style={mo.closeBtn} onPress={() => setModalVisible(false)}>
                <Icon name="close" size={18} color={SILVER_DARK} />
              </TouchableOpacity>
            </View>

            <ShimmerLine color={GOLD} />

            <ScrollView style={mo.body} showsVerticalScrollIndicator={false}>

              {/* Título */}
              <Text style={mo.label}>TÍTULO *</Text>
              <View style={mo.inputWrap}>
                <TextInput
                  style={mo.input}
                  placeholder="Título"
                  placeholderTextColor={SILVER_DARK}
                  value={formData.titulo}
                  onChangeText={t => setFormData(p => ({ ...p, titulo: t }))}
                />
              </View>

              {/* Descrição */}
              <Text style={mo.label}>DESCRIÇÃO</Text>
              <View style={[mo.inputWrap, { alignItems: 'flex-start', paddingTop: 10 }]}>
                <TextInput
                  style={[mo.input, { height: 60, textAlignVertical: 'top' }]}
                  placeholder="Descrição opcional"
                  placeholderTextColor={SILVER_DARK}
                  value={formData.descricao}
                  onChangeText={t => setFormData(p => ({ ...p, descricao: t }))}
                  multiline
                />
              </View>

              {/* Data e Hora */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={mo.label}>DATA</Text>
                  <View style={mo.inputWrap}>
                    <TextInput
                      style={mo.input}
                      placeholder="AAAA-MM-DD"
                      placeholderTextColor={SILVER_DARK}
                      value={formData.data}
                      onChangeText={t => setFormData(p => ({ ...p, data: t }))}
                    />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={mo.label}>HORA</Text>
                  <View style={mo.inputWrap}>
                    <TextInput
                      style={mo.input}
                      placeholder="09:00"
                      placeholderTextColor={SILVER_DARK}
                      value={formData.hora}
                      onChangeText={t => setFormData(p => ({ ...p, hora: t }))}
                    />
                  </View>
                </View>
              </View>

              {/* Cliente (só em visita) */}
              {modalType === 'visita' && (
                <>
                  <Text style={mo.label}>CLIENTE</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    <TouchableOpacity
                      style={[mo.chip, !formData.clienteId && mo.chipActive]}
                      onPress={() => setFormData(p => ({ ...p, clienteId: '', clienteNome: '' }))}
                    >
                      <Text style={[mo.chipTxt, !formData.clienteId && mo.chipTxtActive]}>Sem cliente</Text>
                    </TouchableOpacity>
                    {clientes.map(c => (
                      <TouchableOpacity
                        key={c.id}
                        style={[mo.chip, formData.clienteId === c.id && mo.chipActive]}
                        onPress={() => setFormData(p => ({ ...p, clienteId: c.id, clienteNome: c.nome }))}
                      >
                        <Text style={[mo.chipTxt, formData.clienteId === c.id && mo.chipTxtActive]}>{c.nome}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <Text style={mo.label}>STATUS</Text>
                  <View style={mo.optRow}>
                    {['pendente','confirmado','cancelado','realizado'].map(s => (
                      <TouchableOpacity
                        key={s}
                        style={[mo.opt, formData.status === s && { backgroundColor: getStatusColor(s) + '25', borderColor: getStatusColor(s) + '80' }]}
                        onPress={() => setFormData(p => ({ ...p, status: s }))}
                      >
                        <Text style={[mo.optTxt, formData.status === s && { color: getStatusColor(s) }]}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Prioridade (só em tarefa) */}
              {modalType === 'tarefa' && (
                <>
                  <Text style={mo.label}>PRIORIDADE</Text>
                  <View style={mo.optRow}>
                    {['baixa','media','alta'].map(p => (
                      <TouchableOpacity
                        key={p}
                        style={[mo.opt, { flex: 1 }, formData.prioridade === p && { backgroundColor: getPriorityColor(p) + '25', borderColor: getPriorityColor(p) + '80' }]}
                        onPress={() => setFormData(prev => ({ ...prev, prioridade: p }))}
                      >
                        <Text style={[mo.optTxt, formData.prioridade === p && { color: getPriorityColor(p) }]}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Salvar */}
              <TouchableOpacity
                style={[mo.saveBtn, loading && { opacity: 0.7 }]}
                onPress={salvarItem}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Icon name="save" size={18} color={DARK_BG} style={{ marginRight: 8 }} />
                <Text style={mo.saveTxt}>{loading ? 'SALVANDO...' : editingItem ? 'ATUALIZAR' : 'SALVAR'}</Text>
              </TouchableOpacity>

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── STYLES ────────────────────────────────────────────────────
const ds = StyleSheet.create({
  container:    { flex: 1, backgroundColor: DARK_BG },
  header:       { backgroundColor: '#001828', paddingTop: 18, paddingHorizontal: 20, paddingBottom: 14, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, shadowColor: GOLD, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  headerRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerTitle:  { fontSize: 24, fontWeight: 'bold', color: SILVER_LIGHT },
  headerSub:    { fontSize: 12, color: SILVER_DARK, marginTop: 2 },
  addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: GOLD, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, shadowColor: GOLD, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 5 },
  addBtnTxt:    { fontSize: 13, fontWeight: 'bold', color: DARK_BG },
  section:      { paddingHorizontal: 16, paddingTop: 14 },
  diaResumo:    { backgroundColor: CARD_BG, borderRadius: 16, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: GOLD + '25' },
  diaLabel:     { fontSize: 11, color: SILVER_DARK, fontWeight: '600', textTransform: 'uppercase' },
  diaData:      { fontSize: 20, fontWeight: 'bold', color: GOLD, marginTop: 2 },
  diaStats:     { flexDirection: 'row', gap: 20 },
  diaStat:      { alignItems: 'center' },
  diaStatNum:   { fontSize: 18, fontWeight: 'bold' },
  diaStatLabel: { fontSize: 9, color: SILVER_DARK, marginTop: 1 },
  tabs:         { flexDirection: 'row', gap: 8 },
  tab:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 12, backgroundColor: CARD_BG, borderWidth: 1, borderColor: SILVER + '20' },
  tabTxt:       { fontSize: 11, fontWeight: '700' },
  tabBadge:     { width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  tabBadgeTxt:  { fontSize: 9, fontWeight: 'bold', color: DARK_BG },
  empty:        { paddingVertical: 40, alignItems: 'center' },
  emptyTitle:   { fontSize: 13, color: SILVER_DARK, marginTop: 10 },
  emptyBtn:     { marginTop: 14, backgroundColor: GOLD + '25', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 8, borderWidth: 1, borderColor: GOLD + '60' },
  emptyBtnTxt:  { fontSize: 12, color: GOLD, fontWeight: '700' },
});

const mo = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: MODAL_BG, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', borderTopWidth: 1, borderColor: GOLD + '30' },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center' },
  headerTitle:{ fontSize: 17, fontWeight: 'bold', color: SILVER_LIGHT },
  closeBtn:   { width: 32, height: 32, borderRadius: 16, backgroundColor: CARD_BG2, justifyContent: 'center', alignItems: 'center' },
  body:       { paddingHorizontal: 20, paddingTop: 14 },
  label:      { fontSize: 10, fontWeight: '700', color: SILVER_DARK, letterSpacing: 1, marginBottom: 6, marginTop: 14 },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD_BG, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 2, borderWidth: 1, borderColor: SILVER + '25', marginBottom: 4 },
  input:      { flex: 1, fontSize: 14, color: SILVER_LIGHT, paddingVertical: 10 },
  chip:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: CARD_BG, borderWidth: 1, borderColor: SILVER + '30', marginRight: 8 },
  chipActive: { backgroundColor: GOLD + '25', borderColor: GOLD + '80' },
  chipTxt:    { fontSize: 12, color: SILVER_DARK, fontWeight: '600' },
  chipTxtActive:{ color: GOLD },
  optRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  opt:        { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: CARD_BG, borderWidth: 1, borderColor: SILVER + '25' },
  optTxt:     { fontSize: 11, fontWeight: '600', color: SILVER_DARK },
  saveBtn:    { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: GOLD, borderRadius: 14, paddingVertical: 15, marginTop: 20, shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  saveTxt:    { fontSize: 14, fontWeight: 'bold', color: DARK_BG },
});