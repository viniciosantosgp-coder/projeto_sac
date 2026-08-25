import { Injectable, inject, signal } from '@angular/core';
import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  Firestore, collection, doc, getDocs, getFirestore, setDoc, updateDoc, writeBatch
} from 'firebase/firestore';
import { FIREBASE_CONFIG, SAC_ESQUEMA_VERSAO } from './constantes';
import { Chamado, Observacao, StatusChamado } from './modelos';
import {
  camposSlaDoChamado, chamadoAberto, novoEventoStatus, patchMudancaStatus,
  patchNormalizacao, precisaNormalizar, statusChamado
} from './dominio';
import { SessaoService } from './sessao.service';

const COLECAO = 'reclamacoes';

@Injectable({ providedIn: 'root' })
export class ChamadosService {
  private sessao = inject(SessaoService);
  private app: FirebaseApp = initializeApp(FIREBASE_CONFIG);
  private db: Firestore = getFirestore(this.app);

  readonly registros = signal<Chamado[]>([]);
  readonly normalizadosNaSessao = signal<number>(0);
  private normalizacaoExecutada = false;

  constructor() {
    this.sessao.registrarLimpeza(() => {
      this.registros.set([]);
      this.normalizadosNaSessao.set(0);
    });
  }

  /** Lê a coleção inteira. Sem sessão válida, devolve vazio e nem consulta. */
  async carregar(): Promise<Chamado[]> {
    if (!(await this.sessao.exigirSessao())) { this.registros.set([]); return []; }
    try {
      const snap = await getDocs(collection(this.db, COLECAO));
      const lista = snap.docs.map(d => d.data() as Chamado);
      this.registros.set(lista);
      await this.normalizar();
    } catch (e) {
      console.warn('Falha ao carregar reclamações SAC:', (e as Error).message);
    }
    return this.registros();
  }

  /**
   * Backfill: grava de verdade o que antes era só interpretado na tela
   * (status explícito, prazo de SLA, vencimento, fechamento e histórico inicial).
   */
  private async normalizar(): Promise<number> {
    if (this.normalizacaoExecutada) return 0;
    const carregados = this.registros();
    if (!carregados.length) return 0;             // coleção vazia: tenta de novo na próxima carga
    const alvos = carregados.filter(precisaNormalizar);
    if (!alvos.length) { this.normalizacaoExecutada = true; return 0; }

    try {
      const usuario = this.sessao.nomeUsuario();
      for (let i = 0; i < alvos.length; i += 400) {   // limite do Firestore é 500 por lote
        const fatia = alvos.slice(i, i + 400);
        const lote = writeBatch(this.db);
        fatia.forEach(r => {
          const patch = patchNormalizacao(r, usuario);
          Object.assign(r, patch);
          lote.update(doc(this.db, COLECAO, String(r.id)), patch as { [k: string]: any });
        });
        await lote.commit();
      }
      this.registros.set([...carregados]);
      this.normalizadosNaSessao.set(alvos.length);
      this.normalizacaoExecutada = true;
      console.info(`[SAC] ${alvos.length} chamado(s) normalizado(s) no Firestore (esquema v${SAC_ESQUEMA_VERSAO}).`);
    } catch (e) {
      console.warn('[SAC] Falha ao normalizar registros:', (e as Error).message);
    }
    return this.normalizadosNaSessao();
  }

  buscarPorId(id: number | string): Chamado | undefined {
    return this.registros().find(r => Number(r.id) === Number(id));
  }

  /** Move o chamado no fluxo: Aberto -> Em tratativa -> Resolvida (e reabertura). */
  async alterarStatus(id: number | string, novoStatus: StatusChamado, origem = 'app'): Promise<void> {
    if (!(await this.sessao.exigirSessao())) return;
    try {
      const atual = this.buscarPorId(id) || ({ id, criadoEm: new Date().toISOString() } as Chamado);
      const patch = patchMudancaStatus(atual, novoStatus, this.sessao.nomeUsuario(), origem);
      await updateDoc(doc(this.db, COLECAO, String(id)), patch as { [k: string]: any });
      await this.carregar();
    } catch (e) {
      console.warn('Falha ao atualizar status:', (e as Error).message);
    }
  }

