# AI setup

swemock works fully without AI. A model makes the interviewer live and grades rounds for you; without one
you get a scripted interviewer, copy-prompt packets you can paste into any chatbot (claude.ai works well),
and self-scoring. Configure it on first run or in **Settings → AI**.

| Provider | Cost | What you need |
| --- | --- | --- |
| None (default) | Free | Nothing |
| Ollama | Free | The Ollama app on your machine and enough RAM |
| OpenAI-compatible | Varies | A base URL (including `/v1`), model names, and usually an API key |
| Anthropic | Pay per use on your key | An Anthropic API key |

Keys are encrypted at rest on your machine (AES-256-GCM, master key in the data volume), never logged, and
never sent back to the browser. Nothing leaves your machine except calls to the provider you configure,
and packets you copy yourself.

## Models per role

Each provider maps four roles to a model. Leave a field empty to use the default.

| Role | Used for | Anthropic default | Ollama default |
| --- | --- | --- | --- |
| interviewer | the live interviewer | `claude-opus-5-5` | `qwen3.5:9b` |
| assistant | the AI assistant in AI Fluency rounds | `claude-opus-5-5` | `qwen3.5:9b` |
| grader | grading after a round | `claude-opus-5-5` | `qwen3.5:9b` |
| fast | short replies (approach checks) | `claude-haiku-5-5` | `qwen3.5:4b` |

OpenAI-compatible endpoints have no defaults: name the models your endpoint serves.

Environment variables override Settings: `SWEMOCK_PROVIDER`, `SWEMOCK_MODEL_INTERVIEWER`,
`SWEMOCK_MODEL_ASSISTANT`, `SWEMOCK_MODEL_GRADER`, `SWEMOCK_MODEL_FAST` (put them in `.env` next to
`compose.yaml`).

## Ollama

- **macOS:** install the native Ollama app. Docker on a Mac can't use the GPU, so running Ollama in a
  container is much slower. The app is reachable from swemock at the default URL
  `http://host.docker.internal:11434`.
- **Linux:** run Ollama on the host (the compose file maps `host.docker.internal` to the host), or start
  the bundled one with `docker compose --profile local-ai up -d`, set the URL to `http://ollama:11434`, and
  pull models into it with `docker compose exec ollama ollama pull qwen3.5:9b`.
- Pull the default models: `ollama pull qwen3.5:9b && ollama pull qwen3.5:4b`.
- **RAM:** `qwen3.5:4b` needs about 4 GB free, `qwen3.5:9b` about 8 GB. With 32 GB or more, larger models
  such as `qwen3.6:27b` give noticeably better interviews and grades.
- **Test connection** tells you which models still need pulling.

## Cost control (hosted providers)

- The `fast` role handles short replies; the `grader` runs once per graded round.
- The interviewer's large, unchanging context (problem, hidden reference material, rules) is sent as a
  cached prefix where the provider supports it (Anthropic prompt caching).
- Each session has a token cap (Settings, default 200,000; 0 disables it). Token usage per session is shown
  in the interview and the debrief.

## When a model call fails

The app retries with backoff. If it still fails, the interview shows a banner and lets you continue with the
scripted interviewer or switch to copy-prompt for the rest of the round.
