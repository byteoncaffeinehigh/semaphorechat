import styled from "styled-components";
import { useState, useEffect } from "react";
import { useAuth } from "../utils/AuthContext";

function Login() {
  const { loginEmail, registerEmail, loginGoogle } = useAuth();
  const [mode, setMode] = useState("main"); // "main" | "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Load Google Identity Services script once
  useEffect(() => {
    if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
    return () => document.head.removeChild(script);
  }, []);

  const signInGoogle = () => {
    if (!window.google || !import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      setError("Google Sign-In is not configured");
      return;
    }
    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: async ({ credential }) => {
        try {
          await loginGoogle(credential);
        } catch {
          setError("Google sign-in failed");
        }
      },
    });
    window.google.accounts.id.prompt();
  };

  const getErrorMessage = (err) => {
    const msg = err?.message || "";
    if (msg.includes("401") || msg.toLowerCase().includes("invalid")) return "Invalid email or password";
    if (msg.includes("409") || msg.toLowerCase().includes("already")) return "This email is already registered";
    if (msg.toLowerCase().includes("min=6") || msg.toLowerCase().includes("weak")) return "Password is too short (minimum 6 characters)";
    return "Something went wrong, please try again";
  };

  const signInEmail = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await loginEmail(email, password);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const signUpEmail = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await registerEmail(email, password);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Container>
      <LoginContainer>
        <h2>Welcome to</h2>
        <h1>
          <Logo src="/icon.svg" />
          Semaphore
        </h1>

        {mode === "main" && (
          <>
            {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
              <>
                <Button onClick={signInGoogle}>Sign in with Google</Button>
                <Divider>or</Divider>
              </>
            )}
            <Button onClick={() => setMode("signin")}>Sign in with Email</Button>
          </>
        )}

        {(mode === "signin" || mode === "signup") && (
          <Form onSubmit={mode === "signin" ? signInEmail : signUpEmail}>
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <ErrorText>{error}</ErrorText>}
            <Button type="submit">
              {mode === "signin" ? "Sign In" : "Create Account"}
            </Button>
            <TextButton type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>
              {mode === "signin" ? "No account? Sign up" : "Already have an account? Sign in"}
            </TextButton>
            <TextButton type="button" onClick={() => { setMode("main"); setError(""); }}>
              ← Back
            </TextButton>
          </Form>
        )}
      </LoginContainer>
    </Container>
  );
}

export default Login;

const Container = styled.div`
  display: grid;
  place-items: center;
  height: 100vh;
  background-color: #070d07;
`;

const Logo = styled.img`
  height: 70px;
  filter: invert(1) sepia(1) saturate(5) hue-rotate(90deg);

  @media (max-width: 643px) {
    height: 40px;
  }
`;

const LoginContainer = styled.div`
  padding: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: 2px;
  color: #00ff41;

  @media (max-width: 643px) {
    padding: 20px;
  }

  > h1 {
    font-size: 4rem;
    margin: 0 0 40px 0;
    text-shadow: 0 0 6px #00ff41;

    @media (max-width: 643px) {
      font-size: 3em;
      margin: 0 0 20px 0;
    }

    @media (max-width: 322px) {
      font-size: 2em;
    }
  }

  > h2 {
    font-size: 2rem;
    margin: 0;
    color: #00aa2a;

    @media (max-width: 643px) {
      font-size: 2em;
    }

    @media (max-width: 322px) {
      font-size: 1.6em;
    }
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 300px;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 16px;
  background-color: #0a150a;
  border: 1px solid #1a3a1a;
  color: #00ff41;
  font-size: 16px;
  font-family: 'Share Tech Mono', 'Courier New', Courier, monospace;
  outline: none;
  border-radius: 2px;
  box-sizing: border-box;

  ::placeholder {
    color: #1a5a1a;
  }

  :focus {
    border-color: #00ff41;
  }
`;

const Button = styled.button`
  background-color: transparent;
  border: 1px solid #00ff41;
  padding: 15px 40px;
  color: #00ff41;
  outline: 0;
  border-radius: 2px;
  font-size: 1.2em;
  font-family: 'Share Tech Mono', 'Courier New', Courier, monospace;
  cursor: pointer;
  letter-spacing: 2px;
  text-transform: uppercase;
  width: 100%;

  @media (max-width: 643px) {
    font-size: 1em;
    padding: 15px 30px;
  }
`;

const TextButton = styled.button`
  background: none;
  border: none;
  color: #1a7a1a;
  font-family: 'Share Tech Mono', 'Courier New', Courier, monospace;
  font-size: 0.9em;
  cursor: pointer;
  margin-top: 4px;

  :hover {
    color: #00ff41;
  }
`;

const Divider = styled.div`
  color: #1a5a1a;
  font-size: 0.9em;
  margin: 8px 0;
`;

const ErrorText = styled.p`
  color: #ff4141;
  font-size: 0.8em;
  margin: 0;
  text-align: center;
`;
