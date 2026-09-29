import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { TransformResult } from "../types.js";

export function renameJsxProp(
  sourceFile: SourceFile,
  params: { tag: string; oldProp: string; newProp: string }
): TransformResult {
  const { tag, oldProp, newProp } = params;

  const elements = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ].filter((el) => el.getTagNameNode().getText() === tag);

  if (elements.length === 0) {
    return { applied: false, skipReason: `No <${tag}> usages found.` };
  }

  let renamedAny = false;
  for (const element of elements) {
    const attr = element
      .getAttributes()
      .find((a) => Node.isJsxAttribute(a) && a.getNameNode().getText() === oldProp);
    if (attr && Node.isJsxAttribute(attr)) {
      attr.getNameNode().replaceWithText(newProp);
      renamedAny = true;
    }
  }

  if (!renamedAny) {
    return { applied: false, skipReason: `No <${tag}> usage has a "${oldProp}" prop.` };
  }

  return { applied: true };
}
