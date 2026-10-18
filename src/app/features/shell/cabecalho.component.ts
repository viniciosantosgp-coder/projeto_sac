import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { SessaoService } from '../../core/sessao.service';
import { TemaService } from '../../core/tema.service';
import { OuvidoriaApiService } from '../../core/ouvidoria-api.service';

@Component({
  selector: 'app-cabecalho',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="bg-white sticky top-0 z-40 border-b border-stone-200 shadow-sm">
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 sm:gap-8 min-w-0">
          <a routerLink="/chamados" class="text-2xl sm:text-3xl logo-presenca text-[#E35205] cursor-pointer shrink-0">Presença</a>
          <nav class="flex items-center gap-3 sm:gap-6 text-sm font-medium text-stone-600">
            <!-- Menu SAC: agrupa Chamados e Dashboard -->
            <div class="relative" data-menu-sac>
              <button type="button" (click)="sacAberto.set(!sacAberto())"
                      class="flex items-center gap-1.5 hover:text-[#E35205] transition-colors"
                      [class]="rotaSac() ? 'text-[#E35205] font-semibold' : 'text-stone-600'">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 256 256" class="shrink-0"><path d="M222.37,158.46l-47.11-21.11-.13-.06a16,16,0,0,0-15.17,1.4,8.12,8.12,0,0,0-.75.56L134.87,160c-15.42-7.49-31.34-23.29-38.83-38.51l20.78-24.71c.2-.25.39-.5.57-.77a16,16,0,0,0,1.32-15.06v-.12L97.54,33.64a16,16,0,0,0-16.62-9.52A56.26,56.26,0,0,0,32,80c0,79.4,64.6,144,144,144a56.26,56.26,0,0,0,55.88-48.92A16,16,0,0,0,222.37,158.46Z"/></svg>
                <span>SAC</span>
                <svg width="12" height="12" fill="currentColor" viewBox="0 0 256 256" class="shrink-0 transition-transform" [class.rotate-180]="sacAberto()"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg>
              </button>
              @if (sacAberto()) {
                <div class="absolute left-0 top-full mt-3 w-52 bg-white border border-stone-200 rounded-xl shadow-lg py-1.5 z-50">
                  <a routerLink="/chamados" routerLinkActive="text-[#E35205] font-semibold bg-orange-50/60"
                     class="flex items-center gap-2 px-4 py-2 text-stone-600 hover:bg-stone-50 hover:text-[#E35205] transition-colors">
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 256 256" class="shrink-0"><path d="M222.37,158.46l-47.11-21.11-.13-.06a16,16,0,0,0-15.17,1.4,8.12,8.12,0,0,0-.75.56L134.87,160c-15.42-7.49-31.34-23.29-38.83-38.51l20.78-24.71c.2-.25.39-.5.57-.77a16,16,0,0,0,1.32-15.06v-.12L97.54,33.64a16,16,0,0,0-16.62-9.52A56.26,56.26,0,0,0,32,80c0,79.4,64.6,144,144,144a56.26,56.26,0,0,0,55.88-48.92A16,16,0,0,0,222.37,158.46Z"/></svg>
                    Chamados SAC
                  </a>
                  @if (sessao.temVisaoGeral()) {
                    <a routerLink="/dashboard" routerLinkActive="text-[#E35205] font-semibold bg-orange-50/60"
                       class="flex items-center gap-2 px-4 py-2 text-stone-600 hover:bg-stone-50 hover:text-[#E35205] transition-colors">
                      <svg width="16" height="16" fill="currentColor" viewBox="0 0 256 256" class="shrink-0"><path d="M224,200h-8V40a8,8,0,0,0-8-8H152a8,8,0,0,0-8,8V72H96a8,8,0,0,0-8,8v40H48a8,8,0,0,0-8,8v72H32a8,8,0,0,0,0,16H224a8,8,0,0,0,0-16Z"/></svg>
                      Dashboard SAC
                    </a>
                  }
                </div>
              }
            </div>
            <a routerLink="/ouvidoria" routerLinkActive="text-[#E35205] font-semibold"
               class="flex items-center gap-1.5 text-stone-600 hover:text-[#E35205] transition-colors">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 256 256" class="shrink-0"><path d="M201.89,54.66A103.43,103.43,0,0,0,128.79,24H128A104,104,0,0,0,24,128v56a24,24,0,0,0,24,24H64a24,24,0,0,0,24-24V144a24,24,0,0,0-24-24H40.36A88.12,88.12,0,0,1,190.54,65.93,87.39,87.39,0,0,1,215.65,120H192a24,24,0,0,0-24,24v40a24,24,0,0,0,24,24h24a24,24,0,0,1-24,24H136a8,8,0,0,0,0,16h56a40,40,0,0,0,40-40V128A103.41,103.41,0,0,0,201.89,54.66ZM64,136a8,8,0,0,1,8,8v40a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V136Zm128,56a8,8,0,0,1-8-8V144a8,8,0,0,1,8-8h24v56Z"/></svg>
              <span>Ouvidoria</span>
            </a>
          </nav>
        </div>
        <div class="flex items-center gap-3 sm:gap-4 shrink-0">
          <button (click)="tema.alternar()" class="text-stone-500 hover:text-[#E35205] transition-colors" title="Alternar modo noturno">
            @if (!tema.escuro()) {
              <svg width="19" height="19" fill="currentColor" viewBox="0 0 256 256"><path d="M120,40V16a8,8,0,0,1,16,0V40a8,8,0,0,1-16,0Zm72,88a64,64,0,1,1-64-64A64.07,64.07,0,0,1,192,128Zm-16,0a48,48,0,1,0-48,48A48.05,48.05,0,0,0,176,128ZM58.34,69.66A8,8,0,0,0,69.66,58.34l-16-16A8,8,0,0,0,42.34,53.66Zm0,116.68-16,16a8,8,0,0,0,11.32,11.32l16-16a8,8,0,0,0-11.32-11.32ZM192,72a8,8,0,0,0,5.66-2.34l16-16a8,8,0,0,0-11.32-11.32l-16,16A8,8,0,0,0,192,72Zm5.66,114.34a8,8,0,0,0-11.32,11.32l16,16a8,8,0,0,0,11.32-11.32ZM48,128a8,8,0,0,0-8-8H16a8,8,0,0,0,0,16H40A8,8,0,0,0,48,128Zm80,80a8,8,0,0,0-8,8v24a8,8,0,0,0,16,0V216A8,8,0,0,0,128,208Zm112-88H216a8,8,0,0,0,0,16h24a8,8,0,0,0,0-16Z"/></svg>
            } @else {
              <svg width="19" height="19" fill="currentColor" viewBox="0 0 256 256"><path d="M233.54,142.23a8,8,0,0,0-8-2,88.08,88.08,0,0,1-109.8-109.8,8,8,0,0,0-10-10,104.84,104.84,0,0,0-52.91,37A104,104,0,0,0,136,224a103.09,103.09,0,0,0,62.52-20.88,104.84,104.84,0,0,0,37-52.91A8,8,0,0,0,233.54,142.23ZM188.9,190.34A88,88,0,0,1,65.66,67.11a89,89,0,0,1,31.4-26A106,106,0,0,0,96,56,104.11,104.11,0,0,0,200,160a106,106,0,0,0,14.92-1.06A89,89,0,0,1,188.9,190.34Z"/></svg>
            }
          </button>
          <div class="h-6 w-px bg-stone-200 hidden sm:block"></div>
          <span class="text-sm text-stone-500 hidden md:inline">{{ sessao.usuario()?.nome }}</span>
          <button (click)="sessao.encerrar(null)" class="flex items-center gap-1.5 text-stone-500 hover:text-red-500 transition-colors text-sm font-semibold" title="Sair">
            <svg width="18" height="18" fill="currentColor" viewBox="0 0 256 256" class="shrink-0"><path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.84,8c18.84-32.56,52.14-52,89.08-52s70.24,19.44,89.08,52a8,8,0,1,0,13.84-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z"/></svg>
            <span class="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>
    </header>
  `
})
export class CabecalhoComponent {
  readonly sessao = inject(SessaoService);
  readonly tema = inject(TemaService);
  private router = inject(Router);
  private el = inject(ElementRef<HTMLElement>);

  /** Dropdown "SAC" aberto? */
  readonly sacAberto = signal(false);
  /** true quando a tela atual é do SAC (deixa o botão "SAC" laranja). */
  readonly rotaSac = signal(false);

  constructor() {
    inject(OuvidoriaApiService).acordar();   // a API da ouvidoria demora a acordar: já começa agora
    this.marcarRota();
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => {
      this.marcarRota();
      this.sacAberto.set(false);   // escolheu uma tela: fecha o menu
    });
  }

  private marcarRota(): void {
    const url = this.router.url;
    this.rotaSac.set(url.startsWith('/chamados') || url.startsWith('/dashboard'));
  }

  /** Clique fora do menu ou Esc: fecha. */
  @HostListener('document:click', ['$event'])
  aoClicarFora(ev: MouseEvent): void {
    const menu = (this.el.nativeElement as HTMLElement).querySelector('[data-menu-sac]');
    if (this.sacAberto() && menu && !menu.contains(ev.target as Node)) this.sacAberto.set(false);
  }

  @HostListener('document:keydown.escape')
  aoEsc(): void { this.sacAberto.set(false); }
}
