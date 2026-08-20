#!/usr/bin/env python3
"""
tailor.py — Three passes per run:
  0. Score unscored jobs (fit_score) via claude-haiku — runs FIRST.
  1. Tailor resume + cover letter for starred, un-tailored jobs.
  2. Generate 2-3 sentence summaries for all jobs lacking one.
  3. Generate next-action insights for high-priority starred jobs.
Never fabricates experience — strictly faithful to the career_profile row.

Ported from the standalone job-tracker repo, where this read/wrote
materials/base/*.md and materials/<id>/*.md on disk. All four passes'
prompts and target-selection logic below are unchanged — only the storage
boundary moved to Supabase: the base resume/background now live in the
singleton career_profile row (read-only here), and tailored materials are
written directly as resume_md/cover_letter_md text columns on the job's
career_jobs row instead of separate files.
"""

import json
import os
import re
import sys
from datetime import date
from pathlib import Path

import anthropic
import requests

ROOT = Path(__file__).parent.parent

TAILOR_MODEL  = "claude-sonnet-4-6"
SCORING_MODEL = "claude-haiku-4-5-20251001"
SUMMARY_MODEL = "claude-haiku-4-5-20251001"

MAX_PER_RUN   = 5   # tailoring cap
MAX_SUMMARIES = 20  # summary cap per run
MAX_SCORES    = 30  # scoring cap per run

SCORING_SYSTEM = (
    "You are screening commercial real estate job postings for a candidate and scoring "
    "fit from 0 to 100. Return ONLY a JSON object {\"fit_score\": <integer 0-100>} and "
    "nothing else.\n\n"
    "Candidate: entry-level, ~0–2 years experience. Finance student graduating March 2027, "
    "real estate focus. Background in CRE acquisitions, underwriting, and financial modeling "
    "(multifamily and mixed-use). Targeting analyst-level acquisitions, investment, or "
    "development roles.\n\n"
    "Score HIGHER for:\n"
    "- Analyst / entry-level / 1–2 year roles.\n"
    "- Elite real estate employers: real estate private equity (REPE), development firms, "
    "large institutional investors, investment banks, debt funds, and similarly prestigious "
    "shops. Employer caliber matters a lot.\n"
    "- Higher compensation — the candidate wants to maximize pay; rank higher-paying roles "
    "above comparable lower-paying ones.\n"
    "- Asset types, in order of preference: mixed-use, office, multifamily are top. Hotels "
    "are also strongly interesting, and niche assets like golf courses are interesting. The "
    "candidate is open to ANY asset class, so do not zero out other types — just prefer these.\n"
    "- Strategy: development and investment / acquisitions / value-add.\n"
    "- In-person roles in San Francisco through the Peninsula to San Jose.\n\n"
    "Score LOWER for:\n"
    "- Remote roles (still eligible, but below a comparable in-person Bay Area role).\n"
    "- Senior roles: director, VP, principal, managing director, head-of, or anything "
    "needing many years of experience.\n\n"
    "Score 0 (auto-reject):\n"
    "- Accounting or tax roles.\n"
    "- Lease / tenant-rep brokerage roles.\n"
    "- College internships for currently-enrolled students. IMPORTANT: full-time roles and "
    "post-graduation / new-grad rotational or analyst PROGRAMS are GOOD — score them "
    "normally. Only reject internships explicitly for current undergraduates.\n\n"
    "\"Associate\" titles: fine only when the role is genuinely analyst / entry-level. "
    "If \"Associate\" is a senior post-MBA position, score it low."
)

SKIP_STATUSES_FOR_SCORING = {"expired", "archived", "rejected"}


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


def notes_as_text(job):
    """Join note entries' text, newest first (notes are stored oldest-first)."""
    notes = job.get("notes") or []
    if not notes:
        return "(none)"
    return "\n".join(n["text"] for n in reversed(notes))


def load_api_key():
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        env_path = ROOT / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line.startswith("ANTHROPIC_API_KEY="):
                    key = line.split("=", 1)[1].strip()
    if not key:
        sys.exit("ERROR: ANTHROPIC_API_KEY must be set.")
    return key


