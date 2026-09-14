from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
from uuid import UUID

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, status, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .chain import create_chain_client, escrow_address, payments_mode, rpc_url
from .db import get_db, init_db
from .llm import create_llm_client, LlmError
from .models import Answer, Participant, Question, Quiz, Transaction, User
from .schemas import (
    AnswerRequest,
    CreateQuestionRequest,
    CreateQuizRequest,
    CreateUserRequest,
    GenerateRequest,
    GenerateResponse,
    JoinRequest,
    VerifyCommitmentRequest,
    WalletLinkRequest,
    SettlementCompleteRequest,
)
from .services import (
    DomainError,
    add_participant,
    as_aware,
    compute_payouts,
    log_event,
    maybe_advance,
    quiz_deadline,
    submit_answer,
    transition_quiz,
    utcnow,
    verify_commitment,
)
import os


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    app.state.chain = create_chain_client()
    app.state.llm = create_llm_client()
    yield


app = FastAPI(title="Qestia Core API", version="0.3.0", lifespan=lifespan)

# CORS — the Vercel frontend is a different origin from this API.
# CORS_ORIGINS is a comma-separated allowlist (e.g. the Vercel URL + Nimiq origins).
_raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173")
allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "x-settlement-token"],
)


def chain_for(request: Request):
    chain = getattr(request.app.state, "chain", None)
    return chain if chain is not None else create_chain_client()


def settlement_token_ok(request: Request) -> bool:
    expected = os.getenv("SETTLEMENT_TOKEN", "dev-settlement-token")
    return request.headers.get("x-settlement-token") == expected


@app.get("/health")
@app.get("/api/health")
async def health():
    return {"ok": True}


@app.get("/api/config")
async def get_config():
    return {
        "paymentsMode": payments_mode(),
        "escrowAddress": escrow_address(),
        "minParticipantsDefault": 3,
    }


@app.post("/api/generate", response_model=GenerateResponse)
async def generate_questions(
    req: GenerateRequest, request: Request
):
    """AI-drafted questions from pasted/uploaded material (Track A).

    Returns {"source": "ai", ...} on success. 503s fast (and the frontend
    falls back to the local generator) when the LLM is disabled or fails.
    """
    llm = getattr(request.app.state, "llm", None)
    if llm is None:
        raise HTTPException(
            status_code=503,
            detail="Generation failed — try the basic generator.",
        )
    if len(req.material) < 200 or len(req.material) > 40000:
        raise HTTPException(status_code=400, detail="Material must be 200–40000 characters.")
    try:
        questions = await llm.generate(req.material, req.num_questions)
    except LlmError as exc:
        raise HTTPException(
            status_code=503,
            detail="Generation failed — try the basic generator.",
        ) from exc
    return GenerateResponse(
        source="ai",
        questions=[
            {
                "text": q.text,
                "options": q.options,
                "correctIndex": q.correctIndex,
                "explanation": q.explanation,
            }
            for q in questions
        ],
    )


# Max PDF size accepted for text extraction (Track B).
MAX_MATERIAL_BYTES = 5 * 1024 * 1024
MAX_EXTRACTED_CHARS = 40_000


