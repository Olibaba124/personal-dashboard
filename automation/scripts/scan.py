#!/usr/bin/env python3
"""
scan.py — Query one or more job sources ("adapters"), dedupe across all of
them, merge into the Supabase career_jobs table. Updates last_seen every run.
Auto-expires stale jobs after 2 days. Resolves each new job's direct
employer/ATS URL where the source needs it. Skips any job whose id is
tombstoned in career_tombstones (kind='id') OR whose cross-source dedup_key
is tombstoned there (kind='key') — the latter is what stops a *different*
source from re-adding a role you deleted via one source. Leaves
manually-logged jobs (source == "manual") entirely untouched.
Preserves all user-set fields (starred, priority, status, notes, materials,
insights, summary, fit_score, url, applied_on).

Ported from the standalone job-tracker repo, where this wrote straight to
data/jobs.json and a GitHub Action committed the diff. All dedup/merge/
auto-expire logic below is unchanged from that version — only the storage
boundary moved, from JSON files to Supabase (career_jobs / career_tombstones),
authenticated with the service-role key (server-side only, a GitHub Actions
secret — never the anon key shipped to the browser). `materials` is still
treated as one opaque nested dict internally (resume/cover_letter/
tailored_on) and only flattened to career_jobs' resume_md/cover_letter_md/
tailored_on columns at the load/save boundary, so none of the dedup/merge
logic below needed to change shape.

Which adapters actually run, and in what order, is controlled by
config/sources.json ("enabled" + "priority"); a missing/empty file behaves
exactly as the original Adzuna-only script.

Adapter contract: each fetch_<source>(existing, fuzzy_existing, deleted_ids,
deleted_keys, today_str) function loads its own credentials/config,
paginates its API, normalizes results into the job schema, and applies
config/criteria.json's keyword/location/salary/exclude filtering itself (so
a source like Greenhouse that returns a company's entire job board doesn't
flood Review). It returns (results, max_new): a flat list of normalized job
dicts with a source-prefixed id and the RAW (unresolved) url, and an
optional cap on how many of them may actually be inserted as new this run
(None = unlimited). Adapters make no dedup/merge/keep-or-drop DECISIONS and
never resolve URLs or expire anything — that's entirely the central
pipeline's job (process_results + auto_expire), run once per adapter's
output, in priority order, so a higher-priority source's record wins when
two sources find the same role. `existing`/`fuzzy_existing`/`deleted_ids`/
`deleted_keys` are passed into adapters read-only and used only to
replicate the original single-source script's exact fetch-volume/
insertion-cap behavior; adapters must not mutate them.
"""

import hashlib
import html
import json
import os
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests

ROOT = Path(__file__).parent.parent
CRITERIA_PATH = ROOT / "config" / "criteria.json"
SOURCES_CONFIG_PATH = ROOT / "config" / "sources.json"

DEFAULT_SOURCE_PRIORITY = ["manual", "greenhouse", "lever", "ashby", "adzuna", "googlejobs", "theirstack"]

ADZUNA_BASE = "https://api.adzuna.com/v1/api/jobs/us/search"
RESULTS_PER_PAGE = 20
RATE_LIMIT_DELAY = 2.5  # well under 25 req/min free-tier limit

EXPIRE_DAYS = 2
PROTECTED_STATUSES = {"applied", "heard_back", "interviewing", "offer"}

# url is included here because it's resolved once (see resolve_final_url)
# and must stay fixed on subsequent scans rather than reverting to the raw
# aggregator redirect link. "contacts" from the original jobs.json schema is
# dropped — it was dead (never read or written anywhere in the UI) and has
# no column in career_jobs.
USER_FIELDS = {
    "starred", "priority", "status", "notes", "materials",
    "insights", "summary", "fit_score", "url", "applied_on",
}

REDIRECT_TIMEOUT = 5  # seconds, per hop
MAX_REDIRECT_HOPS = 5
REDIRECT_STATUS_CODES = {301, 302, 303, 307, 308}
AGGREGATOR_HOSTS = {
    "adzuna.com", "indeed.com", "linkedin.com",
    "ziprecruiter.com", "glassdoor.com", "simplyhired.com",
}


def _load_env_fallback(*keys):
    """Local-dev convenience: GitHub Actions injects secrets as real env
    vars, but a local run can drop them in automation/.env (gitignored)
    instead. Mirrors the original script's ADZUNA .env fallback."""
    found = {}
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                if k in keys:
                    found[k] = v.strip()
    return found


