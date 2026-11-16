import { expect, test } from "bun:test"
import "bun-match-svg"
import { renderDrawingPages } from "../lib"

// The fixture uses the published Classic F1 v6.0.12 outline and stage moves
// with simplified enclosure meshes.
const renderServiceSheet = async () => {
  const circuitJson = await Bun.file(
    new URL("./fixtures/classic-f1-service.circuit.json", import.meta.url),
  ).json()
  const [page] = await renderDrawingPages(circuitJson)
  return page.svg
}

test("matches the Classic F1 service sheet snapshot", async () => {
  const svg = await renderServiceSheet()
  await expect(svg).toMatchSvgSnapshot(import.meta.path)
})

test("renders the exploded Classic F1 view and its callouts", async () => {
  const svg = await renderServiceSheet()
  expect(svg).toContain("EXPLODED FOR SERVICE")
  expect(svg).toContain("Display mount")
  expect(svg.match(/data:image\/png;base64,/g)).toHaveLength(3)
})
