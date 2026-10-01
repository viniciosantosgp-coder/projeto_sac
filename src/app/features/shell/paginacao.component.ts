import { Component, Input } from '@angular/core';
import { Paginador } from '../../core/paginacao';

/**
 * Menu "Mostrando 1–20 de N · ‹ Anterior 1 2 … N Próxima ›".
 * Uso: <app-paginacao [paginador]="meuPaginador" rotulo="chamado(s)" ancora="id-do-titulo" />
 * Só aparece quando há mais de uma página.
 */
@Component({
  selector: 'app-paginacao',
  standalone: true,
  template: `
    @if (paginador.totalPaginas() > 1) {
      <div class="flex items-center justify-between flex-wrap gap-3 px-4 py-3" [class]="classeExtra">
        <span class="text-xs text-stone-500">
          Mostrando <b class="text-stone-700">{{ paginador.inicio() }}–{{ paginador.fim() }}</b> de <b class="text-stone-700">{{ paginador.total() }}</b> {{ rotulo }}
        </span>
        <div class="flex items-center gap-1">
          <button (click)="ir(paginador.atual() - 1)" [disabled]="paginador.atual() === 1"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-stone-600 hover:bg-white border border-transparent hover:border-stone-200 disabled:opacity-40 disabled:pointer-events-none">‹ Anterior</button>
          @for (p of paginador.paginasVisiveis(); track $index) {
            @if (p === 0) {
              <span class="px-1.5 text-xs text-stone-400 select-none">…</span>
            } @else {
              <button (click)="ir(p)"
                      class="min-w-[32px] px-2 py-1.5 rounded-lg text-xs font-semibold code-font border transition-colors"
                      [class]="p === paginador.atual() ? 'bg-[#E35205] text-white border-[#E35205]' : 'text-stone-600 border-transparent hover:bg-white hover:border-stone-200'">{{ p }}</button>
            }
          }
          <button (click)="ir(paginador.atual() + 1)" [disabled]="paginador.atual() === paginador.totalPaginas()"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-stone-600 hover:bg-white border border-transparent hover:border-stone-200 disabled:opacity-40 disabled:pointer-events-none">Próxima ›</button>
        </div>
      </div>
    }
  `
})
export class PaginacaoComponent {
  @Input({ required: true }) paginador!: Paginador<unknown>;
  @Input() rotulo = 'registro(s)';
  /** id do título da lista: ao trocar de página a tela rola até ele. */
  @Input() ancora = '';
  /** Classes de fundo/borda conforme onde o menu está encaixado. */
  @Input() classeExtra = '';

  ir(p: number): void {
    this.paginador.ir(p);
    if (this.ancora) document.getElementById(this.ancora)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
