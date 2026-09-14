import type {
  AnswerRequest,
  AppConfig,
  CommitmentStatus,
  CreateQuestionRequest,
  CreateQuizRequest,
  CreateUserRequest,
  GenerateQuestionsRequest,
  JoinResult,
  QestiaApi,
  OptionKey,
  Participant,
  PlayerQuestion,
  Question,
  Quiz,
  QuizListFilters,
  QuizStatus,
  ResultRow,
  UploadMaterialResponse,
  User,
  VerifyCommitmentResult,
} from './types'
import { VALID_QUIZ_TRANSITIONS } from './types'
import { generateDraftQuestions, generateMemoCode } from '@/lib/generator'

// ---------- payout rules (locked product decisions) ----------
// Top 3: 100% entry back + pool split 50/30/10
// Non-top-3 finishers: 80% back, 20% -> pool
// No-shows (joined but never went active): 50% back, 50% -> pool
// 10% of pool funds completion bonus split among completers

const TOP_3_SPLIT = [0.5, 0.3, 0.1] as const

export function computePayouts(
  participants: ReadonlyArray<Participant>,
  questionCount: number,
): { rows: ResultRow[]; prizePool: number } {
  const finished = participants.filter((p) => p.status === 'COMPLETED' || p.status === 'TIMED_OUT')
  const noShows = participants.filter((p) => p.status === 'JOINED')

  const ranked = [...finished]
    .filter((p) => p.status === 'COMPLETED')
    .sort((a, b) => b.correctAnswers - a.correctAnswers || a.id.localeCompare(b.id))

  // competition ranking: 1, 1, 3
  const ranks: number[] = []
  ranked.forEach((p, i) => {
    if (i > 0 && p.correctAnswers === ranked[i - 1].correctAnswers) {
      ranks.push(ranks[i - 1])
    } else {
      ranks.push(i + 1)
    }
  })

  const rows = new Map<string, ResultRow>()
  ranked.forEach((p, i) => {
    rows.set(p.id, {
      participantId: p.id,
      displayName: p.displayName,
      correctAnswers: p.correctAnswers,
      totalQuestions: questionCount,
      scorePercentage: questionCount > 0 ? (p.correctAnswers / questionCount) * 100 : 0,
      rank: ranks[i],
      entryAmount: p.entryAmount,
      payout: 0,
      payoutKind: 'none',
    })
  })

  // winners = everyone holding competition rank 1, 2 or 3 (ties included)
  const winnerIds = new Set(
    ranked.filter((_, i) => ranks[i] <= 3).map((p) => p.id),
  )

  // pool contributions: 20% from non-winning finishers, 50% from no-shows
  let pool = 0
  for (const p of finished) {
    if (!winnerIds.has(p.id)) {
      pool += p.entryAmount * 0.2
      rows.set(p.id, {
        ...rowFor(p, questionCount),
        rank: rows.get(p.id)?.rank ?? 99,
        payout: p.entryAmount * 0.8,
        payoutKind: 'consolation',
      })
    }
  }
  for (const p of noShows) {
    pool += p.entryAmount * 0.5
    rows.set(p.id, {
      ...rowFor(p, questionCount),
      rank: 99,
      payout: p.entryAmount * 0.5,
      payoutKind: 'refund',
    })
  }

  // completion bonus: 10% of pool + any skipped winner allocation
  let bonus = pool * 0.1

  // winner allocations per rank: 50/30/10 of the full pool, split among rank holders
  let winnersTake = 0
  for (const rank of [1, 2, 3] as const) {
    const holders = ranked.filter((_p, i) => ranks[i] === rank)
    const allocation = pool * TOP_3_SPLIT[rank - 1]
    if (holders.length === 0) {
      // skipped allocation flows to the completion bonus
      bonus += allocation
      continue
    }
    winnersTake += allocation
    const share = allocation / holders.length
    for (const p of holders) {
      const row = rows.get(p.id)
      if (row) {
        row.payout = p.entryAmount + share
        row.payoutKind = 'winner'
      }
    }
  }

  // bonus split among all completers (winners included)
  const completers = finished.filter((p) => p.status === 'COMPLETED')
  if (completers.length > 0) {
    const bonusPer = bonus / completers.length
    for (const p of completers) {
      const row = rows.get(p.id)
      if (row) row.payout += bonusPer
    }
  }

  const allRows = [...rows.values()].sort(
    (a, b) => a.rank - b.rank || b.scorePercentage - a.scorePercentage,
  )
  return { rows: allRows, prizePool: winnersTake }
}

