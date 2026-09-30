import { Injectable, inject, signal } from '@angular/core';
import { getApp, getApps, initializeApp, FirebaseApp } from 'firebase/app';
import { Firestore, collection, deleteDoc, doc, getDocs, getFirestore, setDoc, updateDoc } from 'firebase/firestore';
import { FIREBASE_CONFIG } from './constantes';
import { SessaoService } from './sessao.service';

const COLECAO = 'notas_sac';

/** Documento da coleção `notas_sac`: anotação pessoal do atendente. */
export interface Nota {
  id: string;
  texto: string;
  criadoPor: string;
  criadoEm: string;
  atualizadoEm?: string;
  atualizadoPor?: string;
  /** Notas antigas com senha (recurso descontinuado): só dá para excluir. */
  protegida?: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotasService {
  private sessao = inject(SessaoService);
  // reaproveita o app que o ChamadosService já inicializou
  private app: FirebaseApp = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  private db: Firestore = getFirestore(this.app);

  readonly notas = signal<Nota[]>([]);

  constructor() {
    this.sessao.registrarLimpeza(() => this.notas.set([]));
  }

  /** Mais recentes (criadas ou editadas) primeiro. */
  private ordenar(lista: Nota[]): Nota[] {
    return lista.slice().sort((a, b) =>
      new Date(b.atualizadoEm || b.criadoEm).getTime() - new Date(a.atualizadoEm || a.criadoEm).getTime());
  }

  async carregar(): Promise<Nota[]> {
    if (!(await this.sessao.exigirSessao())) { this.notas.set([]); return []; }
    try {
      const snap = await getDocs(collection(this.db, COLECAO));
      this.notas.set(this.ordenar(snap.docs.map(d => d.data() as Nota)));
    } catch (e) {
      console.warn('Falha ao carregar notas:', (e as Error).message);
    }
    return this.notas();
  }

  async criar(dados: { texto: string }): Promise<void> {
    const texto = dados.texto.trim();
    if (!texto) return;
    if (!(await this.sessao.exigirSessao())) throw new Error('Sessão inválida.');
    const agora = new Date().toISOString();
    const id = `n${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const nota: Nota = { id, texto, criadoPor: this.sessao.nomeUsuario(), criadoEm: agora };
    await setDoc(doc(this.db, COLECAO, id), nota as { [k: string]: any });
    this.notas.set(this.ordenar([nota, ...this.notas()]));
  }

  async atualizar(id: string, dados: { texto: string }): Promise<void> {
    const texto = dados.texto.trim();
    if (!texto) return;
    if (!(await this.sessao.exigirSessao())) throw new Error('Sessão inválida.');
    const patch = { texto, atualizadoEm: new Date().toISOString(), atualizadoPor: this.sessao.nomeUsuario() };
    await updateDoc(doc(this.db, COLECAO, id), patch);
    this.notas.set(this.ordenar(this.notas().map(n => n.id === id ? { ...n, ...patch } : n)));
  }

  async excluir(id: string): Promise<void> {
    if (!(await this.sessao.exigirSessao())) throw new Error('Sessão inválida.');
    await deleteDoc(doc(this.db, COLECAO, id));
    this.notas.set(this.notas().filter(n => n.id !== id));
  }
}
