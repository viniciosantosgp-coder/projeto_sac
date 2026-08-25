import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChamadosService } from '../../core/chamados.service';
import { SessaoService } from '../../core/sessao.service';
import { ExcelService } from '../../core/excel.service';
import { Chamado } from '../../core/modelos';
import { chamadoAberto, chamadoResolvido, slaEstourado, statusChamado } from '../../core/dominio';
import {
  apurarSlaPorGravidade, calcularAtuacao, calcularEstatisticas, chamadosAtuadosPor,
  chamadosSemAtuacaoRegistrada, contarPor, resumoPeriodo
} from '../../core/metricas';
import { SAC_CORES_GRAVIDADE, SAC_CORES_PRODUTO, SAC_PRODUTOS } from '../../core/constantes';
import { DonutComponent } from './donut.component';

type ChaveFiltro = '' | 'abertos' | 'tratativa' | 'sla' | 'resolvidos';
interface Kpi { rotulo: string; valor: string | number; cor: string; corValor: string; filtro?: ChaveFiltro; }

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, DonutComponent],
  template: `
    <div class="flex items-center justify-between flex-wrap gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-extrabold text-stone-900 tracking-tight">Dashboard SAC</h1>
        <p class="text-stone-500 text-sm mt-1">Volume, SLA e desempenho por atendente — chamados registrados no SAC.</p>
      </div>
      <button (click)="recarregar()" class="inline-flex items-center gap-2 px-4 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-semibold text-stone-700 transition-colors">Atualizar</button>
    </div>

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
      <button (click)="recarregar()" class="px-5 py-2 bg-[#E35205] text-white rounded-lg text-sm font-semibold hover:bg-[#c44503] transition-colors">Aplicar filtro</button>
      <button (click)="exportar()" [disabled]="exportando()"
        class="inline-flex items-center gap-2 px-5 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M224,152v56a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V152a8,8,0,0,1,16,0v56H208V152a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,132.69V40a8,8,0,0,0-16,0v92.69L93.66,106.34a8,8,0,0,0-11.32,11.32Z"/></svg>
        {{ exportando() ? 'Gerando...' : 'Exportar Excel' }}
      </button>
      <span class="text-xs self-center" [class]="erroExport() ? 'text-red-600 font-semibold' : 'text-green-700 font-semibold'">{{ msgExport() }}</span>
    </div>

    @if (registrosPeriodo().length === 0) {
      <p class="text-stone-400 py-6 text-center bg-white border border-stone-200 rounded-xl">Nenhum chamado no período/filtro selecionado.</p>
    } @else {
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
        @for (k of kpis(); track k.rotulo) {
          <div [style.--kpi-cor]="k.cor"
               [style.background-image]="'radial-gradient(150% 130% at 100% 0%, ' + k.cor + '1f 0%, transparent 48%)'"
               class="card kpi bg-white border border-stone-200 rounded-xl p-4 anima-entrada"
               [class.kpi-filtro]="!!k.filtro" [class.ativo]="!!k.filtro && filtroRapido() === k.filtro"
               (click)="alternarFiltro(k.filtro)">
            <p class="kpi-rotulo text-stone-400 uppercase font-bold">{{ k.rotulo }}</p>
            <p class="text-2xl font-bold code-font mt-1 leading-none" [class]="k.corValor"><span class="kpi-valor">{{ k.valor }}</span></p>
            <div class="kpi-rodape mt-1.5 flex items-center justify-between gap-2">
              <span class="text-[10px] text-stone-400 truncate"></span>
              @if (k.filtro) {
                <span class="kpi-dica" [style.color]="k.cor">{{ filtroRapido() === k.filtro ? '● filtrando' : 'filtrar painel' }}</span>
              }
            </div>
          </div>
        }
      </div>

      @if (filtroRapido()) {
        <div class="flex items-center gap-3 flex-wrap mb-6 anima-entrada">
          <span class="text-xs font-bold text-stone-400 uppercase tracking-wider">Painel filtrado por</span>
          <button (click)="alternarFiltro(filtroRapido())" class="chip-filtro inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold text-white" [style.background]="corFiltro()">
            {{ rotuloFiltro() }} <span class="opacity-80">✕</span>
          </button>
          <span class="text-xs text-stone-400">{{ registros().length }} de {{ registrosPeriodo().length }} chamado(s) · gráficos, SLA e produção abaixo consideram só este recorte</span>
        </div>
      }

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div class="card bg-white border border-stone-200 rounded-2xl shadow-sm p-6 anima-entrada">
          <h3 class="font-bold text-stone-800 text-sm mb-4">Chamados por produto</h3>
          <div class="space-y-3">
            @for (p of porProduto(); track p[0]) {
              <div class="linha-barra">
                <div class="flex items-center justify-between text-xs text-stone-500 mb-1">
                  <span class="barra-rotulo">{{ p[0] }}</span><span class="code-font font-semibold text-stone-700">{{ p[1] }}</span>
                </div>
                <div class="w-full h-3 bg-stone-100 rounded-full overflow-hidden">
                  <div class="barra-fill h-full rounded-full" [class]="corProduto(p[0])" [style.width.%]="larguraProduto(p[1])"></div>
                </div>
              </div>
            }
          </div>
        </div>

        <div class="card bg-white border border-stone-200 rounded-2xl shadow-sm p-6 anima-entrada">
          <h3 class="font-bold text-stone-800 text-sm mb-4">Principais motivos</h3>
          <div class="space-y-3">
            @for (m of porMotivo(); track m[0]) {
              <div class="linha-barra">
                <div class="flex items-center justify-between text-xs text-stone-500 mb-1">
                  <span class="barra-rotulo">{{ m[0] }}</span><span class="code-font font-semibold text-stone-700">{{ m[1] }}</span>
                </div>
                <div class="w-full h-3 bg-stone-100 rounded-full overflow-hidden">
                  <div class="barra-fill h-full bg-stone-500 rounded-full" [style.width.%]="larguraMotivo(m[1])"></div>
                </div>
              </div>
            }
          </div>
        </div>

        <div class="card bg-white border border-stone-200 rounded-2xl shadow-sm p-6 anima-entrada">
          <h3 class="font-bold text-stone-800 text-sm mb-4">Por gravidade</h3>
          <div class="space-y-3">
            @for (g of porGravidade(); track g[0]) {
              <div class="linha-barra">
                <div class="flex items-center justify-between text-xs text-stone-500 mb-1">
                  <span class="barra-rotulo">{{ g[0] }}</span><span class="code-font font-semibold text-stone-700">{{ g[1] }}</span>
                </div>
                <div class="w-full h-3 bg-stone-100 rounded-full overflow-hidden">
                  <div class="barra-fill h-full rounded-full" [class]="corGravidade(g[0])" [style.width.%]="larguraGravidade(g[1])"></div>
                </div>
              </div>
            }
          </div>
        </div>
      </div>

      <h2 class="text-sm font-bold text-stone-700 uppercase tracking-wider mb-3">SLA por gravidade <span class="normal-case font-semibold text-stone-400">· prazo contado da abertura</span></h2>
      <div class="card bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden tabela-scroll mb-8 anima-entrada">
        <table class="tabela-moderna w-full text-left text-sm">
          <thead class="bg-stone-50 border-b border-stone-200 text-stone-500 text-xs uppercase font-bold">
            <tr><th class="py-3 px-4">Gravidade</th><th class="py-3 px-4 text-center">Prazo</th><th class="py-3 px-4 text-center">Chamados</th>
              <th class="py-3 px-4 text-center">Dentro do prazo</th><th class="py-3 px-4 text-center">Estourados</th>
              <th class="py-3 px-4 text-center">Vencem em 24h</th><th class="py-3 px-4 text-center">Cumprimento</th><th class="py-3 px-4 text-center">Tempo médio</th></tr>
          </thead>
          <tbody class="divide-y divide-stone-100">
            @for (it of slaPorGravidade(); track it.gravidade) {
              <tr>
                <td class="py-3 px-4"><span class="text-xs font-semibold px-2.5 py-1 rounded-full border" [class]="badgeGravidade(it.gravidade)">{{ it.gravidade }}</span></td>
                <td class="py-3 px-4 text-center code-font text-stone-600">{{ it.prazo }}d</td>
                <td class="py-3 px-4 text-center code-font font-bold text-stone-800">{{ it.total }}</td>
                <td class="py-3 px-4 text-center code-font text-green-700">{{ it.dentro }}</td>
                <td class="py-3 px-4 text-center code-font" [class]="it.estourado ? 'text-red-600 font-bold' : 'text-stone-400'">{{ it.estourado }}</td>
                <td class="py-3 px-4 text-center code-font" [class]="it.emRisco ? 'text-amber-600 font-bold' : 'text-stone-400'">{{ it.emRisco }}</td>
                <td class="py-3 px-4 text-center code-font" [class]="corPerc(it.percCumprimento * 100)">{{ (it.percCumprimento * 100).toFixed(0) }}%</td>
                <td class="py-3 px-4 text-center code-font text-stone-600">{{ it.tempoMedio != null ? it.tempoMedio.toFixed(1) + 'd' : '—' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <h2 class="text-sm font-bold text-stone-700 uppercase tracking-wider mb-3">Por quem registrou <span class="normal-case font-semibold text-stone-400">· quem abriu o chamado</span></h2>
      <div class="card bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden tabela-scroll anima-entrada">
        <table class="tabela-moderna w-full text-left text-sm">
          <thead class="bg-stone-50 border-b border-stone-200 text-stone-500 text-xs uppercase font-bold">
            <tr><th class="py-3 px-4">Atendente</th><th class="py-3 px-4 text-center">Total</th><th class="py-3 px-4 text-center">Abertos</th>
              <th class="py-3 px-4 text-center">Em tratativa</th><th class="py-3 px-4 text-center">Resolvidos</th>
              <th class="py-3 px-4 text-center">SLA cumprido</th><th class="py-3 px-4 text-center">Tempo médio</th></tr>
          </thead>
          <tbody class="divide-y divide-stone-100">
            @for (it of estatisticas(); track it.nome) {
              <tr>
                <td class="py-3 px-4 text-stone-700 font-semibold">{{ it.nome }}</td>
                <td class="py-3 px-4 text-center code-font font-bold text-stone-800">{{ it.total }}</td>
                <td class="py-3 px-4 text-center code-font text-blue-600">{{ it.abertos }}</td>
                <td class="py-3 px-4 text-center code-font text-amber-600">{{ it.pendentes }}</td>
                <td class="py-3 px-4 text-center code-font text-green-700">{{ it.resolvidos }}</td>
                <td class="py-3 px-4 text-center code-font" [class]="corPerc(it.percSla * 100)">{{ (it.percSla * 100).toFixed(0) }}%</td>
                <td class="py-3 px-4 text-center code-font text-stone-600">{{ it.tempoMedio != null ? it.tempoMedio.toFixed(1) + 'd' : '—' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <h2 class="text-sm font-bold text-stone-700 uppercase tracking-wider mt-8 mb-3">Por quem atuou <span class="normal-case font-semibold text-stone-400">· esteira de tratativa, lida do histórico gravado</span></h2>
      @if (semTrilha() > 0) {
        <p class="text-xs text-stone-400 mb-2">{{ semTrilha() }} chamado(s) do período são anteriores ao controle de esteira e não têm atuação registrada — eles aparecem apenas no quadro acima.</p>
      }
      @if (atuacao().length === 0) {
        <p class="text-sm text-stone-400 py-6 text-center bg-white border border-stone-200 rounded-xl">Nenhuma atuação registrada no período. A partir de agora, cada tratativa, observação e resolução passa a aparecer aqui.</p>
      } @else {
        <div class="card bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden tabela-scroll anima-entrada">
          <table class="tabela-moderna w-full text-left text-sm">
            <thead class="bg-stone-50 border-b border-stone-200 text-stone-500 text-xs uppercase font-bold">
              <tr><th class="py-3 px-4">Analista</th><th class="py-3 px-4 text-center">Chamados atuados</th><th class="py-3 px-4 text-center">Tratativas iniciadas</th>
                <th class="py-3 px-4 text-center">Observações</th><th class="py-3 px-4 text-center">Resoluções</th><th class="py-3 px-4 text-center">Reaberturas</th>
                <th class="py-3 px-4 text-center">SLA nas resoluções</th><th class="py-3 px-4 text-center">Tempo médio</th></tr>
            </thead>
            <tbody class="divide-y divide-stone-100">
              @for (it of atuacao(); track it.nome) {
                <tr>
                  <td class="py-3 px-4 text-stone-700 font-semibold">{{ it.nome }}</td>
                  <td class="py-3 px-4 text-center code-font font-bold text-stone-800">{{ it.chamadosAtuados }}</td>
                  <td class="py-3 px-4 text-center code-font text-blue-600">{{ it.tratativas }}</td>
                  <td class="py-3 px-4 text-center code-font text-stone-600">{{ it.observacoes }}</td>
                  <td class="py-3 px-4 text-center code-font text-green-700">{{ it.resolucoes }}</td>
                  <td class="py-3 px-4 text-center code-font" [class]="it.reaberturas ? 'text-amber-600' : 'text-stone-400'">{{ it.reaberturas }}</td>
                  <td class="py-3 px-4 text-center code-font" [class]="it.percSla == null ? 'text-stone-400' : corPerc(it.percSla * 100)">{{ it.percSla == null ? '—' : (it.percSla * 100).toFixed(0) + '%' }}</td>
                  <td class="py-3 px-4 text-center code-font text-stone-600">{{ it.tempoMedio != null ? it.tempoMedio.toFixed(1) + 'd' : '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Desempenho individual -->
      <div class="mt-10">
        <h2 class="text-lg font-extrabold text-stone-900 tracking-tight mb-1">Desempenho por Atendente</h2>
        <p class="text-stone-500 text-sm mb-4">Escolha "Exibir todos" para a produção geral da equipe, ou um atendente para os números individuais.</p>
        <select [(ngModel)]="selecionado" (ngModelChange)="selecionadoSig.set($event)"
                class="border border-stone-200 rounded-lg px-3 py-2 text-sm mb-5 min-w-[260px]">
          <option value="">Selecione um atendente...</option>
          <option value="__todos__">Exibir todos (produção geral)</option>
          @for (n of nomes(); track n) { <option [value]="n">{{ n }}</option> }
        </select>

        @if (selecionadoSig() && selecionadoSig() !== '__todos__') {
          @if (soAtuou()) {
            <div class="bg-blue-50 border border-blue-200 text-blue-800 rounded-xl px-4 py-2.5 mb-4 text-xs">
              {{ selecionadoSig() }} não registrou chamados no período — os números de registro abaixo ficam zerados, mas a atuação na esteira está contabilizada.
            </div>
          }
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            @for (k of kpisIndividuais(); track k.rotulo) {
              <div [style.--kpi-cor]="k.cor" class="card kpi bg-white border border-stone-200 rounded-xl p-4 anima-entrada">
                <p class="kpi-rotulo text-stone-400 uppercase font-bold">{{ k.rotulo }}</p>
                <p class="text-2xl font-bold code-font mt-1 leading-none" [class]="k.corValor"><span class="kpi-valor">{{ k.valor }}</span></p>
                <div class="kpi-rodape mt-1.5"></div>
              </div>
            }
          </div>
          <div class="card bg-white border border-stone-200 rounded-2xl shadow-sm p-6 anima-entrada mb-6">
            <h3 class="font-bold text-stone-800 text-sm mb-1">Atuação na esteira</h3>
            <p class="text-xs text-stone-400 mb-4">Inclui chamados abertos por outras pessoas que {{ selecionadoSig() }} tratou.</p>
            @if (atuacaoIndividual(); as at) {
              <div class="flex items-center justify-between py-1.5 border-b border-stone-100"><span class="text-sm text-stone-500">Chamados atuados</span><span class="code-font font-bold text-stone-800">{{ at.chamadosAtuados }}</span></div>
              <div class="flex items-center justify-between py-1.5 border-b border-stone-100"><span class="text-sm text-stone-500">Tratativas iniciadas</span><span class="code-font font-bold text-blue-600">{{ at.tratativas }}</span></div>
              <div class="flex items-center justify-between py-1.5 border-b border-stone-100"><span class="text-sm text-stone-500">Observações registradas</span><span class="code-font font-bold text-stone-800">{{ at.observacoes }}</span></div>
              <div class="flex items-center justify-between py-1.5 border-b border-stone-100"><span class="text-sm text-stone-500">Resoluções</span><span class="code-font font-bold text-green-700">{{ at.resolucoes }}</span></div>
              <div class="flex items-center justify-between py-1.5"><span class="text-sm text-stone-500">Tempo médio até resolver</span><span class="code-font font-bold text-stone-800">{{ at.tempoMedio != null ? at.tempoMedio.toFixed(1) + 'd' : '—' }}</span></div>
            } @else {
              <p class="text-sm text-stone-400 py-4">Nenhuma atuação registrada no período.</p>
            }
          </div>
        }

        @if (selecionadoSig()) {
          <app-donut [registros]="registrosDoDonut()" [titulo]="tituloDonut()" [mostrarAtendente]="selecionadoSig() === '__todos__'" />
        }
      </div>
    }
  `
})
export class DashboardComponent {
  readonly servico = inject(ChamadosService);
  readonly sessao = inject(SessaoService);
  private excel = inject(ExcelService);

