#!/usr/bin/env python3
"""Non-destructive Kindle Paperwhite (MTP) sync for Ex Libris.

Pulls both legacy `My Clippings.txt` and newer KSDK KFX annotations
(`system/ksdk/.annotations/.../ksdk_annotation_v1.db` + referenced `.kfx` files),
deduplicates keystroke typing bursts, decodes KFX Ion position maps verbatim,
writes `data/kindle_sync.json` (`ex-libris-kindle-sync-v1`), and updates
`data/user_state.json` (`kindleClippings`) while preserving all user overrides.
"""
from __future__ import annotations

import datetime
import json
import os
import pathlib
import re
import sqlite3
import statistics
import struct
import subprocess
import tempfile
import unicodedata

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
CACHE_DIR = DATA_DIR / ".kindle_sync_cache"
KFX_CACHE = CACHE_DIR / "kfx"
SIDECAR_CACHE = CACHE_DIR / "sidecars"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
KFX_CACHE.mkdir(parents=True, exist_ok=True)
SIDECAR_CACHE.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Minimal Amazon Ion binary decoder (supports KFX text & position_id_map)
# ---------------------------------------------------------------------------
def _read_varuint(buf: bytes, pos: int) -> tuple[int, int]:
    val = 0
    while True:
        b = buf[pos]
        pos += 1
        val = (val << 7) | (b & 0x7F)
        if b & 0x80:
            return val, pos


def _decode_ion_value(buf: bytes, pos: int, end: int):
    if pos >= end:
        return None, pos
    hdr = buf[pos]
    pos += 1
    tid = hdr >> 4
    ln = hdr & 0x0F
    if tid == 14:
        if ln == 14:
            ln, pos = _read_varuint(buf, pos)
        ann_len, pos = _read_varuint(buf, pos)
        anns = []
        aend = pos + ann_len
        while pos < aend:
            sym, pos = _read_varuint(buf, pos)
            anns.append(sym)
        val, pos = _decode_ion_value(buf, pos, end)
        return ("$ANN", anns, val), pos
    if tid == 0 or ln == 15:
        return None, pos
    if tid == 1:
        return (ln == 1), pos
    if ln == 14:
        ln, pos = _read_varuint(buf, pos)
    if tid == 2:
        return (int.from_bytes(buf[pos:pos + ln], "big") if ln else 0), pos + ln
    if tid == 3:
        return (-int.from_bytes(buf[pos:pos + ln], "big") if ln else 0), pos + ln
    if tid in (4, 5, 6):
        return f"<type{tid}>", pos + ln
    if tid == 7:
        return ("$SYM", int.from_bytes(buf[pos:pos + ln], "big") if ln else 0), pos + ln
    if tid == 8:
        return buf[pos:pos + ln].decode("utf-8", errors="replace"), pos + ln
    if tid in (9, 10):
        return f"<bytes:{ln}>", pos + ln
    if tid in (11, 12):
        vend = pos + ln
        out = []
        while pos < vend:
            val, pos = _decode_ion_value(buf, pos, vend)
            out.append(val)
        return out, vend
    if tid == 13:
        vend = pos + ln
        d = {}
        while pos < vend:
            fld, pos = _read_varuint(buf, pos)
            val, pos = _decode_ion_value(buf, pos, vend)
            d[fld] = val
        return d, vend
    return None, end


def _parse_ion_stream(buf: bytes) -> list:
    items = []
    pos = 4
    end = len(buf)
    while pos < end:
        v, pos = _decode_ion_value(buf, pos, end)
        if v is not None:
            items.append(v)
    return items


