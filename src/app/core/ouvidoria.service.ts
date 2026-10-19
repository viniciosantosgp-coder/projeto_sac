import { Injectable, inject, signal } from '@angular/core';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  Firestore, Timestamp, Unsubscribe, collection, doc, getDoc, getDocs, getFirestore, onSnapshot,
  orderBy, query, runTransaction
} from 'firebase/firestore';
import { FIREBASE_CONFIG } from './constantes';
import { SessaoService } from './sessao.service';
import { chaveCpf, cpfValido, soDigitos } from './cpf';

/*
 * Ouvidoria no Firestore do SAC (projeto sac-presenca), lida e gravada direto pela tela —
 * a tela não depende da ouvidoria-api (que fica para integrações de terceiros e "dorme" no Render).
 *
 * Mesmo esquema da ouvidoria-api, para as duas gravarem no mesmo lugar sem conflito:
 *   ouvidoria_chamados/{protocolo}             dados do chamado (id = protocolo OUV-AAAA-000000;
 *                                              solicitanteCpf só com os 11 dígitos, para cruzar com o SAC)
 *   ouvidoria_chamados/{protocolo}/historico   mudanças de status (status, observacao, criadoEm, por)
 *   ouvidoria_config/sequencia                 { ultimo: n } — último número de protocolo usado
 * Datas gravadas como Timestamp; status e tipo gravados pelo nome (ex.: "EmAnalise", "Reclamacao").
 */

const COLECAO = 'ouvidoria_chamados';
const COLECAO_CONFIG = 'ouvidoria_config';

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

/** Mesma ordem e mesmos códigos da API (1 = Sugestão, 2 = Reclamação...). O banco guarda o nome. */
export const TIPOS_OUV: Array<{ valor: TipoOuv; codigo: number; rotulo: string }> = [
  { valor: 'Sugestao', codigo: 1, rotulo: 'Sugestão' },
  { valor: 'Reclamacao', codigo: 2, rotulo: 'Reclamação' },
  { valor: 'Denuncia', codigo: 3, rotulo: 'Denúncia' },
  { valor: 'Elogio', codigo: 4, rotulo: 'Elogio' },
  { valor: 'Solicitacao', codigo: 5, rotulo: 'Solicitação' }
];

/** `por`: quem fez a mudança (usuário do SAC, credencial da API ou administrador). */
export interface HistoricoOuv { status: StatusOuv; statusDescricao: string; observacao: string | null; data: string; por?: string | null; }

export interface ResumoOuv {
  protocolo: string;
  status: StatusOuv;
  statusDescricao: string;
  tipo: TipoOuv | null;
  assunto: string;
  solicitanteNome: string | null;
  solicitanteEmail: string | null;
  solicitanteCpf: string | null;
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

/** `de`/`ate`: datas AAAA-MM-DD (dia local, inclusivas) aplicadas à data de abertura. Vazias = sem limite. */
export interface FiltroOuv { status?: StatusOuv | null; busca?: string; de?: string; ate?: string; pagina?: number; tamanho?: number; }

/** Abertura dentro do período (dias inteiros, no fuso de quem está usando). */
function noPeriodo(f: FiltroOuv): (c: ResumoOuv) => boolean {
  const ini = f.de ? new Date(f.de + 'T00:00:00').getTime() : -Infinity;
  const fim = f.ate ? new Date(f.ate + 'T23:59:59.999').getTime() : Infinity;
  return c => { const t = new Date(c.criadoEm).getTime(); return t >= ini && t <= fim; };
}

export interface NovoChamadoOuv {
  assunto: string;
  descricao?: string | null;
  tipo?: TipoOuv | null;
  solicitanteNome?: string | null;
  solicitanteEmail?: string | null;
  solicitanteCpf?: string | null;
}

export interface CriadoOuv { protocolo: string; status: StatusOuv; statusDescricao: string; criadoEm: string; }

/** Erro já traduzido para mostrar na tela. `campos` traz as validações do formulário. */
export class ErroOuv extends Error {
  constructor(message: string, readonly status: number, readonly campos: Record<string, string[]> = {}) { super(message); }
}

const rotuloStatus = (s: string) => STATUS_OUV.find(x => x.valor === s)?.rotulo || s;
const iso = (v: unknown) => v instanceof Timestamp ? v.toDate().toISOString() : String(v ?? '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function paraResumo(d: Record<string, any>): ResumoOuv {
  return {
    protocolo: d['protocolo'],
    status: d['status'],
    statusDescricao: rotuloStatus(d['status']),
    tipo: d['tipo'] ?? null,
    assunto: d['assunto'] ?? '',
    solicitanteNome: d['solicitanteNome'] ?? null,
    solicitanteEmail: d['solicitanteEmail'] ?? null,
    solicitanteCpf: d['solicitanteCpf'] ?? null,
    criadoEm: iso(d['criadoEm']),
    atualizadoEm: iso(d['atualizadoEm'])
  };
}

const FALHA = 'Não foi possível acessar a ouvidoria agora. Confira a conexão e clique em "Atualizar lista".';

@Injectable({ providedIn: 'root' })
export class OuvidoriaService {
  private sessao = inject(SessaoService);
  private db: Firestore = getFirestore(getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG));

