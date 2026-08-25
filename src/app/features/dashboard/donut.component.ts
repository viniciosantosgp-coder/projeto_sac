import { Component, Input, computed, signal } from '@angular/core';
import { Chamado } from '../../core/modelos';
import { PIZZA_HEX_GRAVIDADE, PIZZA_HEX_PRODUTO, PIZZA_PALETA } from '../../core/constantes';
import { chamadoAberto, chamadoResolvido, duracaoDiasChamado } from '../../core/dominio';
import { contarPor } from '../../core/metricas';

interface Fatia {
  rotulo: string; valor: number; cor: string; perc: string; d: string; anelCheio: boolean;
  gravidades: Array<[string, number]>; resolvidos: number; abertos: number; emTratativa: number;
  tempoMedio: string; topoAtendente: [string, number] | null; frase: string;
}

@Component({
  selector: 'app-donut',
  standalone: true,
  template: `
    <div class="card pizza-wrap bg-white border border-stone-200 rounded-2xl shadow-sm p-6 anima-entrada">
      <div class="mb-4">
        <h3 class="font-bold text-stone-800 text-sm">Distribuição de chamados — {{ titulo }}</h3>
        <p class="text-xs text-stone-400 mt-0.5">Passe o mouse sobre uma fatia para ver o resumo · período e produto conforme o filtro acima.</p>
      </div>

      @if (fatias().length === 0) {
        <p class="text-sm text-stone-400 py-10 text-center">Sem dados para exibir.</p>
      } @else {
        <div class="pizza-tip" [class.visivel]="indiceAtivo() !== null" [style.left.px]="x()" [style.top.px]="y()">
          @if (ativa(); as f) {
            <div class="w-[290px] bg-white border border-stone-200 rounded-xl shadow-xl p-4">
              <div class="flex items-center gap-2 mb-2">
                <span class="w-3 h-3 rounded-sm shrink-0" [style.background]="f.cor"></span>
                <span class="font-bold text-stone-800 text-sm flex-1">{{ f.rotulo }}</span>
                <span class="code-font text-sm font-bold text-stone-800">{{ f.valor }}</span>
              </div>
              <p class="text-xs text-stone-600 leading-relaxed mb-3">{{ f.frase }}</p>
              <div class="space-y-1.5 text-xs mb-3">
                @for (g of f.gravidades; track g[0]) {
                  <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full shrink-0" [style.background]="corGravidade(g[0])"></span>
                    <span class="flex-1 text-stone-500">{{ g[0] }}</span>
                    <span class="code-font text-stone-700 font-semibold">{{ g[1] }}</span>
                    <span class="code-font text-stone-400 w-12 text-right">{{ pct(g[1], f.valor) }}</span>
                  </div>
                }
              </div>
              <div class="border-t border-stone-100 pt-2.5 space-y-1 text-xs">
                <div class="flex justify-between"><span class="text-stone-500">Chamados abertos</span><span class="code-font text-blue-600 font-semibold">{{ f.abertos }} <span class="text-stone-400">({{ pct(f.abertos, f.valor) }})</span></span></div>
                <div class="flex justify-between"><span class="text-stone-500">Em tratativa</span><span class="code-font text-amber-600 font-semibold">{{ f.emTratativa }} <span class="text-stone-400">({{ pct(f.emTratativa, f.valor) }})</span></span></div>
                <div class="flex justify-between"><span class="text-stone-500">Resolvidos</span><span class="code-font text-green-700 font-semibold">{{ f.resolvidos }} <span class="text-stone-400">({{ pct(f.resolvidos, f.valor) }})</span></span></div>
                <div class="flex justify-between"><span class="text-stone-500">Tempo médio</span><span class="code-font text-stone-700 font-semibold">{{ f.tempoMedio }}</span></div>
                @if (mostrarAtendente && f.topoAtendente) {
                  <div class="flex justify-between gap-3"><span class="text-stone-500 shrink-0">Quem mais registrou</span>
                    <span class="text-stone-700 font-semibold text-right truncate">{{ f.topoAtendente![0] }} <span class="code-font text-stone-400">({{ f.topoAtendente![1] }})</span></span></div>
                }
              </div>
            </div>
          }
        </div>

        <div class="flex flex-col md:flex-row items-center gap-8" (mousemove)="mover($event)" (mouseleave)="sair()">
          <svg viewBox="0 0 220 220" class="pizza-svg w-[220px] h-[220px] shrink-0" [class.tem-hover]="indiceAtivo() !== null">
            @for (f of fatias(); track f.rotulo) {
              @if (f.anelCheio) {
                <circle [attr.cx]="110" [attr.cy]="110" [attr.r]="81" fill="none" [attr.stroke]="f.cor" [attr.stroke-width]="38"
                        class="fatia-pizza" [class.ativa]="indiceAtivo() === $index" (mouseenter)="entrar($index)"></circle>
              } @else {
                <path [attr.d]="f.d" [attr.fill]="f.cor" stroke="#fff" stroke-width="2"
                      class="fatia-pizza" [class.ativa]="indiceAtivo() === $index" (mouseenter)="entrar($index)"></path>
              }
            }
            <text x="110" y="106" text-anchor="middle" class="code-font" style="font-size:30px;font-weight:700"
                  [attr.fill]="ativa() ? ativa()!.cor : '#1c1917'">{{ ativa() ? ativa()!.perc.replace('%','') : total() }}</text>
            <text x="110" y="128" text-anchor="middle" style="font-size:11px;fill:#a8a29e;letter-spacing:.08em">
              {{ ativa() ? '% ' + rotuloCurto(ativa()!.rotulo) : 'CHAMADOS' }}
            </text>
          </svg>

          <div class="w-full md:flex-1 divide-y divide-stone-100">
            @for (f of fatias(); track f.rotulo) {
              <div class="linha-legenda flex items-center gap-2 px-2 py-1.5" [class.ativa]="indiceAtivo() === $index" (mouseenter)="entrar($index)">
                <span class="w-3 h-3 rounded-sm shrink-0" [style.background]="f.cor"></span>
                <span class="text-sm text-stone-600 truncate flex-1">{{ f.rotulo }}</span>
                <span class="code-font text-sm font-bold text-stone-800">{{ f.valor }}</span>
                <span class="code-font text-xs text-stone-400 w-14 text-right">{{ f.perc }}</span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `
})
export class DonutComponent {
  @Input({ required: true }) registros: Chamado[] = [];
  @Input() titulo = '';
  @Input() mostrarAtendente = false;

