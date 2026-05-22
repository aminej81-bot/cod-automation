/**
 * Environment loader — must be the first import in server.ts.
 *
 * Why a separate file instead of `import 'dotenv/config'`:
 *   dotenv's `./config` subpath is resolved via the package's `exports` map.
 *   That map lookup can fail in multi-stage Docker builds (Nixpacks, Railway)
 *   when the runner layer's module resolution path differs from the builder.
 *
 * Why not `import dotenv from 'dotenv'; dotenv.config()` directly in server.ts:
 *   TypeScript hoists ALL import declarations above any statements, so
 *   dotenv.config() would run *after* every other module has already been
 *   required — meaning process.env would still be empty when config/index.ts
 *   first reads it.
 *
 * This shim is imported as a bare side-effect (`import './env'`), which
 * TypeScript compiles to a `require('./env')` call that executes synchronously
 * and inline — before the next require in server.ts.
 */
import dotenv from 'dotenv';

dotenv.config();
