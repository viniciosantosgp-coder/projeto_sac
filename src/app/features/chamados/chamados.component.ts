import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ChamadosService } from '../../core/chamados.service';
import { SessaoService } from '../../core/sessao.service';
import { Chamado } from '../../core/modelos';
import {
  chamadoAberto, chamadoResolvido, classeBadgeSla, diasRestantesSla, idadeDiasSac,
  responsavelDoChamado, rotuloStatus, slaEstourado, statusChamado, textoBadgeSla, textoSla, slaDiasPara
} from '../../core/dominio';
import { SAC_CORES_GRAVIDADE, SAC_PRODUTOS, SAC_STATUS_CORES } from '../../core/constantes';
import { NovoChamadoComponent } from './novo-chamado.component';
import { DetalheChamadoComponent } from './detalhe-chamado.component';

type ChaveFiltro = '' | 'abertos' | 'tratativa' | 'sla' | 'resolvidos';

interface CardFiltro {
  chave: ChaveFiltro; rotulo: string; valor: number; cor: string; corValor: string; dica: string; sub?: string;
}

@Component({
  selector: 'app-chamados',
  standalone: true,
  imports: [FormsModule, DatePipe, NovoChamadoComponent, DetalheChamadoComponent],
  template: `
    <div class="flex items-center justify-between flex-wrap gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-extrabold text-stone-900 tracking-tight">Chamados SAC</h1>
        <p class="text-stone-500 text-sm mt-1">Registro e acompanhamento de reclamações — FGTS, Consignado Privado, INSS, SIAPE, Convênios, Pacote de Benefícios.</p>
      </div>
      <button (click)="modalNovo.set(true)" class="inline-flex items-center gap-2 px-4 py-2 bg-[#E35205] hover:bg-[#c44503] text-white rounded-lg text-sm font-semibold transition-colors">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"/></svg>
        Novo chamado
      </button>
    </div>

    <!-- Filtros -->
    <div class="flex flex-wrap items-end gap-3 mb-6">
      <div>
        <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1">Período</label>
        <div class="campo-periodo flex items-stretch bg-white border border-stone-200 rounded-lg overflow-hidden">
          <div class="px-3 py-1.5">
            <span class="block text-[10px] font-bold text-stone-400 uppercase tracking-wider leading-none mb-0.5">Início</span>
            <input type="date" [(ngModel)]="dataInicio" class="text-sm code-font">
          </div>
          <div class="self-center text-stone-300 select-none px-0.5">→</div>
          <div class="px-3 py-1.5">
            <span class="block text-[10px] font-bold text-stone-400 uppercase tracking-wider leading-none mb-0.5">Fim</span>
            <input type="date" [(ngModel)]="dataFim" class="text-sm code-font">
          </div>
        </div>
      </div>
      <div>
        <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1">Produto</label>
        <select [(ngModel)]="produto" class="border border-stone-200 rounded-lg px-3 py-2 text-sm min-w-[160px]">
          <option value="">Todos os produtos</option>
          @for (p of produtos; track p) { <option [value]="p">{{ p }}</option> }
        </select>
      </div>
      <div>
        <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1">Status</label>
        <select [(ngModel)]="status" class="border border-stone-200 rounded-lg px-3 py-2 text-sm min-w-[140px]">
          <option value="">Todos</option>
          <option value="Aberto">Chamado aberto</option>
          <option value="Pendente">Em tratativa</option>
          <option value="Resolvida">Resolvida</option>
          <option value="__naoResolvidos">Em andamento (aberto + tratativa)</option>
        </select>
      </div>
      <button (click)="recarregar()" class="px-5 py-2 bg-[#E35205] text-white rounded-lg text-sm font-semibold hover:bg-[#c44503] transition-colors">Aplicar filtro</button>

      <div class="w-full sm:w-auto sm:ml-auto">
        <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1">Buscar registro</label>
        <div class="flex items-center gap-2">
          <div class="relative flex-1 sm:flex-none">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" width="15" height="15" fill="currentColor" viewBox="0 0 256 256"><path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/></svg>
            <input [(ngModel)]="busca" (keydown.enter)="recarregar()" type="text" placeholder="CPF ou ID do chamado"
                   class="border border-stone-200 rounded-lg pl-9 pr-3 py-2 text-sm code-font w-full sm:min-w-[220px]">
          </div>
          <button (click)="recarregar()" class="px-4 py-2 bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-sm font-semibold transition-colors">Buscar</button>
        </div>
      </div>
    </div>

    @if (carregando()) {
      <div class="flex items-center gap-2 text-stone-400 text-sm">
        <svg class="spin" width="14" height="14" fill="currentColor" viewBox="0 0 256 256"><path d="M232,128a104,104,0,0,1-208,0c0-41,23.81-78.36,60.66-95.27a8,8,0,0,1,6.68,14.54C60.15,61.59,40,93.27,40,128a88,88,0,0,0,176,0c0-34.73-20.15-66.41-51.34-80.73a8,8,0,0,1,6.68-14.54C215.19,49.64,232,87,232,128Z"/></svg>
        Carregando chamados...
      </div>
    } @else {

      @if (servico.normalizadosNaSessao() > 0) {
        <div class="flex items-center gap-3 bg-stone-100 border border-stone-200 text-stone-600 rounded-xl px-4 py-2.5 mb-4 text-xs">
          <b>{{ servico.normalizadosNaSessao() }}</b> chamado(s) antigo(s) foram atualizados no banco com status explícito, prazo de SLA e histórico inicial.
        </div>
      }

      @if (busca.trim()) {
        <div class="flex items-center gap-3 flex-wrap bg-blue-50 border border-blue-200 text-blue-800 rounded-xl px-4 py-3 mb-6">
          <span class="text-sm flex-1">Busca por <b class="code-font">{{ busca }}</b> — <b>{{ filtrados().length }}</b> registro(s) encontrado(s). Os filtros de data, produto e status foram ignorados nesta busca.</span>
          <button (click)="limparBusca()" class="px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors">Limpar busca</button>
        </div>
      }

      <!-- Cards que também filtram a lista -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        @for (c of cards(); track c.chave) {
          <div (click)="alternarFiltro(c.chave)"
               [style.--kpi-cor]="c.cor"
               [style.background-image]="'radial-gradient(150% 130% at 100% 0%, ' + c.cor + '1f 0%, transparent 48%)'"
               class="card kpi kpi-filtro bg-white border border-stone-200 rounded-xl p-4 anima-entrada"
               [class.ativo]="ativo(c.chave)">
            <p class="kpi-rotulo text-stone-400 uppercase font-bold">{{ c.rotulo }}</p>
            <p class="text-2xl font-bold code-font mt-1 leading-none" [class]="c.corValor"><span class="kpi-valor">{{ c.valor }}</span></p>
            <div class="kpi-rodape mt-1.5 flex items-center justify-between gap-2">
              <span class="text-[10px] text-stone-400 truncate">{{ c.sub || '' }}</span>
              <span class="kpi-dica" [style.color]="c.cor">{{ ativo(c.chave) && c.chave ? '● filtrando' : c.dica }}</span>
            </div>
          </div>
        }
      </div>

      @if (filtroRapido()) {
        <div class="flex items-center gap-3 flex-wrap mb-5 anima-entrada">
          <span class="text-xs font-bold text-stone-400 uppercase tracking-wider">Filtrando por</span>
          <button (click)="alternarFiltro(filtroRapido())" class="chip-filtro inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold text-white"
                  [style.background]="corFiltroAtivo()">
            {{ rotuloFiltroAtivo() }} <span class="opacity-80">✕</span>
          </button>
          <span class="text-xs text-stone-400">{{ exibidos().length }} de {{ filtrados().length }} chamado(s)</span>
        </div>
      }

      <!-- Fila -->
      <h2 class="text-sm font-bold text-stone-700 uppercase tracking-wider mb-3">
        Fila de tratamento ({{ emAndamento().length }})
        <span class="text-blue-600 normal-case font-semibold">· {{ abertos().length }} sem tratativa</span>
      </h2>
      <div class="space-y-2 mb-8">
        @if (emAndamento().length === 0) {
          <p class="text-sm text-stone-400 py-6 text-center bg-white border border-stone-200 rounded-xl">Nenhum chamado em andamento no filtro atual.</p>
        } @else {
          @for (r of emAndamento(); track r.id) {
            <div (click)="abrirDetalhe(r)"
                 class="card-chamado cursor-pointer bg-white border border-stone-200 border-l-4 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap hover:bg-stone-50"
                 [class]="estourado(r) ? 'border-l-red-500' : (aberto(r) ? 'border-l-blue-500' : 'border-l-amber-500')">
              <div class="flex-1 min-w-[220px]">
                <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span class="code-font text-xs font-bold text-stone-400">#{{ idFmt(r) }}</span>
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{{ r.produto }}</span>
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border" [class]="corGravidade(r)">{{ r.gravidade }}</span>
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border" [class]="corStatus(r)">{{ rotuloDeStatus(r) }}</span>
                  <span class="badge-sla text-[10px] font-semibold px-2 py-0.5 rounded-full border" [class]="corSla(r)" [title]="dicaSla(r)">{{ textoSlaBadge(r) }}</span>
                  @if (responsavel(r)) {
                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">com {{ responsavel(r) }}</span>
                  }
                </div>
                <p class="text-sm text-stone-700">{{ r.descricao || r.categoria || '—' }}</p>
                <p class="text-xs text-stone-400 mt-1">
                  {{ r.categoria }} · {{ r.canal }} · {{ idade(r) }} · Atendente: {{ r.atendente }}
                  @if (r.idProposta) { <span>· Proposta #{{ r.idProposta }}</span> }
                  @if (r.cpf) { <span>· CPF {{ r.cpf }}</span> }
                </p>
              </div>
              <div class="flex items-center gap-2 shrink-0 flex-wrap">
                @if (aberto(r)) {
                  <button (click)="$event.stopPropagation(); mover(r, 'Pendente')" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors">Iniciar tratativa</button>
                }
                <button (click)="$event.stopPropagation(); mover(r, 'Resolvida')" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition-colors">Marcar como resolvida</button>
              </div>
            </div>
          }
        }
      </div>

      <!-- Tabela -->
      <h2 class="text-sm font-bold text-stone-700 uppercase tracking-wider mb-3">
        {{ busca.trim() ? 'Registros encontrados' : (filtroRapido() ? 'Registros — ' + rotuloFiltroAtivo() : 'Todos os registros no filtro') }} ({{ exibidos().length }})
      </h2>
      <div class="card bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden tabela-scroll anima-entrada">
        <table class="tabela-moderna w-full text-left text-sm">
          <thead class="bg-stone-50 border-b border-stone-200 text-stone-500 text-xs uppercase font-bold">
            <tr>
              <th class="py-3 px-4">ID</th><th class="py-3 px-4">Data</th><th class="py-3 px-4">Produto</th>
              <th class="py-3 px-4">Motivo</th><th class="py-3 px-4">Gravidade</th><th class="py-3 px-4">SLA</th>
              <th class="py-3 px-4">Atendente</th><th class="py-3 px-4">Status</th><th class="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-100">
            @for (r of ordenados(); track r.id) {
              <tr (click)="abrirDetalhe(r)" class="cursor-pointer">
                <td class="py-2.5 px-4 code-font text-stone-500">#{{ idFmt(r) }}</td>
                <td class="py-2.5 px-4 text-stone-500">{{ r.criadoEm | date:'dd/MM/yyyy' }}</td>
                <td class="py-2.5 px-4"><span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{{ r.produto }}</span></td>
                <td class="py-2.5 px-4 text-stone-600">{{ r.categoria }}</td>
                <td class="py-2.5 px-4"><span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border" [class]="corGravidade(r)">{{ r.gravidade }}</span></td>
                <td class="py-2.5 px-4"><span class="badge-sla text-[10px] font-semibold px-2 py-0.5 rounded-full border" [class]="corSla(r)" [title]="dicaSla(r)">{{ textoSlaBadge(r) }}</span></td>
                <td class="py-2.5 px-4 text-stone-600">
                  {{ r.atendente || '—' }}
                  @if (responsavel(r) && responsavel(r) !== r.atendente) {
                    <span class="block text-[11px] text-stone-400">{{ resolvido(r) ? 'resolvido por' : 'tratando' }}: {{ responsavel(r) }}</span>
                  }
                </td>
                <td class="py-2.5 px-4"><span class="font-semibold text-xs" [class]="corTextoStatus(r)">{{ resolvido(r) ? '✓ ' : '' }}{{ rotuloDeStatus(r) }}</span></td>
                <td class="py-2.5 px-4 text-right whitespace-nowrap">
                  @if (aberto(r)) {
                    <button (click)="$event.stopPropagation(); mover(r, 'Pendente')" class="text-xs font-semibold text-blue-600 hover:text-blue-800 mr-3">Iniciar tratativa</button>
                  }
                  <button (click)="$event.stopPropagation(); mover(r, resolvido(r) ? 'Pendente' : 'Resolvida')"
                          class="text-xs font-semibold" [class]="resolvido(r) ? 'text-stone-400 hover:text-amber-600' : 'text-green-600 hover:text-green-800'">
                    {{ resolvido(r) ? 'Reabrir' : 'Resolver' }}
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (modalNovo()) {
      <app-novo-chamado (fechar)="modalNovo.set(false)" (criado)="aposCriar()" />
    }
    @if (detalhe(); as d) {
      <app-detalhe-chamado [chamado]="d" (fechar)="detalhe.set(null)" (atualizado)="recarregar()" />
    }
  `
})
export class ChamadosComponent {
  readonly servico = inject(ChamadosService);
  readonly sessao = inject(SessaoService);
  private rota = inject(ActivatedRoute);
  private router = inject(Router);

