import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import ts from 'typescript';

/** 네이티브·운영 API 대신 명시한 의존성만 연결해 실제 앱 모듈을 검사한다. */
export function loadModule<T>(
  path: string,
  dependencies: Record<string, unknown>,
  globals: Record<string, unknown> = {},
): T {
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  });
  const module = { exports: {} };
  new Script(outputText, { filename: path }).runInNewContext({
    module,
    exports: module.exports,
    require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`테스트 의존성이 없습니다: ${name}`);
      return dependencies[name];
    },
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    ...globals,
  });
  return module.exports as T;
}
