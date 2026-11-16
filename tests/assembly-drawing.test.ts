import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { renderDrawingPages } from "../lib"
import { resolveAssemblySceneParts } from "../lib/utils/resolve-drawing-scene"

test("renders an exploded sheet and keeps coincident PCB identities distinct", async () => {
  const circuit: CircuitJson = [
    ...["upper", "lower"].map((pcb_board_id): CircuitJson[number] => ({
      type: "pcb_board",
      pcb_board_id,
      center: { x: 0, y: 0 },
      width: 12,
      height: 8,
      thickness: 1.6,
      num_layers: 2,
      material: "fr4",
    })),
    {
      type: "drawing_page",
      drawing_page_id: "sheet",
      name: "service",
      width: 100,
      height: 80,
    },
    {
      type: "drawing_assembly_stage",
      drawing_assembly_stage_id: "assembled",
      name: "assembled",
      pcb_board_ids: ["upper", "lower"],
    },
    {
      type: "drawing_explosion_view",
      drawing_page_id: "sheet",
      drawing_explosion_view_id: "exploded",
      drawing_assembly_stage_id: "assembled",
      display_name: "Service view",
      direction: "isometric",
      center: { x: 0, y: 0 },
      width: 88,
      height: 64,
      moves: [{ pcb_board_ids: ["upper"], translation: { x: 0, y: 0, z: 15 } }],
    },
  ]

  const parts = await resolveAssemblySceneParts(circuit)
  expect(parts.map((part) => part.pcb_board_id)).toEqual(["upper", "lower"])
  expect(parts.every((part) => part.drawCalls.length > 0)).toBe(true)

  const [page] = await renderDrawingPages(circuit)
  expect(page.drawingPageId).toBe("sheet")
  expect(page.svg).toContain("Service view")
  expect(page.svg).toContain("data:image/png;base64,")
})