function rowFor(p: Participant, questionCount: number): ResultRow {
  return {
    participantId: p.id,
    displayName: p.displayName,
    correctAnswers: p.correctAnswers,
    totalQuestions: questionCount,
    scorePercentage: questionCount > 0 ? (p.correctAnswers / questionCount) * 100 : 0,
    rank: 99,
    entryAmount: p.entryAmount,
    payout: 0,
    payoutKind: 'none',
  }
}

// ---------- in-memory store ----------

interface MockStore {
  users: Map<string, User>
  quizzes: Map<string, Quiz>
  questions: Map<string, Question[]>
  participants: Map<string, Participant[]>
  answers: Map<string, AnswerRequest[]>
  statusChangedAt: Map<string, number>
}

function uid(): string {
  return crypto.randomUUID()
}

function minutesFromNow(min: number): string {
  return new Date(Date.now() + min * 60_000).toISOString()
}

function seedStore(): MockStore {
  const store: MockStore = {
    users: new Map(),
    quizzes: new Map(),
    questions: new Map(),
    participants: new Map(),
    answers: new Map(),
    statusChangedAt: new Map(),
  }

  const creators = [
    { id: uid(), displayName: 'Ada', walletAddress: null },
    { id: uid(), displayName: 'Kofi', walletAddress: null },
  ]
  creators.forEach((u) => store.users.set(u.id, u))

  const seedQuizzes: Array<{
    quiz: Omit<Quiz, 'participantCount'>
    questions: Array<Omit<Question, 'quizId'>>
    participants: Array<Omit<Participant, 'quizId' | 'id' | 'userId'> & { user: string }>
  }> = [
    {
      quiz: {
        id: uid(),
        title: 'Cell Biology Final',
        description: 'Mitosis, membranes, and everything your lecturer warned you about.',
        status: 'OPEN',
        currency: 'NIM',
        entryAmount: 50,
        durationSeconds: 300,
        questionCount: 2,
        minParticipants: 3,
        startsAt: minutesFromNow(30),
        creatorId: creators[0].id,
      },
      questions: [
        {
          id: uid(),
          position: 1,
          questionText: 'Which phase follows metaphase in mitosis?',
          optionA: 'Prophase',
          optionB: 'Anaphase',
          optionC: 'Interphase',
          optionD: 'Cytokinesis',
          correctOption: 'B' as OptionKey,
          explanation: 'Anaphase follows metaphase — sister chromatids are pulled apart.',
          status: 'ACTIVE' as const,
        },
        {
          id: uid(),
          position: 2,
          questionText: 'Which organelle is the site of ATP synthesis?',
          optionA: 'Ribosome',
          optionB: 'Golgi apparatus',
          optionC: 'Mitochondrion',
          optionD: 'Lysosome',
          correctOption: 'C' as OptionKey,
          explanation: 'The mitochondrion produces ATP via oxidative phosphorylation.',
          status: 'ACTIVE' as const,
        },
      ],
      participants: [
        { user: creators[0].id, displayName: 'Ada', status: 'JOINED', disconnectCount: 0, correctAnswers: 0, scorePercentage: null, rank: null, entryAmount: 50 },
        { user: uid(), displayName: 'Zainab', status: 'JOINED', disconnectCount: 0, correctAnswers: 0, scorePercentage: null, rank: null, entryAmount: 50 },
      ],
    },
    {
      quiz: {
        id: uid(),
        title: 'Nervous System Sprint',
        description: 'Fast one. Five minutes, real stakes.',
        status: 'OPEN',
        currency: 'NIM',
        entryAmount: 100,
        durationSeconds: 300,
        questionCount: 1,
        minParticipants: 3,
        startsAt: minutesFromNow(90),
        creatorId: creators[1].id,
      },
      questions: [
        {
          id: uid(),
          position: 1,
          questionText: 'Which neurotransmitter is released at the neuromuscular junction?',
          optionA: 'Dopamine',
          optionB: 'Serotonin',
          optionC: 'Acetylcholine',
          optionD: 'GABA',
          correctOption: 'C' as OptionKey,
          explanation: 'Acetylcholine is released by motor neurons to activate muscles.',
          status: 'ACTIVE' as const,
        },
      ],
      participants: [
        { user: creators[1].id, displayName: 'Kofi', status: 'JOINED', disconnectCount: 0, correctAnswers: 0, scorePercentage: null, rank: null, entryAmount: 100 },
      ],
    },
    {
      quiz: {
        id: uid(),
        title: 'Organic Chem Rematch',
        description: 'The redemption arc. Same material, new questions.',
        status: 'SETTLED',
        currency: 'NIM',
        entryAmount: 25,
        durationSeconds: 420,
        questionCount: 2,
        minParticipants: 3,
        startsAt: minutesFromNow(-1440),
        creatorId: creators[0].id,
      },
      questions: [
        {
          id: uid(),
          position: 1,
          questionText: 'What is the general formula of an alkane?',
          optionA: 'CnH2n',
          optionB: 'CnH2n+2',
          optionC: 'CnH2n-2',
          optionD: 'CnHn',
          correctOption: 'B' as OptionKey,
          explanation: 'Alkanes are saturated: CnH2n+2.',
          status: 'ACTIVE' as const,
        },
        {
          id: uid(),
          position: 2,
          questionText: 'Which functional group defines a ketone?',
          optionA: '-OH',
          optionB: '-CHO',
          optionC: 'C=O (internal)',
          optionD: '-COOH',
          correctOption: 'C' as OptionKey,
          explanation: 'A ketone has a carbonyl group internal to the carbon chain.',
          status: 'ACTIVE' as const,
        },
      ],
      participants: [
        { user: uid(), displayName: 'Ada', status: 'COMPLETED', disconnectCount: 0, correctAnswers: 2, scorePercentage: 100, rank: 1, entryAmount: 25 },
        { user: uid(), displayName: 'Bode', status: 'COMPLETED', disconnectCount: 0, correctAnswers: 1, scorePercentage: 50, rank: 2, entryAmount: 25 },
        { user: uid(), displayName: 'Chidi', status: 'COMPLETED', disconnectCount: 0, correctAnswers: 1, scorePercentage: 50, rank: 2, entryAmount: 25 },
        { user: uid(), displayName: 'Dara', status: 'COMPLETED', disconnectCount: 0, correctAnswers: 0, scorePercentage: 0, rank: 4, entryAmount: 25 },
      ],
    },
  ]

  for (const seed of seedQuizzes) {
    store.quizzes.set(seed.quiz.id, { ...seed.quiz, participantCount: seed.participants.length })
    store.questions.set(
      seed.quiz.id,
      seed.questions.map((q) => ({ ...q, quizId: seed.quiz.id })),
    )
    store.participants.set(
      seed.quiz.id,
      seed.participants.map((p) => ({
        ...p,
        id: uid(),
        quizId: seed.quiz.id,
        userId: p.user,
      })),
    )
  }

  return store
}

