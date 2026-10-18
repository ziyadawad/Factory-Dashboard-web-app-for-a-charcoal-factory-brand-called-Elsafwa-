"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("كلمة المرور غير صحيحة");
      }
    } catch {
      setError("حدث خطأ ما");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="bg-card p-8 rounded-2xl border border-cardBorder shadow-xl w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="الصفوة" className="w-24 h-24 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-white mb-2">الصفوة</h1>
          <p className="text-gray-400">لوحة متابعة المصنع</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-gray-300 mb-2">
              كلمة المرور
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-background border border-cardBorder rounded-xl text-white focus:outline-none focus:border-brandOrange"
              placeholder="أدخل كلمة المرور"
              required
            />
          </div>

          {error && (
            <p className="text-statusRed text-center text-sm">{error}</p>
          )}

          <button
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-brandYellow via-brandOrange to-brandDeepOrange text-white font-bold rounded-xl hover:opacity-90 transition-opacity"
          >
            دخول
          </button>
        </form>
      </div>
    </div>
  );
}
