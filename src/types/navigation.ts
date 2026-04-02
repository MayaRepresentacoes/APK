// src/types/navigation.ts
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp, RouteProp } from '@react-navigation/native';

// Tipos para as rotas principais (Stack)
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Splash: undefined;
};

// Tipos para as rotas de Autenticação
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

// Tipos para as rotas principais (Tab Navigator)
export type MainTabParamList = {
  Home: undefined;
  Map: undefined;
  Routes: undefined;
  Profile: undefined;
  Settings: undefined;
};

// Tipos para rotas dentro de cada tab
export type HomeStackParamList = {
  HomeScreen: undefined;
  Details: { id: string; title: string };
};

export type MapStackParamList = {
  MapScreen: undefined;
  RouteDetails: { routeId: string };
  PlaceDetails: { placeId: string; latitude: number; longitude: number };
};

export type RoutesStackParamList = {
  RoutesList: undefined;
  RouteOptimization: { points: Array<{ id: string; lat: number; lng: number }> };
  RouteHistory: undefined;
};

export type ProfileStackParamList = {
  ProfileScreen: undefined;
  EditProfile: undefined;
  ChangePassword: undefined;
};

export type SettingsStackParamList = {
  SettingsScreen: undefined;
  Notifications: undefined;
  Privacy: undefined;
  About: undefined;
};

// Tipos compostos para navegação
export type HomeScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, 'HomeScreen'>,
  BottomTabNavigationProp<MainTabParamList, 'Home'>
>;

export type MapScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<MapStackParamList, 'MapScreen'>,
  BottomTabNavigationProp<MainTabParamList, 'Map'>
>;

export type RoutesScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<RoutesStackParamList, 'RoutesList'>,
  BottomTabNavigationProp<MainTabParamList, 'Routes'>
>;

export type ProfileScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<ProfileStackParamList, 'ProfileScreen'>,
  BottomTabNavigationProp<MainTabParamList, 'Profile'>
>;

export type SettingsScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<SettingsStackParamList, 'SettingsScreen'>,
  BottomTabNavigationProp<MainTabParamList, 'Settings'>
>;

// Tipos para as props de tela com rota
export type HomeScreenRouteProp = RouteProp<HomeStackParamList, 'HomeScreen'>;
export type DetailsScreenRouteProp = RouteProp<HomeStackParamList, 'Details'>;
export type MapScreenRouteProp = RouteProp<MapStackParamList, 'MapScreen'>;
export type RouteDetailsRouteProp = RouteProp<MapStackParamList, 'RouteDetails'>;
export type PlaceDetailsRouteProp = RouteProp<MapStackParamList, 'PlaceDetails'>;
export type RoutesListRouteProp = RouteProp<RoutesStackParamList, 'RoutesList'>;
export type RouteOptimizationRouteProp = RouteProp<RoutesStackParamList, 'RouteOptimization'>;
export type ProfileScreenRouteProp = RouteProp<ProfileStackParamList, 'ProfileScreen'>;
export type SettingsScreenRouteProp = RouteProp<SettingsStackParamList, 'SettingsScreen'>;

// Props completas para cada tela
export interface HomeScreenProps {
  navigation: HomeScreenNavigationProp;
  route: HomeScreenRouteProp;
}

export interface DetailsScreenProps {
  navigation: HomeScreenNavigationProp;
  route: DetailsScreenRouteProp;
}

export interface MapScreenProps {
  navigation: MapScreenNavigationProp;
  route: MapScreenRouteProp;
}

export interface RoutesScreenProps {
  navigation: RoutesScreenNavigationProp;
  route: RoutesListRouteProp;
}

export interface ProfileScreenProps {
  navigation: ProfileScreenNavigationProp;
  route: ProfileScreenRouteProp;
}

export interface SettingsScreenProps {
  navigation: SettingsScreenNavigationProp;
  route: SettingsScreenRouteProp;
}

// Tipos para dados
export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface RoutePoint extends Coordinate {
  id: string;
  name: string;
  address?: string;
}

export interface OptimizedRoute {
  points: RoutePoint[];
  totalDistance: number;
  totalDuration: number;
  waypoints: Coordinate[];
}