// MCP Apps user interface resource for the forecast tool.
// The view document is defined in mcp-app-view-html.mjs so this descriptor
// module stays small and easy to review.

import { FORECAST_CARD_HTML } from "./mcp-app-view-html.mjs";

export const UI_RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";
export const FORECAST_CARD_URI = "ui://road-to-six/forecast-card.html";

export const UI_RESOURCES = Object.freeze([
  Object.freeze({
    uri: FORECAST_CARD_URI,
    name: "forecast-card",
    title: "Road to Six forecast card",
    description: "Interactive card for the football-only forecast: matchup, win probability, what-if availability sliders, and data freshness. Self-contained; loads no external scripts, styles, fonts or images.",
    mimeType: UI_RESOURCE_MIME_TYPE,
  }),
]);

/** Returns the resource contents for a ui:// URI, or null when the URI is unknown. */
export function readUiResource(uri) {
  if (uri !== FORECAST_CARD_URI) return null;
  return [{
    uri: FORECAST_CARD_URI,
    mimeType: UI_RESOURCE_MIME_TYPE,
    text: FORECAST_CARD_HTML,
    _meta: { ui: { prefersBorder: true } },
  }];
}
