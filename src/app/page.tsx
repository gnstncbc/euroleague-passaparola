import Game from "@/components/Game";
import { listQuestions } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const questions = await listQuestions();
  return <Game questions={questions} />;
}
