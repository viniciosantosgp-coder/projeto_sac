import { Signal, computed, signal } from '@angular/core';

/** Estado e contas de uma lista paginada. Crie um por lista com `criarPaginador`. */
export interface Paginador<T> {
  readonly porPagina: number;
  readonly total: Signal<number>;
  readonly totalPaginas: Signal<number>;
  readonly atual: Signal<number>;
  /** Só os itens da página atual — é isso que a tela percorre no @for. */
  readonly itens: Signal<T[]>;
  readonly inicio: Signal<number>;
  readonly fim: Signal<number>;
  /** Números dos botões; 0 = reticências. */
  readonly paginasVisiveis: Signal<number[]>;
  ir(pagina: number): void;
  /** Volta para a página 1 (usar quando o filtro muda). */
  reiniciar(): void;
}

/**
 * @param fonte    a lista completa (já filtrada e ordenada), como signal/computed
 * @param porPagina quantos itens por página
 */
export function criarPaginador<T>(fonte: () => T[], porPagina: number): Paginador<T> {
  const pagina = signal(1);
  const total = computed(() => fonte().length);
  const totalPaginas = computed(() => Math.max(1, Math.ceil(total() / porPagina)));
  // se a lista encolher (ex.: resolveu o último da página), não fica numa página que não existe mais
  const atual = computed(() => Math.min(pagina(), totalPaginas()));

  return {
    porPagina,
    total,
    totalPaginas,
    atual,
    itens: computed(() => {
      const ini = (atual() - 1) * porPagina;
      return fonte().slice(ini, ini + porPagina);
    }),
    inicio: computed(() => total() ? (atual() - 1) * porPagina + 1 : 0),
    fim: computed(() => Math.min(atual() * porPagina, total())),
    // primeira, última e 1 vizinha de cada lado da atual
    paginasVisiveis: computed(() => {
      const ult = totalPaginas(), at = atual();
      const mostrar = new Set([1, ult, at - 1, at, at + 1]);
      const lista: number[] = [];
      for (let p = 1; p <= ult; p++) {
        if (!mostrar.has(p)) continue;
        if (lista.length && p - lista[lista.length - 1] > 1) lista.push(0);
        lista.push(p);
      }
      return lista;
    }),
    ir: (p: number) => pagina.set(Math.min(Math.max(1, p), totalPaginas())),
    reiniciar: () => pagina.set(1)
  };
}
