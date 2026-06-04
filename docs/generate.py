#!/usr/bin/env python3
"""Regenerate the code-derived inventory docs from tracked files (hard data only).

Run from the repo root:

    python3 docs/generate.py

Rewrites, in place:
  - docs/repository-map.md         (the "### Counts" + "### Every counted file" section)
  - docs/reference/kotlin-files.md
  - docs/reference/non-kotlin-files.md

Everything is derived from `git ls-files` and the file contents. No behaviour is inferred.
Line counts follow `awk 'END{print NR}'` (a final unterminated line still counts). Gitlinks
(submodules) are excluded from repository-map.md and listed as non-file paths in
non-kotlin-files.md.
"""
import json
import os
import re
import subprocess
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Project-internal import roots: excluded from "external import roots". com.zemer (the cipher
# composite build) is treated as external, matching the existing docs.
INTERNAL_ROOTS = {"com.jtech", "com.dpi", "com.metrolist"}
# Named declarations, plus destructuring `val (a, b) = ...` (each name captured).
DECL_RE = re.compile(
    r"\b(class|object|interface|fun|val|var)\s+([A-Za-z_][A-Za-z0-9_]*)"
    r"|\b(val|var)\s*\(\s*([^)]*)\)"
)


def declarations(stripped):
    out = []
    for m in DECL_RE.finditer(stripped):
        if m.group(2):
            out.append(f"{m.group(1)} {m.group(2)}")
        elif m.group(4) is not None:
            for part in m.group(4).split(","):
                nm = re.match(r"\s*([A-Za-z_]\w*)", part)
                if nm:
                    out.append(f"{m.group(3)} {nm.group(1)}")
    return out
KOTLIN_MODULES = ["app", "innertube", "lrclib", "simpmusic"]


def sh(*args):
    return subprocess.check_output(args, cwd=ROOT).decode()


def tracked():
    """Return (regular_paths, gitlink_paths) from git, sorted by path (C order)."""
    regular, gitlinks = [], []
    for line in sh("git", "ls-files", "-s").splitlines():
        meta, path = line.split("\t", 1)
        mode = meta.split()[0]
        (gitlinks if mode == "160000" else regular).append(path)
    return sorted(regular), sorted(gitlinks)


def read_bytes(path):
    with open(os.path.join(ROOT, path), "rb") as f:
        return f.read()


def is_binary(data):
    return b"\x00" in data


def nr_lines(data):
    """awk NR: number of lines, counting a final line with no trailing newline."""
    if not data:
        return 0
    n = data.count(b"\n")
    if not data.endswith(b"\n"):
        n += 1
    return n


def size_field(path):
    data = read_bytes(path)
    if is_binary(data):
        return f"{len(data)} bytes", "binary"
    return f"{nr_lines(data)} lines", "text"


def ext_of(path):
    name = os.path.basename(path)
    if name.startswith("."):
        rest = name[1:]
        return "." + rest.rsplit(".", 1)[1] if "." in rest else "[none]"
    return "." + name.rsplit(".", 1)[1] if "." in name else "[none]"


# ---------- Kotlin metadata ----------
def strip_kotlin(text):
    text = re.sub(r'"""(?:.|\n)*?"""', '""', text)
    text = re.sub(r'"(?:\\.|[^"\\\n])*"', '""', text)
    text = re.sub(r"'(?:\\.|[^'\\\n])*'", "''", text)
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.DOTALL)
    text = re.sub(r"//[^\n]*", " ", text)
    return text


def external_roots(imports):
    roots = []
    for imp in imports:
        seg = imp.split(".")
        root = ".".join(seg[:2]) if len(seg) >= 2 else imp
        if root in INTERNAL_ROOTS:
            continue
        roots.append(root)
    return sorted(set(roots))


def kotlin_row(path):
    text = read_bytes(path).decode("utf-8", "replace")
    nr = nr_lines(read_bytes(path))
    pkg_m = re.search(r"(?m)^\s*package\s+([\w.]+)", text)
    pkg = pkg_m.group(1) if pkg_m else ""
    compose = "yes" if "@Composable" in text else "no"
    imports = re.findall(r"(?m)^\s*import\s+([\w.]+)", text)
    decls = declarations(strip_kotlin(text))
    more = len(decls) - 30
    dstr = ", ".join(decls[:30]) + (f", … +{more} more" if more > 0 else "")
    roots = ", ".join(external_roots(imports))
    return f"| `{path}` | {nr} | `{pkg}` | {compose} | {len(imports)} | {dstr} | {roots} |"


