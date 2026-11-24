# Backend release and database bootstrap

## Existing project

Use an approved Supabase staging project to rehearse the database change. Apply the new `backend_reliability` migration before deploying the application. Keep the existing migration history. The numbered legacy migrations include shared prefixes, so they must not be replayed against a populated database or marked as applied based solely on the prefix.

The migration derives team access from active memberships. Individual passes and licences remain on the profile when a team changes. Before release, reconcile customer accounts whose earlier individual purchases may have been overwritten by a legacy team assignment. Also review historical manual payments marked verified whose associated access was never activated. The recorded status alone cannot establish a safe extension date.

API quotas now use UTC calendar months. The new ledger starts empty, since the legacy counters cannot be attributed to a specific period. The old columns are preserved for reference.

Keep `LENCO_ENABLED=false` until a sandbox transaction has completed through both browser verification and webhook retry, and its receipt and access grant have been checked. The provider widget, keys, API base and exchange rate are configured with the settings in `.env.local.example`. Manual payment remains available with Lenco disabled.

## Empty project or recovery rehearsal

Run the bootstrap only on a new Supabase project. It installs the historical starting schema, applies every migration in full-filename order, and installs the signup trigger and explicit grants. Set the connection using `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` and a local password mechanism, then run:

```sh
set -o pipefail
bash scripts/bootstrap-database.sh | psql -X -v ON_ERROR_STOP=1
```

The backend CI job does this against disposable PostgreSQL using a minimal platform shim. The shim belongs only in local testing. Dataset rows and R2 object contents require their respective backups or publishing pipelines.

## Publish a catalog replacement

1. Use the authenticated catalog replacement endpoint with the current key and the replacement size in bytes. It returns `replacement_id` and a staged PUT URL.
2. Upload that exact file to the staged URL. Call the same endpoint with `done: true` and `replacement_id`.
3. Run the **Build fast map layers** workflow with that replacement ID. It validates the file, builds its web derivative when needed, and publishes the version if the catalog still points at the expected old key. The previous file and its web derivative stay available for rollback and existing project snapshots.
4. Rebuild and re-seed any affected prebuilt continental bundle. Until then, the per-country downloads remain available.

## Queued work

The lifecycle job retries unsent payment decisions and confirmed account-deletion work. The `account_deletion_jobs` table shows the auth, team and object cleanup stages and the most recent unsuccessful step. It only processes jobs created after explicit confirmation.

Expired workspace upload reservations are released if R2 confirms the object was never written. Existing, unattached objects remain in storage and are reported in Ops for a retention decision.

If an outreach draft shows an unconfirmed send, check the provider and activity log before reopening or sending that draft. The stored claim prevents a retry from sending the same email after an ambiguous provider response.