def load_credentials():
    app_id = os.environ.get("ADZUNA_APP_ID")
    app_key = os.environ.get("ADZUNA_APP_KEY")
    if not app_id or not app_key:
        fallback = _load_env_fallback("ADZUNA_APP_ID", "ADZUNA_APP_KEY")
        app_id = app_id or fallback.get("ADZUNA_APP_ID")
        app_key = app_key or fallback.get("ADZUNA_APP_KEY")
    if not app_id or not app_key:
        sys.exit("ERROR: ADZUNA_APP_ID and ADZUNA_APP_KEY must be set.")
    return app_id, app_key


def load_serpapi_key():
    """Unlike Adzuna's credentials, a missing SerpApi key is not fatal —
    this source is optional and must degrade gracefully (see fetch_googlejobs)."""
    key = os.environ.get("SERPAPI_KEY") or _load_env_fallback("SERPAPI_KEY").get("SERPAPI_KEY")
    return key or None


def load_theirstack_key():
    """Same optional-source contract as load_serpapi_key()."""
    key = os.environ.get("THEIRSTACK_API_KEY") or _load_env_fallback("THEIRSTACK_API_KEY").get("THEIRSTACK_API_KEY")
    return key or None


def load_criteria():
    return json.loads(CRITERIA_PATH.read_text())


def load_sources_config():
    """Missing/empty file -> behave exactly as before multi-source support
    (Adzuna only, in its historical position)."""
    if not SOURCES_CONFIG_PATH.exists():
        return {"enabled": ["adzuna"], "priority": DEFAULT_SOURCE_PRIORITY}
    cfg = json.loads(SOURCES_CONFIG_PATH.read_text())
    cfg.setdefault("enabled", ["adzuna"])
    cfg.setdefault("priority", DEFAULT_SOURCE_PRIORITY)
    return cfg


def active_adapters(sources_config):
    """ADAPTERS filtered to sources_config['enabled'], ordered by
    sources_config['priority'] (unlisted sources sort last, keeping
    ADAPTERS' own relative order as a stable tiebreak) — so a higher-
    priority source is always processed, and therefore wins insertion,
    before a lower-priority one."""
    enabled = set(sources_config.get("enabled", ["adzuna"]))
    priority = sources_config.get("priority", DEFAULT_SOURCE_PRIORITY)
    rank = {name: i for i, name in enumerate(priority)}
    chosen = [a for a in ADAPTERS if a[1] in enabled]
    chosen.sort(key=lambda a: rank.get(a[1], len(priority)))
    return chosen


def migrate_notes(job):
    """notes was a plain string in the very first schema; now it's an array
    of {date, text}. Defensive — career_jobs.notes defaults to '[]' and is
    always an array in practice, but this is cheap insurance."""
    notes = job.get("notes")
    if isinstance(notes, str):
        job["notes"] = [{"date": job.get("date_found", ""), "text": notes}] if notes else []
    elif notes is None:
        job["notes"] = []
    return job


# ============ Supabase REST (service-role key — server-side only) ============
SUPABASE_URL = os.environ.get("SUPABASE_URL") or _load_env_fallback("SUPABASE_URL").get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or _load_env_fallback("SUPABASE_SERVICE_ROLE_KEY").get("SUPABASE_SERVICE_ROLE_KEY")


def _require_supabase_config():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        sys.exit("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")


def _supabase_headers():
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


def supabase_select(table, params):
    _require_supabase_config()
    resp = requests.get(f"{SUPABASE_URL}/rest/v1/{table}", headers=_supabase_headers(), params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def supabase_upsert(table, rows, on_conflict):
    if not rows:
        return
    _require_supabase_config()
    headers = _supabase_headers()
    headers["Prefer"] = "resolution=merge-duplicates"
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}", headers=headers,
        params={"on_conflict": on_conflict}, json=rows, timeout=60,
    )
    resp.raise_for_status()


def row_to_job(row):
    """career_jobs row (flat resume_md/cover_letter_md/tailored_on columns)
    -> the nested {"materials": {...}} shape the rest of this script (and
    the original jobs.json format) uses internally."""
    job = dict(row)
    job["materials"] = {
        "resume": job.pop("resume_md", None),
        "cover_letter": job.pop("cover_letter_md", None),
        "tailored_on": job.pop("tailored_on", None),
    }
    job.setdefault("contacts", [])
    return job


def job_to_row(job):
    """Inverse of row_to_job — flattens back out to career_jobs' columns
    for the upsert. Drops the dead `contacts` field (see USER_FIELDS)."""
    materials = job.get("materials") or {}
    row = {k: v for k, v in job.items() if k not in ("materials", "contacts")}
    row["resume_md"] = materials.get("resume")
    row["cover_letter_md"] = materials.get("cover_letter")
    row["tailored_on"] = materials.get("tailored_on")
    return row


