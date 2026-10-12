import { generateStub, LANGUAGE_LABELS, LANGUAGES, type Language } from "@swemock/shared";
import { SAMPLE_PROBLEM } from "@/server/judge/sample";
import { Playground } from "./playground";

export const metadata = { title: "Judge playground · swemock" };

const HELLO: Record<Language, string> = {
  python: 'name = input()\nprint(f"Hello, {name}!")\n',
  cpp: '#include <iostream>\n#include <string>\n\nint main() {\n    std::string name;\n    std::getline(std::cin, name);\n    std::cout << "Hello, " << name << "!\\n";\n}\n',
};

export default function PlaygroundPage() {
  const languages = LANGUAGES.map((id) => ({
    id,
    label: LANGUAGE_LABELS[id],
    stub: generateStub(SAMPLE_PROBLEM.signature, id),
    hello: HELLO[id],
  }));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Judge playground</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
          Check that the sandboxed judge works on your machine. Code runs in a throwaway container with no network,
          a read-only filesystem, and strict time and memory limits.
        </p>
      </div>
      <Playground
        languages={languages}
        sample={{ title: SAMPLE_PROBLEM.title, statement: SAMPLE_PROBLEM.statement, tests: SAMPLE_PROBLEM.tests.length }}
      />
    </div>
  );
}
