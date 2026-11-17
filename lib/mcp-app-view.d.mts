export const UI_RESOURCE_MIME_TYPE: string;
export const FORECAST_CARD_URI: string;
export const UI_RESOURCES: readonly Readonly<{ uri: string; name: string; title: string; description: string; mimeType: string }>[];
export function readUiResource(uri: unknown): { uri: string; mimeType: string; text: string; _meta: Record<string, unknown> }[] | null;
