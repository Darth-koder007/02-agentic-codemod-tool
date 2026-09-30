import type { ClassDeclaration, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { TransformResult } from "../types.js";

interface StateField {
  name: string;
  initializer: string;
}

/**
 * Deliberately narrow: only handles a class with (at most) a constructor that does nothing but
 * `super(props)` and a single `this.state = {...}` assignment, plus exactly one `render()` method
 * with no other lifecycle/instance methods. Anything else (componentDidMount, helper methods,
 * multi-key setState calls, `this.state` reassigned outside the constructor) bails out with a
 * specific reason rather than guessing — this is the honest scope for a "canned", not LLM-backed,
 * transform. See PLAN.md M2.2 for why this trade-off (AST for location/validation, text templating
 * for the output) was made instead of a fully general node-by-node rewrite.
 */
export function convertClassToFunctionComponent(
  sourceFile: SourceFile,
  params: { className?: string }
): TransformResult {
  const classes = sourceFile.getClasses();
  const target = params.className
    ? classes.find((c) => c.getName() === params.className)
    : classes.find((c) => extendsComponent(c));

  if (!target) {
    return {
      applied: false,
      skipReason: params.className
        ? `No class named "${params.className}" found.`
        : "No class extending React.Component found.",
    };
  }
  if (!extendsComponent(target)) {
    return { applied: false, skipReason: `"${target.getName()}" doesn't extend Component.` };
  }

  const methods = target.getInstanceMethods();
  const methodNames = methods.map((m) => m.getName());
  const disallowed = methodNames.filter((n) => n !== "render");
  if (disallowed.length > 0) {
    return {
      applied: false,
      skipReason: `Has methods beyond render() this transform doesn't support: ${disallowed.join(", ")}.`,
    };
  }

  const renderMethod = methods.find((m) => m.getName() === "render");
  if (!renderMethod) {
    return { applied: false, skipReason: "No render() method found." };
  }

  const stateResult = extractState(target);
  if (!stateResult.ok) {
    return { applied: false, skipReason: stateResult.skipReason };
  }

  const bodyBlock = renderMethod.getBody();
  if (!bodyBlock || !Node.isBlock(bodyBlock)) {
    return { applied: false, skipReason: "render() has no block body." };
  }

  let bodyText = bodyBlock
    .getStatements()
    .map((s) => s.getText())
    .join("\n  ");

  const setStateCalls = [...bodyText.matchAll(/this\.setState\(\{\s*(\w+)\s*:\s*([^}]+)\}\)/g)];
  const multiKeySetState = /this\.setState\(\{[^}]*,[^}]*\}\)/.test(bodyText);
  if (multiKeySetState) {
    return { applied: false, skipReason: "Multi-key setState() calls aren't supported." };
  }

  // setState calls must be rewritten before the general this.state.X substitution below —
  // `full` here is matched text from the pre-substitution body, so it stops matching once
  // any this.state.X inside it (e.g. the `count` in `setState({ count: this.state.count + 1 })`)
  // has already been rewritten. The this.state.X pass afterward still catches that same
  // reference wherever it now sits (e.g. inside the new setCount(...) call).
  for (const call of setStateCalls) {
    const [full, key, expr] = call;
    bodyText = bodyText.replace(full!, `set${capitalize(key!)}(${expr!.trim()})`);
  }
  for (const field of stateResult.fields) {
    bodyText = bodyText.replaceAll(`this.state.${field.name}`, field.name);
  }
  bodyText = bodyText.replaceAll("this.props.", "props.").replaceAll("this.props", "props");

  const stateHooks = stateResult.fields
    .map((f) => `const [${f.name}, set${capitalize(f.name)}] = useState(${f.initializer});`)
    .join("\n  ");

  const className = target.getName()!;
  const propsType = getPropsTypeName(target);
  const newFunctionText = [
    `function ${className}(props${propsType ? `: ${propsType}` : ""}) {`,
    stateHooks ? `  ${stateHooks}` : "",
    `  ${bodyText}`,
    `}`,
  ]
    .filter(Boolean)
    .join("\n");

  ensureUseStateImport(sourceFile, stateResult.fields.length > 0);
  target.replaceWithText(newFunctionText);

  return { applied: true };
}

function extendsComponent(cls: ClassDeclaration): boolean {
  // getExtends() includes generic type args verbatim (e.g. "Component<CounterProps>"), so compare
  // only the base expression before any "<".
  const base = (cls.getExtends()?.getExpression().getText() ?? "").trim();
  return base === "Component" || base === "React.Component";
}

function getPropsTypeName(cls: ClassDeclaration): string | undefined {
  const typeArgs = cls.getExtends()?.getTypeArguments();
  return typeArgs?.[0]?.getText();
}

type StateExtraction = { ok: true; fields: StateField[] } | { ok: false; skipReason: string };

function extractState(cls: ClassDeclaration): StateExtraction {
  const stateProperty = cls.getInstanceProperty("state");
  if (stateProperty && Node.isPropertyDeclaration(stateProperty)) {
    const initializer = stateProperty.getInitializer();
    if (initializer && Node.isObjectLiteralExpression(initializer)) {
      return { ok: true, fields: parseObjectLiteralFields(initializer.getText()) };
    }
  }

  const ctor = cls.getConstructors()[0];
  if (!ctor) return { ok: true, fields: [] };

  const statements = ctor.getBodyOrThrow().getText();
  const superOnly = /^\{\s*super\(props\);?\s*\}$/.test(statements.replace(/\n\s*/g, " ").trim());
  if (superOnly) return { ok: true, fields: [] };

  const match = statements.match(/this\.state\s*=\s*(\{[^;]*\});/);
  if (!match) {
    return {
      ok: false,
      skipReason: "Constructor does more than super(props) + this.state = {...}.",
    };
  }
  const remainder = statements
    .replace(/super\(props\);?/, "")
    .replace(match[0], "")
    .replace(/[\s{}]/g, "");
  if (remainder.length > 0) {
    return { ok: false, skipReason: "Constructor has statements beyond super() and state init." };
  }

  return { ok: true, fields: parseObjectLiteralFields(match[1]!) };
}

function parseObjectLiteralFields(objectLiteralText: string): StateField[] {
  const inner = objectLiteralText.replace(/^\{/, "").replace(/\}$/, "");
  return inner
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, ...rest] = entry.split(":");
      return { name: name!.trim(), initializer: rest.join(":").trim() };
    });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ensureUseStateImport(sourceFile: SourceFile, needed: boolean): void {
  if (!needed) return;

  const reactImport = sourceFile
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue() === "react");

  if (!reactImport) {
    sourceFile.addImportDeclaration({ moduleSpecifier: "react", namedImports: ["useState"] });
    return;
  }
  if (!reactImport.getNamedImports().some((n) => n.getName() === "useState")) {
    reactImport.addNamedImport("useState");
  }
}