def _extract_kfx_segments(path: pathlib.Path):
    """Extract (title, authors, segments, content_lists, eid_to_content) from an unencrypted KFX file."""
    raw = path.read_bytes()
    bvms = [m.start() for m in re.finditer(b"\xe0\x01\x00\xea", raw)]
    entys = [m.start() for m in re.finditer(b"ENTY", raw)]

    content_lists: dict[int, list[str]] = {}
    eid_to_content: dict[int, tuple[int, int]] = {}
    section_pos_entries: dict[int, list] = {}
    section_pid_base: dict[int, int] = {}
    section_order: list[int] = []
    kfx_title = None
    kfx_author = None

    for st in bvms:
        nxt = next((e for e in entys if e > st), len(raw))
        try:
            vals = _parse_ion_stream(raw[st:nxt])
        except Exception:
            continue
        for v in vals:
            inner = v[2] if isinstance(v, tuple) and v[0] == "$ANN" else v
            if not isinstance(inner, dict):
                continue
            if 491 in inner and isinstance(inner[491], list):
                for cat in inner[491]:
                    if isinstance(cat, dict) and isinstance(cat.get(258), list):
                        for kv in cat[258]:
                            if isinstance(kv, dict):
                                if kv.get(492) == "title" and isinstance(kv.get(307), str):
                                    kfx_title = kv[307]
                                elif kv.get(492) == "author" and isinstance(kv.get(307), str):
                                    kfx_author = kv[307]
            if 4 in inner and 146 in inner and isinstance(inner[4], tuple):
                content_lists[inner[4][1]] = inner[146]
            if 176 in inner and 146 in inner and isinstance(inner[146], list):
                def walk_eids(node):
                    if isinstance(node, dict):
                        if 155 in node and 145 in node and isinstance(node[145], dict) and isinstance(node[145].get(4), tuple):
                            eid_to_content[node[155]] = (node[145][4][1], node[145][403])
                        for val in node.values():
                            walk_eids(val)
                    elif isinstance(node, list):
                        for item in node:
                            walk_eids(item)
                walk_eids(inner[146])
            if 174 in inner and 181 in inner and isinstance(inner[181], list):
                sec_id = inner[174][1] if isinstance(inner[174], tuple) else inner[174]
                if inner[181] and isinstance(inner[181][0], list) and len(inner[181][0]) == 2 and inner[181][0][0] == 0:
                    section_pos_entries[sec_id] = inner[181]
            if 181 in inner and 174 not in inner and isinstance(inner[181], list):
                if inner[181] and isinstance(inner[181][0], dict) and 174 in inner[181][0] and 184 in inner[181][0]:
                    for rec in inner[181]:
                        sec_id = rec[174][1] if isinstance(rec[174], tuple) else rec[174]
                        section_pid_base[sec_id] = rec[184]
                        section_order.append(sec_id)

    segments: list[tuple[int, int, int]] = []
    for sec_id in section_order:
        entries = section_pos_entries.get(sec_id, [])
        pid = section_pid_base.get(sec_id, 0)
        cur_eid = None
        for entry in entries:
            if isinstance(entry, list) and len(entry) >= 2:
                delta_len, new_eid = entry[0], entry[1]
                if cur_eid is not None and isinstance(delta_len, int) and delta_len > 0:
                    segments.append((pid, pid + delta_len, cur_eid))
                    pid += delta_len
                if isinstance(new_eid, int):
                    cur_eid = new_eid
            elif isinstance(entry, int):
                if cur_eid is not None:
                    segments.append((pid, pid + entry, cur_eid))
                    cur_eid += 1
                pid += entry

    return kfx_title, kfx_author, segments, content_lists, eid_to_content


def get_kfx_max_pid(path: pathlib.Path) -> int:
    """Return the maximum KFX position ID for a decoded KFX file."""
    _, _, segments, _, _ = _extract_kfx_segments(path)
    return max((p1 for _, p1, _ in segments), default=0)


def decode_kfx_book(path: pathlib.Path):
    """Extract (title, authors, slice_fn) from an unencrypted KFX file."""
    kfx_title, kfx_author, segments, content_lists, eid_to_content = _extract_kfx_segments(path)

    def slice_pids(sp: int, ep: int) -> str:
        out: list[str] = []
        eid_cum: dict[int, int] = {}
        for p0, p1, eid in segments:
            text_ref = eid_to_content.get(eid)
            txt = ""
            if text_ref:
                lst = content_lists.get(text_ref[0], [])
                if 0 <= text_ref[1] < len(lst):
                    txt = lst[text_ref[1]]
            c0 = eid_cum.get(eid, 0)
            c1 = c0 + (p1 - p0)
            eid_cum[eid] = c1
            ov0, ov1 = max(sp, p0), min(ep, p1)
            if ov0 < ov1 and txt:
                out.append(txt[c0 + (ov0 - p0) : c0 + (ov1 - p0)])
            if out and ov1 == p1 and ep > p1 and txt:
                out.append("\n")
        return "".join(out).strip()

    return kfx_title, kfx_author, slice_pids


