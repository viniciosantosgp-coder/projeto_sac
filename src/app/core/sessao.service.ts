import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { Usuario } from './modelos';
import { API_ROTA_SESSAO, USUARIOS_VISAO_GERAL } from './constantes';

const CHAVE_CACHE = 'sac_auth';
const INTERVALO_REVALIDACAO_MS = 5 * 60 * 1000;

/**
 * Guarda de acesso: nenhum dado é lido, gravado ou renderizado sem token válido
 * emitido pelo endpoint de login da Presença.
 */
@Injectable({ providedIn: 'root' })
export class SessaoService {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly token = signal<string | null>(null);
  readonly usuario = signal<Usuario | null>(null);
  readonly autenticado = computed(() => !!this.token() && !!this.usuario());
  readonly aviso = signal<string>('');

  readonly temVisaoGeral = computed(() => {
    const u = this.usuario();
    const nome = String(u?.nome || '').trim().toLowerCase();
    const login = String(u?.login || '').trim().toLowerCase();
    return USUARIOS_VISAO_GERAL.some(x => {
      const alvo = x.trim().toLowerCase();
      return alvo === nome || alvo === login;
    });
  });

  private ultimaValidacao = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private aoEncerrar: Array<() => void> = [];

  /** Componentes registram aqui a limpeza dos próprios dados sensíveis. */
  registrarLimpeza(fn: () => void): void { this.aoEncerrar.push(fn); }

  nomeUsuario(): string {
    const u = this.usuario();
    return (u?.nome || u?.login || 'Desconhecido') as string;
  }

  private parseJwt(token: string): Record<string, any> | null {
    try {
      const payload = token.split('.')[1];
      return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    } catch { return null; }
  }

  private tokenExpirado(token: string): boolean {
    const p = this.parseJwt(token);
    if (!p || !p['exp']) return false;   // sem exp legível, quem decide é o servidor
    return p['exp'] * 1000 <= Date.now();
  }

  private hojeLocal(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  sessaoLocalValida(): boolean {
    const t = this.token();
    return !!(t && this.usuario() && !this.tokenExpirado(t));
  }

  private salvarCache(): void {
    if (!this.token()) return;
    localStorage.setItem(CHAVE_CACHE, JSON.stringify({
      token: this.token(), usuario: this.usuario(), dataLogin: this.hojeLocal()
    }));
  }

  tentarAutoLogin(): boolean {
    let cache: any = null;
    try { cache = JSON.parse(localStorage.getItem(CHAVE_CACHE) || 'null'); } catch { cache = null; }
    if (!cache || cache.dataLogin !== this.hojeLocal()) return false;
    if (!cache.token || this.tokenExpirado(cache.token)) return false;
    this.token.set(cache.token);
    this.usuario.set(cache.usuario);
    this.iniciarVigia();
    return true;
  }

  async entrar(login: string, senha: string): Promise<{ ok: boolean; erro?: string }> {
    try {
      const { ok, dados } = await this.api.chamar<any>('POST', '/login', { login, senha });
      if (!ok || !dados?.token) return { ok: false, erro: 'Login ou senha inválidos.' };
      this.token.set(dados.token);
      this.usuario.set(dados.usuario);
      this.ultimaValidacao = Date.now();
      this.salvarCache();
      this.aviso.set('');
      this.iniciarVigia();
      return { ok: true };
    } catch {
      return { ok: false, erro: 'Erro de rede/CORS ao tentar logar.' };
    }
  }

  /**
   * 200 -> válida | 401/403 -> derruba | 404, 5xx ou rede -> mantém
   * (indisponibilidade da API não pode travar o time no meio do expediente).
   */
  async validarNoServidor(forcar = false): Promise<boolean> {
    if (!this.sessaoLocalValida()) return false;
    if (!forcar && Date.now() - this.ultimaValidacao < INTERVALO_REVALIDACAO_MS) return true;
    try {
      const { ok, status, dados } = await this.api.chamar<any>('GET', API_ROTA_SESSAO, undefined, this.token());
      if (status === 401 || status === 403) return false;
      if (ok) {
        this.ultimaValidacao = Date.now();
        const u = (dados && (dados.usuario || dados.user)) || dados;
        if (u && (u.nome || u.login)) {
          this.usuario.set({ ...(this.usuario() || {}), ...u });
          this.salvarCache();
        }
      }
      return true;
    } catch {
      return true;
    }
  }

  /** Porta obrigatória de tudo que toca dado sensível. */
  async exigirSessao(): Promise<boolean> {
    if (!this.sessaoLocalValida()) { this.encerrar('expirada'); return false; }
    if (!(await this.validarNoServidor(false))) { this.encerrar('invalida'); return false; }
    return true;
  }

  encerrar(motivo?: 'expirada' | 'invalida' | null): void {
    this.aoEncerrar.forEach(fn => { try { fn(); } catch { /* ignora */ } });
    localStorage.removeItem(CHAVE_CACHE);
    this.token.set(null);
    this.usuario.set(null);
    this.ultimaValidacao = 0;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.aviso.set(
      motivo === 'expirada' ? 'Sua sessão expirou. Entre novamente para acessar os chamados.'
        : motivo === 'invalida' ? 'Sessão encerrada por segurança. Faça login novamente.'
        : ''
    );
    this.router.navigate(['/login']);
  }

  private iniciarVigia(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(async () => {
      if (!this.token()) return;
      if (!this.sessaoLocalValida()) { this.encerrar('expirada'); return; }
      if (!(await this.validarNoServidor(true))) this.encerrar('invalida');
    }, INTERVALO_REVALIDACAO_MS);

    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState !== 'visible' || !this.token()) return;
      if (!this.sessaoLocalValida()) { this.encerrar('expirada'); return; }
      if (!(await this.validarNoServidor(true))) this.encerrar('invalida');
    });
  }
}
