// Proxy do servidor de desenvolvimento (ng serve) para a API da Ouvidoria.
//
// Por que existe:
//  1. A API não libera CORS, então o navegador não pode chamá-la direto.
//     Aqui o navegador chama /ouv-api/... no próprio localhost e o servidor repassa.
//  2. A chave X-Api-Key é colocada AQUI, no servidor local; ela não vai para o código
//     do navegador nem para o Git.
//
// A chave é lida, nesta ordem, de:
//   - variável de ambiente OUVIDORIA_API_KEY
//   - arquivo "ouvidoria-api.chave" na raiz do projeto (fora do Git, ver .gitignore)
import { readFileSync } from 'node:fs';

const ALVO = process.env.OUVIDORIA_API_URL || 'https://ouvidoria-api-d9l4.onrender.com';

function lerChave() {
  if (process.env.OUVIDORIA_API_KEY) return process.env.OUVIDORIA_API_KEY.trim();
  try { return readFileSync(new URL('./ouvidoria-api.chave', import.meta.url), 'utf8').trim(); } catch { return ''; }
}

const chave = lerChave();
console.log(chave
  ? `[ouvidoria] proxy /ouv-api -> ${ALVO} (chave carregada)`
  : `[ouvidoria] ATENCAO: chave da API nao encontrada. Crie o arquivo "ouvidoria-api.chave" com a chave. As chamadas vao voltar 401.`);

export default {
  '/ouv-api': {
    target: ALVO,
    changeOrigin: true,
    secure: true,
    rewrite: (caminho) => caminho.replace(/^\/ouv-api/, ''),
    headers: chave ? { 'X-Api-Key': chave } : {},
    // plano gratuito do Render: a API "dorme" e pode levar ~1 min para acordar
    timeout: 90000,
    proxyTimeout: 90000
  }
};
