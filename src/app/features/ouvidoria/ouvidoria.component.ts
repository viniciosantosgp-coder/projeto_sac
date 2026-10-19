import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, HostListener, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ClienteService, HistoricoCliente } from '../../core/cliente.service';
import { SessaoService } from '../../core/sessao.service';
import { chaveCpf, formatarCpf } from '../../core/cpf';
import {
  ChamadoOuv, ErroOuv, NovoChamadoOuv, OuvidoriaService, ResumoOuv, STATUS_OUV, StatusOuv, TIPOS_OUV, TipoOuv
} from '../../core/ouvidoria.service';
import { Paginador } from '../../core/paginacao';
import { PaginacaoComponent } from '../shell/paginacao.component';

/**
 * Ouvidoria lida direto do Firestore do SAC (ver ouvidoria.service.ts).
 * A lista se atualiza sozinha quando a coleção muda (outro usuário ou a ouvidoria-api).
 */
@Component({
  selector: 'app-ouvidoria',
  standalone: true,
  imports: [FormsModule, DatePipe, PaginacaoComponent],
  template: `
    <!-- Cabeçalho -->
    <div class="flex items-center justify-between flex-wrap gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-extrabold text-stone-900 tracking-tight">Ouvidoria</h1>
        <p class="text-stone-500 text-sm mt-1">Manifestações registradas na ouvidoria · protocolo no formato OUV-AAAA-000000.</p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <button (click)="exportarPdf()" [disabled]="exportando()" title="Relatório em PDF com o período e os filtros aplicados"
                class="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M224,152a8,8,0,0,1-8,8H192v16h16a8,8,0,0,1,0,16H192v16a8,8,0,0,1-16,0V152a8,8,0,0,1,8-8h32A8,8,0,0,1,224,152ZM92,172a28,28,0,0,1-28,28H56v8a8,8,0,0,1-16,0V152a8,8,0,0,1,8-8H64A28,28,0,0,1,92,172Zm-16,0a12,12,0,0,0-12-12H56v24h8A12,12,0,0,0,76,172Zm88,8a36,36,0,0,1-36,36H112a8,8,0,0,1-8-8V152a8,8,0,0,1,8-8h16A36,36,0,0,1,164,180Zm-16,0a20,20,0,0,0-20-20h-8v40h8A20,20,0,0,0,148,180ZM40,112V40A16,16,0,0,1,56,24h96a8,8,0,0,1,5.66,2.34l56,56A8,8,0,0,1,216,88v24a8,8,0,0,1-16,0V96H152a8,8,0,0,1-8-8V40H56v72a8,8,0,0,1-16,0ZM160,80h28.69L160,51.31Z"/></svg>
          {{ exportando() ? 'Gerando PDF...' : 'Exportar PDF' }}
        </button>
        <button (click)="abrirNovo()" class="inline-flex items-center gap-2 px-4 py-2 bg-[#E35205] hover:bg-[#c44503] text-white rounded-lg text-sm font-semibold transition-colors">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"/></svg>
          Registrar manifestação
        </button>
      </div>
    </div>

    @if (erro()) {
      <div class="flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 mb-5 text-sm">
        <span class="flex-1">{{ erro() }}</span>
        <button (click)="erro.set('')" class="font-bold opacity-60 hover:opacity-100">✕</button>
      </div>
    }

    <!-- Período + busca -->
    <div class="flex flex-wrap items-end gap-3 mb-6">
      <div>
        <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1">Período de abertura</label>
        <div class="flex items-center gap-2">
          <div class="campo-periodo flex items-stretch bg-white border border-stone-200 rounded-lg overflow-hidden">
            <div class="px-3 py-1.5">
              <span class="block text-[10px] font-bold text-stone-400 uppercase tracking-wider leading-none mb-0.5">Início</span>
              <input type="date" [(ngModel)]="dataInicio" (ngModelChange)="aplicarPeriodo()" [max]="dataFim || null" class="text-sm code-font">
            </div>
            <div class="self-center text-stone-300 select-none px-0.5">→</div>
            <div class="px-3 py-1.5">
              <span class="block text-[10px] font-bold text-stone-400 uppercase tracking-wider leading-none mb-0.5">Fim</span>
              <input type="date" [(ngModel)]="dataFim" (ngModelChange)="aplicarPeriodo()" [min]="dataInicio || null" class="text-sm code-font">
            </div>
          </div>
          @if (dataInicio || dataFim) {
            <button (click)="dataInicio = ''; dataFim = ''; aplicarPeriodo()" class="text-xs font-semibold text-stone-400 hover:text-stone-700">limpar</button>
          }
        </div>
      </div>
      <div class="w-full sm:w-auto">
        <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1">Buscar</label>
        <div class="flex items-center gap-2">
          <input [(ngModel)]="busca" (keydown.enter)="buscar()" type="text" placeholder="Protocolo, CPF, assunto, nome ou e-mail"
                 class="border border-stone-200 rounded-lg px-3 py-2 text-sm w-full sm:w-[300px]">
          <button (click)="buscar()" [disabled]="carregando()"
                  class="px-4 py-2 bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">Buscar</button>
          @if (buscaAplicada()) {
            <button (click)="busca = ''; buscar()" class="text-xs font-semibold text-stone-400 hover:text-stone-700">limpar</button>
          }
        </div>
      </div>
      <button (click)="carregar()" [disabled]="carregando()" class="px-4 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-semibold text-stone-700 transition-colors disabled:opacity-60 sm:ml-auto">
        {{ carregando() ? 'Atualizando...' : 'Atualizar lista' }}
      </button>
    </div>

    <!-- Cards por status (também filtram a lista) -->
    <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
      <div (click)="filtrar(null)" [style.--kpi-cor]="'#E35205'"
           class="card kpi kpi-filtro bg-white border border-stone-200 rounded-xl p-4 cursor-pointer" [class.ativo]="!filtroStatus()">
        <p class="kpi-rotulo text-stone-400 uppercase font-bold">Todos</p>
        <p class="text-2xl font-bold code-font mt-1 leading-none text-stone-800">{{ totalGeral() }}</p>
      </div>
      @for (s of status; track s.valor) {
        <div (click)="filtrar(s.valor)" [style.--kpi-cor]="s.cor"
             class="card kpi kpi-filtro bg-white border border-stone-200 rounded-xl p-4 cursor-pointer" [class.ativo]="filtroStatus() === s.valor">
          <p class="kpi-rotulo text-stone-400 uppercase font-bold">{{ s.rotulo }}</p>
          <p class="text-2xl font-bold code-font mt-1 leading-none" [style.color]="s.cor">{{ porStatus()[s.valor] || 0 }}</p>
        </div>
      }
    </div>

    <!-- Lista -->
    <h2 id="lista-ouvidoria" class="text-sm font-bold text-stone-700 uppercase tracking-wider mb-3 scroll-mt-24">
      Manifestações ({{ total() }})
      @if (filtroStatus()) { <span class="normal-case font-semibold text-stone-400">· {{ rotuloStatus(filtroStatus()!) }}</span> }
      @if (buscaAplicada()) { <span class="normal-case font-semibold text-stone-400">· busca "{{ buscaAplicada() }}"</span> }
      @if (dataInicio || dataFim) { <span class="normal-case font-semibold text-stone-400">· abertas {{ textoPeriodo() }}</span> }
    </h2>

    @if (carregando() && !itens().length) {
      <p class="text-sm text-stone-400 py-6 text-center bg-white border border-stone-200 rounded-xl">Carregando manifestações...</p>
    } @else if (!itens().length) {
      <p class="text-sm text-stone-400 py-6 text-center bg-white border border-stone-200 rounded-xl">
        {{ filtroStatus() || buscaAplicada() ? 'Nenhuma manifestação encontrada com esse filtro.' : 'Nenhuma manifestação registrada ainda.' }}
      </p>
    } @else {
      <div class="card bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden tabela-scroll">
        <table class="tabela-moderna w-full table-fixed text-left text-[13px]">
          <colgroup><col class="w-[17%]"><col class="w-[29%]"><col class="w-[12%]"><col class="w-[18%]"><col class="w-[12%]"><col class="w-[12%]"></colgroup>
          <thead class="bg-stone-50 border-b border-stone-200 text-stone-500 text-xs uppercase font-bold">
            <tr><th class="py-3 px-3">Protocolo</th><th class="py-3 px-3">Assunto</th><th class="py-3 px-3">Tipo</th>
              <th class="py-3 px-3">Solicitante</th><th class="py-3 px-3">Atualizado</th><th class="py-3 px-3">Status</th></tr>
          </thead>
          <tbody class="divide-y divide-stone-100">
            @for (c of pagina.itens(); track c.protocolo) {
              <tr (click)="verDetalhe(c.protocolo)" class="cursor-pointer align-middle">
                <td class="py-3 px-3 code-font font-semibold text-stone-700 whitespace-nowrap">{{ c.protocolo }}</td>
                <td class="py-3 px-3 text-stone-700 truncate" [title]="c.assunto">{{ c.assunto }}</td>
                <td class="py-3 px-3 text-stone-500 truncate">{{ rotuloTipo(c.tipo) }}</td>
                <td class="py-3 px-3 text-stone-600">
                  <div class="truncate" [title]="c.solicitanteNome || ''">{{ c.solicitanteNome || '—' }}</div>
                  @if (c.solicitanteCpf) { <div class="text-[11px] text-stone-400 code-font truncate">CPF {{ fmtCpf(c.solicitanteCpf) }}</div> }
                  @else if (c.solicitanteEmail) { <div class="text-[11px] text-stone-400 truncate" [title]="c.solicitanteEmail">{{ c.solicitanteEmail }}</div> }
                </td>
                <td class="py-3 px-3 text-stone-500 whitespace-nowrap">{{ c.atualizadoEm | date:'dd/MM/yy HH:mm' }}</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full border" [class]="badgeStatus(c.status)">{{ c.statusDescricao }}</span>
                </td>
              </tr>
            }
          </tbody>
        </table>
        <app-paginacao [paginador]="pagina" rotulo="protocolo(s)" ancora="lista-ouvidoria" classeExtra="border-t border-stone-100 bg-stone-50" />
      </div>
    }

    <!-- Detalhe -->
    @if (sel(); as c) {
      <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-6" (click)="fecharDetalhe()">
        <div class="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col" (click)="$event.stopPropagation()">
          <div class="px-6 py-4 border-b border-stone-100 flex items-center justify-between gap-3">
            <div>
              <p class="text-xs text-stone-400 uppercase font-bold tracking-wider">Protocolo</p>
              <h3 class="text-xl font-bold text-stone-800 code-font">{{ c.protocolo }}</h3>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs font-semibold px-2.5 py-1 rounded-full border" [class]="badgeStatus(c.status)">{{ c.statusDescricao }}</span>
              <button (click)="fecharDetalhe()" class="text-stone-400 hover:text-stone-700 text-2xl leading-none">&times;</button>
            </div>
          </div>

          <div class="px-6 py-5 overflow-y-auto flex-1 space-y-5">
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div><p class="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Tipo</p><p class="text-stone-700">{{ rotuloTipo(c.tipo) }}</p></div>
              <div><p class="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Aberto em</p><p class="text-stone-700">{{ c.criadoEm | date:'dd/MM/yyyy HH:mm' }}</p></div>
              <div><p class="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Atualizado em</p><p class="text-stone-700">{{ c.atualizadoEm | date:'dd/MM/yyyy HH:mm' }}</p></div>
              <div><p class="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Solicitante</p><p class="text-stone-700">{{ c.solicitanteNome || '—' }}</p></div>
              <div><p class="text-[11px] font-bold text-stone-400 uppercase tracking-wider">CPF</p><p class="text-stone-700 code-font">{{ c.solicitanteCpf ? fmtCpf(c.solicitanteCpf) : '—' }}</p></div>
              <div class="col-span-2 sm:col-span-1"><p class="text-[11px] font-bold text-stone-400 uppercase tracking-wider">E-mail</p><p class="text-stone-700 break-all">{{ c.solicitanteEmail || '—' }}</p></div>
            </div>

            <!-- Cruzamento com o SAC pelo CPF -->
            @if (cruzamento(); as x) {
              <div class="flex items-center justify-between gap-3 flex-wrap rounded-xl px-4 py-2.5 text-sm border"
                   [class]="x.sac.length ? 'bg-orange-50 border-orange-200 text-orange-800' : 'bg-stone-50 border-stone-200 text-stone-500'">
                <span>
                  @if (x.sac.length) {
                    <b>SAC:</b> {{ x.sac.length }} chamado(s) deste CPF · {{ x.sacAbertos ? x.sacAbertos + ' em aberto' : 'todos resolvidos' }}
                  } @else { SAC: nenhum chamado deste CPF. }
                </span>
                <button (click)="verCliente(c.solicitanteCpf!)" class="text-xs font-semibold underline hover:no-underline">Ver histórico do cliente</button>
              </div>
            }

            <div>
              <p class="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-1">Assunto</p>
              <p class="text-stone-800 font-semibold">{{ c.assunto }}</p>
              @if (c.descricao) { <p class="text-sm text-stone-600 mt-2 whitespace-pre-wrap bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">{{ c.descricao }}</p> }
            </div>

            <div>
              <p class="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-2">Histórico</p>
              <ol class="space-y-2">
                @for (h of c.historico; track $index) {
                  <li class="flex gap-3 text-sm">
                    <span class="w-2 h-2 rounded-full mt-1.5 shrink-0" [style.background]="corStatus(h.status)"></span>
                    <div>
                      <span class="font-semibold text-stone-700">{{ h.statusDescricao }}</span>
                      <span class="text-xs text-stone-400 code-font ml-2">{{ h.data | date:'dd/MM/yyyy HH:mm' }}</span>
                      @if (h.observacao) { <p class="text-stone-500">{{ h.observacao }}</p> }
                      @if (h.por) { <p class="text-[11px] text-stone-400">por {{ h.por }}</p> }
                    </div>
                  </li>
                }
              </ol>
            </div>

            <div class="border-t border-stone-100 pt-4">
              <p class="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-2">Alterar status</p>
              <div class="flex flex-wrap gap-2 mb-2">
                @for (s of status; track s.valor) {
                  <button type="button" (click)="novoStatus = s.valor"
                          class="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                          [class]="novoStatus === s.valor ? 'text-white border-transparent' : 'border-stone-200 text-stone-600 hover:border-stone-300'"
                          [style.background]="novoStatus === s.valor ? s.cor : ''">{{ s.rotulo }}</button>
                }
              </div>
              <textarea [(ngModel)]="observacao" rows="2" placeholder="Observação (vai para o histórico)"
                        class="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm resize-none"></textarea>
            </div>
          </div>

          <div class="px-6 py-4 border-t border-stone-100 flex items-center justify-end gap-3">
            <div class="flex gap-2">
              <button (click)="fecharDetalhe()" class="px-4 py-2 text-sm font-semibold text-stone-500 hover:text-stone-700">Fechar</button>
              <button (click)="salvarStatus(c)" [disabled]="salvando() || !novoStatus || (novoStatus === c.status && !observacao.trim())"
                      class="px-4 py-2 bg-[#E35205] hover:bg-[#c44503] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
                {{ salvando() ? 'Salvando...' : 'Salvar status' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Registrar -->
    @if (novoAberto()) {
      <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-6" (click)="novoAberto.set(false)">
        <div class="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col" (click)="$event.stopPropagation()">
          <div class="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
            <h3 class="text-xl font-bold text-stone-800">Registrar manifestação</h3>
            <button (click)="novoAberto.set(false)" class="text-stone-400 hover:text-stone-700 text-2xl leading-none">&times;</button>
          </div>
          <div class="px-6 py-5 overflow-y-auto flex-1 space-y-4">
            <div>
              <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-2">Tipo</label>
              <div class="flex flex-wrap gap-2">
                @for (t of tipos; track t.valor) {
                  <button type="button" (click)="form.tipo = form.tipo === t.valor ? null : t.valor"
                          class="px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-colors"
                          [class]="form.tipo === t.valor ? 'bg-[#E35205] text-white border-transparent' : 'border-stone-200 text-stone-600 hover:border-stone-300'"><span class="code-font opacity-60 mr-1">{{ t.codigo }}</span>{{ t.rotulo }}</button>
                }
              </div>
            </div>
            <div>
              <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1">Assunto <span class="text-red-500">*</span></label>
              <input [(ngModel)]="form.assunto" maxlength="200" type="text" class="w-full border rounded-lg px-3 py-2 text-sm"
                     [class]="erroCampo('assunto') ? 'border-red-400' : 'border-stone-200'">
              <div class="flex justify-between text-[11px] mt-1">
                <span class="text-red-600">{{ erroCampo('assunto') }}</span>
                <span class="text-stone-400 code-font">{{ form.assunto.length }}/200</span>
              </div>
            </div>
            <div>
              <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1">Descrição</label>
              <textarea [(ngModel)]="form.descricao" rows="4" class="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm resize-none"
                        placeholder="O que o cliente relatou"></textarea>
            </div>
            <div>
              <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1">CPF do solicitante</label>
              <input [(ngModel)]="form.solicitanteCpf" maxlength="14" type="text" inputmode="numeric" placeholder="000.000.000-00"
                     class="w-full border rounded-lg px-3 py-2 text-sm code-font" [class]="erroCampo('solicitanteCpf') ? 'border-red-400' : 'border-stone-200'">
              <span class="text-[11px] text-red-600">{{ erroCampo('solicitanteCpf') }}</span>
              @if (!erroCampo('solicitanteCpf')) { <span class="text-[11px] text-stone-400">Liga a manifestação aos chamados do SAC do mesmo cliente.</span> }
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1">Nome do solicitante</label>
                <input [(ngModel)]="form.solicitanteNome" maxlength="150" type="text" class="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm">
                <span class="text-[11px] text-red-600">{{ erroCampo('solicitanteNome') }}</span>
              </div>
              <div>
                <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1">E-mail</label>
                <input [(ngModel)]="form.solicitanteEmail" maxlength="150" type="email" class="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm">
                <span class="text-[11px] text-red-600">{{ erroCampo('solicitanteEmail') }}</span>
              </div>
            </div>
          </div>
          <div class="px-6 py-4 border-t border-stone-100 flex justify-end gap-2">
            <button (click)="novoAberto.set(false)" class="px-4 py-2 text-sm font-semibold text-stone-500 hover:text-stone-700">Cancelar</button>
            <button (click)="registrar()" [disabled]="salvando() || !form.assunto.trim()"
                    class="px-4 py-2 bg-[#E35205] hover:bg-[#c44503] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
              {{ salvando() ? 'Registrando...' : 'Registrar e gerar protocolo' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Aviso de protocolo gerado -->
    @if (aviso()) {
      <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-stone-900 text-white rounded-xl shadow-xl px-5 py-3 text-sm flex items-center gap-3">
        <span>{{ aviso() }}</span>
        <button (click)="aviso.set('')" class="opacity-60 hover:opacity-100">✕</button>
      </div>
    }
  `
})
export class OuvidoriaComponent {
  private api = inject(OuvidoriaService);
  private cliente = inject(ClienteService);
  private sessao = inject(SessaoService);
  private rota = inject(ActivatedRoute);
  private router = inject(Router);

