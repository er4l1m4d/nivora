"""AI question generation (Track A).

Runs server-side so the API key never reaches the client. Talks OpenAI-
compatible `POST {LLM_API_BASE}/chat/completions`. The client is injectable
(FakeLlm in tests) following the `create_chain_client` DI style from Phase 7.
"""

import json
import os
from typing import Any, Protocol

import httpx
from pydantic import BaseModel, Field

LLM_ENABLED = bool(os.getenv("LLM_API_KEY"))
LLM_API_BASE = os.getenv("LLM_API_BASE", "https://api.b.ai/v1").rstrip("/")
LLM_API_KEY = os.getenv("LLM_API_KEY")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen3.8-flash")
# Vercel Hobby caps functions at 10s; leave headroom for one retry.
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "8"))
LLM_MAX_CALLS = 2

SYSTEM_PROMPT = (
    "You write multiple-choice study questions from a student's own material. "
    "Rules: only facts present in the material; cloze ('____') where natural; "
    "exactly 4 plausible options, exactly one correct; distractors must be same-kind "
    "as the answer (dates with dates, terms with terms); one-sentence explanation "
    "citing the material. Output ONLY a JSON object "
    '{"questions":[{"text":"...","options":["a","b","c","d"],"correctIndex":0,'
    '"explanation":"..."}]} with no markdown fences.'
)


class GeneratedQuestion(BaseModel):
    text: str
    options: list[str]
    correctIndex: int = Field(alias="correctIndex")
    explanation: str


class LlmError(Exception):
    """Raised when generation fails after retries."""


class LlmClient(Protocol):
    async def generate(self, material: str, num_questions: int) -> list[GeneratedQuestion]:
        ...


def _validate(questions: Any, num_questions: int) -> list[GeneratedQuestion]:
    if not isinstance(questions, list) or len(questions) != num_questions:
        raise ValueError(f"expected {num_questions} questions, got {len(questions) if isinstance(questions, list) else 'non-list'}")
    out: list[GeneratedQuestion] = []
    for q in questions:
        if not isinstance(q, dict):
            raise ValueError("question is not an object")
        text = q.get("text")
        options = q.get("options")
        correct = q.get("correctIndex")
        explanation = q.get("explanation", "")
        if not isinstance(text, str) or not text.strip():
            raise ValueError("question text empty")
        if not isinstance(options, list) or len(options) != 4:
            raise ValueError("options must be exactly 4")
        if any(not isinstance(o, str) or not o.strip() for o in options):
            raise ValueError("option empty")
        if len(set(options)) != 4:
            raise ValueError("options not unique")
        if not isinstance(correct, int) or not (0 <= correct <= 3):
            raise ValueError("correctIndex out of range")
        if not isinstance(explanation, str):
            raise ValueError("explanation missing")
        out.append(
            GeneratedQuestion(
                text=text.strip(),
                options=[o.strip() for o in options],
                correctIndex=correct,
                explanation=explanation[:400],
            )
        )
    return out


class HttpLlmClient:
    def __init__(
        self,
        base: str = LLM_API_BASE,
        key: str | None = LLM_API_KEY,
        model: str = LLM_MODEL,
        timeout: float = LLM_TIMEOUT_SECONDS,
        client: httpx.AsyncClient | None = None,
    ):
        self.base = base
        self.key = key
        self.model = model
        self.timeout = timeout
        self._client = client

    async def _post(self, client: httpx.AsyncClient, messages: list[dict]) -> list[GeneratedQuestion]:
        resp = await client.post(
            f"{self.base}/chat/completions",
            headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"},
            json={
                "model": self.model,
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 90 * 20,
                "response_format": {"type": "json_object"},
            },
            timeout=self.timeout,
        )
        if resp.status_code >= 500:
            # Retryable: surfaced as ValueError so generate()'s retry loop catches it.
            raise ValueError(f"upstream {resp.status_code}")
        if resp.status_code >= 400:
            # Client error (bad request, auth) — no point retrying.
            raise LlmError(f"upstream {resp.status_code}")
        payload = resp.json()
        # b.ai returns standard choices[].message.content (a C2PA `_manifest` may
        # also be present on some models — ignore it).
        content = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not content:
            raise ValueError("empty content")
        parsed = json.loads(content)
        return _validate(parsed.get("questions", []), _expected_from_messages(messages))

    async def generate(self, material: str, num_questions: int) -> list[GeneratedQuestion]:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"{material}\n\nGenerate {num_questions} questions as JSON."},
        ]
        last_err: Exception | None = None
        async with (self._client or httpx.AsyncClient()) as client:
            for attempt in range(LLM_MAX_CALLS):
                try:
                    return await self._post(client, messages)
                except (httpx.HTTPError, ValueError, json.JSONDecodeError) as e:
                    last_err = e
                    if attempt == 0:
                        messages = list(messages) + [
                            {"role": "user", "content": f"Your previous output was invalid: {e}. Return ONLY the JSON object, no prose."}
                        ]
        raise LlmError(f"generation failed: {last_err}")


def _expected_from_messages(messages: list[dict]) -> int:
    # Recover the requested count from the user prompt for validation.
    import re

    for m in messages:
        if m.get("role") == "user":
            match = re.search(r"Generate (\d+) questions", m.get("content", ""))
            if match:
                return int(match.group(1))
    return 0


def create_llm_client() -> LlmClient | None:
    if not LLM_ENABLED:
        return None
    return HttpLlmClient()
