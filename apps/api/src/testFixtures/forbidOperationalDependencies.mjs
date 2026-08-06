export async function resolve(specifier, context, nextResolve) {
  if (specifier === "sqlite3" || specifier === "googleapis") {
    throw new Error(`Production startup loaded forbidden operational dependency: ${specifier}`);
  }
  if (specifier === "@miclub/shared") {
    return { url: new URL("../../../../packages/shared/src/index.ts", import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
