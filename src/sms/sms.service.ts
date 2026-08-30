import { Injectable, Logger } from '@nestjs/common';

const WINSMS_API_URL = 'https://www.winsmspro.com/sms/sms/api';

/**
 * Envoi de SMS via un agrégateur local tunisien (WinSMS.tn), choisi pour son
 * tarif nettement inférieur aux fournisseurs internationaux (Twilio, etc.)
 * et sa simplicité d'intégration (API HTTP GET, sans SDK).
 *
 * Important (contrainte réseau tunisienne, pas une limite ClinikDent) :
 * aucun opérateur ne permet à une API d'envoyer un SMS "depuis" le vrai
 * numéro de téléphone d'un médecin - seul un identifiant textuel
 * (expéditeur alphanumérique, 11 caractères max) est disponible. On utilise
 * donc un identifiant dérivé du nom du cabinet, et on inclut le vrai numéro
 * du cabinet dans le corps du message pour que le patient puisse rappeler.
 *
 * No-op propre tant que WINSMS_API_KEY n'est pas configurée sur Render
 * (même pattern que WhatsAppService et le service Konnect).
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  private isConfigured(): boolean {
    return !!process.env.WINSMS_API_KEY;
  }

  /** Normalise un numéro tunisien en format 216XXXXXXXX (même règle que le lien WhatsApp existant de RecallsPage). */
  private normalizePhone(gsm: string): string {
    let digits = gsm.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = `216${digits.slice(1)}`;
    else if (digits.length <= 8) digits = `216${digits}`;
    return digits;
  }

  /** Dérive un identifiant expéditeur alphanumérique (11 caractères max) à partir du nom du cabinet. */
  sanitizeSenderId(nomCabinet?: string | null): string {
    const fallback = process.env.WINSMS_DEFAULT_SENDER || 'ClinikDent';
    if (!nomCabinet) return fallback;
    const cleaned = nomCabinet
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 11);
    return cleaned || fallback;
  }

  async sendSms(
    gsm: string | null | undefined,
    message: string,
    senderId?: string,
  ): Promise<{ success: boolean; raw?: string }> {
    if (!gsm) {
      this.logger.warn('SMS non envoyé : numéro de téléphone du patient manquant');
      return { success: false };
    }
    if (!this.isConfigured()) {
      this.logger.warn('SMS non configuré (WINSMS_API_KEY absente), envoi ignoré (no-op)');
      return { success: false };
    }

    const params = new URLSearchParams({
      action: 'send-sms',
      api_key: process.env.WINSMS_API_KEY as string,
      to: this.normalizePhone(gsm),
      sms: message,
      from: senderId || process.env.WINSMS_DEFAULT_SENDER || 'ClinikDent',
    });

    try {
      const res = await fetch(`${WINSMS_API_URL}?${params.toString()}`);
      const raw = await res.text();
      if (!res.ok) {
        this.logger.error(`Échec envoi SMS WinSMS (HTTP ${res.status}) : ${raw}`);
        return { success: false, raw };
      }
      return { success: true, raw };
    } catch (err) {
      this.logger.error(`Erreur réseau lors de l'envoi SMS WinSMS : ${err}`);
      return { success: false };
    }
  }
}
