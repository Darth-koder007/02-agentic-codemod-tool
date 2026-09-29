import type { SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { TransformResult } from "../types.js";

/** Renames a top-level function/variable/class declaration and all its references. */
export function renameIdentifier(
  sourceFile: SourceFile,
  params: { oldName: string; newName: string }
): TransformResult {
  const { oldName, newName } = params;

  const candidates = [
    ...sourceFile.getFunctions(),
    ...sourceFile.getVariableDeclarations(),
    ...sourceFile.getClasses(),
  ];

  const declaration = candidates.find((d) => d.getName() === oldName);
  if (!declaration) {
    return { applied: false, skipReason: `No top-level declaration named "${oldName}" found.` };
  }

  const nameNode = declaration.getNameNode();
  if (!nameNode || !Node.isRenameable(nameNode)) {
    return { applied: false, skipReason: `"${oldName}" has no renameable name node.` };
  }

  nameNode.rename(newName);
  return { applied: true };
}
