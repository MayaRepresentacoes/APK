import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  ScrollView, TextInput, Alert, Animated, Dimensions,
} from 'react-native';
import { Icon } from 'react-native-elements';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';

const { width: SW } = Dimensions.get('window');

const GOLD         = '#E8B432';
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

const FORNECEDORES   = ['FORTLEV', 'AFORT', 'METAL TECK', 'TINTAS S.'];
const MOTIVOS_NAO    = ['Preço alto', 'Prazo longo', 'Sem estoque', 'Já comprou de outro', 'Não tinha interesse', 'Outro'];
const INTERESSE_OPTS = ['Alto', 'Médio', 'Baixo', 'Nenhum'];

function ShimmerLine({ color = GOLD }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(anim, { toValue: 1, duration: 2200, useNativeDriver: true })).start();
  }, []);
  return (
    <View style={{ height: 2, width: '100%', backgroundColor: color + '30', overflow: 'hidden' }}>
      <Animated.View style={{
        position: 'absolute', height: '100%', width: 80, backgroundColor: color + 'CC',
        transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-80, SW] }) }],
      }} />
    </View>
  );
}

// ── CHIP SELECIONÁVEL ────────────────────────────────────────
function Chip({ label, active, onPress, color = GOLD }) {
  return (
    <TouchableOpacity
      style={[s.chip, active && { backgroundColor: color, borderColor: color }]}
      onPress={onPress} activeOpacity={0.8}>
      <Text style={[s.chipTxt, active && { color: DARK_BG }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ════════════════════════════════════════════════════════════
// VISITA MODAL — use assim:
//   <VisitaModal
//     visible={modalVisita}
//     cliente={clienteSelecionado}       // { id, nome, tipo, ... }
//     onClose={() => setModalVisita(false)}
//     onSaved={() => { setModalVisita(false); /* refresh */ }}
//   />
// ════════════════════════════════════════════════════════════
export default function VisitaModal({ visible, cliente, onClose, onSaved }) {
  const slideAnim = useRef(new Animated.Value(600)).current;

  const [resultado,    setResultado]    = useState(null);   // 'comprou' | 'nao_comprou' | 'retornar'
  const [fornecedores, setFornecedores] = useState({});     // { FORTLEV: true, ... }
  const [motivo,       setMotivo]       = useState(null);
  const [interesse,    setInteresse]    = useState(null);
  const [observacoes,  setObservacoes]  = useState('');
  const [salvando,     setSalvando]     = useState(false);

  // Animação de entrada
  useEffect(() => {
    if (visible) {
      resetForm();
      Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 600, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible]);

  const resetForm = () => {
    setResultado(null);
    setFornecedores({});
    setMotivo(null);
    setInteresse(null);
    setObservacoes('');
  };

  const toggleFornecedor = (f) =>
    setFornecedores(prev => ({ ...prev, [f]: !prev[f] }));

  const salvar = async () => {
    if (!resultado) { Alert.alert('Atenção', 'Selecione o resultado da visita.'); return; }
    if (resultado === 'comprou' && !Object.values(fornecedores).some(Boolean)) {
      Alert.alert('Atenção', 'Selecione qual fornecedor o cliente comprou.'); return;
    }
    setSalvando(true);
    try {
      const agora = new Date();
      await addDoc(collection(db, 'visitas'), {
        clienteId:    cliente?.id   || '',
        clienteNome:  cliente?.nome || '',
        clienteTipo:  cliente?.tipo || '',
        data:         serverTimestamp(),
        dataLocal:    agora.toISOString(),
        dataFormatada: agora.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        resultado,
        fornecedores: resultado === 'comprou' ? fornecedores : {},
        motivo:       resultado === 'nao_comprou' ? (motivo || '') : '',
        interesse:    resultado !== 'comprou' ? (interesse || '') : '',
        observacoes,
      });
      onSaved?.();
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível salvar a visita.');
      console.log(e);
    } finally { setSalvando(false); }
  };

  const getResultadoColor = (r) =>
    r === 'comprou' ? SUCCESS : r === 'nao_comprou' ? DANGER : WARN;

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        {/* Tap fora fecha */}
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />

        <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>

          {/* ── HEADER ── */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={s.headerIcon}>
                <Icon name="location-on" size={18} color={DARK_BG} type="material" />
              </View>
              <View>
                <Text style={s.headerTitle}>Check-in de Visita</Text>
                <Text style={s.headerSub} numberOfLines={1}>{cliente?.nome || '—'}</Text>
              </View>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
              <Icon name="close" size={20} color={SILVER} type="material" />
            </TouchableOpacity>
          </View>

          <ShimmerLine color={GOLD} />

          <ScrollView style={s.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* ── DATA/HORA AUTO ── */}
            <View style={s.dataBanner}>
              <Icon name="access-time" size={16} color={GOLD} type="material" />
              <Text style={s.dataText}>
                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                {'  ·  '}
                {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>

            {/* ── RESULTADO ── */}
            <Text style={s.label}>RESULTADO DA VISITA *</Text>
            <View style={s.resultadoRow}>

              <TouchableOpacity
                style={[s.resultBtn, resultado === 'comprou' && { backgroundColor: SUCCESS + '25', borderColor: SUCCESS }]}
                onPress={() => setResultado('comprou')} activeOpacity={0.85}>
                <View style={[s.resultIcon, { backgroundColor: SUCCESS + '20' }]}>
                  <Icon name="check-circle" size={22} color={SUCCESS} type="material" />
                </View>
                <Text style={[s.resultTxt, resultado === 'comprou' && { color: SUCCESS }]}>Comprou</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.resultBtn, resultado === 'nao_comprou' && { backgroundColor: DANGER + '25', borderColor: DANGER }]}
                onPress={() => setResultado('nao_comprou')} activeOpacity={0.85}>
                <View style={[s.resultIcon, { backgroundColor: DANGER + '20' }]}>
                  <Icon name="cancel" size={22} color={DANGER} type="material" />
                </View>
                <Text style={[s.resultTxt, resultado === 'nao_comprou' && { color: DANGER }]}>Não comprou</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.resultBtn, resultado === 'retornar' && { backgroundColor: WARN + '25', borderColor: WARN }]}
                onPress={() => setResultado('retornar')} activeOpacity={0.85}>
                <View style={[s.resultIcon, { backgroundColor: WARN + '20' }]}>
                  <Icon name="schedule" size={22} color={WARN} type="material" />
                </View>
                <Text style={[s.resultTxt, resultado === 'retornar' && { color: WARN }]}>Retornar</Text>
              </TouchableOpacity>

            </View>

            {/* ── SE COMPROU: FORNECEDOR ── */}
            {resultado === 'comprou' && (
              <>
                <Text style={s.label}>COMPROU DE QUAL FORNECEDOR? *</Text>
                <View style={s.fornGrid}>
                  {FORNECEDORES.map(f => {
                    const ativo = fornecedores[f];
                    return (
                      <TouchableOpacity
                        key={f}
                        style={[s.fornItem, ativo && { backgroundColor: GOLD + '18', borderColor: GOLD + '80' }]}
                        onPress={() => toggleFornecedor(f)} activeOpacity={0.8}>
                        <View style={[s.fornCheck, ativo && { backgroundColor: GOLD, borderColor: GOLD }]}>
                          {ativo && <Icon name="check" size={12} color={DARK_BG} type="material" />}
                        </View>
                        <Text style={[s.fornLabel, ativo && { color: GOLD, fontWeight: '700' }]}>{f}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* ── SE NÃO COMPROU: MOTIVO ── */}
            {resultado === 'nao_comprou' && (
              <>
                <Text style={s.label}>MOTIVO DA NÃO COMPRA</Text>
                <View style={s.chipsWrap}>
                  {MOTIVOS_NAO.map(m => (
                    <Chip key={m} label={m} active={motivo === m} onPress={() => setMotivo(m === motivo ? null : m)} color={DANGER} />
                  ))}
                </View>
              </>
            )}

            {/* ── INTERESSE FUTURO (não comprou ou retornar) ── */}
            {(resultado === 'nao_comprou' || resultado === 'retornar') && (
              <>
                <Text style={s.label}>INTERESSE FUTURO (POTENCIAL)</Text>
                <View style={s.chipsWrap}>
                  {INTERESSE_OPTS.map(opt => {
                    const c = opt === 'Alto' ? SUCCESS : opt === 'Médio' ? GOLD : opt === 'Baixo' ? WARN : DANGER;
                    return (
                      <Chip key={opt} label={opt} active={interesse === opt} onPress={() => setInteresse(opt === interesse ? null : opt)} color={c} />
                    );
                  })}
                </View>
              </>
            )}

            {/* ── OBSERVAÇÕES ── */}
            <Text style={s.label}>OBSERVAÇÕES</Text>
            <View style={s.inputWrap}>
              <TextInput
                style={s.input}
                placeholder="Anotações sobre a visita, negociação, próximos passos..."
                placeholderTextColor={SILVER_DARK}
                value={observacoes}
                onChangeText={setObservacoes}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {/* ── SALVAR ── */}
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: resultado ? getResultadoColor(resultado) : CARD_BG2 }, salvando && { opacity: 0.7 }]}
              onPress={salvar}
              disabled={salvando || !resultado}
              activeOpacity={0.85}>
              <Icon name={salvando ? 'hourglass-empty' : 'check-circle'} size={20} color={resultado ? DARK_BG : SILVER_DARK} type="material" />
              <Text style={[s.saveBtnTxt, { color: resultado ? DARK_BG : SILVER_DARK }]}>
                {salvando ? 'SALVANDO...' : 'REGISTRAR VISITA'}
              </Text>
            </TouchableOpacity>

            <View style={{ height: 30 }} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: MODAL_BG, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '92%', borderTopWidth: 1, borderColor: GOLD + '30', overflow: 'hidden' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, paddingBottom: 14 },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 12 },
  headerIcon:   { width: 38, height: 38, borderRadius: 12, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: 'bold', color: SILVER_LIGHT },
  headerSub:    { fontSize: 12, color: SILVER_DARK, marginTop: 1 },
  closeBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: CARD_BG2, justifyContent: 'center', alignItems: 'center' },
  body:         { paddingHorizontal: 18, paddingTop: 14 },

  // Data banner
  dataBanner:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: GOLD + '12', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: GOLD + '30', marginBottom: 6 },
  dataText:     { fontSize: 13, color: GOLD, fontWeight: '600', flex: 1 },

  // Label
  label:        { fontSize: 10, fontWeight: '700', color: SILVER_DARK, letterSpacing: 1, marginTop: 18, marginBottom: 10, textTransform: 'uppercase' },

  // Resultado
  resultadoRow: { flexDirection: 'row', gap: 8 },
  resultBtn:    { flex: 1, alignItems: 'center', backgroundColor: CARD_BG, borderRadius: 14, paddingVertical: 14, borderWidth: 1.5, borderColor: SILVER + '20' },
  resultIcon:   { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  resultTxt:    { fontSize: 11, fontWeight: '700', color: SILVER_DARK, textAlign: 'center' },

  // Fornecedores
  fornGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fornItem:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: CARD_BG, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: SILVER + '20', width: '47%' },
  fornCheck:    { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: SILVER_DARK, justifyContent: 'center', alignItems: 'center' },
  fornLabel:    { fontSize: 13, color: SILVER_DARK },

  // Chips
  chipsWrap:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: CARD_BG, borderWidth: 1, borderColor: SILVER + '30' },
  chipTxt:      { fontSize: 12, fontWeight: '600', color: SILVER_DARK },

  // Observações
  inputWrap:    { backgroundColor: CARD_BG, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: SILVER + '25' },
  input:        { fontSize: 14, color: SILVER_LIGHT, minHeight: 90 },

  // Salvar
  saveBtn:      { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, borderRadius: 14, paddingVertical: 17, marginTop: 20, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  saveBtnTxt:   { fontSize: 15, fontWeight: 'bold', letterSpacing: 0.5 },
});