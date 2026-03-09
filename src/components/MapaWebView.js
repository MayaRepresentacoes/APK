import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import colors from '../styles/colors';

// Versão web do mapa (placeholder)
export default function MapaWebView({ region, markers = [], onMarkerPress }) {
  return (
    <View style={styles.container}>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderTitle}>Mapa</Text>
        <Text style={styles.placeholderText}>
          Região: {region.latitude.toFixed(4)}, {region.longitude.toFixed(4)}
        </Text>
        <Text style={styles.placeholderText}>
          {markers.length} cliente(s) no mapa
        </Text>
        <View style={styles.markersList}>
          {markers.map((marker, index) => (
            <View key={index} style={styles.markerItem}>
              <View style={[styles.markerDot, { backgroundColor: marker.color || colors.primary }]} />
              <Text style={styles.markerText}>{marker.title}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.lightGray,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 10,
  },
  placeholderText: {
    fontSize: 16,
    color: colors.gray,
    marginBottom: 5,
    textAlign: 'center',
  },
  markersList: {
    marginTop: 20,
    width: '100%',
  },
  markerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: colors.white,
    borderRadius: 8,
    marginBottom: 5,
  },
  markerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  markerText: {
    fontSize: 14,
    color: colors.text,
  },
});