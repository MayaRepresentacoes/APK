// components/OrcamentoModal.js
// ════════════════════════════════════════════════════════════════
// ORÇAMENTO MODAL — Criação e edição de orçamentos em modal.
// Usado em: OrcamentosScreen, ClienteDetalheScreen.
//
// Props:
//   visible    — boolean
//   cliente    — objeto do cliente (id + nome)
//   orcamento  — objeto para edição (null = novo orçamento)
//   onClose()  — fecha sem salvar
//   onSaved()  — chamado após salvar com sucesso
// ════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Alert, Animated, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Icon } from 'react-native-elements';
import { criarOrcamento, atualizarStatusOrcamento } from '../services/orcamentoService';
import { updateOrcamento } from '../services/firebase';

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
const PRODUTO_LABEL  = {
  caixas:'Caixas', tubos:'Tubos', conexoes:'Conexões',
  telhas:'Telhas', vasos:'Vasos', metais:'Metais', tintas:'Tintas',
};
const PROD_COLOR = {
  caixas:BLUE, tubos:SILVER, conexoes:WARN, telhas:GOLD,
  vasos:SUCCESS, metais:'#9E9E9E', tintas:'#E91E63',
};

const REPRESENTADAS = [
  { key:'FORTLEV',       label:'Fortlev',      color:BLUE   },
  { key:'AFORT',         label:'Afort',         color:GOLD   },
  { key:'METAL TECH',    label:'Metal Tech',    color:SUCCESS},
  { key:'SOARES TINTAS', label:'Soares Tintas', color:PURPLE },
  { key:'geral',         label:'Geral/Outros',  color:SILVER_DARK },
];

function formatarValorInput(raw) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10);
  if (isNaN(num)) return '';
  return (num / 100).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function emptyForm() {
  return {
    valor        : '',
    produtos     : [],
    observacao   : '',
    dataOrcamento: new Date().toISOString().substring(0, 10),
    dataRetorno  : '',
    representada : 'geral',
  };
}