  readonly produtos = SAC_PRODUTOS;
  readonly carregando = signal(true);
  readonly modalNovo = signal(false);
  readonly detalhe = signal<Chamado | null>(null);
  readonly filtroRapido = signal<ChaveFiltro>('');

  dataInicio = this.diasAtras(30);
  dataFim = this.hoje();
  produto = '';
  status = '';
  busca = '';

  private readonly testes: Record<ChaveFiltro, (r: Chamado) => boolean> = {
    '': () => true,
    'abertos': r => chamadoAberto(r),
    'tratativa': r => statusChamado(r) === 'Pendente',
    'sla': r => !chamadoResolvido(r) && slaEstourado(r),
    'resolvidos': r => chamadoResolvido(r)
  };
  private readonly rotulosFiltro: Record<ChaveFiltro, string> = {
    '': 'todos os chamados', 'abertos': 'chamados abertos', 'tratativa': 'em tratativa',
    'sla': 'SLA estourado em aberto', 'resolvidos': 'resolvidos'
  };
  private readonly coresFiltro: Record<ChaveFiltro, string> = {
    '': '#E35205', 'abertos': '#2563eb', 'tratativa': '#f59e0b', 'sla': '#dc2626', 'resolvidos': '#16a34a'
  };

  constructor() {
    const f = this.rota.snapshot.queryParamMap.get('filtro') as ChaveFiltro | null;
    if (f && f in this.testes) this.filtroRapido.set(f);
    this.recarregar();
  }

