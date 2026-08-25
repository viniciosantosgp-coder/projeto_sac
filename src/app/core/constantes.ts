export const SAC_PRODUTOS = ['FGTS', 'Consignado Privado', 'INSS', 'SIAPE', 'Convênios', 'Pacote de Benefícios'];

export const SAC_MOTIVOS = [
  'Cobrança Indevida', 'Desconto Não Autorizado', 'Erro de Contrato', 'Atraso na Averbação',
  'Portabilidade', 'Atendimento', 'Prazo/SLA', 'Informação Incorreta', 'Cancelamento',
  'Boleto de quitação', 'DED', 'Amortização', 'Golpe de parceiro', 'Cobrança de valor',
  'Cancelamento de seguro', 'Cancelamento de proposta', 'Desaverbação', 'Baixa na parcela',
  'Retirar do SERASA', 'Outros'
];

export const SAC_CANAIS = ['Telefone', 'WhatsApp', 'E-mail', 'Chat', 'Presencial', 'Ouvidoria'];

export const SAC_GRAVIDADES = ['Baixa', 'Média', 'Alta', 'Crítica'];

export const SAC_CORES_PRODUTO: Record<string, string> = {
  'FGTS': 'bg-green-500', 'Consignado Privado': 'bg-[#E35205]', 'INSS': 'bg-blue-500',
  'SIAPE': 'bg-purple-500', 'Convênios': 'bg-amber-500', 'Pacote de Benefícios': 'bg-teal-500'
};

export const SAC_CORES_GRAVIDADE: Record<string, { chip: string; badge: string; barra: string }> = {
  'Baixa':   { chip: 'border-green-500 bg-green-500',   badge: 'bg-green-50 text-green-700 border-green-200',    barra: 'bg-green-500' },
  'Média':   { chip: 'border-amber-500 bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200',    barra: 'bg-amber-500' },
  'Alta':    { chip: 'border-orange-600 bg-orange-600', badge: 'bg-orange-50 text-orange-700 border-orange-200', barra: 'bg-orange-600' },
  'Crítica': { chip: 'border-red-600 bg-red-600',       badge: 'bg-red-50 text-red-700 border-red-200',          barra: 'bg-red-600' }
};

/** Prazo de SLA em dias corridos, contado da abertura. */
export const SAC_SLA_DIAS_POR_GRAVIDADE: Record<string, number> = { 'Crítica': 1, 'Alta': 2, 'Média': 5, 'Baixa': 7 };
export const SAC_SLA_DIAS_PADRAO = 5;
export const SAC_ESQUEMA_VERSAO = 2;
export const SAC_SLA_RESUMO = Object.entries(SAC_SLA_DIAS_POR_GRAVIDADE).map(([g, d]) => `${g} ${d}d`).join(' · ');

export const SAC_STATUS_LABEL: Record<string, string> = {
  'Aberto': 'Chamado aberto', 'Pendente': 'Em tratativa', 'Resolvida': 'Resolvida'
};

export const SAC_STATUS_CORES: Record<string, { texto: string; badge: string; barra: string }> = {
  'Aberto':    { texto: 'text-blue-600',  badge: 'bg-blue-50 text-blue-700 border-blue-200',    barra: 'border-l-blue-500' },
  'Pendente':  { texto: 'text-amber-600', badge: 'bg-amber-50 text-amber-700 border-amber-200', barra: 'border-l-amber-500' },
  'Resolvida': { texto: 'text-green-600', badge: 'bg-green-50 text-green-700 border-green-200', barra: 'border-l-green-500' }
};

export const PIZZA_PALETA = ['#E35205', '#2563eb', '#16a34a', '#a855f7', '#0d9488', '#f59e0b', '#dc2626', '#64748b', '#db2777', '#0891b2', '#65a30d', '#7c3aed'];
export const PIZZA_HEX_GRAVIDADE: Record<string, string> = { 'Baixa': '#16a34a', 'Média': '#f59e0b', 'Alta': '#ea580c', 'Crítica': '#dc2626' };
export const PIZZA_HEX_PRODUTO: Record<string, string> = { 'FGTS': '#16a34a', 'Consignado Privado': '#E35205', 'INSS': '#2563eb', 'SIAPE': '#a855f7', 'Convênios': '#f59e0b', 'Pacote de Benefícios': '#0d9488' };
export const PIZZA_HEX_STATUS: Record<string, string> = { 'Resolvida': '#16a34a', 'Em tratativa': '#f59e0b', 'Chamado aberto': '#2563eb' };

/** Usuários com acesso ao Dashboard (visão geral). */
export const USUARIOS_VISAO_GERAL = [
  'Victor Freitas Ledo Silva - Suporte tech', 'arleidedias', 'vinicio.santos', 'MateusDev',
  'cristinamota2', 'adao.cruz', 'joaoguerra2024', 'jaquelinemelobank'
];

export const API_BASE = 'https://presenca-bank-api.azurewebsites.net';
/** Rota que confirma se o token ainda vale. Ajuste aqui se o nome for outro. */
export const API_ROTA_SESSAO = '/me';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCeRzT3OlqbrGy4zQA72ru4Pip6qAqQsjo',
  authDomain: 'presenca26.firebaseapp.com',
  projectId: 'presenca26',
  storageBucket: 'presenca26.firebasestorage.app',
  messagingSenderId: '643332480002',
  appId: '1:643332480002:web:b307ff46cd271ea1ef1b1b'
};
