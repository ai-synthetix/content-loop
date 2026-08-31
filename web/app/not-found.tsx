import Link from "next/link";
export default function NotFound() {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>404</div>
      <h1 style={{ margin: 0, fontSize: 20 }}>Page not found</h1>
      <p style={{ opacity: 0.6, fontSize: 13, marginTop: 8 }}>The page you’re looking for doesn’t exist or was moved.</p>
      <Link href="/" style={{ display: "inline-block", marginTop: 16, background: "linear-gradient(135deg,#3D8DFF,#6DCBF4)", color: "#fff", borderRadius: 10, padding: "9px 16px", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>Go to Queue</Link>
    </div>
  );
}
