import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type User = { id: number; name: string; email: string; studentId: string; isAdmin: boolean };
export type QuizQuestion = {
  id: number; category: string; topic: string; stage: string; difficulty: string;
  question: string; options: string[];
};

const storedUser = ((): User | null => {
  try {
    const raw = localStorage.getItem("simt-quiz-user");
    return raw ? (JSON.parse(raw) as User) : null;
  } catch { return null; }
})();

const authSlice = createSlice({
  name: "auth",
  initialState: { user: storedUser as User | null },
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      try { localStorage.setItem("simt-quiz-user", JSON.stringify(action.payload)); } catch { /* ignore */ }
    },
    logout: (state) => {
      state.user = null;
      try { localStorage.removeItem("simt-quiz-user"); } catch { /* ignore */ }
    },
  },
});

export type ReviewItem = {
  question: string;
  topic: string;
  options: string[];
  selectedIndex: number; // -1 = time out, no answer
  correctIndex: number;
  explanation: string;
  correct: boolean;
};

type QuizState = {
  category: string;
  questions: QuizQuestion[];
  index: number;
  score: number;
  streak: number;
  bestStreak: number;
  finished: boolean;
  review: ReviewItem[];
};

const initialQuiz: QuizState = {
  category: "", questions: [], index: 0, score: 0, streak: 0, bestStreak: 0, finished: false, review: [],
};

const quizSlice = createSlice({
  name: "quiz",
  initialState: initialQuiz,
  reducers: {
    startSession: (state, action: PayloadAction<{ category: string; questions: QuizQuestion[] }>) => {
      state.category = action.payload.category;
      state.questions = action.payload.questions;
      state.index = 0; state.score = 0; state.streak = 0; state.bestStreak = 0; state.finished = false; state.review = [];
    },
    recordAnswer: (state, action: PayloadAction<{ correct: boolean; review: ReviewItem }>) => {
      state.review.push(action.payload.review);
      if (action.payload.correct) {
        state.score += 1;
        state.streak += 1;
        state.bestStreak = Math.max(state.bestStreak, state.streak);
      } else {
        state.streak = 0;
      }
    },
    advance: (state) => {
      if (state.index + 1 >= state.questions.length) state.finished = true;
      else state.index += 1;
    },
    resetQuiz: () => initialQuiz,
  },
});

export const { setUser, logout } = authSlice.actions;
export const { startSession, recordAnswer, advance, resetQuiz } = quizSlice.actions;

export const store = configureStore({
  reducer: { auth: authSlice.reducer, quiz: quizSlice.reducer },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
