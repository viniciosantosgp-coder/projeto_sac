// Cria dados FICTÍCIOS no banco de TESTE (sac-ouvidoria-teste) para validar o cruzamento SAC x Ouvidoria.
// Nunca toca no sac-presenca. Pode rodar quantas vezes quiser: os ids são fixos e o conteúdo é sobrescrito.
// Uso: node validacao-local/semear-dados-teste.mjs
const PROJETO = 'sac-ouvidoria-teste';
const KEY = 'AIzaSyDd4LY_EKLZE6t6ib26OFlNoDZyM4KB3co'; // chave pública do app web de teste
const FS = `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents`;

/** CPF válido a partir de 9 dígitos (calcula os verificadores). */
function cpf(base9) {
  const d = base9.split('').map(Number);
  for (const n of [9, 10]) {
    const soma = d.slice(0, n).reduce((s, x, i) => s + x * (n + 1 - i), 0);
    const r = (soma * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join('');
}
const fmt = c => `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;

const CLIENTES = {
  ana:    cpf('111444777'),   // SAC aberto + Ouvidoria já respondida  -> "SAC aberto, Ouvidoria já tratou"
  bruno:  cpf('222555888'),   // SAC resolvido + Ouvidoria em andamento
  carla:  cpf('333666999'),   // só SAC, 2 chamados com CPF em formatos diferentes
  diego:  cpf('444777000'),   // só Ouvidoria
  elisa:  cpf('012345678')    // começa com zero: no SAC gravado sem o zero à esquerda
};

const dia = n => new Date(Date.now() - n * 86400000).toISOString();
const SLA = { 'Crítica': 1, 'Alta': 2, 'Média': 5, 'Baixa': 7 };

function chamadoSac(id, cpfGravado, { produto, categoria, gravidade, status, abertoHa, resolvidoHa = null, canal = 'WhatsApp' }) {
  const criadoEm = dia(abertoHa);
  const vence = new Date(new Date(criadoEm).getTime() + SLA[gravidade] * 86400000).toISOString();
  const resolvidoEm = resolvidoHa != null ? dia(resolvidoHa) : '';
  const hist = [{ de: '', para: 'Aberto', em: criadoEm, por: 'Atendente Fictício', origem: 'abertura' }];
  if (status !== 'Aberto') hist.push({ de: 'Aberto', para: 'Pendente', em: dia(abertoHa - 0.2), por: 'Atendente Fictício', origem: 'app' });
  if (status === 'Resolvida') hist.push({ de: 'Pendente', para: 'Resolvida', em: resolvidoEm, por: 'Atendente Fictício', origem: 'app' });
  return {
    id, criadoEm, produto, canal, categoria, gravidade, cpf: cpfGravado, idProposta: String(500000 + id),
    descricao: `[FICTÍCIO] ${categoria} — chamado de teste para validar o cruzamento com a Ouvidoria.`,
    atendente: 'Atendente Fictício', status, resolvidoEm,
    slaDias: SLA[gravidade], slaGravidade: gravidade, slaVenceEm: vence,
    duracaoDias: resolvidoEm ? Math.max(0, Math.round((new Date(resolvidoEm) - new Date(criadoEm)) / 86400000)) : null,
    slaCumprido: resolvidoEm ? new Date(resolvidoEm) <= new Date(vence) : null, slaStatus: '',
    criadoPor: 'Atendente Fictício', statusAtualizadoEm: hist.at(-1).em, atualizadoEm: hist.at(-1).em,
    atualizadoPor: 'Atendente Fictício', tratativaIniciadaEm: status !== 'Aberto' ? hist[1].em : '',
    tratativaPor: status !== 'Aberto' ? 'Atendente Fictício' : '', resolvidoPor: status === 'Resolvida' ? 'Atendente Fictício' : '',
    reabertoEm: '', versaoEsquema: 2, historicoStatus: hist,
    observacoes: [{ em: criadoEm, por: 'Atendente Fictício', texto: '[FICTÍCIO] relato do cliente', tipo: 'descricao' }]
  };
}

const SAC = [
  chamadoSac(901, fmt(CLIENTES.ana), { produto: 'FGTS', categoria: 'Cobrança Indevida', gravidade: 'Alta', status: 'Pendente', abertoHa: 3 }),
  chamadoSac(902, CLIENTES.bruno, { produto: 'INSS', categoria: 'Desconto Não Autorizado', gravidade: 'Média', status: 'Resolvida', abertoHa: 12, resolvidoHa: 9 }),
  chamadoSac(903, fmt(CLIENTES.carla), { produto: 'Consignado Privado', categoria: 'Portabilidade', gravidade: 'Baixa', status: 'Aberto', abertoHa: 1 }),
  chamadoSac(904, CLIENTES.carla, { produto: 'SIAPE', categoria: 'Boleto de quitação', gravidade: 'Média', status: 'Resolvida', abertoHa: 30, resolvidoHa: 27 }),
  chamadoSac(905, CLIENTES.elisa.replace(/^0+/, ''), { produto: 'Convênios', categoria: 'Erro de Contrato', gravidade: 'Crítica', status: 'Pendente', abertoHa: 2 })
];

function manifestacao(numero, cpfCliente, { nome, tipo, assunto, abertoHa, passos }) {
  const protocolo = `OUV-2026-${String(numero).padStart(6, '0')}`;
  const hist = [{ status: 'Recebido', observacao: 'Chamado aberto', criadoEm: dia(abertoHa), por: 'Ouvidoria (fictício)' }];
  passos.forEach(([status, obs], i) => hist.push({ status, observacao: obs, criadoEm: dia(abertoHa - (i + 1) * 0.5), por: 'Analista Fictício' }));
  return {
    protocolo, hist,
    doc: {
      protocolo, status: hist.at(-1).status, tipo, assunto: `[FICTÍCIO] ${assunto}`, descricao: '[FICTÍCIO] relato registrado na ouvidoria.',
      solicitanteNome: nome, solicitanteEmail: `${nome.split(' ')[0].toLowerCase()}@exemplo.com`, solicitanteCpf: cpfCliente,
      criadoEm: hist[0].criadoEm, atualizadoEm: hist.at(-1).criadoEm
    }
  };
}

const OUV = [
  manifestacao(901, CLIENTES.ana, { nome: 'Ana Fictícia', tipo: 'Reclamacao', assunto: 'Cobrança indevida no FGTS', abertoHa: 6,
    passos: [['EmAnalise', 'Encaminhado ao SAC'], ['Respondido', 'Cliente orientado; estorno solicitado']] }),
  manifestacao(902, CLIENTES.bruno, { nome: 'Bruno Fictício', tipo: 'Denuncia', assunto: 'Desconto sem autorização', abertoHa: 4,
    passos: [['EmAndamento', 'Em apuração com o parceiro']] }),
  manifestacao(903, CLIENTES.diego, { nome: 'Diego Fictício', tipo: 'Sugestao', assunto: 'Canal de atendimento por e-mail', abertoHa: 2, passos: [] }),
  manifestacao(904, CLIENTES.elisa, { nome: 'Elisa Fictícia', tipo: 'Reclamacao', assunto: 'Contrato com valor errado', abertoHa: 1, passos: [] })
];

// ---------- gravação via REST (formato de valores do Firestore) ----------
const ISO = /^\d{4}-\d{2}-\d{2}T/;
function valor(x, ts) {
  if (x === null || x === undefined) return { nullValue: null };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(v => valor(v, false)) } };
  if (typeof x === 'object') return { mapValue: { fields: campos(x, false) } };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (ts && ISO.test(x)) return { timestampValue: x };
  return { stringValue: String(x) };
}
const campos = (o, ts) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, valor(v, ts)]));

async function gravar(caminho, obj, ts = false) {
  const r = await fetch(`${FS}/${caminho}?key=${KEY}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: campos(obj, ts) })
  });
  if (!r.ok) throw new Error(`${caminho}: ${r.status} ${await r.text()}`);
}

// SAC: datas em texto ISO (como o app grava). Ouvidoria: datas como Timestamp (como a API grava).
for (const c of SAC) await gravar(`reclamacoes/${c.id}`, c);
for (const m of OUV) {
  await gravar(`ouvidoria_chamados/${m.protocolo}`, m.doc, true);
  for (const [i, h] of m.hist.entries()) await gravar(`ouvidoria_chamados/${m.protocolo}/historico/f${String(i + 1).padStart(3, '0')}`, h, true);
}
// sequência acima dos fictícios, para manifestações novas não colidirem
const seq = await (await fetch(`${FS}/ouvidoria_config/sequencia?key=${KEY}`)).json();
const ultimo = Number(seq?.fields?.ultimo?.integerValue || 0);
if (ultimo < 904) await gravar('ouvidoria_config/sequencia', { ultimo: 904 });

console.log('Dados fictícios prontos no banco de TESTE (sac-ouvidoria-teste). CPFs para buscar:');
for (const [nome, c] of Object.entries(CLIENTES)) console.log(`  ${nome.padEnd(6)} ${fmt(c)}`);
