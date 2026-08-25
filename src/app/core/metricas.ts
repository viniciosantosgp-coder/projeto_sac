import { Chamado } from './modelos';
import {
  chamadoAberto, chamadoResolvido, diasRestantesSla, duracaoDiasChamado,
  historicoDe, idadeDiasSac, rotuloStatus, slaDiasPara, slaEstourado, statusChamado
} from './dominio';

export interface EstatisticaAtendente {
  nome: string; total: number; resolvidos: number; pendentes: number; abertos: number;
  dentroSla: number; duracoesDias: number[]; percSla: number; tempoMedio: number | null;
}

export interface AtuacaoAnalista {
  nome: string; chamadosAtuados: number; tratativas: number; observacoes: number;
  resolucoes: number; reaberturas: number; toques: number;
  percSla: number | null; tempoMedio: number | null;
}

export interface SlaPorGravidade {
  gravidade: string; prazo: number; total: number; dentro: number; estourado: number;
  emRisco: number; resolvidos: number; percCumprimento: number; tempoMedio: number | null;
}

export function contarPor(registros: Chamado[], campo: keyof Chamado): Array<[string, number]> {
  const mapa: Record<string, number> = {};
  registros.forEach(r => {
    const v = String(r[campo] ?? '') || 'Não informado';
    mapa[v] = (mapa[v] || 0) + 1;
  });
  return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
}

export function contarPorStatus(registros: Chamado[]): Array<[string, number]> {
  const mapa: Record<string, number> = {};
  registros.forEach(r => { const s = rotuloStatus(r); mapa[s] = (mapa[s] || 0) + 1; });
  return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
}

/** Produção por quem REGISTROU o chamado. */
export function calcularEstatisticas(registros: Chamado[]): EstatisticaAtendente[] {
  const mapa: Record<string, EstatisticaAtendente> = {};
  registros.forEach(r => {
    const nome = r.atendente || 'Desconhecido';
    if (!mapa[nome]) mapa[nome] = {
      nome, total: 0, resolvidos: 0, pendentes: 0, abertos: 0,
      dentroSla: 0, duracoesDias: [], percSla: 0, tempoMedio: null
    };
    const it = mapa[nome];
    it.total++;
    if (chamadoResolvido(r)) {
      it.resolvidos++;
      const dur = duracaoDiasChamado(r);
      if (dur != null) { it.duracoesDias.push(dur); if (dur <= slaDiasPara(r)) it.dentroSla++; }
    } else {
      if (chamadoAberto(r)) it.abertos++; else it.pendentes++;
      if (!slaEstourado(r)) it.dentroSla++;
    }
  });
  return Object.values(mapa).map(it => ({
    ...it,
    percSla: it.total ? it.dentroSla / it.total : 0,
    tempoMedio: it.duracoesDias.length ? it.duracoesDias.reduce((a, b) => a + b, 0) / it.duracoesDias.length : null
  })).sort((a, b) => a.nome.localeCompare(b.nome));
}

/** Pessoas que atuaram no chamado (abertura não conta — ela é medida no outro quadro). */
export function pessoasQueAtuaram(r: Chamado): Set<string> {
  const nomes = new Set<string>();
  historicoDe(r).forEach(ev => {
    if (ev?.por && ev.origem !== 'migração' && ev.origem !== 'abertura') nomes.add(ev.por);
  });
  (Array.isArray(r.observacoes) ? r.observacoes : []).forEach(o => {
    if (o?.tipo === 'observacao' && o.por && o.em) nomes.add(o.por);
  });
  return nomes;
}

export function chamadosAtuadosPor(nome: string, base: Chamado[]): Chamado[] {
  return (base || []).filter(r => pessoasQueAtuaram(r).has(nome));
}

export function chamadosSemAtuacaoRegistrada(registros: Chamado[]): number {
  return registros.filter(r => pessoasQueAtuaram(r).size === 0).length;
}

