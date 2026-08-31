import { CardSkeleton } from "../components/Skeleton";
export default function Loading() {
  return <div style={{ display: "grid", gap: 12 }}><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>;
}
