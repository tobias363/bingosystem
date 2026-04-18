/**
 * BIN-587 B2.2: KYC-rejected template.
 *
 * Sendes når moderator har avvist spillerens identitetsverifisering.
 * Required context: username, reason, supportEmail, resubmitLink?.
 */

export const KYC_REJECTED_SUBJECT = "Identitetsverifisering avvist – Spillorama Bingo";

export const KYC_REJECTED_HTML = `<!doctype html>
<html lang="nb">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Identitetsverifisering avvist</title>
</head>
<body style="background:#fff;font-family:Verdana,Geneva,sans-serif;font-size:14px;padding:0;margin:0;">
  <div style="background:#fbfbfb;width:100%;max-width:600px;margin:0 auto;box-shadow:0 0 4px 1px #e5e5e5;">
    <div style="background:#2e0000;color:#fff;font-weight:bold;padding:15px;font-size:18px;text-align:center;border-top-left-radius:10px;border-top-right-radius:10px;">
      Spillorama Bingo
    </div>
    <div style="width:100%;color:#000;text-align:left;background:#fff;border:1px solid #f5f5f5;padding:30px;border-bottom-left-radius:10px;border-bottom-right-radius:10px;">
      <p style="margin:0 0 20px;">Hei <strong>{{username}}</strong>,</p>
      <p style="margin:0 0 20px;">
        Vi har dessverre måttet avvise identitetsverifiseringen din.
        Kontoen din er derfor ikke aktivert.
      </p>
      {{#if reason}}
      <p style="margin:0 0 20px;padding:15px;background:#fff5f5;border-left:3px solid #c53030;">
        <strong>Begrunnelse:</strong> {{reason}}
      </p>
      {{/if}}
      {{#if resubmitLink}}
      <p style="margin:0 0 20px;">
        Du kan sende inn verifiseringen på nytt:
      </p>
      <div style="margin:25px 0;">
        <a href="{{resubmitLink}}" style="display:inline-block;background:#2e0000;color:#feda02;text-transform:uppercase;font-weight:bold;font-size:16px;padding:15px 25px;border-radius:10px;text-decoration:none;">
          Send inn på nytt
        </a>
      </div>
      {{/if}}
      <p style="margin:20px 0 0;">Hilsen<br>Spillorama Bingo</p>
      {{#if supportEmail}}
      <p style="margin:15px 0 0;font-size:12px;color:#555;">
        Har du spørsmål, kontakt oss på {{supportEmail}}.
      </p>
      {{/if}}
    </div>
  </div>
</body>
</html>
`;

export const KYC_REJECTED_TEXT = `Hei {{username}},

Vi har dessverre måttet avvise identitetsverifiseringen din.
Kontoen din er derfor ikke aktivert.

{{#if reason}}Begrunnelse: {{reason}}
{{/if}}
{{#if resubmitLink}}Du kan sende inn verifiseringen på nytt via:
{{resubmitLink}}
{{/if}}
Har du spørsmål, kontakt oss{{#if supportEmail}} på {{supportEmail}}{{/if}}.

Hilsen
Spillorama Bingo
`;
