/// <reference types="vite/client" />

declare const CESIUM_BASE_URL: string

interface ImportMetaEnv {
  /** Base URL of the Java backend. In dev it defaults to http://localhost:9090. */
  readonly VITE_API_URL?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
