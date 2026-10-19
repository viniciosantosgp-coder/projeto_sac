import { Injectable, computed, inject, signal } from '@angular/core';
import { ChamadosService } from './chamados.service';
import { OuvidoriaService, ResumoOuv, StatusOuv } from './ouvidoria.service';
import { Chamado } from './modelos';
import { statusChamado } from './dominio';
import { chaveCpf } from './cpf';

/** Status da ouvidoria que ainda pedem ação. */
export const OUV_EM_ABERTO: StatusOuv[] = ['Recebido', 'EmAnalise', 'EmAndamento'];

export interface HistoricoCliente {
  cpf: string;
  sac: Chamado[];
  ouvidoria: ResumoOuv[];
  sacAbertos: number;
  ouvidoriaAbertos: number;
}

/**
 * Visão do cliente nos dois sistemas, pelo CPF: chamados do SAC (reclamacoes.cpf)
 * e manifestações da Ouvidoria (ouvidoria_chamados.solicitanteCpf).
 * Também controla o painel "Histórico do cliente", aberto de qualquer tela.
 */
@Injectable({ providedIn: 'root' })
export class ClienteService {
  private chamados = inject(ChamadosService);
  private ouvidoria = inject(OuvidoriaService);

  /** Painel aberto? `cpf` vazio = aberto só com o campo de busca. */
  readonly painelAberto = signal(false);
  readonly cpfPainel = signal('');

  /** CPFs com manifestação na ouvidoria (para marcar os chamados do SAC na lista). */
  readonly cpfsOuvidoria = computed(() => {
    this.ouvidoria.versao();
    return new Set(this.ouvidoria.cpfsConhecidos());
  });

  abrirPainel(cpf = ''): void {
    this.cpfPainel.set(chaveCpf(cpf));
    this.painelAberto.set(true);
  }
  fecharPainel(): void { this.painelAberto.set(false); }

  async historico(cpf: string): Promise<HistoricoCliente> {
    const chave = chaveCpf(cpf);
    const vazio: HistoricoCliente = { cpf: chave, sac: [], ouvidoria: [], sacAbertos: 0, ouvidoriaAbertos: 0 };
    if (!chave) return vazio;

    const registros = this.chamados.registros().length ? this.chamados.registros() : await this.chamados.carregar();
    const sac = registros.filter(r => chaveCpf(r.cpf) === chave)
      .sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
    const ouvidoria = await this.ouvidoria.porCpf(chave).catch(() => [] as ResumoOuv[]);

    return {
      cpf: chave, sac, ouvidoria,
      sacAbertos: sac.filter(r => statusChamado(r) !== 'Resolvida').length,
      ouvidoriaAbertos: ouvidoria.filter(o => OUV_EM_ABERTO.includes(o.status)).length
    };
  }
}
