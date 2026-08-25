import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SessaoService } from '../../core/sessao.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="min-h-screen flex items-center justify-center px-6">
      <div class="w-full max-w-md">
        <div class="text-center mb-8">
          <span class="text-4xl logo-presenca text-[#E35205]">Presença</span>
          <p class="text-stone-500 mt-2">SAC</p>
        </div>
        <div class="card bg-white border border-stone-200 rounded-2xl p-8 shadow-sm anima-entrada">
          <div class="mb-5">
            <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1.5">Login</label>
            <input [(ngModel)]="login" type="text" class="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm">
          </div>
          <div class="mb-6">
            <label class="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1.5">Senha</label>
            <input [(ngModel)]="senha" type="password" (keydown.enter)="entrar()" class="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm">
          </div>
          <button (click)="entrar()" [disabled]="carregando()" class="w-full py-3 bg-[#E35205] text-white rounded-lg text-sm font-semibold hover:bg-[#c44503] transition-colors disabled:opacity-60">
            {{ carregando() ? 'Entrando...' : 'Entrar' }}
          </button>
          @if (erro()) { <p class="text-sm text-red-600 mt-4">{{ erro() }}</p> }
          @if (!erro() && sessao.aviso()) { <p class="text-sm text-amber-600 mt-4">{{ sessao.aviso() }}</p> }
        </div>
      </div>
    </div>
  `
})
export class LoginComponent {
  readonly sessao = inject(SessaoService);
  private router = inject(Router);

  login = '';
  senha = '';
  readonly erro = signal('');
  readonly carregando = signal(false);

  async entrar(): Promise<void> {
    if (!this.login || !this.senha) { this.erro.set('Preencha login e senha.'); return; }
    this.carregando.set(true);
    this.erro.set('');
    const r = await this.sessao.entrar(this.login.trim(), this.senha);
    this.carregando.set(false);
    if (r.ok) this.router.navigate(['/chamados']);
    else this.erro.set(r.erro || 'Não foi possível entrar.');
  }
}
