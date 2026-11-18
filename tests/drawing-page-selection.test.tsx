import { expect, mock, test } from "bun:test"
import { assembly, RootCircuit } from "@tscircuit/core"
import type { CircuitJson } from "circuit-json"
import { JSDOM } from "jsdom"
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  DrawingViewer,
  type DrawingViewerProps,
} from "../lib/components/DrawingViewer"

const render = async (
  viewer: ReactElement<DrawingViewerProps>,
  { root, container }: { root: Root; container: HTMLElement },
) => {
  await act(async () => root.render(viewer))
  const deadline = Date.now() + 10000
  while (
    container.querySelector('[role="status"]') &&
    viewer.props.circuitJson.length
  ) {
    if (Date.now() > deadline) throw new Error("Drawing rendering timed out")
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }
  expect(container.querySelector('[role="alert"]')).toBeNull()
  return container.querySelector("img")?.getAttribute("src")
}

const selectPage = async ({
  container,
  dom,
  pageId,
}: {
  container: HTMLElement
  dom: JSDOM
  pageId: string
}) => {
  const select = container.querySelector("select")!
  await act(async () => {
    select.value = pageId
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }))
  })
}

const transform = (container: HTMLElement) =>
  container
    .querySelector('[aria-label="Engineering drawing viewport"] > div')
    ?.getAttribute("style")

const createDrawingViewerDom = () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" })
  const previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    ResizeObserver: globalThis.ResizeObserver,
    IS_REACT_ACT_ENVIRONMENT: Reflect.get(
      globalThis,
      "IS_REACT_ACT_ENVIRONMENT",
    ),
  }
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class {
      constructor(private callback: () => void) {}
      observe() {
        this.callback()
      }
      disconnect() {}
    },
  })
  Object.defineProperties(dom.window.HTMLElement.prototype, {
    clientWidth: { get: () => 800 },
    clientHeight: { get: () => 600 },
    offsetWidth: { get: () => 800 },
    offsetHeight: { get: () => 600 },
  })

  const container = document.getElementById("root")!
  const root = createRoot(container)

  return { dom, root, container, previousGlobals }
}

test("switches drawings, refits the viewport, and keeps selection valid as pages change", async () => {
  const circuit = new RootCircuit()
  circuit.add(
    <assembly.device name="device">
      <board name="carrier" width={10} height={8} />
      {[
        { name: "overview", displayName: "Carrier overview" },
        { name: "section" },
        { name: "unnamed" },
      ].map(({ name, displayName }) => (
        <assembly.drawing.page
          key={name}
          name={name}
          displayName={displayName}
          size="iso_a4"
        >
          <assembly.drawing.partview
            partRef=".carrier"
            direction={name === "overview" ? "z+" : "y+"}
            width={20}
            height={15}
          />
        </assembly.drawing.page>
      ))}
    </assembly.device>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const pages = circuitJson.filter((element) => element.type === "drawing_page")
  delete pages[2].name
  const { dom, root, container, previousGlobals } = createDrawingViewerDom()

  try {
    await render(<DrawingViewer circuitJson={circuitJson} />, {
      root,
      container,
    })
    expect(container.querySelectorAll("img")).toHaveLength(1)
    expect(container.querySelector("img")?.alt).toBe(
      "Engineering drawing: Carrier overview",
    )
    expect(container.querySelector("select")?.value).toBe(
      pages[0].drawing_page_id,
    )
    expect(
      [...container.querySelectorAll("option")].map((o) => o.textContent),
    ).toEqual(["Carrier overview", "section", pages[2].drawing_page_id])

    const fittedTransform = transform(container)
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!
        .click()
    })
    expect(transform(container)).not.toBe(fittedTransform)

    await selectPage({ container, dom, pageId: pages[1].drawing_page_id })
    expect(container.querySelectorAll("img")).toHaveLength(1)
    expect(container.querySelector("img")?.alt).toBe(
      "Engineering drawing: section",
    )
    expect(transform(container)).toBe(fittedTransform)

    await render(<DrawingViewer circuitJson={[...circuitJson]} />, {
      root,
      container,
    })
    expect(container.querySelector("select")?.value).toBe(
      pages[1].drawing_page_id,
    )
    await selectPage({ container, dom, pageId: pages[2].drawing_page_id })
    expect(container.querySelector("img")?.alt).toBe(
      `Engineering drawing: ${pages[2].drawing_page_id}`,
    )

    const firstPageOnly = circuitJson.filter(
      (element) =>
        !("drawing_page_id" in element) ||
        element.drawing_page_id === pages[0].drawing_page_id,
    )
    await render(<DrawingViewer circuitJson={firstPageOnly} />, {
      root,
      container,
    })
    expect(container.querySelector("select")).toBeNull()
    expect(container.querySelectorAll("img")).toHaveLength(1)
    expect(container.querySelector("img")?.alt).toBe(
      "Engineering drawing: Carrier overview",
    )

    await render(<DrawingViewer circuitJson={circuitJson} />, {
      root,
      container,
    })
    expect(container.querySelector("select")?.value).toBe(
      pages[0].drawing_page_id,
    )
    await render(<DrawingViewer circuitJson={[]} />, { root, container })
    expect(container.querySelector("select")).toBeNull()
    expect(container.querySelector("img")).toBeNull()
    expect(container.textContent).toContain("No engineering drawings")
  } finally {
    await act(async () => root.unmount())
    Object.assign(globalThis, previousGlobals)
    dom.window.close()
  }
}, 20000)