def load_existing_jobs():
    rows = supabase_select("career_jobs", {"select": "*"})
    return {row["id"]: migrate_notes(row_to_job(row)) for row in rows}


def load_deleted_ids():
    rows = supabase_select("career_tombstones", {"select": "value", "kind": "eq.id"})
    return {r["value"] for r in rows}


def load_deleted_keys():
    rows = supabase_select("career_tombstones", {"select": "value", "kind": "eq.key"})
    return {r["value"] for r in rows}


def fuzzy_key(company, title):
    def clean(s):
        return re.sub(r"[^a-z0-9 ]", "", (s or "").lower()).strip()
    return f"{clean(company)}|{clean(title)}"


def dedup_key(job):
    """The single cross-source dedup identity: normalized company|title.
    MUST match js/career.js's careerDedupKey() exactly — see the comment
    there — since both sides need to agree on what "the same role" means
    for the key-tombstone (career_tombstones, kind='key') to work across
    sources.
    """
    return fuzzy_key(job.get("company"), job.get("title"))


def title_excluded(title, title_excludes):
    title_lower = title.lower()
    return any(kw.lower() in title_lower for kw in title_excludes)


def description_excluded(text, exclude_keywords):
    text_lower = text.lower()
    return any(kw.lower() in text_lower for kw in exclude_keywords)


def _is_aggregator_host(host):
    host = host.lower()
    return any(host == h or host.endswith("." + h) for h in AGGREGATOR_HOSTS)


def resolve_final_url(url):
    """Follow redirects server-side to find the final employer posting URL
    (typically an ATS page — Workday, Greenhouse, Lever, iCIMS, etc.).
    Falls back to the original url on any request error, timeout, exhausted
    hop budget, or if the final host is still an aggregator domain.
    """
    if not url:
        return url

    current = url
    try:
        for _ in range(MAX_REDIRECT_HOPS):
            resp = requests.get(
                current, allow_redirects=False, timeout=REDIRECT_TIMEOUT, stream=True,
            )
            resp.close()
            location = resp.headers.get("Location")
            if resp.status_code in REDIRECT_STATUS_CODES and location:
                current = urljoin(current, location)
                continue
            break
        else:
            return url  # exhausted hop budget without landing on a final page
    except requests.RequestException:
        return url

    if _is_aggregator_host(urlparse(current).netloc):
        return url

    return current


def normalize_adzuna(result, today_str):
    company = result.get("company", {}).get("display_name", "")
    return {
        "id": f"adzuna-{result['id']}",
        "company": company,
        "title": result.get("title", ""),
        "url": result.get("redirect_url", ""),
        "location": result.get("location", {}).get("display_name", ""),
        "salary_min": result.get("salary_min"),
        "salary_max": result.get("salary_max"),
        "description": result.get("description", ""),
        "source": "adzuna",
        "date_found": today_str,
        "last_seen": today_str,
        "starred": False,
        "priority": 0,
        "status": "new",
        "notes": [],
        "fit_score": None,
        "summary": None,
        "materials": {
            "resume": None,
            "cover_letter": None,
            "tailored_on": None,
        },
        "insights": None,
        "contacts": [],
        "applied_on": None,
    }


