import { Chamado, EventoStatus, Observacao, StatusChamado } from './modelos';
import {
  SAC_SLA_DIAS_POR_GRAVIDADE, SAC_SLA_DIAS_PADRAO, SAC_STATUS_LABEL,
  SAC_ESQUEMA_VERSAO
} from './constantes';

/* ===================== STATUS ===================== */
/** Registros antigos (sem o campo ou vazio) continuam valendo como "Em tratativa". */
export function statusChamado(r?: Partial<Chamado> | null): StatusChamado {
  const s = String((r && r.status) || '').trim();
  if (s === 'Resolvida') return 'Resolvida';
  if (s === 'Aberto') return 'Aberto';
  return 'Pendente';
}
export function rotuloStatus(r?: Partial<Chamado> | null): string { return SAC_STATUS_LABEL[statusChamado(r)]; }
export function chamadoResolvido(r?: Partial<Chamado> | null): boolean { return statusChamado(r) === 'Resolvida'; }
export function chamadoAberto(r?: Partial<Chamado> | null): boolean { return statusChamado(r) === 'Aberto'; }

/* ===================== SLA ===================== */
export function slaDiasPorGravidade(gravidade?: string): number {
  const d = SAC_SLA_DIAS_POR_GRAVIDADE[String(gravidade || '').trim()];
  return d != null ? d : SAC_SLA_DIAS_PADRAO;
}

/** Prefere o prazo GRAVADO no chamado: mudar a tabela não reescreve o histórico. */
export function slaDiasPara(r?: Partial<Chamado> | null): number {
  const gravado = Number(r && r.slaDias);
  return Number.isFinite(gravado) && gravado > 0 ? gravado : slaDiasPorGravidade(r?.gravidade);
}

export function slaVencimento(r?: Partial<Chamado> | null): Date | null {
  if (r && r.slaVenceEm) {
    const d = new Date(r.slaVenceEm);
    if (!isNaN(d.getTime())) return d;
  }
  const base = new Date(String(r?.criadoEm ?? ''));
  if (isNaN(base.getTime())) return null;
  return new Date(base.getTime() + slaDiasPara(r) * 86400000);
}

export function duracaoDiasChamado(r?: Partial<Chamado> | null): number | null {
  if (!r || !chamadoResolvido(r) || !r.resolvidoEm) return null;
  const d = (new Date(r.resolvidoEm).getTime() - new Date(String(r.criadoEm)).getTime()) / 86400000;
  return isFinite(d) && d >= 0 ? d : null;
}

/** > 0 dentro do prazo | < 0 atrasado. Chamado resolvido congela no fechamento. */
export function diasRestantesSla(r?: Partial<Chamado> | null): number | null {
  const venc = slaVencimento(r);
  if (!venc) return null;
  const ref = (chamadoResolvido(r) && r?.resolvidoEm) ? new Date(r.resolvidoEm) : new Date();
  if (isNaN(ref.getTime())) return null;
  return (venc.getTime() - ref.getTime()) / 86400000;
}

export function slaEstourado(r?: Partial<Chamado> | null): boolean {
  const d = diasRestantesSla(r);
  return d != null && d < 0;
}

export function prazoCurto(dias: number): string {
  const abs = Math.abs(dias);
  if (abs < 1) return Math.max(1, Math.round(abs * 24)) + 'h';
  return Math.round(abs) + 'd';
}

export function textoSla(r?: Partial<Chamado> | null, longo = false): string {
  const rest = diasRestantesSla(r);
  if (rest == null) return '—';
  const curto = prazoCurto(rest);
  if (chamadoResolvido(r)) {
    if (longo) return rest < 0 ? `estourou o prazo em ${curto}` : `cumprido com ${curto} de folga`;
    return rest < 0 ? `Estourado +${curto}` : `Cumprido · folga ${curto}`;
  }
  if (longo) return rest < 0 ? `atrasado há ${curto}` : `faltam ${curto} para vencer`;
  return rest < 0 ? `Atrasado ${curto}` : `Faltam ${curto}`;
}

export function classeBadgeSla(r?: Partial<Chamado> | null): string {
  const rest = diasRestantesSla(r);
  if (slaEstourado(r)) return 'bg-red-50 text-red-700 border-red-200';
  if (!chamadoResolvido(r) && rest != null && rest <= 1) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-green-50 text-green-700 border-green-200';
}

export function textoBadgeSla(r?: Partial<Chamado> | null): string {
  return chamadoResolvido(r) ? textoSla(r) : `SLA ${slaDiasPara(r)}d · ${textoSla(r)}`;
}

export function idadeDiasSac(criadoEm: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(criadoEm).getTime()) / 86400000));
}

/* ===================== PACOTES GRAVADOS ===================== */
export function camposSlaDoChamado(r: Partial<Chamado>, quando?: string): Partial<Chamado> {
  const dias = slaDiasPorGravidade(r.gravidade);
  const base = new Date(r.criadoEm || quando || Date.now());
  return {
    slaDias: dias,
    slaGravidade: r.gravidade || '',
    slaVenceEm: new Date(base.getTime() + dias * 86400000).toISOString()
  };
}

