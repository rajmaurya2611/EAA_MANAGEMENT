import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebaseConfig";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate(); // Initialize the navigation hook

  const handleLogin = async (e: { preventDefault: () => void; }) => {
    e.preventDefault();
    setError(""); // Clear previous errors
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Navigate to the dashboard on successful login
      navigate("/home");
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex justify-center items-center h-screen bg-gray-100">
      <form 
        onSubmit={handleLogin} 
        className="bg-white p-8 rounded shadow-md w-full max-w-md"
      >
        <h2 className="text-2xl font-bold mb-6 text-center">Login<br></br>EAA Management System</h2>
        {error && <p className="text-red-500 mb-4">{error}</p>}
        <div className="mb-4">
          <label className="block mb-1">Enter Your Email</label>
          <input 
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full border rounded p-2"
            required
          />
        </div>
        <div className="mb-6">
          <label className="block mb-1">Enter Your Password</label>
          <input 
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Your Password"
            className="w-full border rounded p-2"
            required
          />
        </div>
        <button 
          type="submit" 
          className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 transition-colors"
        >
          Login
        </button>
      </form>
    </div>
  );
}

export default Login;
