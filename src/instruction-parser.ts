import type { ParsedInstruction, TransformKind } from "./types.js";

interface Matcher {
  kind: TransformKind;
  pattern: RegExp;
  extractParams: (match: RegExpMatchArray) => Record<string, string>;
}

const QUOTED = "[`'\"]?([\\w.-]+)[`'\"]?";

const MATCHERS: Matcher[] = [
  {
    kind: "rename-jsx-prop",
    // "rename the `color` prop to `tone` on Button" / "rename prop color to tone on <Button>"
    pattern: new RegExp(
      `rename (?:the )?(?:prop )?${QUOTED} (?:prop )?to ${QUOTED} on <?${QUOTED}>?`,
      "i"
    ),
    extractParams: (m) => ({ oldProp: m[1]!, newProp: m[2]!, tag: m[3]! }),
  },
  {
    kind: "rename-import-path",
    // "replace imports of 'lodash' with 'lodash-es'" / "change import path from X to Y"
    pattern: new RegExp(
      `(?:replace imports? of|change import path from) ${QUOTED} (?:with|to) ${QUOTED}`,
      "i"
    ),
    extractParams: (m) => ({ oldModule: m[1]!, newModule: m[2]! }),
  },
  {
    kind: "rename-identifier",
    // "rename identifier/variable/function/const oldName to newName"
    pattern: new RegExp(
      `rename (?:the )?(?:identifier|variable|function|const)?\\s*${QUOTED} to ${QUOTED}`,
      "i"
    ),
    extractParams: (m) => ({ oldName: m[1]!, newName: m[2]! }),
  },
  {
    kind: "extract-magic-literal",
    // "extract the literal 42 into a constant named MAX_RETRIES" / "extract magic number 3 into a constant RETRY_COUNT"
    pattern: new RegExp(
      `extract (?:the )?(?:magic (?:number|literal)|literal) ${QUOTED} into a constant(?: named)? ${QUOTED}`,
      "i"
    ),
    extractParams: (m) => ({ literal: m[1]!, constantName: m[2]! }),
  },
  {
    kind: "convert-class-to-function-component",
    // "convert class components to function components" / "convert ClassName to a function component"
    pattern: /convert\s+(?:class components|(\w+))\s+to\s+(?:a\s+)?function component/i,
    extractParams: (m) => (m[1] ? { className: m[1] } : {}),
  },
];

export function parseInstruction(raw: string): ParsedInstruction {
  for (const matcher of MATCHERS) {
    const match = raw.match(matcher.pattern);
    if (match) {
      return { kind: matcher.kind, raw, params: matcher.extractParams(match) };
    }
  }
  return { kind: "unknown", raw, params: {} };
}
