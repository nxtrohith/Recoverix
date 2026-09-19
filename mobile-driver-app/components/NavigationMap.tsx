/**
 * Platform entry — Metro resolves `.web.tsx` / `.native.tsx` automatically.
 * This fallback keeps TypeScript happy for shared imports.
 */
export { NavigationMap, default } from './NavigationMap.web';