# ---------------------------------------------------------------------------
# MTP Transfer from connected Kindle Paperwhite (Windows Shell COM)
# ---------------------------------------------------------------------------
def pull_from_connected_kindle(books: list[dict] | None = None) -> bool:
    """Pull My Clippings.txt, ksdk_annotation_v1.db, .yjf/.azw3f sidecars, and needed KFX files via MTP."""
    ps_stage1 = rf'''
$dest = "{CACHE_DIR}"
$sidecarDest = "{SIDECAR_CACHE}"
$sh = New-Object -ComObject Shell.Application
$kindle = $sh.NameSpace(17).Items() | Where-Object {{ $_.Name -match "Kindle" }} | Select-Object -First 1
if (-not $kindle) {{
    Write-Output "NO_KINDLE_MTP"
    exit 0
}}
$destShell = $sh.NameSpace($dest)
$scShell = $sh.NameSpace($sidecarDest)
$internal = $kindle.GetFolder.Items() | Where-Object {{ $_.Name -eq "Internal Storage" }} | Select-Object -First 1
$docs = $internal.GetFolder.Items() | Where-Object {{ $_.Name -eq "documents" }} | Select-Object -First 1
$mc = $docs.GetFolder.Items() | Where-Object {{ $_.Name -eq "My Clippings.txt" }} | Select-Object -First 1
if ($mc) {{
    $t = Join-Path $dest "My Clippings.txt"
    if (Test-Path $t) {{ Remove-Item -Force $t }}
    $destShell.CopyHere($mc, 16)
}}
$dl = $docs.GetFolder.Items() | Where-Object {{ $_.Name -eq "Downloads" }} | Select-Object -First 1
if ($dl) {{
    $items01 = $dl.GetFolder.Items() | Where-Object {{ $_.Name -eq "Items01" }} | Select-Object -First 1
    if ($items01) {{
        foreach ($it in $items01.GetFolder.Items()) {{
            if ($it.IsFolder) {{
                foreach ($sub in $it.GetFolder.Items()) {{
                    if ($sub.Name -match "\.(yjf|azw3f)$") {{
                        $t = Join-Path $sidecarDest $sub.Name
                        if (Test-Path $t) {{ Remove-Item -Force $t }}
                        $scShell.CopyHere($sub, 16)
                    }}
                }}
            }}
        }}
    }}
}}
$sys = $internal.GetFolder.Items() | Where-Object {{ $_.Name -eq "system" }} | Select-Object -First 1
$ksdk = $sys.GetFolder.Items() | Where-Object {{ $_.Name -eq "ksdk" }} | Select-Object -First 1
$ann = $ksdk.GetFolder.Items() | Where-Object {{ $_.Name -eq ".annotations" }} | Select-Object -First 1
if ($ann) {{
    foreach ($acct in $ann.GetFolder.Items()) {{
        if ($acct.IsFolder) {{
            foreach ($f in $acct.GetFolder.Items()) {{
                if ($f.Name -eq "ksdk_annotation_v1.db") {{
                    $t = Join-Path $dest "ksdk_annotation_v1.db"
                    if (Test-Path $t) {{ Remove-Item -Force $t }}
                    $destShell.CopyHere($f, 16)
                }}
            }}
        }}
    }}
}}
Start-Sleep -Seconds 2
Write-Output "KINDLE_BASE_OK"
'''
    with tempfile.NamedTemporaryFile("w", suffix=".ps1", delete=False, encoding="utf-8") as tf:
        tf.write(ps_stage1)
        ps_path = tf.name
    try:
        out = subprocess.check_output(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps_path],
            text=True,
            timeout=45,
        )
    finally:
        pathlib.Path(ps_path).unlink(missing_ok=True)

    if "NO_KINDLE_MTP" in out:
        print("No Kindle Paperwhite connected via MTP — using cached device files in", CACHE_DIR)
        return False

    # Identify ASINs with KSDK annotations or currently-reading LPRs needing KFX decoding
    db_path = CACHE_DIR / "ksdk_annotation_v1.db"
    if db_path.exists():
        con = sqlite3.connect(str(db_path))
        rows = con.execute("SELECT DISTINCT dataset_id, serialized_payload FROM server_view").fetchall()
        need_asins = set()
        for did, pay in rows:
            obj = json.loads(pay)
            if obj.get("type") in ("HIGHLIGHT", "NOTE", "BOOKMARK"):
                asin = did.split("-")[0]
                if not list(KFX_CACHE.glob(f"*{asin}*.kfx")):
                    need_asins.add(asin)

        # Also cache KFX files for currently-reading books with LPR > 1
        if books:
            cur_titles = {
                norm_fuzzy(b.get("cleanTitle") or b.get("title", ""))
                for b in books
                if b.get("exclusiveShelf") == "currently-reading"
            }
            for sc in SIDECAR_CACHE.glob("*.yjf"):
                m_asin = re.search(r"_([A-Za-z0-9]{10,40})d0838fbfbb6dbc2b68bc7d0f086b1738\.yjf$", sc.name)
                if not m_asin:
                    continue
                asin = m_asin.group(1)
                raw_title = sc.name[:m_asin.start()].replace("_", " ")
                if any(ct and (ct in norm_fuzzy(raw_title) or norm_fuzzy(raw_title) in ct) for ct in cur_titles):
                    if not list(KFX_CACHE.glob(f"*{asin}*.kfx")):
                        need_asins.add(asin)
        con.close()

        if need_asins:
            asins_pat = "|".join(re.escape(a) for a in sorted(need_asins))
            ps_stage2 = rf'''
$kfxDest = "{KFX_CACHE}"
$sh = New-Object -ComObject Shell.Application
$kfxShell = $sh.NameSpace($kfxDest)
$kindle = $sh.NameSpace(17).Items() | Where-Object {{ $_.Name -match "Kindle" }} | Select-Object -First 1
$internal = $kindle.GetFolder.Items() | Where-Object {{ $_.Name -eq "Internal Storage" }} | Select-Object -First 1
$docs = $internal.GetFolder.Items() | Where-Object {{ $_.Name -eq "documents" }} | Select-Object -First 1
$dl = $docs.GetFolder.Items() | Where-Object {{ $_.Name -eq "Downloads" }} | Select-Object -First 1
$items01 = $dl.GetFolder.Items() | Where-Object {{ $_.Name -eq "Items01" }} | Select-Object -First 1
foreach ($c in $items01.GetFolder.Items()) {{
    if (-not $c.IsFolder -and $c.Name -match "\.kfx$" -and $c.Name -match "({asins_pat})") {{
        $t = Join-Path $kfxDest $c.Name
        if (-not (Test-Path $t)) {{
            $kfxShell.CopyHere($c, 20)
            Write-Output ("COPIED_KFX: " + $c.Name)
        }}
    }}
}}
Start-Sleep -Seconds 2
'''
            with tempfile.NamedTemporaryFile("w", suffix=".ps1", delete=False, encoding="utf-8") as tf2:
                tf2.write(ps_stage2)
                ps2 = tf2.name
            try:
                subprocess.run(
                    ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps2],
                    check=True,
                    timeout=60,
                )
            finally:
                pathlib.Path(ps2).unlink(missing_ok=True)
    return True


