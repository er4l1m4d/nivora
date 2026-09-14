// Domain types mirroring backend/app/models.py + sql/001_initial_schema.sql

export type QuizStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'OPEN'
  | 'LIVE'
  | 'ENDED'
  | 'VALIDATING'
  | 'FINALIZED'
  | 'SETTLED'
  | 'CANCELLED'
  | 'REFUNDING'
  | 'REFUNDED'

export type ParticipantStatus =
  | 'PENDING'
  | 'JOINED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'TIMED_OUT'
  | 'FORFEITED'
  | 'DISQUALIFIED'

export type QuestionStatus = 'DRAFT' | 'ACTIVE' | 'FLAGGED' | 'INVALID'

export type OptionKey = 'A' | 'B' | 'C' | 'D'

export type Currency = 'NIM'

export type QuizMode = 'demo' | 'practice' | 'commitment'

// Quiz state machine — must stay in sync with backend/app/services.py VALID_TRANSITIONS
export const VALID_QUIZ_TRANSITIONS: Record<QuizStatus, readonly QuizStatus[]> = {
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['OPEN', 'CANCELLED'],
  OPEN: ['LIVE', 'CANCELLED', 'REFUNDING'],
  LIVE: ['ENDED'],
  ENDED: ['VALIDATING'],
  VALIDATING: ['FINALIZED', 'REFUNDING'],
  FINALIZED: ['SETTLED'],
  SETTLED: [],
  CANCELLED: ['REFUNDING'],
  REFUNDING: ['REFUNDED'],
  REFUNDED: [],
}

// The status ladder shown in the UI status stepper
export const QUIZ_LIFECYCLE: readonly QuizStatus[] = [
  'OPEN',
  'LIVE',
  'ENDED',
  'VALIDATING',
  'FINALIZED',
  'SETTLED',
]

export interface User {
  id: string
  displayName: string
  walletAddress: string | null
}

export interface Quiz {
  id: string
  title: string
  description: string | null
  status: QuizStatus
  currency: Currency
  entryAmount: number
  durationSeconds: number
  questionCount: number
  minParticipants: number
  participantCount: number
  startsAt: string | null
  creatorId: string
}

export interface Question {
  id: string
  quizId: string
  position: number
  questionText: string
  optionA: string
  optionB: string
  optionC: string
  optionD: string
  correctOption: OptionKey
  explanation: string | null
  status: QuestionStatus
}

// Question as seen by a player — no correct answer leaked
export interface PlayerQuestion {
  id: string
  position: number
  questionText: string
  options: ReadonlyArray<{ key: OptionKey; text: string }>
}

export interface Participant {
  id: string
  quizId: string
  userId: string
  displayName: string
  status: ParticipantStatus
  memoCode?: string | null
  lastSeenAt?: string | null
  answeredQuestionIds?: string[]
  disconnectCount: number
  correctAnswers: number
  scorePercentage: number | null
  rank: number | null
  entryAmount: number
}

export interface QuizState {
  status: QuizStatus
  serverTime: string
  deadline: number | null
  participantStatus: ParticipantStatus | null
  answeredQuestionIds?: string[]
}

// ---------- payments / wallet ----------

export interface AppConfig {
  paymentsMode: 'mock' | 'real'
  escrowAddress: string | null
  minParticipantsDefault: number
}

export interface JoinResult {
  participantId: string
  status: ParticipantStatus
  paymentsMode: 'mock' | 'real'
  memoCode: string | null
  escrowAddress: string | null
  entryAmount: number
}

export interface CommitmentStatus {
  participantId: string
  status: ParticipantStatus
  memoCode: string | null
  escrowAddress: string | null
  entryAmount: number | null
  txHash: string | null
}

export interface VerifyCommitmentResult {
  verified: boolean
  status: ParticipantStatus
  detail: string
  memoCode: string | null
}

// ---------- Request / response shapes (match backend JSON) ----------

export interface CreateUserRequest {
  displayName: string
  walletAddress?: string | null
}

export interface CreateQuizRequest {
  creatorId: string
  title: string
  description?: string
  currency: Currency
  entryAmount: number
  durationSeconds: number
  startsAt?: string | null
  minParticipants?: number
}

