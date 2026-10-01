import { Suspense } from "react";
import { TicketsView } from "../../../components/tickets-view";
import { Skeleton } from "../../../components/ui";

export default function MyWorkPage() {
  return <Suspense fallback={<Skeleton rows={5} />}><TicketsView mine /></Suspense>;
}