  readonly produtos = SAC_PRODUTOS;
  dataInicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  dataFim = new Date().toISOString().slice(0, 10);
  produto = '';
  selecionado = '';

  readonly selecionadoSig = signal('');
  readonly exportando = signal(false);
  readonly msgExport = signal('');
  readonly erroExport = signal(false);
  private readonly recarga = signal(0);

  constructor() { this.recarregar(); }

  async recarregar(): Promise<void> {
    await this.servico.carregar();
    this.recarga.update(v => v + 1);
  }

  /** Recorte do painel acionado pelos cards do topo (fica no dashboard, não navega). */
  readonly filtroRapido = signal<ChaveFiltro>('');
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

  /** Tudo do período + produto: alimenta os cards do topo. */
  readonly registrosPeriodo = computed<Chamado[]>(() => {
    this.recarga();
    const ini = new Date(this.dataInicio + 'T00:00:00').getTime();
    const fim = new Date(this.dataFim + 'T23:59:59').getTime();
    return this.servico.registros().filter(r => {
      const t = new Date(r.criadoEm).getTime();
      if (t < ini || t > fim) return false;
      if (this.produto && r.produto !== this.produto) return false;
      return true;
    });
  });

  /** Recorte ativo: alimenta gráficos, SLA, produção, rosca e exportação. */
  readonly registros = computed<Chamado[]>(() => this.registrosPeriodo().filter(this.testes[this.filtroRapido()]));

