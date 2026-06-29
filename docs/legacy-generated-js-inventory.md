# Legacy generated JavaScript inventory

These JavaScript files were found next to equivalent TypeScript/TSX source files under `apps/web/src` and `packages/shared/src`.

Validation performed before moving them:

- `rg -n "from './.*\\.js|from '../.*\\.js|import\\(.*\\.js" apps/web packages/shared` returned no matches, so no explicit local `.js` imports were found in those workspaces.
- `apps/web/index.html` uses `/src/main.tsx` as the Vite module entrypoint.
- `npm run typecheck -w @miclub/web` passed.
- `npm run build -w @miclub/web` passed.

The files were moved to `docs/legacy-generated-js/` with their original relative paths preserved so they can be audited or removed permanently in a follow-up cleanup.

| Original path | Temporary location | Active source counterpart |
| --- | --- | --- |
| `apps/web/src/App.js` | `docs/legacy-generated-js/apps/web/src/App.js` | `apps/web/src/App.tsx` |
| `apps/web/src/LoginScreen.js` | `docs/legacy-generated-js/apps/web/src/LoginScreen.js` | `apps/web/src/LoginScreen.tsx` |
| `apps/web/src/api.js` | `docs/legacy-generated-js/apps/web/src/api.js` | `apps/web/src/api.ts` |
| `apps/web/src/main.js` | `docs/legacy-generated-js/apps/web/src/main.js` | `apps/web/src/main.tsx` |
| `apps/web/src/modules/CrmModule.js` | `docs/legacy-generated-js/apps/web/src/modules/CrmModule.js` | `apps/web/src/modules/CrmModule.tsx` |
| `apps/web/src/modules/DataMigrationModule.js` | `docs/legacy-generated-js/apps/web/src/modules/DataMigrationModule.js` | `apps/web/src/modules/DataMigrationModule.tsx` |
| `apps/web/src/modules/HomeModule.js` | `docs/legacy-generated-js/apps/web/src/modules/HomeModule.js` | `apps/web/src/modules/HomeModule.tsx` |
| `apps/web/src/modules/ModuleNav.js` | `docs/legacy-generated-js/apps/web/src/modules/ModuleNav.js` | `apps/web/src/modules/ModuleNav.tsx` |
| `apps/web/src/modules/PlaceholderModule.js` | `docs/legacy-generated-js/apps/web/src/modules/PlaceholderModule.js` | `apps/web/src/modules/PlaceholderModule.tsx` |
| `apps/web/src/utils.js` | `docs/legacy-generated-js/apps/web/src/utils.js` | `apps/web/src/utils.ts` |
| `packages/shared/src/index.js` | `docs/legacy-generated-js/packages/shared/src/index.js` | `packages/shared/src/index.ts` |
