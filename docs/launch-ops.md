# Launch ops checklist

Owner-run steps after a deploy that ships schema or billing changes. Not CI.

## 1. Schema → tier migrate

1. Deploy so `prisma db push` / `prisma-apply` has run (enum must already know
   `CREATOR` / `GROWTH` / `AGENCY`).
2. Then migrate live rows off retired names:

```bash
node scripts/migrate-tiers.mjs
```

Safe to run twice. Do **not** run before the schema push — Postgres rejects
the new enum values.

`apps/commands` does not boot (see its README). Tier migrate stays a script.

## 2. Stripe smoke

With `billingEnabled` and real Stripe keys:

| Check | Expect |
| --- | --- |
| FinishTrial success | Charges when due; locks clear |
| FinishTrial fail (dead card) | Failure UI / retry; no silent wipe of lifetime |
| Unpaid founding after trial | Lock strip + billing path until settle |
| Cancel → period end → FREE | First Billing “ended on {date}” uses cancel day when recorded |

## 3. Uploads / CORS (`UPLOAD_VIA_SERVER`)

Direct-to-bucket (default, commented in `.env.example`) can surface as a
browser “CORS” error when a privacy extension strips signed query params.

Local / affected users: set `UPLOAD_VIA_SERVER=true` (Cloudflare provider only).
**Do not** flip production default without measuring origin bandwidth.
