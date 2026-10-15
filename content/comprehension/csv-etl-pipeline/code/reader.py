"""CSV reading for the sales pipeline."""


class RowError(Exception):
    """A row that cannot be used."""


def split_fields(line, delimiter=","):
    """Split one CSV line into fields, honoring double quotes.

    A doubled quote inside a quoted field stands for one literal quote.
    """
    fields, current, in_quotes = [], [], False
    i = 0
    while i < len(line):
        ch = line[i]
        if in_quotes:
            if ch == '"':
                if i + 1 < len(line) and line[i + 1] == '"':
                    current.append('"')
                    i += 1
                else:
                    in_quotes = False
            else:
                current.append(ch)
        elif ch == '"':
            in_quotes = True
        elif ch == delimiter:
            fields.append("".join(current))
            current = []
        else:
            current.append(ch)
        i += 1
    fields.append("".join(current))
    return fields


def read_rows(text, delimiter=","):
    """Parse CSV text into a list of dicts keyed by the header row.

    Blank lines are ignored. A row with the wrong number of fields raises
    RowError naming its line in the file (the header is line 1).
    """
    lines = text.split("\n")[:-1]
    if not lines:
        return []
    header = [h.strip() for h in split_fields(lines[0], delimiter)]
    rows = []
    for number, line in enumerate(lines[1:], start=1):
        if not line.strip():
            continue
        fields = split_fields(line, delimiter)
        if len(fields) != len(header):
            raise RowError(f"line {number}: expected {len(header)} fields, got {len(fields)}")
        rows.append(dict(zip(header, fields)))
    return rows
