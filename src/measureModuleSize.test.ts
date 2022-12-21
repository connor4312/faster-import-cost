import { join } from "path";
import { expect, it } from "vitest";
import { measureModuleSize } from "./measureModuleSize";

it("measureModuleSize", async () => {
  const size = await measureModuleSize(__dirname, join(__dirname, ".."), {
    name: "acorn",
    members: ["parse"],
    range: { end: { column: 0, line: 0 }, start: { column: 0, line: 0 } },
  });

  expect(size.compressed).to.be.greaterThan(0);
  expect(size.original).to.be.greaterThan(0);
  expect(size.original).to.be.greaterThan(size.compressed);
});
