import streamlit as st
from notes_generator import generate_notes

st.set_page_config(page_title="Meeting Notes Generator (Python)", page_icon="📝", layout="wide")
st.title("Meeting Notes Generator")
st.caption("Transcript to structured notes: attendees, action items with owners and due hints, decisions, open questions, topic map - fully offline.")

SAMPLE = """Alice: Thanks everyone for joining the weekly product sync. Today we need to cover the launch timeline and the onboarding metrics.
Bob: The landing page redesign is almost done. I will finish the hero section by Friday and send it for review.
Alice: Great. We decided to go with the navy theme for the whole app, it's settled.
Carol: Onboarding completion is at 62%, up from 55% last week. The new checklist seems to be working.
Bob: Can you review the analytics dashboard PR by Thursday, Carol?
Carol: Sure, I'll review it before end of week. Also, we need to schedule the user interviews for next week.
Alice: Agreed, let's go with five participants this round. What about the pricing page copy?
Bob: Still waiting on legal. I need to follow up with them tomorrow.
Carol: The mobile crash rate dropped to 0.8% after the hotfix we deployed on Monday.
Alice: Excellent work on that fix. Please prepare the release notes for version 2.4 by next Monday.
Bob: I'll draft the announcement email and schedule the social posts."""

text = st.text_area("Paste transcript (optional 'Name:' prefixes)", value=SAMPLE, height=260)
if st.button("Generate notes", type="primary"):
    try:
        r = generate_notes(text)
    except ValueError as e:
        st.error(str(e)); st.stop()
    c1, c2 = st.columns(2)
    c1.metric("Turns", r["turn_count"]); c2.metric("Attendees", len(r["attendees"]))
    st.write("**Attendees:**", ", ".join(r["attendees"]) or "not detected")
    st.subheader("Summary")
    st.write(r["summary"])
    st.subheader("Action items")
    if r["action_items"]:
        for a in r["action_items"]:
            st.write(f"- **{a['owner'] or 'Unassigned'}**: {a['task']}" + (f" *(due: {a['due']})*" if a["due"] else ""))
    else:
        st.write("None detected.")
    st.subheader("Decisions")
    for d in r["decisions"] or ["None detected."]:
        st.write("- " + d)
    if r["open_questions"]:
        st.subheader("Open questions")
        for q in r["open_questions"]:
            st.write("- " + q)
    if r["topics"]:
        st.subheader("Topic map")
        for t in r["topics"]:
            with st.expander(f"Part {t['slice']}: {', '.join(t['keywords'])}"):
                st.write(t["excerpt"] + "...")
