// Not an env var: vite.config.ts puts the root package.json's version here, the
// same number the app shows on its start page.
interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string
}