const store: MockStore = seedStore()

function delay(ms = 120): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assertTransition(from: QuizStatus, to: QuizStatus) {
  if (!VALID_QUIZ_TRANSITIONS[from].includes(to)) {
    throw new Error(`Illegal quiz transition: ${from} -> ${to}`)
  }
}

function setQuizStatus(quiz: Quiz, to: QuizStatus) {
  assertTransition(quiz.status, to)
  quiz.status = to
  store.statusChangedAt.set(quiz.id, Date.now())
}

// Demo pacing: VALIDATING ~15s -> FINALIZED ~15s -> SETTLED (mimics dispute window)
const VALIDATING_HOLD_MS = 15_000
const FINALIZED_HOLD_MS = 15_000

function maybeAdvanceLifecycle(quiz: Quiz) {
  if (quiz.status !== 'VALIDATING' && quiz.status !== 'FINALIZED') return
  const since = store.statusChangedAt.get(quiz.id)
  if (since === undefined) {
    store.statusChangedAt.set(quiz.id, Date.now())
    return
  }
  if (quiz.status === 'VALIDATING' && Date.now() - since >= VALIDATING_HOLD_MS) {
    quiz.status = 'FINALIZED'
    store.statusChangedAt.set(quiz.id, Date.now())
  } else if (quiz.status === 'FINALIZED' && Date.now() - since >= FINALIZED_HOLD_MS) {
    quiz.status = 'SETTLED'
    store.statusChangedAt.set(quiz.id, Date.now())
  }
}

