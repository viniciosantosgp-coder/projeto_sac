import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SessaoService } from './core/sessao.service';
import { CabecalhoComponent } from './features/shell/cabecalho.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CabecalhoComponent],
  template: `
    @if (sessao.autenticado()) {
      <app-cabecalho />
      <main class="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <router-outlet />
      </main>
    } @else {
      <router-outlet />
    }
  `
})
export class AppComponent {
  readonly sessao = inject(SessaoService);

  constructor() {
    // revalida o token guardado assim que o app sobe
    if (this.sessao.tentarAutoLogin()) {
      this.sessao.validarNoServidor(true).then(ok => { if (!ok) this.sessao.encerrar('invalida'); });
    }
  }
}