  /** Muda a cada atualização da coleção (inclusive gravações de outros usuários e da API). */
  readonly versao = signal(0);

  private todos: ResumoOuv[] = [];
  private pronto: Promise<void> | null = null;
  private parar: Unsubscribe | null = null;

  constructor() {
    this.sessao.registrarLimpeza(() => {
      this.parar?.();
      this.parar = null;
      this.pronto = null;
      this.todos = [];
    });
  }

  /** Começa a escutar a coleção (uma vez por sessão). As próximas aberturas da tela usam o que já veio. */
  iniciar(): Promise<void> {
    if (!this.pronto) {
      this.pronto = new Promise<void>((ok, falha) => {
        this.parar = onSnapshot(collection(this.db, COLECAO), snap => {
          this.todos = snap.docs.map(d => paraResumo(d.data()));
          this.versao.update(v => v + 1);
          ok();
        }, e => {
          console.warn('Falha ao ler a ouvidoria:', e.message);
          this.pronto = null;
          falha(new ErroOuv(FALHA, 0));
        });
      });
    }
    return this.pronto;
  }

  async listar(f: FiltroOuv = {}): Promise<ListaOuv> {
    await this.iniciar();
    const pagina = f.pagina ?? 1, tamanho = f.tamanho ?? 20;

    // cards: contam o período escolhido (sem o status e a busca, que são o que o usuário filtra por cima)
    const porStatus: Partial<Record<StatusOuv, number>> = {};
    for (const c of this.todos.filter(noPeriodo(f))) porStatus[c.status] = (porStatus[c.status] || 0) + 1;

    const achados = this.filtrados(f);
    return { total: achados.length, pagina, tamanho, itens: achados.slice((pagina - 1) * tamanho, pagina * tamanho), porStatus };
  }

  /** Todas as manifestações que atendem ao filtro (período, status e busca), mais recentes primeiro. */
  filtrados(f: FiltroOuv = {}): ResumoOuv[] {
    const termo = (f.busca || '').trim().toLowerCase();
    const contem = (s: string | null) => !!s && s.toLowerCase().includes(termo);
    const digitos = soDigitos(termo);
    const contemCpf = (c: ResumoOuv) => digitos.length >= 3 && !!c.solicitanteCpf && c.solicitanteCpf.includes(digitos);

    return this.todos
      .filter(noPeriodo(f))
      .filter(c => !f.status || c.status === f.status)
      .filter(c => !termo || contem(c.protocolo) || contem(c.assunto) || contem(c.solicitanteNome) || contem(c.solicitanteEmail) || contemCpf(c))
      .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
  }


  /** Chaves de CPF (11 dígitos) que têm manifestação; vazio até a primeira leitura. */
  cpfsConhecidos(): string[] {
    return this.todos.map(c => chaveCpf(c.solicitanteCpf)).filter(Boolean);
  }

  /** Manifestações do CPF (qualquer formato), mais recentes primeiro. */
  async porCpf(cpf: string): Promise<ResumoOuv[]> {
    const chave = chaveCpf(cpf);
    if (!chave) return [];
    await this.iniciar();
    return this.todos.filter(c => chaveCpf(c.solicitanteCpf) === chave)
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }

