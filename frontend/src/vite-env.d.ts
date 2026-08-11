/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute base URL of the API, e.g. `https://api.example.com/api/v1`.
   *
   * Left unset in development: Vite proxies /api to the local API process, so the client
   * falls back to the relative `/api/v1` and the browser never sees a cross-origin request.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
