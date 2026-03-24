import styles from "./Loading.module.css";

interface LoadingProps {
  full?: boolean;
  size?: number;
}

function Loading({ full = true, size }: LoadingProps) {
  const overlayClass = `${styles.overlay} ${full ? styles.overlayFull : styles.overlayPartial}`;
  const spinnerSize = size || 32;

  return (
    <div className={overlayClass}>
      {full ? (
        <img className={styles.logo} src="/icon.svg" height={120} alt="" />
      ) : (
        <div
          className={styles.spinner}
          style={{ width: spinnerSize, height: spinnerSize }}
        />
      )}
    </div>
  );
}

export default Loading;
