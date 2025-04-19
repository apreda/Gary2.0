import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import PickCard from "./PickCard";


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
      let localUserId = null;
      try {
        // 1. Try to fetch the user
        let userData, id;
        try {
          const userRes = await supabase.auth.getUser();
          userData = userRes.data;
          id = userData?.user?.id;
          console.log('Supabase userData:', userData);
          console.log('Supabase user id:', id);
        } catch (userErr) {
          console.error('Error fetching user:', userErr);
        }
        if (!id) {
          setUserId(null);
          setUserChoices({});
          console.log('No user authenticated, proceeding in read-only mode.');
        } else {
          setUserId(id);
          // 2. Fetch user choices if logged in
          try {
            const { data: existingPicks, error: picksError } = await supabase
              .from("user_picks")
              .select("pick_id, decision")
              .eq("user_id", id);
            if (picksError) {
              console.error('Failed to fetch your picks:', picksError);
              setError("Failed to fetch your picks. Please try again later.");
              setUserChoices({});
            } else if (existingPicks) {
              const mapped = {};
              existingPicks.forEach((pick) => {
                mapped[pick.pick_id] = pick.decision;
              });
              setUserChoices(mapped);
            }
          } catch (choicesErr) {
            console.error('Error fetching user choices:', choicesErr);
            setUserChoices({});
          }
        }

        // 3. Fetch picks regardless of user state
        try {
          // Fetch the most recent daily_picks row
          const { data: dailyRows, error: picksFetchError } = await supabase
            .from("daily_picks")
            .select("id, picks, date, created_at")
            .order("date", { ascending: false })
            .limit(1);
          console.log('Fetched daily_picks row:', dailyRows);
          if (picksFetchError) {
            console.error('Failed to fetch picks:', picksFetchError);
            setError("Failed to fetch picks. Please try again later.");
            setVisiblePicks([]);
          } else if (!dailyRows || dailyRows.length === 0) {
            setError("No picks available today. Check back soon!");
            setVisiblePicks([]);
          } else {
            // Parse the picks array from the first row
            let picksArr = [];
            try {
              // picks may be already parsed as JSON or as a string
              const picksRaw = dailyRows[0].picks;
              picksArr = Array.isArray(picksRaw) ? picksRaw : JSON.parse(picksRaw);
            } catch (jsonErr) {
              console.error("Failed to parse picks JSON:", jsonErr);
              setError("Error parsing picks data. Please contact support.");
              setVisiblePicks([]);
              return;
            }
            if (!Array.isArray(picksArr) || picksArr.length === 0) {
              setError("No picks available today. Check back soon!");
              setVisiblePicks([]);
            } else {
              console.log(`Loaded ${picksArr.length} picks from daily_picks.`);
              if (plan === "pro") {
                setVisiblePicks(picksArr);
              } else if (plan === "free") {
                setVisiblePicks(picksArr.slice(0, 1));
              } else {
                setVisiblePicks([]);
              }
            }
          }
        } catch (picksErr) {
          console.error('Error fetching picks:', picksErr);
          setError("An error occurred fetching picks.");
          setVisiblePicks([]);
        }
      } catch (e) {
        console.error('Unexpected error in fetchUserAndChoices:', e);
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
        if (!pick || !pick.id) return null;
        const isFlipped = flippedCards[pick.id] || false;
        const userDecision = userChoices[pick.id] || null;

        return (
          <PickCard
            key={pick.id}
            pick={pick}
            isFlipped={isFlipped}
            onFlip={() => toggleFlip(pick.id)}
            userDecision={userDecision}
            onTrackBet={() => {}}
          />
        );
      })}
    </div>
  );
}