  async consultar(protocolo: string): Promise<ChamadoOuv> {
    const ref = doc(this.db, COLECAO, protocolo.trim().toUpperCase());
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new ErroOuv(`Protocolo ${protocolo} não encontrado.`, 404);
      const hist = await getDocs(query(collection(ref, 'historico'), orderBy('criadoEm')));
      const d = snap.data();
      return {
        ...paraResumo(d),
        descricao: d['descricao'] ?? null,
        historico: hist.docs.map(h => {
          const x = h.data();
          return { status: x['status'], statusDescricao: rotuloStatus(x['status']), observacao: x['observacao'] ?? null, data: iso(x['criadoEm']), por: x['por'] ?? null };
        })
      };
    } catch (e) {
      throw e instanceof ErroOuv ? e : new ErroOuv(FALHA, 0);
    }
  }

  /** Gera o próximo protocolo e grava chamado + histórico numa única transação (igual à API). */
  async abrir(dados: NovoChamadoOuv): Promise<CriadoOuv> {
    const campos: Record<string, string[]> = {};
    const assunto = (dados.assunto || '').trim();
    if (!assunto) campos['assunto'] = ['Informe o assunto.'];
    else if (assunto.length > 200) campos['assunto'] = ['Máximo de 200 caracteres.'];
    if ((dados.solicitanteNome || '').length > 150) campos['solicitanteNome'] = ['Máximo de 150 caracteres.'];
    if (dados.solicitanteEmail && (dados.solicitanteEmail.length > 150 || !EMAIL.test(dados.solicitanteEmail)))
      campos['solicitanteEmail'] = ['E-mail inválido.'];
    const cpf = soDigitos(dados.solicitanteCpf);
    if (cpf && !cpfValido(cpf)) campos['solicitanteCpf'] = ['CPF inválido.'];
    if (Object.keys(campos).length) throw new ErroOuv('Dados inválidos: confira os campos destacados.', 400, campos);
    if (!(await this.sessao.exigirSessao())) throw new ErroOuv('Sessão inválida.', 401);

    const por = this.sessao.nomeUsuario();
    try {
      return await runTransaction(this.db, async tx => {
        const refSeq = doc(this.db, COLECAO_CONFIG, 'sequencia');
        const seq = await tx.get(refSeq);
        const numero = (Number(seq.data()?.['ultimo']) || 0) + 1;
        const agora = Timestamp.now();
        const protocolo = `OUV-${agora.toDate().getUTCFullYear()}-${String(numero).padStart(6, '0')}`;
        const refChamado = doc(this.db, COLECAO, protocolo);

        tx.set(refSeq, { ultimo: numero });
        tx.set(refChamado, {
          protocolo, status: 'Recebido', tipo: dados.tipo ?? null, assunto,
          descricao: dados.descricao ?? null, solicitanteNome: dados.solicitanteNome ?? null,
          solicitanteEmail: dados.solicitanteEmail ?? null, solicitanteCpf: cpf || null, criadoEm: agora, atualizadoEm: agora
        });
        tx.set(doc(collection(refChamado, 'historico')), { status: 'Recebido', observacao: 'Chamado aberto', criadoEm: agora, por });
        return { protocolo, status: 'Recebido' as StatusOuv, statusDescricao: rotuloStatus('Recebido'), criadoEm: agora.toDate().toISOString() };
      });
    } catch (e) {
      console.warn('Falha ao abrir manifestação:', (e as Error).message);
      throw new ErroOuv(FALHA, 0);
    }
  }

  /** Muda o status e registra no histórico, com o usuário do SAC em `por`. */
  async alterarStatus(protocolo: string, status: StatusOuv, observacao?: string | null): Promise<void> {
    if (!(await this.sessao.exigirSessao())) throw new ErroOuv('Sessão inválida.', 401);
    const por = this.sessao.nomeUsuario();
    const ref = doc(this.db, COLECAO, protocolo.trim().toUpperCase());
    let existe = true;
    try {
      await runTransaction(this.db, async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists()) { existe = false; return; }
        const agora = Timestamp.now();
        tx.update(ref, { status, atualizadoEm: agora });
        tx.set(doc(collection(ref, 'historico')), { status, observacao: observacao || null, criadoEm: agora, por });
      });
    } catch (e) {
      console.warn('Falha ao alterar status:', (e as Error).message);
      throw new ErroOuv(FALHA, 0);
    }
    if (!existe) throw new ErroOuv(`Protocolo ${protocolo} não encontrado.`, 404);
  }
}
