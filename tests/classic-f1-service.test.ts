import { expect, mock, spyOn, test } from "bun:test"
import "bun-match-svg"
import type { CircuitJson } from "circuit-json"
import { renderDrawingPages } from "../lib"

const lcdPath = "./mechanical/cad/lcd-module.obj"

// The fixture uses the published Classic F1 v6.0.12 outline and stage moves
// with simplified enclosure meshes.
const renderServiceSheet = async () => {
  const circuitJson: CircuitJson = await Bun.file(
    new URL("./fixtures/classic-f1-service.circuit.json", import.meta.url),
  ).json()
  const lcd = circuitJson.find(
    (element) =>
      element.type === "cad_component" &&
      element.cad_component_id === "cad_component_58",
  )
  if (lcd?.type !== "cad_component" || !lcd.model_obj_url)
    throw new Error("The Classic F1 fixture is missing its LCD model")
  const lcdModel = lcd.model_obj_url
  lcd.model_obj_url = lcdPath

  const resolveStaticAsset = mock((path: string) =>
    path === lcdPath ? lcdModel : path,
  )
  const fetchModel = globalThis.fetch
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    new Proxy(fetchModel, {
      apply(target, receiver, args) {
        if (String(args[0]).endsWith(lcdPath.slice(1)))
          return Promise.resolve(
            new Response("# No model at the relative URL\n"),
          )
        return Reflect.apply(target, receiver, args)
      },
    }),
  )
  try {
    const options = {
      drawingPageId: circuitJson.find(
        (element) => element.type === "drawing_page",
      )?.drawing_page_id,
      resolveStaticAsset,
    }
    const [page] = await renderDrawingPages(circuitJson, options)
    return { svg: page.svg, resolveStaticAsset }
  } finally {
    fetchSpy.mockRestore()
  }
}

test("matches the Classic F1 service sheet snapshot", async () => {
  const { svg } = await renderServiceSheet()
  await expect(svg).toMatchSvgSnapshot(import.meta.path)
})

test("renders the exploded Classic F1 view and its callouts", async () => {
  const { svg } = await renderServiceSheet()
  expect(svg).toContain("EXPLODED FOR SERVICE")
  expect(svg).toContain("Display mount")
  expect(svg.match(/data:image\/png;base64,/g)).toHaveLength(3)
})

test.failing("resolves Classic F1's release-relative LCD OBJ", async () => {
  const { resolveStaticAsset } = await renderServiceSheet()
  expect(resolveStaticAsset).toHaveBeenCalledWith(lcdPath)
})
