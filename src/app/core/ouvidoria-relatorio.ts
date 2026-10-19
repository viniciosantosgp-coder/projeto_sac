import { ResumoOuv, STATUS_OUV, StatusOuv, TIPOS_OUV } from './ouvidoria.service';
import { formatarCpf } from './cpf';

export interface ContextoRelatorio {
  de?: string;            // AAAA-MM-DD
  ate?: string;
  status?: StatusOuv | null;
  busca?: string;
  geradoPor: string;
}

const LARANJA: [number, number, number] = [227, 82, 5];
const CINZA: [number, number, number] = [87, 83, 78];

const dataBr = (iso: string, hora = true) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}` + (hora ? ` ${p(d.getHours())}:${p(d.getMinutes())}` : '');
};
const diaBr = (aaaammdd?: string) => aaaammdd ? aaaammdd.split('-').reverse().join('/') : '';
const hex = (h: string): [number, number, number] => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

/**
 * Relatório da Ouvidoria em PDF (A4 paisagem): cabeçalho com período e filtros,
 * resumo por status e por tipo, e a tabela com todas as manifestações filtradas.
 * As bibliotecas de PDF só são baixadas quando alguém exporta.
 */
export async function exportarRelatorioOuvidoria(itens: ResumoOuv[], ctx: ContextoRelatorio): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const L = doc.internal.pageSize.getWidth(), M = 12;

  // faixa do topo
  doc.setFillColor(...LARANJA);
  doc.rect(0, 0, L, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold').setFontSize(16).text('Presença', M, 13);
  doc.setFont('helvetica', 'normal').setFontSize(12).text('Relatório da Ouvidoria', M + 30, 13);
  doc.setFontSize(9).text(`Gerado em ${dataBr(new Date().toISOString())} por ${ctx.geradoPor}`, L - M, 13, { align: 'right' });

  // período e filtros
  const periodo = ctx.de || ctx.ate
    ? `${ctx.de ? diaBr(ctx.de) : 'início'} a ${ctx.ate ? diaBr(ctx.ate) : 'hoje'}`
    : 'Todo o período';
  const filtros = [
    ctx.status ? `Status: ${STATUS_OUV.find(s => s.valor === ctx.status)?.rotulo}` : '',
    ctx.busca?.trim() ? `Busca: "${ctx.busca.trim()}"` : ''
  ].filter(Boolean).join('   ·   ');
  doc.setTextColor(...CINZA).setFontSize(10);
  doc.setFont('helvetica', 'bold').text('Período de abertura:', M, 29);
  doc.setFont('helvetica', 'normal').text(periodo, M + 36, 29);
  if (filtros) doc.text(filtros, M + 110, 29);
  doc.setFont('helvetica', 'bold').text(`${itens.length} manifestação(ões)`, L - M, 29, { align: 'right' });

  // resumo por status (caixas) e por tipo (linha)
  let x = M;
  const larg = (L - 2 * M - 5 * 3) / 6;
  for (const s of STATUS_OUV) {
    const n = itens.filter(i => i.status === s.valor).length;
    doc.setDrawColor(...hex(s.cor)).setLineWidth(0.4).roundedRect(x, 33, larg, 15, 2, 2, 'S');
    doc.setTextColor(...hex(s.cor)).setFont('helvetica', 'bold').setFontSize(14).text(String(n), x + 4, 41.5);
    doc.setTextColor(...CINZA).setFont('helvetica', 'normal').setFontSize(8).text(s.rotulo.toUpperCase(), x + 4, 46);
    x += larg + 3;
  }
  const porTipo = TIPOS_OUV.map(t => `${t.rotulo}: ${itens.filter(i => i.tipo === t.valor).length}`);
  const semTipo = itens.filter(i => !i.tipo).length;
  if (semTipo) porTipo.push(`Sem tipo: ${semTipo}`);
  doc.setFontSize(9).text('Por tipo:  ' + porTipo.join('   ·   '), M, 54);

  // tabela
  autoTable(doc, {
    startY: 58,
    margin: { left: M, right: M, bottom: 14 },
    head: [['Protocolo', 'Aberto em', 'Tipo', 'Assunto', 'Solicitante', 'CPF', 'Status', 'Atualizado em']],
    body: itens.map(i => [
      i.protocolo, dataBr(i.criadoEm), TIPOS_OUV.find(t => t.valor === i.tipo)?.rotulo || '—', i.assunto,
      [i.solicitanteNome, i.solicitanteEmail].filter(Boolean).join('\n') || '—',
      i.solicitanteCpf ? formatarCpf(i.solicitanteCpf) : '—', i.statusDescricao, dataBr(i.atualizadoEm)
    ]),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: CINZA, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [245, 245, 244], textColor: [68, 64, 60], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 249] },
    columnStyles: {
      0: { cellWidth: 30, fontStyle: 'bold' }, 1: { cellWidth: 26 }, 2: { cellWidth: 22 }, 3: { cellWidth: 'auto' },
      4: { cellWidth: 48 }, 5: { cellWidth: 28 }, 6: { cellWidth: 24, fontStyle: 'bold' }, 7: { cellWidth: 26 }
    },
    didParseCell: d => {
      if (d.section === 'body' && d.column.index === 6) {
        const s = STATUS_OUV.find(x => x.rotulo === d.cell.raw);
        if (s) d.cell.styles.textColor = hex(s.cor);
      }
    }
  });
  if (!itens.length) {
    doc.setFontSize(10).setTextColor(...CINZA).text('Nenhuma manifestação no período e filtros escolhidos.', M, 72);
  }

  // rodapé em todas as páginas
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    const A = doc.internal.pageSize.getHeight();
    doc.setFontSize(7.5).setTextColor(150, 150, 150).setFont('helvetica', 'normal');
    doc.text('Uso interno · contém dados pessoais (LGPD): não compartilhe fora da empresa.', M, A - 6);
    doc.text(`Página ${p} de ${paginas}`, L - M, A - 6, { align: 'right' });
  }

  const hoje = new Date();
  const nome = `ouvidoria-relatorio-${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}.pdf`;
  doc.save(nome);
}
