# uploads/

Local media spool used when `STORAGE_PROVIDER=local` (typical for self-host and
local development). Files land here at runtime under date-hashed paths.

Leave this directory empty in git. Do not commit uploaded images, videos, or
other media — they are ignored via `.gitignore` (`uploads/**`).
