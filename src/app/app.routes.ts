import { Routes } from '@angular/router';
import { guardaSessao } from './core/sessao.guard';

export const ROTAS: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'chamados' },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'chamados',
    canActivate: [guardaSessao],
    loadComponent: () => import('./features/chamados/chamados.component').then(m => m.ChamadosComponent)
  },
  {
    path: 'dashboard',
    canActivate: [guardaSessao],
    data: { exigeVisaoGeral: true },
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    // manifestações da ouvidoria (Firestore: ouvidoria_chamados)
    path: 'ouvidoria',
    canActivate: [guardaSessao],
    loadComponent: () => import('./features/ouvidoria/ouvidoria.component').then(m => m.OuvidoriaComponent)
  },
  { path: '**', redirectTo: 'chamados' }
];