  async marcarResolvido(id: number | string, resolver: boolean): Promise<void> {
    return this.alterarStatus(id, resolver ? 'Resolvida' : 'Pendente');
  }

  /** Observação é gravada estruturada e também concatenada em `descricao`. */
  async adicionarObservacao(id: number | string, texto: string): Promise<{ moveuParaTratativa: boolean }> {
    if (!(await this.sessao.exigirSessao())) return { moveuParaTratativa: false };
    const atual = this.buscarPorId(id);
    if (!atual) throw new Error('Chamado não encontrado.');

    const agora = new Date().toISOString();
    const usuario = this.sessao.nomeUsuario();
    const eraAberto = chamadoAberto(atual);

    const descricaoAtual = atual.descricao || '';
    const novaDescricao = descricaoAtual ? `${descricaoAtual}\n\n${texto}` : texto;
    const lista: Observacao[] = Array.isArray(atual.observacoes) ? atual.observacoes.slice() : [];
    lista.push({ em: agora, por: usuario, texto, tipo: 'observacao' });

    let patch: Partial<Chamado> = {
      descricao: novaDescricao,
      observacoes: lista,
      atualizadoEm: agora,
      atualizadoPor: usuario,
      ultimaAtuacaoPor: usuario,
      ultimaAtuacaoEm: agora,
      versaoEsquema: SAC_ESQUEMA_VERSAO
    };
    // registrar observação já é uma tratativa
    if (eraAberto) patch = { ...patch, ...patchMudancaStatus(atual, 'Pendente', usuario, 'observacao') };

    await updateDoc(doc(this.db, COLECAO, String(id)), patch as { [k: string]: any });
    await this.carregar();
    return { moveuParaTratativa: eraAberto };
  }

  /** Cria o chamado já com SLA, histórico e rastreabilidade gravados. */
  async criar(dados: {
    produto: string; canal: string; categoria: string; gravidade: string;
    descricao: string; cpf: string; idProposta: string;
  }): Promise<number> {
    if (!(await this.sessao.exigirSessao())) throw new Error('Sessão inválida.');
    await this.carregar();
    const maiorId = this.registros().reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
    const novoId = maiorId + 1;
    const agora = new Date().toISOString();
    const usuario = this.sessao.nomeUsuario();

    const payload: Chamado = {
      id: novoId,
      criadoEm: agora,
      produto: dados.produto,
      canal: dados.canal,
      categoria: dados.categoria,
      gravidade: dados.gravidade,
      descricao: dados.descricao,
      cpf: dados.cpf,
      idProposta: dados.idProposta,
      atendente: usuario,
      status: 'Aberto',
      resolvidoEm: '',
      ...camposSlaDoChamado({ gravidade: dados.gravidade, criadoEm: agora }, agora),
      duracaoDias: null,
      slaCumprido: null,
      slaStatus: '',
      criadoPor: usuario,
      statusAtualizadoEm: agora,
      atualizadoEm: agora,
      atualizadoPor: usuario,
      tratativaIniciadaEm: '',
      tratativaPor: '',
      resolvidoPor: '',
      reabertoEm: '',
      versaoEsquema: SAC_ESQUEMA_VERSAO,
      historicoStatus: [novoEventoStatus('', 'Aberto', agora, usuario, 'abertura')],
      observacoes: dados.descricao ? [{ em: agora, por: usuario, texto: dados.descricao, tipo: 'descricao' }] : []
    };

    await setDoc(doc(this.db, COLECAO, String(novoId)), payload as { [k: string]: any });
    await this.carregar();
    return novoId;
  }

  statusDe(r: Chamado): StatusChamado { return statusChamado(r); }
}
