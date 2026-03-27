import { useState } from "react";
import { useAuth } from "../utils/AuthContext";
import styles from "./Login.module.css";

function Login() {
  const { loginEmail, registerEmail } = useAuth();
  const [mode, setMode] = useState<"main" | "signin" | "signup">("main");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const getErrorMessage = (err: unknown): string => {
    const msg = (err as Error)?.message || "";
    if (msg.includes("401") || msg.toLowerCase().includes("invalid")) return "Invalid email or password";
    if (msg.includes("409") || msg.toLowerCase().includes("already")) return "This email is already registered";
    if (msg.toLowerCase().includes("min=6") || msg.toLowerCase().includes("weak")) return "Password is too short (minimum 6 characters)";
    return "Something went wrong, please try again";
  };

  const signInEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await loginEmail(email, password);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const signUpEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await registerEmail(email, password);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginContainer}>
        <h2>Welcome to</h2>
        <h1>
          <img className={styles.logo} src="/icon.svg" alt="" />
          Semaphore
        </h1>

        {mode === "main" && (
          <>
            <button className={styles.button} onClick={() => setMode("signin")}>Sign in with Email</button>
            <button className={styles.textButton} onClick={() => setMode("signup")}>No account? Sign up</button>
          </>
        )}

        {(mode === "signin" || mode === "signup") && (
          <form className={styles.form} onSubmit={mode === "signin" ? signInEmail : signUpEmail}>
            <input
              className={styles.input}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className={styles.input}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className={styles.errorText}>{error}</p>}
            <button className={styles.button} type="submit">
              {mode === "signin" ? "Sign In" : "Create Account"}
            </button>
            <button
              className={styles.textButton}
              type="button"
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}
            >
              {mode === "signin" ? "No account? Sign up" : "Already have an account? Sign in"}
            </button>
            <button
              className={styles.textButton}
              type="button"
              onClick={() => { setMode("main"); setError(""); }}
            >
              ← Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default Login;
