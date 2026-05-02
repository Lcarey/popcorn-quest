import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

type Step = "welcome" | "petName" | "pin" | "creating";

export function Setup() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>("welcome");
  const [petName, setPetName] = useState("Popcorn");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function createFamily() {
    setError(null);
    if (pin.length < 4) return setError("PIN needs at least 4 digits.");
    if (pin !== pin2) return setError("Those PINs don't match.");
    setStep("creating");
    try {
      await api.setup({ petName, pin, seedExamples: true });
      nav("/", { replace: true });
    } catch (e: any) {
      setError(e?.message || "Couldn't set up. Try again.");
      setStep("pin");
    }
  }

  return (
    <div className="space-y-4 pt-8">
      <div className="text-center">
        <img src="/icon-512.png" alt="Popcorn" className="w-32 h-32 mx-auto drop-shadow-md rounded-full" />
        <h1 className="text-3xl font-display font-bold">Popcorn Quest</h1>
        <p className="text-cocoa/70 mt-1">Track daily, weekly, and recurring goals. Level up your buddy.</p>
      </div>

      {step === "welcome" && (
        <div className="card space-y-3">
          <button className="btn-primary w-full" onClick={() => setStep("petName")}>
            Let's start! 🚀
          </button>
        </div>
      )}

      {step === "petName" && (
        <div className="card space-y-3">
          <h2 className="font-display font-bold text-xl">Name your buddy</h2>
          <p className="text-sm text-cocoa/70">
            Your virtual dog levels up as you finish daily, weekly, and recurring goals.
          </p>
          <input
            value={petName}
            onChange={(e) => setPetName(e.target.value)}
            maxLength={20}
            className="w-full px-4 py-3 rounded-2xl bg-white border-2 border-white shadow-inner font-display text-xl focus:outline-none focus:border-coral"
          />
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setStep("welcome")}>
              Back
            </button>
            <button
              className="btn-primary flex-1"
              disabled={!petName.trim()}
              onClick={() => setStep("pin")}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {step === "pin" && (
        <div className="card space-y-3">
          <h2 className="font-display font-bold text-xl">Set a parent PIN</h2>
          <p className="text-sm text-cocoa/70">
            Used to add or edit recurring items. Keep it secret from your kid!
          </p>
          <input
            type="password"
            inputMode="numeric"
            placeholder="4-6 digit PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full px-4 py-3 rounded-2xl bg-white border-2 border-white shadow-inner font-display text-2xl text-center tracking-widest focus:outline-none focus:border-coral"
          />
          <input
            type="password"
            inputMode="numeric"
            placeholder="Confirm PIN"
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full px-4 py-3 rounded-2xl bg-white border-2 border-white shadow-inner font-display text-2xl text-center tracking-widest focus:outline-none focus:border-coral"
          />
          {error && <div className="text-coral font-semibold text-sm">{error}</div>}
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setStep("petName")}>
              Back
            </button>
            <button
              className="btn-primary flex-1"
              disabled={pin.length < 4 || pin2.length < 4}
              onClick={createFamily}
            >
              Create
            </button>
          </div>
        </div>
      )}

      {step === "creating" && (
        <div className="card text-center py-8">
          <img src="/icon-512.png" alt="Popcorn" className="w-20 h-20 mx-auto mb-2 animate-bounce rounded-full" />
          <div className="font-display font-semibold">Setting up {petName}…</div>
        </div>
      )}
    </div>
  );
}
