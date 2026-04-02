declare module 'react-native-maps' {
  import * as React from 'react';
  import { ViewProps } from 'react-native';

  // 📍 Tipos básicos
  export interface Region {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }

  export interface LatLng {
    latitude: number;
    longitude: number;
  }

  export interface Point {
    x: number;
    y: number;
  }

  // 📌 Marker
  export interface MarkerProps {
    coordinate: LatLng;
    title?: string;
    description?: string;
    pinColor?: string;
    onPress?: () => void;
    draggable?: boolean;
    flat?: boolean;
    identifier?: string;
    rotation?: number;
    anchor?: Point;
    tracksViewChanges?: boolean;
    opacity?: number;
    image?: any;
    zIndex?: number;
  }

  // 🗺️ MapView Props
  export interface MapViewProps extends ViewProps {
    provider?: 'google' | 'apple';
    region?: Region;
    initialRegion?: Region;
    mapType?: 'standard' | 'satellite' | 'hybrid' | 'terrain';
    showsUserLocation?: boolean;
    showsMyLocationButton?: boolean;
    showsCompass?: boolean;
    showsScale?: boolean;
    showsBuildings?: boolean;
    showsTraffic?: boolean;
    zoomEnabled?: boolean;
    rotateEnabled?: boolean;
    scrollEnabled?: boolean;
    pitchEnabled?: boolean;
    toolbarEnabled?: boolean;

    onMapReady?: () => void;

    onPress?: (event: {
      nativeEvent: { coordinate: LatLng };
    }) => void;

    onLongPress?: (event: {
      nativeEvent: { coordinate: LatLng };
    }) => void;

    onMarkerPress?: (event: {
      nativeEvent: { id: string; coordinate: LatLng };
    }) => void;

    onRegionChange?: (region: Region) => void;
    onRegionChangeComplete?: (region: Region) => void;
  }

  // 🧠 Classe MapView
  export default class MapView extends React.Component<MapViewProps> {
    getCamera(): Promise<any>;
    animateCamera(camera: any, opts?: { duration?: number }): void;
    animateToRegion(region: Region, duration?: number): void;
    animateToCoordinate(coordinate: LatLng, duration?: number): void;
  }

  // 📍 Classe Marker
  export class Marker extends React.Component<MarkerProps> {
    showCallout(): void;
    hideCallout(): void;
  }
}