/*
 * CPF no SAC está gravado em formatos misturados ("133.658.076-32", "13365807632" e, às vezes,
 * sem o zero à esquerda). Para cruzar SAC e Ouvidoria, tudo é comparado pela chave de 11 dígitos.
 */

export const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** Chave de comparação: 11 dígitos (completa zeros à esquerda). Vazio se não parecer CPF. */
export function chaveCpf(v: unknown): string {
  const d = soDigitos(v);
  return d.length >= 9 && d.length <= 11 ? d.padStart(11, '0') : '';
}

export function formatarCpf(v: unknown): string {
  const c = chaveCpf(v);
  return c ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : String(v ?? '');
}

/** Dígitos verificadores conferem. */
export function cpfValido(v: unknown): boolean {
  const c = soDigitos(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(c[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
