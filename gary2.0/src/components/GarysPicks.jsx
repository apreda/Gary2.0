import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import UniformPickCard from "./UniformPickCard";


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

  // Error or loading state
  if (loading) {
    return <div className="text-center text-white mt-10">Loading Gary's Picks...</div>;
  }
  if (error) {
    return <div className="text-center text-red-500 mt-10">{error}</div>;
  }
  if (!visiblePicks || visiblePicks.length === 0) {
    return <div className="text-center text-gray-400 mt-10">No picks available today. Check back soon!</div>;
  }

  return (
    <div className="max-w-5xl mx-auto mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
      {visiblePicks.map((pick) => {
        // Robust validation: skip blank/invalid picks
        if (!pick || !pick.id || !pick.game || !pick.pick || !pick.logic) return null;
        const isFlipped = flippedCards[pick.id] || false;
        const userDecision = userChoices[pick.id] || null;

        return (
          <UniformPickCard
            key={pick.id}
            title={pick.game}
            badge={userDecision ? (userDecision === 'ride' ? 'RIDE' : 'FADE') : 'GOLDEN PICK'}
            imageUrl={"/logos/default.svg"}
            content={
              <>
                <p className="text-gray-300 text-base mb-4">
                  Gary Says: <span className="font-semibold text-[#d4af37]">{pick.pick}</span>
                </p>
                {userDecision ? (
                  <p className="text-green-400 font-semibold">
                    You already chose to {userDecision} this pick
                  </p>
                ) : (
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleChoice(pick.id, "ride");
                      }}
                      className="bg-[#d4af37] text-black px-4 py-1 rounded font-bold hover:bg-[#c9a535]"
                    >
                      Ride with Gary
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleChoice(pick.id, "fade");
                      }}
                      className="bg-gray-800 text-white px-4 py-1 rounded font-bold hover:bg-gray-700"
                    >
                      Fade 🪤
                    </button>
                  </div>
                )}
              </>
            }
            backContent={
              <div className="p-6">
                <h3 className="text-lg font-bold mb-2 text-[#d4af37]">Gary’s Logic</h3>
                <p className="text-sm text-gray-200">{pick.logic}</p>
              </div>
            }
            isFlipped={isFlipped}
            onFlip={() => toggleFlip(pick.id)}
            isLocked={false}
          />
        );
      })}
    </div>
  );
}


