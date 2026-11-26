import { useEffect, useMemo, useRef, useState } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim, fileToBase64 } from "@hatch/space-sdk/client";
import { actionFields } from "@hatch/space-sdk/fields" with { type: "macro" };
import { api, type ApiResponse } from "./api";
import {
store, setUser, logout, startSession, recordAnswer, advance, resetQuiz,
type RootState, type AppDispatch, type User,
} from "./store";
import type { Actions } from "../../server/src/actions";
import simtLogo from "./assets/simt-eng-logo.webp";
import heroCampus from "./assets/hero-campus.webp";
import arghaPhoto from "./assets/argha-photo.jpg";

const FIELDS = actionFields<typeof Actions>();

type View = "home" | "quiz" | "result" | "history" | "leaderboard" | "admin" | "live";
type Category = ApiResponse<typeof api, "getCategories">["categories"][number];

/* ============ Official SIMT logo + institute name (header brand) ============ */
const InstituteBrand = ({ dark = false, small = false }: { dark?: boolean; small?: boolean }) => (
  <div className="flex items-center gap-3">
    <img src={simtLogo} alt="SIMT Engineering College shield logo — Saic Institute of Management and Technology"
      className={`${small ? "h-12 w-12" : "h-16 w-16"} shrink-0 rounded-2xl bg-white object-contain p-1 shadow-lg ring-2 ring-white/60`} />
    <div className="leading-tight">
      <p className={`font-display font-extrabold ${small ? "text-[15px]" : "text-lg"} ${dark ? "text-slate-900" : ""}`}>
        Saic Institute of Management<br className="hidden sm:block" /> and Technology
      </p>
      <p className={`text-[11px] font-semibold tracking-wide ${dark ? "text-slate-500" : "opacity-75"}`}>
        Dept. of CSE • Affiliated to University of Dhaka
      </p>
    </div>
  </div>
);

/* ================= Campus contact (footer section) ================= */
const DEFAULT_CONTACT = {
  address: "M/3, Section-14, Mirpur, Dhaka-1216",
  phone1: "01961 614 776",
  phone2: "01936 005 818",
  email: "simt.dhaka@gmail.com",
  website: "simt.ac.bd",
};
const telHref = (phone: string) => `tel:+88${phone.replace(/[^0-9]/g, "")}`;

const ContactSection = ({ dark = false }: { dark?: boolean }) => {
  const contactQuery = useQuery({ queryKey: ["contact-info"], queryFn: () => api.getContactInfo({}) });
  const c = contactQuery.data?.contact ?? DEFAULT_CONTACT;
  const linkCls = `underline-offset-2 hover:underline ${dark ? "text-emerald-300" : "text-[#0b5ed7]"}`;
  const labelCls = `text-[11px] font-bold uppercase tracking-wider ${dark ? "text-slate-400" : "text-[var(--dim)]"}`;
  return (
    <section aria-label="Campus contact information"
      className={dark
        ? "rounded-3xl border border-white/12 bg-white/8 px-5 py-5 backdrop-blur-md"
        : "mt-8 rounded-[24px] bg-[var(--surface)] p-5 shadow-sm ring-1 ring-[var(--border)]"}>
      <h3 className={`font-display text-lg font-extrabold ${dark ? "text-white" : "text-[var(--text)]"}`}>📞 যোগাযোগ</h3>
      <p className={`mt-0.5 text-[13px] ${dark ? "text-slate-300" : "text-[var(--dim)]"}`}>Saic Institute of Management and Technology (SIMT)</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="flex gap-3">
          <span aria-hidden className="text-xl">📍</span>
          <div>
            <p className={labelCls}>ঠিকানা</p>
            <p className={`text-sm font-semibold leading-snug ${dark ? "text-slate-100" : "text-[var(--text)]"}`}>{c.address}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <span aria-hidden className="text-xl">📱</span>
          <div>
            <p className={labelCls}>ফোন (WhatsApp)</p>
            <p className="text-sm font-semibold leading-snug">
              <a href={telHref(c.phone1)} className={linkCls}>{c.phone1}</a>
              <span className={dark ? "text-slate-400" : "text-[var(--dim)]"}> • </span>
              <a href={telHref(c.phone2)} className={linkCls}>{c.phone2}</a>
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <span aria-hidden className="text-xl">✉️</span>
          <div>
            <p className={labelCls}>ইমেইল</p>
            <p className="text-sm font-semibold leading-snug">
              <a href={`mailto:${c.email}`} className={`break-all ${linkCls}`}>{c.email}</a>
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <span aria-hidden className="text-xl">🌐</span>
          <div>
            <p className={labelCls}>অফিসিয়াল ওয়েবসাইট</p>
            <p className="text-sm font-semibold leading-snug">
              <a href={`https://${c.website.replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer" className={linkCls}>{c.website}</a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ================= Footer credit (every page) ================= */
const FooterCredit = ({ dark = false }: { dark?: boolean }) => (
  <footer className="px-4 py-5">
    <div className={`mx-auto flex max-w-xl items-center justify-center gap-3 text-center ${dark ? "" : ""}`}>
      <img src={arghaPhoto} alt="Argha Paul — developer of this platform"
        className="h-12 w-12 shrink-0 rounded-full object-cover object-top shadow-lg ring-2 ring-emerald-400/70" />
      <p className={`text-left text-xs leading-relaxed ${dark ? "text-slate-400" : "text-[var(--dim)]"}`}>
        Developed by <strong className={dark ? "text-slate-100" : "text-[var(--text)]"}>Argha Paul</strong>, Student ID: CSE-2324001,
        B.Sc. in Computer Science &amp; Engineering, Dept. of CSE, Saic Institute of Management and Technology (SIMT)
      </p>
    </div>
  </footer>
);

const fmtDateTime = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";

/* ================= Animated login / signup ================= */
const GLYPHS = ["{ }", "</>", "( )", "∑", "#", "fn()", "01", "if…", "&&", "SQL", "int", "=>", "π", "while"];
const TEASERS = [
  { q: "A stack follows which order?", a: "LIFO — Last In, First Out" },
  { q: "Binary of decimal 10?", a: "1010" },
  { q: "Which SQL command reads data?", a: "SELECT" },
  { q: "1 byte = how many bits?", a: "8 bits" },
];

const AuthScreen = () => {
  const dispatch = useDispatch<AppDispatch>();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"login" | "signup" | "admin">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [teaserIdx, setTeaserIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTeaserIdx((i) => (i + 1) % TEASERS.length), 4200);
    return () => clearInterval(t);
  }, []);

  const onDone = (user: User) => {
    dispatch(setUser(user));
    queryClient.invalidateQueries();
  };

  const loginMut = useMutation({
    mutationFn: async () => await api.login({ email, password }),
    onSuccess: (r) => onDone(r.user),
    onError: (e) => setFormError(e instanceof Error ? e.message : "Login হয়নি, আবার চেষ্টা করো।"),
  });
  const signupMut = useMutation({
    mutationFn: async () => await api.signup({ name, email, studentId, password }),
    onSuccess: (r) => onDone(r.user),
    onError: (e) => setFormError(e instanceof Error ? e.message : "Signup হয়নি, আবার চেষ্টা করো।"),
  });
  // Admin logs in with his own personal account; the server grants the
  // admin role only on that account. Any other account is refused here.
  const adminLoginMut = useMutation({
    mutationFn: async () => await api.login({ email, password }),
    onSuccess: (r) => {
      if (r.user.isAdmin) onDone(r.user);
      else setFormError("এই অ্যাকাউন্টে অ্যাডমিন অ্যাক্সেস নেই। শুধুমাত্র অ্যাডমিনের নিজের অ্যাকাউন্ট দিয়েই Admin Dashboard খোলা যাবে।");
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : "Admin login হয়নি, আবার চেষ্টা করো।"),
  });

  const submit = () => {
    setFormError("");
    if (mode === "signup" && name.trim().length < 2) { setFormError("তোমার পুরো নামটা লেখো।"); return; }
    if (mode === "signup" && !/^CSE-\d{7}$/.test(studentId.trim())) {
      setFormError("Student ID সঠিক ফরম্যাটে দাও: CSE-2324001 — CSE- দিয়ে শুরু করে মোট ৭টি সংখ্যা।");
      return;
    }
    if (!email.includes("@")) { setFormError("সঠিক ইমেইল ঠিকানা দাও।"); return; }
    if (password.length < 4) { setFormError("পাসওয়ার্ড অন্তত ৪ অক্ষরের হতে হবে।"); return; }
    if (mode === "login") loginMut.mutate();
    else if (mode === "admin") adminLoginMut.mutate();
    else signupMut.mutate();
  };

  const teaser = TEASERS[teaserIdx] ?? TEASERS[0]!;

  return (
    <div className="mesh-bg relative min-h-screen overflow-hidden text-white">
      {/* floating code glyphs */}
      {GLYPHS.map((g, i) => (
        <span key={g + i} aria-hidden className="anim-floaty pointer-events-none absolute select-none font-display font-bold text-white"
          style={{
            left: `${(i * 67) % 92 + 2}%`, top: `${(i * 37) % 88 + 4}%`,
            fontSize: `${18 + (i % 4) * 9}px`,
            ["--rot" as string]: `${(i % 5) * 9 - 18}deg`, ["--op" as string]: 0.16 + (i % 3) * 0.1,
            animationDelay: `${i * 0.55}s`,
          }}>{g}</span>
      ))}
      <div aria-hidden className="anim-spin-slow pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border-[22px] border-dashed border-sky-400/20" />
      <div aria-hidden className="anim-spin-slow pointer-events-none absolute -left-28 bottom-10 h-64 w-64 rounded-full border-[18px] border-emerald-400/15" style={{ animationDirection: "reverse" }} />
      {/* aurora glow blobs */}
      <div aria-hidden className="anim-aurora pointer-events-none absolute -left-20 top-1/4 h-80 w-80 rounded-full bg-emerald-500/25 blur-3xl" />
      <div aria-hidden className="anim-aurora pointer-events-none absolute -right-16 top-1/2 h-72 w-72 rounded-full bg-sky-500/25 blur-3xl" style={{ animationDelay: "-6s" }} />
      <div aria-hidden className="anim-aurora pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-amber-500/15 blur-3xl" style={{ animationDelay: "-3s" }} />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center gap-8 px-4 py-10 md:flex-row md:gap-14">
        {/* Hero side */}
        <div className="anim-pop max-w-md text-center md:text-left">
          <div className="flex justify-center md:justify-start"><InstituteBrand /></div>
          <p className="font-display mt-4 text-sm font-bold uppercase tracking-[.2em] text-amber-300">SIMT CSE Quiz Platform</p>
          <h1 className="font-display mt-6 text-4xl font-extrabold leading-tight md:text-5xl">
            CSE Quiz খেলো,<br />
            <span className="text-anim-gradient">নিজের স্কোর</span> নিজেই<br />দেখো 🎯
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-300">
            CSE-এর সব গুরুত্বপূর্ণ টপিকের প্রশ্ন — আগে পড়া বিষয়, এখনকার কোর টপিক,
            আর সামনে যা আসছে তার হালকা ঝলক। খুব কঠিন না, সবাই পারবে।
          </p>
          {/* live teaser card */}
          <div className="mt-6 rounded-3xl border border-white/15 bg-white/10 p-4 text-left shadow-2xl backdrop-blur-md">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-300">⚡ Live teaser question</p>
            <div key={teaserIdx} className="anim-ticker">
              <p className="font-display mt-1 text-lg font-bold">{teaser.q}</p>
              <p className="mt-1 text-sm text-emerald-300">✔ উত্তর: {teaser.a}</p>
            </div>
            <div className="mt-3 flex gap-1.5">
              {TEASERS.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === teaserIdx ? "w-7 bg-emerald-400" : "w-2.5 bg-white/30"}`} />
              ))}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs font-semibold md:justify-start">
            <span className="rounded-full bg-white/10 px-3 py-1.5">📚 ৭টি ক্যাটাগরি</span>
            <span className="rounded-full bg-white/10 px-3 py-1.5">❓ বিশাল প্রশ্ন ব্যাংক</span>
            <span className="rounded-full bg-white/10 px-3 py-1.5">🏆 লিডারবোর্ড</span>
            <span className="rounded-full bg-white/10 px-3 py-1.5">⏱️ টাইমার চ্যালেঞ্জ</span>
          </div>
        </div>

        {/* Auth card */}
        <div className="anim-pop w-full max-w-sm rounded-[28px] border border-white/15 bg-white/95 p-6 text-slate-900 shadow-2xl" style={{ animationDelay: ".12s" }}>
          <div aria-hidden className="mb-5 h-1.5 rounded-full bg-gradient-to-r from-[#0b5ed7] via-emerald-400 to-amber-400" />
          {mode === "admin" ? (
            <div className="rounded-2xl bg-slate-900 px-4 py-3 text-center">
              <p className="font-display text-sm font-extrabold text-white">🛡️ Admin Login</p>
              <p className="text-[11px] text-slate-400">শুধুমাত্র অ্যাডমিনের জন্য</p>
            </div>
          ) : (
          <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1" role="tablist" aria-label="Login or signup">
            {(["login", "signup"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setFormError(""); }}
                className={`font-display rounded-xl py-2 text-sm font-bold transition-all ${mode === m ? "bg-[#0b5ed7] text-white shadow-lg" : "text-slate-500"}`}>
                {m === "login" ? "Login" : "Sign Up"}
              </button>
            ))}
          </div>
          )}

          <h2 className="font-display mt-5 text-xl font-extrabold">
            {mode === "admin" ? "Admin Dashboard-এ ঢোকো 🛡️" : mode === "login" ? "ফিরে আসায় স্বাগতম! 👋" : "নিজের অ্যাকাউন্ট খোলো 🚀"}
          </h2>
          <p className="mt-0.5 text-[13px] text-slate-500">
            {mode === "admin" ? "অ্যাডমিন তার নিজের অ্যাকাউন্ট (ইমেইল + পাসওয়ার্ড) দিয়েই লগইন করে।" : mode === "login" ? "নিজের অ্যাকাউন্টে লগইন করে নিজের স্কোর দেখো।" : "প্রত্যেকের আলাদা অ্যাকাউন্ট — স্কোর শুধু তুমিই দেখবে।"}
          </p>

          <div className="mt-4 space-y-3">
            {mode === "signup" && (
              <>
                <div>
                  <label htmlFor="su-name" className="text-[13px] font-semibold text-slate-600">পুরো নাম</label>
                  <input id="su-name" {...FIELDS.signup.name} value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Argha Paul" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] outline-none transition focus:border-[#0b5ed7] focus:ring-4 focus:ring-blue-100" />
                </div>
                <div>
                  <label htmlFor="su-sid" className="text-[13px] font-semibold text-slate-600">Student ID <span className="text-rose-500">*</span></label>
                  <input id="su-sid" {...FIELDS.signup.studentId} value={studentId} onChange={(e) => setStudentId(e.target.value.toUpperCase())}
                    placeholder="CSE-2324001" autoCapitalize="characters" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] outline-none transition placeholder:text-slate-300 focus:border-[#0b5ed7] focus:ring-4 focus:ring-blue-100" />
                  <p className="mt-1 text-[12px] text-slate-400">ফরম্যাট: CSE- দিয়ে শুরু, তারপর ৭টি সংখ্যা</p>
                </div>
              </>
            )}
            <div>
              <label htmlFor="auth-email" className="text-[13px] font-semibold text-slate-600">ইমেইল</label>
              <input id="auth-email" {...FIELDS.login.email} value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] outline-none transition focus:border-[#0b5ed7] focus:ring-4 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="auth-pass" className="text-[13px] font-semibold text-slate-600">পাসওয়ার্ড</label>
              <input id="auth-pass" {...FIELDS.login.password} value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                placeholder="••••••••" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] outline-none transition focus:border-[#0b5ed7] focus:ring-4 focus:ring-blue-100" />
            </div>
          </div>

          {formError && <p role="alert" className="anim-shake mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-600">{formError}</p>}

          <button onClick={submit} disabled={loginMut.isPending || signupMut.isPending || adminLoginMut.isPending}
            className={`font-display mt-5 w-full rounded-2xl py-3 text-base font-extrabold text-white shadow-lg transition hover:brightness-110 active:scale-[.98] disabled:opacity-60 ${mode === "admin" ? "bg-gradient-to-r from-slate-800 to-slate-600" : "bg-gradient-to-r from-[#0b5ed7] to-emerald-500"}`}>
            {(loginMut.isPending || signupMut.isPending || adminLoginMut.isPending) ? "একটু অপেক্ষা করো…" : mode === "admin" ? "🛡️ Admin Dashboard খোলো →" : mode === "login" ? "Login করে কুইজ শুরু করো →" : "অ্যাকাউন্ট খুলে শুরু করো →"}
          </button>
          {mode === "admin" ? (
            <button onClick={() => { setMode("login"); setFormError(""); }}
              className="mt-3 w-full text-center text-[13px] font-bold text-[#0b5ed7] underline-offset-2 hover:underline">
              ← Student Login-এ ফিরে যাও
            </button>
          ) : (
            <button onClick={() => { setMode("admin"); setFormError(""); }}
              className="font-display mt-3 w-full rounded-2xl border-2 border-dashed border-slate-300 py-2.5 text-sm font-extrabold text-slate-600 transition hover:border-slate-800 hover:text-slate-900 active:scale-[.99]">
              🛡️ Admin Login
            </button>
          )}
          <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
            Dept. of CSE • SIMT, Mirpur, Dhaka<br />React + Redux • REST-style API • Database-backed scores
          </p>
        </div>
      </div>

      {/* ------- Information section (professional landing content) ------- */}
      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-14">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="anim-pop rounded-3xl border border-white/12 bg-white/8 p-5 backdrop-blur-md" style={{ animationDelay: ".05s" }}>
            <p className="text-3xl">🎓</p>
            <h3 className="font-display mt-2 text-lg font-extrabold">SIMT সম্পর্কে</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">
              Saic Institute of Management and Technology (SIMT), Mirpur, Dhaka — ঢাকা বিশ্ববিদ্যালয়ের
              অধিভুক্ত একটি ইঞ্জিনিয়ারিং ইনস্টিটিউট। এই প্ল্যাটফর্মটি SIMT-এর CSE বিভাগের
              শিক্ষার্থীদের জন্য তৈরি।
            </p>
          </div>
          <div className="anim-pop rounded-3xl border border-white/12 bg-white/8 p-5 backdrop-blur-md" style={{ animationDelay: ".12s" }}>
            <p className="text-3xl">🧭</p>
            <h3 className="font-display mt-2 text-lg font-extrabold">কীভাবে কাজ করে</h3>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
              <li>নিজের নাম, Student ID (CSE-2324001), ইমেইল আর পাসওয়ার্ড দিয়ে অ্যাকাউন্ট খোলো</li>
              <li>৭টি ক্যাটাগরি থেকে পছন্দের টপিক বেছে কুইজ খেলো</li>
              <li>প্রতি উত্তরে সাথে সাথে ব্যাখ্যা, শেষে ডিটেইল রেজাল্ট ও র‍্যাংক</li>
            </ol>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/12 bg-white/8 px-5 py-4 backdrop-blur-md">
          <p className="text-sm text-slate-300">🏗️ <strong className="text-white">Tech stack:</strong> React frontend • Redux state • REST-style API • Relational database — arrow functions জুড়ে</p>
          <p className="text-sm font-semibold text-emerald-300">প্রত্যেকের নিজের অ্যাকাউন্ট • নিজের স্কোর শুধু নিজের কাছেই 🔒</p>
        </div>
        <div className="mt-4"><ContactSection dark /></div>
        <FooterCredit dark />
      </div>
    </div>
  );
};