@app.post("/api/materials")
async def upload_material(file: UploadFile = File(...)):
    """Server-side PDF text extraction (Track B). Returns extracted text that
    lands in the same paste area; the AI path consumes it identically."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .pdf files are supported.")
    data = await file.read()
    if len(data) > MAX_MATERIAL_BYTES:
        raise HTTPException(status_code=413, detail="File too large — max 5 MB.")
    try:
        reader = PdfReader(BytesIO(data))
        pages = [p.extract_text() or "" for p in reader.pages]
    except Exception:
        raise HTTPException(
            status_code=422,
            detail="Could not read the PDF — it may be encrypted or corrupt.",
        )
    text = "\n".join(pages)
    if not text.strip():
        raise HTTPException(
            status_code=422,
            detail="No selectable text — looks scanned. Paste the text instead.",
        )
    truncated = len(text) > MAX_EXTRACTED_CHARS
    text = text[:MAX_EXTRACTED_CHARS]
    return {"text": text, "pages": len(pages), "chars": len(text), "truncated": truncated}


# ---------- users ----------


@app.post("/api/users", status_code=status.HTTP_201_CREATED)
async def create_user(req: CreateUserRequest, db: AsyncSession = Depends(get_db)):
    user = User(display_name=req.display_name, wallet_address=req.wallet_address)
    db.add(user)
    try:
        await db.commit()
        await db.refresh(user)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(409, "User could not be created") from exc
    return {"id": str(user.id), "displayName": user.display_name, "walletAddress": user.wallet_address}


@app.post("/api/users/{user_id}/wallet")
async def link_wallet(user_id: UUID, req: WalletLinkRequest, db: AsyncSession = Depends(get_db)):
    """Links the wallet chosen in Nimiq Pay (mini-app SDK listAccounts).
    Real ownership proof happens on-chain: commitment verification requires
    the payment to be sent FROM this address."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.wallet_address = req.wallet_address.strip()
    if req.device_id:
        user.device_id = req.device_id.strip()
    await db.commit()
    return {"id": str(user.id), "walletAddress": user.wallet_address, "deviceId": user.device_id}