  alternarFiltro(chave?: ChaveFiltro): void {
    if (!chave) return;
    this.filtroRapido.set(this.filtroRapido() === chave ? '' : chave);
  }
  rotuloFiltro(): string { return this.rotulosFiltro[this.filtroRapido()]; }
  corFiltro(): string { return this.coresFiltro[this.filtroRapido()]; }

  readonly resumo = computed(() => resumoPeriodo(this.registros()));
  readonly estatisticas = computed(() => calcularEstatisticas(this.registros()));
  readonly atuacao = computed(() => calcularAtuacao(this.registros()));
  readonly slaPorGravidade = computed(() => apurarSlaPorGravidade(this.registros()));
  readonly semTrilha = computed(() => chamadosSemAtuacaoRegistrada(this.registros()));
  readonly porProduto = computed(() => contarPor(this.registros(), 'produto'));
  readonly porMotivo = computed(() => contarPor(this.registros(), 'categoria').slice(0, 6));
  readonly porGravidade = computed(() => contarPor(this.registros(), 'gravidade'));

  /** Os cards do topo seguem contando o período inteiro, independente do recorte. */
  readonly kpis = computed<Kpi[]>(() => {
    const r = resumoPeriodo(this.registrosPeriodo());
    return [
      { rotulo: 'Total', valor: r.total, cor: '#E35205', corValor: 'text-stone-800' },
      { rotulo: 'Chamados abertos', valor: r.abertos.length, cor: '#2563eb', corValor: 'text-blue-600', filtro: 'abertos' },
      { rotulo: 'Em tratativa', valor: r.emTratativa.length, cor: '#f59e0b', corValor: 'text-amber-600', filtro: 'tratativa' },
      { rotulo: 'Resolvidos', valor: r.resolvidos.length, cor: '#16a34a', corValor: 'text-green-600', filtro: 'resolvidos' },
      { rotulo: 'Taxa de resolução', valor: r.taxaResolucao + '%', cor: '#0d9488', corValor: 'text-stone-800' },
      { rotulo: 'SLA estourado', valor: r.estourados, cor: '#dc2626', corValor: r.estourados ? 'text-red-600' : 'text-stone-800', filtro: 'sla' },
      { rotulo: 'Tempo médio p/ resolver', valor: r.tempoMedioDias != null ? r.tempoMedioDias.toFixed(1) + 'd' : '—', cor: '#7c3aed', corValor: 'text-stone-800' }
    ];
  });

