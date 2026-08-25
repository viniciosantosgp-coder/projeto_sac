import { Component, EventEmitter, Output, inject, signal, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChamadosService } from '../../core/chamados.service';
import { SessaoService } from '../../core/sessao.service';
import { SAC_CANAIS, SAC_CORES_GRAVIDADE, SAC_CORES_PRODUTO, SAC_GRAVIDADES, SAC_MOTIVOS, SAC_PRODUTOS } from '../../core/constantes';

@Component({
  selector: 'app-novo-chamado',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-6" (click)="fechar.emit()">
      <div class="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col" (click)="$event.stopPropagation()">
        <div class="px-6 py-5 border-b border-stone-100 flex items-center justify-between">
          <h3 class="text-xl font-bold text-stone-800">Novo chamado SAC</h3>
          <button (click)="fechar.emit()" class="text-stone-400 hover:text-stone-700 text-2xl leading-none">&times;</button>
        </div>

        <div class="px-6 py-5 overflow-y-auto flex-1">
          <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-2">Produto</label>
          <div class="flex flex-wrap gap-2 mb-5">
            @for (p of produtos; track p) {
              <button type="button" (click)="produto.set(p)"
                class="chip-filtro px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-colors"
                [class]="produto() === p ? coresProduto[p] + ' text-white border-transparent' : 'border-stone-200 text-stone-600 hover:border-stone-300'">{{ p }}</button>
            }
          </div>

          <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-2">Gravidade</label>
          <div class="flex flex-wrap gap-2 mb-5">
            @for (g of gravidades; track g) {
              <button type="button" (click)="gravidade.set(g)"
                class="chip-filtro px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-colors"
                [class]="gravidade() === g ? coresGravidade[g].chip + ' text-white' : 'border-stone-200 text-stone-600 hover:border-stone-300'">{{ g }}</button>
            }
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1">Canal</label>
              <select [(ngModel)]="canal" class="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm">
                @for (c of canais; track c) { <option [value]="c">{{ c }}</option> }
              </select>
            </div>
            <div>
              <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1">Motivo</label>
              <select [(ngModel)]="motivo" class="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm">
                @for (m of motivos; track m) { <option [value]="m">{{ m }}</option> }
              </select>
            </div>
            <div>
              <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1">CPF</label>
              <input [(ngModel)]="cpf" class="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm code-font">
            </div>
            <div>
              <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1">ID da proposta</label>
              <input [(ngModel)]="idProposta" class="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm code-font">
            </div>
          </div>

          <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1">Descrição</label>
          <textarea [(ngModel)]="descricao" rows="4" class="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm"></textarea>

          <p class="text-xs text-stone-400 mt-3">
            O chamado nasce como <b>Chamado aberto</b>, com prazo de SLA calculado pela gravidade e gravado no registro.
          </p>
          @if (erro()) { <p class="text-sm text-red-600 mt-3">{{ erro() }}</p> }
        </div>

        <div class="px-6 py-4 border-t border-stone-100 flex justify-end gap-2">
          <button (click)="fechar.emit()" class="px-4 py-2 text-sm font-semibold text-stone-500 hover:text-stone-700">Cancelar</button>
          <button (click)="salvar()" [disabled]="salvando()"
            class="px-4 py-2 bg-[#E35205] hover:bg-[#c44503] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60">
            {{ salvando() ? 'Registrando...' : 'Registrar chamado' }}
          </button>
        </div>
      </div>
    </div>
  `
})
export class NovoChamadoComponent {
  /** Esc fecha o modal — o clique fora já fechava. */
  @HostListener('document:keydown.escape')
  aoPressionarEsc(): void { this.fechar.emit(); }

  private chamados = inject(ChamadosService);
  readonly sessao = inject(SessaoService);

  @Output() fechar = new EventEmitter<void>();
  @Output() criado = new EventEmitter<number>();

  readonly produtos = SAC_PRODUTOS;
  readonly gravidades = SAC_GRAVIDADES;
  readonly motivos = SAC_MOTIVOS;
  readonly canais = SAC_CANAIS;
  readonly coresProduto = SAC_CORES_PRODUTO;
  readonly coresGravidade = SAC_CORES_GRAVIDADE;

  readonly produto = signal<string>('');
  readonly gravidade = signal<string>('');
  readonly erro = signal('');
  readonly salvando = signal(false);

  canal = SAC_CANAIS[0];
  motivo = SAC_MOTIVOS[0];
  cpf = '';
  idProposta = '';
  descricao = '';

  async salvar(): Promise<void> {
    if (!this.produto()) { this.erro.set('Selecione o produto.'); return; }
    if (!this.gravidade()) { this.erro.set('Selecione a gravidade.'); return; }
    if (!this.descricao.trim()) { this.erro.set('Descreva o que aconteceu antes de registrar o chamado.'); return; }

    this.salvando.set(true);
    this.erro.set('');
    try {
      const id = await this.chamados.criar({
        produto: this.produto(), canal: this.canal, categoria: this.motivo,
        gravidade: this.gravidade(), descricao: this.descricao.trim(),
        cpf: this.cpf.trim(), idProposta: this.idProposta.trim()
      });
      this.criado.emit(id);
    } catch (e) {
      this.erro.set('Erro ao registrar: ' + (e as Error).message);
    } finally {
      this.salvando.set(false);
    }
  }
}
