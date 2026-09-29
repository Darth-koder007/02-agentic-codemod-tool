import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind, VariableDeclarationKind } from "ts-morph";
import type { TransformResult } from "../types.js";

function findNextMatch(
  sourceFile: SourceFile,
  literal: string,
  isNumeric: boolean
): Node | undefined {
  if (isNumeric) {
    return sourceFile
      .getDescendantsOfKind(SyntaxKind.NumericLiteral)
      .find((n) => n.getText() === literal);
  }
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.StringLiteral)
    .find((n) => n.getLiteralValue() === literal);
}

export function extractMagicLiteral(
  sourceFile: SourceFile,
  params: { literal: string; constantName: string }
): TransformResult {
  const { literal, constantName } = params;
  const isNumeric = /^-?\d+(\.\d+)?$/.test(literal);

  if (!findNextMatch(sourceFile, literal, isNumeric)) {
    return { applied: false, skipReason: `No literal matching "${literal}" found.` };
  }

  // Re-query the tree fresh each iteration — a prior replaceWithText invalidates other Node
  // wrappers obtained before it (a well-known ts-morph gotcha), so holding a list of matches
  // across mutations would throw on the second replacement.
  let match = findNextMatch(sourceFile, literal, isNumeric);
  while (match) {
    match.replaceWithText(constantName);
    match = findNextMatch(sourceFile, literal, isNumeric);
  }

  const importCount = sourceFile.getImportDeclarations().length;
  sourceFile.insertVariableStatement(importCount, {
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      { name: constantName, initializer: isNumeric ? literal : JSON.stringify(literal) },
    ],
  });

  return { applied: true };
}