  /** O que o CPF da manifestação aberta tem no SAC. */
  readonly cruzamento = signal<HistoricoCliente | null>(null);

  readonly status = STATUS_OUV;
  readonly tipos = TIPOS_OUV;

  readonly carregando = signal(false);
  readonly salvando = signal(false);
  readonly erro = signal('');
  readonly aviso = signal('');

  /* ---------- Lista (filtrada e paginada a partir do Firestore) ---------- */
  private static readonly POR_PAGINA = 10;
  readonly itens = signal<ResumoOuv[]>([]);
  readonly total = signal(0);
  readonly porStatus = signal<Partial<Record<StatusOuv, number>>>({});
  readonly totalGeral = computed(() => Object.values(this.porStatus()).reduce((a, b) => a + (b || 0), 0));
  readonly filtroStatus = signal<StatusOuv | null>(null);
  readonly buscaAplicada = signal('');
  busca = '';
  private readonly paginaAtual = signal(1);

  /** Mesmo formato do paginador do SAC, mas quem fatia é a API: trocar de página recarrega. */
  readonly pagina: Paginador<ResumoOuv> = (() => {
    const porPagina = OuvidoriaComponent.POR_PAGINA;
    const totalPaginas = computed(() => Math.max(1, Math.ceil(this.total() / porPagina)));
    const atual = computed(() => this.paginaAtual());
    return {
      porPagina,
      total: this.total,
      totalPaginas,
      atual,
      itens: this.itens,
      inicio: computed(() => this.total() ? (atual() - 1) * porPagina + 1 : 0),
      fim: computed(() => Math.min(atual() * porPagina, this.total())),
      paginasVisiveis: computed(() => {
        const ult = totalPaginas(), at = atual();
        const mostrar = new Set([1, ult, at - 1, at, at + 1]);
        const lista: number[] = [];
        for (let p = 1; p <= ult; p++) {
          if (!mostrar.has(p)) continue;
          if (lista.length && p - lista[lista.length - 1] > 1) lista.push(0);
          lista.push(p);
        }
        return lista;
      }),
      ir: (p: number) => { this.paginaAtual.set(Math.min(Math.max(1, p), totalPaginas())); this.carregar(); },
      reiniciar: () => this.paginaAtual.set(1)
    };
  })();

