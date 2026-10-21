import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from notes_generator import generate_notes, parse_lines

TRANSCRIPT = """
Alice: Thanks everyone for joining the weekly product sync. Today we need to cover the launch timeline and the onboarding metrics.
Bob: The landing page redesign is almost done. I will finish the hero section by Friday and send it for review.
Alice: Great. We decided to go with the navy theme for the whole app, it's settled.
Carol: Onboarding completion is at 62%, up from 55% last week. The new checklist seems to be working.
Bob: Can you review the analytics dashboard PR by Thursday, Carol?
Carol: Sure, I'll review it before end of week. Also, we need to schedule the user interviews for next week.
Alice: Agreed, let's go with five participants this round. What about the pricing page copy?
Bob: Still waiting on legal. I need to follow up with them tomorrow.
Carol: The mobile crash rate dropped to 0.8% after the hotfix we deployed on Monday.
Alice: Excellent work on that fix. Please prepare the release notes for version 2.4 by next Monday.
Bob: I'll draft the announcement email and schedule the social posts.
Alice: Any other concerns before we wrap up?
Carol: None from my side. The metrics dashboard looks healthy overall.
"""

def test_attendees():
    r = generate_notes(TRANSCRIPT)
    assert r["attendees"] == ["Alice", "Bob", "Carol"]

def test_actions_with_owners():
    r = generate_notes(TRANSCRIPT)
    tasks = " ".join(a["task"] for a in r["action_items"]).lower()
    assert "hero section" in tasks
    owners = [a["owner"] for a in r["action_items"]]
    assert "Bob" in owners, r["action_items"]
    assert "Carol" in owners
    dues = [a["due"] for a in r["action_items"] if a["due"]]
    assert any("Friday" in d or "Thursday" in d or "Monday" in d for d in dues), dues

def test_decisions():
    r = generate_notes(TRANSCRIPT)
    dec = " ".join(r["decisions"]).lower()
    assert "navy theme" in dec
    assert any("five participants" in d for d in r["decisions"])

def test_questions():
    r = generate_notes(TRANSCRIPT)
    assert any("pricing page" in q for q in r["open_questions"])

def test_topics_and_summary():
    r = generate_notes(TRANSCRIPT)
    assert r["summary"]
    assert len(r["topics"]) >= 2
    kws = " ".join(k for t in r["topics"] for k in t["keywords"])
    assert len(kws) > 0

def test_short_rejected():
    try:
        generate_notes("Hi: bye")
        assert False
    except ValueError:
        pass

def test_parse_multiline():
    turns = parse_lines("Alice: first part of the sentence\ncontinues here on next line\nBob: reply text here")
    assert turns[0]["text"].endswith("next line")
    assert turns[1]["speaker"] == "Bob"

if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"PASS {fn.__name__}")
    print(f"All {len(fns)} tests passed.")
