// The import code parses XML with the browser's DOMParser; Node has none.
import { DOMParser } from "@xmldom/xmldom";

if (!("DOMParser" in globalThis)) {
  (globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser = DOMParser;
}
