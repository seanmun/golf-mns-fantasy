# Golf MNS Fantasy — Open Issues

## CRITICAL: All API functions return 500

Every serverless function on Vercel crashes immediately with:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/api/_db'
```

**Affected endpoints:** `/api/tournaments`, `/api/golfers`, `/api/pools`, `/api/users/sync`, `/api/pools/mine`, `/api/pools/entries`, `/api/scoring/recalculate`, `/api/admin/scores` — ALL of them.

**Root cause:** `package.json` has `"type": "module"` (ESM). The shared DB helper `api/_db.ts` is imported by every function, but Vercel's bundler doesn't resolve it at runtime. Adding `.js` extensions was attempted but did NOT fix it.

**Possible fixes:**
- Remove `"type": "module"` from package.json (switch to CJS)
- Inline the DB setup in each function instead of sharing `_db.ts`
- Restructure to use a different import pattern Vercel supports

---

## Multiple Vercel projects exist

There are 3 Vercel projects for this app:
- `golf-mns-fantasy`
- `golf-mns-fantasy-s8lw`
- `golf-mns-fantasy-dci9`

Need to verify which one has the `golf.mnsfantasy.com` domain and delete the others.

---

## Tournament dropdown empty on Create Pool page

Direct consequence of the API being broken. Once `/api/tournaments` works, Masters 2026 should appear (it's seeded in the DB).

---

## Golf API key unused

`GOLF_API_KEY` (sportsdata.io) is configured in `.env.local` but no code actually calls the API. All tournament/golfer data is hardcoded in the seed file. Need to wire up live data ingestion.

---

## FIXED: Clerk satellite auth redirect

~~Login from golf.mnsfantasy.com redirected to mnsfantasy.com and never came back.~~
**Fixed:** Changed `domain` prop in ClerkProvider from `window.location.hostname` to `"mnsfantasy.com"`. Also added `redirect_url` param to Sign Up link. Login now works.
