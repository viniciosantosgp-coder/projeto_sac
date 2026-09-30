import { Component, EventEmitter, HostListener, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Nota, NotasService } from '../../core/notas.service';
import { SessaoService } from '../../core/sessao.service';

@Component({
  selector: 'app-notas-painel',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex justify-end" (click)="fechar.emit()">
      <div class="bg-white w-full max-w-md h-full flex flex-col shadow-xl" (click)="$event.stopPropagation()">
        <div class="px-6 py-5 border-b border-stone-100 flex items-center justify-between shrink-0">
          <div>
            <h3 class="text-xl font-bold text-stone-800">Minhas notas</h3>
            <p class="text-xs text-stone-400 mt-0.5">Anotações pessoais de {{ sessao.nomeUsuario() }} — só você vê o que está aqui.</p>
          </div>
          <button (click)="fechar.emit()" class="text-stone-400 hover:text-stone-700 text-2xl leading-none">&times;</button>
        </div>

        <div class="px-6 py-4 border-b border-stone-100 shrink-0">
          <textarea [(ngModel)]="novaNota" rows="3" placeholder="Escreva uma anotação..."
                    class="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm resize-none"></textarea>
          <div class="flex items-center justify-between mt-2 gap-3">
            @if (erro()) { <span class="text-xs text-red-600">{{ erro() }}</span> } @else { <span></span> }
            <button (click)="adicionar()" [disabled]="salvando() || !novaNota.trim()"
                    class="px-4 py-2 bg-[#E35205] hover:bg-[#c44503] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 shrink-0">
              {{ salvando() ? 'Salvando...' : 'Adicionar nota' }}
            </button>
          </div>
        </div>

        <div class="px-6 py-4 overflow-y-auto flex-1 space-y-3">
          @if (carregando()) {
            <p class="text-sm text-stone-400 text-center py-6">Carregando notas...</p>
          } @else if (notasVisiveis().length === 0) {
            <p class="text-sm text-stone-400 text-center py-6">Nenhuma nota ainda — a primeira anotação aparece aqui.</p>
          } @else {
            @for (n of notasVisiveis(); track n.id) {
              <div class="bg-stone-50 border border-stone-200 rounded-xl p-4">
                @if (n.protegida) {
                  <div class="flex items-center gap-2 text-sm text-stone-500 italic">
                    <span>🔒</span>
                    <span>Nota antiga protegida por senha — esse recurso foi descontinuado, o conteúdo não pode mais ser recuperado por aqui.</span>
                  </div>
                  <div class="flex items-center justify-between mt-2.5">
                    <span class="text-[11px] text-stone-400">{{ n.criadoEm | date:'dd/MM/yyyy HH:mm' }}</span>
                    <button (click)="excluir(n)" class="text-[11px] font-semibold text-stone-400 hover:text-red-600">Excluir</button>
                  </div>
                } @else if (editandoId() === n.id) {
                  <textarea [(ngModel)]="textoEdicao" rows="3"
                            class="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm resize-none mb-2 bg-white"></textarea>
                  <div class="flex justify-end gap-2">
                    <button (click)="cancelarEdicao()" class="px-3 py-1.5 text-xs font-semibold text-stone-500 hover:text-stone-700">Cancelar</button>
                    <button (click)="salvarEdicao(n)" [disabled]="!textoEdicao.trim()"
                            class="px-3 py-1.5 bg-[#E35205] hover:bg-[#c44503] text-white rounded-lg text-xs font-semibold disabled:opacity-50">Salvar</button>
                  </div>
                } @else {
                  <p class="text-sm text-stone-700 whitespace-pre-wrap">{{ n.texto }}</p>
                  <div class="flex items-center justify-between mt-2.5">
                    <span class="text-[11px] text-stone-400">
                      {{ n.criadoEm | date:'dd/MM/yyyy HH:mm' }}
                      @if (n.atualizadoEm) { <span> · editado</span> }
                    </span>
                    <div class="flex items-center gap-3">
                      <button (click)="iniciarEdicao(n)" class="text-[11px] font-semibold text-blue-600 hover:text-blue-800">Editar</button>
                      <button (click)="excluir(n)" class="text-[11px] font-semibold text-stone-400 hover:text-red-600">Excluir</button>
                    </div>
                  </div>
                }
              </div>
            }
          }
        </div>
      </div>
    </div>
  `
})
export class NotasPainelComponent {
  private servico = inject(NotasService);
  readonly sessao = inject(SessaoService);
  @Output() fechar = new EventEmitter<void>();

  readonly notas = this.servico.notas;
  /** A coleção guarda as notas de todo mundo; cada um só enxerga as próprias. */
  readonly notasVisiveis = computed(() => {
    const eu = this.sessao.nomeUsuario();
    return this.notas().filter(n => n.criadoPor === eu);
  });

  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly erro = signal('');
  novaNota = '';
  readonly editandoId = signal<string | null>(null);
  textoEdicao = '';

  constructor() {
    this.servico.carregar().finally(() => this.carregando.set(false));
  }

  @HostListener('document:keydown.escape')
  aoPressionarEsc(): void { this.fechar.emit(); }

  async adicionar(): Promise<void> {
    const texto = this.novaNota.trim();
    if (!texto) return;
    this.salvando.set(true);
    this.erro.set('');
    try {
      await this.servico.criar({ texto });
      this.novaNota = '';
    } catch (e) {
      this.erro.set(this.mensagemErro(e));
    } finally {
      this.salvando.set(false);
    }
  }

  iniciarEdicao(n: Nota): void {
    this.editandoId.set(n.id);
    this.textoEdicao = n.texto;
    this.erro.set('');
  }

  cancelarEdicao(): void {
    this.editandoId.set(null);
    this.textoEdicao = '';
  }

  async salvarEdicao(n: Nota): Promise<void> {
    const texto = this.textoEdicao.trim();
    if (!texto) return;
    try {
      await this.servico.atualizar(n.id, { texto });
      this.cancelarEdicao();
    } catch (e) {
      this.erro.set(this.mensagemErro(e));
    }
  }

  async excluir(n: Nota): Promise<void> {
    this.erro.set('');
    try {
      await this.servico.excluir(n.id);
    } catch (e) {
      this.erro.set(this.mensagemErro(e));
    }
  }

  private mensagemErro(e: unknown): string {
    const msg = (e as Error)?.message || '';
    return /permission|insufficient/i.test(msg)
      ? 'Sem permissão para salvar notas ainda — fale com quem administra o Firebase.'
      : 'Erro ao salvar: ' + (msg || 'tente novamente.');
  }
}
