/**
 * BIN-587 B2.2: KYC-approved template.
 *
 * Sendes når moderator har godkjent spillerens identitetsverifisering.
 * Required context: username, supportEmail.
 */

export const KYC_APPROVED_SUBJECT = "Identitet verifisert – Spillorama Bingo";

export const KYC_APPROVED_HTML = `<!doctype html>
<html lang="nb">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Identitet verifisert</title>
</head>
<body style="background:#fff;font-family:Verdana,Geneva,sans-serif;font-size:14px;padding:0;margin:0;">
  <div style="background:#fbfbfb;width:100%;max-width:600px;margin:0 auto;box-shadow:0 0 4px 1px #e5e5e5;">
    <div style="background:#2e0000;color:#fff;font-weight:bold;padding:15px;font-size:18px;text-align:center;border-top-left-radius:10px;border-top-right-radius:10px;">
      Spillorama Bingo
    </div>
    <div style="width:100%;color:#000;text-align:center;background:#fff;border:1px solid #f5f5f5;padding:30px;border-bottom-left-radius:10px;border-bottom-right-radius:10px;">
      <p style="margin:0 0 20px;">Hei <strong>{{username}}</strong>,</p>
      <p style="margin:0 0 20px;">
        Identiteten din er verifisert og kontoen din er nå aktivert.
        Du kan logge inn og begynne å spille.
      </p>
      <p style="margin:0 0 20px;">
        Husk at ansvarlig spill er viktig — du kan når som helst sette
        tapsgrenser eller pause spillingen fra profilen din.
      </p>
      <p style="margin:20px 0 0;">Hilsen<br>Spillorama Bingo</p>
      {{#if supportEmail}}
      <p style="margin:15px 0 0;font-size:12px;color:#555;">
        Har du spørsmål? Kontakt oss på {{supportEmail}}.
      </p>
      {{/if}}
    </div>
  </div>
</body>
</html>
`;

export const KYC_APPROVED_TEXT = `Hei {{username}},

Identiteten din er verifisert og kontoen din er nå aktivert.
Du kan logge inn og begynne å spille.

Husk at ansvarlig spill er viktig — du kan når som helst sette
tapsgrenser eller pause spillingen fra profilen din.

Hilsen
Spillorama Bingo
`;
