import { Injectable, signal } from '@angular/core';

const CHAVE = 'sac_modo_noturno';

@Injectable({ providedIn: 'root' })
export class TemaService {
  readonly escuro = signal<boolean>(false);

  constructor() {
    const salvo = localStorage.getItem(CHAVE) === '1';
    this.aplicar(salvo);
  }

  alternar(): void { this.aplicar(!this.escuro()); }

  private aplicar(escuro: boolean): void {
    this.escuro.set(escuro);
    document.documentElement.classList.toggle('dark', escuro);
    localStorage.setItem(CHAVE, escuro ? '1' : '0');
  }
}