def fetch_jobs_page(app_id, app_key, keyword, location, salary_min, page):
    params = {
        "app_id": app_id,
        "app_key": app_key,
        "results_per_page": RESULTS_PER_PAGE,
        "what": keyword,
        "where": location,
        "salary_min": salary_min,
        "full_description": 1,
        "content-type": "application/json",
    }
    url = f"{ADZUNA_BASE}/{page}"
    resp = requests.get(url, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json().get("results", [])


def fetch_adzuna(existing, fuzzy_existing, deleted_ids, deleted_keys, today_str):
    """Adapter: paginate Adzuna across every keyword x location combination,
    normalize, apply criteria excludes. Stops starting new keyword/location
    combinations once it estimates it has found max_results_per_run
    genuinely-new jobs — matching the original script's fetch-budgeting
    exactly, including that a combination already in progress still
    paginates to its natural end (an empty page or an error) rather than
    cutting off mid-location. `existing`/`fuzzy_existing`/`deleted_ids`/
    `deleted_keys` are read-only here, used only for this estimate — they
    are never mutated, and the actual keep/drop/insert decision (including
    the hard cap on how many new jobs get inserted) stays entirely in
    process_results().
    """
    app_id, app_key = load_credentials()
    criteria = load_criteria()

    exclude = criteria.get("exclude_keywords", [])
    title_excludes = criteria.get("title_exclude_keywords", [])
    salary_min = criteria.get("salary_min", 0)
    max_results = criteria.get("max_results_per_run", 50)
    locations = criteria.get("locations", [""])
    keywords = criteria.get("keywords", [])

    results_out = []
    seen_fuzzy = set(fuzzy_existing.keys())  # local copy, budgeting only
    added_estimate = 0

    for keyword in keywords:
        if added_estimate >= max_results:
            break
        for location in locations:
            if added_estimate >= max_results:
                break
            page = 1
            while True:
                print(f"  [adzuna] Fetching: '{keyword}' in '{location}' page {page}")
                try:
                    page_results = fetch_jobs_page(app_id, app_key, keyword, location, salary_min, page)
                except requests.HTTPError as e:
                    print(f"  [adzuna] HTTP error: {e}")
                    break

                if not page_results:
                    break

                for result in page_results:
                    job = normalize_adzuna(result, today_str)

                    if title_excluded(job["title"], title_excludes):
                        continue
                    combined = f"{job['title']} {job['description']}"
                    if description_excluded(combined, exclude):
                        continue

                    # Tombstone-check (by id or by dedup_key) stays the
                    # central pipeline's call (it's still returned here) —
                    # but a tombstoned job will never actually be inserted,
                    # so it must not eat into the fetch budget the way the
                    # original single-loop version never did (there, the
                    # tombstone `continue` happened before the added-counter
                    # was ever reached).
                    results_out.append(job)
                    fkey = dedup_key(job)
                    if job["id"] in deleted_ids or fkey in deleted_keys:
                        continue

                    if job["id"] not in existing and fkey not in seen_fuzzy:
                        seen_fuzzy.add(fkey)
                        added_estimate += 1

                page += 1
                time.sleep(RATE_LIMIT_DELAY)

    return results_out, max_results


GREENHOUSE_BASE = "https://boards-api.greenhouse.io/v1/boards"


def strip_html(content):
    """Greenhouse's job `content` is HTML-*escaped* (e.g. "&lt;h2&gt;"), not
    raw tags — must unescape entities first, then strip tags, or the regex
    below matches nothing and every job's description is one giant HTML
    blob. Verified against the live API before writing this."""
    unescaped = html.unescape(content or "")
    text = re.sub(r"<[^>]+>", " ", unescaped)
    return re.sub(r"\s+", " ", text).strip()


def title_matches_keywords(title):
    """Greenhouse has no keyword-search API — it returns a company's entire
    board — so unlike Adzuna, matching happens locally. "analyst" is the one
    word common to every configured keyword (real estate analyst,
    acquisitions analyst, investment analyst real estate), so requiring it
    catches genuinely relevant roles while the title/description exclude
    lists below do the precision work of keeping out noise. A company only
    ends up on the watchlist because the user already curated it, so this
    intentionally errs inclusive rather than trying to replicate Adzuna's
    fuzzy keyword search exactly.
    """
    return "analyst" in title.lower()


def location_matches(gh_location, criteria_locations, remote_ok):
    loc_lower = (gh_location or "").lower()
    if remote_ok and "remote" in loc_lower:
        return True
    for cl in criteria_locations:
        city = cl.split(",")[0].strip().lower()
        if city and city in loc_lower:
            return True
    return False


def fetch_greenhouse_board(token):
    resp = requests.get(f"{GREENHOUSE_BASE}/{token}/jobs", params={"content": "true"}, timeout=15)
    resp.raise_for_status()
    return resp.json().get("jobs", [])


def normalize_greenhouse(job, token, today_str):
    return {
        "id": f"greenhouse-{job['id']}",
        "company": job.get("company_name") or token,
        "title": job.get("title", ""),
        "url": job.get("absolute_url", ""),
        "location": (job.get("location") or {}).get("name", ""),
        "salary_min": None,
        "salary_max": None,
        "description": strip_html(job.get("content", "")),
        "source": "greenhouse",
        "date_found": today_str,
        "last_seen": today_str,
        "starred": False,
        "priority": 0,
        "status": "new",
        "notes": [],
        "fit_score": None,
        "summary": None,
        "materials": {
            "resume": None,
            "cover_letter": None,
            "tailored_on": None,
        },
        "insights": None,
        "contacts": [],
        "applied_on": None,
    }


def fetch_greenhouse(existing, fuzzy_existing, deleted_ids, deleted_keys, today_str):
    """Adapter: one or more watchlisted Greenhouse boards
    (config/sources.json's greenhouse_tokens). Each board returns its
    entire job list (no keyword search), so this filters locally against
    config/criteria.json before returning anything — otherwise a single
    company could flood Review with irrelevant roles. Unlike Adzuna, never
    drops a job solely for missing salary (Greenhouse rarely publishes
    comp) and has no per-run insertion cap (a watchlist is small and
    bounded by definition) — so it returns (results, None). Missing/empty
    token list -> no Greenhouse jobs, no crash.
    """
    sources_config = load_sources_config()
    tokens = sources_config.get("greenhouse_tokens", [])
    if not tokens:
        return [], None

    criteria = load_criteria()
    title_excludes = criteria.get("title_exclude_keywords", [])
    exclude = criteria.get("exclude_keywords", [])
    locations = criteria.get("locations", [])
    remote_ok = criteria.get("remote_ok", False)

    results_out = []
    for token in tokens:
        print(f"  [greenhouse] Fetching board: {token}")
        try:
            board_jobs = fetch_greenhouse_board(token)
        except requests.RequestException as e:
            print(f"  [greenhouse] {token}: request failed, skipping this board ({e})")
            continue

        for gh_job in board_jobs:
            job = normalize_greenhouse(gh_job, token, today_str)

            if not title_matches_keywords(job["title"]):
                continue
            if title_excluded(job["title"], title_excludes):
                continue
            if not location_matches(job["location"], locations, remote_ok):
                continue
            combined = f"{job['title']} {job['description']}"
            if description_excluded(combined, exclude):
                continue

            results_out.append(job)

    return results_out, None


SERPAPI_BASE = "https://serpapi.com/search.json"


def fetch_serpapi_jobs_page(key, query, location):
    resp = requests.get(SERPAPI_BASE, params={
        "engine": "google_jobs",
        "q": query,
        "location": location,
        "api_key": key,
    }, timeout=20)
    resp.raise_for_status()
    return resp.json().get("jobs_results", [])


def googlejobs_id(job):
    """Google Jobs' own `job_id` is a long, deterministic base64 blob (not a
    clean short id) — hash it down. Falls back to a company|title|location
    composite on the rare listing missing job_id. Verified against a live
    SerpApi call before writing this: job_id was present and stable-looking
    on every result.
    """
    raw = job.get("job_id") or f"{job.get('company_name', '')}|{job.get('title', '')}|{job.get('location', '')}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def googlejobs_url(job):
    """Verified live: `source_link` is present on every result and is the
    same URL as apply_options[0]['link'] minus its utm_* tracking params —
    often already the direct employer/ATS page, sometimes an aggregator
    mirror (Indeed, etc.), which is exactly why needs_url_resolution=True
    below routes it through the same resolve_final_url() Adzuna uses.
    """
    if job.get("source_link"):
        return job["source_link"]
    apply_options = job.get("apply_options") or []
    if apply_options and apply_options[0].get("link"):
        return apply_options[0]["link"]
    return job.get("share_link", "")


def googlejobs_is_remote(job):
    if job.get("detected_extensions", {}).get("work_from_home"):
        return True
    loc_lower = (job.get("location") or "").strip().lower()
    return "remote" in loc_lower or loc_lower == "anywhere"


def normalize_googlejobs(job, today_str):
    return {
        "id": f"googlejobs-{googlejobs_id(job)}",
        "company": job.get("company_name", ""),
        "title": job.get("title", ""),
        "url": googlejobs_url(job),
        "location": job.get("location", ""),
        "salary_min": None,
        "salary_max": None,
        "description": job.get("description", ""),
        "source": "googlejobs",
        "date_found": today_str,
        "last_seen": today_str,
        "starred": False,
        "priority": 0,
        "status": "new",
        "notes": [],
        "fit_score": None,
        "summary": None,
        "materials": {
            "resume": None,
            "cover_letter": None,
            "tailored_on": None,
        },
        "insights": None,
        "contacts": [],
        "applied_on": None,
    }


def fetch_googlejobs(existing, fuzzy_existing, deleted_ids, deleted_keys, today_str):
    """Adapter: SerpApi's Google Jobs engine over config/sources.json's
    google_jobs.queries x .locations — each combination is one paid API
    call, so (unlike Adzuna) this makes exactly one request per combination
    and does not paginate further. Missing/empty queries or locations ->
    no jobs, no crash. A missing SERPAPI_KEY (unset, expired, or the
    secret never configured) skips this source with a warning rather than
    failing the run — a third-party metered key going bad must degrade to
    whatever other sources are enabled, the same way an empty Greenhouse
    token list does. `description` here is already plain text (verified
    live — no HTML-escaping issue like Greenhouse's `content` field).
    Unlike Adzuna, no per-run insertion cap (max_new=None): the queries x
    locations grid is small and explicitly configured, not an
    early-stopped open-ended search.
    """
    key = load_serpapi_key()
    if not key:
        print("  [googlejobs] SERPAPI_KEY not set — skipping this source.")
        return [], None

    sources_config = load_sources_config()
    gj_config = sources_config.get("google_jobs", {})
    queries = gj_config.get("queries", [])
    locations = gj_config.get("locations", [])
    if not queries or not locations:
        return [], None

    criteria = load_criteria()
    title_excludes = criteria.get("title_exclude_keywords", [])
    exclude = criteria.get("exclude_keywords", [])
    remote_ok = criteria.get("remote_ok", True)

    results_out = []
    for query in queries:
        for location in locations:
            print(f"  [googlejobs] Fetching: '{query}' in '{location}'")
            try:
                raw_jobs = fetch_serpapi_jobs_page(key, query, location)
            except requests.RequestException as e:
                print(f"  [googlejobs] request failed for '{query}' in '{location}', skipping ({e})")
                continue

            for raw in raw_jobs:
                job = normalize_googlejobs(raw, today_str)

                if not job["url"]:
                    continue  # no usable link at all — nothing to show or apply to
                if title_excluded(job["title"], title_excludes):
                    continue
                if not remote_ok and googlejobs_is_remote(raw):
                    continue
                combined = f"{job['title']} {job['description']}"
                if description_excluded(combined, exclude):
                    continue

                results_out.append(job)

    return results_out, None


THEIRSTACK_BASE = "https://api.theirstack.com/v1/jobs/search"


def theirstack_url(job):
    """final_url is often populated and cleaner, but verified live that it
    can still land on a tracker/redirect domain (e.g. appcast.io) rather
    than the true employer page — hence still needs_url_resolution=True
    below, same as url/source_url."""
    return job.get("final_url") or job.get("url") or job.get("source_url") or ""


def normalize_theirstack(job, today_str):
    return {
        "id": f"theirstack-{job['id']}",
        "company": job.get("company") or "",
        "title": job.get("job_title", ""),
        "url": theirstack_url(job),
        "location": job.get("location") or job.get("short_location") or "",
        "salary_min": job.get("min_annual_salary_usd"),
        "salary_max": job.get("max_annual_salary_usd"),
        "description": job.get("description") or "",
        "source": "theirstack",
        "date_found": today_str,
        "last_seen": today_str,
        "starred": False,
        "priority": 0,
        "status": "new",
        "notes": [],
        "fit_score": None,
        "summary": None,
        "materials": {
            "resume": None,
            "cover_letter": None,
            "tailored_on": None,
        },
        "insights": None,
        "contacts": [],
        "applied_on": None,
    }


def fetch_theirstack_page(key, job_titles, location_patterns, posted_within_days, limit, page):
    body = {
        "page": page,
        "limit": limit,
        "posted_at_max_age_days": posted_within_days,
        "job_title_or": job_titles,
        "job_country_code_or": ["US"],
    }
    if location_patterns:
        body["job_location_pattern_or"] = location_patterns
    resp = requests.post(
        THEIRSTACK_BASE,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json=body,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get("data", [])


def fetch_theirstack(existing, fuzzy_existing, deleted_ids, deleted_keys, today_str):
    """Adapter: TheirStack's unified job-search API — internally deduped
    across ITS OWN upstream sources already, so its real job here is
    feeding results into the shared dedup_key layer to collapse against
    whatever Adzuna/Greenhouse/Google Jobs already found. Reuses
    config/criteria.json's `keywords` directly as job_title_or rather than
    a separate query list in sources.json — TheirStack is meant as a
    low-maintenance overlap/backstop source, not one requiring its own
    keyword list kept in sync with criteria.json by hand.

    The API requires at least one of a date window or a company filter per
    call (verified live: omitting both returns a 422 "Missing mandatory
    filter" error) — scoped by a rolling posted_at_max_age_days window
    (config/sources.json's theirstack.posted_within_days, default 14),
    which also bounds credit spend (TheirStack bills ~1 credit per job
    returned; `limit_per_query`, default 25, caps it further).

    TheirStack's own location filtering is loose, not strict — live-tested
    both without any location param (returns nationwide results; with a
    small `limit`, the Bay Area postings can get crowded out entirely by
    same-day results from bigger metros) and with `job_location_pattern_or`
    (narrows meaningfully — most results land in the requested area — but
    still lets some clearly-wrong-city results through, e.g. a "San
    Francisco"-patterned query still returning Newark/NY). So this DOES
    send job_location_pattern_or (derived from criteria.locations' city
    names) to bias the query toward the right area and avoid wasting the
    `limit` budget on other metros, but local filtering is still the real
    gate: location_matches() (Greenhouse's same pattern) for non-remote
    listings, and TheirStack's own clean `remote` boolean (more reliable
    than Greenhouse's text-guessing) for remote ones. Known limitation:
    because the query is location-patterned, a genuinely-remote listing
    whose location text doesn't mention a configured city may not surface
    here — acceptable for a source explicitly meant as a backstop/overlap
    layer rather than primary remote-role coverage.

    A missing THEIRSTACK_API_KEY skips this source with a warning, the
    same graceful-degrade contract as the other optional sources. No
    per-run insertion cap (max_new=None) — bounded by `limit` instead.
    """
    key = load_theirstack_key()
    if not key:
        print("  [theirstack] THEIRSTACK_API_KEY not set — skipping this source.")
        return [], None

    criteria = load_criteria()
    job_titles = criteria.get("keywords", [])
    if not job_titles:
        return [], None

    title_excludes = criteria.get("title_exclude_keywords", [])
    exclude = criteria.get("exclude_keywords", [])
    locations = criteria.get("locations", [])
    remote_ok = criteria.get("remote_ok", True)
    location_patterns = sorted({cl.split(",")[0].strip() for cl in locations if cl.strip()})

    sources_config = load_sources_config()
    ts_config = sources_config.get("theirstack", {})
    posted_within_days = ts_config.get("posted_within_days", 14)
    limit = ts_config.get("limit_per_query", 25)

    print(f"  [theirstack] Searching {job_titles} near {location_patterns} (posted within {posted_within_days}d, limit {limit})")
    try:
        raw_jobs = fetch_theirstack_page(key, job_titles, location_patterns, posted_within_days, limit, page=0)
    except requests.RequestException as e:
        print(f"  [theirstack] request failed, skipping this source ({e})")
        return [], None

    results_out = []
    for raw in raw_jobs:
        job = normalize_theirstack(raw, today_str)

        if not job["url"]:
            continue  # nothing usable to show or apply to
        if title_excluded(job["title"], title_excludes):
            continue

        is_remote = bool(raw.get("remote"))
        if is_remote:
            if not remote_ok:
                continue
        elif not location_matches(job["location"], locations, False):
            continue

        combined = f"{job['title']} {job['description']}"
        if description_excluded(combined, exclude):
            continue

        results_out.append(job)

    return results_out, None


# (fetch_fn, source_name, needs_url_resolution)
# fetch_fn signature: fn(existing, fuzzy_existing, deleted_ids, deleted_keys,
# today_str) -> (results, max_new). Filtered/ordered at runtime by
# config/sources.json — see active_adapters().
ADAPTERS = [
    (fetch_greenhouse, "greenhouse", False),
    (fetch_adzuna, "adzuna", True),
    (fetch_googlejobs, "googlejobs", True),
    (fetch_theirstack, "theirstack", True),
]


def merge(existing, new_job, exclude=frozenset()):
    """Return new_job with user-set fields preserved from existing.
    date_found keeps the original discovery date. last_seen always comes
    from new_job (updated to today). `exclude` drops fields out of the
    preserved set for this call only — used by promotion (see
    process_results), which wants every OTHER USER_FIELDS value carried
    over but must let the new, higher-priority source's own `url` win
    rather than freezing onto the old source's url.
    """
    merged = dict(new_job)
    for field in USER_FIELDS - exclude:
        if field in existing:
            merged[field] = existing[field]
    if "date_found" in existing:
        merged["date_found"] = existing["date_found"]
    return merged


def process_results(results, existing, fuzzy_existing, deleted_ids, deleted_keys, today_str, needs_resolution, max_new=None, priority_rank=None):
    """Central pipeline: tombstone-check (by id OR by cross-source
    dedup_key), dedup/merge by id or fuzzy key, URL resolution (if this
    source needs it) — applied once, uniformly, regardless of which adapter
    produced the result.

    `max_new`, if given, hard-caps how many genuinely-new jobs get inserted
    from this batch (matching the original single-source script's
    `if added < max_results` guard — once hit, later new jobs in the same
    batch are silently dropped rather than inserted). None means unlimited,
    for adapters (Greenhouse, Google Jobs, ...) with no such per-run cap.

    `priority_rank` (source_name -> int, lower = higher priority) governs
    two things: which source wins when two adapters discover the same
    dedup_key fresh in the same run (handled naturally by processing
    adapters in priority order), and — the part that needs an explicit
    check here — *promotion*: if a job whose dedup_key already has an
    existing canonical record arrives from a strictly higher-priority
    source than that record's own source, the canonical record is re-homed
    onto the new id/url/description (resolving the URL first if this
    source needs it), while every USER_FIELDS value (notes, status,
    starred, applied_on, ...) carries over unchanged. Same-or-lower
    priority (including same-source rediscovery) just refreshes last_seen,
    as before.
    """
    priority_rank = priority_rank or {}
    added = 0
    updated = 0
    for job in results:
        fkey = dedup_key(job)
        if job["id"] in deleted_ids or fkey in deleted_keys:
            continue

        if job["id"] in existing:
            existing[job["id"]] = merge(existing[job["id"]], job)
            updated += 1
        elif fkey in fuzzy_existing:
            canonical_id = fuzzy_existing[fkey]
            canonical = existing[canonical_id]
            incoming_rank = priority_rank.get(job.get("source"), len(priority_rank))
            canonical_rank = priority_rank.get(canonical.get("source"), len(priority_rank))
            if incoming_rank < canonical_rank:
                # A higher-priority source now also has this role — promote:
                # adopt its id/url/description, keep the canonical record's
                # USER_FIELDS (notes, status, starred, applied_on, ...).
                if needs_resolution:
                    job["url"] = resolve_final_url(job["url"])
                    time.sleep(RATE_LIMIT_DELAY)
                promoted = merge(canonical, job, exclude={"url"})
                del existing[canonical_id]
                existing[job["id"]] = promoted
                fuzzy_existing[fkey] = job["id"]
                updated += 1
            else:
                # Duplicate posting from the same or a lower-priority
                # source — just refresh last_seen on the canonical entry.
                canonical["last_seen"] = today_str
        else:
            if max_new is not None and added >= max_new:
                continue  # over budget — matches original's silent drop
            if needs_resolution:
                job["url"] = resolve_final_url(job["url"])
                time.sleep(RATE_LIMIT_DELAY)
            existing[job["id"]] = job
            fuzzy_existing[fkey] = job["id"]
            added += 1
    return added, updated


def auto_expire(existing, today):
    cutoff = today - timedelta(days=EXPIRE_DAYS)
    expired_count = 0
    for job in existing.values():
        if job.get("source") == "manual":
            continue
        if job.get("status") in ("expired", "archived", "rejected"):
            continue
        if job.get("starred"):
            continue
        if job.get("status") in PROTECTED_STATUSES:
            continue
        last_seen_str = job.get("last_seen") or job.get("date_found", "")
        try:
            if date.fromisoformat(last_seen_str) < cutoff:
                job["status"] = "expired"
                expired_count += 1
        except ValueError:
            pass
    return expired_count


def main():
    existing = load_existing_jobs()
    deleted_ids = load_deleted_ids()
    deleted_keys = load_deleted_keys()
    sources_config = load_sources_config()
    today = date.today()
    today_str = today.isoformat()

    # Backfill last_seen for any pre-existing jobs missing the field
    for job in existing.values():
        if not job.get("last_seen"):
            job["last_seen"] = job.get("date_found", today_str)

    # Manual jobs (source == "manual") are excluded from fuzzy dedup so a
    # scanned duplicate can never latch onto one and touch its last_seen.
    fuzzy_existing = {
        dedup_key(j): j["id"]
        for j in existing.values() if j.get("source") != "manual"
    }

    priority_list = sources_config.get("priority", DEFAULT_SOURCE_PRIORITY)
    priority_rank = {name: i for i, name in enumerate(priority_list)}

    added_total = 0
    updated_total = 0

    # Processed strictly in priority order: a later (lower-priority) source's
    # duplicate collapses onto whatever a higher-priority source already
    # inserted into the shared existing/fuzzy_existing this run. priority_rank
    # additionally lets process_results *promote* a pre-existing lower-
    # priority record when a higher-priority source catches up to it in a
    # later run (see process_results' docstring).
    for fetch_fn, source_name, needs_resolution in active_adapters(sources_config):
        print(f"\n=== Source: {source_name} ===")
        results, max_new = fetch_fn(existing, fuzzy_existing, deleted_ids, deleted_keys, today_str)
        added, updated = process_results(
            results, existing, fuzzy_existing, deleted_ids, deleted_keys, today_str, needs_resolution, max_new, priority_rank,
        )
        print(f"  {source_name}: added {added}, updated {updated}")
        added_total += added
        updated_total += updated

    # Auto-expire jobs not seen recently
    expired_count = auto_expire(existing, today)
    if expired_count:
        print(f"\nAuto-expired {expired_count} stale job(s).")

    jobs_list = sorted(
        existing.values(),
        key=lambda j: j.get("date_found", ""),
        reverse=True,
    )
    supabase_upsert("career_jobs", [job_to_row(j) for j in jobs_list], on_conflict="id")
    print(f"\nDone. Added: {added_total}, Updated: {updated_total}, Total: {len(jobs_list)}")


if __name__ == "__main__":
    main()
