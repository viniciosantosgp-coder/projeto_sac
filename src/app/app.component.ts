import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SessaoService } from './core/sessao.service';
import { CabecalhoComponent } from './features/shell/cabecalho.component';
import { HistoricoClienteComponent } from './features/cliente/historico-cliente.component';
import { MODO_LOCAL } from './core/firebase-config';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CabecalhoComponent, HistoricoClienteComponent],
  template: `
    @if (modoLocal) {
      <div class="bg-amber-400 text-amber-950 text-xs font-bold text-center py-1">MODO LOCAL DE VALIDAÇÃO · banco de teste (sac-ouvidoria-teste) · dados fictícios · nada vai para produção</div>
    }
    @if (sessao.autenticado()) {
      <app-cabecalho />
      <app-historico-cliente />
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
  readonly modoLocal = MODO_LOCAL;

  constructor() {
    // revalida o token guardado assim que o app sobe
    if (this.sessao.tentarAutoLogin()) {
      this.sessao.validarNoServidor(true).then(ok => { if (!ok) this.sessao.encerrar('invalida'); });
    }
  }
}
