// ─── Service d'envoi d'email (vérification de compte) ────────────────
// Deux implémentations sélectionnées au boot selon l'environnement :
//   • SMTP Gmail (Nodemailer) si SMTP_USER et SMTP_PASS sont présents ;
//   • Console (mode dégradé) sinon → le code est LOGGÉ, pratique en dev local
//     sans SMTP. Le code n'est JAMAIS loggué en clair hors de ce mode dégradé.
import nodemailer, { type Transporter } from 'nodemailer';
import { resolve4 } from 'dns/promises';

export interface MailService {
  // Envoie le code de vérification à 6 chiffres à l'adresse donnée.
  sendVerificationCode(to: string, code: string): Promise<void>;
  // Envoie le code de réinitialisation de mot de passe à 6 chiffres.
  sendPasswordResetCode(to: string, code: string): Promise<void>;
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

// Mail « mot de passe oublié » : même format, consigne de sécurité explicite.
function passwordResetEmail(code: string): { subject: string; text: string } {
  return {
    subject: 'Joker — réinitialisation de votre mot de passe',
    text:
      `Une réinitialisation de mot de passe a été demandée pour votre compte Joker.\n\n` +
      `Votre code de réinitialisation est :\n\n` +
      `    ${code}\n\n` +
      `Saisissez-le dans l'application pour choisir un nouveau mot de passe.\n` +
      `Ce code expire dans 15 minutes.\n\n` +
      `Si vous n'êtes pas à l'origine de cette demande, ignorez cet email :\n` +
      `votre mot de passe actuel reste inchangé.`,
  };
}

// ── Implémentation SMTP Gmail ──
// Le réseau Render ne route pas l'IPv6 sortante : si Gmail est résolu en
// AAAA, la connexion échoue (ENETUNREACH). Nodemailer 9 n'a PAS d'option
// `family` : il résout lui-même (resolve4 + resolve6) et tire une adresse AU
// HASARD dans le lot combiné. On force donc l'IPv4 en amont : résolution A
// explicite à chaque envoi, puis `host` = IP (nodemailer court-circuite sa
// propre résolution DNS quand host est une IP) + `tls.servername` pour le
// SNI et la validation du certificat sur le vrai nom d'hôte.
const SMTP_HOST = 'smtp.gmail.com';

class SmtpMailService implements MailService {
  private user: string;
  private pass: string;

  constructor(user: string, pass: string) {
    this.user = user;
    this.pass = pass;
  }

  // Résout smtp.gmail.com en IPv4 (enregistrements A uniquement). En cas
  // d'échec DNS, on retombe sur le hostname : nodemailer résoudra lui-même.
  private async resolveIpv4Host(): Promise<string> {
    try {
      const addresses = await resolve4(SMTP_HOST);
      if (addresses.length > 0) return addresses[0];
    } catch {
      // DNS indisponible : fallback hostname ci-dessous.
    }
    return SMTP_HOST;
  }

  // Transport construit à l'envoi (volume très faible : codes de vérif) avec
  // l'hôte résolu. Timeouts courts : les défauts nodemailer sont de 2 min,
  // inacceptable dans un flux HTTP.
  private buildTransporter(host: string): Transporter {
    return nodemailer.createTransport({
      host,
      port: 465,
      secure: true, // TLS implicite sur 465
      auth: { user: this.user, pass: this.pass },
      connectionTimeout: 5000, // établissement TCP
      greetingTimeout: 5000,   // bannière SMTP après connexion
      socketTimeout: 10000,    // inactivité en cours de session
      tls: { servername: SMTP_HOST }, // SNI + validation certificat quand host est une IP
    });
  }

  // Envoi générique : résolution IPv4 + transport éphémère (volume faible).
  private async send(to: string, subject: string, text: string): Promise<void> {
    const host = await this.resolveIpv4Host();
    const transporter = this.buildTransporter(host);
    await transporter.sendMail({ from: this.user, to, subject, text });
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    const { subject, text } = verificationEmail(code);
    await this.send(to, subject, text);
  }

  async sendPasswordResetCode(to: string, code: string): Promise<void> {
    const { subject, text } = passwordResetEmail(code);
    await this.send(to, subject, text);
  }
}

// ── Implémentation console (mode dégradé, dev local sans SMTP) ──
class ConsoleMailService implements MailService {
  async sendVerificationCode(to: string, code: string): Promise<void> {
    // Seul endroit où un code peut apparaître en clair dans les logs : mode
    // dégradé explicite, jamais en production avec SMTP configuré.
    console.log(`[MAIL] code de vérification pour ${to} : ${code}`);
  }

  async sendPasswordResetCode(to: string, code: string): Promise<void> {
    console.log(`[MAIL] code de réinitialisation pour ${to} : ${code}`);
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
