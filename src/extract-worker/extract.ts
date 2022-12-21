import type { Options } from "acorn";
import { parse } from "acorn-loose";
import { traverse } from "estraverse";
import { Node } from "estree";
import { IImport } from "../types";

export const acornOptions: Options = {
  ecmaVersion: "latest",
  locations: true,
  allowAwaitOutsideFunction: true,
  allowImportExportEverywhere: true,
  allowReserved: true,
  allowReturnOutsideFunction: true,
};

export function extract(text: string) {
  const ast = parse(text, acornOptions);
  const ranges: IImport[] = [];

  traverse(ast as Node, {
    enter(node) {
      if (node.type === "ImportDeclaration") {
        ranges.push({
          range: node.loc!,
          name: String(node.source.value),
          members: node.specifiers.some((s) => s.type === "ImportDefaultSpecifier")
            ? "default"
            : node.specifiers.some((s) => s.type === "ImportNamespaceSpecifier")
            ? "all"
            : node.specifiers.map((s) => s.local.name!),
        });
      } else if (node.type === "ImportExpression" && node.source.type === "Literal") {
        ranges.push({
          range: node.loc!,
          name: String(node.source.value),
          members: "all",
        });
      }
    },
  });

  return ranges;
}
