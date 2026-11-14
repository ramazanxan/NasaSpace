/// <reference types="vite/client" />

declare const CESIUM_BASE_URL: string

interface ImportMetaEnv {
  /** Base URL of the Java backend. Empty → the app runs on built-in mocks. */
  readonly VITE_API_URL?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