/** Produção por ATUAÇÃO, lida da trilha gravada. */
export function calcularAtuacao(registros: Chamado[]): AtuacaoAnalista[] {
  interface Acc {
    nome: string; chamados: Set<string>; tratativas: number; observacoes: number;
    resolucoes: number; reaberturas: number; dentroSla: number; duracoes: number[];
  }
  const mapa: Record<string, Acc> = {};
  const garante = (nome: string): Acc => {
    if (!mapa[nome]) mapa[nome] = {
      nome, chamados: new Set<string>(), tratativas: 0, observacoes: 0,
      resolucoes: 0, reaberturas: 0, dentroSla: 0, duracoes: []
    };
    return mapa[nome];
  };

  registros.forEach(r => {
    historicoDe(r).forEach(ev => {
      if (!ev?.por || ev.origem === 'migração' || ev.origem === 'abertura') return;
      const it = garante(ev.por);
      it.chamados.add(String(r.id));
      if (ev.para === 'Pendente' && ev.de === 'Aberto') it.tratativas++;
      else if (ev.para === 'Resolvida') {
        it.resolucoes++;
        const dur = duracaoDiasChamado({ ...r, resolvidoEm: ev.em, status: 'Resolvida' });
        if (dur != null) { it.duracoes.push(dur); if (dur <= slaDiasPara(r)) it.dentroSla++; }
      } else if (ev.de === 'Resolvida') it.reaberturas++;
    });
    (Array.isArray(r.observacoes) ? r.observacoes : []).forEach(o => {
      if (o?.tipo !== 'observacao' || !o.por || !o.em) return;
      const it = garante(o.por);
      it.chamados.add(String(r.id));
      it.observacoes++;
    });
  });

  return Object.values(mapa).map((it): AtuacaoAnalista => ({
    nome: it.nome,
    chamadosAtuados: it.chamados.size,
    tratativas: it.tratativas,
    observacoes: it.observacoes,
    resolucoes: it.resolucoes,
    reaberturas: it.reaberturas,
    toques: it.tratativas + it.observacoes + it.resolucoes + it.reaberturas,
    percSla: it.resolucoes ? it.dentroSla / it.resolucoes : null,
    tempoMedio: it.duracoes.length ? it.duracoes.reduce((a, b) => a + b, 0) / it.duracoes.length : null
  })).sort((a, b) => b.toques - a.toques || b.chamadosAtuados - a.chamadosAtuados);
}

export function apurarSlaPorGravidade(registros: Chamado[]): SlaPorGravidade[] {
  const ordem = ['Crítica', 'Alta', 'Média', 'Baixa'];
  const mapa: Record<string, SlaPorGravidade & { duracoes: number[] }> = {};
  registros.forEach(r => {
    const g = r.gravidade || 'Não informado';
    if (!mapa[g]) mapa[g] = {
      gravidade: g, prazo: slaDiasPara(r), total: 0, dentro: 0, estourado: 0,
      emRisco: 0, resolvidos: 0, percCumprimento: 0, tempoMedio: null, duracoes: []
    };
    const it = mapa[g];
    it.total++;
    if (slaEstourado(r)) it.estourado++; else it.dentro++;
    const rest = diasRestantesSla(r);
    if (!chamadoResolvido(r) && !slaEstourado(r) && (rest ?? 99) <= 1) it.emRisco++;
    const dur = duracaoDiasChamado(r);
    if (dur != null) { it.resolvidos++; it.duracoes.push(dur); }
  });
  return Object.values(mapa)
    .sort((a, b) => {
      const ia = ordem.indexOf(a.gravidade), ib = ordem.indexOf(b.gravidade);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .map(({ duracoes, ...it }) => ({
      ...it,
      percCumprimento: it.total ? it.dentro / it.total : 0,
      tempoMedio: duracoes.length ? duracoes.reduce((a, b) => a + b, 0) / duracoes.length : null
    }));
}

export function resumoPeriodo(registros: Chamado[]) {
  const abertos = registros.filter(chamadoAberto);
  const emTratativa = registros.filter(r => statusChamado(r) === 'Pendente');
  const resolvidos = registros.filter(chamadoResolvido);
  const naoResolvidos = registros.filter(r => !chamadoResolvido(r));
  const estourados = registros.filter(slaEstourado).length;
  const emRisco = naoResolvidos.filter(r => !slaEstourado(r) && (diasRestantesSla(r) ?? 99) <= 1).length;
  const duracoes = resolvidos.map(duracaoDiasChamado).filter((d): d is number => d != null);
  return {
    total: registros.length,
    abertos, emTratativa, resolvidos, naoResolvidos,
    estourados, emRisco,
    estouradosEmAberto: naoResolvidos.filter(slaEstourado).length,
    taxaResolucao: registros.length ? Math.round((resolvidos.length / registros.length) * 100) : 0,
    tempoMedioDias: duracoes.length ? duracoes.reduce((a, b) => a + b, 0) / duracoes.length : null,
    idadeMedia: registros.length ? registros.reduce((a, r) => a + idadeDiasSac(r.criadoEm), 0) / registros.length : 0
  };
}
