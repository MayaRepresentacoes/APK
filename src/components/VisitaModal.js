// components/VisitaModal.js
// ════════════════════════════════════════════════════════════════
// VISITA MODAL — Registro rápido de visita/check-in em modal.
// Usado em: ClienteDetalheScreen, PlanejamentoScreen,
//           HistoricoClienteScreen.
//
// Props:
//   visible    — boolean
//   cliente    — objeto do cliente
//   onClose()  — fecha sem salvar
//   onSaved()  — chamado após salvar com sucesso
//
// FUSÃO v2:
//   Base       : versão doc 18 (real — usa registrarCheckin)
//   Correção   : validação de resultado antes de salvar
//                Alert quando resultado não selecionado
// ════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Alert, Animated, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Icon }             from 'react-native-elements';
import * as Location        from 'expo-location';
import { registrarCheckin } from '../services/visitaService';

// ── Paleta ─────────────────────────────────────────────────────
const GOLD        = '#E8B432';
const SILVER      = '#C0D2E6';
const SILVER_LIGHT= '#E8EEF5';
const SILVER_DARK = '#8A9BB0';
const DARK_BG     = '#001E2E';
const CARD_BG     = '#002840';
const CARD_BG2    = '#003352';
const MODAL_BG    = '#001828';
const SUCCESS     = '#4CAF50';
const DANGER      = '#EF5350';
const WARN        = '#FF9800';
const BLUE        = '#5BA3D0';
const PURPLE      = '#C56BF0';

const PRODUTOS_LISTA = ['caixas','tubos','conexoes','telhas','vasos','metais','tintas'];
const PROD_COLOR = {
  caixas:BLUE, tubos:SILVER, conexoes:WARN, telhas:GOLD,
  vasos:SUCCESS, metais:'#9E9E9E', tintas:'#E91E63',
};
const PROD_ICON = {
  caixas:'inventory-2', tubos:'horizontal-rule', conexoes:'settings-input-component',
  telhas:'roofing', vasos:'local-florist', metais:'hardware', tintas:'format-paint',
};
const MOTIVOS = [
  { key:'semestoque',    label:'Sem espaço',            color:WARN        },
  { key:'precoalto',     label:'Preço alto',            color:DANGER      },
  { key:'outroforn',     label:'Outro fornecedor',      color:PURPLE      },
  { key:'proximasemana', label:'Próxima visita',        color:BLUE        },
  { key:'ausente',       label:'Cliente ausente',       color:SILVER_DARK },
  { key:'seminteresse',  label:'Sem interesse',         color:DANGER      },
  { key:'aguardpgto',    label:'Aguardando pagamento',  color:WARN        },
  { key:'outro',         label:'Outro',                 color:SILVER      },
];

function formatarValorInput(raw) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10);
  if (isNaN(num)) return '';
  return (num / 100).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