@app.get("/api/users/{user_id}/history")
async def user_history(user_id: UUID, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    entries = []
    rows = await db.execute(
        select(Participant, Quiz).join(Quiz, Participant.quiz_id == Quiz.id).where(Participant.user_id == user_id)
    )
    for participant, quiz in rows.all():
        if quiz.status not in ("VALIDATING", "FINALIZED", "SETTLED"):
            continue
        participants = (await db.execute(
            select(Participant).where(Participant.quiz_id == quiz.id)
        )).scalars().all()
        payout_rows, _ = compute_payouts(participants, quiz.question_count, quiz.entry_amount)
        mine = next((r for r in payout_rows if r["participant_id"] == participant.id), None)
        entries.append({
            "quizId": str(quiz.id),
            "title": quiz.title,
            "status": quiz.status,
            "rank": mine["rank"] if mine and mine["payout_kind"] != "refund" else None,
            "correctAnswers": participant.correct_answers,
            "questionCount": quiz.question_count,
            "payout": float(mine["payout"]) if mine else 0.0,
            "entryAmount": float(quiz.entry_amount),
            "payoutKind": mine["payout_kind"] if mine else "none",
        })
    return entries


# ---------- quizzes ----------


@app.post("/api/quizzes", status_code=status.HTTP_201_CREATED)
async def create_quiz(req: CreateQuizRequest, db: AsyncSession = Depends(get_db)):
    creator = await db.get(User, req.creator_id)
    if not creator:
        raise HTTPException(404, "Creator not found")
    quiz = Quiz(
        creator_id=creator.id,
        title=req.title,
        description=req.description,
        status="DRAFT",
        currency=req.currency,
        entry_amount=req.entry_amount,
        duration_seconds=req.duration_seconds,
        question_count=0,
        min_participants=req.min_participants,
        starts_at=req.starts_at,
        result_version=0,
    )
    db.add(quiz)
    await db.commit()
    await db.refresh(quiz)
    return {"quizId": str(quiz.id), "status": quiz.status}


@app.post("/api/quizzes/{quiz_id}/questions", status_code=status.HTTP_201_CREATED)
async def add_question(quiz_id: UUID, req: CreateQuestionRequest, db: AsyncSession = Depends(get_db)):
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(404, "Qest not found")
    if quiz.status not in {"DRAFT", "PUBLISHED", "OPEN"}:
        raise HTTPException(409, "Questions cannot be changed in this Qest state")
    q = Question(
        quiz_id=quiz.id,
        position=req.position,
        question_text=req.question_text,
        option_a=req.option_a,
        option_b=req.option_b,
        option_c=req.option_c,
        option_d=req.option_d,
        correct_option=req.correct_option,
        explanation=req.explanation,
        status="ACTIVE",
    )
    db.add(q)
    quiz.question_count = quiz.question_count + 1
    await db.commit()
    await db.refresh(q)
    return {"questionId": str(q.id), "position": q.position}


async def quiz_participant_count(db: AsyncSession, quiz_id: UUID) -> int:
    result = await db.execute(select(func.count(Participant.id)).where(Participant.quiz_id == quiz_id))
    return result.scalar_one()


def quiz_json(quiz: Quiz, participant_count: int) -> dict:
    return {
        "id": str(quiz.id),
        "title": quiz.title,
        "description": quiz.description,
        "status": quiz.status,
        "currency": quiz.currency,
        "entryAmount": str(quiz.entry_amount),
        "durationSeconds": quiz.duration_seconds,
        "questionCount": quiz.question_count,
        "minParticipants": quiz.min_participants,
        "participantCount": participant_count,
        "startsAt": as_aware(quiz.starts_at).isoformat() if quiz.starts_at else None,
        "creatorId": str(quiz.creator_id),
    }


STATUS_WEIGHT = {
    "OPEN": 0,
    "LIVE": 1,
    "ENDED": 2,
    "VALIDATING": 2,
    "FINALIZED": 2,
    "SETTLED": 3,
}


@app.get("/api/quizzes")
async def list_quizzes(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
):
    quizzes = (await db.execute(select(Quiz))).scalars().all()

    # Only advance quizzes that can actually transition. Previously this looped
    # over every quiz and ran a participant query each — O(N) round-trips in a
    # single serverless invocation. Now we skip terminal/static states, defer
    # OPEN quizzes whose start window hasn't passed, and load all candidate
    # participants in ONE query instead of N.
    ADVANCE_STATES = {"OPEN", "LIVE", "ENDED", "VALIDATING", "FINALIZED", "CANCELLED", "REFUNDING"}
    now = utcnow()
    candidate_ids = [
        q.id for q in quizzes
        if q.status in ADVANCE_STATES
        and (q.status != "OPEN" or (as_aware(q.starts_at) is not None and now >= as_aware(q.starts_at)))
    ]
    if candidate_ids:
        rows = await db.execute(select(Participant).where(Participant.quiz_id.in_(candidate_ids)))
        by_quiz: dict[UUID, list[Participant]] = {}
        for p in rows.scalars().all():
            by_quiz.setdefault(p.quiz_id, []).append(p)
        for q in quizzes:
            if q.id in by_quiz:
                await maybe_advance(db, q, by_quiz[q.id])

    # re-read after possible transitions
    quizzes = (await db.execute(select(Quiz))).scalars().all()

    visible = [q for q in quizzes if q.status not in ("DRAFT", "PUBLISHED")]
    if status_filter:
        visible = [q for q in visible if q.status == status_filter]

    counts: dict[UUID, int] = {}
    rows = await db.execute(
        select(Participant.quiz_id, func.count(Participant.id)).group_by(Participant.quiz_id)
    )
    for quiz_id, count in rows.all():
        counts[quiz_id] = count

    visible.sort(key=lambda q: (
        STATUS_WEIGHT.get(q.status, 4),
        as_aware(q.starts_at).timestamp() if q.starts_at else float("inf"),
    ))
    return [quiz_json(q, counts.get(q.id, 0)) for q in visible[:limit]]


@app.get("/api/quizzes/{quiz_id}")
async def get_quiz(quiz_id: UUID, db: AsyncSession = Depends(get_db)):
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(404, "Qest not found")
    await maybe_advance(db, quiz)
    await db.refresh(quiz)
    return quiz_json(quiz, await quiz_participant_count(db, quiz.id))


@app.post("/api/quizzes/{quiz_id}/publish")
async def publish_quiz(quiz_id: UUID, db: AsyncSession = Depends(get_db)):
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(404, "Qest not found")
    if quiz.status != "DRAFT":
        raise HTTPException(409, "Qest is not a draft")
    if quiz.question_count == 0:
        raise HTTPException(400, "Qest must contain at least one question")
    try:
        await transition_quiz(db, quiz, "PUBLISHED")
        quiz.published_at = utcnow()
        await db.commit()
    except DomainError as exc:
        await db.rollback()
        raise HTTPException(409, str(exc)) from exc

    # The creator plays blind, but is always a participant (min includes creator)
    creator = await db.get(User, quiz.creator_id)
    if creator:
        await add_participant(db, quiz, creator.id)
        await db.commit()
    return {"quizId": str(quiz.id), "status": quiz.status}


@app.post("/api/quizzes/{quiz_id}/open")
async def open_quiz(quiz_id: UUID, db: AsyncSession = Depends(get_db)):
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(404, "Qest not found")
    try:
        await transition_quiz(db, quiz, "OPEN")
        await db.commit()
    except DomainError as exc:
        await db.rollback()
        raise HTTPException(409, str(exc)) from exc
    return {"quizId": str(quiz.id), "status": quiz.status}


@app.post("/api/quizzes/{quiz_id}/start")
async def start_quiz(quiz_id: UUID, db: AsyncSession = Depends(get_db)):
    """Creator-triggered early start. Otherwise the room goes LIVE automatically
    at starts_at once quorum is met."""
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(404, "Qest not found")
    if quiz.status not in ("PUBLISHED", "OPEN"):
        raise HTTPException(409, f"Qest cannot start from status {quiz.status}")
    try:
        await transition_quiz(db, quiz, "LIVE")
        participants = (await db.execute(
            select(Participant).where(Participant.quiz_id == quiz.id)
        )).scalars().all()
        for p in participants:
            if p.status == "JOINED":
                p.status = "ACTIVE"
        await log_event(db, quiz.id, "QUIZ_LIVE")
        await db.commit()
    except DomainError as exc:
        await db.rollback()
        raise HTTPException(409, str(exc)) from exc
    return {"quizId": str(quiz.id), "status": quiz.status, "startedAt": as_aware(quiz.started_at).isoformat() if quiz.started_at else None}


@app.post("/api/quizzes/{quiz_id}/join")
async def join_quiz(quiz_id: UUID, req: JoinRequest, db: AsyncSession = Depends(get_db)):
    quiz = await db.get(Quiz, quiz_id)
    user = await db.get(User, req.user_id)
    if not quiz or not user:
        raise HTTPException(404, "Qest or user not found")
    if quiz.status != "OPEN":
        raise HTTPException(409, f"Qest is not open for commitments (status: {quiz.status})")
    participant = await add_participant(db, quiz, user.id)
    await db.commit()
    return {
        "participantId": str(participant.id),
        "status": participant.status,
        "paymentsMode": payments_mode(),
        "memoCode": participant.memo_code,
        "escrowAddress": escrow_address(),
        "entryAmount": float(quiz.entry_amount),
    }


@app.post("/api/quizzes/{quiz_id}/commitments/verify")
async def verify_quiz_commitment(
    quiz_id: UUID,
    req: VerifyCommitmentRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    quiz = await db.get(Quiz, quiz_id)
    participant = await db.get(Participant, req.participant_id)
    if not quiz or not participant or participant.quiz_id != quiz.id:
        raise HTTPException(404, "Qest or participant not found")
    user = await db.get(User, participant.user_id)
    ok, detail = await verify_commitment(
        db, quiz, participant, req.tx_ref, chain_for(request),
        user.wallet_address if user else None,
    )
    await db.commit()
    return {
        "verified": ok,
        "status": participant.status,
        "detail": detail,
        "memoCode": participant.memo_code,
    }


@app.get("/api/quizzes/{quiz_id}/commitments/{participant_id}")
async def commitment_status(quiz_id: UUID, participant_id: UUID, db: AsyncSession = Depends(get_db)):
    participant = await db.get(Participant, participant_id)
    if not participant or participant.quiz_id != quiz_id:
        raise HTTPException(404, "Participant not found")
    quiz = await db.get(Quiz, quiz_id)
    tx = (await db.execute(
        select(Transaction).where(
            Transaction.quiz_id == quiz_id,
            Transaction.user_id == participant.user_id,
            Transaction.type.in_(("ENTRY_COMMITMENT", "CREATOR_COMMITMENT")),
        ).order_by(Transaction.created_at.desc())
    )).scalars().first()
    return {
        "participantId": str(participant.id),
        "status": participant.status,
        "memoCode": participant.memo_code,
        "escrowAddress": escrow_address(),
        "entryAmount": float(quiz.entry_amount) if quiz else None,
        "txHash": tx.blockchain_tx_hash if tx else None,
    }


@app.post("/api/quizzes/{quiz_id}/demo-start")
async def demo_start(quiz_id: UUID, user_id: UUID, db: AsyncSession = Depends(get_db)):
    """Legacy non-financial join (kept for the original demo sequence)."""
    quiz = await db.get(Quiz, quiz_id)
    user = await db.get(User, user_id)
    if not quiz or not user:
        raise HTTPException(404, "Qest or user not found")
    if quiz.status not in {"PUBLISHED", "OPEN", "LIVE"}:
        raise HTTPException(409, "Qest is not available")
    participant = await add_participant(db, quiz, user.id)
    if quiz.status == "LIVE" and participant.status == "JOINED":
        participant.status = "ACTIVE"
    await db.commit()
    return {"participantId": str(participant.id), "status": participant.status}


@app.get("/api/quizzes/{quiz_id}/participants")
async def get_participants(quiz_id: UUID, db: AsyncSession = Depends(get_db)):
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(404, "Qest not found")
    rows = await db.execute(
        select(Participant, User).join(User, Participant.user_id == User.id).where(Participant.quiz_id == quiz.id)
    )
    return [
        {
            "id": str(p.id),
            "quizId": str(p.quiz_id),
            "userId": str(p.user_id),
            "displayName": u.display_name,
            "status": p.status,
            "disconnectCount": p.disconnect_count,
            "correctAnswers": p.correct_answers,
            "scorePercentage": float(p.score_percentage) if p.score_percentage is not None else None,
            "rank": p.rank,
            "entryAmount": float(quiz.entry_amount),
        }
        for p, u in rows.all()
    ]


@app.get("/api/quizzes/{quiz_id}/state")
async def quiz_state(quiz_id: UUID, user_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(404, "Qest not found")
    await maybe_advance(db, quiz)
    await db.refresh(quiz)

    deadline = quiz_deadline(quiz)
    participant_status = None
    if user_id:
        row = await db.execute(
            select(Participant).where(Participant.quiz_id == quiz.id, Participant.user_id == user_id)
        )
        participant = row.scalar_one_or_none()
        participant_status = participant.status if participant else None

    return {
        "status": quiz.status,
        "serverTime": utcnow().isoformat(),
        "deadline": deadline.timestamp() if deadline else None,
        "participantStatus": participant_status,
    }


@app.get("/api/quizzes/{quiz_id}/questions")
async def get_questions(quiz_id: UUID, user_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    """Player view — never leaks correct answers. Marks the caller ACTIVE on entry."""
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(404, "Qest not found")
    if quiz.status != "LIVE":
        raise HTTPException(409, "Questions are sealed until the room is live")

    if user_id:
        row = await db.execute(
            select(Participant).where(Participant.quiz_id == quiz.id, Participant.user_id == user_id)
        )
        participant = row.scalar_one_or_none()
        if participant is None:
            raise HTTPException(403, "You are not part of this Qest")
        if participant.status == "PENDING":
            raise HTTPException(403, "Your commitment is not confirmed yet")
        if participant.status == "JOINED":
            participant.status = "ACTIVE"
            await db.commit()

    questions = (await db.execute(
        select(Question).where(Question.quiz_id == quiz.id, Question.status == "ACTIVE").order_by(Question.position)
    )).scalars().all()
    return [
        {
            "id": str(q.id),
            "position": q.position,
            "questionText": q.question_text,
            "options": [
                {"key": "A", "text": q.option_a},
                {"key": "B", "text": q.option_b},
                {"key": "C", "text": q.option_c},
                {"key": "D", "text": q.option_d},
            ],
        }
        for q in questions
    ]


@app.post("/api/quizzes/{quiz_id}/answers")
async def answer_question(quiz_id: UUID, req: AnswerRequest, db: AsyncSession = Depends(get_db)):
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(404, "Qest not found")
    try:
        answer = await submit_answer(db, quiz, req.participant_id, req.question_id, req.selected_option)
        await db.commit()
    except DomainError as exc:
        await db.rollback()
        raise HTTPException(409, str(exc)) from exc
    return {"accepted": True, "correct": answer.is_correct}


@app.get("/api/quizzes/{quiz_id}/results")
async def get_results(quiz_id: UUID, db: AsyncSession = Depends(get_db)):
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(404, "Qest not found")
    await maybe_advance(db, quiz)
    await db.refresh(quiz)
    if quiz.status not in ("VALIDATING", "FINALIZED", "SETTLED"):
        raise HTTPException(409, "Results are not available yet")

    rows_raw = await db.execute(
        select(Participant, User).join(User, Participant.user_id == User.id).where(Participant.quiz_id == quiz.id)
    )
    participants = [(p, u) for p, u in rows_raw.all()]
    payout_rows, winners_take = compute_payouts([p for p, _ in participants], quiz.question_count, quiz.entry_amount)
    names = {p.id: u.display_name for p, u in participants}

    result_rows = []
    for r in payout_rows:
        pct = r["correct_answers"] / quiz.question_count * 100 if quiz.question_count else 0
        result_rows.append({
            "participantId": str(r["participant_id"]),
            "displayName": names.get(r["participant_id"], "Unknown"),
            "correctAnswers": r["correct_answers"],
            "totalQuestions": quiz.question_count,
            "scorePercentage": round(pct, 2),
            "rank": r["rank"],
            "entryAmount": float(r["entry_amount"]),
            "payout": float(round(r["payout"], 8)),
            "payoutKind": r["payout_kind"],
        })

    return {
        "quizId": str(quiz.id),
        "status": quiz.status,
        "resultVersion": quiz.result_version,
        "prizePool": float(round(winners_take, 8)),
        "rows": result_rows,
    }


@app.get("/api/quizzes/{quiz_id}/review")
async def get_review(quiz_id: UUID, user_id: UUID, db: AsyncSession = Depends(get_db)):
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(404, "Qest not found")
    await maybe_advance(db, quiz)
    await db.refresh(quiz)
    if quiz.status not in ("VALIDATING", "FINALIZED", "SETTLED"):
        raise HTTPException(409, "Review unlocks when the Qest ends")

    participant = (await db.execute(
        select(Participant).where(Participant.quiz_id == quiz.id, Participant.user_id == user_id)
    )).scalar_one_or_none()

    questions = (await db.execute(
        select(Question).where(Question.quiz_id == quiz.id, Question.status == "ACTIVE").order_by(Question.position)
    )).scalars().all()

    my_answers: dict[UUID, Answer] = {}
    if participant:
        answer_rows = await db.execute(
            select(Answer).where(Answer.participant_id == participant.id)
        )
        my_answers = {a.question_id: a for a in answer_rows.scalars().all()}

    return [
        {
            "id": str(q.id),
            "position": q.position,
            "questionText": q.question_text,
            "options": [
                {"key": "A", "text": q.option_a},
                {"key": "B", "text": q.option_b},
                {"key": "C", "text": q.option_c},
                {"key": "D", "text": q.option_d},
            ],
            "correctOption": q.correct_option,
            "explanation": q.explanation,
            "myAnswer": my_answers[q.id].selected_option if q.id in my_answers else None,
            "wasCorrect": (my_answers[q.id].selected_option == q.correct_option) if q.id in my_answers else None,
        }
        for q in questions
    ]


# ---------- settlement sidecar API (guarded by X-Settlement-Token) ----------


@app.get("/api/settlement/queue")
async def settlement_queue(request: Request, db: AsyncSession = Depends(get_db)):
    """Quizzes that are FINALIZED and awaiting payout broadcast.
    The settlement sidecar polls this, pays out from the escrow wallet,
    then reports back via /api/settlement/complete."""
    if not settlement_token_ok(request):
        raise HTTPException(401, "Invalid settlement token")

    quizzes = (await db.execute(select(Quiz).where(Quiz.status == "FINALIZED"))).scalars().all()
    queue = []
    for quiz in quizzes:
        rows = await db.execute(
            select(Participant, User).join(User, Participant.user_id == User.id).where(Participant.quiz_id == quiz.id)
        )
        participants = [(p, u) for p, u in rows.all()]
        payout_rows, winners_take = compute_payouts([p for p, _ in participants], quiz.question_count, quiz.entry_amount)
        users = {p.id: u for p, u in participants}
        payouts = [
            {
                "participantId": str(r["participant_id"]),
                "displayName": users.get(r["participant_id"]).display_name if users.get(r["participant_id"]) else "Unknown",
                "walletAddress": users.get(r["participant_id"]).wallet_address if users.get(r["participant_id"]) else None,
                "amountNim": float(round(r["payout"], 5)),
                "amountLuna": int(Decimal(str(r["payout"])) * 100_000),
                "kind": r["payout_kind"],
            }
            for r in payout_rows
            if r["payout"] > 0
        ]
        queue.append({
            "quizId": str(quiz.id),
            "title": quiz.title,
            "currency": quiz.currency,
            "prizePool": float(round(winners_take, 5)),
            "resultVersion": quiz.result_version,
            "payouts": payouts,
        })
    return {"paymentsMode": payments_mode(), "escrowAddress": escrow_address(), "rpcUrl": rpc_url(), "quizzes": queue}


@app.post("/api/settlement/complete")
async def settlement_complete(req: SettlementCompleteRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """The sidecar reports broadcast payouts; quiz flips FINALIZED -> SETTLED."""
    if not settlement_token_ok(request):
        raise HTTPException(401, "Invalid settlement token")

    quiz = await db.get(Quiz, req.quiz_id)
    if not quiz:
        raise HTTPException(404, "Qest not found")
    if quiz.status not in ("FINALIZED", "SETTLED"):
        raise HTTPException(409, f"Qest is not awaiting settlement (status: {quiz.status})")

    by_participant = {p.participant_id: p.tx_hash for p in req.payouts}
    participants = (await db.execute(
        select(Participant).where(Participant.quiz_id == quiz.id)
    )).scalars().all()
    user_by_participant = {p.id: p.user_id for p in participants}
    payout_rows, _ = compute_payouts(participants, quiz.question_count, quiz.entry_amount)
    for r in payout_rows:
        tx_hash = by_participant.get(r["participant_id"])
        if not tx_hash:
            continue
        db.add(Transaction(
            quiz_id=quiz.id,
            user_id=user_by_participant.get(r["participant_id"]),
            type="PAYOUT",
            currency=quiz.currency,
            amount=r["payout"],
            status="CONFIRMED",
            blockchain_tx_hash=tx_hash,
            created_at=utcnow(),
            confirmed_at=utcnow(),
        ))

    if quiz.status == "FINALIZED":
        await transition_quiz(db, quiz, "SETTLED")
        await log_event(db, quiz.id, "QUIZ_SETTLED", metadata={"payouts": len(req.payouts)})
    await db.commit()
    return {"quizId": str(quiz.id), "status": quiz.status, "recorded": len(req.payouts)}
