import type { SourceFile } from "ts-morph";
import type { TransformResult } from "../types.js";

export function renameImportPath(
  sourceFile: SourceFile,
  params: { oldModule: string; newModule: string }
): TransformResult {
  const { oldModule, newModule } = params;

  const importDecl = sourceFile
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue() === oldModule);

  if (!importDecl) {
    return { applied: false, skipReason: `No import of "${oldModule}" found.` };
  }

  importDecl.setModuleSpecifier(newModule);
  return { applied: true };
}
