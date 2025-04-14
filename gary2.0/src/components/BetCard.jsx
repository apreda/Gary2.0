import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export function BetCard({ userId }) {
  const [picks, setPicks] = useState([]);

  useEffect(() => {
    const fetchPicks = async () => {
      const { data, error } = await supabase
        .from("user_picks")
        .select("*")
        .eq("user_id", userId);

      if (error) {
        console.error("Failed to fetch user picks:", error.message);
      } else {
        setPicks(data);
      }
    };

    if (userId) fetchPicks();
  }, [userId]);

  const total = picks.length;
  const rides = picks.filter((p) => p.decision === "ride");
  const fades = picks.filter((p) => p.decision === "fade");
  const wins = picks.filter((p) => p.outcome === "win");
  const losses = picks.filter((p) => p.outcome === "loss");

  const winRate = total > 0 ? ((wins.length / total) * 100).toFixed(1) : 0;

  return (
    <div className="bg-white shadow mt-8 p-6 rounded-xl max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4 text-center">📊 Your BetCard</h2>

      <div className="space-y-2 text-left text-sm text-gray-700">
        <p><strong>Total Picks:</strong> {total}</p>
        <p><strong>Rides:</strong> {rides.length}</p>
        <p><strong>Fades:</strong> {fades.length}</p>
        <p><strong>Wins:</strong> {wins.length}</p>
        <p><strong>Losses:</strong> {losses.length}</p>
        <p><strong>Win Rate:</strong> {winRate}%</p>
      </div>
    </div>
  );
}