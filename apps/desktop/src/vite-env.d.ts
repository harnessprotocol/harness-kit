/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GIT_SHA: string;
  readonly VITE_REPO_PATH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