  constructor() {
    // primeira carga e cada atualização da coleção no Firestore
    effect(() => { this.api.versao(); untracked(() => this.carregar()); });
    // veio do "Histórico do cliente": /ouvidoria?protocolo=OUV-...
    this.rota.queryParamMap.pipe(takeUntilDestroyed()).subscribe(q => {
      const p = q.get('protocolo');
      if (p) { this.verDetalhe(p); this.router.navigate([], { queryParams: { protocolo: null }, queryParamsHandling: 'merge', replaceUrl: true }); }
    });
  }

  verCliente(cpf: string): void { this.fecharDetalhe(); this.cliente.abrirPainel(cpf); }
  fmtCpf(cpf: string): string { return formatarCpf(cpf); }

  @HostListener('document:keydown.escape')
  aoEsc(): void { this.fecharDetalhe(); this.novoAberto.set(false); }

  async carregar(): Promise<void> {
    this.carregando.set(true);
    try {
      const r = await this.api.listar({
        status: this.filtroStatus(), busca: this.buscaAplicada(), de: this.dataInicio, ate: this.dataFim,
        pagina: this.paginaAtual(), tamanho: OuvidoriaComponent.POR_PAGINA
      });
      this.itens.set(r.itens);
      this.total.set(r.total);
      this.porStatus.set(r.porStatus || {});
    } catch (e) {
      this.erro.set((e as ErroOuv).message);
    } finally {
      this.carregando.set(false);
    }
  }