export default function OrcamentoModal({ visible, cliente, orcamento, onClose, onSaved }) {
  const [form,    setForm]    = useState(emptyForm());
  const [salvando,setSalvando]= useState(false);

  const slideAnim = useRef(new Animated.Value(400)).current;

  // Preenche formulário ao abrir (novo ou edição)
  useEffect(() => {
    if (visible) {
      if (orcamento) {
        setForm({
          valor        : orcamento.valor ? formatarValorInput(String(Math.round(orcamento.valor * 100))) : '',
          produtos     : orcamento.produtos     || [],
          observacao   : orcamento.observacao   || '',
          dataOrcamento: orcamento.dataOrcamento || new Date().toISOString().substring(0, 10),
          dataRetorno  : orcamento.dataRetorno  || orcamento.dataFollowup || '',
          representada : orcamento.representada || 'geral',
        });
      } else {
        setForm(emptyForm());
      }
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 400, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible, orcamento]);

  const toggleProduto = (p) =>
    setForm(prev => ({
      ...prev,
      produtos: prev.produtos.includes(p)
        ? prev.produtos.filter(x => x !== p)
        : [...prev.produtos, p],
    }));

  const salvar = async () => {
    const valorNum = parseFloat(String(form.valor || 0).replace(/\./g, '').replace(',', '.')) || 0;

    if (!cliente?.id) {
      Alert.alert('Erro', 'Cliente não identificado.');
      return;
    }

    setSalvando(true);
    try {
      const dados = {
        clienteId    : cliente.id,
        clienteNome  : cliente.nome || '',
        valor        : valorNum,
        produtos     : form.produtos,
        observacao   : form.observacao,
        dataOrcamento: form.dataOrcamento,
        dataRetorno  : form.dataRetorno  || null,
        dataFollowup : form.dataRetorno  || null, // alias para compatibilidade
        representada : form.representada,
      };

      if (orcamento?.id) {
        // Edição — usa updateOrcamento direto
        await updateOrcamento(orcamento.id, dados);
      } else {
        // Criação
        await criarOrcamento(dados);
      }

      onSaved?.();
    } catch (e) {
      console.log('[OrcamentoModal] salvar:', e);
      Alert.alert('Erro', 'Não foi possível salvar o orçamento.');
    } finally {
      setSalvando(false);
    }
  };

  if (!cliente) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={ms.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={onClose} />
          <Animated.View style={[ms.sheet, { transform: [{ translateY: slideAnim }] }]}>

            {/* Header */}
            <View style={ms.header}>
              <View style={ms.headerIconWrap}>
                <Icon name="request-quote" size={18} color={DARK_BG} type="material" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ms.headerTitulo}>
                  {orcamento ? 'Editar orçamento' : 'Novo orçamento'}
                </Text>
                <Text style={ms.headerSub} numberOfLines={1}>{cliente.nome}</Text>
              </View>
              <TouchableOpacity style={ms.closeBtn} onPress={onClose}>
                <Icon name="close" size={18} color={SILVER_DARK} type="material" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={ms.body}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled">

              {/* Valor */}
              <Text style={ms.label}>Valor (R$)</Text>
              <View style={ms.inputWrap}>
                <Icon name="attach-money" size={16} color={GOLD} type="material" />
                <Text style={ms.inputPrefix}>R$</Text>
                <TextInput
                  style={ms.input}
                  placeholder="0,00"
                  placeholderTextColor={SILVER_DARK}
                  value={form.valor}
                  onChangeText={t => setForm(prev => ({ ...prev, valor: formatarValorInput(t) }))}
                  keyboardType="numeric"
                />
              </View>

              {/* Produtos */}
              <Text style={ms.label}>Produtos</Text>
              <View style={ms.prodGrid}>
                {PRODUTOS_LISTA.map(p => {
                  const ativo = form.produtos.includes(p);
                  const cor   = PROD_COLOR[p] || GOLD;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[ms.prodChip, ativo && { backgroundColor: cor + '22', borderColor: cor }]}
                      onPress={() => toggleProduto(p)}
                      activeOpacity={0.8}>
                      <Text style={[ms.prodChipTxt, ativo && { color: cor }]}>
                        {PRODUTO_LABEL[p]}
                      </Text>
                      {ativo && <Icon name="check" size={10} color={cor} type="material" />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Representada */}
              <Text style={ms.label}>Representada</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={ms.repRow}>
                {REPRESENTADAS.map(r => {
                  const ativo = form.representada === r.key;
                  return (
                    <TouchableOpacity
                      key={r.key}
                      style={[ms.repChip, ativo && { backgroundColor: r.color + '22', borderColor: r.color }]}
                      onPress={() => setForm(prev => ({ ...prev, representada: r.key }))}
                      activeOpacity={0.8}>
                      <Text style={[ms.repChipTxt, ativo && { color: r.color }]}>{r.label}</Text>
                      {ativo && <Icon name="check-circle" size={10} color={r.color} type="material" />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Data do orçamento */}
              <Text style={ms.label}>Data do orçamento</Text>
              <View style={ms.inputWrap}>
                <Icon name="calendar-today" size={16} color={SILVER_DARK} type="material" />
                <TextInput
                  style={ms.input}
                  placeholder="aaaa-mm-dd"
                  placeholderTextColor={SILVER_DARK}
                  value={form.dataOrcamento}
                  onChangeText={t => setForm(prev => ({ ...prev, dataOrcamento: t }))}
                />
              </View>

              {/* Data de retorno / follow-up */}
              <Text style={ms.label}>Data de follow-up</Text>
              <View style={ms.inputWrap}>
                <Icon name="event" size={16} color={BLUE} type="material" />
                <TextInput
                  style={ms.input}
                  placeholder="aaaa-mm-dd (opcional)"
                  placeholderTextColor={SILVER_DARK}
                  value={form.dataRetorno}
                  onChangeText={t => setForm(prev => ({ ...prev, dataRetorno: t }))}
                />
                {form.dataRetorno ? (
                  <TouchableOpacity onPress={() => setForm(prev => ({ ...prev, dataRetorno: '' }))}>
                    <Icon name="clear" size={14} color={SILVER_DARK} type="material" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Observação */}
              <Text style={ms.label}>Observação</Text>
              <View style={[ms.inputWrap, { alignItems: 'flex-start', paddingTop: 10 }]}>
                <Icon name="notes" size={16} color={SILVER_DARK} type="material" style={{ marginTop: 2 }} />
                <TextInput
                  style={[ms.input, { height: 60, textAlignVertical: 'top' }]}
                  placeholder="Detalhes do orçamento..."
                  placeholderTextColor={SILVER_DARK}
                  value={form.observacao}
                  onChangeText={t => setForm(prev => ({ ...prev, observacao: t }))}
                  multiline
                />
              </View>

              {/* Botão salvar */}
              <TouchableOpacity
                style={[ms.salvarBtn, salvando && { opacity: 0.7 }]}
                onPress={salvar}
                disabled={salvando}
                activeOpacity={0.85}>
                <Icon name={salvando ? 'hourglass-empty' : 'check'} size={18} color={DARK_BG} type="material" />
                <Text style={ms.salvarBtnTxt}>
                  {salvando ? 'Salvando...' : orcamento ? 'ATUALIZAR ORÇAMENTO' : 'CRIAR ORÇAMENTO'}
                </Text>
              </TouchableOpacity>

              <View style={{ height: 30 }} />
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ms = StyleSheet.create({
  overlay      : { flex:1, backgroundColor:'rgba(0,0,0,0.75)', justifyContent:'flex-end' },
  sheet        : { backgroundColor:MODAL_BG, borderTopLeftRadius:26, borderTopRightRadius:26, maxHeight:'92%', borderTopWidth:1, borderColor:GOLD+'35' },
  header       : { flexDirection:'row', alignItems:'center', gap:10, padding:16 },
  headerIconWrap:{ width:34, height:34, borderRadius:11, backgroundColor:GOLD, justifyContent:'center', alignItems:'center' },
  headerTitulo : { fontSize:14, fontWeight:'800', color:SILVER_LIGHT },
  headerSub    : { fontSize:10, color:SILVER_DARK, marginTop:1 },
  closeBtn     : { width:32, height:32, borderRadius:16, backgroundColor:CARD_BG2, justifyContent:'center', alignItems:'center' },
  body         : { paddingHorizontal:18 },
  label        : { fontSize:10, fontWeight:'700', color:SILVER_DARK, letterSpacing:0.6, textTransform:'uppercase', marginBottom:7, marginTop:16 },
  inputWrap    : { flexDirection:'row', alignItems:'center', backgroundColor:CARD_BG, borderRadius:12, paddingHorizontal:12, paddingVertical:4, borderWidth:1, borderColor:SILVER+'22', gap:7 },
  inputPrefix  : { fontSize:14, fontWeight:'700', color:GOLD },
  input        : { flex:1, fontSize:14, color:SILVER_LIGHT, paddingVertical:10 },
  prodGrid     : { flexDirection:'row', flexWrap:'wrap', gap:7 },
  prodChip     : { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:CARD_BG, borderRadius:10, paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:SILVER+'22' },
  prodChipTxt  : { fontSize:11, fontWeight:'700', color:SILVER_DARK },
  repRow       : { gap:8, paddingVertical:4, flexDirection:'row' },
  repChip      : { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:CARD_BG, borderRadius:11, paddingHorizontal:12, paddingVertical:7, borderWidth:1, borderColor:SILVER+'22' },
  repChipTxt   : { fontSize:11, fontWeight:'700', color:SILVER_DARK },
  salvarBtn    : { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:GOLD, borderRadius:14, paddingVertical:15, marginTop:20 },
  salvarBtnTxt : { fontSize:14, fontWeight:'bold', color:DARK_BG, letterSpacing:0.4 },
});