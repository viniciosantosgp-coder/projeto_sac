import { Injectable, inject } from '@angular/core';
// import estático (como na versão de 22/09): a biblioteca vai no mesmo pacote do dashboard
import * as ExcelJS from 'exceljs';
import type { Workbook, Worksheet } from 'exceljs';
import { Chamado } from './modelos';
import { SessaoService } from './sessao.service';
import {
  chamadoAberto, chamadoResolvido, diasRestantesSla, duracaoDiasChamado, historicoDe,
  idadeDiasSac, responsavelDoChamado, rotuloStatus, slaDiasPara, slaEstourado, slaVencimento
} from './dominio';
import {
  apurarSlaPorGravidade, calcularAtuacao, calcularEstatisticas, chamadosSemAtuacaoRegistrada,
  contarPor, contarPorStatus, listarSlaEstourado, resumoPeriodo
} from './metricas';
import { PIZZA_HEX_GRAVIDADE, PIZZA_HEX_PRODUTO, PIZZA_HEX_STATUS, PIZZA_PALETA, SAC_STATUS_LABEL } from './constantes';

const LARANJA = 'FFE35205';
const CINZA_TEXTO = 'FF78716C';
const ZEBRA = 'FFFAFAF9';
const FUNDO_SECAO = 'FFF5F5F4';
const BORDA = 'FFE7E5E4';
const RODAPE = '&L&8SAC — Grupo Presença&C&8Página &P de &N&R&8Confidencial';