# ============ Supabase REST (service-role key — server-side only) ============
def _load_env_fallback(*keys):
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
    -> the nested {"materials": {...}} shape this script uses internally,
    matching the original jobs.json format (where materials.resume/
    cover_letter held file paths — here they hold the actual markdown text
    instead, since there's no repo to write files into anymore)."""
    job = dict(row)
    job["materials"] = {
        "resume": job.pop("resume_md", None),
        "cover_letter": job.pop("cover_letter_md", None),
        "tailored_on": job.pop("tailored_on", None),
    }
    return job


def job_to_row(job):
    materials = job.get("materials") or {}
    row = {k: v for k, v in job.items() if k not in ("materials", "contacts")}
    row["resume_md"] = materials.get("resume")
    row["cover_letter_md"] = materials.get("cover_letter")
    row["tailored_on"] = materials.get("tailored_on")
    return row


def load_base_materials():
    """The base resume/background live in the singleton career_profile row
    (id=1) — seeded once from materials/base/*.md during the migration,
    editable later straight in Supabase. Never fabricated from anywhere
    else."""
    rows = supabase_select("career_profile", {"select": "resume_md,background_md", "id": "eq.1"})
    if not rows or not (rows[0].get("resume_md") or "").strip():
        sys.exit("ERROR: career_profile.resume_md is empty — seed it before running tailor.py.")
    resume = rows[0]["resume_md"].strip()
    background = (rows[0].get("background_md") or "").strip()
    return resume, background


# ── Pass 0: Scoring ───────────────────────────────────────────────────────────

def score_job(client, job):
    """Return fit_score integer 0–100, or None on parse failure."""
    lo, hi = job.get("salary_min"), job.get("salary_max")
    salary = "not listed"
    if lo or hi:
        fmt = lambda n: f"${round(n / 1000)}k"
        if lo and hi and round(lo) != round(hi):
            salary = f"{fmt(lo)}–{fmt(hi)}"
        else:
            salary = fmt(lo or hi)

    user_msg = (
        f"Title: {job.get('title', '')}\n"
        f"Company: {job.get('company', '')}\n"
        f"Location: {job.get('location', '')}\n"
        f"Salary: {salary}\n\n"
        f"Description:\n{job.get('description', '')}"
    )

    try:
        response = client.messages.create(
            model=SCORING_MODEL,
            max_tokens=50,
            system=SCORING_SYSTEM,
            messages=[{"role": "user", "content": user_msg}],
        )
        raw = response.content[0].text.strip()
        # Strip markdown code fences if model wraps output
        raw = re.sub(r"^```[a-z]*\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"\s*```$", "", raw, flags=re.MULTILINE)
        raw = raw.strip()
        data = json.loads(raw)
        return max(0, min(100, int(data["fit_score"])))
    except Exception:
        return None


# ── Pass 1: Tailoring ─────────────────────────────────────────────────────────

def jobs_to_tailor(jobs):
    return [
        j for j in jobs
        if j.get("starred") and not j.get("materials", {}).get("tailored_on")
    ][:MAX_PER_RUN]


def tailor_job(client, job, resume, background):
    base_content = f"# Master Resume\n\n{resume}"
    if background:
        base_content += f"\n\n# Additional Background\n\n{background}"

    system_prompt = (
        "You are an expert career coach helping a job seeker tailor their application materials. "
        "Your task is to produce two documents: a tailored resume and a cover letter.\n\n"
        "STRICT RULES:\n"
        "- Be 100% faithful to the master resume. Do NOT invent, embellish, or add any experience, "
        "  dates, credentials, or skills that are not already present.\n"
        "- Reorder, emphasize, and reframe existing content to best match the job description.\n"
        "- The cover letter should be professional, specific to the role, and under 400 words.\n"
        "- Output ONLY the two documents separated by the exact delimiter: ---COVER_LETTER---\n"
        "- Do not include any commentary or explanation outside the documents.\n\n"
        "Output format:\n"
        "[Tailored resume in Markdown]\n"
        "---COVER_LETTER---\n"
        "[Cover letter in Markdown]"
    )

    response = client.messages.create(
        model=TAILOR_MODEL,
        max_tokens=4096,
        system=system_prompt,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": base_content,
                    "cache_control": {"type": "ephemeral"},
                },
                {
                    "type": "text",
                    "text": (
                        f"Please tailor my application materials for this job:\n\n"
                        f"**Company:** {job.get('company', '')}\n"
                        f"**Title:** {job.get('title', '')}\n"
                        f"**Location:** {job.get('location', '')}\n\n"
                        f"**Job Description:**\n{job.get('description', '')}"
                    ),
                },
            ],
        }],
    )

    output = response.content[0].text
    delimiter = "---COVER_LETTER---"
    if delimiter in output:
        resume_out, cl_out = output.split(delimiter, 1)
    else:
        resume_out, cl_out = output, ""
    return resume_out.strip(), cl_out.strip()


# ── Pass 2: Summaries ─────────────────────────────────────────────────────────

def generate_summary(client, job):
    response = client.messages.create(
        model=SUMMARY_MODEL,
        max_tokens=120,
        messages=[{
            "role": "user",
            "content": (
                f"Summarize this job posting in 2-3 concise sentences for a job seeker scanning "
                f"a list. Focus on core responsibilities and what makes it distinctive. No fluff.\n\n"
                f"Title: {job.get('title', '')}\n"
                f"Company: {job.get('company', '')}\n\n"
                f"{job.get('description', '')}"
            ),
        }],
    )
    return response.content[0].text.strip()


# ── Pass 3: Insights ──────────────────────────────────────────────────────────

def generate_insights(client, job):
    prompt = (
        f"I am tracking a job application. Give me a single, specific next action I should take "
        f"(1-2 sentences, no fluff).\n\n"
        f"Company: {job.get('company', '')}\n"
        f"Title: {job.get('title', '')}\n"
        f"Status: {job.get('status', 'new')}\n"
        f"My notes: {notes_as_text(job)}\n"
        f"Materials ready: {'Yes' if job.get('materials', {}).get('tailored_on') else 'No'}"
    )
    response = client.messages.create(
        model=TAILOR_MODEL,
        max_tokens=150,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text.strip()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    key = load_api_key()
    resume, background = load_base_materials()
    client = anthropic.Anthropic(api_key=key)

    rows = supabase_select("career_jobs", {"select": "*"})
    job_map = {row["id"]: migrate_notes(row_to_job(row)) for row in rows}

    # ── Pass 0: Score unscored jobs ──────────────────────────────────────────
    score_targets = [
        j for j in job_map.values()
        if j.get("fit_score") is None
        and j.get("status") not in SKIP_STATUSES_FOR_SCORING
    ][:MAX_SCORES]

    if score_targets:
        print(f"Scoring {len(score_targets)} job(s)…")
        for job in score_targets:
            print(f"  → {job['company']} — {job['title']}")
            score = score_job(client, job)
            if score is not None:
                job_map[job["id"]]["fit_score"] = score
                print(f"    fit_score: {score}")
            else:
                print(f"    fit_score: parse failed (left null)")
    else:
        print("No unscored jobs.")

    # ── Pass 1: Tailor starred jobs ──────────────────────────────────────────
    targets = jobs_to_tailor(list(job_map.values()))
    if targets:
        print(f"\nTailoring {len(targets)} job(s)…")
        for job in targets:
            print(f"  → {job['company']} — {job['title']}")
            try:
                tailored_resume, cover_letter = tailor_job(client, job, resume, background)
            except Exception as e:
                print(f"    ERROR: {e}")
                continue

            job_map[job["id"]]["materials"] = {
                "resume": tailored_resume,
                "cover_letter": cover_letter,
                "tailored_on": date.today().isoformat(),
            }
            print(f"    Tailored materials saved to career_jobs.{job['id']}")
    else:
        print("\nNo starred, un-tailored jobs.")

    # ── Pass 2: Summaries ────────────────────────────────────────────────────
    summary_targets = [
        j for j in job_map.values()
        if not j.get("summary") and j.get("description")
    ][:MAX_SUMMARIES]

    if summary_targets:
        print(f"\nGenerating summaries for {len(summary_targets)} job(s)…")
        for job in summary_targets:
            print(f"  → {job['company']} — {job['title']}")
            try:
                job_map[job["id"]]["summary"] = generate_summary(client, job)
                print(f"    Done.")
            except Exception as e:
                print(f"    ERROR: {e}")

    # ── Pass 3: Insights ─────────────────────────────────────────────────────
    insights_targets = [
        j for j in job_map.values()
        if j.get("starred") and j.get("priority", 0) >= 2
        and j.get("status") not in ("applied", "rejected", "archived", "offer", "expired")
    ]
    if insights_targets:
        print(f"\nGenerating insights for {len(insights_targets)} high-priority job(s)…")
        for job in insights_targets:
            print(f"  → {job['company']} — {job['title']}")
            try:
                job_map[job["id"]]["insights"] = generate_insights(client, job)
                print(f"    Done.")
            except Exception as e:
                print(f"    ERROR: {e}")

    supabase_upsert("career_jobs", [job_to_row(j) for j in job_map.values()], on_conflict="id")
    print(f"\nDone.")


if __name__ == "__main__":
    main()
