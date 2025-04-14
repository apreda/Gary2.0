import { supabase } from "../supabaseClient";

export function UpgradeButton({ userId, onUpgrade }) {
  const handleUpgrade = async () => {
    const { error } = await supabase
      .from("users")
      .update({ plan: "pro" })
      .eq("id", userId);

    if (error) {
      console.error("Failed to upgrade:", error.message);
    } else {
      onUpgrade(); // Re-fetch plan
    }
  };

  return (
    <button
      className="mt-4 px-4 py-2 bg-yellow-500 text-white rounded shadow"
      onClick={handleUpgrade}
    >
      Upgrade to Pro 🛒
    </button>
  );
} 