/* ================= Profile card (own photo upload) ================= */
const ProfileCard = () => {
  const user = useSelector((s: RootState) => s.auth.user);
  const queryClient = useQueryClient();
  const [err, setErr] = useState("");
  const profile = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: () => api.getMyProfile({ userId: user!.id }),
    enabled: !!user,
  });
  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const img = await fileToBase64(file);
      return await api.setProfilePhoto({ userId: user!.id, image: { dataBase64: img.dataBase64, mimeType: img.mimeType } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      setErr("");
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "ছবি আপলোড হয়নি, আবার চেষ্টা করো।"),
  });
  if (!user) return null;
  const photo = profile.data?.photoUrl;
  return (
    <section aria-label="My profile" className="anim-pop mt-4 flex items-center gap-3.5 rounded-[24px] bg-[var(--surface)] p-4 shadow-sm ring-1 ring-[var(--border)]">
      {photo ? (
        <img src={photo} alt={`${user.name} — profile photo`} className="h-16 w-16 shrink-0 rounded-full object-cover shadow ring-2 ring-emerald-400/60" />
      ) : (
        <span aria-hidden className="font-display flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0b5ed7] to-emerald-500 text-2xl font-extrabold text-white shadow">
          {user.name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg font-extrabold leading-tight text-[var(--text)]">{user.name}</p>
        <p className="truncate text-[13px] text-[var(--dim)]">🪪 {user.studentId} • ✉️ {user.email}</p>
        <label className="mt-1.5 inline-block cursor-pointer rounded-full bg-[var(--surface2)] px-3.5 py-1.5 text-[13px] font-bold text-[var(--text)] ring-1 ring-[var(--border)] transition hover:ring-[#0b5ed7]/60">
          {uploadMut.isPending ? "আপলোড হচ্ছে…" : photo ? "📷 ছবি বদলাও" : "📷 প্রোফাইল ছবি যোগ করো"}
          <input type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Upload your profile photo"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMut.mutate(f); e.target.value = ""; }} />
        </label>
        {err && <p role="alert" className="mt-1 text-xs font-semibold text-rose-500">{err}</p>}
      </div>
    </section>
  );
};

/* ================= Home ================= */
const HomeScreen = ({ go }: { go: (v: View) => void }) => {
  const user = useSelector((s: RootState) => s.auth.user);
  const dispatch = useDispatch<AppDispatch>();
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api.getCategories({}) });
  const stats = useQuery({
    queryKey: ["my-stats", user?.id],
    queryFn: () => api.getMyStats({ userId: user!.id }),
    enabled: !!user,
  });

  const startMut = useMutation({
    mutationFn: async (v: { category: string; count: number }) => await api.startQuiz({ category: v.category, count: v.count, userId: user?.id }),
    onSuccess: (r, v) => {
      if (r.questions.length === 0) return;
      dispatch(startSession({ category: v.category, questions: r.questions }));
      go("quiz");
    },
  });

  const totalQ = (categories.data?.categories ?? []).reduce((s, c) => s + c.count, 0);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4">
      <header className="flex items-center justify-between gap-3">
        <div className="rounded-2xl bg-[var(--surface)] px-3 py-2 shadow-sm ring-1 ring-[var(--border)] text-[var(--text)]"><InstituteBrand small /></div>
        <div className="flex shrink-0 gap-2">
          {user?.isAdmin && (
            <button onClick={() => go("admin")} aria-label="Open admin dashboard"
              className="font-display rounded-full bg-slate-900 px-4 py-2 text-sm font-extrabold text-white shadow-md transition hover:brightness-125 active:scale-[.97]">
              🛡️ Admin
            </button>
          )}
          <button onClick={() => dispatch(logout())} aria-label="Logout"
            className="rounded-full bg-[var(--surface)] px-4 py-2 text-sm font-bold text-[var(--dim)] shadow-sm ring-1 ring-[var(--border)] transition hover:text-rose-500">
            Logout ⎋
          </button>
        </div>
      </header>

      <section className="anim-pop relative mt-5 overflow-hidden rounded-[28px] text-white shadow-xl ring-1 ring-[#0b5ed7]/30">
        <img src={heroCampus} alt="SIMT campus at dusk with glowing quiz holograms — illustrated hero wallpaper" className="absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="anim-sweep absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/14 to-transparent" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-[#081226]/92 via-[#0a1c3d]/72 to-[#0a1c3d]/15" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#081226]/85 via-transparent to-transparent" />
        <div className="relative p-5 sm:p-7">
        <p className="text-sm font-medium text-blue-200">আসসালামু আলাইকুম,</p>
        <h2 className="font-display text-3xl font-extrabold drop-shadow sm:text-4xl">{user?.name} 👋</h2>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-blue-100">
          B.Sc. in CSE • Saic Institute of Management and Technology — আজ কোন টপিকে কুইজ খেলবে?
        </p>
        {user?.studentId && (
          <p className="mt-2 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-bold tracking-wide text-blue-50 backdrop-blur">🪪 {user.studentId}</p>
        )}
        <div className="mt-4 grid grid-cols-3 gap-2.5 text-center">
          <div className="rounded-2xl bg-white/15 px-2 py-3 backdrop-blur">
            <p className="font-display text-2xl font-extrabold">{stats.data?.totalAttempts ?? 0}</p>
            <p className="text-[11px] text-blue-100">খেলা কুইজ</p>
          </div>
          <div className="rounded-2xl bg-white/15 px-2 py-3 backdrop-blur">
            <p className="font-display text-2xl font-extrabold">{stats.data?.totalCorrect ?? 0}</p>
            <p className="text-[11px] text-blue-100">সঠিক উত্তর</p>
          </div>
          <div className="rounded-2xl bg-white/15 px-2 py-3 backdrop-blur">
            <p className="font-display text-2xl font-extrabold">{stats.data?.bestPercent ?? 0}%</p>
            <p className="text-[11px] text-blue-100">সেরা স্কোর</p>
          </div>
        </div>
        <button onClick={() => startMut.mutate({ category: "Mixed Quiz", count: 30 })} disabled={startMut.isPending}
          className="font-display anim-bounce-soft mt-4 w-full rounded-2xl bg-amber-400 py-3 text-base font-extrabold text-amber-950 shadow-lg transition hover:brightness-105 active:scale-[.98] disabled:opacity-60">
          🎲 Individual Random Quiz — ৩০টি র‍্যান্ডম প্রশ্ন
        </button>
        <p className="mt-1.5 text-center text-[11px] font-medium text-blue-100">প্রতিবার নতুন সেট • Easy, Medium ও Hard-এর ব্যালান্সড মিক্স • আগে দেওয়া প্রশ্ন আগে আসে না</p>
        <button onClick={() => go("live")}
          className="font-display mt-3 w-full rounded-2xl bg-white/15 py-3 text-base font-extrabold text-white shadow-lg ring-1 ring-white/40 backdrop-blur transition hover:bg-white/25 active:scale-[.98]">
          👥 Live Group Quiz — সবাই একসাথে, লাইভ লিডারবোর্ড →
        </button>
        </div>
      </section>

      <ProfileCard />

      <h3 className="font-display mt-7 text-xl font-extrabold text-[var(--text)]">ক্যাটাগরি বেছে নাও</h3>
      <p className="text-sm text-[var(--dim)]">মোট {totalQ}টি প্রশ্ন • প্রতি কুইজে ১০টি, প্রতি প্রশ্নে ৩০ সেকেন্ড</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(categories.data?.categories ?? []).map((c: Category, i: number) => (
          <button key={c.name} onClick={() => startMut.mutate({ category: c.name, count: 10 })} disabled={startMut.isPending}
            className="anim-pop group rounded-[24px] bg-[var(--surface)] p-5 text-left shadow-sm ring-1 ring-[var(--border)] transition hover:-translate-y-1 hover:shadow-xl active:scale-[.99]"
            style={{ animationDelay: `${i * 0.06}s` }}>
            <div className="flex items-start justify-between">
              <span className="rounded-2xl bg-gradient-to-br from-blue-100 to-emerald-100 p-2.5 text-4xl shadow-inner transition group-hover:rotate-6 group-hover:scale-110 dark:from-blue-950 dark:to-emerald-950">{c.emoji}</span>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${c.stageLabel === "Coming up" ? "bg-amber-100 text-amber-700" : c.stageLabel === "Current core" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{c.stageLabel}</span>
            </div>
            <p className="font-display mt-3 text-lg font-extrabold text-[var(--text)]">{c.name}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-[var(--dim)]">{c.tagline}</p>
            <p className="mt-3 text-[13px] font-bold text-[#0b5ed7]">{c.count}টি প্রশ্ন • খেলো →</p>
          </button>
        ))}
        {categories.isPending && <p className="text-sm text-[var(--dim)]">ক্যাটাগরি লোড হচ্ছে…</p>}
      </div>

      <ContactSection />

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[var(--surface)]/95 pb-safe backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-3">
          <button onClick={() => go("home")} className="py-3 text-center text-sm font-bold text-[#0b5ed7]">🏠 হোম</button>
          <button onClick={() => go("history")} className="py-3 text-center text-sm font-bold text-[var(--dim)]">📜 আমার স্কোর</button>
          <button onClick={() => go("leaderboard")} className="py-3 text-center text-sm font-bold text-[var(--dim)]">🏆 লিডারবোর্ড</button>
        </div>
      </nav>
    </div>
  );
};