export function camposFechamentoSla(r: Partial<Chamado>, resolvidoEmIso: string): Partial<Chamado> {
  const dur = (new Date(resolvidoEmIso).getTime() - new Date(String(r.criadoEm)).getTime()) / 86400000;
  const prazo = slaDiasPara(r);
  const cumprido = isFinite(dur) ? dur <= prazo : null;
  return {
    duracaoDias: isFinite(dur) ? Number(dur.toFixed(3)) : null,
    slaCumprido: cumprido,
    slaStatus: cumprido == null ? '' : (cumprido ? 'Dentro do SLA' : 'Estourado')
  };
}

export function historicoDe(r?: Partial<Chamado> | null): EventoStatus[] {
  return Array.isArray(r?.historicoStatus) ? r!.historicoStatus!.slice() : [];
}

export function novoEventoStatus(de: string, para: string, quando: string, por: string, origem = 'app'): EventoStatus {
  return { de: de || '', para, em: quando, por, origem };
}

/** Pacote gravado quando o chamado muda de estado. */
export function patchMudancaStatus(r: Partial<Chamado> | null, novoStatus: StatusChamado, usuario: string, origem = 'app'): Partial<Chamado> {
  const agora = new Date().toISOString();
  const de = r ? statusChamado(r) : '';
  const historico = historicoDe(r);
  if (de !== novoStatus) historico.push(novoEventoStatus(de, novoStatus, agora, usuario, origem));

  const patch: Partial<Chamado> = {
    status: novoStatus,
    statusAtualizadoEm: agora,
    atualizadoEm: agora,
    atualizadoPor: usuario,
    ultimaAtuacaoPor: usuario,
    ultimaAtuacaoEm: agora,
    versaoEsquema: SAC_ESQUEMA_VERSAO,
    historicoStatus: historico
  };

  if (!r || !r.slaDias || !r.slaVenceEm) Object.assign(patch, camposSlaDoChamado(r || {}, agora));

  if (novoStatus === 'Resolvida') {
    patch.resolvidoEm = agora;
    patch.resolvidoPor = usuario;
    Object.assign(patch, camposFechamentoSla({ ...(r || {}), ...patch }, agora));
  } else {
    patch.resolvidoEm = '';
    patch.duracaoDias = null;
    patch.slaCumprido = null;
    patch.slaStatus = '';
    if (de === 'Resolvida') { patch.reabertoEm = agora; patch.reabertoPor = usuario; }
    if (novoStatus === 'Pendente' && de === 'Aberto') {
      patch.tratativaIniciadaEm = agora;
      patch.tratativaPor = usuario;
    }
  }
  return patch;
}

/** Backfill de um registro antigo para o esquema atual. */
export function patchNormalizacao(r: Chamado, usuario: string): Partial<Chamado> {
  const st = statusChamado(r);
  const patch: Partial<Chamado> = {
    status: st,
    versaoEsquema: SAC_ESQUEMA_VERSAO,
    atualizadoEm: new Date().toISOString(),
    atualizadoPor: usuario,
    ...camposSlaDoChamado(r, r.criadoEm)
  };

  if (!Array.isArray(r.historicoStatus) || !r.historicoStatus.length) {
    const eventos: EventoStatus[] = [{
      de: '', para: st === 'Resolvida' ? 'Pendente' : st,
      em: r.criadoEm || new Date().toISOString(), por: r.atendente || 'Desconhecido', origem: 'migração'
    }];
    if (st === 'Resolvida') {
      eventos.push({
        de: 'Pendente', para: 'Resolvida',
        em: r.resolvidoEm || r.criadoEm || new Date().toISOString(),
        por: r.atendente || 'Desconhecido', origem: 'migração'
      });
    }
    patch.historicoStatus = eventos;
  }

  if (st === 'Resolvida' && r.resolvidoEm) {
    Object.assign(patch, camposFechamentoSla({ ...r, ...patch }, r.resolvidoEm));
  } else {
    patch.duracaoDias = null;
    patch.slaCumprido = null;
    patch.slaStatus = '';
  }

  if (!Array.isArray(r.observacoes)) {
    const partes = String(r.descricao || '').split(/\n\n+/).filter(p => p.trim());
    patch.observacoes = partes.map((p, i): Observacao => ({
      em: i === 0 ? (r.criadoEm || '') : '',
      por: r.atendente || 'Desconhecido',
      texto: p.trim(),
      tipo: i === 0 ? 'descricao' : 'observacao'
    }));
  }
  // não se inventa data que nunca existiu
  if (r.tratativaIniciadaEm == null) patch.tratativaIniciadaEm = '';
  if (r.criadoPor == null) patch.criadoPor = r.atendente || 'Desconhecido';
  return patch;
}

export function precisaNormalizar(r: Chamado): boolean {
  if (!r) return false;
  return Number(r.versaoEsquema) < SAC_ESQUEMA_VERSAO || !r.versaoEsquema;
}

/** Quem está com o chamado agora (sinalização, não trava). */
export function responsavelDoChamado(r?: Chamado | null): string {
  if (!r) return '';
  if (chamadoResolvido(r)) return r.resolvidoPor || '';
  if (chamadoAberto(r)) return '';
  return r.tratativaPor || r.ultimaAtuacaoPor || '';
}
