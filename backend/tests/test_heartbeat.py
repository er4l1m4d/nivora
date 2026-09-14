"""Track F: last_seen heartbeat (F.1) + answeredQuestionIds resume support (F.2)."""
from datetime import datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.asyncio


async def mk_user(client, name):
    r = await client.post("/api/users", json={"displayName": name})
    assert r.status_code == 201, r.text
    return r.json()


async def mk_quiz(client, creator_id, *, starts_in_s=60, min_participants=3, entry=100, duration=300):
    body = {
        "creatorId": creator_id,
        "title": "Heartbeat Quiz",
        "currency": "NIM",
        "entryAmount": entry,
        "durationSeconds": duration,
        "minParticipants": min_participants,
        "startsAt": (datetime.now(timezone.utc) + timedelta(seconds=starts_in_s)).isoformat(),
    }
    r = await client.post("/api/quizzes", json=body)
    assert r.status_code == 201, r.text
    return r.json()["quizId"]


async def add_question(client, quiz_id, position, correct="C"):
    r = await client.post(f"/api/quizzes/{quiz_id}/questions", json={
        "position": position,
        "questionText": f"Q{position}?",
        "optionA": "A", "optionB": "B", "optionC": "C", "optionD": "D",
        "correctOption": correct, "explanation": "x",
    })
    assert r.status_code == 201, r.text
    return r.json()["questionId"]


async def test_heartbeat_stamps_last_seen_and_tracks_answers(client):
    creator = await mk_user(client, "Ada")
    p = await mk_user(client, "Bode")

    quiz_id = await mk_quiz(client, creator["id"])
    await add_question(client, quiz_id, 1, correct="C")
    await add_question(client, quiz_id, 2, correct="A")

    assert (await client.post(f"/api/quizzes/{quiz_id}/publish")).status_code == 200
    assert (await client.post(f"/api/quizzes/{quiz_id}/open")).status_code == 200

    r = await client.post(f"/api/quizzes/{quiz_id}/join", json={"userId": p["id"]})
    assert r.status_code == 200
    participant_id = r.json()["participantId"]

    assert (await client.post(f"/api/quizzes/{quiz_id}/start")).status_code == 200

    # before polling, lastSeenAt is null
    r = await client.get(f"/api/quizzes/{quiz_id}/participants")
    me = next(x for x in r.json() if x["userId"] == p["id"])
    assert me["lastSeenAt"] is None

    # polling /state as the participant stamps last_seen_at (F.1)
    r = await client.get(f"/api/quizzes/{quiz_id}/state", params={"user_id": p["id"]})
    assert r.status_code == 200
    body = r.json()
    assert body["answeredQuestionIds"] == []

    r = await client.get(f"/api/quizzes/{quiz_id}/participants")
    me = next(x for x in r.json() if x["userId"] == p["id"])
    assert me["lastSeenAt"] is not None

    # answering one question is reflected in answeredQuestionIds (F.2)
    r = await client.get(f"/api/quizzes/{quiz_id}/questions", params={"user_id": p["id"]})
    qid = r.json()[0]["id"]
    r = await client.post(f"/api/quizzes/{quiz_id}/answers", json={
        "participantId": participant_id, "questionId": qid, "selectedOption": "C",
    })
    assert r.status_code == 200

    r = await client.get(f"/api/quizzes/{quiz_id}/state", params={"user_id": p["id"]})
    assert qid in r.json()["answeredQuestionIds"]
