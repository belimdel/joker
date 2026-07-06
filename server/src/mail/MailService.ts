// ─── Service d'envoi d'email (vérification de compte) ────────────────
// Deux implémentations sélectionnées au boot selon l'environnement :
//   • SMTP Gmail (Nodemailer) si SMTP_USER et SMTP_PASS sont présents ;
//   • Console (mode dégradé) sinon → le code est LOGGÉ, pratique en dev local
//     sans SMTP. Le code n'est JAMAIS loggué en clair hors de ce mode dégradé.
import nodemailer, { type Transporter } from 'nodemailer';

export interface MailService {
  // Envoie le code de vérification à 6 chiffres à l'adresse donnée.
  sendVerificationCode(to: string, code: string): Promise<void>;
}

// Corps du mail : sujet clair, code en gros, mention de l'expiration 15 min.
function verificationEmail(code: string): { subject: string; text: string } {
  return {
    subject: 'Joker — votre code de vérification',
    text:
      `Bienvenue sur Joker !\n\n` +
      `Votre code de vérification est :\n\n` +
      `    ${code}\n\n` +
      `Saisissez-le dans l'application pour activer votre compte.\n` +
      `Ce code expire dans 15 minutes.\n\n` +
      `Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
  };
}

// ── Implémentation SMTP Gmail ──
class SmtpMailService implements MailService {
  private transporter: Transporter;
  private from: string;

  constructor(user: string, pass: string) {
    this.from = user;
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // TLS implicite sur 465
      auth: { user, pass },
    });
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    const { subject, text } = verificationEmail(code);
    await this.transporter.sendMail({ from: this.from, to, subject, text });
  }
}

// ── Implémentation console (mode dégradé, dev local sans SMTP) ──
class ConsoleMailService implements MailService {
  async sendVerificationCode(to: string, code: string): Promise<void> {
    // Seul endroit où un code peut apparaître en clair dans les logs : mode
    // dégradé explicite, jamais en production avec SMTP configuré.
    console.log(`[MAIL] code de vérification pour ${to} : ${code}`);
  }
}

// Fabrique le service selon l'environnement (une seule fois au chargement).
function createMailService(): MailService {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (user && pass) {
    console.log('📧 MailService : SMTP Gmail activé.');
    return new SmtpMailService(user, pass);
  }
  console.warn(
    '⚠️  MailService : SMTP_USER/SMTP_PASS absents — mode dégradé (les codes de vérification sont loggués en console).',
  );
  return new ConsoleMailService();
}

export const mailService: MailService = createMailService();
