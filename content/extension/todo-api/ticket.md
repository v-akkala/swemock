# Ticket: tag todos and filter by tag

Teams want to group todos. Add tags to the API.

**Behavior**

- A todo has `tags`, a list of strings. It is `[]` when none were given.
- `POST /todos` and `PATCH /todos/<id>` accept an optional `"tags"` list. On `PATCH`, the list **replaces** the old tags (an empty list clears them).
- Tags are case-insensitive and stored lowercase. Surrounding whitespace is trimmed and duplicates are dropped, keeping the first occurrence's position: `["Work", "urgent", "work"]` becomes `["work", "urgent"]`.
- A valid tag is 1–20 characters from `a-z`, `0-9` and `-`. At most 5 tags (after removing duplicates). Anything else is a validation error on the field `tags`.
- `GET /todos?tag=work` returns only todos that carry the tag. `tag` may be repeated (`?tag=work&tag=urgent`); a todo must carry **all** the given tags. It combines with the existing `done`, `q` and `priority` filters.
- `GET /tags` returns `{"items": [{"tag": "work", "count": 3}, ...], "count": n}` for the tags in use, most used first, ties alphabetical.
- Every todo in every response includes `tags`.

Follow `CONVENTIONS.md`: where the code goes matters as much as the behavior. Add tests for what you build.
