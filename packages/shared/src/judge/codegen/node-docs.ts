import { allTypes, type Signature } from "../signature";
import { usesNode } from "../types";

/** Comment block describing the provided ListNode/TreeNode definitions, if the signature uses them. */
export function nodeComment(sig: Signature, prefix: string, docs: { ListNode: string; TreeNode: string }): string {
  const types = allTypes(sig);
  const parts = (["ListNode", "TreeNode"] as const)
    .filter((n) => types.some((t) => usesNode(t, n)))
    .map((n) => [`Definition for ${n} (provided, don't redefine it):`, ...docs[n].split("\n")].map((l) => prefix + l).join("\n"));
  return parts.length ? parts.join("\n") + "\n\n" : "";
}
