// Traz para o sac-presenca o que as analistas gravaram no banco de teste (sac-ouvidoria-teste).
// Ignora os dados fictícios da validação local. Pode rodar de novo: só copia o que mudou.
// Uso: node scripts/resgata-do-teste.mjs            (simulação: só mostra)
//      node scripts/resgata-do-teste.mjs --gravar   (copia para produção)
// Necessário enquanto a ouvidoria-api (Render) ainda gravar no banco de teste.
const T = { p: 'sac-ouvidoria-teste', k: 'AIzaSyDd4LY_EKLZE6t6ib26OFlNoDZyM4KB3co' };
const P = { p: 'sac-presenca', k: 'AIzaSyDZ_kJrhvXfUeivjMjvRTQw3A6qJFfJDd0' };
const GRAVAR = process.argv.includes('--gravar');
const base = b => `https://firestore.googleapis.com/v1/projects/${b.p}/databases/(default)/documents`;

async function req(b, caminho, opt = {}, q = '') {
  const r = await fetch(`${base(b)}/${caminho}?key=${b.k}${q}`, opt);
  if (r.status === 404) return null;
  const j = await r.json();
  if (j.error) throw new Error(`${b.p}/${caminho}: ${j.error.message}`);
  return j;
}
async function listar(b, col) {
  const out = []; let tok = '';
  do { const r = await req(b, col, {}, `&pageSize=300${tok ? '&pageToken=' + tok : ''}`); out.push(...(r?.documents || [])); tok = r?.nextPageToken; } while (tok);
  return out;
}
const id = d => d.name.split('/').pop();
const gravar = (b, caminho, fields) => req(b, caminho, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
const apagar = (b, caminho) => req(b, caminho, { method: 'DELETE' });

// ---------- Ouvidoria ----------
const ficticio = d => /^\[FICT[IÍ]CIO\]/.test(d.fields.assunto?.stringValue || '') || /^OUV-2026-00090[1-4]$/.test(id(d));
let novos = 0, atualizados = 0;
for (const d of (await listar(T, 'ouvidoria_chamados')).filter(d => !ficticio(d))) {
  const prot = id(d);
  const atual = await req(P, `ouvidoria_chamados/${prot}`);
  const tAt = d.fields.atualizadoEm?.timestampValue, pAt = atual?.fields?.atualizadoEm?.timestampValue;
  if (atual && pAt && tAt && new Date(pAt) >= new Date(tAt)) continue;   // produção já está igual ou mais nova
  const hist = await listar(T, `ouvidoria_chamados/${prot}/historico`);
  console.log(`${atual ? 'ATUALIZA' : 'NOVO    '} ${prot}  ${(d.fields.status?.stringValue || '').padEnd(11)} hist=${hist.length}  ${(d.fields.assunto?.stringValue || '').slice(0, 45)}`);
  atual ? atualizados++ : novos++;
  if (!GRAVAR) continue;
  if (atual) for (const h of await listar(P, `ouvidoria_chamados/${prot}/historico`)) await apagar(P, `ouvidoria_chamados/${prot}/historico/${id(h)}`);
  await gravar(P, `ouvidoria_chamados/${prot}`, d.fields);
  for (const h of hist) await gravar(P, `ouvidoria_chamados/${prot}/historico/${id(h)}`, h.fields);
}

// sequência de produção nunca abaixo do maior protocolo real
const reais = (await listar(T, 'ouvidoria_chamados')).filter(d => !ficticio(d)).map(d => Number(id(d).split('-').pop()));
const seqP = Number((await req(P, 'ouvidoria_config/sequencia'))?.fields?.ultimo?.integerValue || 0);
const alvo = Math.max(seqP, ...reais);
console.log(`ouvidoria: ${novos} novas, ${atualizados} atualizadas · sequência prod ${seqP} -> ${alvo}`);
if (GRAVAR && alvo > seqP) await gravar(P, 'ouvidoria_config/sequencia', { ultimo: { integerValue: String(alvo) } });

// ---------- SAC: chamados reais criados no site de teste (ids 901-905 são fictícios) ----------
const sacTeste = (await listar(T, 'reclamacoes')).filter(d => !/^\[FICT[IÍ]CIO\]/.test(d.fields.descricao?.stringValue || '') && !['901', '902', '903', '904', '905'].includes(id(d)));
const sacProd = await listar(P, 'reclamacoes');
let maior = Math.max(...sacProd.map(d => Number(id(d)) || 0));
for (const d of sacTeste) {
  const origem = `sac-ouvidoria-teste#${id(d)}`;
  if (sacProd.some(p => p.fields.origemMigracao?.stringValue === origem)) { console.log(`SAC teste #${id(d)} já está em produção`); continue; }
  const novoId = ++maior;
  console.log(`SAC NOVO  teste #${id(d)} -> prod #${novoId}  ${d.fields.produto?.stringValue} · ${d.fields.categoria?.stringValue} · ${d.fields.atendente?.stringValue} · ${d.fields.status?.stringValue}`);
  if (GRAVAR) await gravar(P, `reclamacoes/${novoId}`, { ...d.fields, id: { integerValue: String(novoId) }, origemMigracao: { stringValue: origem } });
}
console.log(GRAVAR ? 'GRAVADO no sac-presenca.' : '(simulação: nada gravado)');
