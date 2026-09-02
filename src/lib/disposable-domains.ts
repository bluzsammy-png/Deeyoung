// QUANTEDGE PRO — disposable / temporary email domain blocklist (signup anti-abuse layer 1).
// Curated core list of the most-abused throwaway providers. Extend weekly from
// https://github.com/disposable-email-domains/disposable-email-domains (see DEPLOY.md).

const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  // classic throwaway inboxes
  "mailinator.com", "10minutemail.com", "10minutemail.net", "guerrillamail.com", "guerrillamail.net",
  "guerrillamail.org", "guerrillamailblock.com", "sharklasers.com", "grr.la", "spam4.me",
  "yopmail.com", "yopmail.fr", "yopmail.net", "cool.fr.nf", "jetable.fr.nf", "nospam.ze.tc",
  "temp-mail.org", "temp-mail.io", "tempmail.com", "tempmail.net", "tempmail.plus", "tempmailo.com",
  "throwawaymail.com", "trashmail.com", "trashmail.de", "trashmail.net", "trash-mail.com",
  "getnada.com", "nada.email", "dispostable.com", "maildrop.cc", "mintemail.com", "mohmal.com",
  "tempinbox.com", "fakeinbox.com", "mailnesia.com", "mailcatch.com", "tempr.email",
  "discard.email", "discardmail.com", "emailondeck.com", "mail7.io", "tempail.com",
  "mytemp.email", "mailtemp.net", "tmpmail.org", "tmpmail.net", "tempmail.dev",
  // numbered / rotating inboxes
  "1secmail.com", "1secmail.net", "1secmail.org", "esiix.com", "wwjmp.com", "xojxe.com", "yoggm.com",
  "mohmal.im", "vjuum.com", "laafd.com", "txcct.com", "kzccv.com", "qiott.com",
  // bulk/abuse-friendly providers
  "mail.tm", "mail.gw", "mail.cc", "inboxbear.com", "spambog.com", "spamgourmet.com",
  "mytrashmail.com", "nowmymail.com", "mailsac.com", "inboxkitten.com", "harakirimail.com",
  "deadaddress.com", "gustr.com", "mailde.de", "mailde.info", "mailpoof.com", "moakt.com",
  "emailtemp.net", "email-fake.com", "fakemail.net", "fakemailgenerator.com", "mail-far-def.com",
  "burnermail.io", "burnermail.com", "anonaddy.me", "anonaddy.com", "simplelogin.io",
  "spamherelots.com", "binkmail.com", "bobmail.info", "chammy.info", "devnullmail.com",
  "letthemeatspam.com", "mailin8r.com", "mailinater.com", "mailinator.net", "mailinator2.com",
  "notmailinator.com", "reallymymail.com", "sogetthis.com", "suremail.info", "thisisnotmyrealemail.com",
  "trbvm.com", "trbvn.com", "walkmail.net", "zoemail.com", "zoemail.net", "zoemail.org",
  // “privacy relay” domains that break account recovery & abuse tracing
  "duck.com", "relay.firefox.com", "privaterelay.appleid.com", "hideaddress.net",
  // common gTLD abuse patterns seen in tempmail farms
  "instant-mail.de", "einrot.com", "gustr.com", "cuvox.de", "dayrep.com", "fleckens.hu",
  "jourrapide.com", "rhyta.com", "superrito.com", "teleworm.us", "armyspy.com",
]);

/** True when the email's domain is a known disposable/relay provider. */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain) return false;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  // catch subdomain variants like foo.mailinator.com
  const parts = domain.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    if (DISPOSABLE_DOMAINS.has(parts.slice(i).join("."))) return true;
  }
  return false;
}
