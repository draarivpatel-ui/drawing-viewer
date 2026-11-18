import type { DrawingScenePart } from "@tscircuit/circuit-json-to-drawing"
import type { CircuitJson } from "circuit-json"
import {
  type CircuitTo3DOptions,
  convertCircuitJsonTo3D,
  convertSceneToGLTF,
} from "circuit-json-to-gltf"
import { mat4 } from "gl-matrix"
import { bufferFromDataURI, createSceneFromGLTF } from "poppygl"

type ExportedDrawingGltf = {
  buffers: { uri: string }[]
  scene?: number
  scenes: { nodes: number[] }[]
  nodes: { extras?: { tscircuit?: { source_component_id?: string } } }[]
}

async function exportDrawingGltf(
  circuitJson: CircuitJson,
  options: Pick<CircuitTo3DOptions, "foldPcbs" | "resolveStaticAsset"> = {},
) {
  const board = circuitJson.find((element) => element.type === "pcb_board")
  // With textures disabled, the exporter uses geometry fields shared by the
  // viewer's and the host application's Circuit JSON versions.
  const geometry = circuitJson as Parameters<typeof convertCircuitJsonTo3D>[0]
  const model = await convertCircuitJsonTo3D(geometry, {
    boardThickness: board?.thickness,
    renderBoardTextures: false,
    ...options,
  })
  const json = await convertSceneToGLTF(model, { binary: false })
  if (
    json instanceof ArrayBuffer ||
    !("buffers" in json) ||
    !Array.isArray(json.buffers)
  ) {
    throw new Error("Drawing geometry converter returned invalid glTF")
  }
  const gltf = json as ExportedDrawingGltf
  return {
    gltf,
    resources: {
      buffers: gltf.buffers.map(({ uri }) => bufferFromDataURI(uri)),
      images: [],
    },
  }
}

export async function resolveDrawingScene(
  circuitJson: CircuitJson,
  resolveStaticAsset?: CircuitTo3DOptions["resolveStaticAsset"],
) {
  const { gltf, resources } = await exportDrawingGltf(circuitJson, {
    resolveStaticAsset,
  })
  // Keep the exporter frame used by core's resolved dimension endpoints.
  return createSceneFromGLTF(gltf, resources)
}

function canonicalAssemblyCalls(scene: ReturnType<typeof createSceneFromGLTF>) {
  // Assembly movements use (X, Z, -Y), while the glTF exporter uses (-X, Z, Y).
  const rotation = mat4.fromYRotation(mat4.create(), Math.PI)
  return scene.drawCalls.map((call) => ({
    ...call,
    model: mat4.multiply(mat4.create(), rotation, call.model),
  }))
}

export async function resolveAssemblySceneParts(
  circuitJson: CircuitJson,
  resolveStaticAsset?: CircuitTo3DOptions["resolveStaticAsset"],
): Promise<DrawingScenePart[]> {
  const parts: DrawingScenePart[] = []
  const { gltf, resources } = await exportDrawingGltf(circuitJson, {
    resolveStaticAsset,
  })
  for (const index of gltf.scenes[gltf.scene ?? 0].nodes) {
    const sourceId = gltf.nodes[index].extras?.tscircuit?.source_component_id
    if (!sourceId) continue
    const scene = createSceneFromGLTF(
      { ...gltf, scene: 0, scenes: [{ nodes: [index] }] },
      resources,
    )
    parts.push({
      source_component_id: sourceId,
      drawCalls: canonicalAssemblyCalls(scene),
    })
  }

  // PCB mesh nodes lack a source ID. Export each board with its own drills
  // and cutouts so coincident boards keep distinct identities in the drawing.
  const boards = circuitJson.filter((element) => element.type === "pcb_board")
  const foldPcbs = circuitJson.some(
    (element) =>
      element.type === "cad_component" && element.is_on_folded_board === true,
  )
  for (const board of boards) {
    const boardElements = circuitJson.filter((element) => {
      if (!element.type.startsWith("pcb_") || element.type === "pcb_panel")
        return false
      if ("pcb_board_id" in element && element.pcb_board_id)
        return element.pcb_board_id === board.pcb_board_id
      return (
        boards.length === 1 ||
        ("subcircuit_id" in element &&
          element.subcircuit_id === board.subcircuit_id)
      )
    })
    const boardModel = await exportDrawingGltf(boardElements, { foldPcbs })
    parts.push({
      pcb_board_id: board.pcb_board_id,
      drawCalls: canonicalAssemblyCalls(
        createSceneFromGLTF(boardModel.gltf, boardModel.resources),
      ),
    })
  }
  return parts
}
