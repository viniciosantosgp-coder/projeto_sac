import { Injectable } from '@angular/core';
import { API_BASE } from './constantes';

export interface RespostaApi<T = any> { ok: boolean; status: number; dados: T | null; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  /** Chama a API da Presença. Lança 'NETWORK_OR_CORS' quando nem chega a responder. */
  async chamar<T = any>(metodo: string, caminho: string, corpo?: unknown, token?: string | null): Promise<RespostaApi<T>> {
    const cabecalhos: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) cabecalhos['Authorization'] = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${caminho}`, {
        method: metodo,
        headers: cabecalhos,
        body: corpo ? JSON.stringify(corpo) : undefined
      });
    } catch {
      throw new Error('NETWORK_OR_CORS');
    }
    let dados: T | null = null;
    try { dados = await res.json(); } catch { dados = null; }
    return { ok: res.ok, status: res.status, dados };
  }
}
