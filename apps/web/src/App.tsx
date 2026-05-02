import { Route, Routes, useNavigate } from "react-router-dom";
import { Home } from "./pages/Home";
import { Setup } from "./pages/Setup";
import { Parent } from "./pages/Parent";

export default function App() {
  const nav = useNavigate();

  // If on /setup, show setup. Otherwise show home (which will redirect to setup if needed).
  const path = location.pathname;
  if (path === "/setup") {
    return (
      <div className="min-h-screen w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto px-4 pt-6 pb-24">
        <Setup />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto px-4 pt-6 pb-24">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/parent" element={<Parent />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </div>
  );
}