export function createMockApi(): QestiaApi {
  return {
    async getConfig(): Promise<AppConfig> {
      return {
        paymentsMode: 'mock',
        escrowAddress: 'NQ02 4RCH AXQ1 P50Y 2LJV F9RN 0FCX 4VKM YYQ0',
        minParticipantsDefault: 3,
      }
    },

    async createUser(req: CreateUserRequest) {
      await delay()
      const user: User = { id: uid(), displayName: req.displayName, walletAddress: req.walletAddress ?? null }
      store.users.set(user.id, user)
      return user
    },

    async createQuiz(req: CreateQuizRequest) {
      await delay()
      const quiz: Quiz = {
        id: uid(),
        title: req.title,
        description: req.description ?? null,
        status: 'DRAFT',
        currency: 'NIM',
        entryAmount: req.entryAmount,
        durationSeconds: req.durationSeconds,
        questionCount: 0,
        minParticipants: req.minParticipants ?? 3,
        participantCount: 0,
        startsAt: req.startsAt ?? null,
        creatorId: req.creatorId,
      }
      store.quizzes.set(quiz.id, quiz)
      store.questions.set(quiz.id, [])
      store.participants.set(quiz.id, [])
      return { quizId: quiz.id, status: quiz.status }
    },

    async addQuestion(quizId: string, req: CreateQuestionRequest) {
      await delay()
      const quiz = store.quizzes.get(quizId)
      if (!quiz) throw new Error('Qest not found')
      const questions = store.questions.get(quizId) ?? []
      const question: Question = {
        id: uid(),
        quizId,
        position: req.position,
        questionText: req.questionText,
        optionA: req.optionA,
        optionB: req.optionB,
        optionC: req.optionC,
        optionD: req.optionD,
        correctOption: req.correctOption,
        explanation: req.explanation ?? null,
        status: 'ACTIVE',
      }
      questions.push(question)
      quiz.questionCount = questions.length
      return { questionId: question.id, position: question.position }
    },

    async getQuiz(quizId: string) {
      await delay()
      const quiz = store.quizzes.get(quizId)
      if (!quiz) throw new Error('Qest not found')
      maybeAdvanceLifecycle(quiz)
      return { ...quiz, participantCount: store.participants.get(quizId)?.length ?? 0 }
    },

    async listQuizzes(filters?: QuizListFilters) {
      await delay()
      const all = [...store.quizzes.values()]
        .filter((q) => q.status !== 'DRAFT' && q.status !== 'PUBLISHED')
        .map((q) => {
          maybeAdvanceLifecycle(q)
          return { ...q, participantCount: store.participants.get(q.id)?.length ?? 0 }
        })
      if (!filters?.status || filters.status === 'ALL') return all
      return all.filter((q) => q.status === filters.status)
    },

    async publishQuiz(quizId: string) {
      await delay()
      const quiz = store.quizzes.get(quizId)
      if (!quiz) throw new Error('Qest not found')
      setQuizStatus(quiz, 'PUBLISHED')
      return { quizId, status: quiz.status }
    },

    async openQuiz(quizId: string) {
      await delay()
      const quiz = store.quizzes.get(quizId)
      if (!quiz) throw new Error('Qest not found')
      setQuizStatus(quiz, 'OPEN')
      return { quizId, status: quiz.status }
    },

    async startQuiz(quizId: string) {
      await delay()
      const quiz = store.quizzes.get(quizId)
      if (!quiz) throw new Error('Qest not found')
      setQuizStatus(quiz, 'LIVE')
      const participants = store.participants.get(quizId) ?? []
      for (const p of participants) {
        if (p.status === 'JOINED') p.status = 'ACTIVE'
      }
      return { quizId, status: quiz.status }
    },

    async joinQuiz(quizId: string, userId: string): Promise<JoinResult> {
      await delay()
      const quiz = store.quizzes.get(quizId)
      const user = store.users.get(userId)
      if (!quiz || !user) throw new Error('Qest or user not found')
      const participants = store.participants.get(quizId) ?? []
      const existing = participants.find((p) => p.userId === userId)
      if (existing) {
        return {
          participantId: existing.id,
          status: existing.status,
          paymentsMode: 'mock',
          memoCode: existing.memoCode ?? null,
          escrowAddress: 'NQ02 4RCH AXQ1 P50Y 2LJV F9RN 0FCX 4VKM YYQ0',
          entryAmount: quiz.entryAmount,
        }
      }
      const participant: Participant = {
        id: uid(),
        quizId,
        userId,
        displayName: user.displayName,
        status: 'JOINED',
        memoCode: generateMemoCode(),
        disconnectCount: 0,
        correctAnswers: 0,
        scorePercentage: null,
        rank: null,
        entryAmount: quiz.entryAmount,
      }
      participants.push(participant)
      store.participants.set(quizId, participants)
      quiz.participantCount = participants.length
      // mock payments: tx instantly CONFIRMED
      return {
        participantId: participant.id,
        status: participant.status,
        paymentsMode: 'mock',
        memoCode: participant.memoCode ?? null,
        escrowAddress: 'NQ02 4RCH AXQ1 P50Y 2LJV F9RN 0FCX 4VKM YYQ0',
        entryAmount: quiz.entryAmount,
      }
    },

    async linkWallet(userId: string, walletAddress: string, deviceId?: string) {
      await delay()
      const user = store.users.get(userId)
      if (!user) throw new Error('User not found')
      user.walletAddress = walletAddress
      return { id: userId, walletAddress, deviceId: deviceId ?? null }
    },

    async verifyCommitment(quizId: string, participantId: string): Promise<VerifyCommitmentResult> {
      await delay()
      const participant = (store.participants.get(quizId) ?? []).find((p) => p.id === participantId)
      if (!participant) throw new Error('Participant not found')
      return {
        verified: true,
        status: participant.status === 'PENDING' ? 'JOINED' : participant.status,
        detail: 'Mock payments mode — instantly confirmed',
        memoCode: participant.memoCode ?? null,
      }
    },

    async getCommitment(quizId: string, participantId: string): Promise<CommitmentStatus> {
      await delay()
      const quiz = store.quizzes.get(quizId)
      const participant = (store.participants.get(quizId) ?? []).find((p) => p.id === participantId)
      if (!quiz || !participant) throw new Error('Not found')
      return {
        participantId,
        status: participant.status,
        memoCode: participant.memoCode ?? null,
        escrowAddress: 'NQ02 4RCH AXQ1 P50Y 2LJV F9RN 0FCX 4VKM YYQ0',
        entryAmount: quiz.entryAmount,
        txHash: 'mock-tx',
      }
    },

    async getParticipants(quizId: string) {
      await delay()
      const participants = store.participants.get(quizId)
      if (!participants) throw new Error('Qest not found')
      return participants.map((p) => ({ ...p }))
    },

    async getQuizState(quizId: string, userId?: string) {
      await delay()
      const quiz = store.quizzes.get(quizId)
      if (!quiz) throw new Error('Qest not found')
      maybeAdvanceLifecycle(quiz)
      const mine = userId
        ? (store.participants.get(quizId) ?? []).find((p) => p.userId === userId)
        : undefined
      return {
        status: quiz.status,
        serverTime: new Date().toISOString(),
        deadline: quiz.status === 'LIVE' ? Date.now() / 1000 + quiz.durationSeconds : null,
        participantStatus: mine?.status ?? null,
      }
    },

    async getQuestions(quizId: string, _userId?: string) {
      await delay()
      const questions = store.questions.get(quizId) ?? []
      return questions
        .filter((q) => q.status === 'ACTIVE')
        .sort((a, b) => a.position - b.position)
        .map<PlayerQuestion>((q) => ({
          id: q.id,
          position: q.position,
          questionText: q.questionText,
          options: [
            { key: 'A', text: q.optionA },
            { key: 'B', text: q.optionB },
            { key: 'C', text: q.optionC },
            { key: 'D', text: q.optionD },
          ],
        }))
    },

    async submitAnswer(quizId: string, req: AnswerRequest) {
      await delay()
      const quiz = store.quizzes.get(quizId)
      if (!quiz) throw new Error('Qest not found')
      const participants = store.participants.get(quizId) ?? []
      const participant = participants.find((p) => p.id === req.participantId)
      if (!participant) throw new Error('Participant is not part of this Qest')
      if (quiz.status !== 'LIVE') throw new Error('Qest is not live')

      const questions = store.questions.get(quizId) ?? []
      const question = questions.find((q) => q.id === req.questionId)
      if (!question) throw new Error('Question not found')

      const answers = store.answers.get(quizId) ?? []
      const existing = answers.find((a) => a.participantId === req.participantId && a.questionId === req.questionId)
      if (existing) throw new Error('Question has already been answered')

      answers.push(req)
      store.answers.set(quizId, answers)

      const correct = req.selectedOption === question.correctOption
      if (correct) participant.correctAnswers += 1

      // auto-complete when all questions answered
      const myAnswers = answers.filter((a) => a.participantId === req.participantId)
      if (myAnswers.length >= quiz.questionCount) {
        participant.status = 'COMPLETED'
        participant.scorePercentage = quiz.questionCount > 0 ? (participant.correctAnswers / quiz.questionCount) * 100 : 0
        // everyone done -> walk the legal lifecycle: LIVE -> ENDED -> VALIDATING
        if (participants.every((p) => p.status !== 'ACTIVE')) {
          setQuizStatus(quiz, 'ENDED')
          setQuizStatus(quiz, 'VALIDATING')
        }
      }
      return { accepted: true, correct }
    },

    async getResults(quizId: string) {
      await delay()
      const quiz = store.quizzes.get(quizId)
      if (!quiz) throw new Error('Qest not found')
      maybeAdvanceLifecycle(quiz)
      const participants = store.participants.get(quizId) ?? []

      if (quiz.status === 'SETTLED' || quiz.status === 'FINALIZED' || quiz.status === 'VALIDATING') {
        const { rows, prizePool } = computePayouts(participants, quiz.questionCount)
        return {
          quizId,
          status: quiz.status,
          resultVersion: 1,
          prizePool,
          rows,
        }
      }
      throw new Error('Results are not available yet')
    },

    async getReview(quizId: string, userId: string) {
      await delay()
      const quiz = store.quizzes.get(quizId)
      if (!quiz) throw new Error('Qest not found')
      maybeAdvanceLifecycle(quiz)
      if (quiz.status !== 'VALIDATING' && quiz.status !== 'FINALIZED' && quiz.status !== 'SETTLED') {
        throw new Error('Review unlocks when the Qest ends')
      }
      const participant = (store.participants.get(quizId) ?? []).find((p) => p.userId === userId)
      const questions = store.questions.get(quizId) ?? []
      const answers = store.answers.get(quizId) ?? []

      return questions
        .filter((q) => q.status === 'ACTIVE')
        .sort((a, b) => a.position - b.position)
        .map((q) => {
          const mine = participant
            ? answers.find((a) => a.participantId === participant.id && a.questionId === q.id)
            : undefined
          return {
            id: q.id,
            position: q.position,
            questionText: q.questionText,
            options: [
              { key: 'A' as const, text: q.optionA },
              { key: 'B' as const, text: q.optionB },
              { key: 'C' as const, text: q.optionC },
              { key: 'D' as const, text: q.optionD },
            ],
            correctOption: q.correctOption,
            explanation: q.explanation,
            myAnswer: mine?.selectedOption ?? null,
            wasCorrect: mine ? mine.selectedOption === q.correctOption : null,
          }
        })
    },

    async getMyHistory(userId: string) {
      await delay()
      const entries = []
      for (const quiz of [...store.quizzes.values()].reverse()) {
        maybeAdvanceLifecycle(quiz)
        if (!['VALIDATING', 'ENDED', 'FINALIZED', 'SETTLED'].includes(quiz.status)) continue
        const participants = store.participants.get(quiz.id) ?? []
        const me = participants.find((p) => p.userId === userId)
        if (!me) continue
        const { rows } = computePayouts(participants, quiz.questionCount)
        const myRow = rows.find((r) => r.participantId === me.id)
        entries.push({
          quizId: quiz.id,
          title: quiz.title,
          status: quiz.status,
          rank: myRow?.rank ?? null,
          correctAnswers: me.correctAnswers,
          questionCount: quiz.questionCount,
          payout: myRow?.payout ?? 0,
          entryAmount: me.entryAmount,
          payoutKind: myRow?.payoutKind ?? 'none',
        })
      }
      return entries
    },

    // Mock mode: AI generation is the local cloze generator. In real mode this
    // call hits POST /api/generate (backend, which falls back to the same logic
    // on failure). The returned shape matches the real endpoint.
    async generateQuestions(req: GenerateQuestionsRequest) {
      await delay(400)
      const drafts = generateDraftQuestions(req.material, req.numQuestions)
      return {
        source: 'fallback' as const,
        questions: drafts.map((d) => ({
          text: d.questionText,
          options: d.options.map((o) => o.text),
          correctIndex: d.options.findIndex((o) => o.key === d.correctOption),
          explanation: d.explanation,
        })),
      }
    },

    // PDF extraction runs server-side; the mock has no backend, so it declines.
    async uploadMaterial(_file: File): Promise<UploadMaterialResponse> {
      throw new Error('PDF needs the backend — run with VITE_USE_MOCK=false.')
    },
  }
}

// exposed for tests / demo tooling
export const mockStore = store