def gen_kotlin_md():
    regular, _ = tracked()
    kt = [p for p in regular if p.endswith(".kt")]
    out = ["# Kotlin file reference", "",
           "Every tracked Kotlin file is listed with hard metadata extracted from the file text. "
           "Declaration extraction is regex-based (after stripping comments and string literals) "
           "and intentionally reports names visible in source rather than inferred behavior.", ""]
    for mod in KOTLIN_MODULES:
        files = [p for p in kt if p.split("/", 1)[0] == mod]
        if not files:
            continue
        out.append(f"## `{mod}` Kotlin files ({len(files)})")
        out.append("")
        out.append("| File | Lines | Package | Compose | Imports | Declarations | External import roots |")
        out.append("| --- | ---: | --- | --- | ---: | --- | --- |")
        out += [kotlin_row(p) for p in files]
        out.append("")
    return "\n".join(out).rstrip("\n") + "\n"


# ---------- Non-Kotlin metadata ----------
def xml_root(path):
    try:
        return ET.parse(os.path.join(ROOT, path)).getroot().tag.split("}")[-1]
    except Exception:
        return None


def json_keys(path):
    try:
        data = json.loads(read_bytes(path).decode("utf-8"))
        return list(data.keys()) if isinstance(data, dict) else None
    except Exception:
        return None


def gradle_plugins(path):
    text = read_bytes(path).decode("utf-8", "replace")
    m = re.search(r"plugins\s*\{(.*?)\}", text, flags=re.DOTALL)
    if not m:
        return None
    plugins = []
    for line in m.group(1).splitlines():
        a = re.search(r'\bid\s*\(\s*"([^"]+)"', line)
        k = re.search(r'\bkotlin\s*\(\s*"([^"]+)"', line)
        al = re.search(r"\balias\s*\(\s*libs\.plugins\.([\w.]+)", line)
        if a:
            plugins.append(a.group(1))
        elif k:
            plugins.append(k.group(1))
        elif al:
            plugins.append(al.group(1))
    return plugins or None


def type_metadata(path):
    ext = ext_of(path)
    kind = f"text `{ext}`"
    if ext == ".xml":
        r = xml_root(path)
        if r:
            kind += f"; XML root `{r}`"
    elif ext == ".json":
        keys = json_keys(path)
        if keys:
            kind += f"; JSON keys `{', '.join(keys)}`"
    elif ext == ".kts":
        pl = gradle_plugins(path)
        if pl:
            kind += f"; plugins `{', '.join(pl)}`"
    return kind


def gen_non_kotlin_md():
    regular, gitlinks = tracked()
    paths = [p for p in regular if not p.endswith(".kt") and not p.startswith("docs/")]
    paths += [p for p in gitlinks if not p.startswith("docs/")]
    paths.sort()
    out = ["# Non-Kotlin file reference", "",
           f"Every tracked non-Kotlin path outside `docs/` is listed. Text files report line "
           f"counts; binary files report byte counts; gitlinks are recorded as non-file tracked "
           f"paths. Total paths: `{len(paths)}`.", "",
           "| Path | Size/status | Type metadata |", "| --- | ---: | --- |"]
    gl = set(gitlinks)
    for p in paths:
        if p in gl:
            out.append(f"| `{p}` | gitlink/non-file | tracked path is not a regular file in this checkout |")
            continue
        data = read_bytes(p)
        if is_binary(data):
            out.append(f"| `{p}` | {len(data)} bytes | binary `{ext_of(p)}` |")
        else:
            out.append(f"| `{p}` | {nr_lines(data)} lines | {type_metadata(p)} |")
    return "\n".join(out) + "\n"


# ---------- repository-map.md inventory ----------
def gen_repo_inventory():
    regular, _ = tracked()  # gitlinks excluded from this inventory
    counts = {}
    rows = []
    for p in regular:
        ext = ext_of(p)
        counts[ext] = counts.get(ext, 0) + 1
        data = read_bytes(p)
        size = f"{len(data)} bytes" if is_binary(data) else f"{nr_lines(data)} lines"
        rows.append(f"| `{p}` | {size} | `{ext}` |")
    out = ["### Counts", "", f"- Files counted: `{len(regular)}`", "- By extension:"]
    for ext, c in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        out.append(f"  - `{ext}`: `{c}`")
    out += ["", "### Every counted file", "", "| Path | Lines/bytes | Kind |",
            "| --- | ---: | --- |"] + rows
    return "\n".join(out) + "\n"


def rewrite_repo_map():
    path = os.path.join(ROOT, "docs/repository-map.md")
    head = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if line.rstrip("\n") == "### Counts":
                break
            head.append(line)
    # Compute the inventory BEFORE truncating the file, so repository-map.md's own
    # line count (it lists every docs/ file, including itself) is read at its real size.
    inventory = gen_repo_inventory()
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("".join(head) + inventory)


def main():
    open(os.path.join(ROOT, "docs/reference/kotlin-files.md"), "w", encoding="utf-8").write(gen_kotlin_md())
    open(os.path.join(ROOT, "docs/reference/non-kotlin-files.md"), "w", encoding="utf-8").write(gen_non_kotlin_md())
    rewrite_repo_map()
    print("Regenerated: repository-map.md, reference/kotlin-files.md, reference/non-kotlin-files.md")


if __name__ == "__main__":
    main()