  filtrar(s: StatusOuv | null): void {
    this.filtroStatus.set(this.filtroStatus() === s ? null : s);
    this.pagina.reiniciar();
    this.carregar();
  }

  buscar(): void {
    this.buscaAplicada.set(this.busca.trim());
    this.pagina.reiniciar();
    this.carregar();
  }

  /* ---------- Período (data de abertura) ---------- */
  dataInicio = '';
  dataFim = '';

  aplicarPeriodo(): void {
    this.pagina.reiniciar();
    this.carregar();
  }

  textoPeriodo(): string {
    const br = (d: string) => d.split('-').reverse().join('/');
    if (this.dataInicio && this.dataFim) return `de ${br(this.dataInicio)} a ${br(this.dataFim)}`;
    return this.dataInicio ? `desde ${br(this.dataInicio)}` : `até ${br(this.dataFim)}`;
  }

  /* ---------- Relatório em PDF ---------- */
  readonly exportando = signal(false);

  /** Exporta todas as manifestações do filtro atual (período, status e busca), não só a página visível. */
  async exportarPdf(): Promise<void> {
    this.exportando.set(true);
    this.erro.set('');
    try {
      await this.api.iniciar();
      const filtro = { status: this.filtroStatus(), busca: this.buscaAplicada(), de: this.dataInicio, ate: this.dataFim };
      const { exportarRelatorioOuvidoria } = await import('../../core/ouvidoria-relatorio');
      await exportarRelatorioOuvidoria(this.api.filtrados(filtro), { ...filtro, geradoPor: this.sessao.nomeUsuario() });
    } catch (e) {
      console.warn('Falha ao gerar o PDF:', (e as Error).message);
      this.erro.set('Não foi possível gerar o PDF agora. Tente de novo.');
    } finally {
      this.exportando.set(false);
    }
  }

