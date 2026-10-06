import FootballLab from "./football-lab";
import { requestFootballState } from "@/lib/football-context";

export const dynamic = "force-dynamic";

export default function Home() {
  return <FootballLab initialFootballState={requestFootballState()} />;
}
