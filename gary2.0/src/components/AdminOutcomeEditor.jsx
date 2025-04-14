import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export function AdminOutcomeEditor() {
  const [allPicks, setAllPicks] = useState([]);
  const [selectedPickId, setSelectedPickId] = useState("");
  const [selectedOutcome, setSelectedOutcome] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchPicks = async () => {
      const { data, error } = await supabase
        .from("user_picks")
        .select("id, pick_id, decision, user_id, outcome")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch picks:", error.message);
      } else {
        setAllPicks(data);
      }
    };

    fetchPicks();
  }, []);

  const handleUpdate = async () => {
    if (!selectedPickId || !selectedOutcome) return;

    const { error } = await supabase
      .from("user_picks")
      .update({ outcome: selectedOutcome })
      .eq("id", selectedPickId);

    if (error) {
      setMessage("❌ Failed to update outcome: " + error.message);
    } else {
      setMessage("✅ Outcome updated successfully!");
      setSelectedPickId("");
      setSelectedOutcome("");
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow max-w-xl mx-auto mt-10">
      <h2 className="text-xl font-bold mb-4 text-center">📋 Admin: Edit Pick Outcome</h2>

      <div className="space-y-3">
        <select
          className="w-full p-2 border rounded"
          value={selectedPickId}
          onChange={(e) => setSelectedPickId(e.target.value)}
        >
          <option value="">Select a Pick</option>
          {allPicks.map((pick) => (
            <option key={pick.id} value={pick.id}>
              {`User: ${pick.user_id.slice(0, 8)} | Pick ${pick.pick_id} (${pick.decision}) → Outcome: ${pick.outcome || "none"}`}
            </option>
          ))}
        </select>

        <select
          className="w-full p-2 border rounded"
          value={selectedOutcome}
          onChange={(e) => setSelectedOutcome(e.target.value)}
        >
          <option value="">Select Outcome</option>
          <option value="win">Win</option>
          <option value="loss">Loss</option>
          <option value="push">Push</option>
        </select>

        <button
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
          onClick={handleUpdate}
          disabled={!selectedPickId || !selectedOutcome}
        >
          Update Outcome
        </button>

        {message && (
          <p className={`text-center ${message.includes("❌") ? "text-red-600" : "text-green-600"}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
} 