export interface CreateQuestionRequest {
  position: number
  questionText: string
  optionA: string
  optionB: string
  optionC: string
  optionD: string
  correctOption: OptionKey
  explanation?: string | null
}

export interface AnswerRequest {
  participantId: string
  questionId: string
  selectedOption: OptionKey
}

export interface QuizListFilters {
  status?: QuizStatus | 'ALL'
}

export interface ResultRow {
  participantId: string
  displayName: string
  correctAnswers: number
  totalQuestions: number
  scorePercentage: number
  rank: number
  entryAmount: number
  payout: number
  payoutKind: 'winner' | 'consolation' | 'refund' | 'bonus' | 'none'
}

export interface QuizResults {
  quizId: string
  status: QuizStatus
  resultVersion: number
  prizePool: number
  rows: ResultRow[]
}

// ---------- AI generation (Track A) ----------

export interface GenerateQuestionsRequest {
  material: string
  numQuestions: number
}

/** AI draft as returned by POST /api/generate (compact, matches the editor shape). */
export interface AiDraftQuestion {
  text: string
  options: string[]
  correctIndex: number
  explanation: string | null
}

export interface GenerateQuestionsResponse {
  source: 'ai' | 'fallback'
  questions: AiDraftQuestion[]
}

// ---------- Material upload (Track B) ----------

export interface UploadMaterialResponse {
  text: string
  pages: number
  chars: number
  truncated: boolean
}

// ---------- Review & history ----------

/** A question as seen in post-quiz review — correct answer + your answer revealed */
export interface ReviewQuestion {
  id: string
  position: number
  questionText: string
  options: ReadonlyArray<{ key: OptionKey; text: string }>
  correctOption: OptionKey
  explanation: string | null
  myAnswer: OptionKey | null
  wasCorrect: boolean | null
}

export interface HistoryEntry {
  quizId: string
  title: string
  status: QuizStatus
  rank: number | null
  correctAnswers: number
  questionCount: number
  payout: number
  entryAmount: number
  payoutKind: ResultRow['payoutKind']
}

// ---------- API interface (implemented by both real client and mock) ----------

  export interface QestiaApi {
  getConfig(): Promise<AppConfig>
  createUser(req: CreateUserRequest): Promise<User>
  linkWallet(userId: string, walletAddress: string, deviceId?: string): Promise<{ id: string; walletAddress: string | null; deviceId: string | null }>
  createQuiz(req: CreateQuizRequest): Promise<{ quizId: string; status: QuizStatus }>
  addQuestion(quizId: string, req: CreateQuestionRequest): Promise<{ questionId: string; position: number }>
  getQuiz(quizId: string): Promise<Quiz>
  listQuizzes(filters?: QuizListFilters): Promise<Quiz[]>
  publishQuiz(quizId: string): Promise<{ quizId: string; status: QuizStatus }>
  openQuiz(quizId: string): Promise<{ quizId: string; status: QuizStatus }>
  startQuiz(quizId: string): Promise<{ quizId: string; status: QuizStatus }>
  joinQuiz(quizId: string, userId: string): Promise<JoinResult>
  verifyCommitment(quizId: string, participantId: string, txRef: string): Promise<VerifyCommitmentResult>
  getCommitment(quizId: string, participantId: string): Promise<CommitmentStatus>
  getParticipants(quizId: string): Promise<Participant[]>
  getQuizState(quizId: string, userId?: string): Promise<QuizState>
  getQuestions(quizId: string, userId?: string): Promise<PlayerQuestion[]>
  submitAnswer(quizId: string, req: AnswerRequest): Promise<{ accepted: boolean; correct: boolean }>
  getResults(quizId: string): Promise<QuizResults>
  getReview(quizId: string, userId: string): Promise<ReviewQuestion[]>
  getMyHistory(userId: string): Promise<HistoryEntry[]>
  generateQuestions(req: GenerateQuestionsRequest): Promise<GenerateQuestionsResponse>
  uploadMaterial(file: File): Promise<UploadMaterialResponse>
}