# ---------------------------------------------------------------------------
# Matching & Parsing Helpers (mirrors Ex Libris `kindleClippings.ts`)
# ---------------------------------------------------------------------------
def norm_fuzzy(s: str) -> str:
    nfd = unicodedata.normalize("NFD", (s or "").lower())
    stripped = "".join(ch for ch in nfd if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]", " ", stripped)).strip()


def match_book(clean_title: str, raw_title: str, author: str | None, books: list[dict]) -> str | None:
    nt = norm_fuzzy(clean_title)
    nr = norm_fuzzy(raw_title)
    na = norm_fuzzy(author or "")
    if na:
        for b in books:
            bt = norm_fuzzy(b.get("cleanTitle") or b.get("title") or "")
            ba = norm_fuzzy(b.get("author") or "")
            if (bt == nt or bt == nr) and (ba in na or na in ba):
                return b["id"]
        for b in books:
            bt = norm_fuzzy(b.get("cleanTitle") or b.get("title") or "")
            ba = norm_fuzzy(b.get("author") or "")
            if ((bt in nt or nt in bt or bt in nr or nr in bt) and bt and nt) and (ba in na or na in ba):
                return b["id"]
    for b in books:
        bt = norm_fuzzy(b.get("cleanTitle") or b.get("title") or "")
        if bt == nt or bt == nr:
            return b["id"]
    return None