  readonly nomes = computed(() => {
    const registro = this.registros().map(r => r.atendente || 'Desconhecido');
    const esteira = this.atuacao().map(a => a.nome);
    return [...new Set([...registro, ...esteira])].sort();
  });

  readonly registrosDoAtendente = computed(() => this.registros().filter(r => (r.atendente || 'Desconhecido') === this.selecionadoSig()));
  readonly soAtuou = computed(() => this.registrosDoAtendente().length === 0 && chamadosAtuadosPor(this.selecionadoSig(), this.registros()).length > 0);
  readonly atuacaoIndividual = computed(() => this.atuacao().find(a => a.nome === this.selecionadoSig()) ?? null);

  readonly kpisIndividuais = computed<Kpi[]>(() => {
    const stats = this.estatisticas().find(e => e.nome === this.selecionadoSig());
    const regs = this.registrosDoAtendente();
    const total = stats?.total ?? 0;
    return [
      { rotulo: 'Total', valor: total, cor: '#E35205', corValor: 'text-stone-800' },
      { rotulo: 'Chamados abertos', valor: stats?.abertos ?? 0, cor: '#2563eb', corValor: 'text-blue-600' },
      { rotulo: 'Em tratativa', valor: stats?.pendentes ?? 0, cor: '#f59e0b', corValor: 'text-amber-600' },
      { rotulo: 'Resolvidos', valor: stats?.resolvidos ?? 0, cor: '#16a34a', corValor: 'text-green-600' },
      { rotulo: 'SLA cumprido', valor: ((stats?.percSla ?? 0) * 100).toFixed(0) + '%', cor: '#0d9488', corValor: 'text-stone-800' },
      { rotulo: 'Tempo médio', valor: stats?.tempoMedio != null ? stats.tempoMedio.toFixed(1) + 'd' : '—', cor: '#7c3aed', corValor: 'text-stone-800' }
    ].map(k => ({ ...k, valor: regs.length === 0 && k.rotulo === 'Total' ? total : k.valor }));
  });