  readonly indiceAtivo = signal<number | null>(null);
  readonly x = signal(0);
  readonly y = signal(0);

  readonly total = computed(() => this.registros.length);

  readonly fatias = computed<Fatia[]>(() => {
    const total = this.registros.length;
    if (!total) return [];
    const grupos: Record<string, Chamado[]> = {};
    this.registros.forEach(r => {
      const p = r.produto || 'Não informado';
      (grupos[p] = grupos[p] || []).push(r);
    });
    const dados = Object.entries(grupos).sort((a, b) => b[1].length - a[1].length);

    const cx = 110, cy = 110, R = 100, ri = 62;
    let ang = -Math.PI / 2;
    return dados.map(([produto, regs], i) => {
      const valor = regs.length;
      const frac = valor / total;
      const cor = PIZZA_HEX_PRODUTO[produto] || PIZZA_PALETA[i % PIZZA_PALETA.length];
      let d = '';
      const anelCheio = frac >= 0.9999;
      if (!anelCheio) {
        const a0 = ang, a1 = ang + frac * 2 * Math.PI, g = frac > 0.5 ? 1 : 0;
        const p = (raio: number, a: number) => `${(cx + raio * Math.cos(a)).toFixed(2)} ${(cy + raio * Math.sin(a)).toFixed(2)}`;
        d = `M ${p(R, a0)} A ${R} ${R} 0 ${g} 1 ${p(R, a1)} L ${p(ri, a1)} A ${ri} ${ri} 0 ${g} 0 ${p(ri, a0)} Z`;
        ang = a1;
      }
      const grav = contarPor(regs, 'gravidade');
      const resolvidos = regs.filter(chamadoResolvido).length;
      const abertos = regs.filter(chamadoAberto).length;
      const duracoes = regs.map(duracaoDiasChamado).filter((x): x is number => x != null);
      const atend = contarPor(regs, 'atendente');
      const perc = this.pct(valor, total);
      return {
        rotulo: produto, valor, cor, perc, d, anelCheio,
        gravidades: grav, resolvidos, abertos, emTratativa: valor - resolvidos - abertos,
        tempoMedio: duracoes.length ? (duracoes.reduce((a, b) => a + b, 0) / duracoes.length).toFixed(1).replace('.', ',') + ' dias' : '—',
        topoAtendente: atend.length ? atend[0] : null,
        frase: `${perc} das reclamações foram de ${produto}` +
          (grav.length ? `, com predominância de gravidade ${grav[0][0]} (${this.pct(grav[0][1], valor)})` : '') + '.'
      };
    });
  });

  readonly ativa = computed<Fatia | null>(() => {
    const i = this.indiceAtivo();
    return i == null ? null : (this.fatias()[i] ?? null);
  });

  pct(v: number, total: number): string {
    if (!total) return '0%';
    return (v / total * 100).toFixed(1).replace('.', ',') + '%';
  }
  corGravidade(g: string): string { return PIZZA_HEX_GRAVIDADE[g] || '#a8a29e'; }
  rotuloCurto(t: string): string { return t.length > 16 ? t.slice(0, 15) + '…' : t; }

  entrar(i: number): void { this.indiceAtivo.set(i); }
  sair(): void { this.indiceAtivo.set(null); }
  mover(ev: MouseEvent): void {
    const alvo = (ev.currentTarget as HTMLElement).closest('.pizza-wrap') as HTMLElement | null;
    if (!alvo) return;
    const r = alvo.getBoundingClientRect();
    this.x.set(ev.clientX - r.left);
    this.y.set(Math.min(Math.max(ev.clientY - r.top, 130), Math.max(r.height - 130, 130)));
  }
}
