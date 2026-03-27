import { Platform } from 'react-native';

const getHost = () => {
  if (Platform.OS === 'web') return 'localhost';
  if (Platform.OS === 'android') return '10.0.2.2';
  return 'localhost'; // iOS simulator
};

const host = getHost();

export const API_BASE = `http://${host}:8080`;
export const WS_BASE = `ws://${host}:8080`;
