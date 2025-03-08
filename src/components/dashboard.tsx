// src/components/Dashboard.jsx
import { useState } from "react";
import { getDatabase, ref, set } from "firebase/database";

function Dashboard() {
  const [inputKey, setInputKey] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: { preventDefault: () => void; }) => {
    e.preventDefault();
    setMessage("");
    try {
      const db = getDatabase();
      // Use the provided key to create a specific reference under "data"
      await set(ref(db, `data/${inputKey}`), inputValue);
      setMessage("Data saved successfully!");
      setInputKey("");
      setInputValue("");
    } catch (error) {
      console.error("Error saving data:", error);
      setMessage("Error saving data.");
    }
  };

  return (
    <div className="flex flex-col justify-center items-center min-h-screen bg-gray-100">
      <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded shadow-md w-full max-w-md"
      >
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            Enter Key:
          </label>
          <input
            type="text"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            placeholder="Enter key..."
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            required
          />
        </div>
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            Enter Value:
          </label>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Enter value..."
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            required
          />
        </div>
        <button
          type="submit"
          className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
        >
          Save Data
        </button>
      </form>
      {message && <p className="mt-4 text-lg">{message}</p>}
    </div>
  );
}

export default Dashboard;