export default function VisitaModal({ visible, cliente, onClose, onSaved }) {
  const [resultado,   setResultado]  = useState('');
  const [valor,       setValor]      = useState('');
  const [produtos,    setProdutos]   = useState([]);
  const [motivos,     setMotivos]    = useState([]);
  const [observacao,  setObservacao] = useState('');
  const [salvando,    setSalvando]   = useState(false);
  const [localizacao, setLocalizacao]= useState(null);
  const [captGPS,     setCaptGPS]    = useState(false);

  const slideAnim = useRef(new Animated.Value(300)).current;

  // Captura GPS ao abrir e reseta estados
  useEffect(() => {
    if (visible) {
      setResultado(''); setValor(''); setProdutos([]);
      setMotivos([]); setObservacao(''); setLocalizacao(null);
      capturarGPS();
      Animated.spring(slideAnim, { toValue:0, friction:8, useNativeDriver:true }).start();
    } else {
      Animated.timing(slideAnim, { toValue:300, duration:220, useNativeDriver:true }).start();
    }
  }, [visible]);

  const capturarGPS = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      setCaptGPS(true);
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocalizacao({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch (e) {
      // GPS opcional — não bloqueia o fluxo
    } finally {
      setCaptGPS(false);
    }
  };

  const toggleProduto = (p) =>
    setProdutos(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const toggleMotivo = (m) =>
    setMotivos(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

  const salvar = async () => {
    if (!resultado) {
      Alert.alert('Atenção', 'Selecione o resultado da visita.');
      return;
    }
    if (resultado === 'naocomprou' && motivos.length === 0) {
      Alert.alert('Atenção', 'Selecione pelo menos 1 motivo para não compra.');
      return;
    }
    setSalvando(true);
    try {
      await registrarCheckin({
        clienteId    : cliente.id,
        clienteNome  : cliente.nome,
        clienteTipo  : cliente.tipo    || '',
        clienteCidade: cliente.cidade  || '',
        tipoRegistro : 'visita',
        resultado,
        valor,
        produtos     : resultado === 'comprou'    ? produtos : [],
        motivos      : resultado === 'naocomprou' ? motivos  : [],
        observacao,
        localizacao,
        representada : cliente.representada || 'geral',
      });
      onSaved?.();
    } catch (e) {
      console.log('[VisitaModal] salvar:', e);
      Alert.alert('Erro', 'Não foi possível salvar a visita.');
    } finally {
      setSalvando(false);
    }
  };

  if (!cliente) return null;

  const comprou    = resultado === 'comprou';
  const naoComprou = resultado === 'naocomprou';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex:1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={ms.overlay}>
          <TouchableOpacity style={{ flex:1 }} onPress={onClose} />
          <Animated.View style={[ms.sheet, { transform:[{ translateY: slideAnim }] }]}>

            {/* Header */}
            <View style={ms.header}>
              <View style={ms.headerLeft}>
                <View style={ms.headerIconWrap}>
                  <Icon name="pin-drop" size={18} color={DARK_BG} type="material" />
                </View>
                <View>
                  <Text style={ms.headerTitulo} numberOfLines={1}>{cliente.nome}</Text>
                  <Text style={ms.headerSub}>Registrar visita rápida</Text>
                </View>
              </View>
              <View style={[ms.gpsBadge, localizacao ? ms.gpsOk : ms.gpsOff]}>
                <Icon
                  name={localizacao ? 'gps-fixed' : captGPS ? 'gps-not-fixed' : 'gps-off'}
                  size={11}
                  color={localizacao ? SUCCESS : SILVER_DARK}
                  type="material"
                />
                <Text style={[ms.gpsTxt, { color: localizacao ? SUCCESS : SILVER_DARK }]}>
                  {localizacao ? 'GPS' : captGPS ? '...' : 'Sem GPS'}
                </Text>
              </View>
              <TouchableOpacity style={ms.closeBtn} onPress={onClose}>
                <Icon name="close" size={18} color={SILVER_DARK} type="material" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={ms.body}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled">

              {/* Resultado */}
              <Text style={ms.label}>Resultado *</Text>
              <View style={ms.resultadoRow}>
                <TouchableOpacity
                  style={[ms.resultadoBtn, comprou && { backgroundColor:SUCCESS, borderColor:SUCCESS }]}
                  onPress={() => { setResultado('comprou'); setMotivos([]); }}
                  activeOpacity={0.8}>
                  <Icon name="check-circle" size={22} color={comprou ? '#fff' : SUCCESS} type="material" />
                  <Text style={[ms.resultadoBtnTxt, comprou && { color:'#fff' }]}>✅ Comprou</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[ms.resultadoBtn, naoComprou && { backgroundColor:DANGER, borderColor:DANGER }]}
                  onPress={() => { setResultado('naocomprou'); setProdutos([]); setValor(''); }}
                  activeOpacity={0.8}>
                  <Icon name="cancel" size={22} color={naoComprou ? '#fff' : DANGER} type="material" />
                  <Text style={[ms.resultadoBtnTxt, naoComprou && { color:'#fff' }]}>❌ Não Comprou</Text>
                </TouchableOpacity>
              </View>

              {/* Comprou: valor + produtos */}
              {comprou && (
                <>
                  <Text style={ms.label}>Valor (R$)</Text>
                  <View style={ms.inputWrap}>
                    <Icon name="attach-money" size={16} color={GOLD} type="material" />
                    <Text style={ms.inputPrefix}>R$</Text>
                    <TextInput
                      style={ms.input}
                      placeholder="0,00"
                      placeholderTextColor={SILVER_DARK}
                      value={valor}
                      onChangeText={t => setValor(formatarValorInput(t))}
                      keyboardType="numeric"
                    />
                  </View>

                  <Text style={ms.label}>Produtos</Text>
                  <View style={ms.prodGrid}>
                    {PRODUTOS_LISTA.map(p => {
                      const ativo = produtos.includes(p);
                      const cor   = PROD_COLOR[p] || GOLD;
                      return (
                        <TouchableOpacity
                          key={p}
                          style={[ms.prodChip, ativo && { backgroundColor:cor+'25', borderColor:cor }]}
                          onPress={() => toggleProduto(p)}
                          activeOpacity={0.8}>
                          <Icon
                            name={PROD_ICON[p] || 'inventory'}
                            size={12}
                            color={ativo ? cor : SILVER_DARK}
                            type="material"
                          />
                          <Text style={[ms.prodChipTxt, ativo && { color:cor }]}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Não comprou: motivos */}
              {naoComprou && (
                <>
                  <Text style={ms.label}>Motivo *</Text>
                  <View style={ms.motivoGrid}>
                    {MOTIVOS.map(m => {
                      const ativo = motivos.includes(m.key);
                      return (
                        <TouchableOpacity
                          key={m.key}
                          style={[ms.motivoChip, ativo && { backgroundColor:m.color+'20', borderColor:m.color }]}
                          onPress={() => toggleMotivo(m.key)}
                          activeOpacity={0.8}>
                          <View style={[ms.motivoCheck, ativo && { backgroundColor:m.color, borderColor:m.color }]}>
                            {ativo && <Icon name="check" size={9} color="#fff" type="material" />}
                          </View>
                          <Text style={[ms.motivoTxt, ativo && { color:m.color }]}>{m.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Observação */}
              <Text style={ms.label}>Observação</Text>
              <View style={[ms.inputWrap, { alignItems:'flex-start', paddingTop:10 }]}>
                <Icon name="notes" size={16} color={SILVER_DARK} type="material" style={{ marginTop:2 }} />
                <TextInput
                  style={[ms.input, { height:60, textAlignVertical:'top' }]}
                  placeholder="Anotações..."
                  placeholderTextColor={SILVER_DARK}
                  value={observacao}
                  onChangeText={setObservacao}
                  multiline
                />
              </View>

              {/* Botão salvar */}
              <TouchableOpacity
                style={[ms.salvarBtn, salvando && { opacity:0.7 }]}
                onPress={salvar}
                disabled={salvando}
                activeOpacity={0.85}>
                <Icon
                  name={salvando ? 'hourglass-empty' : 'check'}
                  size={18} color={DARK_BG} type="material"
                />
                <Text style={ms.salvarBtnTxt}>
                  {salvando ? 'Salvando...' : 'CONFIRMAR VISITA'}
                </Text>
              </TouchableOpacity>

              <View style={{ height:30 }} />
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ms = StyleSheet.create({
  overlay        : { flex:1, backgroundColor:'rgba(0,0,0,0.75)', justifyContent:'flex-end' },
  sheet          : { backgroundColor:MODAL_BG, borderTopLeftRadius:26, borderTopRightRadius:26, maxHeight:'88%', borderTopWidth:1, borderColor:GOLD+'35' },
  header         : { flexDirection:'row', alignItems:'center', gap:10, padding:16 },
  headerLeft     : { flexDirection:'row', alignItems:'center', gap:10, flex:1 },
  headerIconWrap : { width:34, height:34, borderRadius:11, backgroundColor:GOLD, justifyContent:'center', alignItems:'center' },
  headerTitulo   : { fontSize:14, fontWeight:'800', color:SILVER_LIGHT },
  headerSub      : { fontSize:10, color:SILVER_DARK, marginTop:1 },
  gpsBadge       : { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:7, paddingVertical:3, borderRadius:8, borderWidth:1 },
  gpsOk          : { backgroundColor:SUCCESS+'15', borderColor:SUCCESS+'40' },
  gpsOff         : { backgroundColor:CARD_BG2, borderColor:SILVER+'20' },
  gpsTxt         : { fontSize:9, fontWeight:'700' },
  closeBtn       : { width:32, height:32, borderRadius:16, backgroundColor:CARD_BG2, justifyContent:'center', alignItems:'center' },
  body           : { paddingHorizontal:18 },
  label          : { fontSize:10, fontWeight:'700', color:SILVER_DARK, letterSpacing:0.6, textTransform:'uppercase', marginBottom:7, marginTop:16 },
  resultadoRow   : { flexDirection:'row', gap:10 },
  resultadoBtn   : { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:CARD_BG, borderRadius:14, paddingVertical:14, borderWidth:2, borderColor:SILVER+'20' },
  resultadoBtnTxt: { fontSize:12, fontWeight:'800', color:SILVER },
  inputWrap      : { flexDirection:'row', alignItems:'center', backgroundColor:CARD_BG, borderRadius:12, paddingHorizontal:12, paddingVertical:4, borderWidth:1, borderColor:SILVER+'22', gap:7 },
  inputPrefix    : { fontSize:14, fontWeight:'700', color:GOLD },
  input          : { flex:1, fontSize:14, color:SILVER_LIGHT, paddingVertical:10 },
  prodGrid       : { flexDirection:'row', flexWrap:'wrap', gap:7 },
  prodChip       : { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:CARD_BG, borderRadius:10, paddingHorizontal:11, paddingVertical:8, borderWidth:1, borderColor:SILVER+'22' },
  prodChipTxt    : { fontSize:11, fontWeight:'700', color:SILVER_DARK },
  motivoGrid     : { gap:7 },
  motivoChip     : { flexDirection:'row', alignItems:'center', gap:9, backgroundColor:CARD_BG, borderRadius:12, padding:11, borderWidth:1, borderColor:SILVER+'20' },
  motivoCheck    : { width:18, height:18, borderRadius:5, borderWidth:1.5, borderColor:SILVER_DARK, justifyContent:'center', alignItems:'center' },
  motivoTxt      : { fontSize:12, fontWeight:'600', color:SILVER_DARK, flex:1 },
  salvarBtn      : { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:GOLD, borderRadius:14, paddingVertical:15, marginTop:20 },
  salvarBtnTxt   : { fontSize:14, fontWeight:'bold', color:DARK_BG, letterSpacing:0.4 },
});