/* ================= Quiz ================= */
const QUESTION_SECONDS = 30;

const QuizScreen = ({ go }: { go: (v: View) => void }) => {
  const dispatch = useDispatch<AppDispatch>();
  const quiz = useSelector((s: RootState) => s.quiz);
  const q = quiz.questions[quiz.index];
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ correct: boolean; correctIndex: number; explanation: string } | null>(null);
  const [seconds, setSeconds] = useState(QUESTION_SECONDS);
  const answeredRef = useRef(false);

  const checkMut = useMutation({
    mutationFn: async (sel: number) => await api.checkAnswer({ questionId: q!.id, selectedIndex: sel }),
    onSuccess: (r, sel) => {
      setFeedback(r);
      if (q) {
        dispatch(recordAnswer({
          correct: r.correct,
          review: {
            question: q.question, topic: q.topic, options: q.options,
            selectedIndex: sel, correctIndex: r.correctIndex,
            explanation: r.explanation, correct: r.correct,
          },
        }));
      }
    },
  });

  const answer = (sel: number) => {
    if (answeredRef.current || !q) return;
    answeredRef.current = true;
    setSelected(sel);
    checkMut.mutate(sel);
  };

  useEffect(() => {
    setSelected(null); setFeedback(null); setSeconds(QUESTION_SECONDS); answeredRef.current = false;
  }, [quiz.index]);

  useEffect(() => {
    if (feedback) return;
    const t = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [feedback, quiz.index]);

  useEffect(() => { if (seconds <= 0 && !feedback) answer(-1); }, [seconds, feedback]);

  useEffect(() => { if (quiz.finished) go("result"); }, [quiz.finished, go]);

  if (!q) return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <p className="text-[var(--dim)]">কোনো কুইজ চলছে না।</p>
      <button onClick={() => go("home")} className="font-display mt-4 rounded-2xl bg-[#0b5ed7] px-6 py-3 font-bold text-white">হোমে যাও</button>
    </div>
  );

  const progress = ((quiz.index) / quiz.questions.length) * 100;
  const timerPct = (seconds / QUESTION_SECONDS) * 100;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => { dispatch(resetQuiz()); go("home"); }} aria-label="Quit quiz"
          className="rounded-full bg-[var(--surface)] px-4 py-2 text-sm font-bold text-[var(--dim)] ring-1 ring-[var(--border)]">✕ ছেড়ে দাও</button>
        <span className="rounded-full bg-[var(--surface)] px-3.5 py-2 text-sm font-bold text-[var(--text)] ring-1 ring-[var(--border)]">{quiz.category}</span>
        <span className={`rounded-full bg-amber-100 px-3.5 py-2 text-sm font-extrabold text-amber-700 ${quiz.streak >= 3 ? "anim-bounce-soft" : ""}`}>🔥 Streak {quiz.streak}</span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--surface2)]">
          <div className="h-full rounded-full bg-gradient-to-r from-[#0b5ed7] to-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-sm font-bold text-[var(--dim)]">{quiz.index + 1}/{quiz.questions.length}</span>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <span className={`font-display text-lg font-extrabold ${seconds <= 8 ? "anim-shake text-rose-500" : "text-[var(--text)]"}`}>⏱️ {Math.max(seconds, 0)}s</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface2)]">
          <div className={`h-full rounded-full transition-all duration-1000 ${seconds <= 8 ? "bg-rose-500" : "bg-amber-400"}`} style={{ width: `${timerPct}%` }} />
        </div>
        <span className="text-sm font-bold text-emerald-500">⭐ Score {quiz.score}</span>
      </div>

      <div key={quiz.index} className="anim-slide-q mt-5 rounded-[28px] bg-[var(--surface)] p-5 shadow-lg ring-1 ring-[var(--border)] sm:p-7">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold text-blue-700">{q.topic}</span>
          <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${q.difficulty === "Hard" ? "bg-rose-100 text-rose-700" : q.difficulty === "Easy" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {q.difficulty === "Hard" ? "🔴 Hard" : q.difficulty === "Easy" ? "🟢 Easy" : "🟡 Medium"}
          </span>
        </div>
        <h2 className="font-display mt-3 text-[22px] font-extrabold leading-snug text-[var(--text)] sm:text-2xl">{q.question}</h2>

        <div className="mt-5 space-y-2.5">
          {q.options.map((opt, i) => {
            const isPicked = selected === i;
            const isCorrect = feedback && feedback.correctIndex === i;
            const isWrongPick = feedback && isPicked && !feedback.correct;
            return (
              <button key={i} onClick={() => answer(i)} disabled={!!feedback || checkMut.isPending}
                aria-label={`Option ${String.fromCharCode(65 + i)}: ${opt}`}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-[15px] font-semibold transition-all
                  ${isCorrect ? "anim-pulse-glow bg-emerald-500 text-white shadow-lg" : ""}
                  ${isWrongPick ? "anim-shake bg-rose-500 text-white shadow-lg" : ""}
                  ${!feedback && isPicked ? "bg-[#0b5ed7] text-white" : ""}
                  ${!feedback && !isPicked ? "bg-[var(--surface2)] text-[var(--text)] hover:ring-2 hover:ring-[#0b5ed7]/50 active:scale-[.99]" : ""}
                  ${feedback && !isCorrect && !isWrongPick ? "bg-[var(--surface2)] text-[var(--dim)] opacity-60" : ""}`}>
                <span className={`font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${isCorrect || isWrongPick || (!feedback && isPicked) ? "bg-white/25 text-white" : "bg-[var(--surface)] text-[#0b5ed7] ring-1 ring-[var(--border)]"}`}>
                  {isCorrect ? "✓" : isWrongPick ? "✗" : String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1">{opt}</span>
              </button>
            );
          })}
        </div>

        {feedback && (
          <div className={`anim-pop mt-5 rounded-2xl p-4 ${feedback.correct ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-900 ring-1 ring-rose-200"}`}>
            <p className="font-display text-base font-extrabold">
              {selected === -1 ? "⏰ সময় শেষ!" : feedback.correct ? "🎉 সঠিক উত্তর! দারুণ!" : "😅 ভুল হলো — ব্যাপার না!"}
            </p>
            <p className="anim-explain mt-1.5 rounded-xl bg-white/60 px-3 py-2 text-sm leading-relaxed dark:bg-black/20">
              <span className="anim-bulb mr-1">💡</span>{feedback.explanation}
            </p>
            <button onClick={() => dispatch(advance())}
              className="font-display mt-3 w-full rounded-xl bg-[#0b5ed7] py-3 font-extrabold text-white shadow transition hover:brightness-110 active:scale-[.98]">
              {quiz.index + 1 >= quiz.questions.length ? "রেজাল্ট দেখো 🏁" : "পরের প্রশ্ন →"}
            </button>
          </div>
        )}
        {checkMut.isPending && <p className="mt-4 text-center text-sm font-semibold text-[var(--dim)]">উত্তর চেক হচ্ছে…</p>}
      </div>
    </div>
  );
};

/* ================= Result ================= */
const ResultScreen = ({ go }: { go: (v: View) => void }) => {
  const user = useSelector((s: RootState) => s.auth.user);
  const quiz = useSelector((s: RootState) => s.quiz);
  const dispatch = useDispatch<AppDispatch>();
  const queryClient = useQueryClient();
  const savedRef = useRef(false);
  const total = quiz.questions.length || 1;
  const pct = Math.round((quiz.score / total) * 100);

  const submitMut = useMutation({
    mutationFn: async () => await api.submitAttempt({
      userId: user!.id, category: quiz.category, score: quiz.score, total,
      answers: quiz.review.map((r) => ({
        question: r.question, topic: r.topic,
        selectedIndex: r.selectedIndex, correctIndex: r.correctIndex,
        selectedText: r.selectedIndex >= 0 ? (r.options[r.selectedIndex] ?? "") : "",
        correctText: r.options[r.correctIndex] ?? "",
        explanation: r.explanation, correct: r.correct,
      })),
    }),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  useEffect(() => {
    if (!savedRef.current && user && quiz.questions.length > 0) {
      savedRef.current = true;
      submitMut.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const confetti = useMemo(() => Array.from({ length: 42 }, (_, i) => ({
    left: (i * 23.7) % 100, delay: (i % 12) * 0.28, size: 7 + (i % 4) * 3,
    color: ["#0b5ed7", "#10b981", "#f59e0b", "#fb7185", "#38bdf8"][i % 5], round: i % 3 === 0,
  })), []);

  const message = pct >= 80 ? "অসাধারণ! তুমি টপার লেভেলে আছো 🏆" : pct >= 60 ? "খুব ভালো! আরেকটু হলেই টপে 🔥" : pct >= 40 ? "ভালো চেষ্টা! প্র্যাকটিস করলেই বাড়বে 💪" : "শুরুটা হলো — আবার খেললেই স্কোর বাড়বে 🌱";
  const ring = 2 * Math.PI * 52;
  const wrongOnes = quiz.review.filter((r) => !r.correct);
  const rightOnes = quiz.review.filter((r) => r.correct);

  const context = useQuery({
    queryKey: ["result-context", user?.id, quiz.category, submitMut.isSuccess],
    queryFn: () => api.getResultContext({ userId: user!.id, category: quiz.category }),
    enabled: !!user && submitMut.isSuccess,
  });

  return (
    <div className="relative mx-auto w-full max-w-2xl overflow-hidden px-4 pb-12 pt-8">
      {pct >= 40 && confetti.map((c, i) => (
        <span key={i} aria-hidden className="pointer-events-none absolute top-0 z-0"
          style={{
            left: `${c.left}%`, width: c.size, height: c.size * (c.round ? 1 : 0.5),
            background: c.color, borderRadius: c.round ? "50%" : "2px",
            animation: `confettiFall ${2.6 + (i % 5) * 0.5}s ease-in ${c.delay}s both`,
          }} />
      ))}
      <div className="anim-pop relative z-10 rounded-[32px] bg-[var(--surface)] p-6 text-center shadow-xl ring-1 ring-[var(--border)] sm:p-7">
        <span aria-hidden className="anim-twinkle absolute left-5 top-5 text-xl text-amber-400">✦</span>
        <span aria-hidden className="anim-twinkle absolute right-6 top-8 text-base text-sky-400" style={{ animationDelay: ".7s" }}>✦</span>
        <span aria-hidden className="anim-twinkle absolute bottom-6 left-8 text-base text-emerald-400" style={{ animationDelay: "1.3s" }}>✦</span>
        <span aria-hidden className="anim-twinkle absolute bottom-8 right-5 text-xl text-rose-400" style={{ animationDelay: "1.9s" }}>✦</span>
        <p className="text-sm font-bold uppercase tracking-widest text-[var(--dim)]">{quiz.category} • ডিটেইল রেজাল্ট</p>
        <div className="relative mx-auto mt-5 h-36 w-36">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r="52" fill="none" strokeWidth="11" className="stroke-[var(--surface2)]" />
            <circle cx="60" cy="60" r="52" fill="none" strokeWidth="11" strokeLinecap="round"
              stroke={pct >= 60 ? "#10b981" : pct >= 40 ? "#f59e0b" : "#fb7185"}
              strokeDasharray={ring} strokeDashoffset={ring - (ring * pct) / 100}
              style={{ transition: "stroke-dashoffset 1.2s ease" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-4xl font-extrabold text-[var(--text)]">{pct}%</span>
            <span className="text-xs font-bold text-[var(--dim)]">মার্কস {quiz.score}/{total}</span>
          </div>
        </div>
        <h2 className="font-display mt-4 text-2xl font-extrabold text-[var(--text)]">{message}</h2>
        <p className="mt-1 text-sm text-[var(--dim)]">
          তুমি পেয়েছ <strong className="text-[var(--text)]">{quiz.score} মার্কস</strong> — {total}টি প্রশ্নের মধ্যে {quiz.score}টি সঠিক, {total - quiz.score}টি ভুল।
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2.5 text-left sm:grid-cols-4">
          <div className="rounded-2xl bg-[var(--surface2)] px-3 py-3 text-center">
            <p className="font-display text-xl font-extrabold text-[var(--text)]">🔥 {quiz.bestStreak}</p>
            <p className="text-[11px] font-semibold text-[var(--dim)]">সেরা স্ট্রিক</p>
          </div>
          <div className="rounded-2xl bg-[var(--surface2)] px-3 py-3 text-center">
            <p className="font-display text-xl font-extrabold text-[var(--text)]">👥 {context.data?.categoryParticipants ?? "…"}</p>
            <p className="text-[11px] font-semibold text-[var(--dim)]">জন এই ক্যাটাগরিতে অ্যাটেন্ড করেছে</p>
          </div>
          <div className="rounded-2xl bg-[var(--surface2)] px-3 py-3 text-center">
            <p className="font-display text-xl font-extrabold text-[var(--text)]">📝 {context.data?.categoryAttempts ?? "…"}</p>
            <p className="text-[11px] font-semibold text-[var(--dim)]">মোট অ্যাটেম্পট (এই ক্যাটাগরি)</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-[#0b5ed7] to-emerald-500 px-3 py-3 text-center text-white">
            <p className="font-display text-xl font-extrabold">#{context.data?.overallRank ?? "…"}</p>
            <p className="text-[11px] font-semibold text-blue-100">তোমার র‍্যাংকিং ({context.data?.totalRankedStudents ?? "…"} জনের মধ্যে)</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--dim)]">{submitMut.isSuccess ? "✔ রেজাল্ট তোমার অ্যাকাউন্টে সেভ হয়েছে" : "রেজাল্ট সেভ হচ্ছে…"}</p>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button onClick={() => { dispatch(resetQuiz()); go("home"); }}
            className="font-display rounded-2xl bg-[var(--surface2)] py-3 font-extrabold text-[var(--text)] ring-1 ring-[var(--border)] transition active:scale-[.98]">🏠 হোম</button>
          <button onClick={() => go("leaderboard")}
            className="font-display rounded-2xl bg-gradient-to-r from-[#0b5ed7] to-emerald-500 py-3 font-extrabold text-white shadow-lg transition active:scale-[.98]">🏆 লিডারবোর্ড</button>
        </div>
      </div>

      {/* ------- Wrong answers review with explanations ------- */}
      <div className="relative z-10 mt-5 text-left">
        <h3 className="font-display text-xl font-extrabold text-[var(--text)]">
          {wrongOnes.length > 0 ? `❌ ভুল যাওয়া প্রশ্ন (${wrongOnes.length}টি) — ব্যাখ্যাসহ` : "🎉 কোনো প্রশ্ন ভুল হয়নি!"}
        </h3>
        <div className="mt-3 space-y-3">
          {wrongOnes.map((r, i) => (
            <article key={i} className="anim-pop rounded-3xl bg-[var(--surface)] p-5 shadow-sm ring-1 ring-rose-200" style={{ animationDelay: `${i * 0.05}s` }}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--dim)]">{r.topic}</p>
              <h4 className="font-display mt-1 text-[17px] font-bold leading-snug text-[var(--text)]">{r.question}</h4>
              <p className="mt-2.5 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                তোমার উত্তর: {r.selectedIndex >= 0 ? (r.options[r.selectedIndex] ?? "—") : "⏰ সময় শেষ — উত্তর দেওয়া হয়নি"}
              </p>
              <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                সঠিক উত্তর: {r.options[r.correctIndex] ?? "—"}
              </p>
              <p className="anim-explain mt-2 rounded-xl bg-[var(--surface2)] px-3 py-2 text-sm leading-relaxed text-[var(--dim)]" style={{ animationDelay: `${0.15 + i * 0.08}s` }}>
                <span className="anim-bulb mr-1">💡</span><strong className="text-[var(--text)]">ব্যাখ্যা:</strong> {r.explanation}
              </p>
            </article>
          ))}
        </div>

        {rightOnes.length > 0 && (
          <details className="mt-4 rounded-3xl bg-[var(--surface)] p-5 shadow-sm ring-1 ring-[var(--border)]">
            <summary className="font-display cursor-pointer text-base font-extrabold text-[var(--text)]">✔ সঠিক হওয়া প্রশ্নগুলো দেখো ({rightOnes.length}টি)</summary>
            <div className="mt-3 space-y-3">
              {rightOnes.map((r, i) => (
                <div key={i} className="border-t border-[var(--border)] pt-3 first:border-0 first:pt-0">
                  <p className="font-semibold text-[var(--text)]">{r.question}</p>
                  <p className="mt-0.5 text-sm text-emerald-600">সঠিক উত্তর: {r.options[r.correctIndex] ?? "—"}</p>
                  <p className="text-sm text-[var(--dim)]">💡 {r.explanation}</p>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
};

/* ================= History & Leaderboard ================= */
const SubNav = ({ go, active }: { go: (v: View) => void; active: View }) => (
  <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[var(--surface)]/95 pb-safe backdrop-blur">
    <div className="mx-auto grid max-w-3xl grid-cols-3">
      <button onClick={() => go("home")} className={`py-3 text-center text-sm font-bold ${active === "home" ? "text-[#0b5ed7]" : "text-[var(--dim)]"}`}>🏠 হোম</button>
      <button onClick={() => go("history")} className={`py-3 text-center text-sm font-bold ${active === "history" ? "text-[#0b5ed7]" : "text-[var(--dim)]"}`}>📜 আমার স্কোর</button>
      <button onClick={() => go("leaderboard")} className={`py-3 text-center text-sm font-bold ${active === "leaderboard" ? "text-[#0b5ed7]" : "text-[var(--dim)]"}`}>🏆 লিডারবোর্ড</button>
    </div>
  </nav>
);

const HistoryScreen = ({ go }: { go: (v: View) => void }) => {
  const user = useSelector((s: RootState) => s.auth.user);
  const stats = useQuery({ queryKey: ["my-stats", user?.id], queryFn: () => api.getMyStats({ userId: user!.id }), enabled: !!user });
  const liveHistory = useQuery({ queryKey: ["my-live-history", user?.id], queryFn: () => api.getMyLiveHistory({ userId: user!.id }), enabled: !!user });
  const liveEvents = liveHistory.data?.events ?? [];
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5">
      <h2 className="font-display text-2xl font-extrabold text-[var(--text)]">📜 আমার ইতিহাস</h2>
      <p className="text-sm text-[var(--dim)]">এই ইতিহাস শুধু তুমিই দেখতে পাও — তোমার নিজের অ্যাকাউন্টে সেভ থাকে।</p>

      <div className="anim-pop mt-4 grid grid-cols-3 gap-2.5 text-center">
        <div className="rounded-3xl bg-gradient-to-br from-[#0b5ed7] to-sky-500 p-4 text-white shadow-lg">
          <p className="font-display text-3xl font-extrabold">{(stats.data?.totalAttempts ?? 0) + liveEvents.length}</p>
          <p className="text-[11px] font-semibold text-blue-100">মোট অ্যাটেম্পট (কুইজ + লাইভ)</p>
        </div>
        <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-500 p-4 text-white shadow-lg">
          <p className="font-display text-3xl font-extrabold">{stats.data?.totalQuestions ?? 0}</p>
          <p className="text-[11px] font-semibold text-emerald-100">মোট প্রশ্নের উত্তর দিয়েছ</p>
        </div>
        <div className="rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 p-4 text-white shadow-lg">
          <p className="font-display text-3xl font-extrabold">{stats.data?.totalCorrect ?? 0}</p>
          <p className="text-[11px] font-semibold text-amber-100">মোট সঠিক উত্তর</p>
        </div>
      </div>

      <h3 className="font-display mt-6 text-lg font-extrabold text-[var(--text)]">🎯 একক কুইজের ইতিহাস</h3>
      <div className="mt-3 space-y-2.5">
        {(stats.data?.attempts ?? []).map((a) => {
          const p = Math.round((a.score / a.total) * 100);
          return (
            <div key={a.id} className="flex items-center gap-3 rounded-2xl bg-[var(--surface)] p-4 shadow-sm ring-1 ring-[var(--border)]">
              <span className={`font-display flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-extrabold text-white ${p >= 60 ? "bg-emerald-500" : p >= 40 ? "bg-amber-400" : "bg-rose-400"}`}>{p}%</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-[var(--text)]">{a.category}</p>
                <p className="text-xs text-[var(--dim)]">{new Date(a.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
              </div>
              <span className="font-display text-lg font-extrabold text-[var(--text)]">{a.score}/{a.total}</span>
            </div>
          );
        })}
        {stats.data && stats.data.attempts.length === 0 && (
          <div className="rounded-3xl bg-[var(--surface)] p-8 text-center ring-1 ring-[var(--border)]">
            <p className="text-4xl">🎯</p>
            <p className="mt-2 font-bold text-[var(--text)]">এখনো কোনো কুইজ খেলোনি</p>
            <p className="text-sm text-[var(--dim)]">হোম থেকে প্রথম কুইজটা শুরু করো!</p>
          </div>
        )}
        {stats.isPending && <p className="text-sm text-[var(--dim)]">লোড হচ্ছে…</p>}
      </div>

      <h3 className="font-display mt-7 text-lg font-extrabold text-[var(--text)]">🔴 লাইভ গ্রুপ কুইজের ইতিহাস</h3>
      <p className="text-sm text-[var(--dim)]">যেসব লাইভ ইভেন্টে তুমি অংশ নিয়েছ — তারিখ, কতজন ছিল, আর তোমার রেজাল্ট।</p>
      <div className="mt-3 space-y-2.5">
        {liveEvents.map((e) => (
          <div key={e.roomId} className="anim-pop flex items-center gap-3 rounded-2xl bg-[var(--surface)] p-4 shadow-sm ring-1 ring-[var(--border)]">
            <span className="font-display flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow">
              <span className="text-sm font-extrabold leading-none">#{e.rank}</span>
              <span className="text-[9px] font-bold">র‍্যাংক</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-[var(--text)]">{e.category} • রুম {e.code}</p>
              <p className="text-xs text-[var(--dim)]">
                📅 {fmtDateTime(e.date)} • 👥 {e.attendees} জন অংশ নিয়েছিল
                {e.status !== "finished" ? " • (ইভেন্ট এখনো শেষ হয়নি)" : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-display text-lg font-extrabold text-[var(--text)]">{e.marks}/{e.totalQuestions}</p>
              <p className="text-[11px] font-semibold"><span className="text-emerald-500">{e.correct} ✔</span> • <span className="text-rose-500">{e.wrong} ✗</span></p>
            </div>
          </div>
        ))}
        {liveHistory.data && liveEvents.length === 0 && (
          <div className="rounded-3xl bg-[var(--surface)] p-6 text-center ring-1 ring-[var(--border)]">
            <p className="text-3xl">👥</p>
            <p className="mt-1.5 font-bold text-[var(--text)]">এখনো কোনো লাইভ ইভেন্টে অংশ নাওনি</p>
            <p className="text-sm text-[var(--dim)]">হোম থেকে Live Group Quiz-এ জয়েন করলেই এখানে ইতিহাস জমবে।</p>
          </div>
        )}
        {liveHistory.isPending && <p className="text-sm text-[var(--dim)]">লাইভ ইতিহাস লোড হচ্ছে…</p>}
      </div>
      <SubNav go={go} active="history" />
    </div>
  );
};

const LeaderboardScreen = ({ go }: { go: (v: View) => void }) => {
  const user = useSelector((s: RootState) => s.auth.user);
  const board = useQuery({ queryKey: ["leaderboard"], queryFn: () => api.getLeaderboard({}) });
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5">
      <h2 className="font-display text-2xl font-extrabold text-[var(--text)]">🏆 CSE লিডারবোর্ড</h2>
      <p className="text-sm text-[var(--dim)]">মোট সঠিক উত্তর অনুযায়ী SIMT CSE শিক্ষার্থীদের র‍্যাংকিং।</p>
      <div className="mt-4 space-y-2.5">
        {(board.data?.entries ?? []).map((e, i) => (
          <div key={e.userId} className={`anim-pop flex items-center gap-3 rounded-2xl p-4 shadow-sm ring-1 ${e.userId === user?.id ? "bg-blue-50 ring-[#0b5ed7]/40 dark:bg-blue-950" : "bg-[var(--surface)] ring-[var(--border)]"}`} style={{ animationDelay: `${i * 0.05}s` }}>
            <span className="w-9 text-center text-2xl">{medals[i] ?? <span className="font-display text-base font-extrabold text-[var(--dim)]">{i + 1}</span>}</span>
            <PlayerAvatar name={e.name} photoUrl={e.photoUrl} size="h-11 w-11 text-base" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-[var(--text)]">{e.name} {e.userId === user?.id && <span className="text-xs font-bold text-[#0b5ed7]">(তুমি)</span>}</p>
              <p className="text-xs text-[var(--dim)]">🪪 {e.studentId} • {e.attempts}টি কুইজ • সেরা {e.bestPercent}%</p>
            </div>
            <span className="font-display text-lg font-extrabold text-emerald-500">{e.totalCorrect} ✔</span>
          </div>
        ))}
        {board.data && board.data.entries.length === 0 && (
          <div className="rounded-3xl bg-[var(--surface)] p-8 text-center ring-1 ring-[var(--border)]">
            <p className="text-4xl">🏆</p>
            <p className="mt-2 font-bold text-[var(--text)]">লিডারবোর্ড এখনো খালি</p>
            <p className="text-sm text-[var(--dim)]">প্রথম কুইজ খেলে তুমিই প্রথমে উঠে যাও!</p>
          </div>
        )}
        {board.isPending && <p className="text-sm text-[var(--dim)]">লোড হচ্ছে…</p>}
      </div>
      <SubNav go={go} active="leaderboard" />
    </div>
  );
};

/* ================= Live Group Quiz ================= */
const fmtDuration = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const PlayerAvatar = ({ name, photoUrl, size = "h-9 w-9 text-sm" }: { name: string; photoUrl: string | null; size?: string }) => (
  photoUrl
    ? <img src={photoUrl} alt={`${name} — profile photo`} className={`${size} shrink-0 rounded-full object-cover ring-2 ring-emerald-400/50`} />
    : <span aria-hidden className={`font-display flex ${size} shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0b5ed7] to-emerald-500 font-extrabold text-white`}>
        {name.trim().charAt(0).toUpperCase()}
      </span>
);

const LiveScreen = ({ go }: { go: (v: View) => void }) => {
  const user = useSelector((s: RootState) => s.auth.user);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [category, setCategory] = useState("Mixed Quiz");
  const [qCount, setQCount] = useState<30 | 50>(30);
  const [err, setErr] = useState("");
  const [nowMs, setNowMs] = useState(Date.now());

  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api.getCategories({}) });
  const live = useQuery({
    queryKey: ["live-state", user?.id, roomId],
    queryFn: () => api.getLiveState({ userId: user!.id, roomId: roomId! }),
    enabled: !!user && roomId !== null,
    refetchInterval: 1500,
  });
  const data = live.data;
  const status = data?.room.status;

  useEffect(() => {
    if (status !== "running") return;
    const t = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(t);
  }, [status]);

  const onErr = (e: unknown) => setErr(e instanceof Error ? e.message : "কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করো।");
  const createMut = useMutation({
    mutationFn: async () => await api.createLiveRoom({ userId: user!.id, category, questionCount: qCount }),
    onSuccess: (r) => { setRoomId(r.roomId); setErr(""); },
    onError: onErr,
  });
  const joinMut = useMutation({
    mutationFn: async () => await api.joinLiveRoom({ userId: user!.id, code: joinCode.trim() }),
    onSuccess: (r) => { setRoomId(r.roomId); setErr(""); },
    onError: onErr,
  });
  const startMut = useMutation({
    mutationFn: async () => await api.startLiveRoom({ userId: user!.id, roomId: roomId! }),
    onError: onErr,
  });
  const answerMut = useMutation({
    mutationFn: async (sel: number) => await api.answerLive({ userId: user!.id, roomId: roomId!, selectedIndex: sel }),
    onError: onErr,
  });

  const secondsLeft = data?.room.deadlineAt ? Math.max(0, Math.ceil((data.room.deadlineAt - nowMs) / 1000)) : 0;
  const medals = ["🥇", "🥈", "🥉"];
  const inputCls = "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-[15px] text-[var(--text)] outline-none focus:ring-2 focus:ring-[#0b5ed7]/40";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-12 pt-4">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => go("home")} className="rounded-full bg-[var(--surface)] px-4 py-2 text-sm font-bold text-[var(--dim)] ring-1 ring-[var(--border)]">← হোম</button>
        <span className="font-display rounded-full bg-gradient-to-r from-rose-500 to-amber-500 px-4 py-2 text-sm font-extrabold text-white shadow">👥 Live Group Quiz</span>
        <span className="w-16" />
      </div>

      {err && <p role="alert" className="anim-shake mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-600">{err}</p>}

      {/* ---------- Entry: create or join ---------- */}
      {roomId === null && (
        <div className="mt-5 space-y-4">
          <section className="anim-pop rounded-[28px] bg-[var(--surface)] p-5 shadow-lg ring-1 ring-[var(--border)] sm:p-6">
            <h2 className="font-display text-xl font-extrabold text-[var(--text)]">🎮 নতুন লাইভ রুম তৈরি করো</h2>
            <p className="mt-0.5 text-sm text-[var(--dim)]">তুমি হোস্ট হবে — বন্ধুরা কোড দিয়ে জয়েন করবে, সবাই একই প্রশ্ন একসাথে উত্তর দেবে।</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="live-cat" className="text-[13px] font-semibold text-[var(--dim)]">ক্যাটাগরি</label>
                <select id="live-cat" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                  <option value="Mixed Quiz">🎲 Mixed — সব টপিক</option>
                  {(categories.data?.categories ?? []).map((c) => <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>)}
                </select>
              </div>
              <div>
                <span className="text-[13px] font-semibold text-[var(--dim)]">প্রশ্ন সংখ্যা</span>
                <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface2)] p-1" role="radiogroup" aria-label="Number of questions">
                  {([30, 50] as const).map((n) => (
                    <button key={n} role="radio" aria-checked={qCount === n} onClick={() => setQCount(n)}
                      className={`font-display rounded-lg py-2 text-sm font-extrabold transition ${qCount === n ? "bg-slate-900 text-white shadow" : "text-[var(--dim)]"}`}>
                      {n}টি প্রশ্ন
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={() => createMut.mutate()} disabled={createMut.isPending}
              className="font-display mt-4 w-full rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 py-3 text-base font-extrabold text-white shadow-lg transition hover:brightness-110 active:scale-[.98] disabled:opacity-60">
              {createMut.isPending ? "রুম তৈরি হচ্ছে…" : "রুম তৈরি করে কোড নাও →"}
            </button>
          </section>

          <section className="anim-pop rounded-[28px] bg-[var(--surface)] p-5 shadow-lg ring-1 ring-[var(--border)] sm:p-6" style={{ animationDelay: ".08s" }}>
            <h2 className="font-display text-xl font-extrabold text-[var(--text)]">🔑 কোড দিয়ে জয়েন করো</h2>
            <p className="mt-0.5 text-sm text-[var(--dim)]">হোস্টের কাছ থেকে ৬ সংখ্যার রুম কোডটা নিয়ে এখানে বসাও।</p>
            <div className="mt-3 flex gap-2">
              <input {...FIELDS.joinLiveRoom.code} value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} inputMode="numeric"
                placeholder="যেমন 483920" aria-label="Live room code"
                className={`${inputCls} text-center font-display text-lg font-extrabold tracking-[.3em]`} />
              <button onClick={() => joinMut.mutate()} disabled={joinMut.isPending || joinCode.length < 6}
                className="font-display shrink-0 rounded-xl bg-[#0b5ed7] px-5 font-extrabold text-white shadow transition active:scale-[.98] disabled:opacity-50">
                {joinMut.isPending ? "…" : "Join →"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ---------- Lobby ---------- */}
      {roomId !== null && data && status === "lobby" && (
        <div className="anim-pop mt-5 rounded-[28px] bg-[var(--surface)] p-5 text-center shadow-lg ring-1 ring-[var(--border)] sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[.25em] text-[var(--dim)]">রুম কোড — সবাইকে শেয়ার করো</p>
          <p className="font-display mt-1 text-5xl font-extrabold tracking-[.2em] text-[var(--text)]">{data.room.code}</p>
          <p className="mt-1 text-sm text-[var(--dim)]">{data.room.category} • {data.room.totalQuestions}টি প্রশ্ন • প্রতি প্রশ্নে ২০ সেকেন্ড</p>
          <div className="mt-5 text-left">
            <p className="text-sm font-bold text-[var(--text)]">👥 জয়েন করেছে ({data.players.length} জন) — লাইভ আপডেট হয়</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.players.map((p) => (
                <span key={p.userId} className="anim-pop flex items-center gap-2 rounded-full bg-[var(--surface2)] py-1 pl-1 pr-3 ring-1 ring-[var(--border)]">
                  <PlayerAvatar name={p.name} photoUrl={p.photoUrl} size="h-7 w-7 text-xs" />
                  <span className="text-[13px] font-bold text-[var(--text)]">{p.name}{p.userId === user?.id ? " (তুমি)" : ""}</span>
                  <span className="text-[11px] text-[var(--dim)]">{p.studentId}</span>
                </span>
              ))}
            </div>
          </div>
          {data.room.isHost ? (
            <button onClick={() => startMut.mutate()} disabled={startMut.isPending}
              className="font-display anim-bounce-soft mt-6 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-[#0b5ed7] py-3.5 text-base font-extrabold text-white shadow-lg transition active:scale-[.98] disabled:opacity-60">
              {startMut.isPending ? "শুরু হচ্ছে…" : "▶ খেলা শুরু করো — সবাই একসাথে!"}
            </button>
          ) : (
            <p className="anim-pulse mt-6 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">⏳ হোস্ট খেলা শুরু করার অপেক্ষায় আছো… শুরু হলেই প্রথম প্রশ্ন সবার স্ক্রিনে একসাথে আসবে।</p>
          )}
          <button onClick={() => setRoomId(null)} className="mt-3 text-sm font-bold text-[var(--dim)] underline-offset-2 hover:underline">রুম ছেড়ে যাও</button>
        </div>
      )}

      {/* ---------- Playing ---------- */}
      {roomId !== null && data && status === "running" && data.question && (
        <div className="mt-5">
          <div className="flex items-center gap-3">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--surface2)]">
              <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-500" style={{ width: `${(data.room.currentIndex / data.room.totalQuestions) * 100}%` }} />
            </div>
            <span className="text-sm font-bold text-[var(--dim)]">{data.room.currentIndex + 1}/{data.room.totalQuestions}</span>
            <span className={`font-display text-lg font-extrabold ${secondsLeft <= 5 ? "anim-shake text-rose-500" : "text-[var(--text)]"}`}>⏱️ {secondsLeft}s</span>
          </div>

          <div key={data.room.currentIndex} className="anim-slide-q mt-4 rounded-[28px] bg-[var(--surface)] p-5 shadow-lg ring-1 ring-[var(--border)] sm:p-6">
            <span className="rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold text-blue-700">{data.question.topic}</span>
            <h2 className="font-display mt-3 text-[22px] font-extrabold leading-snug text-[var(--text)]">{data.question.question}</h2>
            <div className="mt-4 space-y-2.5">
              {data.question.options.map((opt, i) => {
                const mine = data.mySelected;
                const isPicked = mine === i;
                const isCorrect = mine !== null && data.myCorrectIndex === i;
                const isWrongPick = mine !== null && isPicked && data.myCorrectIndex !== null && data.myCorrectIndex !== i;
                return (
                  <button key={i} onClick={() => { if (mine === null) answerMut.mutate(i); }} disabled={mine !== null || answerMut.isPending}
                    aria-label={`Option ${String.fromCharCode(65 + i)}: ${opt}`}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-[15px] font-semibold transition-all
                      ${isCorrect ? "anim-pulse-glow bg-emerald-500 text-white shadow-lg" : ""}
                      ${isWrongPick ? "anim-shake bg-rose-500 text-white shadow-lg" : ""}
                      ${mine === null ? "bg-[var(--surface2)] text-[var(--text)] hover:ring-2 hover:ring-rose-400/60 active:scale-[.99]" : ""}
                      ${mine !== null && !isCorrect && !isWrongPick ? "bg-[var(--surface2)] text-[var(--dim)] opacity-60" : ""}`}>
                    <span className={`font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${isCorrect || isWrongPick ? "bg-white/25 text-white" : "bg-[var(--surface)] text-rose-500 ring-1 ring-[var(--border)]"}`}>
                      {isCorrect ? "✓" : isWrongPick ? "✗" : String.fromCharCode(65 + i)}
                    </span>
                    <span className="flex-1">{opt}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-center text-[13px] font-semibold text-[var(--dim)]">
              {data.mySelected !== null ? "✔ তোমার উত্তর লক হয়েছে — পরের প্রশ্নের অপেক্ষা করো" : `${data.players.filter((p) => p.answeredCurrent).length}/${data.players.length} জন উত্তর দিয়েছে`}
            </p>
          </div>

          <div className="mt-4 rounded-[24px] bg-[var(--surface)] p-4 shadow-sm ring-1 ring-[var(--border)]">
            <p className="font-display text-sm font-extrabold text-[var(--text)]">🔴 লাইভ লিডারবোর্ড</p>
            <div className="mt-2 space-y-1.5">
              {data.players.slice(0, 8).map((p, i) => (
                <div key={p.userId} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 ${p.userId === user?.id ? "bg-blue-50 ring-1 ring-[#0b5ed7]/30 dark:bg-blue-950" : ""}`}>
                  <span className="w-6 text-center">{medals[i] ?? <span className="text-xs font-bold text-[var(--dim)]">{i + 1}</span>}</span>
                  <PlayerAvatar name={p.name} photoUrl={p.photoUrl} size="h-7 w-7 text-xs" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text)]">{p.name} <span className="text-[11px] font-semibold text-[var(--dim)]">{p.studentId}</span></span>
                  {p.answeredCurrent && <span className="text-[11px] font-bold text-emerald-500">✔ উত্তর দিয়েছে</span>}
                  <span className="font-display text-sm font-extrabold text-emerald-500">{p.correct} ✔</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------- Finished ---------- */}
      {roomId !== null && data && status === "finished" && (
        <div className="mt-5">
          <div className="anim-pop relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-900 via-[#0d1b33] to-[#0b3d2e] p-5 text-center text-white shadow-xl sm:p-6">
            <span aria-hidden className="anim-twinkle absolute left-5 top-5 text-xl text-amber-400">✦</span>
            <span aria-hidden className="anim-twinkle absolute bottom-5 right-6 text-lg text-emerald-400" style={{ animationDelay: ".8s" }}>✦</span>
            <p className="text-4xl">🏆</p>
            <h2 className="font-display mt-1 text-2xl font-extrabold">খেলা শেষ! ফাইনাল লিডারবোর্ড</h2>
            <p className="text-sm text-slate-300">{data.room.category} • {data.room.totalQuestions}টি প্রশ্ন • রুম {data.room.code}</p>
          </div>

          <div className="mt-4 space-y-2.5">
            {data.players.map((p, i) => (
              <div key={p.userId} className={`anim-pop flex items-center gap-3 rounded-2xl p-3.5 shadow-sm ring-1 ${p.userId === user?.id ? "bg-blue-50 ring-[#0b5ed7]/40 dark:bg-blue-950" : "bg-[var(--surface)] ring-[var(--border)]"}`} style={{ animationDelay: `${i * 0.05}s` }}>
                <span className="w-9 text-center text-2xl">{medals[i] ?? <span className="font-display text-base font-extrabold text-[var(--dim)]">{i + 1}</span>}</span>
                <PlayerAvatar name={p.name} photoUrl={p.photoUrl} size="h-11 w-11 text-base" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-[var(--text)]">{p.name} {p.userId === user?.id && <span className="text-xs font-bold text-[#0b5ed7]">(তুমি)</span>}</p>
                  <p className="text-xs text-[var(--dim)]">🪪 {p.studentId} • ⏱️ মোট সময় {fmtDuration(p.totalTimeMs)}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-lg font-extrabold text-[var(--text)]">{p.correct}/{data.room.totalQuestions} <span className="text-xs font-bold text-[var(--dim)]">মার্কস</span></p>
                  <p className="text-xs font-semibold"><span className="text-emerald-500">{p.correct} ✔ সঠিক</span> • <span className="text-rose-500">{p.wrong} ✗ ভুল</span></p>
                </div>
              </div>
            ))}
          </div>

          {data.myWrong.length > 0 ? (
            <div className="mt-6">
              <h3 className="font-display text-xl font-extrabold text-[var(--text)]">❌ তোমার ভুল যাওয়া প্রশ্ন ({data.myWrong.length}টি) — ব্যাখ্যাসহ</h3>
              <p className="text-[13px] text-[var(--dim)]">এই ব্যাখ্যাগুলো শুধু তুমিই দেখতে পাচ্ছো।</p>
              <div className="mt-3 space-y-3">
                {data.myWrong.map((w, i) => (
                  <article key={i} className="anim-pop rounded-3xl bg-[var(--surface)] p-5 shadow-sm ring-1 ring-rose-200" style={{ animationDelay: `${i * 0.05}s` }}>
                    <h4 className="font-display text-[17px] font-bold leading-snug text-[var(--text)]">{w.question}</h4>
                    <p className="mt-2.5 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">তোমার উত্তর: {w.selectedText || "⏰ সময় শেষ — উত্তর দেওয়া হয়নি"}</p>
                    <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">সঠিক উত্তর: {w.correctText}</p>
                    <p className="anim-explain mt-2 rounded-xl bg-[var(--surface2)] px-3 py-2 text-sm leading-relaxed text-[var(--dim)]" style={{ animationDelay: `${0.15 + i * 0.08}s` }}>
                      <span className="anim-bulb mr-1">💡</span><strong className="text-[var(--text)]">ব্যাখ্যা:</strong> {w.explanation}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <p className="anim-pop mt-6 rounded-3xl bg-emerald-50 px-5 py-4 text-center font-bold text-emerald-700 ring-1 ring-emerald-200">🎉 তোমার কোনো প্রশ্ন ভুল হয়নি — দুর্দান্ত!</p>
          )}

          <div className="mt-6 grid grid-cols-2 gap-2.5">
            <button onClick={() => go("home")} className="font-display rounded-2xl bg-[var(--surface2)] py-3 font-extrabold text-[var(--text)] ring-1 ring-[var(--border)] transition active:scale-[.98]">🏠 হোম</button>
            <button onClick={() => setRoomId(null)} className="font-display rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 py-3 font-extrabold text-white shadow-lg transition active:scale-[.98]">🔁 নতুন লাইভ রুম</button>
          </div>
        </div>
      )}

      {roomId !== null && live.isPending && <p className="mt-6 text-center text-sm text-[var(--dim)]">রুম লোড হচ্ছে…</p>}
    </div>
  );
};

/* ================= Admin: question manager ================= */
type AdminQuestion = ApiResponse<typeof api, "adminListQuestions">["questions"][number];

const AdminQuestions = () => {
  const user = useSelector((s: RootState) => s.auth.user);
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ["admin-questions", user?.id],
    queryFn: () => api.adminListQuestions({ adminUserId: user!.id }),
    enabled: !!user?.isAdmin,
  });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api.getCategories({}) });
  const [filter, setFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AdminQuestion | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [formError, setFormError] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fTopic, setFTopic] = useState("");
  const [fStage, setFStage] = useState<"past" | "current" | "upcoming">("current");
  const [fDifficulty, setFDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [fQuestion, setFQuestion] = useState("");
  const [fOptions, setFOptions] = useState<string[]>(["", "", "", ""]);
  const [fCorrect, setFCorrect] = useState(0);
  const [fExplanation, setFExplanation] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-questions"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
  };
  const payload = () => ({
    category: fCategory.trim(), topic: fTopic.trim(), stage: fStage, difficulty: fDifficulty,
    question: fQuestion.trim(), options: fOptions.map((o) => o.trim()),
    correctIndex: fCorrect, explanation: fExplanation.trim(),
  });
  const addMut = useMutation({
    mutationFn: async () => await api.adminAddQuestion({ adminUserId: user!.id, question: payload() }),
    onSuccess: () => { invalidate(); setShowForm(false); },
    onError: (e) => setFormError(e instanceof Error ? e.message : "প্রশ্ন যোগ হয়নি।"),
  });
  const updateMut = useMutation({
    mutationFn: async () => await api.adminUpdateQuestion({ adminUserId: user!.id, id: editing!.id, question: payload() }),
    onSuccess: () => { invalidate(); setShowForm(false); },
    onError: (e) => setFormError(e instanceof Error ? e.message : "প্রশ্ন আপডেট হয়নি।"),
  });
  const deleteMut = useMutation({
    mutationFn: async (id: number) => await api.adminDeleteQuestion({ adminUserId: user!.id, id }),
    onSuccess: () => { invalidate(); setConfirmDelete(null); },
    onError: (e) => setFormError(e instanceof Error ? e.message : "প্রশ্ন ডিলিট হয়নি।"),
  });

  const openNew = () => {
    setEditing(null); setFormError("");
    setFCategory(categories.data?.categories[0]?.name ?? "");
    setFTopic(""); setFStage("current"); setFDifficulty("Medium"); setFQuestion("");
    setFOptions(["", "", "", ""]); setFCorrect(0); setFExplanation("");
    setShowForm(true);
  };
  const openEdit = (q: AdminQuestion) => {
    setEditing(q); setFormError("");
    setFCategory(q.category); setFTopic(q.topic);
    setFStage(q.stage === "past" || q.stage === "upcoming" ? q.stage : "current");
    setFDifficulty(q.difficulty === "Easy" || q.difficulty === "Hard" ? q.difficulty : "Medium");
    setFQuestion(q.question); setFOptions([...q.options]);
    setFCorrect(q.correctIndex); setFExplanation(q.explanation);
    setShowForm(true);
  };
  const save = () => {
    setFormError("");
    if (!fCategory.trim()) { setFormError("ক্যাটাগরি বেছে নাও।"); return; }
    if (fQuestion.trim().length < 5) { setFormError("প্রশ্নটা ঠিকমতো লেখো (অন্তত ৫ অক্ষর)।"); return; }
    if (fOptions.some((o) => !o.trim())) { setFormError("চারটি অপশনই পূরণ করো।"); return; }
    if (editing) updateMut.mutate(); else addMut.mutate();
  };

  const all = list.data?.questions ?? [];
  const shown = filter === "All" ? all : all.filter((q) => q.category === filter);
  const inputCls = "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:ring-2 focus:ring-[#0b5ed7]/40";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter questions by category"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--text)]">
          <option value="All">সব ক্যাটাগরি ({all.length}টি প্রশ্ন)</option>
          {(categories.data?.categories ?? []).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
        <button onClick={openNew} className="font-display rounded-xl bg-gradient-to-r from-[#0b5ed7] to-emerald-500 px-4 py-2 text-sm font-extrabold text-white shadow transition active:scale-[.98]">➕ নতুন প্রশ্ন যোগ করো</button>
      </div>

      {showForm && (
        <div className="anim-pop mt-4 rounded-3xl bg-[var(--surface)] p-5 shadow-lg ring-2 ring-[#0b5ed7]/30">
          <h4 className="font-display text-lg font-extrabold text-[var(--text)]">{editing ? "✏️ প্রশ্ন এডিট করো" : "➕ নতুন প্রশ্ন"}</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="qf-cat" className="text-[13px] font-semibold text-[var(--dim)]">ক্যাটাগরি</label>
              <select id="qf-cat" value={fCategory} onChange={(e) => setFCategory(e.target.value)} className={inputCls}>
                {(categories.data?.categories ?? []).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="qf-topic" className="text-[13px] font-semibold text-[var(--dim)]">টপিক</label>
              <input id="qf-topic" value={fTopic} onChange={(e) => setFTopic(e.target.value)} maxLength={120} placeholder="e.g. Sorting" className={inputCls} />
            </div>
            <div>
              <label htmlFor="qf-diff" className="text-[13px] font-semibold text-[var(--dim)]">ডিফিকাল্টি</label>
              <select id="qf-diff" value={fDifficulty} onChange={(e) => setFDifficulty(e.target.value as "Easy" | "Medium" | "Hard")} className={inputCls}>
                <option value="Easy">🟢 Easy</option>
                <option value="Medium">🟡 Medium</option>
                <option value="Hard">🔴 Hard</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label htmlFor="qf-q" className="text-[13px] font-semibold text-[var(--dim)]">প্রশ্ন</label>
            <textarea id="qf-q" value={fQuestion} onChange={(e) => setFQuestion(e.target.value)} maxLength={600} rows={2} className={inputCls} />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {fOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" name="qf-correct" checked={fCorrect === i} onChange={() => setFCorrect(i)}
                  aria-label={`Mark option ${String.fromCharCode(65 + i)} as correct`} className="h-5 w-5 shrink-0 accent-emerald-500" />
                <input value={opt} onChange={(e) => setFOptions((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
                  maxLength={300} placeholder={`অপশন ${String.fromCharCode(65 + i)}${fCorrect === i ? " (সঠিক)" : ""}`} aria-label={`Option ${String.fromCharCode(65 + i)}`} className={inputCls} />
              </div>
            ))}
          </div>
          <p className="mt-1 text-[12px] text-[var(--dim)]">সবুজ রেডিও বোতাম দিয়ে সঠিক উত্তরটা মার্ক করো।</p>
          <div className="mt-3">
            <label htmlFor="qf-exp" className="text-[13px] font-semibold text-[var(--dim)]">ব্যাখ্যা</label>
            <textarea id="qf-exp" value={fExplanation} onChange={(e) => setFExplanation(e.target.value)} maxLength={1200} rows={2} className={inputCls} />
          </div>
          {formError && <p role="alert" className="anim-shake mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-600">{formError}</p>}
          <div className="mt-4 flex gap-2">
            <button onClick={save} disabled={addMut.isPending || updateMut.isPending}
              className="font-display flex-1 rounded-xl bg-[#0b5ed7] py-2.5 font-extrabold text-white shadow transition active:scale-[.98] disabled:opacity-60">
              {(addMut.isPending || updateMut.isPending) ? "সেভ হচ্ছে…" : "💾 সেভ করো"}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-xl bg-[var(--surface2)] px-5 py-2.5 font-bold text-[var(--text)] ring-1 ring-[var(--border)]">বাতিল</button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        {shown.map((q) => (
          <article key={q.id} className="rounded-2xl bg-[var(--surface)] p-4 shadow-sm ring-1 ring-[var(--border)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--dim)]">{q.category} • {q.topic} • {q.difficulty === "Hard" ? "🔴 Hard" : q.difficulty === "Easy" ? "🟢 Easy" : "🟡 Medium"}</p>
                <h4 className="font-display mt-0.5 font-bold leading-snug text-[var(--text)]">{q.question}</h4>
                <p className="mt-1 text-[13px] text-emerald-600">✔ সঠিক: {q.options[q.correctIndex] ?? "—"}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button onClick={() => openEdit(q)} aria-label={`Edit question: ${q.question}`} className="rounded-lg bg-blue-100 px-3 py-1.5 text-[13px] font-bold text-blue-700 transition hover:bg-blue-200">✏️ Edit</button>
                {confirmDelete === q.id ? (
                  <button onClick={() => deleteMut.mutate(q.id)} disabled={deleteMut.isPending} aria-label={`Confirm delete question: ${q.question}`} className="rounded-lg bg-rose-500 px-3 py-1.5 text-[13px] font-bold text-white">নিশ্চিত?</button>
                ) : (
                  <button onClick={() => setConfirmDelete(q.id)} aria-label={`Delete question: ${q.question}`} className="rounded-lg bg-rose-100 px-3 py-1.5 text-[13px] font-bold text-rose-600 transition hover:bg-rose-200">🗑️</button>
                )}
              </div>
            </div>
          </article>
        ))}
        {list.isPending && <p className="text-sm text-[var(--dim)]">প্রশ্ন লোড হচ্ছে…</p>}
        {!list.isPending && shown.length === 0 && <p className="text-sm text-[var(--dim)]">এই ক্যাটাগরিতে কোনো প্রশ্ন নেই।</p>}
      </div>
    </div>
  );
};

/* ================= Admin: categories & contact settings ================= */
const AdminSettings = () => {
  const user = useSelector((s: RootState) => s.auth.user);
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api.getCategories({}) });
  const contact = useQuery({ queryKey: ["contact-info"], queryFn: () => api.getContactInfo({}) });
  const [cats, setCats] = useState<{ name: string; tagline: string; emoji: string; stageLabel: string }[] | null>(null);
  const [ct, setCt] = useState({ address: "", phone1: "", phone2: "", email: "", website: "" });
  const [ctLoaded, setCtLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (categories.data && cats === null) {
      setCats(categories.data.categories.map((c) => ({ name: c.name, tagline: c.tagline, emoji: c.emoji, stageLabel: c.stageLabel })));
    }
  }, [categories.data, cats]);
  useEffect(() => {
    if (contact.data && !ctLoaded) { setCt(contact.data.contact); setCtLoaded(true); }
  }, [contact.data, ctLoaded]);

  const saveCatsMut = useMutation({
    mutationFn: async () => await api.adminUpdateCategories({ adminUserId: user!.id, categories: cats ?? [] }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["categories"] }); setMsg("ক্যাটাগরি সেভ হয়েছে ✔"); setErr(""); },
    onError: (e) => setErr(e instanceof Error ? e.message : "ক্যাটাগরি সেভ হয়নি।"),
  });
  const saveContactMut = useMutation({
    mutationFn: async () => await api.adminUpdateContact({ adminUserId: user!.id, contact: ct }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["contact-info"] }); setMsg("যোগাযোগের তথ্য সেভ হয়েছে ✔"); setErr(""); },
    onError: (e) => setErr(e instanceof Error ? e.message : "যোগাযোগের তথ্য সেভ হয়নি।"),
  });

  const inputCls = "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:ring-2 focus:ring-[#0b5ed7]/40";

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-[var(--surface)] p-5 shadow-sm ring-1 ring-[var(--border)]">
        <h4 className="font-display text-lg font-extrabold text-[var(--text)]">🗂️ ক্যাটাগরি এডিট</h4>
        <p className="text-[13px] text-[var(--dim)]">নাম, ট্যাগলাইন, ইমোজি আর লেবেল বদলাতে পারো, নতুন ক্যাটাগরি যোগ বা বাদ দিতে পারো।</p>
        <div className="mt-3 space-y-2.5">
          {(cats ?? []).map((c, i) => (
            <div key={i} className="grid grid-cols-[3.2rem_1fr] gap-2 rounded-2xl bg-[var(--surface2)] p-3 sm:grid-cols-[3.2rem_1fr_1fr_7rem_auto]">
              <input value={c.emoji} aria-label={`Category ${i + 1} emoji`} maxLength={8}
                onChange={(e) => setCats((prev) => (prev ?? []).map((p, j) => (j === i ? { ...p, emoji: e.target.value } : p)))} className={`${inputCls} text-center`} />
              <input value={c.name} aria-label={`Category ${i + 1} name`} maxLength={60}
                onChange={(e) => setCats((prev) => (prev ?? []).map((p, j) => (j === i ? { ...p, name: e.target.value } : p)))} className={inputCls} />
              <input value={c.tagline} aria-label={`Category ${i + 1} tagline`} maxLength={140}
                onChange={(e) => setCats((prev) => (prev ?? []).map((p, j) => (j === i ? { ...p, tagline: e.target.value } : p)))} className={inputCls} />
              <input value={c.stageLabel} aria-label={`Category ${i + 1} label`} maxLength={30}
                onChange={(e) => setCats((prev) => (prev ?? []).map((p, j) => (j === i ? { ...p, stageLabel: e.target.value } : p)))} className={inputCls} />
              <button onClick={() => setCats((prev) => (prev ?? []).filter((_, j) => j !== i))} aria-label={`Remove category ${c.name}`}
                className="rounded-xl bg-rose-100 px-3 py-2 text-sm font-bold text-rose-600">🗑️</button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setCats((prev) => [...(prev ?? []), { name: "", tagline: "", emoji: "📘", stageLabel: "Current core" }])}
            className="rounded-xl bg-[var(--surface2)] px-4 py-2 text-sm font-bold text-[var(--text)] ring-1 ring-[var(--border)]">➕ ক্যাটাগরি যোগ করো</button>
          <button onClick={() => saveCatsMut.mutate()} disabled={saveCatsMut.isPending || !cats || cats.length === 0}
            className="font-display rounded-xl bg-[#0b5ed7] px-5 py-2 text-sm font-extrabold text-white shadow transition active:scale-[.98] disabled:opacity-60">
            {saveCatsMut.isPending ? "সেভ হচ্ছে…" : "💾 ক্যাটাগরি সেভ করো"}
          </button>
        </div>
      </section>

      <section className="rounded-3xl bg-[var(--surface)] p-5 shadow-sm ring-1 ring-[var(--border)]">
        <h4 className="font-display text-lg font-extrabold text-[var(--text)]">📞 ক্যাম্পাস যোগাযোগের তথ্য এডিট</h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="ct-address" className="text-[13px] font-semibold text-[var(--dim)]">ঠিকানা</label>
            <input id="ct-address" value={ct.address} maxLength={200} onChange={(e) => setCt({ ...ct, address: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label htmlFor="ct-phone1" className="text-[13px] font-semibold text-[var(--dim)]">ফোন ১ (WhatsApp)</label>
            <input id="ct-phone1" value={ct.phone1} maxLength={30} onChange={(e) => setCt({ ...ct, phone1: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label htmlFor="ct-phone2" className="text-[13px] font-semibold text-[var(--dim)]">ফোন ২ (WhatsApp)</label>
            <input id="ct-phone2" value={ct.phone2} maxLength={30} onChange={(e) => setCt({ ...ct, phone2: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label htmlFor="ct-email" className="text-[13px] font-semibold text-[var(--dim)]">ইমেইল</label>
            <input id="ct-email" value={ct.email} maxLength={120} onChange={(e) => setCt({ ...ct, email: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label htmlFor="ct-web" className="text-[13px] font-semibold text-[var(--dim)]">ওয়েবসাইট</label>
            <input id="ct-web" value={ct.website} maxLength={120} onChange={(e) => setCt({ ...ct, website: e.target.value })} className={inputCls} />
          </div>
        </div>
        <button onClick={() => saveContactMut.mutate()} disabled={saveContactMut.isPending}
          className="font-display mt-4 rounded-xl bg-[#0b5ed7] px-5 py-2.5 text-sm font-extrabold text-white shadow transition active:scale-[.98] disabled:opacity-60">
          {saveContactMut.isPending ? "সেভ হচ্ছে…" : "💾 যোগাযোগের তথ্য সেভ করো"}
        </button>
      </section>

      {msg && <p className="anim-pop rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{msg}</p>}
      {err && <p role="alert" className="anim-shake rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600">{err}</p>}
    </div>
  );
};

/* ================= Admin Dashboard ================= */
const AdminDashboard = ({ go }: { go: (v: View) => void }) => {
  const user = useSelector((s: RootState) => s.auth.user);
  const dispatch = useDispatch<AppDispatch>();
  const [tab, setTab] = useState<"students" | "questions" | "settings">("students");
  const [openStudent, setOpenStudent] = useState<number | null>(null);

  const overview = useQuery({
    queryKey: ["admin-overview", user?.id],
    queryFn: () => api.getAdminOverview({ adminUserId: user!.id }),
    enabled: !!user?.isAdmin,
  });
  const detail = useQuery({
    queryKey: ["admin-student", user?.id, openStudent],
    queryFn: () => api.getAdminStudentDetail({ adminUserId: user!.id, studentUserId: openStudent! }),
    enabled: !!user?.isAdmin && openStudent !== null,
  });

  if (!user?.isAdmin) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-5xl">🛡️</p>
        <h2 className="font-display mt-3 text-2xl font-extrabold text-[var(--text)]">শুধুমাত্র অ্যাডমিনের জন্য</h2>
        <p className="mt-1 text-sm text-[var(--dim)]">এই ড্যাশবোর্ড শুধু অ্যাডমিনের নিজের অ্যাকাউন্ট দিয়ে খোলা যায়।</p>
        <button onClick={() => go("home")} className="font-display mt-5 rounded-2xl bg-[#0b5ed7] px-6 py-3 font-bold text-white">হোমে যাও</button>
      </div>
    );
  }

  const totals = overview.data?.totals;
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-4">
      <header className="flex items-center justify-between gap-3">
        <div className="rounded-2xl bg-[var(--surface)] px-3 py-2 shadow-sm ring-1 ring-[var(--border)] text-[var(--text)]"><InstituteBrand small /></div>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => go("home")} className="rounded-full bg-[var(--surface)] px-4 py-2 text-sm font-bold text-[var(--dim)] shadow-sm ring-1 ring-[var(--border)] transition hover:text-[#0b5ed7]">🏠 হোম</button>
          <button onClick={() => dispatch(logout())} aria-label="Logout" className="rounded-full bg-[var(--surface)] px-4 py-2 text-sm font-bold text-[var(--dim)] shadow-sm ring-1 ring-[var(--border)] transition hover:text-rose-500">Logout ⎋</button>
        </div>
      </header>

      <section className="anim-pop relative mt-5 overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-900 via-[#0d1b33] to-[#0b3d2e] p-5 text-white shadow-xl sm:p-6">
        <div aria-hidden className="anim-aurora pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-emerald-500/25 blur-3xl" />
        <p className="text-[11px] font-bold uppercase tracking-[.2em] text-amber-300">🛡️ Admin Dashboard</p>
        <h2 className="font-display mt-1 text-3xl font-extrabold">স্বাগতম, {user.name}</h2>
        <p className="mt-1 text-sm text-slate-300">সব শিক্ষার্থী, তাদের স্কোর, র‍্যাংকিং আর ভুল উত্তর — সব এক জায়গায়। শুধু তুমিই এটা দেখতে পাও।</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5 text-center sm:grid-cols-4">
          {[
            { v: totals?.users ?? "…", l: "মোট শিক্ষার্থী" },
            { v: totals?.attempts ?? "…", l: "মোট অ্যাটেম্পট" },
            { v: totals?.attendees ?? "…", l: "কুইজে অংশ নিয়েছে" },
            { v: totals?.totalCorrect ?? "…", l: "মোট সঠিক উত্তর" },
          ].map((s) => (
            <div key={s.l} className="rounded-2xl bg-white/12 px-2 py-3 backdrop-blur">
              <p className="font-display text-2xl font-extrabold">{s.v}</p>
              <p className="text-[11px] text-slate-300">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-5 grid grid-cols-3 gap-1 rounded-2xl bg-[var(--surface2)] p-1" role="tablist" aria-label="Admin sections">
        {([
          { key: "students", label: "👥 শিক্ষার্থী" },
          { key: "questions", label: "❓ প্রশ্ন এডিট" },
          { key: "settings", label: "⚙️ সেটিংস" },
        ] as const).map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`font-display rounded-xl py-2.5 text-sm font-extrabold transition-all ${tab === t.key ? "bg-slate-900 text-white shadow-lg" : "text-[var(--dim)]"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "students" && (
        <div className="mt-4 space-y-2.5">
          {(overview.data?.students ?? []).map((s) => (
            <article key={s.id} className="anim-pop rounded-3xl bg-[var(--surface)] p-4 shadow-sm ring-1 ring-[var(--border)]">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0b5ed7] to-emerald-500 text-lg shadow">
                  {s.rank && s.rank <= 3 ? medals[s.rank - 1] : <span className="font-display text-sm font-extrabold text-white">{s.rank ? `#${s.rank}` : "—"}</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-[var(--text)]">
                    {s.name}
                    {s.isAdmin && <span className="ml-2 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-extrabold text-white">🛡️ ADMIN</span>}
                    {s.id === user.id && <span className="ml-1 text-xs font-bold text-[#0b5ed7]">(তুমি)</span>}
                  </p>
                  <p className="truncate text-[13px] text-[var(--dim)]">🪪 {s.studentId || "—"} • ✉️ {s.email}</p>
                  <p className="mt-0.5 text-xs text-[var(--dim)]">📅 রেজিস্ট্রেশন: {fmtDateTime(s.registeredAt)} • 🔑 শেষ লগইন: {fmtDateTime(s.lastLoginAt)}</p>
                  <p className="mt-1 text-[13px] font-semibold text-[var(--text)]">
                    📝 {s.attempts}টি অ্যাটেম্পট • ✔ {s.totalCorrect}/{s.totalQuestions} সঠিক • 🏆 সেরা {s.bestPercent}%
                    {s.rank ? ` • র‍্যাংক #${s.rank}` : ""}
                  </p>
                </div>
                <button onClick={() => setOpenStudent(openStudent === s.id ? null : s.id)} aria-expanded={openStudent === s.id}
                  className="shrink-0 rounded-xl bg-[var(--surface2)] px-3 py-2 text-[13px] font-bold text-[var(--text)] ring-1 ring-[var(--border)] transition hover:ring-[#0b5ed7]/50">
                  {openStudent === s.id ? "বন্ধ করো ▲" : "বিস্তারিত ▼"}
                </button>
              </div>

              {openStudent === s.id && (
                <div className="anim-explain mt-3 border-t border-[var(--border)] pt-3">
                  {detail.isPending && <p className="text-sm text-[var(--dim)]">লোড হচ্ছে…</p>}
                  {detail.data && detail.data.attempts.length === 0 && <p className="text-sm text-[var(--dim)]">এখনো কোনো কুইজ দেয়নি।</p>}
                  {(detail.data?.attempts ?? []).map((a) => (
                    <div key={a.id} className="mt-3 first:mt-0">
                      <p className="text-sm font-bold text-[var(--text)]">
                        {a.category} — <span className="text-emerald-500">{a.score}/{a.total}</span>
                        <span className="ml-2 text-xs font-semibold text-[var(--dim)]">{fmtDateTime(a.created_at)}</span>
                      </p>
                      {a.wrong.length === 0 ? (
                        <p className="mt-1 text-[13px] text-[var(--dim)]">{a.score === a.total ? "🎉 এই অ্যাটেম্পটে সব উত্তর সঠিক ছিল।" : "এই অ্যাটেম্পটের ভুল উত্তরের বিবরণ সেভ নেই (পুরনো অ্যাটেম্পট)।"}</p>
                      ) : (
                        <div className="mt-1.5 space-y-2">
                          {a.wrong.map((w, wi) => (
                            <div key={wi} className="rounded-xl bg-rose-50 px-3 py-2 ring-1 ring-rose-100 dark:bg-rose-950/40 dark:ring-rose-900">
                              <p className="text-[13px] font-semibold text-[var(--text)]">❌ {w.question}</p>
                              <p className="text-[13px] text-rose-600">শিক্ষার্থীর উত্তর: {w.timedOut ? "⏰ সময় শেষ — উত্তর দেয়নি" : w.selectedText}</p>
                              <p className="text-[13px] text-emerald-600">সঠিক উত্তর: {w.correctText}</p>
                              {w.explanation && <p className="text-[13px] text-[var(--dim)]">💡 {w.explanation}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {detail.data && detail.data.liveEvents.length > 0 && (
                    <div className="mt-4 border-t border-[var(--border)] pt-3">
                      <p className="text-sm font-bold text-[var(--text)]">🔴 লাইভ ইভেন্ট ইতিহাস ({detail.data.liveEvents.length}টি)</p>
                      <div className="mt-1.5 space-y-1.5">
                        {detail.data.liveEvents.map((e) => (
                          <p key={e.roomId} className="rounded-xl bg-[var(--surface2)] px-3 py-2 text-[13px] text-[var(--text)]">
                            <strong>{e.category}</strong> • রুম {e.code} • {fmtDateTime(e.date)} • 👥 {e.attendees} জন •
                            মার্কস <strong>{e.marks}/{e.totalQuestions}</strong> ({e.correct} ✔ / {e.wrong} ✗) • র‍্যাংক <strong>#{e.rank}</strong>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
          {overview.isPending && <p className="text-sm text-[var(--dim)]">লোড হচ্ছে…</p>}
          {overview.data && overview.data.students.length === 0 && (
            <div className="rounded-3xl bg-[var(--surface)] p-8 text-center ring-1 ring-[var(--border)]">
              <p className="text-4xl">👥</p>
              <p className="mt-2 font-bold text-[var(--text)]">এখনো কেউ রেজিস্ট্রেশন করেনি</p>
            </div>
          )}
        </div>
      )}

      {tab === "questions" && <div className="mt-4"><AdminQuestions /></div>}
      {tab === "settings" && <div className="mt-4"><AdminSettings /></div>}
    </div>
  );
};

/* ================= Root ================= */
const Shell = () => {
  const user = useSelector((s: RootState) => s.auth.user);
  const [view, setView] = useState<View>("home");

  useQuery({
    queryKey: ["seed"],
    queryFn: () => api.ensureSeed({}),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!user) setView("home");
    else if (user.isAdmin) setView("admin");
  }, [user]);

  if (!user) return <AuthScreen />;

  const hasBottomNav = view === "home" || view === "history" || view === "leaderboard";

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      {view === "home" && <HomeScreen go={setView} />}
      {view === "quiz" && <QuizScreen go={setView} />}
      {view === "result" && <ResultScreen go={setView} />}
      {view === "history" && <HistoryScreen go={setView} />}
      {view === "leaderboard" && <LeaderboardScreen go={setView} />}
      {view === "admin" && <AdminDashboard go={setView} />}
      {view === "live" && <LiveScreen go={setView} />}
      <div className={hasBottomNav ? "pb-16" : ""}>
        <FooterCredit />
      </div>
    </div>
  );
};

export function App() {
  return (
    <Provider store={store}>
      <Shell />
    </Provider>
  );
}
