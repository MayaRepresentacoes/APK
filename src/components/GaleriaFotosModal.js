// src/components/GaleriaFotosModal.js
// ════════════════════════════════════════════════════════════════
// FUSÃO v2 — sobre doc 14:
//
//   [NOVO] Flatten de fotos por tipo (arrays)
//     Visitas novas: fotos = { estoque:[], gondola:[], concorrentes:[] }
//     Visitas legadas: fotos = { estoque:'uri', gondola:'uri', obra:'uri' }
//     Legado alternativo: fotoUrl direto na raiz da visita
//     Todos os formatos produzem itens com { fotoUrl, tipoFoto } para a grade.
//
//   [NOVO] Filtros por tipo de foto
//     Todas / Estoque / Gôndola / Concorrentes / Vendas
//     (substitui filtros por resultado — mais útil para o rep)
//
//   [NOVO] Badge tipoFoto no thumbnail
//     Cor e ícone por tipo na grade (estoque=azul, gôndola=ouro, concorrentes=vermelho).
//
//   [NOVO] KPIs por tipo
//     Estoque | Gôndola | Concorrentes | Última foto (no lugar de total/vendas/última)
//
//   [NOVO] FotoFullScreen mostra badge de tipo
//
//   Mantidos integralmente do doc 14:
//     FotoFullScreen (estrutura, info bar, vendaBadge, observacao),
//     FotoThumb (estrutura, overlay data, badge comprou),
//     modal layout, header, styles.
// ════════════════════════════════════════════════════════════════
import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  FlatList, Image, Dimensions, ScrollView, StatusBar,
} from 'react-native';
import { Icon } from 'react-native-elements';

const { width: SW, height: SH } = Dimensions.get('window');

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

const IMG_SIZE = (SW - 48 - 8) / 3;

// [NOVO] Metadados de tipo de foto
const TIPO_FOTO_META = {
  estoque     : { label:'Estoque',      icone:'inventory',    cor:BLUE        },
  gondola     : { label:'Gôndola',      icone:'storefront',   cor:GOLD        },
  concorrentes: { label:'Concorr.',     icone:'business',     cor:DANGER      },
  obra        : { label:'Obra',         icone:'construction', cor:SUCCESS     },
  geral       : { label:'Geral',        icone:'photo-camera', cor:SILVER_DARK },
};

function formatData(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', year: '2-digit',
    });
  } catch { return '—'; }
}