  private hoje(): string { return new Date().toISOString().slice(0, 10); }
  private diasAtras(n: number): string {
    const d = new Date(); d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  async recarregar(): Promise<void> {
    this.carregando.set(true);
    await this.servico.carregar();
    this.carregando.set(false);
  }

  /** Busca por CPF, ID ou proposta ignora data/produto/status de propósito. */
  readonly filtrados = computed<Chamado[]>(() => {
    const todos = this.servico.registros();
    const termo = this.busca.trim();
    if (termo) {
      const digitos = termo.replace(/\D/g, '');
      const termoId = termo.replace(/^#/, '').replace(/^0+/, '').toLowerCase();
      return todos.filter(r => {
        const idStr = String(r.id ?? '');
        const cpf = String(r.cpf || '').replace(/\D/g, '');
        const prop = String(r.idProposta || '').replace(/\D/g, '');
        const casaId = !!termoId && (idStr === termoId || String(Number(idStr)) === termoId);
        const casaCpf = digitos.length >= 3 && !!cpf && cpf.includes(digitos);
        const casaProp = digitos.length >= 3 && !!prop && prop.includes(digitos);
        return casaId || casaCpf || casaProp;
      });
    }
    const ini = new Date(this.dataInicio + 'T00:00:00').getTime();
    const fim = new Date(this.dataFim + 'T23:59:59').getTime();
    return todos.filter(r => {
      const t = new Date(r.criadoEm).getTime();
      if (t < ini || t > fim) return false;
      if (this.produto && r.produto !== this.produto) return false;
      if (this.status === '__naoResolvidos') { if (chamadoResolvido(r)) return false; }
      else if (this.status && statusChamado(r) !== this.status) return false;
      return true;
    });
  });

  readonly exibidos = computed(() => this.filtrados().filter(this.testes[this.filtroRapido()]));
  readonly ordenados = computed(() => this.exibidos().slice().sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime()));
  readonly abertos = computed(() => this.filtrados().filter(chamadoAberto));
  readonly emTratativa = computed(() => this.filtrados().filter(r => statusChamado(r) === 'Pendente'));
  readonly naoResolvidos = computed(() => this.filtrados().filter(r => !chamadoResolvido(r)));
  readonly resolvidos = computed(() => this.filtrados().filter(chamadoResolvido));

  readonly emAndamento = computed(() => this.exibidos().filter(r => !chamadoResolvido(r)).sort((a, b) => {
    if (chamadoAberto(a) !== chamadoAberto(b)) return chamadoAberto(a) ? -1 : 1;
    return new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime();
  }));

  readonly cards = computed<CardFiltro[]>(() => {
    const estourados = this.naoResolvidos().filter(slaEstourado).length;
    const emRisco = this.naoResolvidos().filter(r => !slaEstourado(r) && (diasRestantesSla(r) ?? 99) <= 1).length;
    return [
      { chave: '', rotulo: this.busca.trim() ? 'Na busca' : 'No filtro', valor: this.filtrados().length, cor: '#E35205', corValor: 'text-stone-800', dica: 'ver tudo' },
      { chave: 'abertos', rotulo: 'Chamados abertos', valor: this.abertos().length, cor: '#2563eb', corValor: 'text-blue-600', dica: 'filtrar' },
      { chave: 'tratativa', rotulo: 'Em tratativa', valor: this.emTratativa().length, cor: '#f59e0b', corValor: 'text-amber-600', dica: 'filtrar' },
      { chave: 'sla', rotulo: 'SLA estourado (em aberto)', valor: estourados, cor: '#dc2626', corValor: estourados ? 'text-red-600' : 'text-stone-800', dica: 'filtrar', sub: `${emRisco} vence(m) em 24h` },
      { chave: 'resolvidos', rotulo: 'Resolvidas no filtro', valor: this.resolvidos().length, cor: '#16a34a', corValor: 'text-green-600', dica: 'filtrar' }
    ];
  });

  ativo(chave: ChaveFiltro): boolean {
    return this.filtroRapido() === chave || (chave === '' && !this.filtroRapido());
  }
  alternarFiltro(chave: ChaveFiltro): void {
    this.filtroRapido.set(this.filtroRapido() === chave ? '' : chave);
    this.router.navigate([], { queryParams: { filtro: this.filtroRapido() || null }, queryParamsHandling: 'merge' });
  }
  rotuloFiltroAtivo(): string { return this.rotulosFiltro[this.filtroRapido()]; }
  corFiltroAtivo(): string { return this.coresFiltro[this.filtroRapido()]; }

  limparBusca(): void { this.busca = ''; this.recarregar(); }

  abrirDetalhe(r: Chamado): void { this.detalhe.set(r); }
  async mover(r: Chamado, novo: 'Pendente' | 'Resolvida'): Promise<void> { await this.servico.alterarStatus(r.id, novo); }
  async aposCriar(): Promise<void> { this.modalNovo.set(false); await this.recarregar(); }

  // helpers de template
  idFmt(r: Chamado): string { return String(r.id).padStart(4, '0'); }
  aberto(r: Chamado): boolean { return chamadoAberto(r); }
  resolvido(r: Chamado): boolean { return chamadoResolvido(r); }
  estourado(r: Chamado): boolean { return slaEstourado(r); }
  rotuloDeStatus(r: Chamado): string { return rotuloStatus(r); }
  corStatus(r: Chamado): string { return SAC_STATUS_CORES[statusChamado(r)].badge; }
  corTextoStatus(r: Chamado): string { return SAC_STATUS_CORES[statusChamado(r)].texto; }
  corGravidade(r: Chamado): string { return SAC_CORES_GRAVIDADE[r.gravidade]?.badge || 'bg-stone-100 text-stone-500 border-stone-200'; }
  corSla(r: Chamado): string { return classeBadgeSla(r); }
  textoSlaBadge(r: Chamado): string { return textoBadgeSla(r); }
  dicaSla(r: Chamado): string { return `Prazo de ${slaDiasPara(r)} dia(s) para gravidade ${r.gravidade || '—'} — ${textoSla(r, true)}`; }
  responsavel(r: Chamado): string { return responsavelDoChamado(r); }
  idade(r: Chamado): string {
    const d = idadeDiasSac(r.criadoEm);
    return d === 0 ? 'hoje' : `${d} ${d === 1 ? 'dia' : 'dias'} em aberto`;
  }
}
