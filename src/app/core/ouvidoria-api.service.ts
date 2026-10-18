import { Injectable } from '@angular/core';

/*
 * Cliente da API da Ouvidoria (repositório ouvidoria-api, .NET 8, hospedada no Render).
 *
 * Duas formas de chegar na API:
 *  - rodando local (RODAR-LOCAL.bat): chama "/ouv-api/..." e o proxy do ng serve (proxy.conf.mjs)
 *    repassa para o Render colocando a chave X-Api-Key;
 *  - site publicado (sac-presenca.web.app): chama o Render direto. A API aceita esse site
 *    sem chave (lista ALLOWED_ORIGINS na API). Nenhuma chave aparece neste código.
 *
 * No plano gratuito do Render a API "dorme" e leva ~1 min para acordar; por isso o cabeçalho
 * chama `acordar()` logo após o login, para ela já estar de pé quando a Ouvidoria for aberta.
 *
 * Rotas usadas:
 *   GET   /api/chamados?status=&busca=&pagina=&tamanho=   lista + contagem por status
 *   POST  /api/chamados                                    abre e devolve o protocolo
 *   GET   /api/chamados/{protocolo}                        dados + histórico
 *   PATCH /api/chamados/{protocolo}/status                 muda o status e grava no histórico
 */

const URL_API = 'https://ouvidoria-api-d9l4.onrender.com';
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const BASE = LOCAL ? '/ouv-api' : URL_API;

export type StatusOuv = 'Recebido' | 'EmAnalise' | 'EmAndamento' | 'Respondido' | 'Encerrado' | 'Cancelado';
export type TipoOuv = 'Reclamacao' | 'Denuncia' | 'Sugestao' | 'Elogio' | 'Solicitacao';