  readonly registrosDoDonut = computed(() => {
    const sel = this.selecionadoSig();
    if (sel === '__todos__') return this.registros();
    const proprios = this.registrosDoAtendente();
    return proprios.length ? proprios : chamadosAtuadosPor(sel, this.registros());
  });
  readonly tituloDonut = computed(() => {
    const sel = this.selecionadoSig();
    if (sel === '__todos__') return 'Visão geral da equipe';
    return sel + (this.registrosDoAtendente().length ? '' : ' (chamados que atuou)');
  });

  async exportar(): Promise<void> {
    const registros = this.registros();
    if (!registros.length) {
      this.erroExport.set(true);
      this.msgExport.set('Aplique o filtro e carregue os dados antes de exportar.');
      return;
    }
    this.exportando.set(true);
    this.msgExport.set('');
    try {
      const msg = await this.excel.exportarDashboard(registros, {
        dataInicio: this.dataInicio, dataFim: this.dataFim, produto: this.produto || 'Todos os produtos'
      });
      this.erroExport.set(false);
      this.msgExport.set(msg);
    } catch (e) {
      this.excel.baixarCsv(registros);
      this.erroExport.set(true);
      this.msgExport.set('Falha ao gerar o Excel — exportei em CSV. (' + (e as Error).message + ')');
    } finally {
      this.exportando.set(false);
    }
  }

  // helpers
  corProduto(p: string): string { return SAC_CORES_PRODUTO[p] || 'bg-stone-400'; }
  corGravidade(g: string): string { return SAC_CORES_GRAVIDADE[g]?.barra || 'bg-stone-400'; }
  badgeGravidade(g: string): string { return SAC_CORES_GRAVIDADE[g]?.badge || 'bg-stone-100 text-stone-500 border-stone-200'; }
  corPerc(p: number): string { return p >= 80 ? 'text-green-700' : p >= 50 ? 'text-amber-600' : 'text-red-600'; }
  larguraProduto(v: number): number { const m = Math.max(1, ...this.porProduto().map(x => x[1])); return v / m * 100; }
  larguraMotivo(v: number): number { const m = Math.max(1, ...this.porMotivo().map(x => x[1])); return v / m * 100; }
  larguraGravidade(v: number): number { return v / Math.max(1, this.registros().length) * 100; }
  ehResolvido(r: Chamado): boolean { return chamadoResolvido(r); }
  statusDe(r: Chamado): string { return statusChamado(r); }
}