function formatHora(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

// ════════════════════════════════════════════════════════════════
// FotoFullScreen — [NOVO] badge de tipo adicionado
// ════════════════════════════════════════════════════════════════
function FotoFullScreen({ foto, onFechar }) {
  if (!foto) return null;
  const tipoMeta = TIPO_FOTO_META[foto.tipoFoto] || TIPO_FOTO_META.geral;
  return (
    <Modal visible={!!foto} transparent animationType="fade" onRequestClose={onFechar}>
      <View style={fs.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />

        <TouchableOpacity style={fs.fecharBtn} onPress={onFechar} activeOpacity={0.8}>
          <Icon name="close" size={22} color="#fff" type="material" />
        </TouchableOpacity>

        <Image
          source={{ uri: foto?.fotoUrl }}
          style={fs.imagem}
          resizeMode="contain"
        />

        <View style={fs.infoBar}>
          <View style={fs.infoTop}>
            <View style={fs.infoLeft}>
              <Text style={fs.infoData}>{formatData(foto?.dataLocal)}</Text>
              <Text style={fs.infoHora}>{formatHora(foto?.dataLocal)}</Text>
            </View>
            {/* [NOVO] Badge tipo */}
            <View style={[fs.tipoBadge, { backgroundColor:tipoMeta.cor+'30', borderColor:tipoMeta.cor+'60' }]}>
              <Icon name={tipoMeta.icone} size={11} color={tipoMeta.cor} type="material" />
              <Text style={[fs.tipoBadgeTxt, { color:tipoMeta.cor }]}>{tipoMeta.label}</Text>
            </View>
          </View>
          {foto?.resultado === 'comprou' && (
            <View style={fs.vendaBadge}>
              <Icon name="check-circle" size={12} color={SUCCESS} type="material" />
              <Text style={fs.vendaTxt}>
                {foto.valor > 0
                  ? `R$ ${foto.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : 'Comprou'}
              </Text>
            </View>
          )}
          {foto?.observacao ? (
            <Text style={fs.obs} numberOfLines={2}>{foto.observacao}</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
const fs = StyleSheet.create({
  container  : { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  fecharBtn  : { position:'absolute', top:48, right:18, zIndex:10, width:40, height:40, borderRadius:20, backgroundColor:'rgba(255,255,255,0.15)', justifyContent:'center', alignItems:'center' },
  imagem     : { width: SW, height: SH * 0.72 },
  infoBar    : { position:'absolute', bottom:0, left:0, right:0, backgroundColor:'rgba(0,0,0,0.78)', padding:18, gap:8 },
  infoTop    : { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  infoLeft   : { flexDirection:'row', alignItems:'center', gap:10 },
  infoData   : { fontSize: 14, fontWeight: '800', color: '#fff' },
  infoHora   : { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  tipoBadge  : { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:8, paddingVertical:4, borderRadius:8, borderWidth:1 },
  tipoBadgeTxt:{ fontSize:11, fontWeight:'700' },
  vendaBadge : { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:SUCCESS+'25', borderRadius:8, paddingHorizontal:9, paddingVertical:4, alignSelf:'flex-start' },
  vendaTxt   : { fontSize: 12, fontWeight: '800', color: SUCCESS },
  obs        : { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic' },
});

// ════════════════════════════════════════════════════════════════
// FotoThumb — [NOVO] badge tipoFoto colorido
// ════════════════════════════════════════════════════════════════
function FotoThumb({ item, onPress }) {
  const comprou  = item.resultado === 'comprou';
  const tipoMeta = TIPO_FOTO_META[item.tipoFoto] || TIPO_FOTO_META.geral;
  return (
    <TouchableOpacity style={th.wrap} onPress={onPress} activeOpacity={0.85}>
      <Image source={{ uri: item.fotoUrl }} style={th.img} resizeMode="cover" />
      <View style={th.overlay}>
        <Text style={th.data}>{formatData(item.dataLocal)}</Text>
      </View>
      {/* [NOVO] Badge de tipo no canto superior esquerdo */}
      <View style={[th.tipoBadge, { backgroundColor: tipoMeta.cor + 'CC' }]}>
        <Icon name={tipoMeta.icone} size={8} color="#fff" type="material" />
      </View>
      {comprou && (
        <View style={th.badge}>
          <Icon name="check-circle" size={10} color={SUCCESS} type="material" />
        </View>
      )}
    </TouchableOpacity>
  );
}
const th = StyleSheet.create({
  wrap      : { width: IMG_SIZE, height: IMG_SIZE, borderRadius: 10, overflow: 'hidden', backgroundColor: CARD_BG2 },
  img       : { width: '100%', height: '100%' },
  overlay   : { position:'absolute', bottom:0, left:0, right:0, backgroundColor:'rgba(0,0,0,0.55)', paddingHorizontal:4, paddingVertical:3 },
  data      : { fontSize: 8, color: '#fff', fontWeight: '700' },
  tipoBadge : { position:'absolute', top:4, left:4, width:18, height:18, borderRadius:6, justifyContent:'center', alignItems:'center' },
  badge     : { position:'absolute', top:4, right:4, width:18, height:18, borderRadius:9, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' },
});

// ════════════════════════════════════════════════════════════════
// MODAL PRINCIPAL
// ════════════════════════════════════════════════════════════════
export default function GaleriaFotosModal({ visible, cliente, historico, onClose }) {
  const [fotoAberta,  setFotoAberta]  = useState(null);
  const [filtroAtivo, setFiltroAtivo] = useState('todas');

  // ════════════════════════════════════════════════════════════════
  // [NOVO] Extração flatten: visitas → lista plana de fotos com tipoFoto
  // Suporta 3 formatos:
  //   1. fotos[tipo] = string[]  (novo — CheckinScreen v2)
  //   2. fotos[tipo] = string    (legado — CheckinScreen v1)
  //   3. fotoUrl na raiz         (legado antigo)
  // ════════════════════════════════════════════════════════════════
  const fotos = useMemo(() => {
    const result = [];
    (historico || []).forEach(v => {
      if (v.fotos && typeof v.fotos === 'object') {
        Object.entries(v.fotos).forEach(([tipoKey, val]) => {
          if (Array.isArray(val)) {
            // Novo formato: array de URIs
            val.forEach((uri, idx) => {
              if (uri) result.push({
                ...v,
                fotoUrl : uri,
                tipoFoto: tipoKey,
                _fotoId : `${v.id || ''}_${tipoKey}_${idx}`,
              });
            });
          } else if (typeof val === 'string' && val) {
            // Legado: URI única por tipo
            result.push({
              ...v,
              fotoUrl : val,
              tipoFoto: tipoKey,
              _fotoId : `${v.id || ''}_${tipoKey}`,
            });
          }
        });
      } else if (v.fotoUrl) {
        // Legado: fotoUrl direto na visita
        result.push({ ...v, tipoFoto: 'geral' });
      }
    });
    return result.sort((a, b) =>
      new Date(b.dataLocal || 0) - new Date(a.dataLocal || 0)
    );
  }, [historico]);

  // [NOVO] Contagem por tipo
  const qtdPorTipo = useMemo(() => {
    const m = {};
    fotos.forEach(f => { m[f.tipoFoto] = (m[f.tipoFoto] || 0) + 1; });
    return m;
  }, [fotos]);

  // [NOVO] Filtros por tipo (substituem filtros por resultado)
  const filtros = [
    { key:'todas',        label:'Todas',        cor:GOLD    },
    { key:'estoque',      label:'Estoque',       cor:BLUE    },
    { key:'gondola',      label:'Gôndola',       cor:GOLD    },
    { key:'concorrentes', label:'Concorrentes',  cor:DANGER  },
    { key:'comprou',      label:'Vendas',        cor:SUCCESS },
  ];

  const fotosFiltradas = useMemo(() => {
    if (filtroAtivo === 'todas')   return fotos;
    if (filtroAtivo === 'comprou') return fotos.filter(v => v.resultado === 'comprou');
    return fotos.filter(v => v.tipoFoto === filtroAtivo);
  }, [fotos, filtroAtivo]);

  const totalFotos  = fotos.length;
  const totalVendas = fotos.filter(v => v.resultado === 'comprou').length;
  const ultimaFoto  = fotos[0] || null;

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        transparent={false}
        onRequestClose={onClose}
        statusBarTranslucent>

        <View style={g.container}>
          <StatusBar barStyle="light-content" backgroundColor={DARK_BG} translucent />

          {/* ══ HEADER ══ */}
          <View style={g.header}>
            <View style={g.headerAccent} />
            <View style={g.headerRow}>
              <TouchableOpacity style={g.voltarBtn} onPress={onClose} activeOpacity={0.8}>
                <Icon name="arrow-back" size={20} color={SILVER_LIGHT} type="material" />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={g.titulo} numberOfLines={1}>
                  📷 Galeria — {cliente?.nome || 'Cliente'}
                </Text>
                <Text style={g.sub}>
                  {totalFotos} foto{totalFotos !== 1 ? 's' : ''}
                  {totalVendas > 0 ? `  ·  ${totalVendas} com venda` : ''}
                </Text>
              </View>
            </View>

            {/* [NOVO] KPIs por tipo */}
            {totalFotos > 0 && (
              <View style={g.kpisRow}>
                <View style={g.kpiItem}>
                  <Icon name="photo-library" size={13} color={GOLD} type="material" />
                  <Text style={[g.kpiVal, { color: GOLD }]}>{totalFotos}</Text>
                  <Text style={g.kpiLabel}>Total</Text>
                </View>
                <View style={g.kpiDiv} />
                <View style={g.kpiItem}>
                  <Icon name="inventory" size={13} color={BLUE} type="material" />
                  <Text style={[g.kpiVal, { color: BLUE }]}>{qtdPorTipo.estoque || 0}</Text>
                  <Text style={g.kpiLabel}>Estoque</Text>
                </View>
                <View style={g.kpiDiv} />
                <View style={g.kpiItem}>
                  <Icon name="storefront" size={13} color={GOLD} type="material" />
                  <Text style={[g.kpiVal, { color: GOLD }]}>{qtdPorTipo.gondola || 0}</Text>
                  <Text style={g.kpiLabel}>Gôndola</Text>
                </View>
                <View style={g.kpiDiv} />
                <View style={g.kpiItem}>
                  <Icon name="business" size={13} color={DANGER} type="material" />
                  <Text style={[g.kpiVal, { color: DANGER }]}>{qtdPorTipo.concorrentes || 0}</Text>
                  <Text style={g.kpiLabel}>Concorr.</Text>
                </View>
                <View style={g.kpiDiv} />
                <View style={g.kpiItem}>
                  <Icon name="event" size={13} color={BLUE} type="material" />
                  <Text style={[g.kpiVal, { color: BLUE }]}>
                    {ultimaFoto ? formatData(ultimaFoto.dataLocal) : '—'}
                  </Text>
                  <Text style={g.kpiLabel}>Última</Text>
                </View>
              </View>
            )}

            {/* [NOVO] Filtros por tipo */}
            {totalFotos > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={g.filtrosScroll}
                contentContainerStyle={g.filtrosContent}>
                {filtros.map(f => {
                  const ativo = filtroAtivo === f.key;
                  const qtd   = f.key === 'todas'
                    ? fotos.length
                    : f.key === 'comprou'
                      ? fotos.filter(v => v.resultado === 'comprou').length
                      : (qtdPorTipo[f.key] || 0);
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={[g.filtroBtn, ativo && { backgroundColor: f.cor, borderColor: f.cor }]}
                      onPress={() => setFiltroAtivo(f.key)}
                      activeOpacity={0.8}>
                      <Text style={[g.filtroTxt, { color: ativo ? DARK_BG : f.cor }]}>
                        {f.label}
                      </Text>
                      {qtd > 0 && (
                        <View style={[g.filtroBadge, { backgroundColor: ativo ? DARK_BG + '30' : f.cor + '30' }]}>
                          <Text style={[g.filtroBadgeTxt, { color: ativo ? DARK_BG : f.cor }]}>{qtd}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* ══ GRADE DE FOTOS ══ */}
          {fotosFiltradas.length === 0 ? (
            <View style={g.emptyWrap}>
              <Text style={{ fontSize: 56 }}>📷</Text>
              <Text style={g.emptyTitulo}>
                {totalFotos === 0
                  ? 'Nenhuma foto registrada'
                  : 'Nenhuma foto neste filtro'}
              </Text>
              <Text style={g.emptyTxt}>
                {totalFotos === 0
                  ? 'As fotos aparecem aqui quando registradas durante check-ins.'
                  : 'Tente outro filtro para ver as fotos disponíveis.'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={fotosFiltradas}
              keyExtractor={(item, i) => item._fotoId || item.id || String(i)}
              numColumns={3}
              contentContainerStyle={g.grade}
              columnWrapperStyle={g.coluna}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <FotoThumb
                  item={item}
                  onPress={() => setFotoAberta(item)}
                />
              )}
            />
          )}

        </View>
      </Modal>

      <FotoFullScreen
        foto={fotoAberta}
        onFechar={() => setFotoAberta(null)}
      />
    </>
  );
}

// ════════════════════════════════════════════════════════════════
// STYLES (base do doc 14 mantida; kpisRow atualizado)
// ════════════════════════════════════════════════════════════════
const g = StyleSheet.create({
  container     : { flex: 1, backgroundColor: DARK_BG },
  header        : { backgroundColor: '#001828', borderBottomLeftRadius: 22, borderBottomRightRadius: 22, paddingBottom: 12, elevation: 10, shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10 },
  headerAccent  : { height: 3, backgroundColor: GOLD },
  headerRow     : { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 48, paddingBottom: 8 },
  voltarBtn     : { width: 38, height: 38, borderRadius: 12, backgroundColor: CARD_BG2, justifyContent: 'center', alignItems: 'center' },
  titulo        : { fontSize: 16, fontWeight: '900', color: SILVER_LIGHT },
  sub           : { fontSize: 10, color: SILVER_DARK, marginTop: 1 },
  // [NOVO] kpisRow com 5 colunas
  kpisRow       : { flexDirection: 'row', marginHorizontal: 14, backgroundColor: CARD_BG, borderRadius: 14, padding: 10, marginBottom: 10 },
  kpiItem       : { flex: 1, alignItems: 'center', gap: 2 },
  kpiDiv        : { width: 1, backgroundColor: SILVER + '18', marginVertical: 4 },
  kpiVal        : { fontSize: 12, fontWeight: '900' },
  kpiLabel      : { fontSize: 8, color: SILVER_DARK, textAlign: 'center' },
  filtrosScroll  : { paddingLeft: 14 },
  filtrosContent : { gap: 7, paddingRight: 14 },
  filtroBtn      : { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: CARD_BG2, borderWidth: 1, borderColor: SILVER + '18' },
  filtroTxt      : { fontSize: 11, fontWeight: '800' },
  filtroBadge    : { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 },
  filtroBadgeTxt : { fontSize: 9, fontWeight: '900' },
  grade          : { padding: 16 },
  coluna         : { gap: 4, marginBottom: 4 },
  emptyWrap      : { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 32 },
  emptyTitulo    : { fontSize: 18, fontWeight: '900', color: SILVER },
  emptyTxt       : { fontSize: 13, color: SILVER_DARK, textAlign: 'center', lineHeight: 20 },
});