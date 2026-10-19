import { Component, HostListener, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { ClienteService, HistoricoCliente, OUV_EM_ABERTO } from '../../core/cliente.service';
import { Chamado } from '../../core/modelos';
import { ResumoOuv, STATUS_OUV, TIPOS_OUV } from '../../core/ouvidoria.service';
import { classeBadgeSla, rotuloStatus, statusChamado, textoBadgeSla } from '../../core/dominio';
import { SAC_STATUS_CORES } from '../../core/constantes';
import { chaveCpf, cpfValido, formatarCpf } from '../../core/cpf';
import { DetalheChamadoComponent } from '../chamados/detalhe-chamado.component';

/** Item da linha do tempo: chamado do SAC ou manifestação da Ouvidoria. */
type Item =
  | { origem: 'sac'; data: string; aberto: boolean; chamado: Chamado }
  | { origem: 'ouv'; data: string; aberto: boolean; manifestacao: ResumoOuv };

/**
 * Painel lateral "Histórico do cliente": tudo o que o CPF tem no SAC e na Ouvidoria,
 * numa linha do tempo só. Aberto pela busca do cabeçalho ou pelos avisos dos detalhes.
 */
@Component({
  selector: 'app-historico-cliente',
  standalone: true,
  imports: [FormsModule, DatePipe, DetalheChamadoComponent],
  template: `
    @if (cliente.painelAberto()) {
      <div class="fixed inset-0 bg-black/30 z-[45] flex justify-end" (click)="cliente.fecharPainel()">
        <aside class="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col anima-entrada" (click)="$event.stopPropagation()">
          <div class="px-5 py-4 border-b border-stone-100">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-lg font-bold text-stone-800">Histórico do cliente</h3>
              <button (click)="cliente.fecharPainel()" class="text-stone-400 hover:text-stone-700 text-2xl leading-none">&times;</button>
            </div>
            <div class="flex items-center gap-2">
              <input [(ngModel)]="campo" (keydown.enter)="buscar()" type="text" inputmode="numeric" placeholder="CPF do cliente"
                     class="flex-1 border rounded-lg px-3 py-2 text-sm code-font" [class]="erroCampo() ? 'border-red-400' : 'border-stone-200'">
              <button (click)="buscar()" class="px-4 py-2 bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-sm font-semibold">Buscar</button>
            </div>
            @if (erroCampo()) { <p class="text-[11px] text-red-600 mt-1">{{ erroCampo() }}</p> }
          </div>

          <div class="flex-1 overflow-y-auto px-5 py-4">
            @if (!cliente.cpfPainel()) {
              <p class="text-sm text-stone-400 text-center py-10">Digite o CPF para ver os chamados do SAC e as manifestações da Ouvidoria do cliente.</p>
            } @else if (carregando()) {
              <p class="text-sm text-stone-400 text-center py-10">Buscando o histórico...</p>
            } @else {
              @if (hist(); as h) {
              <p class="text-xs text-stone-400 uppercase font-bold tracking-wider">CPF</p>
              <p class="text-xl font-bold text-stone-800 code-font mb-4">{{ fmt(h.cpf) }}</p>

              <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="border border-stone-200 rounded-xl p-3">
                  <p class="text-[11px] font-bold uppercase tracking-wider text-[#E35205]">SAC</p>
                  <p class="text-2xl font-bold code-font text-stone-800 leading-tight">{{ h.sac.length }}</p>
                  <p class="text-xs text-stone-500">chamado(s) · {{ h.sacAbertos }} em aberto</p>
                </div>
                <div class="border border-stone-200 rounded-xl p-3">
                  <p class="text-[11px] font-bold uppercase tracking-wider text-violet-700">Ouvidoria</p>
                  <p class="text-2xl font-bold code-font text-stone-800 leading-tight">{{ h.ouvidoria.length }}</p>
                  <p class="text-xs text-stone-500">manifestação(ões) · {{ h.ouvidoriaAbertos }} em aberto</p>
                </div>
              </div>

              @if (h.sac.length && h.ouvidoria.length) {
                <div class="bg-violet-50 border border-violet-200 text-violet-800 rounded-xl px-4 py-2.5 text-sm mb-4">
                  Cliente com registro <b>no SAC e na Ouvidoria</b>.
                  @if (h.sacAbertos && !h.ouvidoriaAbertos) { O chamado do SAC segue aberto, e a Ouvidoria já tratou. }
                  @if (h.ouvidoriaAbertos) { Há manifestação da Ouvidoria ainda em aberto. }
                </div>
              }

              @if (!itens().length) {
                <p class="text-sm text-stone-400 text-center py-8 bg-stone-50 border border-stone-200 rounded-xl">Nenhum registro deste CPF no SAC nem na Ouvidoria.</p>
              } @else {
                <p class="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Linha do tempo</p>
                <ol class="space-y-2">
                  @for (i of itens(); track $index) {
                    <li (click)="abrir(i)" class="cursor-pointer border border-stone-200 border-l-4 rounded-xl p-3 hover:bg-stone-50"
                        [class]="i.origem === 'sac' ? 'border-l-[#E35205]' : 'border-l-violet-500'">
                      @if (i.origem === 'sac') {
                        <div class="flex items-center gap-2 flex-wrap mb-1">
                          <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-orange-50 text-[#E35205] border border-orange-200">SAC</span>
                          <span class="code-font text-xs font-bold text-stone-500">#{{ i.chamado.id }}</span>
                          <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border" [class]="corSac(i.chamado)">{{ rotuloSac(i.chamado) }}</span>
                          @if (i.aberto) { <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border" [class]="slaClasse(i.chamado)">{{ slaTexto(i.chamado) }}</span> }
                          <span class="ml-auto text-[11px] text-stone-400 code-font">{{ i.data | date:'dd/MM/yyyy HH:mm' }}</span>
                        </div>
                        <p class="text-sm text-stone-700 truncate">{{ i.chamado.produto }} · {{ i.chamado.categoria || '—' }}</p>
                        <p class="text-xs text-stone-400 truncate">{{ i.chamado.canal }} · {{ i.chamado.atendente }}</p>
                      } @else {
                        <div class="flex items-center gap-2 flex-wrap mb-1">
                          <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">Ouvidoria</span>
                          <span class="code-font text-xs font-bold text-stone-500">{{ i.manifestacao.protocolo }}</span>
                          <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border" [class]="corOuv(i.manifestacao)">{{ i.manifestacao.statusDescricao }}</span>
                          <span class="ml-auto text-[11px] text-stone-400 code-font">{{ i.data | date:'dd/MM/yyyy HH:mm' }}</span>
                        </div>
                        <p class="text-sm text-stone-700 truncate">{{ tipoOuv(i.manifestacao) }} · {{ i.manifestacao.assunto }}</p>
                        @if (i.manifestacao.solicitanteNome) { <p class="text-xs text-stone-400 truncate">{{ i.manifestacao.solicitanteNome }}</p> }
                      }
                    </li>
                  }
                </ol>
              }
              }
            }
          </div>
        </aside>
      </div>
    }

    @if (detalhe(); as d) {
      <app-detalhe-chamado [chamado]="d" (fechar)="detalhe.set(null)" (atualizado)="recarregar()" />
    }
  `
})
export class HistoricoClienteComponent {
  readonly cliente = inject(ClienteService);
  private router = inject(Router);

  campo = '';
  readonly erroCampo = signal('');
  readonly carregando = signal(false);
  readonly hist = signal<HistoricoCliente | null>(null);
  readonly detalhe = signal<Chamado | null>(null);

  readonly itens = computed<Item[]>(() => {
    const h = this.hist();
    if (!h) return [];
    const lista: Item[] = [
      ...h.sac.map(c => ({ origem: 'sac' as const, data: c.criadoEm, aberto: statusChamado(c) !== 'Resolvida', chamado: c })),
      ...h.ouvidoria.map(m => ({ origem: 'ouv' as const, data: m.criadoEm, aberto: OUV_EM_ABERTO.includes(m.status), manifestacao: m }))
    ];
    return lista.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  });

  constructor() {
    // abriu o painel com um CPF (cabeçalho ou aviso de um detalhe): busca na hora
    effect(() => {
      const cpf = this.cliente.cpfPainel();
      if (!this.cliente.painelAberto()) return;
      untracked(() => {
        if (chaveCpf(this.campo) !== cpf) { this.campo = cpf ? formatarCpf(cpf) : ''; this.erroCampo.set(''); }
        this.recarregar();
      });
    });
  }

  @HostListener('document:keydown.escape')
  aoEsc(): void { if (!this.detalhe()) this.cliente.fecharPainel(); }

  buscar(): void {
    const chave = chaveCpf(this.campo);
    if (!chave) { this.erroCampo.set('Digite os 11 dígitos do CPF.'); return; }
    this.erroCampo.set(cpfValido(chave) ? '' : 'Atenção: esse CPF não passa na conferência dos dígitos. Buscando mesmo assim.');
    this.cliente.abrirPainel(chave);
  }

  async recarregar(): Promise<void> {
    const cpf = this.cliente.cpfPainel();
    if (!cpf) { this.hist.set(null); return; }
    this.carregando.set(true);
    try { this.hist.set(await this.cliente.historico(cpf)); }
    finally { this.carregando.set(false); }
  }

  abrir(i: Item): void {
    if (i.origem === 'sac') { this.detalhe.set(i.chamado); return; }
    this.cliente.fecharPainel();
    this.router.navigate(['/ouvidoria'], { queryParams: { protocolo: i.manifestacao.protocolo } });
  }

  fmt(cpf: string): string { return formatarCpf(cpf); }
  rotuloSac(c: Chamado): string { return rotuloStatus(c); }
  corSac(c: Chamado): string { return SAC_STATUS_CORES[statusChamado(c)]?.badge || ''; }
  slaClasse(c: Chamado): string { return classeBadgeSla(c); }
  slaTexto(c: Chamado): string { return textoBadgeSla(c); }
  corOuv(m: ResumoOuv): string { return STATUS_OUV.find(s => s.valor === m.status)?.badge || ''; }
  tipoOuv(m: ResumoOuv): string { return m.tipo ? (TIPOS_OUV.find(t => t.valor === m.tipo)?.rotulo || m.tipo) : 'Manifestação'; }
}