  /* ---------- Detalhe / alterar status ---------- */
  readonly sel = signal<ChamadoOuv | null>(null);
  novoStatus: StatusOuv | null = null;
  observacao = '';

  /** A lista traz só o resumo; o detalhe (com histórico) vem do GET do protocolo. */
  async verDetalhe(protocolo: string): Promise<void> {
    this.erro.set('');
    try {
      this.abrirDetalhe(await this.api.consultar(protocolo));
    } catch (e) {
      this.erro.set((e as ErroOuv).message);
    }
  }

  abrirDetalhe(c: ChamadoOuv): void {
    this.novoStatus = c.status;
    this.observacao = '';
    this.sel.set(c);
    this.cruzamento.set(null);
    if (chaveCpf(c.solicitanteCpf)) this.cliente.historico(c.solicitanteCpf!).then(h => this.cruzamento.set(h)).catch(() => {});
  }
  fecharDetalhe(): void { this.sel.set(null); }

  async salvarStatus(c: ChamadoOuv): Promise<void> {
    if (!this.novoStatus) return;
    this.salvando.set(true);
    this.erro.set('');
    try {
      await this.api.alterarStatus(c.protocolo, this.novoStatus, this.observacao.trim());
      const atualizado = await this.api.consultar(c.protocolo);   // traz o histórico novo
      this.abrirDetalhe(atualizado);
      this.aviso.set(`Status de ${c.protocolo} alterado para "${atualizado.statusDescricao}".`);
      this.carregar();
    } catch (e) {
      this.erro.set((e as ErroOuv).message);
      this.fecharDetalhe();
    } finally {
      this.salvando.set(false);
    }
  }
  /* ---------- Registrar ---------- */
  readonly novoAberto = signal(false);
  readonly camposErro = signal<Record<string, string[]>>({});
  form: { assunto: string; descricao: string; tipo: TipoOuv | null; solicitanteNome: string; solicitanteEmail: string; solicitanteCpf: string } = this.formVazio();