def parse_clippings_txt(txt_path: pathlib.Path, books: list[dict]) -> list[dict]:
    if not txt_path.exists():
        return []
    raw = txt_path.read_text(encoding="utf-8-sig", errors="replace").lstrip("\ufeff")
    blocks = [b.strip() for b in re.split(r"={8,}", raw) if b.strip()]
    initial = []
    for idx, b in enumerate(blocks):
        lines = [l.strip() for l in b.splitlines() if l.strip()]
        if not lines:
            continue
        l1 = lines[0]
        l2 = lines[1] if len(lines) > 1 else ""
        content_lines = lines[2:]
        if " - Your " in l1 and not l2.startswith("- Your "):
            pos = l1.index(" - Your ")
            l2 = l1[pos + 1 :].strip()
            l1 = l1[:pos].strip()
            content_lines = lines[1:]
        elif len(lines) < 2:
            continue
        content = "\n".join(content_lines).strip()
        # Title & Author
        m_auth = re.match(r"^(.*?)\s*\(([^()]+)\)\s*$", l1)
        author = None
        raw_title = l1
        if m_auth and "#" not in m_auth.group(2):
            raw_title = m_auth.group(1).strip()
            author = m_auth.group(2).strip()
        clean_title = re.sub(r"\s*\([^)]*#\d+[^)]*\)\s*$", "", raw_title).strip() or raw_title
        low2 = l2.lower()
        ctype = "bookmark" if "bookmark" in low2 else ("note" if "note" in low2 else "highlight")
        pm = re.search(r"page\s*(\d+)", l2, re.I)
        page = int(pm.group(1)) if pm else None
        lm = re.search(r"location\s*(\d+)(?:-(\d+))?", l2, re.I)
        loc_a = int(lm.group(1)) if lm else None
        loc_b = int(lm.group(2)) if (lm and lm.group(2)) else loc_a
        dm = re.search(r"added on\s*(.+)$", l2, re.I)
        added_iso = None
        if dm:
            ds = dm.group(1).strip()
            m_dt = re.search(r"([A-Za-z]+ \d+, \d{4} \d+:\d+:\d+ [AP]M)", ds)
            if m_dt:
                added_iso = datetime.datetime.strptime(m_dt.group(1), "%B %d, %Y %I:%M:%S %p").isoformat(timespec="milliseconds") + "Z"
            else:
                added_iso = ds
        initial.append({
            "id": f"clip_{idx + 1}_{loc_a if loc_a is not None else (page if page is not None else idx)}",
            "rawTitle": raw_title,
            "cleanTitle": clean_title,
            "author": author,
            "matchedBookId": match_book(clean_title, raw_title, author, books),
            "type": ctype,
            "page": page,
            "locationStart": loc_a,
            "locationEnd": loc_b,
            "addedAt": added_iso,
            "content": content,
            "attachedNote": None,
            "sourceFormat": "clippings-txt",
        })

    # Deduplicate resized highlights + collapse keystroke typing note bursts
    superseded = set()
    hls = [c for c in initial if c["type"] == "highlight"]
    for i in range(len(hls)):
        for j in range(i + 1, len(hls)):
            h1, h2 = hls[i], hls[j]
            same = (h1["matchedBookId"] and h1["matchedBookId"] == h2["matchedBookId"]) or (norm_fuzzy(h1["cleanTitle"]) == norm_fuzzy(h2["cleanTitle"]))
            if not same:
                continue
            overlap = False
            if h1["locationStart"] is not None and h2["locationStart"] is not None:
                overlap = max(h1["locationStart"], h2["locationStart"]) <= min(h1["locationEnd"], h2["locationEnd"]) + 5
            elif h1["page"] is not None and h2["page"] is not None:
                overlap = h1["page"] == h2["page"]
            if overlap and h1["content"] and h2["content"]:
                t1, t2 = h1["content"].lower(), h2["content"].lower()
                if t1 in t2 or t2.startswith(t1):
                    superseded.add(h1["id"])
                elif t2 in t1 or t1.startswith(t2):
                    superseded.add(h2["id"])

    collapsed = []
    i = 0
    while i < len(initial):
        c = initial[i]
        if c["type"] == "note" and c["locationStart"] is not None:
            j = i
            while j + 1 < len(initial):
                nxt = initial[j + 1]
                same = (c["matchedBookId"] and c["matchedBookId"] == nxt["matchedBookId"]) or (norm_fuzzy(c["cleanTitle"]) == norm_fuzzy(nxt["cleanTitle"]))
                if nxt["type"] == "note" and same and nxt["locationStart"] == c["locationStart"]:
                    try:
                        t_prev = datetime.datetime.fromisoformat(initial[j]["addedAt"].replace("Z", ""))
                        t_next = datetime.datetime.fromisoformat(nxt["addedAt"].replace("Z", ""))
                        if abs((t_next - t_prev).total_seconds()) <= 180:
                            j += 1
                            continue
                    except Exception:
                        j += 1
                        continue
                break
            final_n = initial[j]
            if final_n["content"]:
                collapsed.append(final_n)
            i = j + 1
        else:
            collapsed.append(c)
            i += 1

    deduped = [dict(c) for c in collapsed if c["id"] not in superseded]
    active_hls = [c for c in deduped if c["type"] == "highlight"]
    paired_notes = set()
    for n in deduped:
        if n["type"] != "note" or not n["content"]:
            continue
        best, min_d = None, 999999
        for h in active_hls:
            same = (n["matchedBookId"] and n["matchedBookId"] == h["matchedBookId"]) or (norm_fuzzy(n["cleanTitle"]) == norm_fuzzy(h["cleanTitle"]))
            if not same:
                continue
            if n["locationStart"] is not None and h["locationStart"] is not None:
                d = 0 if h["locationStart"] <= n["locationStart"] <= h["locationEnd"] else (h["locationStart"] - n["locationStart"] if n["locationStart"] < h["locationStart"] else n["locationStart"] - h["locationEnd"])
                if d <= 8 and d < min_d:
                    min_d, best = d, h
            elif n["page"] is not None and h["page"] is not None and n["page"] == h["page"] and min_d > 0:
                min_d, best = 0, h
        if best:
            best["attachedNote"] = f"{best['attachedNote']}\n{n['content']}" if best["attachedNote"] else n["content"]
            paired_notes.add(n["id"])
    return [c for c in deduped if c["id"] not in paired_notes]


