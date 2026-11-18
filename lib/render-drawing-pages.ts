import type { DrawingPageOutput } from "@tscircuit/circuit-json-to-drawing"
import type { CircuitJson } from "circuit-json"
import type { CircuitTo3DOptions } from "circuit-json-to-gltf"

export interface RenderDrawingPagesOptions {
  drawingPageId?: string
  resolveStaticAsset?: CircuitTo3DOptions["resolveStaticAsset"]
}

export const renderDrawingPages = async (
  circuitJson: CircuitJson,
  options: RenderDrawingPagesOptions = {},
): Promise<DrawingPageOutput[]> => {
  const renderer = await import("./utils/render-drawing-pages")
  return renderer.renderDrawingPages(circuitJson, options)
}
