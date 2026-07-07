// Popcorn's daily side-quest idea — a silly, low-stakes suggestion so the
// side-quest section is never dead space. Deterministic per date so the idea
// doesn't change on every re-render or refresh.

export interface QuestIdea {
  title: string;
  emoji: string;
}

const IDEAS: QuestIdea[] = [
  { title: "Give someone a compliment", emoji: "💬" },
  { title: "Draw a picture of Popcorn", emoji: "🎨" },
  { title: "Do 10 jumping jacks", emoji: "🤸" },
  { title: "Tell a joke that makes someone laugh", emoji: "😂" },
  { title: "Learn one new word and use it", emoji: "📖" },
  { title: "Help set the table", emoji: "🍽️" },
  { title: "Drink a big glass of water", emoji: "💧" },
  { title: "Make your bed extra fancy", emoji: "🛏️" },
  { title: "Play outside for 15 minutes", emoji: "🌳" },
  { title: "Write down 3 things you're thankful for", emoji: "📝" },
  { title: "Give Popcorn a belly rub", emoji: "🐶" },
  { title: "Build something out of LEGO", emoji: "🧱" },
  { title: "Hop on one foot for 30 seconds", emoji: "🦩" },
  { title: "Teach someone something cool you know", emoji: "🧠" },
  { title: "Tidy up 5 things in your room", emoji: "🧹" },
  { title: "Say hi to Popcorn in a silly voice", emoji: "🗣️" },
];

export function questIdeaForToday(dateKey: string): QuestIdea {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return IDEAS[hash % IDEAS.length];
}
