export interface SkriinRuntimeConfig {
  apiBaseUrl?: string;
}

declare global {
  var __SKRIIN_CONFIG__: SkriinRuntimeConfig | undefined;
}

export function runtimeApiBaseUrl(fallback: string): string {
  const configured = globalThis.__SKRIIN_CONFIG__?.apiBaseUrl?.trim();
  return (configured || fallback).replace(/\/$/, '');
}
