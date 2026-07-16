/// <reference types="vite/client" />

declare global {
  interface Window {
    MINER_API_BASE_URL?: string;
  }
}

interface ImportMetaEnv {
  readonly VITE_MINER_API_BASE_URL?: string;
}

export {};
