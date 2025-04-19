import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";


export function GarysPicks({ plan }) {
  const [visiblePicks, setVisiblePicks] = useState([]);
  const [userId, setUserId] = useState(null);
  const [userChoices, setUserChoices] = useState({});
  const [flippedCards, setFlippedCards] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUserAndChoices = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: userData } = await supabase.auth.getUser();
        const id = userData?.user?.id;
        if (!id) {
          setError("You must be logged in to view picks.");
          setLoading(false);
          return;
        }
        setUserId(id);

        // Fetch user choices
        const { data: existingPicks, error: picksError } = await supabase
          .from("user_picks")
          .select("pick_id, decision")
          .eq("user_id", id);
        if (picksError) {
          setError("Failed to fetch your picks. Please try again later.");
        } else {
          const mapped = {};
          existingPicks.forEach((pick) => {
            mapped[pick.pick_id] = pick.decision;
          });
          setUserChoices(mapped);
        }

        // Fetch real picks from Supabase (replace with your actual picks table/logic)
        const { data: picks, error: picksFetchError } = await supabase
          .from("picks")
          .select("id, game, pick, logic")
          .order("id", { ascending: true });
        if (picksFetchError) {
          setError("Failed to fetch picks. Please try again later.");
          setVisiblePicks([]);
        } else if (!picks || picks.length === 0) {
          setError("No picks available today. Check back soon!");
          setVisiblePicks([]);
        } else {
          if (plan === "pro") {
            setVisiblePicks(picks);
          } else if (plan === "free") {
            setVisiblePicks(picks.slice(0, 1));
          } else {
            setVisiblePicks([]);
          }
        }
      } catch (e) {
        setError("An unexpected error occurred. Please refresh the page.");
        setVisiblePicks([]);
      } finally {
        setLoading(false);
      }
    };
    fetchUserAndChoices();
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

