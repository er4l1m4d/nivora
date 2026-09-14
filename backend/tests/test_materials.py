import os

from backend.app import main as main_module

HERE = os.path.dirname(__file__)
FIX = os.path.join(HERE, "fixtures")


async def test_upload_pdf_success(client):
    with open(os.path.join(FIX, "sample.pdf"), "rb") as f:
        data = f.read()
    r = await client.post(
        "/api/materials",
        files={"file": ("sample.pdf", data, "application/pdf")},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["pages"] == 2
    assert "mitochondrion" in body["text"]
    assert body["chars"] == len(body["text"])


async def test_upload_rejects_non_pdf(client):
    r = await client.post(
        "/api/materials",
        files={"file": ("notes.txt", b"just text", "text/plain")},
    )
    assert r.status_code == 400


async def test_upload_oversized_is_413(client):
    big = b"%" * (5 * 1024 * 1024 + 1)
    r = await client.post(
        "/api/materials",
        files={"file": ("big.pdf", big, "application/pdf")},
    )
    assert r.status_code == 413


async def test_upload_scanned_is_422(client):
    with open(os.path.join(FIX, "scanned.pdf"), "rb") as f:
        data = f.read()
    r = await client.post(
        "/api/materials",
        files={"file": ("scanned.pdf", data, "application/pdf")},
    )
    assert r.status_code == 422
