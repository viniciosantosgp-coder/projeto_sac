import { Injectable, inject } from '@angular/core';
import type { Workbook, Worksheet } from 'exceljs';
import { Chamado } from './modelos';
import { SessaoService } from './sessao.service';
import {
  chamadoAberto, chamadoResolvido, diasRestantesSla, duracaoDiasChamado, historicoDe,
  idadeDiasSac, responsavelDoChamado, rotuloStatus, slaDiasPara, slaEstourado, slaVencimento, statusChamado
} from './dominio';
import {
  apurarSlaPorGravidade, calcularAtuacao, calcularEstatisticas, chamadosSemAtuacaoRegistrada,
  contarPor, contarPorStatus, resumoPeriodo
} from './metricas';
import { PIZZA_HEX_GRAVIDADE, PIZZA_HEX_PRODUTO, PIZZA_HEX_STATUS, PIZZA_PALETA, SAC_SLA_RESUMO, SAC_STATUS_LABEL } from './constantes';

const LARANJA = 'FFE35205';

export interface FiltroExport { dataInicio: string; dataFim: string; produto: string; }

@Injectable({ providedIn: 'root' })
export class ExcelService {
  private sessao = inject(SessaoService);

  private escapar(t: string): string {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private perc(v: number, total: number): string {
    if (!total) return '0%';
    return (v / total * 100).toFixed(1).replace('.', ',') + '%';
  }

  /** Gera um PNG do gráfico de rosca para embutir na planilha. */
  private async pngDonut(dados: Array<[string, number]>, titulo: string, cores?: Record<string, string>): Promise<string | null> {
    const L = 720, A = 380, cx = 190, cy = 205, R = 130, ri = 78;
    const total = dados.reduce((a, d) => a + d[1], 0);
    if (!total) return null;

    let ang = -Math.PI / 2, fatias = '', legenda = '';
    dados.forEach(([rot, v], i) => {
      const frac = v / total;
      const cor = (cores && cores[rot]) || PIZZA_PALETA[i % PIZZA_PALETA.length];
      const p = (raio: number, a: number) => `${(cx + raio * Math.cos(a)).toFixed(2)} ${(cy + raio * Math.sin(a)).toFixed(2)}`;
      if (frac >= 0.9999) {
        fatias += `<circle cx="${cx}" cy="${cy}" r="${(R + ri) / 2}" fill="none" stroke="${cor}" stroke-width="${R - ri}"/>`;
      } else {
        const a0 = ang, a1 = ang + frac * 2 * Math.PI, g = frac > 0.5 ? 1 : 0;
        fatias += `<path d="M ${p(R, a0)} A ${R} ${R} 0 ${g} 1 ${p(R, a1)} L ${p(ri, a1)} A ${ri} ${ri} 0 ${g} 0 ${p(ri, a0)} Z" fill="${cor}" stroke="#ffffff" stroke-width="2"/>`;
        ang = a1;
      }
      const y = 96 + i * 30;
      const rotCurto = rot.length > 28 ? rot.slice(0, 27) + '…' : rot;
      legenda += `<rect x="386" y="${y - 11}" width="13" height="13" rx="3" fill="${cor}"/>`
        + `<text x="408" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#44403c">${this.escapar(rotCurto)}</text>`
        + `<text x="706" y="${y}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="bold" fill="#1c1917">${v} (${this.perc(v, total)})</text>`;
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${A}" viewBox="0 0 ${L} ${A}">
      <rect width="${L}" height="${A}" fill="#ffffff"/>
      <text x="28" y="42" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="bold" fill="#1c1917">${this.escapar(titulo)}</text>
      ${fatias}
      <text x="${cx}" y="${cy + 2}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="bold" fill="#1c1917">${total}</text>
      <text x="${cx}" y="${cy + 26}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#a8a29e">CHAMADOS</text>
      ${legenda}
    </svg>`;

    return new Promise<string | null>(resolve => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = L * 2; cv.height = A * 2;
        const ctx = cv.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/png').split(',')[1]);
      };
      img.onerror = () => resolve(null);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  private cabecalho(ws: Worksheet, linha: number, colunas: string[]): void {
    const row = ws.getRow(linha);
    colunas.forEach((c, i) => {
      const cel = row.getCell(i + 1);
      cel.value = c;
      cel.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA } };
      cel.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' };
    });
    row.height = 22;
  }

  private titulo(ws: Worksheet, linha: number, texto: string, tamanho = 14): void {
    const cel = ws.getCell(linha, 1);
    cel.value = texto;
    cel.font = { bold: true, size: tamanho, color: { argb: 'FF1C1917' } };
  }

  /** Monta e baixa a planilha do dashboard. */
  async exportarDashboard(registros: Chamado[], filtro: FiltroExport): Promise<string> {
    const ExcelJS = await import('exceljs');
    const wb: Workbook = new ExcelJS.Workbook();
    wb.creator = 'SAC — Grupo Presença';
    wb.created = new Date();

    const brData = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
    const resumo = resumoPeriodo(registros);
    const usuario = this.sessao.nomeUsuario();

    /* ---------- Aba 1: Resumo ---------- */
    const ws = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 34 }, { width: 14 }, { width: 12 }, { width: 4 }, { width: 34 }, { width: 14 }, { width: 12 }];
    this.titulo(ws, 1, 'Dashboard SAC — Grupo Presença', 16);
    ws.getCell('A2').value = `Período: ${brData(filtro.dataInicio)} a ${brData(filtro.dataFim)}  ·  Produto: ${filtro.produto}`;
    ws.getCell('A2').font = { size: 10, color: { argb: 'FF78716C' } };
    ws.getCell('A3').value = `Gerado em ${new Date().toLocaleString('pt-BR')} por ${usuario}  ·  SLA por gravidade: ${SAC_SLA_RESUMO}`;
    ws.getCell('A3').font = { size: 10, color: { argb: 'FF78716C' } };

    this.titulo(ws, 5, 'Indicadores', 12);
    this.cabecalho(ws, 6, ['Indicador', 'Valor', '']);
    const kpis: Array<[string, string | number]> = [
      ['Total de chamados', registros.length],
      ['Chamados abertos (sem tratativa)', resumo.abertos.length],
      ['Em tratativa', resumo.emTratativa.length],
      ['Resolvidos', resumo.resolvidos.length],
      ['Taxa de resolução', registros.length ? resumo.resolvidos.length / registros.length : 0],
      ['SLA estourado (chamados)', resumo.estourados],
      ['Tempo médio para resolver (dias)', resumo.tempoMedioDias != null ? Number(resumo.tempoMedioDias.toFixed(1)) : '—']
    ];
    kpis.forEach((k, i) => {
      const r = ws.getRow(7 + i);
      r.getCell(1).value = k[0];
      r.getCell(2).value = k[1];
      r.getCell(2).alignment = { horizontal: 'center' };
      r.getCell(2).font = { bold: true };
      if (k[0] === 'Taxa de resolução') r.getCell(2).numFmt = '0.0%';
    });

    let linha = 16;
    const slaGrav = apurarSlaPorGravidade(registros);
    this.titulo(ws, linha, 'SLA por gravidade', 12);
    this.cabecalho(ws, linha + 1, ['Gravidade', 'Prazo (dias)', 'Chamados']);
    slaGrav.forEach((it, i) => {
      const rr = ws.getRow(linha + 2 + i);
      rr.getCell(1).value = it.gravidade;
      rr.getCell(2).value = it.prazo;
      rr.getCell(3).value = it.total;
      [2, 3].forEach(c => rr.getCell(c).alignment = { horizontal: 'center' });
    });
    linha += slaGrav.length + 3;

    this.titulo(ws, linha, 'Cumprimento de SLA por gravidade', 12);
    this.cabecalho(ws, linha + 1, ['Gravidade', 'Dentro do prazo', 'Estourados']);
    slaGrav.forEach((it, i) => {
      const rr = ws.getRow(linha + 2 + i);
      rr.getCell(1).value = it.gravidade;
      rr.getCell(2).value = it.dentro;
      rr.getCell(3).value = it.estourado;
      [2, 3].forEach(c => rr.getCell(c).alignment = { horizontal: 'center' });
      if (it.estourado) rr.getCell(3).font = { bold: true, color: { argb: 'FFDC2626' } };
    });
    linha += slaGrav.length + 3;

    const blocos: Array<[string, Array<[string, number]>]> = [
      ['Chamados por produto', contarPor(registros, 'produto')],
      ['Chamados por gravidade', contarPor(registros, 'gravidade')],
      ['Chamados por status', contarPorStatus(registros)],
      ['Chamados por motivo', contarPor(registros, 'categoria')],
      ['Chamados por canal', contarPor(registros, 'canal')]
    ];
    blocos.forEach(([tit, dados]) => {
      this.titulo(ws, linha, tit, 12);
      const rotulo = tit.replace('Chamados por ', '');
      this.cabecalho(ws, linha + 1, [rotulo.charAt(0).toUpperCase() + rotulo.slice(1), 'Chamados', '%']);
      dados.forEach(([rot, v], i) => {
        const r = ws.getRow(linha + 2 + i);
        r.getCell(1).value = rot;
        r.getCell(2).value = v;
        r.getCell(2).alignment = { horizontal: 'center' };
        r.getCell(3).value = registros.length ? v / registros.length : 0;
        r.getCell(3).numFmt = '0.0%';
        r.getCell(3).alignment = { horizontal: 'center' };
      });
      const rTotal = ws.getRow(linha + 2 + dados.length);
      rTotal.getCell(1).value = 'Total';
      rTotal.getCell(2).value = registros.length;
      rTotal.getCell(3).value = 1;
      rTotal.getCell(3).numFmt = '0.0%';
      [1, 2, 3].forEach(c => {
        rTotal.getCell(c).font = { bold: true };
        if (c > 1) rTotal.getCell(c).alignment = { horizontal: 'center' };
      });
      linha += dados.length + 4;
    });

    const imagens = await Promise.all([
      this.pngDonut(contarPor(registros, 'produto'), 'Chamados por produto', PIZZA_HEX_PRODUTO),
      this.pngDonut(contarPor(registros, 'gravidade'), 'Chamados por gravidade', PIZZA_HEX_GRAVIDADE),
      this.pngDonut(contarPorStatus(registros), 'Chamados por status', PIZZA_HEX_STATUS)
    ]);
    imagens.forEach((b64, i) => {
      if (!b64) return;
      const id = wb.addImage({ base64: b64, extension: 'png' });
      ws.addImage(id, { tl: { col: 4, row: 4 + i * 21 }, ext: { width: 540, height: 285 } });
    });

    /* ---------- Aba 2: Chamados ---------- */
    const wsD = wb.addWorksheet('Chamados');
    const colunas = ['ID', 'Aberto em', 'Produto', 'Canal', 'Motivo', 'Gravidade', 'CPF', 'Proposta', 'Atendente',
      'Status', 'Responsável atual', 'Início da tratativa', 'Resolvido em', 'Resolvido por', 'Dias',
      'Prazo SLA (dias)', 'Vence em', 'Dias restantes', 'SLA', 'Descrição'];
    wsD.columns = [
      { width: 9 }, { width: 18 }, { width: 22 }, { width: 14 }, { width: 26 }, { width: 12 },
      { width: 16 }, { width: 14 }, { width: 28 }, { width: 15 }, { width: 26 }, { width: 18 }, { width: 18 },
      { width: 26 }, { width: 8 }, { width: 16 }, { width: 18 }, { width: 14 }, { width: 15 }, { width: 60 }
    ];
    this.cabecalho(wsD, 1, colunas);
    wsD.views = [{ state: 'frozen', ySplit: 1 }];

    registros.slice().sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime()).forEach((r, i) => {
      const resolvido = chamadoResolvido(r);
      const dur = duracaoDiasChamado(r);
      const dias = resolvido ? (dur != null ? Number(dur.toFixed(1)) : '—') : idadeDiasSac(r.criadoEm);
      const estourou = slaEstourado(r);
      const venc = slaVencimento(r);
      const restante = diasRestantesSla(r);
      const row = wsD.getRow(i + 2);
      row.values = [
        Number(r.id) || r.id || '',
        r.criadoEm ? new Date(r.criadoEm) : null,
        r.produto || '', r.canal || '', r.categoria || '', r.gravidade || '',
        r.cpf || '', r.idProposta || '', r.atendente || 'Desconhecido',
        rotuloStatus(r), responsavelDoChamado(r) || '',
        r.tratativaIniciadaEm ? new Date(r.tratativaIniciadaEm) : null,
        r.resolvidoEm ? new Date(r.resolvidoEm) : null,
        r.resolvidoPor || '',
        dias, slaDiasPara(r), venc || null,
        restante != null ? Number(restante.toFixed(1)) : '—',
        r.slaStatus || (estourou ? 'Estourado' : 'Dentro do SLA'),
        r.descricao || ''
      ];
      row.getCell(2).numFmt = 'dd/mm/yyyy hh:mm';
      row.getCell(12).numFmt = 'dd/mm/yyyy hh:mm';
      row.getCell(13).numFmt = 'dd/mm/yyyy hh:mm';
      row.getCell(17).numFmt = 'dd/mm/yyyy hh:mm';
      row.getCell(10).font = { bold: true, color: { argb: resolvido ? 'FF15803D' : chamadoAberto(r) ? 'FF1D4ED8' : 'FFB45309' } };
      row.getCell(19).font = { bold: true, color: { argb: estourou ? 'FFDC2626' : 'FF15803D' } };
      [6, 15, 16, 18, 19].forEach(c => row.getCell(c).alignment = { horizontal: 'center' });
      if (i % 2 === 1) {
        for (let c = 1; c <= colunas.length; c++) {
          row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAF9' } };
        }
      }
    });
    wsD.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };

    /* ---------- Aba 3: Por atendente (registro) ---------- */
    const wsA = wb.addWorksheet('Por atendente');
    wsA.columns = [{ width: 32 }, { width: 10 }, { width: 17 }, { width: 14 }, { width: 12 }, { width: 15 }, { width: 18 }, { width: 14 }];
    this.cabecalho(wsA, 1, ['Atendente', 'Total', 'Chamados abertos', 'Em tratativa', 'Resolvidos', 'SLA cumprido', 'Tempo médio (dias)', '% do volume']);
    wsA.views = [{ state: 'frozen', ySplit: 1 }];
    calcularEstatisticas(registros).sort((a, b) => b.total - a.total).forEach((it, i) => {
      const row = wsA.getRow(i + 2);
      row.values = [
        it.nome, it.total, it.abertos, it.pendentes, it.resolvidos,
        it.percSla, it.tempoMedio != null ? Number(it.tempoMedio.toFixed(1)) : '—',
        registros.length ? it.total / registros.length : 0
      ];
      row.getCell(6).numFmt = '0%';
      row.getCell(8).numFmt = '0.0%';
      [2, 3, 4, 5, 6, 7, 8].forEach(c => row.getCell(c).alignment = { horizontal: 'center' });
    });
    const imgAtend = await this.pngDonut(contarPor(registros, 'atendente'), 'Chamados por atendente');
    if (imgAtend) {
      const idA = wb.addImage({ base64: imgAtend, extension: 'png' });
      wsA.addImage(idA, { tl: { col: 0, row: calcularEstatisticas(registros).length + 3 }, ext: { width: 540, height: 285 } });
    }

    /* ---------- Aba 4: Por atuação (esteira) ---------- */
    const wsAt = wb.addWorksheet('Por atuação');
    wsAt.columns = [{ width: 32 }, { width: 17 }, { width: 19 }, { width: 14 }, { width: 12 }, { width: 13 }, { width: 18 }, { width: 18 }];
    this.cabecalho(wsAt, 1, ['Analista', 'Chamados atuados', 'Tratativas iniciadas', 'Observações', 'Resoluções', 'Reaberturas', 'SLA nas resoluções', 'Tempo médio (dias)']);
    wsAt.views = [{ state: 'frozen', ySplit: 1 }];
    const atuacao = calcularAtuacao(registros);
    atuacao.forEach((it, i) => {
      const row = wsAt.getRow(i + 2);
      row.values = [
        it.nome, it.chamadosAtuados, it.tratativas, it.observacoes, it.resolucoes, it.reaberturas,
        it.percSla != null ? it.percSla : '—',
        it.tempoMedio != null ? Number(it.tempoMedio.toFixed(1)) : '—'
      ];
      if (it.percSla != null) row.getCell(7).numFmt = '0%';
      [2, 3, 4, 5, 6, 7, 8].forEach(c => row.getCell(c).alignment = { horizontal: 'center' });
    });
    const semTrilha = chamadosSemAtuacaoRegistrada(registros);
    const linhaNota = atuacao.length + 3;
    wsAt.getCell(linhaNota, 1).value = semTrilha
      ? `${semTrilha} chamado(s) do período são anteriores ao controle de esteira e não têm atuação registrada.`
      : 'Todos os chamados do período têm atuação registrada.';
    wsAt.getCell(linhaNota, 1).font = { italic: true, size: 10, color: { argb: 'FF78716C' } };

    /* ---------- Aba 5: Histórico de status ---------- */
    const wsH = wb.addWorksheet('Histórico de status');
    wsH.columns = [{ width: 9 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 28 }, { width: 16 }, { width: 22 }];
    this.cabecalho(wsH, 1, ['Chamado', 'Quando', 'De', 'Para', 'Por', 'Origem', 'Produto']);
    wsH.views = [{ state: 'frozen', ySplit: 1 }];
    let linhaH = 2;
    registros.slice().sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime()).forEach(r => {
      historicoDe(r).forEach(ev => {
        const row = wsH.getRow(linhaH++);
        row.values = [
          Number(r.id) || r.id || '',
          ev.em ? new Date(ev.em) : null,
          SAC_STATUS_LABEL[ev.de] || ev.de || '—',
          SAC_STATUS_LABEL[ev.para] || ev.para || '',
          ev.por || '', ev.origem || '', r.produto || ''
        ];
        row.getCell(2).numFmt = 'dd/mm/yyyy hh:mm';
        [1, 3, 4, 6].forEach(c => row.getCell(c).alignment = { horizontal: 'center' });
      });
    });
    if (linhaH === 2) {
      wsH.getCell('A2').value = 'Nenhum histórico gravado para os chamados deste filtro.';
      wsH.getCell('A2').font = { italic: true, color: { argb: 'FF78716C' } };
    } else {
      wsH.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };
    }

    const buffer = await wb.xlsx.writeBuffer();
    this.baixar(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `Dashboard_SAC_${filtro.dataInicio || 'inicio'}_a_${filtro.dataFim || 'fim'}.xlsx`);
    return `Planilha gerada com ${registros.length} chamado(s).`;
  }

  /** Plano B quando a biblioteca não puder ser carregada. */
  baixarCsv(registros: Chamado[]): void {
    const cab = ['ID', 'Aberto em', 'Produto', 'Canal', 'Motivo', 'Gravidade', 'CPF', 'Proposta', 'Atendente', 'Status',
      'Responsavel atual', 'Inicio da tratativa', 'Resolvido em', 'Resolvido por', 'Dias', 'Prazo SLA (dias)',
      'Vence em', 'Dias restantes', 'SLA', 'Descricao'];
    const campo = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const linhas = [cab.map(campo).join(';')];
    registros.slice().sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime()).forEach(r => {
      const resolvido = chamadoResolvido(r);
      const dur = duracaoDiasChamado(r);
      const dias = resolvido ? (dur != null ? dur.toFixed(1) : '') : idadeDiasSac(r.criadoEm);
      const venc = slaVencimento(r);
      const restante = diasRestantesSla(r);
      linhas.push([
        r.id, r.criadoEm ? new Date(r.criadoEm).toLocaleString('pt-BR') : '', r.produto, r.canal, r.categoria,
        r.gravidade, r.cpf, r.idProposta, r.atendente, rotuloStatus(r), responsavelDoChamado(r) || '',
        r.tratativaIniciadaEm ? new Date(r.tratativaIniciadaEm).toLocaleString('pt-BR') : '',
        r.resolvidoEm ? new Date(r.resolvidoEm).toLocaleString('pt-BR') : '',
        r.resolvidoPor || '', dias, slaDiasPara(r),
        venc ? venc.toLocaleString('pt-BR') : '',
        restante != null ? restante.toFixed(1).replace('.', ',') : '',
        r.slaStatus || (slaEstourado(r) ? 'Estourado' : 'Dentro do SLA'), r.descricao
      ].map(campo).join(';'));
    });
    this.baixar(new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'Chamados_SAC.csv');
  }

  private baixar(blob: Blob, nome: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}
