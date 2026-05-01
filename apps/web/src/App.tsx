import { useEffect } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { useApp } from "./store";
import { Home } from "./pages/Home";
import { Setup } from "./pages/Setup";
import { Parent } from "./pages/Parent";

export default function App() {
  const { familyId, hydrate } = useApp();
  const nav = useNavigate();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // After hydrate, if no family yet, we send the user to /setup.
  useEffect(() => {
    if (familyId === null) {
      // hydrate may not have run yet; check directly
      const stored = localStorage.getItem("popcorn.familyId");
      if (!stored && location.pathname !== "/setup") nav("/setup", { replace: true });
    }
  }, [familyId, nav]);

  return (
    <div className="min-h-screen w-full max-w-md mx-auto px-4 pt-6 pb-24">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/parent" element={<Parent />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </div>
  );
}
