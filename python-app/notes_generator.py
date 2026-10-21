"""Meeting notes generation logic - no UI imports.

Parses raw transcripts (with or without "Speaker:" prefixes) into:
attendees, action items with owners and due hints, decisions, open questions,
topic segments (TF-IDF keyword labelling per time slice) and a short
extractive summary. Fully offline heuristics + scikit-learn.
"""
from __future__ import annotations
import re

RE_SPEAKER = re.compile(r"^\s*([A-Z][A-Za-z .'-]{1,30}?)\s*:\s+(.+)$")
RE_ACTION = re.compile(r"\b(?:action item|to-?do|I'?ll|I will|we'?ll|we will|will you|can you|could you|please|need(?:s)? to|should|must|follow up|send|prepare|draft|schedule|arrange|set up|create|update|fix|review|finish|deliver|ship|deploy|email|call|book)\b", re.I)
RE_DECISION = re.compile(r"\b(?:decided|decision|agreed|we'?ll go with|let'?s go with|final(?:ized|ised)?|confirmed|approved|sign(ed)? off|conclusion is|it'?s settled|locked in)\b", re.I)
RE_QUESTION = re.compile(r"\?\s*$")
RE_DUE = re.compile(r"\b(?:by|before|until|on)\s+((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|(?:next|this)\s+\w+|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|tomorrow|(?:end of|end-of-)(?:day|week|month)|EOD|EOW)\b", re.I)
RE_OWNER = re.compile(r"^([A-Z][a-z]+)\s+(?:will|to|should|needs to|can you)\b")


def parse_lines(text: str) -> list[dict]:
    """Split transcript into {speaker, text} turns."""
    turns = []
    for raw in text.split("\n"):
        raw = raw.strip()
        if not raw:
            continue
        m = RE_SPEAKER.match(raw)
        if m and not raw.lower().startswith(("http", "note:")):
            turns.append({"speaker": m.group(1).strip(), "text": m.group(2).strip()})
        elif turns:
            turns[-1]["text"] += " " + raw
        else:
            turns.append({"speaker": None, "text": raw})
    return [t for t in turns if len(t["text"]) > 2]


def extract_actions(turns: list[dict]) -> list[dict]:
    actions = []
    for t in turns:
        for sent in re.split(r"(?<=[.!?])\s+", t["text"]):
            sent = sent.strip()
            if len(sent.split()) < 3 or not RE_ACTION.search(sent):
                continue
            owner = None
            m = RE_OWNER.match(sent)
            if m:
                owner = m.group(1)
            elif re.search(r"\bI'?ll\b|\bI will\b", sent, re.I):
                owner = t["speaker"]
            elif t["speaker"] and RE_ACTION.search(sent):
                owner = t["speaker"]
            due = None
            d = RE_DUE.search(sent)
            if d:
                due = d.group(0)
            actions.append({"owner": owner, "task": sent, "due": due})
    # dedupe near-identical tasks
    seen, out = set(), []
    for a in actions:
        key = re.sub(r"\W+", "", a["task"].lower())[:60]
        if key in seen:
            continue
        seen.add(key)
        out.append(a)
    return out


def extract_decisions(turns: list[dict]) -> list[str]:
    out = []
    for t in turns:
        for sent in re.split(r"(?<=[.!?])\s+", t["text"]):
            if RE_DECISION.search(sent) and len(sent.split()) >= 4:
                out.append(sent.strip())
    seen, res = set(), []
    for d in out:
        k = re.sub(r"\W+", "", d.lower())[:60]
        if k not in seen:
            seen.add(k)
            res.append(d)
    return res


def extract_questions(turns: list[dict]) -> list[str]:
    out = []
    for t in turns:
        for sent in re.split(r"(?<=[.!?])\s+(?=[A-Z])", t["text"]):
            s = sent.strip()
            if RE_QUESTION.search(s):
                out.append(s)
    return out[:12]


def attendees(turns: list[dict]) -> list[str]:
    seen, out = set(), []
    for t in turns:
        s = t["speaker"]
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    return out


def topics(turns: list[dict], n_slices: int = 3) -> list[dict]:
    """Split the meeting into time slices and label each with TF-IDF keywords."""
    text = " ".join(t["text"] for t in turns)
    words = text.split()
    if len(words) < 40 or len(turns) < 2:
        return []
    slices = []
    per = max(1, len(turns) // n_slices)
    for i in range(0, len(turns), per):
        chunk = " ".join(t["text"] for t in turns[i:i + per])
        slices.append(chunk)
    if len(slices) < 2:
        return []
    from sklearn.feature_extraction.text import TfidfVectorizer
    vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), max_features=1000, sublinear_tf=True)
    X = vec.fit_transform([s.lower() for s in slices])
    terms = vec.get_feature_names_out()
    out = []
    for i, s in enumerate(slices):
        row = X[i].toarray()[0]
        top = row.argsort()[::-1][:3]
        kws = [terms[j] for j in top if row[j] > 0]
        if kws:
            out.append({"slice": i + 1, "keywords": kws, "excerpt": s[:160]})
    return out


def quick_summary(turns: list[dict], n: int = 3) -> str:
    """Pick the most informative sentences: decision/action heavy, mid-length."""
    sents = []
    for t in turns:
        for s in re.split(r"(?<=[.!?])\s+", t["text"]):
            s = s.strip()
            if 8 <= len(s.split()) <= 40:
                score = 0
                if RE_DECISION.search(s):
                    score += 3
                if RE_ACTION.search(s):
                    score += 2
                score += min(len(set(s.lower().split())) / 10, 2)
                sents.append((score, s))
    sents.sort(key=lambda x: -x[0])
    seen, out = set(), []
    for _, s in sents:
        k = re.sub(r"\W+", "", s.lower())[:50]
        if k in seen:
            continue
        seen.add(k)
        out.append(s)
        if len(out) >= n:
            break
    return " ".join(out)


def generate_notes(text: str) -> dict:
    text = text.strip()
    if len(text) < 80:
        raise ValueError("Transcript too short (need at least ~80 characters).")
    turns = parse_lines(text)
    if not turns:
        raise ValueError("Could not parse any transcript lines.")
    return {
        "attendees": attendees(turns),
        "turn_count": len(turns),
        "summary": quick_summary(turns),
        "action_items": extract_actions(turns),
        "decisions": extract_decisions(turns),
        "open_questions": extract_questions(turns),
        "topics": topics(turns),
    }
