// monaco-editor 0.57 ships types only for its root entry; the subpaths below are side-effect or API imports.
declare module "monaco-editor/editor/editor.api" {
  export * from "monaco-editor";
}
declare module "monaco-editor/features/register.all";
declare module "monaco-editor/languages/definitions/python/register";
declare module "monaco-editor/languages/definitions/cpp/register";
