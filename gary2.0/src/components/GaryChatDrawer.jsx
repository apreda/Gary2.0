import { useState, useEffect } from "react";
import axios from "axios";
import "./GaryChatDrawer.css";

export function GaryChatDrawer({ onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    console.log("GaryChatDrawer rendered");
  }, []);

  const askGary = async () => {
    if (!input) return;
    const userMessage = input;
    setMessages([...messages, { type: "user", text: userMessage }]);
    setInput("");
    setLoading(true);

    try {
      const response = await axios.post(
        "https://api.deepseek.com/v1/chat/completions",
        {
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content:
                "You are Gary, an old-school, streetwise sports bettor. You speak bluntly and wisely. You don't care about trends—just gut and grit. Be insightful and funny when responding to betting-related questions.",
            },
            ...messages.map((m) => ({
              role: m.type === "user" ? "user" : "assistant",
              content: m.text,
            })),
            { role: "user", content: userMessage },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_DEEPSEEK_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const garyReply = response.data.choices[0].message.content;
      setMessages((prev) => [...prev, { type: "gary", text: garyReply }]);
    } catch (err) {
      console.error("Gary failed:", err);
      setMessages((prev) => [
        ...prev,
        {
          type: "gary",
          text: "Something ain't right, kid. Try again in a sec.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gary-chat-overlay">
      <div className="gary-chat-container">
        <div className="gary-chat-header">
          <h2 className="gary-chat-title">Chat with Gary</h2>
          <button className="gary-chat-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="gary-chat-messages">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`gary-chat-message ${message.type}`}
            >
              <div className={`gary-chat-bubble ${message.type}`}>
                {message.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="gary-chat-message gary">
              <div className="gary-chat-bubble gary">
                Gary is thinking...
              </div>
            </div>
          )}
        </div>
        <div className="gary-chat-input-container">
          <div className="gary-chat-input-wrapper">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && askGary()}
              placeholder="Ask Gary anything..."
              className="gary-chat-input"
            />
            <button
              onClick={askGary}
              disabled={loading}
              className="gary-chat-send"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}