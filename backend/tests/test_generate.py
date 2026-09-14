import json

import pytest
from backend.app import main as main_module
from backend.app.llm import GeneratedQuestion, HttpLlmClient, LlmError


# ---------------- endpoint-level tests (llm injected into app.state) ----------------


class FakeLlm:
    def __init__(self, mode: str = "ok"):
        self.mode = mode

    async def generate(self, material: str, num_questions: int) -> list[GeneratedQuestion]:
        if self.mode == "raise":
            raise LlmError("boom")
        return [
            GeneratedQuestion(
                text=f"Q{i} blank ____ here.",
                options=["a", "b", "c", "d"],
                correctIndex=0,
                explanation="From the material.",
            )
            for i in range(num_questions)
        ]


@pytest.fixture()
async def llm_client(client):
    main_module.app.state.llm = None
    yield client
    main_module.app.state.llm = None


async def test_generate_happy(llm_client):
    main_module.app.state.llm = FakeLlm("ok")
    r = await llm_client.post(
        "/api/generate",
        json={"material": "Enough study material. " * 40, "numQuestions": 5},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "ai"
    assert len(body["questions"]) == 5
    assert body["questions"][0]["options"] == ["a", "b", "c", "d"]


async def test_generate_short_material_is_400(llm_client):
    main_module.app.state.llm = FakeLlm("ok")
    r = await llm_client.post(
        "/api/generate", json={"material": "too short", "numQuestions": 5}
    )
    assert r.status_code == 400


async def test_generate_oversized_material_is_400(llm_client):
    main_module.app.state.llm = FakeLlm("ok")
    r = await llm_client.post(
        "/api/generate", json={"material": "x" * 40001, "numQuestions": 5}
    )
    assert r.status_code == 400


async def test_generate_disabled_is_503(llm_client):
    main_module.app.state.llm = None
    r = await llm_client.post(
        "/api/generate",
        json={"material": "Enough study material. " * 40, "numQuestions": 5},
    )
    assert r.status_code == 503


async def test_generate_llm_error_is_503(llm_client):
    main_module.app.state.llm = FakeLlm("raise")
    r = await llm_client.post(
        "/api/generate",
        json={"material": "Enough study material. " * 40, "numQuestions": 5},
    )
    assert r.status_code == 503


# ---------------- HttpLlmClient unit tests (retry / validation) ----------------


class FakeResp:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"status {self.status_code}")

    def json(self):
        return self._payload


class FakeHttp:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0

    async def post(self, *args, **kwargs):
        r = self.responses[self.calls]
        self.calls += 1
        return r

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


def _ok_payload(questions: list[dict]) -> dict:
    return {"choices": [{"message": {"content": json.dumps({"questions": questions})}}]}


def _q(i: int) -> dict:
    return {
        "text": f"Q{i} ____ here.",
        "options": ["a", "b", "c", "d"],
        "correctIndex": 0,
        "explanation": "x",
    }


async def test_client_happy():
    http = FakeHttp([FakeResp(200, _ok_payload([_q(1), _q(2)]))])
    client = HttpLlmClient(client=http, key="k", timeout=5)
    out = await client.generate("material", 2)
    assert len(out) == 2
    assert http.calls == 1


async def test_client_retries_on_500_then_succeeds():
    http = FakeHttp([FakeResp(500, {}), FakeResp(200, _ok_payload([_q(1)]))])
    client = HttpLlmClient(client=http, key="k", timeout=5)
    out = await client.generate("material", 1)
    assert len(out) == 1
    assert http.calls == 2


async def test_client_retries_on_invalid_json_then_succeeds():
    bad = FakeResp(200, {"choices": [{"message": {"content": "not json"}}]})
    good = FakeResp(200, _ok_payload([_q(1)]))
    http = FakeHttp([bad, good])
    client = HttpLlmClient(client=http, key="k", timeout=5)
    out = await client.generate("material", 1)
    assert len(out) == 1
    assert http.calls == 2


async def test_client_always_invalid_raises():
    bad = FakeResp(200, {"choices": [{"message": {"content": "not json"}}]})
    http = FakeHttp([bad, bad])
    client = HttpLlmClient(client=http, key="k", timeout=5)
    with pytest.raises(LlmError):
        await client.generate("material", 1)
