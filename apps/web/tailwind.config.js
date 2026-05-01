/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fredoka"', '"Quicksand"', "system-ui", "sans-serif"],
        body: ['"Quicksand"', "system-ui", "sans-serif"],
      },
      colors: {
        cream: "#fff7ed",
        butter: "#fde68a",
        peach: "#fdba74",
        coral: "#fb7185",
        mint: "#86efac",
        sky: "#7dd3fc",
        lilac: "#c4b5fd",
        cocoa: "#7c2d12",
      },
      boxShadow: {
        chunky: "0 6px 0 0 rgba(124,45,18,0.18)",
        "chunky-sm": "0 3px 0 0 rgba(124,45,18,0.18)",
      },
      keyframes: {
        bounceIn: {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "60%": { transform: "scale(1.1)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        wag: {
          "0%, 100%": { transform: "rotate(-8deg)" },
          "50%": { transform: "rotate(8deg)" },
        },
        sparkle: {
          "0%": { transform: "scale(0) rotate(0deg)", opacity: "0" },
          "30%": { transform: "scale(1) rotate(120deg)", opacity: "1" },
          "100%": { transform: "scale(0) rotate(360deg)", opacity: "0" },
        },
      },
      animation: {
        bounceIn: "bounceIn 0.4s ease-out",
        wag: "wag 1s ease-in-out infinite",
        sparkle: "sparkle 0.8s ease-out forwards",
      },
    },
  },
  plugins: [],
};
