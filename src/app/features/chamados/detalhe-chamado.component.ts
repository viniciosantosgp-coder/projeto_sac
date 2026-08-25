import { Component, EventEmitter, Input, Output, computed, inject, signal, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Chamado, EventoStatus } from '../../core/modelos';
import { ChamadosService } from '../../core/chamados.service';
import {
  chamadoAberto, chamadoResolvido, classeBadgeSla, diasRestantesSla, responsavelDoChamado,
  slaDiasPara, slaVencimento, statusChamado, textoSla
} from '../../core/dominio';
import { SAC_CORES_GRAVIDADE, SAC_STATUS_CORES, SAC_STATUS_LABEL } from '../../core/constantes';

interface ItemHistorico { data: string; texto: string; original: boolean; }

@Component({
  selector: 'app-detalhe-chamado',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-6" (click)="fechar.emit()">
      <div class="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[92vh] flex flex-col" (click)="$event.stopPropagation()">
        <div class="px-6 py-5 border-b border-stone-100 flex items-center justify-between">
          <h3 class="text-xl font-bold text-stone-800 code-font">Chamado #{{ idFormatado() }}</h3>
          <button (click)="fechar.emit()" class="text-stone-400 hover:text-stone-700 text-2xl leading-none">&times;</button>
        </div>

        <div class="px-6 py-5 overflow-y-auto flex-1">
          <div class="flex flex-wrap gap-2 mb-4">
            <span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-stone-100 text-stone-600">{{ chamado.produto }}</span>
            <span class="text-xs font-semibold px-2.5 py-1 rounded-full border" [class]="corGravidade()">{{ chamado.gravidade }}</span>
            <span class="text-xs font-semibold px-2.5 py-1 rounded-full border" [class]="corStatus()">
              {{ resolvido() ? '✓ ' : '' }}{{ rotulo() }}
            </span>
            @if (aberto()) {
              <span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-600 text-white">Aguardando tratativa</span>
            }
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-5">
            <div><span class="text-stone-400">Canal:</span> <span class="font-semibold text-stone-700">{{ chamado.canal || '—' }}</span></div>
            <div><span class="text-stone-400">Motivo:</span> <span class="font-semibold text-stone-700">{{ chamado.categoria || '—' }}</span></div>
            <div><span class="text-stone-400">Registrado por:</span> <span class="font-semibold text-stone-700">{{ chamado.atendente || '—' }}</span></div>
            <div><span class="text-stone-400">Aberto em:</span> <span class="font-semibold text-stone-700 code-font">{{ chamado.criadoEm | date:'dd/MM/yyyy HH:mm' }}</span></div>
            <div><span class="text-stone-400">CPF:</span> <span class="font-semibold text-stone-700 code-font">{{ chamado.cpf || '—' }}</span></div>
            <div><span class="text-stone-400">ID da Proposta:</span> <span class="font-semibold text-stone-700 code-font">{{ chamado.idProposta || '—' }}</span></div>
            <div><span class="text-stone-400">Prazo (SLA):</span> <span class="font-semibold text-stone-700 code-font">{{ prazo() }} dia(s) · {{ chamado.gravidade || '—' }}</span></div>
            <div><span class="text-stone-400">Vence em:</span> <span class="font-semibold text-stone-700 code-font">{{ vencimento() ? (vencimento() | date:'dd/MM/yyyy HH:mm') : '—' }}</span></div>
            <div><span class="text-stone-400">Situação do SLA:</span> <span class="font-semibold" [class]="corSla()">{{ situacaoSla() }}</span></div>
            <div><span class="text-stone-400">Em tratativa com:</span> <span class="font-semibold text-stone-700">{{ responsavel() }}</span></div>
            <div class="sm:col-span-2"><span class="text-stone-400">Início da tratativa:</span>
              <span class="font-semibold text-stone-700 code-font">{{ inicioTratativa() }}</span></div>
          </div>

          <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1.5">Histórico de status (gravado)</label>
          <div class="bg-stone-50 border border-stone-200 rounded-lg p-3 text-sm mb-5 max-h-40 overflow-y-auto">
            @if (historico().length === 0) {
              <p class="text-sm text-stone-400 italic">Sem histórico gravado para este chamado.</p>
            } @else {
              @for (ev of historico(); track $index) {
                <div class="flex items-start gap-2 py-1 border-b border-stone-100 last:border-0 flex-wrap">
                  <span class="code-font text-[11px] text-stone-400 shrink-0 w-[130px]">{{ ev.em ? (ev.em | date:'dd/MM/yyyy HH:mm') : '—' }}</span>
                  <span class="text-xs text-stone-500">{{ rotuloEvento(ev.de) }} →</span>
                  <span class="text-xs font-bold" [class]="corEvento(ev.para)">{{ rotuloEvento(ev.para) }}</span>
                  <span class="text-xs text-stone-400 ml-auto text-right">{{ ev.por || '—' }}{{ ev.origem && ev.origem !== 'app' ? ' · ' + ev.origem : '' }}</span>
                </div>
              }
            }
          </div>

          <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1.5">Descrição e histórico de observações</label>
          <div class="bg-stone-50 border border-stone-200 rounded-lg p-3 text-sm text-stone-700 mb-5 max-h-48 overflow-y-auto">
            @if (linhasDescricao().length === 0) {
              <p class="text-sm text-stone-400 italic">Sem descrição registrada.</p>
            } @else {
              <div class="relative border-l-2 border-stone-200 ml-1.5 pl-5 space-y-0.5">
                @for (item of linhasDescricao(); track $index) {
                  <div>
                    <div class="relative h-4 flex items-center">
                      <span class="absolute -left-[25px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ring-2 ring-white"
                            [class]="item.original ? 'bg-stone-400' : 'bg-blue-500'"></span>
                      <p class="text-[11px] font-bold text-stone-400 uppercase tracking-wide">
                        {{ item.original ? 'Descrição original · ' + item.data : item.data }}
                      </p>
                    </div>
                    <p class="text-sm text-stone-700 mt-0.5">{{ item.texto }}</p>
                  </div>
                }
              </div>
            }
          </div>

          <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1.5">Adicionar observação</label>
          <textarea [(ngModel)]="novaObs" rows="3" class="w-full border border-blue-300 rounded-lg px-3 py-2.5 text-sm mb-2 focus:border-blue-400 outline-none"></textarea>
          @if (aviso()) { <p class="text-sm mb-2" [class]="avisoErro() ? 'text-red-600' : 'text-green-600'">{{ aviso() }}</p> }
          <button (click)="adicionarObservacao()" [disabled]="salvando()"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60">
            {{ salvando() ? 'Salvando...' : 'Adicionar observação' }}
          </button>
        </div>

        <div class="px-6 py-4 border-t border-stone-100 flex justify-between items-center gap-2 flex-wrap">
          <div class="flex items-center gap-2">
            @if (aberto()) {
              <button (click)="mover('Pendente')" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors">Iniciar tratativa</button>
            }
            <button (click)="mover(resolvido() ? 'Pendente' : 'Resolvida')"
              class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors">
              {{ resolvido() ? 'Reabrir chamado' : 'Marcar como resolvida' }}
            </button>
          </div>
          <button (click)="fechar.emit()" class="px-4 py-2 text-sm font-semibold text-stone-500 hover:text-stone-700">Fechar</button>
        </div>
      </div>
    </div>
  `
})
export class DetalheChamadoComponent {
  /** Esc fecha o modal — o clique fora já fechava. */
  @HostListener('document:keydown.escape')
  aoPressionarEsc(): void { this.fechar.emit(); }

  private servico = inject(ChamadosService);

  @Input({ required: true }) chamado!: Chamado;
  @Output() fechar = new EventEmitter<void>();
  @Output() atualizado = new EventEmitter<void>();

  novaObs = '';
  readonly aviso = signal('');
  readonly avisoErro = signal(false);
  readonly salvando = signal(false);

  readonly idFormatado = () => String(this.chamado.id).padStart(4, '0');
  readonly resolvido = () => chamadoResolvido(this.chamado);
  readonly aberto = () => chamadoAberto(this.chamado);
  readonly rotulo = () => SAC_STATUS_LABEL[statusChamado(this.chamado)];
  readonly prazo = () => slaDiasPara(this.chamado);
  readonly vencimento = () => slaVencimento(this.chamado);
  readonly historico = () => (this.chamado.historicoStatus ?? []) as EventoStatus[];
  readonly responsavel = () => {
    const r = responsavelDoChamado(this.chamado);
    if (r) return r + (r !== (this.chamado.atendente || '') ? ` (registrado por ${this.chamado.atendente || '—'})` : '');
    return this.aberto() ? 'ninguém — chamado aberto' : 'não registrado';
  };
  readonly inicioTratativa = () => this.chamado.tratativaIniciadaEm
    ? new Date(this.chamado.tratativaIniciadaEm).toLocaleString('pt-BR') + (this.chamado.tratativaPor ? ' · ' + this.chamado.tratativaPor : '')
    : (this.aberto() ? 'ainda não iniciada' : 'não registrada (chamado anterior ao controle)');

  readonly corGravidade = () => (SAC_CORES_GRAVIDADE[this.chamado.gravidade]?.badge) || 'bg-stone-100 text-stone-500 border-stone-200';
  readonly corStatus = () => SAC_STATUS_CORES[statusChamado(this.chamado)].badge;
  readonly situacaoSla = () => {
    const t = textoSla(this.chamado, true);
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  readonly corSla = () => {
    const rest = diasRestantesSla(this.chamado);
    if (classeBadgeSla(this.chamado).includes('red')) return 'text-red-600';
    if (!this.resolvido() && rest != null && rest <= 1) return 'text-amber-600';
    return 'text-green-700';
  };

  readonly linhasDescricao = computed<ItemHistorico[]>(() => {
    const partes = String(this.chamado.descricao || '').split(/\n\n+/).filter(p => p.trim());
    const regex = /^(\d{2}\/\d{2}\/\d{4})\s*-\s*([\s\S]*)$/;
    return partes.map((parte, i) => {
      const m = parte.match(regex);
      if (i === 0 && !m) return { data: new Date(this.chamado.criadoEm).toLocaleDateString('pt-BR'), texto: parte.trim(), original: true };
      if (m) return { data: m[1], texto: m[2].trim(), original: false };
      return { data: '', texto: parte.trim(), original: false };
    });
  });

  rotuloEvento(estado: string): string { return SAC_STATUS_LABEL[estado] || estado || 'registro'; }
  corEvento(estado: string): string { return SAC_STATUS_CORES[estado]?.texto || 'text-stone-600'; }

  async mover(novo: 'Pendente' | 'Resolvida'): Promise<void> {
    await this.servico.alterarStatus(this.chamado.id, novo);
    this.atualizado.emit();
    this.fechar.emit();
  }

  async adicionarObservacao(): Promise<void> {
    const texto = this.novaObs.trim();
    if (!texto) { this.avisoErro.set(true); this.aviso.set('Descreva a observação.'); return; }
    this.salvando.set(true);
    try {
      const { moveuParaTratativa } = await this.servico.adicionarObservacao(this.chamado.id, texto);
      this.avisoErro.set(false);
      this.aviso.set('Observação adicionada ✓' + (moveuParaTratativa ? ' — chamado movido para "Em tratativa".' : ''));
      this.novaObs = '';
      const atualizado = this.servico.buscarPorId(this.chamado.id);
      if (atualizado) this.chamado = atualizado;
      this.atualizado.emit();
    } catch (e) {
      this.avisoErro.set(true);
      this.aviso.set('Erro ao salvar: ' + (e as Error).message);
    } finally {
      this.salvando.set(false);
    }
  }
}
