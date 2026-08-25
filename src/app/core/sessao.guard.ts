import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessaoService } from './sessao.service';

/** Só entra quem tem token válido; o dashboard ainda exige visão geral. */
export const guardaSessao: CanActivateFn = (rota) => {
  const sessao = inject(SessaoService);
  const router = inject(Router);

  if (!sessao.autenticado() && !sessao.tentarAutoLogin()) {
    return router.createUrlTree(['/login']);
  }
  if (rota.data?.['exigeVisaoGeral'] && !sessao.temVisaoGeral()) {
    return router.createUrlTree(['/chamados']);
  }
  return true;
};
