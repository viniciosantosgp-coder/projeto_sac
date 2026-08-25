/** Evento gravado no histórico de status do chamado. */
export interface EventoStatus {
  de: string;
  para: string;
  em: string;
  por: string;
  origem: string;
}

/** Observação estruturada (além do texto concatenado em `descricao`). */
export interface Observacao {
  em: string;
  por: string;
  texto: string;
  tipo: 'descricao' | 'observacao';
}

/** Documento da coleção `reclamacoes` no Firestore. */
export interface Chamado {
  id: number | string;
  criadoEm: string;
  produto: string;
  canal: string;
  categoria: string;
  gravidade: string;
  descricao: string;
  cpf: string;
  idProposta: string;
  atendente: string;
  status: string;
  resolvidoEm: string;

  // SLA gravado
  slaDias?: number;
  slaGravidade?: string;
  slaVenceEm?: string;
  duracaoDias?: number | null;
  slaCumprido?: boolean | null;
  slaStatus?: string;

  // Rastreabilidade
  criadoPor?: string;
  statusAtualizadoEm?: string;
  atualizadoEm?: string;
  atualizadoPor?: string;
  ultimaAtuacaoPor?: string;
  ultimaAtuacaoEm?: string;
  tratativaIniciadaEm?: string;
  tratativaPor?: string;
  resolvidoPor?: string;
  reabertoEm?: string;
  reabertoPor?: string;
  versaoEsquema?: number;
  historicoStatus?: EventoStatus[];
  observacoes?: Observacao[];
}

export interface Usuario {
  nome?: string;
  login?: string;
  [k: string]: unknown;
}

export type StatusChamado = 'Aberto' | 'Pendente' | 'Resolvida';
