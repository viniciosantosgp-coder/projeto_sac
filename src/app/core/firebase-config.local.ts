/**
 * MODO LOCAL DE VALIDAÇÃO (VALIDAR-LOCAL.bat): banco de teste `sac-ouvidoria-teste`, com dados fictícios.
 * Só entra no build com `--configuration local`; o site publicado usa firebase-config.ts (sac-presenca).
 */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDd4LY_EKLZE6t6ib26OFlNoDZyM4KB3co',
  authDomain: 'sac-ouvidoria-teste.firebaseapp.com',
  projectId: 'sac-ouvidoria-teste',
  storageBucket: 'sac-ouvidoria-teste.firebasestorage.app',
  messagingSenderId: '617950229257',
  appId: '1:617950229257:web:e454fa1ea93f39f7ab99d8'
};

/** true só neste arquivo: a tela mostra a faixa "modo local". */
export const MODO_LOCAL = true;
