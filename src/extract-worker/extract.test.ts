import { describe, expect, it } from "vitest";
import { extract } from "./extract";

describe("extract", () => {
  it("extracts simple js", () => {
    expect(extract('import { foo } from "bar";')).toMatchSnapshot();
  });

  it("extracts default type", () => {
    expect(extract('import foo from "bar";')).toMatchSnapshot();
  });

  it("extracts namespace", () => {
    expect(extract('import * as asdf from "bar";')).toMatchSnapshot();
  });

  it("extracts inline import", () => {
    expect(extract('const bar = await import("bar");')).toMatchSnapshot();
  });
});