def extract_ksdk_clippings(
    db_path: pathlib.Path,
    existing_sigs: set[tuple[str, str]],
    books: list[dict],
    after_ms: int = 0,
) -> list[dict]:
    if not db_path.exists():
        return []
    con = sqlite3.connect(str(db_path))
    rows = con.execute("SELECT dataset_id, annotation_id, serialized_payload, modified_time FROM server_view ORDER BY modified_time ASC").fetchall()
    con.close()

    # Group by dataset_id -> ASIN
    by_book: dict[str, list] = {}
    for did, aid, pay, mt in rows:
        if mt <= after_ms:
            continue
        obj = json.loads(pay)
        if obj.get("type") in ("HIGHLIGHT", "NOTE", "BOOKMARK"):
            by_book.setdefault(did, []).append((aid, obj, mt))

    out_items: list[dict] = []
    for did, items in by_book.items():
        asin = did.split("-")[0]
        kfx_files = list(KFX_CACHE.glob(f"*{asin}*.kfx"))
        if not kfx_files:
            continue
        kfx_path = kfx_files[0]
        kfx_title, kfx_author, slicer = decode_kfx_book(kfx_path)
        stem = kfx_path.stem.rsplit("_", 1)[0]
        if " - " in stem and not kfx_author:
            t_part, a_part = stem.rsplit(" - ", 1)
            raw_title = t_part.strip()
            author = a_part.strip()
        else:
            raw_title = kfx_title or stem
            author = kfx_author
            if " - " in raw_title and author and raw_title.endswith(" - " + author):
                raw_title = raw_title[: -len(" - " + author)].strip()
            elif " - " in raw_title and not author:
                raw_title, author = [x.strip() for x in raw_title.rsplit(" - ", 1)]
        clean_title = re.sub(r"\s*\([^)]*#\d+[^)]*\)\s*$", "", raw_title).strip() or raw_title
        matched_id = match_book(clean_title, raw_title, author, books)

        book_clips = []
        hls_local = []
        notes_local = []
        for aid, obj, mt in items:
            tp = obj["type"].lower()
            sp = obj["start_position"]["shortPosition"]
            ep = obj["end_position"]["shortPosition"]
            meta = json.loads(obj.get("json_metadata") or "{}")
            added_iso = datetime.datetime.fromtimestamp(mt / 1000.0, tz=datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
            if tp == "highlight":
                txt = slicer(sp, ep)
                if not txt:
                    continue
                sig = (norm_fuzzy(clean_title), txt.strip().lower()[:60])
                if sig in existing_sigs:
                    continue
                rec = {
                    "id": f"ksdk_{asin}_{sp}_{ep}",
                    "rawTitle": raw_title,
                    "cleanTitle": clean_title,
                    "author": author,
                    "matchedBookId": matched_id,
                    "type": "highlight",
                    "page": None,
                    "locationStart": sp,
                    "locationEnd": ep,
                    "addedAt": added_iso,
                    "content": txt,
                    "attachedNote": None,
                    "highlightColor": meta.get("mchl_color") or None,
                    "sourceFormat": "ksdk-sync",
                }
                hls_local.append(rec)
                book_clips.append(rec)
            elif tp == "note" and meta.get("note_text"):
                notes_local.append((aid, sp, ep, added_iso, meta["note_text"]))
            elif tp == "bookmark":
                # Only emit KSDK bookmarks if this book had post-Aug-30 activity (> 1788300000000 ms) so legacy My Clippings bookmarks aren't duplicated
                if mt > 1788300000000:
                    ctx = slicer(sp, sp + 75).replace("\n", " ").strip()
                    book_clips.append({
                        "id": f"ksdk_bm_{asin}_{sp}",
                        "rawTitle": raw_title,
                        "cleanTitle": clean_title,
                        "author": author,
                        "matchedBookId": matched_id,
                        "type": "bookmark",
                        "page": None,
                        "locationStart": sp,
                        "locationEnd": sp,
                        "addedAt": added_iso,
                        "content": ctx,
                        "attachedNote": None,
                        "highlightColor": meta.get("mchl_color") or None,
                        "sourceFormat": "ksdk-sync",
                    })

        # Pair KSDK notes to nearby KSDK highlights (pos overlap +/- 15)
        for aid, sp, ep, added_iso, ntxt in notes_local:
            paired = False
            for h in hls_local:
                if (h["locationStart"] - 15) <= sp <= (h["locationEnd"] + 15):
                    h["attachedNote"] = f"{h['attachedNote']}\n{ntxt}" if h["attachedNote"] else ntxt
                    paired = True
                    break
            if not paired and (norm_fuzzy(clean_title), ntxt.strip().lower()[:60]) not in existing_sigs:
                # Only add orphan KSDK note if not already present in My Clippings.txt
                sig_prefix = any(s[0] == norm_fuzzy(clean_title) and ntxt.strip().lower()[:40] in s[1] for s in existing_sigs)
                if not sig_prefix:
                    book_clips.append({
                        "id": f"ksdk_note_{asin}_{sp}",
                        "rawTitle": raw_title,
                        "cleanTitle": clean_title,
                        "author": author,
                        "matchedBookId": matched_id,
                        "type": "note",
                        "page": None,
                        "locationStart": sp,
                        "locationEnd": ep,
                        "addedAt": added_iso,
                        "content": ntxt,
                        "attachedNote": None,
                        "sourceFormat": "ksdk-sync",
                    })
        out_items.extend(book_clips)
    return out_items


def parse_yjf_timer(raw: bytes) -> dict:
    """Extract timer.model (ms_read, words_read, progress_fraction) and LPR from a .yjf/.azw3f sidecar."""
    res: dict = {}
    idx = raw.find(b"timer.model")
    if idx != -1:
        pos = idx + len(b"timer.model")
        vals = []
        for expected_tag in (0x02, 0x02, 0x02, 0x04):
            if pos < len(raw) and raw[pos] == expected_tag:
                pos += 1
                if expected_tag == 0x02 and pos + 8 <= len(raw):
                    vals.append(struct.unpack(">q", raw[pos:pos + 8])[0])
                elif expected_tag == 0x04 and pos + 8 <= len(raw):
                    vals.append(struct.unpack(">d", raw[pos:pos + 8])[0])
                pos += 8
        if len(vals) == 4:
            res["ms_read"] = vals[1]
            res["words_read"] = vals[2]
            res["progress_fraction"] = vals[3]
    return res


def extract_kindle_telemetry(books: list[dict], now_iso: str) -> dict:
    """Aggregate per-book reading speed (WPM) & hours read from cached .yjf/.azw3f sidecars."""
    per_book: dict[str, dict] = {}
    if not SIDECAR_CACHE.exists():
        return {
            "updatedAt": now_iso,
            "medianWpm": None,
            "totalHoursRead": 0.0,
            "totalWordsRead": 0,
            "trackedBooksCount": 0,
            "books": {},
        }

    for sc in sorted(SIDECAR_CACHE.iterdir()):
        if sc.suffix not in (".yjf", ".azw3f"):
            continue
        parsed = parse_yjf_timer(sc.read_bytes())
        ms_read = parsed.get("ms_read", 0)
        words_read = parsed.get("words_read", 0)
        prog_frac = parsed.get("progress_fraction", 0.0)
        if ms_read <= 0 or words_read < 200:
            continue

        raw_title = re.sub(r"_[A-Za-z0-9]{10,40}d0838fbfbb6dbc2b68bc7d0f086b1738\.(yjf|azw3f)$", "", sc.name)
        clean_title = raw_title.split(" -- ")[0].replace("_", " ").strip()
        matched_id = match_book(clean_title, raw_title, None, books)
        if not matched_id:
            continue

        wpm = round(words_read / (ms_read / 60000.0))
        hours_read = round(ms_read / 3600000.0, 2)
        prog_pct = round(min(100.0, max(0.0, prog_frac * 100.0)), 1)

        prev = per_book.get(matched_id)
        if not prev or words_read > prev["wordsRead"]:
            matched_book = next((b for b in books if b.get("id") == matched_id), None)
            per_book[matched_id] = {
                "bookId": matched_id,
                "title": (matched_book.get("cleanTitle") or matched_book.get("title")) if matched_book else clean_title,
                "wpm": wpm,
                "wordsRead": words_read,
                "hoursRead": hours_read,
                "progressPct": prog_pct,
                "syncedAt": now_iso,
            }

    deep_wpms = [v["wpm"] for v in per_book.values() if v["wordsRead"] >= 1000 and v["wpm"]]
    median_wpm = round(statistics.median(deep_wpms)) if deep_wpms else None
    total_hours = round(sum(v["hoursRead"] for v in per_book.values()), 1)
    total_words = sum(v["wordsRead"] for v in per_book.values())

    return {
        "updatedAt": now_iso,
        "medianWpm": median_wpm,
        "totalHoursRead": total_hours,
        "totalWordsRead": total_words,
        "trackedBooksCount": len(per_book),
        "books": per_book,
    }


def advance_currently_reading_pages(books: list[dict], ustate: dict) -> int:
    """Non-destructively advance currentPage on currently-reading books from KFX LPRs."""
    db_path = CACHE_DIR / "ksdk_annotation_v1.db"
    if not db_path.exists():
        return 0
    con = sqlite3.connect(str(db_path))
    lpr_rows = con.execute(
        "SELECT book_id, start_position FROM nonsyncable_annotations WHERE dataset=8"
    ).fetchall()
    con.close()

    asin_lpr: dict[str, int] = {}
    for book_id_col, sp_json in lpr_rows:
        try:
            sp_val = int(json.loads(sp_json).get("shortPosition", 0))
            asin = book_id_col.split("-")[0]
            if sp_val > asin_lpr.get(asin, 0):
                asin_lpr[asin] = sp_val
        except Exception:
            continue

    overrides = ustate.setdefault("bookOverrides", {})
    updated_count = 0
    for b in books:
        bid = b.get("id")
        shelf = (overrides.get(bid, {}) or {}).get("exclusiveShelf") or b.get("exclusiveShelf")
        page_count = b.get("pageCount") or 0
        if shelf != "currently-reading" or page_count <= 0:
            continue

        title_norm = norm_fuzzy(b.get("cleanTitle") or b.get("title", ""))
        if not title_norm:
            continue

        for kfx in KFX_CACHE.glob("*.kfx"):
            kfx_stem_norm = norm_fuzzy(kfx.stem.rsplit("_", 1)[0])
            if not kfx_stem_norm:
                continue
            # Avoid matching anthologies ("and other stories") to single-story Goodreads entries
            if "other stories" in kfx_stem_norm and "stories" not in title_norm:
                continue
            if title_norm != kfx_stem_norm and title_norm not in kfx_stem_norm:
                continue

            asin = kfx.stem.split("_")[-1]
            short_pos = asin_lpr.get(asin, 0)
            if short_pos <= 1:
                continue

            max_pid = get_kfx_max_pid(kfx)
            if max_pid <= 0:
                continue

            est_page = max(1, min(page_count, round((short_pos / max_pid) * page_count)))
            cur_override = overrides.setdefault(bid, {})
            existing_page = cur_override.get("currentPage") or 0
            if est_page > existing_page:
                cur_override["currentPage"] = est_page
                updated_count += 1
            break

    return updated_count


def main():
    bundle_path = DATA_DIR / "library_bundle.json"
    books = json.loads(bundle_path.read_text(encoding="utf-8")).get("books", []) if bundle_path.exists() else []
    connected = pull_from_connected_kindle(books)

    txt_clips = parse_clippings_txt(CACHE_DIR / "My Clippings.txt", books)
    existing_sigs = {(norm_fuzzy(c["cleanTitle"]), c["content"].strip().lower()[:60]) for c in txt_clips if c["content"]}
    # Cutoff timestamp: latest entry inside My Clippings.txt (so pre-cutoff legacy items aren't duplicated from KSDK)
    max_txt_ms = 0
    for c in txt_clips:
        if c.get("addedAt"):
            try:
                dt = datetime.datetime.fromisoformat(c["addedAt"].replace("Z", ""))
                # Account for local +03:00 timezone vs UTC millis in ksdk_annotation_v1.db (allow small overlap safety margin)
                ms = int(dt.timestamp() * 1000)
                if ms > max_txt_ms:
                    max_txt_ms = ms
            except Exception:
                pass
    ksdk_clips = extract_ksdk_clippings(CACHE_DIR / "ksdk_annotation_v1.db", existing_sigs, books, after_ms=max_txt_ms)

    combined = txt_clips + ksdk_clips
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    kindle_telemetry = extract_kindle_telemetry(books, now_iso)

    sync_payload = {
        "format": "ex-libris-kindle-sync-v1",
        "syncedAt": now_iso,
        "connected": connected,
        "counts": {
            "total": len(combined),
            "clippingsTxt": len(txt_clips),
            "ksdkSync": len(ksdk_clips),
        },
        "kindleTelemetry": kindle_telemetry,
        "clippings": combined,
    }
    sync_out = DATA_DIR / "kindle_sync.json"
    sync_out.write_text(json.dumps(sync_payload, indent=2, ensure_ascii=False), encoding="utf-8")

    # Non-destructive merge into data/user_state.json
    ustate_path = DATA_DIR / "user_state.json"
    ustate = json.loads(ustate_path.read_text(encoding="utf-8")) if ustate_path.exists() else {
        "version": "0.2.0",
        "showCovers": True,
        "bookOverrides": {},
        "kindleClippings": [],
    }
    # Preserve any manual non-Kindle clippings that don't start with clip_ / ksdk_
    custom_clips = [c for c in ustate.get("kindleClippings", []) if not str(c.get("id", "")).startswith(("clip_", "ksdk_"))]
    ustate["kindleClippings"] = combined + custom_clips
    ustate["kindleTelemetry"] = kindle_telemetry
    lpr_updates = advance_currently_reading_pages(books, ustate)
    ustate["updatedAt"] = now_iso
    ustate_path.write_text(json.dumps(ustate, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Synced Kindle -> {len(combined)} total clippings ({len(txt_clips)} from My Clippings.txt, {len(ksdk_clips)} new from ksdk_annotation_v1.db)")
    print(f"Kindle Speed -> median {kindle_telemetry.get('medianWpm')} WPM across {kindle_telemetry.get('trackedBooksCount')} books ({kindle_telemetry.get('totalHoursRead')}h), advanced {lpr_updates} current-reading page(s)")
    print(f"Wrote: {sync_out}")
    print(f"Updated: {ustate_path} (preserved {len(ustate.get('bookOverrides', {}))} bookOverrides)")


if __name__ == "__main__":
    main()