/** Cor do número de cada indicador na aba "Visão Geral". */
const COR_INDICADOR: Record<string, string> = {
  'Total de chamados': 'FFE35205',
  'Chamados abertos': 'FF2563EB',
  'Em tratativa': 'FFF59E0B',
  'Resolvidos': 'FF16A34A',
  'Taxa de resolução': 'FF0D9488',
  'SLA estourado': 'FFDC2626',
  'Média por dia': 'FF7C3AED',
  'Tempo médio p/ resolver (dias)': 'FF7C3AED'
};

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

  /** Desenha o SVG num canvas (2x, para ficar nítido) e devolve o PNG em base64. */
  private svgParaPng(svg: string, largura: number, altura: number): Promise<string | null> {
    return new Promise<string | null>(resolve => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = largura * 2; cv.height = altura * 2;
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

  /** Gráfico de rosca (compacto) para embutir na planilha. */
  private async pngDonut(dados: Array<[string, number]>, titulo: string, cores?: Record<string, string>): Promise<string | null> {
    const L = 480, A = 300, cx = 140, cy = 160, R = 96, ri = 58;
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
      const y = 66 + i * 24;
      const rotCurto = rot.length > 22 ? rot.slice(0, 21) + '…' : rot;
      legenda += `<rect x="266" y="${y - 10}" width="11" height="11" rx="3" fill="${cor}"/>`
        + `<text x="284" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#44403c">${this.escapar(rotCurto)}</text>`
        + `<text x="470" y="${y}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="bold" fill="#1c1917">${v} (${this.perc(v, total)})</text>`;
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${A}" viewBox="0 0 ${L} ${A}">
      <rect width="${L}" height="${A}" fill="#ffffff"/>
      <text x="18" y="30" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="bold" fill="#1c1917">${this.escapar(titulo)}</text>
      ${fatias}
      <text x="${cx}" y="${cy + 2}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="bold" fill="#1c1917">${total}</text>
      <text x="${cx}" y="${cy + 20}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#a8a29e">CHAMADOS</text>
      ${legenda}
    </svg>`;
    return this.svgParaPng(svg, L, A);
  }

  /** Gráfico de barras horizontais (uma barra por linha de `dados`). */
  private async pngBarras(dados: Array<[string, number]>, titulo: string, corPadrao = '#E35205',
                          opcoes?: { sufixo?: string; cores?: Record<string, string> }): Promise<string | null> {
    if (!dados.length) return null;
    const L = 620, alturaLinha = 24, topo = 46;
    const A = topo + dados.length * alturaLinha + 12;
    const xBarra = 210, larguraMax = 330;
    const maior = Math.max(...dados.map(([, v]) => Number(v) || 0), 1);
    const sufixo = opcoes?.sufixo || '';

    let barras = '';
    dados.forEach(([rot, v], i) => {
      const valor = Number(v) || 0;
      const y = topo + i * alturaLinha;
      const w = Math.max(valor / maior * larguraMax, valor > 0 ? 3 : 0);
      const cor = (opcoes?.cores && opcoes.cores[rot]) || corPadrao;
      const rotCurto = rot.length > 27 ? rot.slice(0, 26) + '…' : rot;
      barras += `<text x="${xBarra - 10}" y="${y + 15}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#44403c">${this.escapar(rotCurto)}</text>`;
      barras += `<rect x="${xBarra}" y="${y + 3}" width="${w}" height="15" rx="3" fill="${cor}"/>`;
      barras += `<text x="${xBarra + w + 8}" y="${y + 15}" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="bold" fill="#1c1917">${v}${sufixo}</text>`;
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${A}" viewBox="0 0 ${L} ${A}">
      <rect width="${L}" height="${A}" fill="#ffffff"/>
      <text x="18" y="30" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="bold" fill="#1c1917">${this.escapar(titulo)}</text>
      ${barras}
    </svg>`;
    return this.svgParaPng(svg, L, A);
  }

  private cabecalho(ws: Worksheet, linha: number, colunas: string[]): void {
    const row = ws.getRow(linha);
    colunas.forEach((c, i) => {
      const cel = row.getCell(i + 1);
      cel.value = c;
      cel.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA } };
      cel.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' };
      cel.border = { top: { style: 'thin', color: { argb: LARANJA } }, bottom: { style: 'thin', color: { argb: LARANJA } } };
    });
    row.height = 22;
  }

  /** Faixa cinza com título, usada para separar os blocos da "Visão Geral". */
  private secao(ws: Worksheet, linha: number, texto: string, colunas = 3): void {
    const row = ws.getRow(linha);
    for (let c = 1; c <= colunas; c++) {
      const cel = row.getCell(c);
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FUNDO_SECAO } };
      cel.border = { left: { style: 'thin', color: { argb: LARANJA } } };
    }
    row.getCell(1).value = texto;
    row.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF1C1917' } };
    row.getCell(1).alignment = { vertical: 'middle', indent: 1 };
    row.height = 24;
  }

  /** Contorno fino ao redor de um bloco de células, com linhas finas entre as linhas. */
  private caixaBorda(ws: Worksheet, linhaIni: number, linhaFim: number, colIni: number, colFim: number): void {
    for (let r = linhaIni; r <= linhaFim; r++) {
      for (let c = colIni; c <= colFim; c++) {
        const cel = ws.getCell(r, c);
        cel.border = {
          top: r === linhaIni ? { style: 'thin', color: { argb: BORDA } } : cel.border?.top,
          bottom: r === linhaFim ? { style: 'thin', color: { argb: BORDA } } : { style: 'hair', color: { argb: BORDA } },
          left: c === colIni ? { style: 'thin', color: { argb: BORDA } } : cel.border?.left,
          right: c === colFim ? { style: 'thin', color: { argb: BORDA } } : cel.border?.right
        };
      }
    }
  }

  private zebra(ws: Worksheet, linha: number, colunas: number, pular?: number): void {
    for (let c = 1; c <= colunas; c++) {
      if (c === pular) continue;
      ws.getCell(linha, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
    }
  }

  /** Monta e baixa a planilha do dashboard. */
  async exportarDashboard(registros: Chamado[], filtro: FiltroExport): Promise<string> {
    const wb: Workbook = new ExcelJS.Workbook();
    wb.creator = 'SAC — Grupo Presença';
    wb.created = new Date();

    const brData = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
    const resumo = resumoPeriodo(registros);
    const usuario = this.sessao.nomeUsuario();
    const diasPeriodo = filtro.dataInicio && filtro.dataFim
      ? Math.max(1, Math.round((new Date(filtro.dataFim).getTime() - new Date(filtro.dataInicio).getTime()) / 86400000) + 1)
      : null;

    /* ---------- Aba 1: Visão Geral ---------- */
    const ws = wb.addWorksheet('Visão Geral', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 30 }, { width: 14 }, { width: 12 }, { width: 3 }, { width: 34 }, { width: 14 }, { width: 12 }];
    ws.mergeCells('A1:G1');
    ws.mergeCells('A2:G2');
    ws.getRow(1).height = 30;
    ws.getRow(2).height = 20;
    for (let c = 1; c <= 7; c++) {
      ws.getCell(1, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA } };
      ws.getCell(2, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA } };
    }
    ws.getCell('A1').value = 'Dashboard SAC — Grupo Presença';
    ws.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
    ws.getCell('A1').alignment = { vertical: 'middle', indent: 1 };
    ws.getCell('A2').value = `Período: ${brData(filtro.dataInicio)} a ${brData(filtro.dataFim)}   ·   Produto: ${filtro.produto}   ·   Gerado em ${new Date().toLocaleString('pt-BR')} por ${usuario}`;
    ws.getCell('A2').font = { size: 10, color: { argb: 'FFFFF3EC' } };
    ws.getCell('A2').alignment = { vertical: 'middle', indent: 1 };

    let linha = 4;
    this.secao(ws, linha, 'Indicadores do período', 3);
    linha += 1;
    const indicadores: Array<[string, string | number, string?]> = [
      ['Total de chamados', registros.length],
      ['Chamados abertos', resumo.abertos.length, '(sem tratativa)'],
      ['Em tratativa', resumo.emTratativa.length],
      ['Resolvidos', resumo.resolvidos.length],
      ['Taxa de resolução', registros.length ? resumo.resolvidos.length / registros.length : 0],
      ['SLA estourado', resumo.estourados, '(chamados)'],
      ['Tempo médio p/ resolver (dias)', resumo.tempoMedioDias != null ? Number(resumo.tempoMedioDias.toFixed(1)) : '—'],
      ['Média por dia', diasPeriodo ? Number((registros.length / diasPeriodo).toFixed(1)) : '—',
        diasPeriodo ? `(${diasPeriodo} dia(s) no período)` : undefined]
    ];
    const inicioIndicadores = linha;
    indicadores.forEach(([rotulo, valor, obs], i) => {
      const r = ws.getRow(linha + i);
      r.getCell(1).value = rotulo;
      r.getCell(1).font = { size: 11, color: { argb: 'FF44403C' } };
      r.getCell(2).value = valor;
      r.getCell(2).font = { bold: true, size: 13, color: { argb: COR_INDICADOR[rotulo] || 'FF1C1917' } };
      r.getCell(2).alignment = { horizontal: 'center' };
      if (rotulo === 'Taxa de resolução') r.getCell(2).numFmt = '0.0%';
      if (obs) { r.getCell(3).value = obs; r.getCell(3).font = { size: 9, italic: true, color: { argb: CINZA_TEXTO } }; }
      if (i % 2 === 1) this.zebra(ws, linha + i, 3);
    });
    this.caixaBorda(ws, inicioIndicadores, inicioIndicadores + indicadores.length - 1, 1, 3);
    linha += indicadores.length + 2;

    const slaGrav = apurarSlaPorGravidade(registros);
    const linhaSecaoSla = linha;
    this.secao(ws, linha, 'SLA por gravidade', 3);
    linha += 1;
    this.cabecalho(ws, linha, ['Gravidade', 'Prazo (d)', 'Total']);
    ws.getCell(linha, 5).value = '% cumprimento';
    ws.getCell(linha, 5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getCell(linha, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA } };
    ws.getCell(linha, 5).alignment = { horizontal: 'center' };
    linha += 1;
    const inicioSla = linha;
    slaGrav.forEach((it, i) => {
      const r = ws.getRow(linha + i);
      r.getCell(1).value = it.gravidade;
      r.getCell(2).value = it.prazo;
      r.getCell(3).value = it.total;
      [2, 3].forEach(c => r.getCell(c).alignment = { horizontal: 'center' });
      if (i % 2 === 1) this.zebra(ws, linha + i, 3);
    });
    this.caixaBorda(ws, inicioSla, inicioSla + Math.max(slaGrav.length - 1, 0), 1, 3);
    const imgSla = await this.pngBarras(
      slaGrav.map(it => [it.gravidade, Number((it.percCumprimento * 100).toFixed(0))]),
      'Cumprimento de SLA por gravidade', '#E35205', { sufixo: '%', cores: PIZZA_HEX_GRAVIDADE }
    );
    if (imgSla) {
      const id = wb.addImage({ base64: imgSla, extension: 'png' });
      ws.addImage(id, { tl: { col: 4, row: linhaSecaoSla - 1 }, ext: { width: 420, height: 46 + slaGrav.length * 24 + 12 } });
    }
    linha += slaGrav.length + 3;

    const blocos: Array<{ titulo: string; dados: Array<[string, number]>; tipo: 'donut' | 'barras'; cores?: Record<string, string> }> = [
      { titulo: 'Chamados por produto', dados: contarPor(registros, 'produto'), tipo: 'donut', cores: PIZZA_HEX_PRODUTO },
      { titulo: 'Chamados por gravidade', dados: contarPor(registros, 'gravidade'), tipo: 'donut', cores: PIZZA_HEX_GRAVIDADE },
      { titulo: 'Chamados por status', dados: contarPorStatus(registros), tipo: 'donut', cores: PIZZA_HEX_STATUS },
      { titulo: 'Chamados por canal', dados: contarPor(registros, 'canal'), tipo: 'donut' },
      { titulo: 'Chamados por motivo', dados: contarPor(registros, 'categoria'), tipo: 'barras' }
    ];
    for (const bloco of blocos) {
      const linhaSecao = linha;
      this.secao(ws, linha, bloco.titulo, 3);
      linha += 1;
      const rotulo = bloco.titulo.replace('Chamados por ', '');
      this.cabecalho(ws, linha, [rotulo.charAt(0).toUpperCase() + rotulo.slice(1), 'Chamados', '%']);
      linha += 1;
      const inicio = linha;
      bloco.dados.forEach(([rot, v], i) => {
        const r = ws.getRow(linha + i);
        r.getCell(1).value = rot;
        r.getCell(2).value = v;
        r.getCell(2).alignment = { horizontal: 'center' };
        r.getCell(3).value = registros.length ? v / registros.length : 0;
        r.getCell(3).numFmt = '0.0%';
        r.getCell(3).alignment = { horizontal: 'center' };
        if (i % 2 === 1) this.zebra(ws, linha + i, 3);
      });
      const rTotal = ws.getRow(linha + bloco.dados.length);
      rTotal.getCell(1).value = 'Total';
      rTotal.getCell(2).value = registros.length;
      rTotal.getCell(3).value = 1;
      rTotal.getCell(3).numFmt = '0.0%';
      [1, 2, 3].forEach(c => {
        rTotal.getCell(c).font = { bold: true };
        if (c > 1) rTotal.getCell(c).alignment = { horizontal: 'center' };
      });
      this.caixaBorda(ws, inicio, inicio + bloco.dados.length, 1, 3);
      linha += bloco.dados.length + 3;

      const img = bloco.tipo === 'donut'
        ? await this.pngDonut(bloco.dados, bloco.titulo, bloco.cores)
        : await this.pngBarras(bloco.dados, bloco.titulo, '#E35205');
      if (img) {
        const id = wb.addImage({ base64: img, extension: 'png' });
        const altura = bloco.tipo === 'donut' ? 150 : 23 + bloco.dados.length * 12;
        ws.addImage(id, { tl: { col: 4, row: linhaSecao - 1 }, ext: { width: 300, height: altura } });
      }
    }
    ws.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    ws.headerFooter = { oddFooter: RODAPE };
    ws.properties.tabColor = { argb: LARANJA };

    /* ---------- Aba 2: Chamados ---------- */
    const wsD = wb.addWorksheet('Chamados');
    wsD.properties.tabColor = { argb: 'FF2563EB' };
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
    wsD.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' };
    wsD.headerFooter = { oddFooter: RODAPE };

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
      row.getCell(19).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: estourou ? 'FFFEF2F2' : 'FFF0FDF4' } };
      [6, 15, 16, 18, 19].forEach(c => row.getCell(c).alignment = { horizontal: 'center' });
      if (i % 2 === 1) this.zebra(wsD, i + 2, colunas.length, 19);
    });
    wsD.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };

    /* ---------- Aba 3: SLA estourado ---------- */
    this.abaSlaEstourado(wb, registros);

    /* ---------- Aba 4: Por atendente (registro) ---------- */
    const wsA = wb.addWorksheet('Por atendente');
    wsA.properties.tabColor = { argb: 'FF16A34A' };
    wsA.columns = [{ width: 32 }, { width: 10 }, { width: 17 }, { width: 14 }, { width: 12 }, { width: 15 }, { width: 18 }, { width: 14 }];
    this.cabecalho(wsA, 1, ['Atendente', 'Total', 'Chamados abertos', 'Em tratativa', 'Resolvidos', 'SLA cumprido', 'Tempo médio (dias)', '% do volume']);
    wsA.views = [{ state: 'frozen', ySplit: 1 }];
    wsA.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' };
    wsA.headerFooter = { oddFooter: RODAPE };
    const estatisticas = calcularEstatisticas(registros).sort((a, b) => b.total - a.total);
    estatisticas.forEach((it, i) => {
      const row = wsA.getRow(i + 2);
      row.values = [
        it.nome, it.total, it.abertos, it.pendentes, it.resolvidos,
        it.percSla, it.tempoMedio != null ? Number(it.tempoMedio.toFixed(1)) : '—',
        registros.length ? it.total / registros.length : 0
      ];
      row.getCell(6).numFmt = '0%';
      row.getCell(8).numFmt = '0.0%';
      [2, 3, 4, 5, 6, 7, 8].forEach(c => row.getCell(c).alignment = { horizontal: 'center' });
      if (i % 2 === 1) this.zebra(wsA, i + 2, 8);
    });
    const linhaGraficos = estatisticas.length + 4;
    const imgVolume = await this.pngDonut(contarPor(registros, 'atendente'), 'Volume por atendente');
    if (imgVolume) {
      const id = wb.addImage({ base64: imgVolume, extension: 'png' });
      wsA.addImage(id, { tl: { col: 0, row: linhaGraficos }, ext: { width: 400, height: 250 } });
    }
    const imgSlaAtend = await this.pngBarras(
      estatisticas.map(it => [it.nome, Number((it.percSla * 100).toFixed(0))]),
      'SLA cumprido por atendente', '#16A34A', { sufixo: '%' }
    );
    if (imgSlaAtend) {
      const id = wb.addImage({ base64: imgSlaAtend, extension: 'png' });
      wsA.addImage(id, { tl: { col: 5, row: linhaGraficos }, ext: { width: 460, height: 46 + estatisticas.length * 24 + 12 } });
    }

    /* ---------- Aba 5: Por atuação (esteira) ---------- */
    const wsAt = wb.addWorksheet('Por atuação');
    wsAt.properties.tabColor = { argb: 'FFF59E0B' };
    wsAt.columns = [{ width: 32 }, { width: 17 }, { width: 19 }, { width: 14 }, { width: 12 }, { width: 13 }, { width: 18 }, { width: 18 }];
    this.cabecalho(wsAt, 1, ['Analista', 'Chamados atuados', 'Tratativas iniciadas', 'Observações', 'Resoluções', 'Reaberturas', 'SLA nas resoluções', 'Tempo médio (dias)']);
    wsAt.views = [{ state: 'frozen', ySplit: 1 }];
    wsAt.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' };
    wsAt.headerFooter = { oddFooter: RODAPE };
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
      if (i % 2 === 1) this.zebra(wsAt, i + 2, 8);
    });
    const semTrilha = chamadosSemAtuacaoRegistrada(registros);
    const linhaNota = atuacao.length + 3;
    wsAt.getCell(linhaNota, 1).value = semTrilha
      ? `${semTrilha} chamado(s) do período são anteriores ao controle de esteira e não têm atuação registrada.`
      : 'Todos os chamados do período têm atuação registrada.';
    wsAt.getCell(linhaNota, 1).font = { italic: true, size: 10, color: { argb: CINZA_TEXTO } };

    /* ---------- Aba 6: Histórico de status ---------- */
    const wsH = wb.addWorksheet('Histórico de status');
    wsH.properties.tabColor = { argb: CINZA_TEXTO };
    wsH.columns = [{ width: 9 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 28 }, { width: 16 }, { width: 22 }];
    this.cabecalho(wsH, 1, ['Chamado', 'Quando', 'De', 'Para', 'Por', 'Origem', 'Produto']);
    wsH.views = [{ state: 'frozen', ySplit: 1 }];
    wsH.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' };
    wsH.headerFooter = { oddFooter: RODAPE };
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
      wsH.getCell('A2').font = { italic: true, color: { argb: CINZA_TEXTO } };
    } else {
      wsH.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };
    }

    const buffer = await wb.xlsx.writeBuffer();
    this.baixar(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `Dashboard_SAC_${filtro.dataInicio || 'inicio'}_a_${filtro.dataFim || 'fim'}.xlsx`);
    return `Planilha gerada com ${registros.length} chamado(s).`;
  }

  /** Aba nova: os chamados que estouraram o SLA, com as datas de tratativa e resolução. */
  private abaSlaEstourado(wb: Workbook, registros: Chamado[]): void {
    const ws = wb.addWorksheet('SLA estourado');
    ws.properties.tabColor = { argb: 'FFDC2626' };
    const colunas = ['ID', 'Proposta', 'CPF', 'Produto', 'Gravidade', 'Aberto em', 'Venceu em',
      'Tratativa iniciada em', 'Tratativa por', 'Resolvido em', 'Resolvido por', 'Atraso (dias)', 'Situação'];
    ws.columns = [
      { width: 9 }, { width: 14 }, { width: 16 }, { width: 22 }, { width: 12 }, { width: 18 }, { width: 18 },
      { width: 20 }, { width: 26 }, { width: 18 }, { width: 26 }, { width: 13 }, { width: 24 }
    ];
    this.cabecalho(ws, 1, colunas);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' };
    ws.headerFooter = { oddFooter: RODAPE };

    const linhas = listarSlaEstourado(registros);
    linhas.forEach((l, i) => {
      const r = l.chamado;
      const row = ws.getRow(i + 2);
      row.values = [
        Number(r.id) || r.id || '',
        r.idProposta || '', r.cpf || '', r.produto || '', r.gravidade || '',
        r.criadoEm ? new Date(r.criadoEm) : null,
        l.venceuEm,
        l.tratativaEm ? new Date(l.tratativaEm) : 'não registrada',
        l.tratativaPor || '',
        l.resolvidoEm ? new Date(l.resolvidoEm) : '—',
        l.resolvidoPor || '',
        Number(l.atrasoDias.toFixed(1)),
        l.resolvido ? 'Resolvido com atraso' : 'Em aberto, atrasado'
      ];
      [6, 7, 8, 10].forEach(c => row.getCell(c).numFmt = 'dd/mm/yyyy hh:mm');
      [1, 5, 12].forEach(c => row.getCell(c).alignment = { horizontal: 'center' });
      row.getCell(13).font = { bold: true, color: { argb: l.resolvido ? 'FF15803D' : 'FFDC2626' } };
      if (i % 2 === 1) this.zebra(ws, i + 2, colunas.length);
    });
    if (!linhas.length) {
      ws.getCell('A2').value = 'Nenhum chamado com SLA estourado neste filtro.';
      ws.getCell('A2').font = { italic: true, color: { argb: CINZA_TEXTO } };
    } else {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
    }
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