export const STATUS_OUV: Array<{ valor: StatusOuv; rotulo: string; cor: string; badge: string }> = [
  { valor: 'Recebido',    rotulo: 'Recebido',     cor: '#2563eb', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  { valor: 'EmAnalise',   rotulo: 'Em análise',   cor: '#7c3aed', badge: 'bg-violet-50 text-violet-700 border-violet-200' },
  { valor: 'EmAndamento', rotulo: 'Em andamento', cor: '#d97706', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  { valor: 'Respondido',  rotulo: 'Respondido',   cor: '#16a34a', badge: 'bg-green-50 text-green-700 border-green-200' },
  { valor: 'Encerrado',   rotulo: 'Encerrado',    cor: '#57534e', badge: 'bg-stone-100 text-stone-600 border-stone-200' },
  { valor: 'Cancelado',   rotulo: 'Cancelado',    cor: '#dc2626', badge: 'bg-red-50 text-red-700 border-red-200' }
];

/** Mesma ordem e mesmos códigos da API (1 = Sugestão, 2 = Reclamação...). A tela envia o nome. */
export const TIPOS_OUV: Array<{ valor: TipoOuv; codigo: number; rotulo: string }> = [
  { valor: 'Sugestao', codigo: 1, rotulo: 'Sugestão' },
  { valor: 'Reclamacao', codigo: 2, rotulo: 'Reclamação' },
  { valor: 'Denuncia', codigo: 3, rotulo: 'Denúncia' },
  { valor: 'Elogio', codigo: 4, rotulo: 'Elogio' },
  { valor: 'Solicitacao', codigo: 5, rotulo: 'Solicitação' }
];

/** `por`: quem fez a mudança (credencial, administrador ou site). Vazio nos registros antigos. */
export interface HistoricoOuv { status: StatusOuv; statusDescricao: string; observacao: string | null; data: string; por?: string | null; }

export interface ResumoOuv {
  protocolo: string;
  status: StatusOuv;
  statusDescricao: string;
  tipo: TipoOuv | null;
  assunto: string;
  solicitanteNome: string | null;
  solicitanteEmail: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ChamadoOuv extends ResumoOuv {
  descricao: string | null;
  historico: HistoricoOuv[];
}

export interface ListaOuv {
  total: number;
  pagina: number;
  tamanho: number;
  itens: ResumoOuv[];
  /** Contagem de todos os chamados por status (para os cards). */
  porStatus: Partial<Record<StatusOuv, number>>;
}

export interface FiltroOuv { status?: StatusOuv | null; busca?: string; pagina?: number; tamanho?: number; }

export interface NovoChamadoOuv {
  assunto: string;
  descricao?: string | null;
  tipo?: TipoOuv | null;
  solicitanteNome?: string | null;
  solicitanteEmail?: string | null;
}

export interface CriadoOuv { protocolo: string; status: StatusOuv; statusDescricao: string; criadoEm: string; }

/** Erro já traduzido para mostrar na tela. `campos` vem das validações da API (400). */
export class ErroOuv extends Error {
  constructor(message: string, readonly status: number, readonly campos: Record<string, string[]> = {}) { super(message); }
}

@Injectable({ providedIn: 'root' })
export class OuvidoriaApiService {
  private acordando = false;

  /** Dispara a rota pública /health em segundo plano (uma vez por carga do app), sem mostrar nada na tela. */
  acordar(): void {
    if (this.acordando) return;
    this.acordando = true;
    fetch(`${BASE}/health`).catch(() => { this.acordando = false; });
  }

  listar(f: FiltroOuv = {}): Promise<ListaOuv> {
    const q = new URLSearchParams();
    if (f.status) q.set('status', f.status);
    if (f.busca?.trim()) q.set('busca', f.busca.trim());
    q.set('pagina', String(f.pagina ?? 1));
    q.set('tamanho', String(f.tamanho ?? 20));
    return this.chamar<ListaOuv>('GET', `/api/chamados?${q}`);
  }

  abrir(dados: NovoChamadoOuv): Promise<CriadoOuv> {
    return this.chamar<CriadoOuv>('POST', '/api/chamados', dados);
  }

  consultar(protocolo: string): Promise<ChamadoOuv> {
    return this.chamar<ChamadoOuv>('GET', `/api/chamados/${encodeURIComponent(protocolo.trim())}`);
  }

  alterarStatus(protocolo: string, status: StatusOuv, observacao?: string | null) {
    return this.chamar('PATCH', `/api/chamados/${encodeURIComponent(protocolo)}/status`, { status, observacao: observacao || null });
  }

  private async chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(BASE + caminho, {
        method: metodo,
        headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined
      });
    } catch {
      throw new ErroOuv(LOCAL
        ? 'Não foi possível falar com a API. Verifique se o sistema foi aberto pelo RODAR-LOCAL.bat.'
        : 'Não foi possível carregar a ouvidoria agora. Aguarde um instante e clique em "Atualizar lista".', 0);
    }
    // resposta em HTML = a chamada não chegou na API
    if (!(res.headers.get('content-type') || '').includes('json') && res.status !== 204) {
      throw new ErroOuv('Não foi possível carregar a ouvidoria agora. Aguarde um instante e clique em "Atualizar lista".', res.status);
    }
    let dados: any = null;
    try { dados = await res.json(); } catch { dados = null; }
    if (res.ok) return dados as T;

    // respostas de erro da API seguem o padrão "problem details" (title/detail/errors)
    const detalhe: string = dados?.detail || dados?.title || '';
    switch (res.status) {
      case 400: throw new ErroOuv('Dados inválidos: confira os campos destacados.', 400, dados?.errors || {});
      case 401: throw new ErroOuv(LOCAL
        ? 'Chave da API ausente ou inválida. Confira o arquivo "ouvidoria-api.chave" e reinicie o RODAR-LOCAL.bat.'
        : 'Este site não está liberado na API (variável ALLOWED_ORIGINS no Render).', 401);
      case 404: throw new ErroOuv(detalhe || 'Protocolo não encontrado.', 404);
      case 429: throw new ErroOuv('Muitas requisições em pouco tempo. Aguarde um minuto e tente de novo.', 429);
      case 503: throw new ErroOuv('A API está sem chave configurada no servidor (Render).', 503);
      case 502: case 504: throw new ErroOuv('Não foi possível carregar a ouvidoria agora. Aguarde um instante e clique em "Atualizar lista".', res.status);
      default: throw new ErroOuv(`Erro ${res.status} da API${detalhe ? ': ' + detalhe : ''}.`, res.status);
    }
  }
}
