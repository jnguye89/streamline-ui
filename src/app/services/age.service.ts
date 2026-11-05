import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/** The youngest age that can go live, per the terms of service. */
export const MIN_GO_LIVE_AGE = 18;

export interface Me {
  birthDate: string | null;
  termsAcceptedAt: string | null;
}

/**
 * Age rules from the terms: an account needs 13+, going live needs 18+. People give their date
 * of birth once after signing in. The API enforces both rules; this drives the screens.
 */
@Injectable({ providedIn: 'root' })
export class AgeService {
  private readonly apiUrl = environment.baseUrl;

  constructor(private readonly http: HttpClient) {}

  async getMe(): Promise<Me> {
    const me = await firstValueFrom(this.http.get<Partial<Me>>(`${this.apiUrl}/user/me`));
    return { birthDate: me.birthDate ?? null, termsAcceptedAt: me.termsAcceptedAt ?? null };
  }

  /**
   * Saves their date of birth (YYYY-MM-DD). "underage" means under 13: the API has already
   * deleted the account.
   */
  async setBirthDate(birthDate: string): Promise<'saved' | 'underage'> {
    try {
      await firstValueFrom(this.http.post(`${this.apiUrl}/user/me/birthdate`, { birthDate }));
      return 'saved';
    } catch (e) {
      // The only refusal this endpoint gives (403, code "underage"): the account is gone.
      // Checked by status alone too, so a missing code can't turn it into a generic error.
      if (e instanceof HttpErrorResponse && e.status === 403) return 'underage';
      throw e;
    }
  }

  /** Whole years old today, for a YYYY-MM-DD birth date. */
  ageOf(birthDate: string, today = new Date()): number {
    const [y, m, d] = birthDate.split('-').map(Number);
    let age = today.getFullYear() - y;
    const month = today.getMonth() + 1;
    if (month < m || (month === m && today.getDate() < d)) age -= 1;
    return age;
  }
}
