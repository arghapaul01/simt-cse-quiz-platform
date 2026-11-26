# GitHub-এ Push করার ধাপ — বাংলায়

## আগে যা লাগবে

1. Git install হয়েছে — `git --version` দিলে `git version 2.56.1` দেখায়
2. VS Code-এ Terminal খোলা
3. নাম সেট হয়েছে — `git config --global user.name` দিলে `Argha Paul` দেখায়
4. ইমেইল এখনো বাকি থাকলে এই একটা কমান্ড দাও (তোমার GitHub-এর ইমেইলটা দিও):
   `git config --global user.email "তোমার-GitHub-ইমেইল"`

## ধাপ ১ — কোডটা ল্যাপটপে নাও

1. এই ফোল্ডারের zip ফাইলটা ডাউনলোড করো
2. Desktop-এ `simt-cse-quiz-platform` নামে একটা ফোল্ডারে unzip করো
3. VS Code খুলে File > Open Folder > ওই ফোল্ডারটা খোলো

## ধাপ ২ — GitHub-এ repo বানাও

1. github.com-এ গিয়ে + > New repository
2. Repository name: `simt-cse-quiz-platform`
3. Public রাখো, README / .gitignore কিছু টিক দিও না (কোডে আগেই আছে)
4. Create repository চাপো — খালি repo-র পেজটা খোলা রাখো

## ধাপ ৩ — VS Code Terminal-এ push করো

VS Code-এ `Ctrl + `` চেপে Terminal খুলে, একটা একটা করে লেখো:

```
git init
git add .
git commit -m "SIMT CSE Quiz Platform - initial version"
git branch -M main
git remote add origin https://github.com/arghapaul01/simt-cse-quiz-platform.git
git push -u origin main
```

প্রথম push-এ GitHub-এ সাইন ইন চাইতে পারে — ব্রাউজারে গিয়ে Authorize করো, অথবা Personal Access Token দিয়ে লগইন করো। পাসওয়ার্ড চ্যাটে লিখো না।

## ধাপ ৪ — চেক করো

push শেষ হলে github.com/arghapaul01/simt-cse-quiz-platform খুলে দেখো — সব ফাইল, README, প্রশ্নের ব্যাংক সব দেখা যাবে।

## এরপর Vercel

GitHub-এ push হয়ে গেলে Vercel-এ গিয়ে GitHub দিয়ে লগইন করে এই repo-টা Import করে Deploy চাপলেই ফ্রি লিংক পাবে, যেমন `simt-cse-quiz-platform.vercel.app`। ডোমেইন কেনা লাগবে না।
