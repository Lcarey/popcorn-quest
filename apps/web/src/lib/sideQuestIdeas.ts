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
  { title: "Do 60 jumping jacks", emoji: "🤸" },
  { title: "Tell a joke that makes someone laugh", emoji: "😂" },
  { title: "Learn one new word and use it", emoji: "📖" },
  { title: "Help set the table", emoji: "🍽️" },
  { title: "Write in your journal one thing that made you happy today or yesterday.", emoji: "💧" },
  { title: "Do a chore that you rarely or don't typically do.", emoji: "🛏️" },
  { title: "Play outside for 15 minutes", emoji: "🌳" },
  { title: "Write down 3 things you're thankful for", emoji: "📝" },
  { title: "Give Popcorn a belly rub", emoji: "🐶" },
  { title: "Do 15 push-ups", emoji: "💪" },
  { title: "Hop on one foot for 30 seconds", emoji: "🦩" },
  { title: "Choose one of your parents, and do a plank together for 60 seconds.", emoji: "🧠" },
  { title: "Write in your journal one thing that made you sad or upset this week.", emoji: "🧹" },
  { title: "Say hi to Popcorn in a silly voice", emoji: "🗣️" },
];

export function questIdeaForToday(dateKey: string): QuestIdea {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return IDEAS[hash % IDEAS.length];
}
