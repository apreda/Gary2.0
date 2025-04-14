import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const mockPicks = [
  { id: 1, game: "Pacers vs Knicks", pick: "Pacers +4.5", logic: "Gary likes the matchup and recent form." },
  { id: 2, game: "Yankees vs Red Sox", pick: "Yankees ML", logic: "East Coast vibes, bullpen advantage." },
  { id: 3, game: "Bengals vs Browns", pick: "Bengals -3.5", logic: "Joe Burrow at home? Come on." }
];

export function GarysPicks({ plan }) {
  const [visiblePicks, setVisiblePicks] = useState([]);
  const [userId, setUserId] = useState(null);
  const [userChoices, setUserChoices] = useState({});
  const [flippedCards, setFlippedCards] = useState({});

  useEffect(() => {
    const fetchUserAndChoices = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const id = userData?.user?.id;
      if (!id) return;

      setUserId(id);

      const { data: existingPicks, error } = await supabase
        .from("user_picks")
        .select("pick_id, decision")
        .eq("user_id", id);

      if (error) {
        console.error("Failed to fetch picks:", error.message);
      } else {
        const mapped = {};
        existingPicks.forEach((pick) => {
          mapped[pick.pick_id] = pick.decision;
        });
        setUserChoices(mapped);
      }
    };

    fetchUserAndChoices();

    if (plan === "pro") {
      setVisiblePicks(mockPicks);
    } else if (plan === "free") {
      setVisiblePicks(mockPicks.slice(0, 1));
    } else {
      setVisiblePicks([]);
    }
  }, [plan]);

  const handleChoice = async (pickId, decision) => {
    if (!userId || userChoices[pickId]) return;

    const { error } = await supabase.from("user_picks").insert([
      {
        user_id: userId,
        pick_id: pickId,
        decision
      }
    ]);

    if (error) {
      console.error("❌ Failed to insert pick:", error.message);
    } else {
      setUserChoices((prev) => ({ ...prev, [pickId]: decision }));
    }
  };

  const toggleFlip = (pickId) => {
    setFlippedCards((prev) => ({
      ...prev,
      [pickId]: !prev[pickId]
    }));
  };

  return (
    <div className="max-w-5xl mx-auto mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
      {visiblePicks.map((pick) => {
        const isFlipped = flippedCards[pick.id];

        return (
          <div
            key={pick.id}
            className="perspective"
            onClick={() => toggleFlip(pick.id)}
          >
            <div className={`card ${isFlipped ? "flipped" : ""}`}>
              {/* Front Side */}
              <div className="card-front">
                <h3 className="text-xl font-bold mb-2">{pick.game}</h3>
                <p className="text-gray-700 text-sm mb-4">
                  Gary Says: <span className="font-semibold">{pick.pick}</span>
                </p>
                {userChoices[pick.id] ? (
                  <p className="text-green-700 font-semibold">
                    You already chose to {userChoices[pick.id]} this pick
                  </p>
                ) : (
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleChoice(pick.id, "ride");
                      }}
                      className="bg-blue-600 text-white px-4 py-1 rounded"
                    >
                      Ride with Gary
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleChoice(pick.id, "fade");
                      }}
                      className="bg-gray-800 text-white px-4 py-1 rounded"
                    >
                      Fade 🪤
                    </button>
                  </div>
                )}
              </div>

              {/* Back Side */}
              <div className="card-back">
                <h3 className="text-lg font-bold mb-2">Gary’s Logic</h3>
                <p className="text-sm text-gray-200">{pick.logic}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

