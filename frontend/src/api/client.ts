import type {
  AnswerRequest,
  AppConfig,
  CommitmentStatus,
  CreateQuestionRequest,
  CreateQuizRequest,
  CreateUserRequest,
  GenerateQuestionsRequest,
  GenerateQuestionsResponse,
  HistoryEntry,
  JoinResult,
  QestiaApi,
  Participant,
  PlayerQuestion,
  Quiz,
  QuizListFilters,
  QuizResults,
  QuizState,
  QuizStatus,
  ReviewQuestion,
  UploadMaterialResponse,
  VerifyCommitmentResult,
} from './types'

// Defaults to same-origin relative paths so the app works both in local dev
// (Vite proxies /api -> localhost:8000) and in production (Vercel serves /api
// from the same origin). Set VITE_API_URL only to point at a different backend.
const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const detail = typeof body.detail === 'string' ? body.detail : res.statusText
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

export function createRealApi(): QestiaApi {
  return {
    async getConfig() {
      return request<AppConfig>('/api/config')
    },

    async createUser(req: CreateUserRequest) {
      return request<UserJson>('/api/users', {
        method: 'POST',
        body: JSON.stringify(req),
      }).then(toUser)
    },

    async linkWallet(userId: string, walletAddress: string, deviceId?: string) {
      return request<{ id: string; walletAddress: string | null; deviceId: string | null }>(
        `/api/users/${userId}/wallet`,
        { method: 'POST', body: JSON.stringify({ walletAddress, deviceId }) },
      )
    },

    async createQuiz(req: CreateQuizRequest) {
      return request<{ quizId: string; status: QuizStatus }>('/api/quizzes', {
        method: 'POST',
        body: JSON.stringify({
          creatorId: req.creatorId,
          title: req.title,
          description: req.description ?? null,
          currency: req.currency,
          entryAmount: req.entryAmount,
          durationSeconds: req.durationSeconds,
          startsAt: req.startsAt ?? null,
          minParticipants: req.minParticipants ?? 3,
        }),
      })
    },

    async addQuestion(quizId: string, req: CreateQuestionRequest) {
      return request<{ questionId: string; position: number }>(`/api/quizzes/${quizId}/questions`, {
        method: 'POST',
        body: JSON.stringify({
          position: req.position,
          questionText: req.questionText,
          optionA: req.optionA,
          optionB: req.optionB,
          optionC: req.optionC,
          optionD: req.optionD,
          correctOption: req.correctOption,
          // backend ignores extra fields until the Phase 6 slice adds it
          explanation: req.explanation ?? null,
        }),
      })
    },

    async getQuiz(quizId: string) {
      return request<QuizJson>(`/api/quizzes/${quizId}`).then(toQuiz)
    },

    async listQuizzes(filters?: QuizListFilters) {
      const params = filters?.status && filters.status !== 'ALL' ? `?status=${filters.status}` : ''
      const quizzes = await request<QuizJson[]>(`/api/quizzes${params}`)
      return quizzes.map(toQuiz)
    },

    async publishQuiz(quizId: string) {
      return request<{ quizId: string; status: QuizStatus }>(`/api/quizzes/${quizId}/publish`, {
        method: 'POST',
      })
    },

    async openQuiz(quizId: string) {
      return request<{ quizId: string; status: QuizStatus }>(`/api/quizzes/${quizId}/open`, {
        method: 'POST',
      })
    },

    async startQuiz(quizId: string) {
      return request<{ quizId: string; status: QuizStatus; startedAt: string | null }>(
        `/api/quizzes/${quizId}/start`,
        { method: 'POST' },
      )
    },

    async joinQuiz(quizId: string, userId: string) {
      return request<JoinResult>(`/api/quizzes/${quizId}/join`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      })
    },

    async verifyCommitment(quizId: string, participantId: string, txRef: string) {
      return request<VerifyCommitmentResult>(`/api/quizzes/${quizId}/commitments/verify`, {
        method: 'POST',
        body: JSON.stringify({ participantId, txRef }),
      })
    },

    async getCommitment(quizId: string, participantId: string) {
      return request<CommitmentStatus>(`/api/quizzes/${quizId}/commitments/${participantId}`)
    },

    async getParticipants(quizId: string) {
      return request<Participant[]>(`/api/quizzes/${quizId}/participants`)
    },

    async getQuizState(quizId: string, userId?: string) {
      const q = userId ? `?user_id=${encodeURIComponent(userId)}` : ''
      return request<QuizState>(`/api/quizzes/${quizId}/state${q}`)
    },

    async getQuestions(quizId: string, userId?: string) {
      const q = userId ? `?user_id=${encodeURIComponent(userId)}` : ''
      return request<PlayerQuestion[]>(`/api/quizzes/${quizId}/questions${q}`)
    },

    async submitAnswer(quizId: string, req: AnswerRequest) {
      return request<{ accepted: boolean; correct: boolean }>(`/api/quizzes/${quizId}/answers`, {
        method: 'POST',
        body: JSON.stringify(req),
      })
    },

    async getResults(quizId: string) {
      return request<QuizResults>(`/api/quizzes/${quizId}/results`)
    },

    async getReview(quizId: string, userId: string) {
      return request<ReviewQuestion[]>(
        `/api/quizzes/${quizId}/review?user_id=${encodeURIComponent(userId)}`,
      )
    },

    async getMyHistory(userId: string) {
      return request<HistoryEntry[]>(`/api/users/${userId}/history`)
    },

    async generateQuestions(req: GenerateQuestionsRequest) {
      return request<GenerateQuestionsResponse>('/api/generate', {
        method: 'POST',
        body: JSON.stringify({
          material: req.material,
          numQuestions: req.numQuestions,
        }),
      })
    },

    async uploadMaterial(file: File) {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`${BASE_URL}/api/materials`, {
        method: 'POST',
        body,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const detail = typeof data.detail === 'string' ? data.detail : res.statusText
        throw new ApiError(res.status, detail)
      }
      return res.json() as Promise<UploadMaterialResponse>
    },
  }
}

// ---------- JSON shapes as returned by the backend (camelCase) ----------

interface UserJson {
  id: string
  displayName: string
  walletAddress?: string | null
}

interface QuizJson {
  id: string
  title: string
  description: string | null
  status: QuizStatus
  currency: string
  entryAmount: string
  durationSeconds: number
  questionCount: number
  minParticipants?: number
  participantCount: number
  startsAt: string | null
  creatorId?: string
}

// ---------- mappers (JSON -> domain) ----------

function toUser(u: UserJson) {
  return { id: u.id, displayName: u.displayName, walletAddress: u.walletAddress ?? null }
}

function toQuiz(q: QuizJson): Quiz {
  return {
    id: q.id,
    title: q.title,
    description: q.description,
    status: q.status,
    currency: 'NIM' as const,
    entryAmount: Number(q.entryAmount),
    durationSeconds: q.durationSeconds,
    questionCount: q.questionCount,
    minParticipants: q.minParticipants ?? 3,
    participantCount: q.participantCount,
    startsAt: q.startsAt,
    creatorId: q.creatorId ?? '',
  }
}
