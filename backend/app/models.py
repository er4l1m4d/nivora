from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4
from sqlalchemy import Boolean, DateTime, Integer, JSON, Numeric, String, Text, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    wallet_address: Mapped[str | None] = mapped_column(Text, unique=True)
    display_name: Mapped[str] = mapped_column(Text)
    # Pseudonymous per-device handle from the Nimiq Pay mini-app SDK (anti-cheat)
    device_id: Mapped[str | None] = mapped_column(Text)


class Quiz(Base):
    __tablename__ = "quizzes"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    creator_id: Mapped[UUID] = mapped_column(Uuid)
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String)
    currency: Mapped[str] = mapped_column(String)
    entry_amount: Mapped[Decimal] = mapped_column(Numeric(30, 12))
    duration_seconds: Mapped[int] = mapped_column(Integer)
    question_count: Mapped[int] = mapped_column(Integer)
    min_participants: Mapped[int] = mapped_column(Integer, default=3)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    result_version: Mapped[int] = mapped_column(Integer, default=0)


class Participant(Base):
    __tablename__ = "participants"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    quiz_id: Mapped[UUID] = mapped_column(Uuid)
    user_id: Mapped[UUID] = mapped_column(Uuid)
    # PENDING = joined, awaiting on-chain payment confirmation
    # JOINED = commitment confirmed
    status: Mapped[str] = mapped_column(String)
    # Unique memo code binding the on-chain payment to this participant (real mode)
    memo_code: Mapped[str | None] = mapped_column(String(12))
    disconnect_count: Mapped[int] = mapped_column(Integer, default=0)
    # Last heartbeat timestamp from the client poll; powers reconnect/away-state (Track F)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    correct_answers: Mapped[int] = mapped_column(Integer, default=0)
    score_percentage: Mapped[Decimal | None] = mapped_column(Numeric(8, 5))
    rank: Mapped[int | None] = mapped_column(Integer)


class Question(Base):
    __tablename__ = "questions"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    quiz_id: Mapped[UUID] = mapped_column(Uuid)
    position: Mapped[int] = mapped_column(Integer)
    question_text: Mapped[str] = mapped_column(Text)
    option_a: Mapped[str] = mapped_column(Text)
    option_b: Mapped[str] = mapped_column(Text)
    option_c: Mapped[str] = mapped_column(Text)
    option_d: Mapped[str] = mapped_column(Text)
    correct_option: Mapped[str] = mapped_column(String(1))
    explanation: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String)


class Answer(Base):
    __tablename__ = "answers"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    participant_id: Mapped[UUID] = mapped_column(Uuid)
    question_id: Mapped[UUID] = mapped_column(Uuid)
    selected_option: Mapped[str] = mapped_column(String(1))
    is_correct: Mapped[bool] = mapped_column(Boolean)
    answered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    quiz_id: Mapped[UUID | None] = mapped_column(Uuid)
    user_id: Mapped[UUID] = mapped_column(Uuid)
    type: Mapped[str] = mapped_column(String)
    currency: Mapped[str] = mapped_column(String)
    amount: Mapped[Decimal] = mapped_column(Numeric(30, 12))
    wallet_address: Mapped[str | None] = mapped_column(Text)
    blockchain_tx_hash: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="PENDING")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class QuizEvent(Base):
    __tablename__ = "quiz_events"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    quiz_id: Mapped[UUID] = mapped_column(Uuid)
    participant_id: Mapped[UUID | None] = mapped_column(Uuid)
    event_type: Mapped[str] = mapped_column(Text)
    event_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # 'metadata' is reserved by SQLAlchemy declarative — attribute vs column name
    meta: Mapped[dict | None] = mapped_column("metadata", JSON)
