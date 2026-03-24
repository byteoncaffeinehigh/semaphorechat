import Sidebar from "../components/Sidebar";
import styles from "./Home.module.css";

export default function Home() {
  return (
    <div className={styles.container}>
      <Sidebar />
      <div className={styles.chatContainer}>
        <h1>Here will be your chat</h1>
      </div>
    </div>
  );
}