test("updates Classic F1 models when the resolver changes and reuses drawings while it stays stable", async () => {
  const circuitJson: CircuitJson = await Bun.file(
    new URL("./fixtures/classic-f1-service.circuit.json", import.meta.url),
  ).json()
  const cadComponents = circuitJson.filter(
    (element) => element.type === "cad_component",
  )
  const lcd = cadComponents.find(
    (component) => component.cad_component_id === "cad_component_58",
  )!
  const base = cadComponents.find(
    (component) => component.cad_component_id === "cad_component_52",
  )!

  const lcdPath = "./mechanical/cad/lcd-module.obj"
  const lcdModel = lcd.model_obj_url!
  const replacementModel = base.model_obj_url!
  lcd.model_obj_url = lcdPath
  const resolveLcdAsset = mock((modelUrl: string) =>
    modelUrl === lcdPath ? lcdModel : modelUrl,
  )
  const resolveReplacementAsset = mock((modelUrl: string) =>
    modelUrl === lcdPath ? replacementModel : modelUrl,
  )
  const { dom, root, container, previousGlobals } = createDrawingViewerDom()

  try {
    const initialDrawing = await render(
      <DrawingViewer
        circuitJson={circuitJson}
        resolveStaticAsset={resolveLcdAsset}
      />,
      { root, container },
    )
    expect(resolveLcdAsset).toHaveBeenCalledWith(lcdPath)
    expect(initialDrawing).toBeTruthy()
    const initialResolverCalls = resolveLcdAsset.mock.calls.length

    const unchangedDrawing = await render(
      <DrawingViewer
        circuitJson={circuitJson}
        resolveStaticAsset={resolveLcdAsset}
        className="parent-updated"
      />,
      { root, container },
    )
    expect(resolveLcdAsset).toHaveBeenCalledTimes(initialResolverCalls)
    expect(unchangedDrawing).toBe(initialDrawing)

    const updatedDrawing = await render(
      <DrawingViewer
        circuitJson={circuitJson}
        resolveStaticAsset={resolveReplacementAsset}
      />,
      { root, container },
    )
    expect(resolveReplacementAsset).toHaveBeenCalledWith(lcdPath)
    expect(resolveLcdAsset).toHaveBeenCalledTimes(initialResolverCalls)
    expect(updatedDrawing).toBeTruthy()
    expect(updatedDrawing).not.toBe(initialDrawing)
  } finally {
    await act(async () => root.unmount())
    Object.assign(globalThis, previousGlobals)
    dom.window.close()
  }
}, 30000)
