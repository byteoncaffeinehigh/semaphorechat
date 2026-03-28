import { Platform } from 'react-native';

const DEV = __DEV__;

const PROD_API = 'https://vesta-unexcelling-phebe.ngrok-free.dev';
const PROD_WS  = 'wss://vesta-unexcelling-phebe.ngrok-free.dev';

const getDevBase = () => {
  if (Platform.OS === 'android') return 'http://10.0.2.2:8080';
  return 'http://localhost:8080';
};

export const API_BASE = DEV ? getDevBase() : PROD_API;
export const WS_BASE  = DEV ? getDevBase().replace('http', 'ws') : PROD_WS;