  private formVazio() { return { assunto: '', descricao: '', tipo: null, solicitanteNome: '', solicitanteEmail: '', solicitanteCpf: '' }; }

  abrirNovo(): void {
    this.form = this.formVazio();
    this.camposErro.set({});
    this.novoAberto.set(true);
  }

  async registrar(): Promise<void> {
    this.salvando.set(true);
    this.camposErro.set({});
    this.erro.set('');
    const dados: NovoChamadoOuv = {
      assunto: this.form.assunto.trim(),
      descricao: this.form.descricao.trim() || null,
      tipo: this.form.tipo,
      solicitanteNome: this.form.solicitanteNome.trim() || null,
      solicitanteEmail: this.form.solicitanteEmail.trim() || null,
      solicitanteCpf: this.form.solicitanteCpf.trim() || null
    };
    try {
      const criado = await this.api.abrir(dados);
      this.novoAberto.set(false);
      this.aviso.set(`Protocolo ${criado.protocolo} gerado.`);
      this.abrirDetalhe(await this.api.consultar(criado.protocolo));
      this.carregar();
    } catch (e) {
      const err = e as ErroOuv;
      if (err.status === 400 && Object.keys(err.campos).length) this.camposErro.set(err.campos);
      else { this.novoAberto.set(false); this.erro.set(err.message); }
    } finally {
      this.salvando.set(false);
    }
  }

  erroCampo(campo: string): string { return this.camposErro()[campo]?.[0] ?? ''; }

  /* ---------- Rótulos ---------- */
  rotuloStatus(s: StatusOuv): string { return STATUS_OUV.find(x => x.valor === s)?.rotulo || s; }
  badgeStatus(s: StatusOuv): string { return STATUS_OUV.find(x => x.valor === s)?.badge || 'bg-stone-100 text-stone-600 border-stone-200'; }
  corStatus(s: StatusOuv): string { return STATUS_OUV.find(x => x.valor === s)?.cor || '#a8a29e'; }
  rotuloTipo(t: TipoOuv | null): string { return t ? (TIPOS_OUV.find(x => x.valor === t)?.rotulo || t) : '—'; }
}
